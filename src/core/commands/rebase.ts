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
  getCommitsToReplay,
  getTreeFiles,
  headCommitHash,
  isAncestor,
  isInitialized,
  makeConflictMarkers,
  mergeBase,
  resolveCommitish,
  storeBlob,
} from '../repository';
import { getCommit } from '../objectStore';
import { shortHash } from '../sha1';
import { notARepo } from './init';

/**
 * git rebase [--abort | --continue] <base>
 *
 * Rejoue les commits de la branche courante au-dessus de <base>.
 */
export function cmdRebase(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // git rebase --abort
  if (args.includes('--abort')) {
    return rebaseAbort(repo);
  }

  // git rebase --continue
  if (args.includes('--continue')) {
    return rebaseContinue(repo);
  }

  // Vérifier qu'on n'est pas déjà en rebase
  if (repo.rebasing) {
    return fail([
      'error: It seems that there is already a rebase in progress.',
      'Please, commit your changes and try again.',
    ]);
  }

  // Trouver l'argument base
  const filteredArgs = args.filter((a) => !a.startsWith('-'));
  const baseRef = filteredArgs[0];

  if (!baseRef) {
    return fail(['fatal: no base branch given']);
  }

  // Résoudre la base
  const baseHash = resolveCommitish(repo, baseRef);
  if (!baseHash) {
    return fail(
      [
        `fatal: ambiguous argument '${baseRef}': unknown revision or path not in working tree`,
      ],
      128,
    );
  }

  const headHash = headCommitHash(repo);
  if (!headHash) {
    return fail(['fatal: no commits yet; cannot rebase']);
  }

  // Cas : déjà à jour (HEAD est ancêtre de base ou égal)
  if (headHash === baseHash || isAncestor(repo, headHash, baseHash)) {
    const branch = currentBranch(repo);
    const branchLabel = branch ?? 'HEAD';
    return ok([`Current branch ${branchLabel} is already up to date.`]);
  }

  // Cas fast-forward : base est ancêtre de HEAD (historique linéaire, rien à rejouer)
  // Ici, le merge-base = baseHash lui-même (base est ancêtre de HEAD)
  // Pas de commits divergents → fast-forward implicite (HEAD ne change pas)
  if (isAncestor(repo, baseHash, headHash)) {
    // Tous les commits de HEAD incluent déjà base → déjà à jour dans ce sens
    // En pratique, git rebase sur une base ancêtre de HEAD ne fait rien
    const branch = currentBranch(repo);
    const branchLabel = branch ?? 'HEAD';
    return ok([`Current branch ${branchLabel} is already up to date.`]);
  }

  // Identifier les commits à rejouer
  const commitsToReplay = getCommitsToReplay(repo, headHash, baseHash);

  if (commitsToReplay.length === 0) {
    const branch = currentBranch(repo);
    const branchLabel = branch ?? 'HEAD';
    return ok([`Current branch ${branchLabel} is already up to date.`]);
  }

  // Refus explicite : rebaser une branche contenant un commit de merge
  // n'est pas supporté (le replay ne suit que le 1er parent et perdrait
  // silencieusement la 2e lignée). On le signale au lieu de perdre des commits.
  if (commitsToReplay.some((c) => c.commit.parents.length > 1)) {
    return fail([
      'error: cannot rebase: the branch to rebase contains a merge commit (not supported)',
    ]);
  }

  // Sauvegarder l'état avant rebase
  const branchBeforeRebase = currentBranch(repo);
  const indexBeforeRebase = cloneIndex(repo.index);
  const workingTreeBeforeRebase = cloneWorkingTree(repo.workingTree);

  // Vérifier si c'est un cas de fast-forward rebase :
  // si le merge-base est le même que HEAD (base est un descendant de HEAD)
  // → pas de commits à rejouer autre que ceux déjà linéaires
  const commonAncestor = mergeBase(repo, headHash, baseHash);
  if (commonAncestor === headHash) {
    // HEAD est ancêtre de base → fast-forward
    const branch = currentBranch(repo);
    if (branch !== null) {
      repo.refs.heads[branch] = baseHash;
    } else {
      repo.head = { symbolic: false, target: baseHash };
    }
    const baseCommit = getCommit(repo, baseHash);
    if (baseCommit) {
      const files = getTreeFiles(repo, baseCommit.tree);
      repo.index = buildIndexFromFiles(repo, files);
      repo.workingTree = buildWorkingTreeFromFiles(repo, files);
    }
    return ok(['Fast-forward']);
  }

  // Rejouer les commits un par un
  let currentNewParent = baseHash;
  const replayed: string[] = [];

  for (let i = 0; i < commitsToReplay.length; i++) {
    const { hash: origHash, commit: origCommit } = commitsToReplay[i]!;

    // Calculer le diff de ce commit
    const parentHash = origCommit.parents[0] ?? null;
    const parentTreeHash = parentHash
      ? (getCommit(repo, parentHash)?.tree ?? null)
      : null;

    const diff = computeTreeDiff(repo, parentTreeHash, origCommit.tree);

    // Obtenir les fichiers du nouveau parent
    const newParentCommit = getCommit(repo, currentNewParent);
    if (!newParentCommit) {
      return fail([`fatal: could not read parent commit ${shortHash(currentNewParent)}`]);
    }

    const newParentFiles = getTreeFiles(repo, newParentCommit.tree);
    const resultFiles: Record<string, string> = { ...newParentFiles };
    const conflictFiles: Record<string, string> = {};

    // Appliquer les suppressions
    for (const path of Object.keys(diff.deleted)) {
      delete resultFiles[path];
    }

    // Appliquer les ajouts
    for (const [path, content] of Object.entries(diff.added)) {
      if (path in resultFiles && resultFiles[path] !== content) {
        conflictFiles[path] = makeConflictMarkers(resultFiles[path]!, content, origHash.slice(0, 7));
        resultFiles[path] = conflictFiles[path]!;
      } else {
        resultFiles[path] = content;
      }
    }

    // Appliquer les modifications
    for (const [path, { from, to }] of Object.entries(diff.modified)) {
      const current = resultFiles[path];
      if (current === undefined) {
        resultFiles[path] = to;
      } else if (current === from) {
        resultFiles[path] = to;
      } else if (current === to) {
        // Déjà appliqué
      } else {
        conflictFiles[path] = makeConflictMarkers(current, to, origHash.slice(0, 7));
        resultFiles[path] = conflictFiles[path]!;
      }
    }

    if (Object.keys(conflictFiles).length > 0) {
      // Conflit → sauvegarder l'état de rebase
      repo.rebasing = {
        base: baseHash,
        toReplay: commitsToReplay.slice(i).map((c) => c.hash),
        replayed,
        headHashBeforeRebase: headHash,
        branchBeforeRebase,
        indexBeforeRebase,
        workingTreeBeforeRebase,
        currentCommitMessage: origCommit.message,
      };

      // Écrire les fichiers avec marqueurs dans WT et index
      for (const [path, content] of Object.entries(resultFiles)) {
        const blobHash = storeBlob(repo, content);
        repo.index[path] = { blobHash, content, mode: '100644' };
        repo.workingTree[path] = { content, mode: '100644' };
      }
      for (const path of Object.keys(repo.index)) {
        if (!(path in resultFiles)) delete repo.index[path];
      }
      for (const path of Object.keys(repo.workingTree)) {
        if (!(path in resultFiles)) delete repo.workingTree[path];
      }

      // Mettre à jour la branche vers le dernier commit rejoué (si aucun, garder headHash)
      const currentRef = replayed.length > 0 ? replayed[replayed.length - 1]! : headHash;
      const branch = currentBranch(repo);
      if (branch !== null) {
        repo.refs.heads[branch] = currentRef;
      } else {
        repo.head = { symbolic: false, target: currentRef };
      }

      const conflictMessages = Object.keys(conflictFiles)
        .sort()
        .map((path) => `CONFLICT (content): Conflict in ${path}`);

      return { output: conflictMessages, errors: [], exitCode: 1 };
    }

    // Pas de conflit → créer le nouveau commit rejoué
    repo.index = buildIndexFromFiles(repo, resultFiles);
    repo.workingTree = buildWorkingTreeFromFiles(repo, resultFiles);
    const treeHash = buildTreeFromIndex(repo, repo.index);

    const newCommitHash = createCommitWithParents(repo, {
      message: origCommit.message,
      treeHash,
      parents: [currentNewParent],
    });

    replayed.push(newCommitHash);
    currentNewParent = newCommitHash;
  }

  // Tous les commits rejoués sans conflit
  const branch = currentBranch(repo);
  const branchLabel = branch ?? 'HEAD';
  return ok([`Successfully rebased and updated ${branchLabel}.`]);
}

