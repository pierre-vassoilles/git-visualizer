import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  addReflogEntryForHead,
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

/**
 * git switch <branchname>            — bascule vers une branche
 * git switch -c <branchname>         — crée et bascule vers une nouvelle branche
 * git switch --detach <commit>       — détache HEAD sur un commit
 * git switch -                       — revient à la branche précédente
 */
export function cmdSwitch(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // git switch - (revenir à la branche précédente)
  if (args.length === 1 && args[0] === '-') {
    return switchPrevBranch(repo);
  }

  // git switch --detach <commit>
  if (args.includes('--detach')) {
    const detachIdx = args.indexOf('--detach');
    const commitRef = args[detachIdx + 1];
    if (!commitRef) {
      return fail(['fatal: --detach requires a commit']);
    }
    return switchDetach(repo, commitRef);
  }

  // git switch -c <branchname>
  if (args.includes('-c')) {
    const cIdx = args.indexOf('-c');
    const branchName = args[cIdx + 1];
    if (!branchName) {
      return fail(['fatal: -c requires a branch name']);
    }
    return switchCreateBranch(repo, branchName);
  }

  // git switch <branchname>
  const branchName = args[0];
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
    return ok();
  }

  const targetHash = repo.refs.heads[branchName] ?? null;
  const resolvedTarget = targetHash || null;

  // Vérifier qu'on ne perdra pas de données
  const problematic = canSwitchWithoutDataLoss(repo, resolvedTarget);
  if (problematic) {
    const lines = [
      'error: Your local changes to the following files would be overwritten by checkout:',
      ...problematic.map((p) => `\t${p}`),
      'Please commit your changes or stash them before you switch branches.',
    ];
    return fail(lines);
  }

  // Sauvegarder prevBranch
  if (repo.head.symbolic && currentBranchName !== null) {
    setPrevBranch(repo, currentBranchName);
  }

  const oldHashSwitch = headCommitHash(repo) ?? '';

  // Mettre à jour HEAD
  repo.head = { symbolic: true, target: `refs/heads/${branchName}` };

  // Restaurer index + working tree
  applyTreeToRepo(repo, resolvedTarget);

  addReflogEntryForHead(repo, {
    oldHash: oldHashSwitch,
    newHash: resolvedTarget ?? '',
    action: 'checkout',
    description: `switched to branch '${branchName}'`,
  });

  return ok([`Switched to branch '${branchName}'`]);
}

/** Crée une nouvelle branche et bascule dessus. */
function switchCreateBranch(repo: Repository, branchName: string): CommandResult {
  if (!isValidBranchName(branchName)) {
    return fail([`fatal: '${branchName}' is not a valid branch name.`]);
  }
  if (branchExists(repo, branchName)) {
    return fail([`fatal: A branch named '${branchName}' already exists.`]);
  }

  // Créer la branche depuis HEAD courant
  const headHash = headCommitHash(repo) ?? '';
  repo.refs.heads[branchName] = headHash;

  const currentBranchName = currentBranch(repo);
  if (repo.head.symbolic && currentBranchName !== null) {
    setPrevBranch(repo, currentBranchName);
  }

  repo.head = { symbolic: true, target: `refs/heads/${branchName}` };

  return ok([`Switched to a new branch '${branchName}'`]);
}

/** Détache HEAD sur un commit. */
function switchDetach(repo: Repository, ref: string): CommandResult {
  const commitHash = resolveCommitish(repo, ref);
  if (!commitHash) {
    return fail([`fatal: reference is not a tree: '${ref}'`]);
  }

  // Vérifier qu'on ne perdra pas de données
  const problematic = canSwitchWithoutDataLoss(repo, commitHash);
  if (problematic) {
    const lines = [
      'error: Your local changes to the following files would be overwritten by checkout:',
      ...problematic.map((p) => `\t${p}`),
      'Please commit your changes or stash them before you switch branches.',
    ];
    return fail(lines);
  }

  // Sauvegarder prevBranch si HEAD était symbolique
  if (repo.head.symbolic) {
    const currentBranchName = currentBranch(repo);
    if (currentBranchName !== null) {
      setPrevBranch(repo, currentBranchName);
    }
  }

  repo.head = { symbolic: false, target: commitHash };
  applyTreeToRepo(repo, commitHash);

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
