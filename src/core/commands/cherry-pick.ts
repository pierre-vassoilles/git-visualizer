import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  addReflogEntryForHead,
  cloneIndex,
  cloneWorkingTree,
  currentBranch,
  hasConflictMarkers,
  headCommitHash,
  isInitialized,
  replayCommit,
  replayCommitContinue,
  resolveCommitish,
} from '../repository';
import { getCommit } from '../objectStore';
import { shortHash } from '../sha1';
import { notARepo } from './init';
import { refuseIfDirty, refuseIfOperationInProgress } from './guards';

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

  // Refuser si une AUTRE opération de séquencement est en cours.
  const opGuard = refuseIfOperationInProgress(repo);
  if (opGuard) return opGuard;

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

  // Refuser si des changements non commités seraient écrasés.
  const dirtyGuard = refuseIfDirty(repo, 'cherry-pick');
  if (dirtyGuard) return dirtyGuard;

  // Note : git N'INTERDIT PAS de cherry-pick un ancêtre de HEAD. Le cas usuel
  // « revert d'un commit puis cherry-pick de l'original pour le réappliquer »
  // doit fonctionner ; un résultat réellement vide est traité ci-dessous.

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

  if (result.empty) {
    // Résultat vide (changements déjà présents). Comme git, on refuse au lieu de
    // créer un commit vide ; l'état/WT sont restaurés (pas de --skip ici).
    repo.index = indexBeforePick;
    repo.workingTree = workingTreeBeforePick;
    return fail(
      [
        'The previous cherry-pick is now empty, possibly due to conflict resolution.',
        "If you wish to commit it anyway, use 'git commit --allow-empty'.",
      ],
      1,
    );
  }

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

  // Ne jamais finaliser tant que des marqueurs de conflit subsistent.
  if (Object.values(repo.workingTree).some((e) => hasConflictMarkers(e.content))) {
    return fail(
      [
        'error: Committing is not possible because you have unmerged files.',
        "hint: Fix them up in the work tree, and then use 'git add/rm <file>'",
        'fatal: Exiting because of an unresolved conflict.',
      ],
      1,
    );
  }

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