/** Annule un rebase en cours. */
function rebaseAbort(repo: Repository): CommandResult {
  if (!repo.rebasing) {
    return fail(['fatal: There is no rebase in progress.']);
  }

  const {
    headHashBeforeRebase,
    branchBeforeRebase,
    indexBeforeRebase,
    workingTreeBeforeRebase,
  } = repo.rebasing;

  // Restaurer la branche/HEAD
  if (branchBeforeRebase !== null) {
    repo.refs.heads[branchBeforeRebase] = headHashBeforeRebase;
    repo.head = { symbolic: true, target: `refs/heads/${branchBeforeRebase}` };
  } else {
    repo.head = { symbolic: false, target: headHashBeforeRebase };
  }

  repo.index = indexBeforeRebase;
  repo.workingTree = workingTreeBeforeRebase;
  delete repo.rebasing;

  return ok();
}

/** Continue un rebase après résolution de conflits. */
function rebaseContinue(repo: Repository): CommandResult {
  if (!repo.rebasing) {
    return fail(['fatal: There is no rebase in progress.']);
  }

  const rebasing = repo.rebasing;
  const { toReplay, replayed, currentCommitMessage } = rebasing;

  // Vérifier qu'il n'y a plus de conflits (tous les fichiers trackés)
  // En pratique, on fait confiance à l'utilisateur qui a fait git add

  // Créer le commit du step courant avec l'index actuel
  const parentHash = replayed.length > 0
    ? replayed[replayed.length - 1]!
    : rebasing.base;

  // Le HEAD actuel pointe vers le dernier commit rejoué ou la base
  const treeHash = buildTreeFromIndex(repo, repo.index);

  const newCommitHash = createCommitWithParents(repo, {
    message: currentCommitMessage,
    treeHash,
    parents: [parentHash],
  });

  const newReplayed = [...replayed, newCommitHash];
  let currentNewParent = newCommitHash;

  // Continuer avec les commits restants (skip le premier qui vient d'être résolu)
  const remainingToReplay = toReplay.slice(1);

  for (let i = 0; i < remainingToReplay.length; i++) {
    const origHash = remainingToReplay[i]!;
    const origCommit = getCommit(repo, origHash);
    if (!origCommit) continue;

    const parentOrigHash = origCommit.parents[0] ?? null;
    const parentOrigTreeHash = parentOrigHash
      ? (getCommit(repo, parentOrigHash)?.tree ?? null)
      : null;

    const diff = computeTreeDiff(repo, parentOrigTreeHash, origCommit.tree);

    const newParentCommit = getCommit(repo, currentNewParent);
    if (!newParentCommit) continue;

    const newParentFiles = getTreeFiles(repo, newParentCommit.tree);
    const resultFiles: Record<string, string> = { ...newParentFiles };
    const conflictFiles: Record<string, string> = {};

    for (const path of Object.keys(diff.deleted)) {
      delete resultFiles[path];
    }
    for (const [path, content] of Object.entries(diff.added)) {
      if (path in resultFiles && resultFiles[path] !== content) {
        conflictFiles[path] = makeConflictMarkers(resultFiles[path]!, content, origHash.slice(0, 7));
        resultFiles[path] = conflictFiles[path]!;
      } else {
        resultFiles[path] = content;
      }
    }
    for (const [path, { from, to }] of Object.entries(diff.modified)) {
      const current = resultFiles[path];
      if (current === undefined) {
        resultFiles[path] = to;
      } else if (current === from) {
        resultFiles[path] = to;
      } else if (current === to) {
        // ok
      } else {
        conflictFiles[path] = makeConflictMarkers(current, to, origHash.slice(0, 7));
        resultFiles[path] = conflictFiles[path]!;
      }
    }

    if (Object.keys(conflictFiles).length > 0) {
      repo.rebasing = {
        ...rebasing,
        toReplay: remainingToReplay.slice(i),
        replayed: newReplayed,
        currentCommitMessage: origCommit.message,
      };

      for (const [path, content] of Object.entries(resultFiles)) {
        const blobHash = storeBlob(repo, content);
        repo.index[path] = { blobHash, content, mode: '100644' };
        repo.workingTree[path] = { content, mode: '100644' };
      }
      for (const path of Object.keys(repo.index)) {
        if (!(path in resultFiles)) delete repo.index[path];
      }
      for (const path of Object.keys(repo.workingTree)) {
        if (!(path in resultFiles)) delete repo.workingTree[path];
      }

      const branch = currentBranch(repo);
      if (branch !== null) {
        repo.refs.heads[branch] = currentNewParent;
      } else {
        repo.head = { symbolic: false, target: currentNewParent };
      }

      const conflictMessages = Object.keys(conflictFiles)
        .sort()
        .map((path) => `CONFLICT (content): Conflict in ${path}`);

      return { output: conflictMessages, errors: [], exitCode: 1 };
    }

    repo.index = buildIndexFromFiles(repo, resultFiles);
    repo.workingTree = buildWorkingTreeFromFiles(repo, resultFiles);
    const treeHash2 = buildTreeFromIndex(repo, repo.index);

    const newCH = createCommitWithParents(repo, {
      message: origCommit.message,
      treeHash: treeHash2,
      parents: [currentNewParent],
    });

    newReplayed.push(newCH);
    currentNewParent = newCH;
  }

  delete repo.rebasing;

  const branch = currentBranch(repo);
  const branchLabel = branch ?? 'HEAD';
  return ok([`Successfully rebased and updated ${branchLabel}.`]);
}
