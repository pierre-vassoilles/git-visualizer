import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  addReflogEntry,
  applyTreeToRepo,
  branchExists,
  canSwitchWithoutDataLoss,
  currentBranch,
  getPrevBranch,
  headCommitHash,
  isInitialized,
  isValidBranchName,
  resolveCommitish,
  setPrevBranch,
} from '../repository';
import { shortHash } from '../sha1';
import { notARepo } from './init';
import { switchConflictResult } from './checkout';

/**
 * git switch <branchname>              — bascule vers une branche
 * git switch -c <name> [<start-point>] — crée et bascule vers une nouvelle branche
 * git switch [--detach] [<commit>]     — détache HEAD (défaut : HEAD courant)
 * git switch -                         — revient à la branche précédente
 */
export function cmdSwitch(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // git switch - (revenir à la branche précédente)
  if (args.length === 1 && args[0] === '-') {
    return switchPrevBranch(repo);
  }

  // git switch --detach [<commit>] (défaut : HEAD courant)
  if (args.includes('--detach')) {
    const detachIdx = args.indexOf('--detach');
    const commitRef = args[detachIdx + 1] ?? 'HEAD';
    return switchDetach(repo, commitRef);
  }

  // git switch -c <branchname> [<start-point>]
  if (args.includes('-c')) {
    const cIdx = args.indexOf('-c');
    const branchName = args[cIdx + 1];
    if (!branchName) {
      return fail(['fatal: -c requires a branch name']);
    }
    const startPoint = args[cIdx + 2];
    return switchCreateBranch(repo, branchName, startPoint);
  }

  // git switch <branchname>
  const branchName = args.filter((a) => !a.startsWith('-'))[0];
  if (!branchName) {
    return fail(['fatal: argument required']);
  }

  if (!branchExists(repo, branchName)) {
    return fail([`error: switch: invalid choice: '${branchName}' (did you mean something else?)`]);
  }

  return switchToBranch(repo, branchName);
}

/** Bascule vers une branche existante. */
function switchToBranch(repo: Repository, branchName: string): CommandResult {
  const currentBranchName = currentBranch(repo);

  // Idempotent
  if (currentBranchName === branchName && repo.head.symbolic) {
    return ok([`Already on '${branchName}'`]);
  }

  const targetHash = repo.refs.heads[branchName] ?? null;
  const resolvedTarget = targetHash || null;

  // Vérifier qu'on ne perdra pas de données (sémantique two-tree).
  const conflicts = canSwitchWithoutDataLoss(repo, resolvedTarget);
  if (conflicts) {
    return switchConflictResult(conflicts, 'switch');
  }

  // Sauvegarder prevBranch
  if (repo.head.symbolic && currentBranchName !== null) {
    setPrevBranch(repo, currentBranchName);
  }

  const oldHashSwitch = headCommitHash(repo) ?? '';

  // Mettre à jour HEAD
  repo.head = { symbolic: true, target: `refs/heads/${branchName}` };

  // Aligner index + working tree (two-tree depuis l'ancien HEAD).
  applyTreeToRepo(repo, resolvedTarget, oldHashSwitch || null);

  addReflogEntry(repo, 'HEAD', {
    oldHash: oldHashSwitch,
    newHash: resolvedTarget ?? '',
    action: 'checkout',
    description: `switched to branch '${branchName}'`,
  });

  return ok([`Switched to branch '${branchName}'`]);
}

/** Crée une nouvelle branche (éventuellement depuis `<start-point>`) et bascule dessus. */
function switchCreateBranch(
  repo: Repository,
  branchName: string,
  startPoint?: string,
): CommandResult {
  if (!isValidBranchName(branchName)) {
    return fail([`fatal: '${branchName}' is not a valid branch name.`]);
  }
  if (branchExists(repo, branchName)) {
    return fail([`fatal: A branch named '${branchName}' already exists.`]);
  }

  // Point de départ : <start-point> résolu, sinon HEAD courant.
  let startHash: string;
  if (startPoint !== undefined) {
    const resolved = resolveCommitish(repo, startPoint);
    if (!resolved) {
      return fail([`fatal: '${startPoint}' is not a valid object name.`], 128);
    }
    startHash = resolved;
  } else {
    startHash = headCommitHash(repo) ?? '';
  }

  const oldHash = headCommitHash(repo) ?? '';
  if (startHash !== oldHash) {
    const conflicts = canSwitchWithoutDataLoss(repo, startHash || null);
    if (conflicts) {
      return switchConflictResult(conflicts, 'switch');
    }
  }

  const currentBranchName = currentBranch(repo);
  if (repo.head.symbolic && currentBranchName !== null) {
    setPrevBranch(repo, currentBranchName);
  }

  repo.refs.heads[branchName] = startHash;
  repo.head = { symbolic: true, target: `refs/heads/${branchName}` };

  applyTreeToRepo(repo, startHash || null, oldHash || null);

  addReflogEntry(repo, 'HEAD', {
    oldHash,
    newHash: startHash,
    action: 'checkout',
    description: `created and switched to branch '${branchName}'`,
  });

  return ok([`Switched to a new branch '${branchName}'`]);
}

/** Détache HEAD sur un commit. */
function switchDetach(repo: Repository, ref: string): CommandResult {
  const commitHash = resolveCommitish(repo, ref);
  if (!commitHash) {
    return fail([`fatal: reference is not a tree: '${ref}'`]);
  }

  // Vérifier qu'on ne perdra pas de données (sémantique two-tree).
  const conflicts = canSwitchWithoutDataLoss(repo, commitHash);
  if (conflicts) {
    return switchConflictResult(conflicts, 'switch');
  }

  // Sauvegarder prevBranch si HEAD était symbolique
  if (repo.head.symbolic) {
    const currentBranchName = currentBranch(repo);
    if (currentBranchName !== null) {
      setPrevBranch(repo, currentBranchName);
    }
  }

  const oldHashDetach = headCommitHash(repo) ?? '';

  repo.head = { symbolic: false, target: commitHash };
  applyTreeToRepo(repo, commitHash, oldHashDetach || null);

  addReflogEntry(repo, 'HEAD', {
    oldHash: oldHashDetach,
    newHash: commitHash,
    action: 'checkout',
    description: `detached HEAD at ${shortHash(commitHash)}`,
  });

  const short = shortHash(commitHash);
  return ok([`Switched to detached HEAD state at ${short}`]);
}

/** Revient à la branche précédente. */
function switchPrevBranch(repo: Repository): CommandResult {
  const prev = getPrevBranch(repo);
  if (!prev || !branchExists(repo, prev)) {
    return fail(['error: no previous branch to switch to']);
  }
  return switchToBranch(repo, prev);
}
