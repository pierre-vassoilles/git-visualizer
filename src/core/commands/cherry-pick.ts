import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  addReflogEntryForHead,
  cloneIndex,
  cloneWorkingTree,
  currentBranch,
  headCommitHash,
  isAncestor,
  isInitialized,
  replayCommit,
  replayCommitContinue,
  resolveCommitish,
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

  // git cherry-pick --continue
  if (args.includes('--continue')) {
    return cherryPickContinue(repo);
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
    return fail([`error: commit ${shortHash(targetHash)} is already included in HEAD.`]);
  }

  // Sauvegarder l'état avant cherry-pick pour --abort
  const indexBeforePick = cloneIndex(repo.index);
  const workingTreeBeforePick = cloneWorkingTree(repo.workingTree);

  // Rejouer le commit via le helper centralisé
  const result = replayCommit(repo, {
    origCommit: targetCommit,
    origHash: targetHash,
    newParentHash: headHash,
    label: commitRef,
  });

  if (!result.newHash) {
    // Conflit : sauvegarder l'état
    repo.cherryPicking = {
      commitHash: targetHash,
      originalMessage: targetCommit.message,
      headHashBeforePick: headHash,
      indexBeforePick,
      workingTreeBeforePick,
    };

    const conflictMessages = Object.keys(result.conflicts)
      .sort()
      .map((path) => `CONFLICT (content): Conflict in ${path}`);

    return { output: conflictMessages, errors: [], exitCode: 1 };
  }

  // Pas de conflits : succès
  addReflogEntryForHead(repo, {
    oldHash: headHash,
    newHash: result.newHash,
    action: 'cherry-pick',
    description: targetCommit.message.split('\n')[0] ?? targetCommit.message,
  });

  const branch = currentBranch(repo);
  const branchLabel = branch ?? 'HEAD';
  const short = shortHash(result.newHash);
  return ok([`[${branchLabel} ${short}] ${targetCommit.message}`]);
}

/** Continue un cherry-pick après résolution de conflits. */
function cherryPickContinue(repo: Repository): CommandResult {
  if (!repo.cherryPicking) {
    return fail(['fatal: There is no cherry-pick in progress (CHERRY_PICK_HEAD missing).']);
  }

  const { originalMessage, headHashBeforePick } = repo.cherryPicking;

  const headHash = headCommitHash(repo);
  if (!headHash) {
    return fail(['fatal: no HEAD commit']);
  }

  const newCommitHash = replayCommitContinue(repo, {
    commitMessage: originalMessage,
    newParentHash: headHash,
  });

  delete repo.cherryPicking;

  addReflogEntryForHead(repo, {
    oldHash: headHashBeforePick,
    newHash: newCommitHash,
    action: 'cherry-pick',
    description: originalMessage.split('\n')[0] ?? originalMessage,
  });

  const branch = currentBranch(repo);
  const branchLabel = branch ?? 'HEAD';
  const short = shortHash(newCommitHash);
  return ok([`[${branchLabel} ${short}] ${originalMessage}`]);
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
