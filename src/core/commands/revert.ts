import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  addReflogEntryForHead,
  buildIndexFromFiles,
  buildTreeFromIndex,
  buildWorkingTreeFromFiles,
  cloneIndex,
  cloneWorkingTree,
  computeTreeDiff,
  createCommitWithParents,
  currentBranch,
  getTreeFiles,
  headCommitHash,
  isInitialized,
  makeConflictMarkers,
  resolveCommitish,
  storeBlob,
} from '../repository';
import { getCommit } from '../objectStore';
import { shortHash } from '../sha1';
import { notARepo } from './init';
import { cmdCommit } from './commit';
import { refuseIfDirty, refuseIfOperationInProgress } from './guards';

/**
 * git revert [--abort] [-m <parent>] <commit>
 *
 * Crée un nouveau commit qui annule les changements du commit spécifié.
 */
export function cmdRevert(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // git revert --abort
  if (args.includes('--abort')) {
    return revertAbort(repo);
  }

  // git revert --continue : finalise le revert en cours (= git commit).
  if (args.includes('--continue')) {
    if (!repo.reverting) {
      return fail(['fatal: There is no revert in progress (REVERT_HEAD missing).'], 128);
    }
    return cmdCommit(repo, []);
  }

  // Vérifier qu'on n'est pas déjà en revert
  if (repo.reverting) {
    return fail([
      'error: There is a pending revert (REVERT_HEAD exists).',
      'Please commit the pending changes before you revert again.',
    ]);
  }

  // Refuser si une AUTRE opération de séquencement est en cours, ou si des
  // changements non commités seraient écrasés.
  const opGuard = refuseIfOperationInProgress(repo);
  if (opGuard) return opGuard;
  const dirtyGuard = refuseIfDirty(repo, 'revert');
  if (dirtyGuard) return dirtyGuard;

  // Parser -m <parent>
  let parentNumber: number | null = null;
  const mIdx = args.indexOf('-m');
  if (mIdx !== -1) {
    const parentStr = args[mIdx + 1];
    if (parentStr !== undefined) {
      parentNumber = parseInt(parentStr, 10);
    }
  }

  // Trouver le commitish (dernier arg non-flag)
  const filteredArgs = args.filter((a, i) => {
    if (a === '-m') return false;
    if (i > 0 && args[i - 1] === '-m') return false;
    if (a === '--abort') return false;
    return true;
  });
  const commitRef = filteredArgs[filteredArgs.length - 1];

  if (!commitRef) {
    return fail(['fatal: no commit specified']);
  }

  // Résoudre le commit
  const targetHash = resolveCommitish(repo, commitRef);
  if (!targetHash) {
    return fail(
      [`fatal: ambiguous argument '${commitRef}': unknown revision or path not in working tree`],
      128,
    );
  }

  const targetCommit = getCommit(repo, targetHash);
  if (!targetCommit) {
    return fail(
      [`fatal: ambiguous argument '${commitRef}': unknown revision or path not in working tree`],
      128,
    );
  }

  // Vérifier les merge commits
  if (targetCommit.parents.length >= 2 && parentNumber === null) {
    return fail([`error: commit ${shortHash(targetHash)} is a merge but no -m option was given.`]);
  }

  const headHash = headCommitHash(repo);
  if (!headHash) {
    return fail(['fatal: no commits yet; cannot revert']);
  }

  // Déterminer l'arbre parent à utiliser pour la comparaison
  let compareParentHash: string | null = null;
  if (targetCommit.parents.length === 0) {
    // Commit racine : comparaison contre un arbre vide
    compareParentHash = null;
  } else if (parentNumber !== null && targetCommit.parents.length >= 2) {
    // Merge commit avec -m : utiliser le parent spécifié (1-indexed)
    compareParentHash = targetCommit.parents[parentNumber - 1] ?? null;
    if (!compareParentHash) {
      return fail([`error: commit ${shortHash(targetHash)} does not have parent ${parentNumber}`]);
    }
  } else {
    compareParentHash = targetCommit.parents[0] ?? null;
  }

  // Calculer le diff : parentTree → commitTree
  // Pour revenir, on applique le diff INVERSÉ : commitTree → parentTree
  const diff = computeTreeDiff(
    repo,
    compareParentHash ? (getCommit(repo, compareParentHash)?.tree ?? null) : null,
    targetCommit.tree,
  );

  // Diff inversé : added→deleted, deleted→added, modified→{from: to, to: from}
  const invertedDiff = {
    added: diff.deleted,
    deleted: diff.added,
    modified: Object.fromEntries(
      Object.entries(diff.modified).map(([path, { from, to }]) => [path, { from: to, to: from }]),
    ),
  };

  // Appliquer le diff inversé à l'état courant du WT
  const headCommitObj = getCommit(repo, headHash);
  if (!headCommitObj) {
    return fail(['fatal: could not read HEAD commit']);
  }

  const currentFiles = getTreeFiles(repo, headCommitObj.tree);
  const resultFiles: Record<string, string> = { ...currentFiles };
  const conflictFiles: Record<string, string> = {};

  // Appliquer les suppressions (fichiers à supprimer dans le revert)
  for (const path of Object.keys(invertedDiff.deleted)) {
    delete resultFiles[path];
  }

  // Appliquer les ajouts (fichiers à ajouter dans le revert)
  for (const [path, content] of Object.entries(invertedDiff.added)) {
    resultFiles[path] = content;
  }

  // Appliquer les modifications
  for (const [path, { from, to }] of Object.entries(invertedDiff.modified)) {
    const current = resultFiles[path];
    if (current === undefined) {
      // Fichier absent → appliquer quand même
      resultFiles[path] = to;
    } else if (current === from) {
      // Pas de modification locale → appliquer le revert
      resultFiles[path] = to;
    } else if (current === to) {
      // Déjà dans le bon état
    } else {
      // Conflit : le fichier actuel diffère du "from" attendu
      conflictFiles[path] = makeConflictMarkers(current, to, `Revert "${targetCommit.message}"`);
      resultFiles[path] = conflictFiles[path]!;
    }
  }

  const hasConflicts = Object.keys(conflictFiles).length > 0;
  const defaultMessage = `Revert "${targetCommit.message}"\n\nThis reverts commit ${shortHash(targetHash)}.`;

  if (hasConflicts) {
    // Sauvegarder l'état avant revert pour --abort
    repo.reverting = {
      commitHash: targetHash,
      defaultMessage,
      headHashBeforeRevert: headHash,
      indexBeforeRevert: cloneIndex(repo.index),
      workingTreeBeforeRevert: cloneWorkingTree(repo.workingTree),
    };

    // Écrire les marqueurs dans le WT et l'index
    for (const [path, content] of Object.entries(resultFiles)) {
      const blobHash = storeBlob(repo, content);
      repo.index[path] = { blobHash, content, mode: '100644' };
      repo.workingTree[path] = { content, mode: '100644' };
    }
    for (const path of Object.keys(repo.index)) {
      if (!(path in resultFiles)) {
        delete repo.index[path];
      }
    }
    for (const path of Object.keys(repo.workingTree)) {
      if (!(path in resultFiles)) {
        delete repo.workingTree[path];
      }
    }

    const conflictMessages = Object.keys(conflictFiles)
      .sort()
      .map((path) => `CONFLICT (content): Conflict in ${path}`);

    return { output: conflictMessages, errors: [], exitCode: 1 };
  }

  // Pas de conflits : créer le commit de revert
  repo.index = buildIndexFromFiles(repo, resultFiles);
  repo.workingTree = buildWorkingTreeFromFiles(repo, resultFiles);

  const treeHash = buildTreeFromIndex(repo, repo.index);

  const revertCommitHash = createCommitWithParents(repo, {
    message: defaultMessage,
    treeHash,
    parents: [headHash],
  });

  addReflogEntryForHead(repo, {
    oldHash: headHash,
    newHash: revertCommitHash,
    action: 'revert',
    description: defaultMessage.split('\n')[0] ?? defaultMessage,
  });

  const branch = currentBranch(repo);
  const branchLabel = branch ?? 'HEAD';
  const short = shortHash(revertCommitHash);
  return ok([`[${branchLabel} ${short}] ${defaultMessage.split('\n')[0]}`]);
}

/** Annule un revert en cours. */
function revertAbort(repo: Repository): CommandResult {
  if (!repo.reverting) {
    return fail(['fatal: There is no revert in progress (REVERT_HEAD missing).']);
  }

  const { indexBeforeRevert, workingTreeBeforeRevert } = repo.reverting;
  repo.index = indexBeforeRevert;
  repo.workingTree = workingTreeBeforeRevert;
  delete repo.reverting;

  return ok();
}
