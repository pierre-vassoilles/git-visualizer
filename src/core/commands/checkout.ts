import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  applyTreeToRepo,
  branchExists,
  canSwitchWithoutDataLoss,
  currentBranch,
  getPrevBranch,
  headCommitHash,
  isInitialized,
  resolveCommitish,
  setPrevBranch,
} from '../repository';
import { shortHash } from '../sha1';
import { notARepo } from './init';

/**
 * git checkout <branchname>          — bascule vers une branche
 * git checkout -b <branchname>       — crée et bascule vers une nouvelle branche
 * git checkout <commit>              — détache HEAD sur un commit
 * git checkout -                     — revient à la branche précédente
 * git checkout --detach <commit>     — détache HEAD de manière explicite
 */
export function cmdCheckout(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // git checkout - (revenir à la branche précédente)
  if (args.length === 1 && args[0] === '-') {
    return checkoutPrevBranch(repo);
  }

  // git checkout --detach <commit>
  if (args.includes('--detach')) {
    const detachIdx = args.indexOf('--detach');
    const commitRef = args[detachIdx + 1];
    if (!commitRef) {
      return fail(['fatal: --detach requires a commit']);
    }
    return checkoutDetach(repo, commitRef);
  }

  // git checkout -b <branchname>
  if (args.includes('-b')) {
    const bIdx = args.indexOf('-b');
    const branchName = args[bIdx + 1];
    if (!branchName) {
      return fail(['fatal: -b requires a branch name']);
    }
    return checkoutCreateBranch(repo, branchName);
  }

  // git checkout <ref>
  const ref = args[0];
  if (!ref) {
    return fail(['fatal: argument required']);
  }

  // Déterminer si c'est une branche ou un commit
  if (branchExists(repo, ref)) {
    return checkoutBranch(repo, ref);
  }

  // Essayer comme commit (hash court ou long)
  const commitHash = resolveCommitish(repo, ref);
  if (commitHash) {
    return checkoutDetach(repo, ref);
  }

  return fail([`error: pathspec '${ref}' did not match any file(s) known to git`]);
}

/** Bascule vers une branche existante. */
function checkoutBranch(repo: Repository, branchName: string): CommandResult {
  const currentBranchName = currentBranch(repo);

  // Idempotent : déjà sur cette branche
  if (currentBranchName === branchName && repo.head.symbolic) {
    return ok(); // silencieux
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

  // Sauvegarder prevBranch : uniquement si HEAD était sur une branche symbolique
  if (repo.head.symbolic && currentBranchName !== null) {
    setPrevBranch(repo, currentBranchName);
  }
  // Si HEAD était détaché, on ne met pas à jour prevBranch (Option A : on conserve l'ancienne valeur)

  // Mettre à jour HEAD
  repo.head = { symbolic: true, target: `refs/heads/${branchName}` };

  // Restaurer index + working tree depuis l'arbre du commit cible
  applyTreeToRepo(repo, resolvedTarget);

  return ok([`Switched to branch '${branchName}'`]);
}

/** Crée une nouvelle branche et bascule dessus. */
function checkoutCreateBranch(repo: Repository, branchName: string): CommandResult {
  if (branchExists(repo, branchName)) {
    return fail([`fatal: A branch named '${branchName}' already exists.`]);
  }

  // Créer la branche depuis HEAD courant
  const headHash = headCommitHash(repo) ?? '';
  repo.refs.heads[branchName] = headHash;

  // Basculer vers la nouvelle branche
  const currentBranchName = currentBranch(repo);
  if (repo.head.symbolic && currentBranchName !== null) {
    setPrevBranch(repo, currentBranchName);
  }

  repo.head = { symbolic: true, target: `refs/heads/${branchName}` };

  // Pas besoin de restaurer index/WT : la nouvelle branche pointe sur le même commit
  return ok([`Switched to a new branch '${branchName}'`]);
}

/** Détache HEAD sur un commit. */
function checkoutDetach(repo: Repository, ref: string): CommandResult {
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

  // Sauvegarder prevBranch si HEAD était sur une branche symbolique
  if (repo.head.symbolic) {
    const currentBranchName = currentBranch(repo);
    if (currentBranchName !== null) {
      setPrevBranch(repo, currentBranchName);
    }
  }

  // Mettre à jour HEAD
  repo.head = { symbolic: false, target: commitHash };

  // Restaurer index + working tree
  applyTreeToRepo(repo, commitHash);

  const short = shortHash(commitHash);
  return ok([
    `Note: switching to '${short}'.`,
    '',
    "You are in 'detached HEAD' state. You can look around, make experimental",
    'changes and commit them, and you can discard any commits you make in this',
    'state without impacting any branches by switching back to a branch.',
    '',
    `HEAD is now at ${short}`,
  ]);
}

/** Revient à la branche précédente. */
function checkoutPrevBranch(repo: Repository): CommandResult {
  const prev = getPrevBranch(repo);
  if (!prev || !branchExists(repo, prev)) {
    return fail(['fatal: no previous branch to checkout']);
  }
  return checkoutBranch(repo, prev);
}
