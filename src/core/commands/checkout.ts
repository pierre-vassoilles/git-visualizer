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
  type SwitchConflicts,
} from '../repository';
import { shortHash } from '../sha1';
import { notARepo } from './init';
import { cmdRestore } from './restore';

/**
 * git checkout <branchname>              — bascule vers une branche
 * git checkout -b <name> [<start-point>] — crée et bascule vers une nouvelle branche
 * git checkout <commit>                  — détache HEAD sur un commit
 * git checkout -                         — revient à la branche précédente
 * git checkout [--detach] [<commit>]     — détache HEAD (défaut : HEAD courant)
 * git checkout [<ref>] -- <pathspec...>  — restaure des chemins (index+WT)
 * git checkout <ref> <pathspec...>       — idem sans `--` quand <ref> est résolu
 */
export function cmdCheckout(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // git checkout - (revenir à la branche précédente)
  if (args.length === 1 && args[0] === '-') {
    return checkoutPrevBranch(repo);
  }

  // git checkout [<ref>] -- <pathspec...> : restauration de chemins.
  const dashDashIdx = args.indexOf('--');
  if (dashDashIdx !== -1) {
    const before = args.slice(0, dashDashIdx).filter((a) => !a.startsWith('-'));
    const pathspecs = args.slice(dashDashIdx + 1);
    if (before.length > 0) {
      // `git checkout <ref> -- <path>` : restaure depuis <ref> dans index ET WT.
      return checkoutPathsFromRef(repo, before[0]!, pathspecs);
    }
    // `git checkout -- <path>` : alias de `git restore <path>` (WT ← index).
    return cmdRestore(repo, pathspecs);
  }

  // git checkout --detach [<commit>] (défaut : HEAD courant)
  if (args.includes('--detach')) {
    const detachIdx = args.indexOf('--detach');
    const commitRef = args[detachIdx + 1] ?? 'HEAD';
    return checkoutDetach(repo, commitRef);
  }

  // git checkout -b <branchname> [<start-point>]
  if (args.includes('-b')) {
    const bIdx = args.indexOf('-b');
    const branchName = args[bIdx + 1];
    if (!branchName) {
      return fail(['fatal: -b requires a branch name']);
    }
    const startPoint = args[bIdx + 2];
    return checkoutCreateBranch(repo, branchName, startPoint);
  }

  // git checkout <ref>
  const positional = args.filter((a) => !a.startsWith('-'));
  const ref = positional[0];
  if (!ref) {
    return fail(['fatal: argument required']);
  }

  // `git checkout <ref> <pathspec...>` (sans `--`) : si des chemins suivent un
  // ref résolu, restauration de chemins (pas une bascule de branche).
  const extraPaths = positional.slice(1);
  if (extraPaths.length > 0 && resolveCommitish(repo, ref) !== null) {
    return checkoutPathsFromRef(repo, ref, extraPaths);
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

/**
 * Construit le résultat d'échec d'une bascule bloquée par des changements locaux
 * (changements suivis et/ou fichiers non suivis qui seraient écrasés). Partagé
 * avec `git switch` (verbe « switch »).
 */
export function switchConflictResult(
  conflicts: SwitchConflicts,
  verb: 'checkout' | 'switch',
): CommandResult {
  const lines: string[] = [];
  if (conflicts.tracked.length > 0) {
    lines.push(`error: Your local changes to the following files would be overwritten by ${verb}:`);
    lines.push(...conflicts.tracked.map((p) => `\t${p}`));
    lines.push('Please commit your changes or stash them before you switch branches.');
  }
  if (conflicts.untracked.length > 0) {
    lines.push(
      `error: The following untracked working tree files would be overwritten by ${verb}:`,
    );
    lines.push(...conflicts.untracked.map((p) => `\t${p}`));
    lines.push('Please move or remove them before you switch branches.');
  }
  lines.push('Aborting');
  return fail(lines, 1);
}

/**
 * `git checkout <ref> -- <pathspec...>` / `git checkout <ref> <pathspec...>` :
 * restaure les chemins depuis l'arbre de `<ref>` dans l'index ET le working tree
 * (équivaut à `git restore --source=<ref> --staged --worktree`). Réutilise
 * `cmdRestore` (validation atomique des pathspecs incluse).
 */
function checkoutPathsFromRef(repo: Repository, ref: string, pathspecs: string[]): CommandResult {
  if (pathspecs.length === 0) {
    return fail(['fatal: pathspec cannot be empty']);
  }
  // Index ← <ref> (valide les pathspecs ; rien n'est écrit si l'un est introuvable).
  const idxResult = cmdRestore(repo, ['--staged', `--source=${ref}`, ...pathspecs]);
  if (idxResult.exitCode !== 0) return idxResult;
  // Working tree ← <ref>.
  return cmdRestore(repo, [`--source=${ref}`, ...pathspecs]);
}

/** Bascule vers une branche existante. */
function checkoutBranch(repo: Repository, branchName: string): CommandResult {
  const currentBranchName = currentBranch(repo);

  // Idempotent : déjà sur cette branche
  if (currentBranchName === branchName && repo.head.symbolic) {
    return ok([`Already on '${branchName}'`]);
  }

  const targetHash = repo.refs.heads[branchName] ?? null;
  const resolvedTarget = targetHash || null;

  // Vérifier qu'on ne perdra pas de données (sémantique two-tree).
  const conflicts = canSwitchWithoutDataLoss(repo, resolvedTarget);
  if (conflicts) {
    return switchConflictResult(conflicts, 'checkout');
  }

  // Sauvegarder prevBranch : uniquement si HEAD était sur une branche symbolique
  if (repo.head.symbolic && currentBranchName !== null) {
    setPrevBranch(repo, currentBranchName);
  }
  // Si HEAD était détaché, on ne met pas à jour prevBranch (Option A : on conserve l'ancienne valeur)

  const oldHash = headCommitHash(repo) ?? '';

  // Mettre à jour HEAD
  repo.head = { symbolic: true, target: `refs/heads/${branchName}` };

  // Aligner index + working tree (two-tree depuis l'ancien HEAD vers la cible).
  applyTreeToRepo(repo, resolvedTarget, oldHash || null);

  addReflogEntry(repo, 'HEAD', {
    oldHash,
    newHash: resolvedTarget ?? '',
    action: 'checkout',
    description: `switched to branch '${branchName}'`,
  });

  return ok([`Switched to branch '${branchName}'`]);
}

/** Crée une nouvelle branche (éventuellement depuis `<start-point>`) et bascule dessus. */
function checkoutCreateBranch(
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

  // Si l'arbre change (start-point ≠ HEAD), refuser une perte de données.
  const oldHash = headCommitHash(repo) ?? '';
  if (startHash !== oldHash) {
    const conflicts = canSwitchWithoutDataLoss(repo, startHash || null);
    if (conflicts) {
      return switchConflictResult(conflicts, 'checkout');
    }
  }

  const currentBranchName = currentBranch(repo);
  if (repo.head.symbolic && currentBranchName !== null) {
    setPrevBranch(repo, currentBranchName);
  }

  repo.refs.heads[branchName] = startHash;
  repo.head = { symbolic: true, target: `refs/heads/${branchName}` };

  // Aligner index/WT si le start-point déplace l'arbre (no-op si == HEAD).
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
function checkoutDetach(repo: Repository, ref: string): CommandResult {
  const commitHash = resolveCommitish(repo, ref);
  if (!commitHash) {
    return fail([`fatal: reference is not a tree: '${ref}'`]);
  }

  // Vérifier qu'on ne perdra pas de données (sémantique two-tree).
  const conflicts = canSwitchWithoutDataLoss(repo, commitHash);
  if (conflicts) {
    return switchConflictResult(conflicts, 'checkout');
  }

  // Sauvegarder prevBranch si HEAD était sur une branche symbolique
  if (repo.head.symbolic) {
    const currentBranchName = currentBranch(repo);
    if (currentBranchName !== null) {
      setPrevBranch(repo, currentBranchName);
    }
  }

  const oldHashDetach = headCommitHash(repo) ?? '';

  // Mettre à jour HEAD
  repo.head = { symbolic: false, target: commitHash };

  // Aligner index + working tree (two-tree depuis l'ancien HEAD).
  applyTreeToRepo(repo, commitHash, oldHashDetach || null);

  addReflogEntry(repo, 'HEAD', {
    oldHash: oldHashDetach,
    newHash: commitHash,
    action: 'checkout',
    description: `detached HEAD at ${shortHash(commitHash)}`,
  });

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
