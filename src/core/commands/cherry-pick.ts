import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
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
  isAncestor,
  isInitialized,
  makeConflictMarkers,
  resolveCommitish,
  storeBlob,
} from '../repository';
import { getCommit } from '../objectStore';
import { shortHash } from '../sha1';
import { notARepo } from './init';

/**
 * git cherry-pick [--abort] <commit>
 *
 * Applique les changements du commit spécifié sur le HEAD courant.
 */
export function cmdCherryPick(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // git cherry-pick --abort
  if (args.includes('--abort')) {
    return cherryPickAbort(repo);
  }

  // Vérifier qu'on n'est pas déjà en cherry-pick
  if (repo.cherryPicking) {
    return fail([
      'error: There is a pending cherry-pick (CHERRY_PICK_HEAD exists).',
      'Please commit the pending changes before you cherry-pick again.',
    ]);
  }

  // Trouver le commitish
  const filteredArgs = args.filter((a) => !a.startsWith('-'));
  const commitRef = filteredArgs[0];

  if (!commitRef) {
    return fail(['fatal: no commit specified']);
  }

  // Résoudre le commit
  const targetHash = resolveCommitish(repo, commitRef);
  if (!targetHash) {
    return fail(
      [
        `fatal: ambiguous argument '${commitRef}': unknown revision or path not in working tree`,
      ],
      128,
    );
  }

  const targetCommit = getCommit(repo, targetHash);
  if (!targetCommit) {
    return fail(
      [
        `fatal: ambiguous argument '${commitRef}': unknown revision or path not in working tree`,
      ],
      128,
    );
  }

  // Refuser les merge commits
  if (targetCommit.parents.length >= 2) {
    return fail([
      `error: commit ${shortHash(targetHash)} is a merge commit; use -m <parent> to specify which parent.`,
    ]);
  }

  const headHash = headCommitHash(repo);
  if (!headHash) {
    return fail(['fatal: no commits yet; cannot cherry-pick']);
  }

  // Refuser si le commit est déjà un ancêtre de HEAD (déjà appliqué)
  if (isAncestor(repo, targetHash, headHash)) {
    return fail([
      `error: commit ${shortHash(targetHash)} is already included in HEAD.`,
    ]);
  }

  const headCommitObj = getCommit(repo, headHash);
  if (!headCommitObj) {
    return fail(['fatal: could not read HEAD commit']);
  }

  // Calculer le diff : parent → commit (changements apportés par le commit)
  const parentHash = targetCommit.parents[0] ?? null;
  const parentTreeHash = parentHash
    ? (getCommit(repo, parentHash)?.tree ?? null)
    : null;

  const diff = computeTreeDiff(repo, parentTreeHash, targetCommit.tree);

  // Appliquer le diff sur les fichiers courants de HEAD
  const currentFiles = getTreeFiles(repo, headCommitObj.tree);
  const resultFiles: Record<string, string> = { ...currentFiles };
  const conflictFiles: Record<string, string> = {};

  // Appliquer les suppressions
  for (const path of Object.keys(diff.deleted)) {
    delete resultFiles[path];
  }

  // Appliquer les ajouts
  for (const [path, content] of Object.entries(diff.added)) {
    if (path in resultFiles) {
      // Fichier déjà présent → conflit si contenu différent
      if (resultFiles[path] !== content) {
        conflictFiles[path] = makeConflictMarkers(resultFiles[path]!, content, commitRef);
        resultFiles[path] = conflictFiles[path]!;
      }
    } else {
      resultFiles[path] = content;
    }
  }

  // Appliquer les modifications
  for (const [path, { from, to }] of Object.entries(diff.modified)) {
    const current = resultFiles[path];
    if (current === undefined) {
      // Fichier absent localement → appliquer
      resultFiles[path] = to;
    } else if (current === from) {
      // Pas de modification locale → appliquer le changement
      resultFiles[path] = to;
    } else if (current === to) {
      // Déjà dans le bon état
    } else {
      // Conflit
      conflictFiles[path] = makeConflictMarkers(current, to, commitRef);
      resultFiles[path] = conflictFiles[path]!;
    }
  }

  const hasConflicts = Object.keys(conflictFiles).length > 0;

  if (hasConflicts) {
    // Sauvegarder l'état avant cherry-pick pour --abort
    repo.cherryPicking = {
      commitHash: targetHash,
      originalMessage: targetCommit.message,
      headHashBeforePick: headHash,
      indexBeforePick: cloneIndex(repo.index),
      workingTreeBeforePick: cloneWorkingTree(repo.workingTree),
    };

    // Écrire les fichiers (avec marqueurs) dans WT et index
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

  // Pas de conflits : créer le nouveau commit
  repo.index = buildIndexFromFiles(repo, resultFiles);
  repo.workingTree = buildWorkingTreeFromFiles(repo, resultFiles);

  const treeHash = buildTreeFromIndex(repo, repo.index);

  const newCommitHash = createCommitWithParents(repo, {
    message: targetCommit.message,
    treeHash,
    parents: [headHash],
  });

  const branch = currentBranch(repo);
  const branchLabel = branch ?? 'HEAD';
  const short = shortHash(newCommitHash);
  return ok([`[${branchLabel} ${short}] ${targetCommit.message}`]);
}

/** Annule un cherry-pick en cours. */
function cherryPickAbort(repo: Repository): CommandResult {
  if (!repo.cherryPicking) {
    return fail(['fatal: There is no cherry-pick in progress (CHERRY_PICK_HEAD missing).']);
  }

  const { indexBeforePick, workingTreeBeforePick } = repo.cherryPicking;
  repo.index = indexBeforePick;
  repo.workingTree = workingTreeBeforePick;
  delete repo.cherryPicking;

  return ok();
}
