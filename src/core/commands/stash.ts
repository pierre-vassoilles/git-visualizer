import { fail, ok, type CommandResult } from '../types';
import type { Repository, StashEntry, WorkingTree } from '../model';
import {
  buildIndexFromFiles,
  buildWorkingTreeFromFiles,
  cloneIndex,
  currentBranch,
  getTreeFiles,
  hasUncommittedChanges,
  headCommitHash,
  isInitialized,
  makeConflictMarkers,
} from '../repository';
import { getCommit } from '../objectStore';
import { notARepo } from './init';

/** Table path → contenu de l'arbre d'un commit (vide si absent). */
function treeContentsOf(repo: Repository, commitHash: string | null): Record<string, string> {
  if (!commitHash) return {};
  const commit = getCommit(repo, commitHash);
  return commit ? getTreeFiles(repo, commit.tree) : {};
}

/**
 * git stash [push | list | pop | apply | drop] [options]
 *
 * Sauvegarde et restaure les modifications non committées.
 */
export function cmdStash(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  const sub = args[0];

  if (!sub || sub === 'push') {
    return stashPush(repo, args);
  }

  switch (sub) {
    case 'list':
      return stashList(repo);
    case 'pop':
      return stashPop(repo, args.slice(1));
    case 'apply':
      return stashApply(repo, args.slice(1));
    case 'drop':
      return stashDrop(repo, args.slice(1));
    default:
      return fail([`git: 'stash ${sub}' is not a valid git stash operation.`]);
  }
}

// ---------------------------------------------------------------------------
// git stash / git stash push [-m <message>]
// ---------------------------------------------------------------------------

function stashPush(repo: Repository, args: string[]): CommandResult {
  // Parser -m <message>
  let message = '';
  const mIdx = args.indexOf('-m');
  if (mIdx !== -1) {
    message = args[mIdx + 1] ?? '';
  }

  // TLS-05 : sur un HEAD non-né, git refuse (pas de commit initial).
  const headHash = headCommitHash(repo);
  if (!headHash) {
    return fail(['fatal: You do not have the initial commit yet'], 1);
  }
  const headFiles = treeContentsOf(repo, headHash);

  // TLS-01 : seuls les changements SUIVIS (indexés/non indexés) sont stashés ;
  // les fichiers non suivis ne comptent pas (et ne sont pas embarqués/supprimés).
  if (!hasUncommittedChanges(repo)) {
    return ok(['No local changes to save']);
  }

  // Snapshot des fichiers SUIVIS du working tree (présents dans l'index ou HEAD).
  const trackedWT: WorkingTree = {};
  for (const [path, entry] of Object.entries(repo.workingTree)) {
    if (path in repo.index || path in headFiles) {
      trackedWT[path] = { ...entry };
    }
  }

  // Capturer les fichiers non suivis pour les PRÉSERVER (TLS-01).
  const untracked: WorkingTree = {};
  for (const [path, entry] of Object.entries(repo.workingTree)) {
    if (!(path in repo.index) && !(path in headFiles)) {
      untracked[path] = { ...entry };
    }
  }

  // Créer l'entrée de stash (working tree suivi + index, relatifs à headHash).
  const branchName = currentBranch(repo);
  const entry: StashEntry = {
    branchName,
    message,
    date: repo.commitCount,
    workingTree: trackedWT,
    index: cloneIndex(repo.index),
    headHash,
  };

  if (!repo.stashStack) repo.stashStack = [];
  repo.stashStack.unshift(entry);

  // Nettoyer WT et index à HEAD, mais CONSERVER les fichiers non suivis.
  repo.index = buildIndexFromFiles(repo, headFiles);
  repo.workingTree = buildWorkingTreeFromFiles(repo, headFiles);
  for (const [path, e] of Object.entries(untracked)) {
    repo.workingTree[path] = e;
  }

  const branchLabel = branchName ?? 'HEAD';
  const suffix = message ? `: ${message}` : '';
  return ok([`Saved working directory and index state on ${branchLabel}${suffix}`]);
}

// ---------------------------------------------------------------------------
// git stash list
// ---------------------------------------------------------------------------

function stashList(repo: Repository): CommandResult {
  const stack = repo.stashStack ?? [];
  if (stack.length === 0) {
    return ok([]);
  }

  const lines = stack.map((entry, index) => {
    const branchLabel = entry.branchName ?? 'HEAD';
    if (entry.message) {
      return `stash@{${index}}: On ${branchLabel}: ${entry.message}`;
    }
    return `stash@{${index}}: WIP on ${branchLabel}: ${entry.message}`;
  });

  return ok(lines);
}

// ---------------------------------------------------------------------------
// git stash pop [stash@{n}]
// ---------------------------------------------------------------------------

function stashPop(repo: Repository, args: string[]): CommandResult {
  return applyStash(repo, args, true);
}

// ---------------------------------------------------------------------------
// git stash apply [stash@{n}]
// ---------------------------------------------------------------------------

function stashApply(repo: Repository, args: string[]): CommandResult {
  return applyStash(repo, args, false);
}

// ---------------------------------------------------------------------------
// git stash drop [stash@{n}]
// ---------------------------------------------------------------------------

function stashDrop(repo: Repository, args: string[]): CommandResult {
  const stack = repo.stashStack ?? [];

  if (stack.length === 0) {
    return fail(['fatal: No stash entries found.'], 128);
  }

  const idx = parseStashIndex(args[0], stack.length);
  if (idx === null) {
    const ref = args[0] ?? 'stash@{0}';
    return fail([`fatal: ${ref}: no such stash`], 128);
  }

  const removed = stack[idx]!;
  stack.splice(idx, 1);
  repo.stashStack = stack;

  const msgSuffix = removed.message ? `: ${removed.message}` : '';
  return ok([`Dropped refs/stash@{${idx}} (${removed.headHash.slice(0, 7)}${msgSuffix})`]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse un index de stash depuis un argument (ex: "stash@{1}" → 1).
 * Retourne null si invalide ou hors limites.
 */
function parseStashIndex(arg: string | undefined, stackLength: number): number | null {
  if (!arg) return stackLength > 0 ? 0 : null;

  const match = /^stash@\{(\d+)\}$/.exec(arg);
  if (!match) return null;

  const n = parseInt(match[1]!, 10);
  if (n < 0 || n >= stackLength) return null;
  return n;
}

/**
 * Applique un stash (pop = true → supprime après application).
 */
function applyStash(repo: Repository, args: string[], pop: boolean): CommandResult {
  const stack = repo.stashStack ?? [];

  if (stack.length === 0) {
    return fail(['fatal: No stash entries found.'], 128);
  }

  const idx = parseStashIndex(args[0], stack.length);
  if (idx === null) {
    const ref = args[0] ?? 'stash@{0}';
    return fail([`fatal: ${ref}: no such stash`], 128);
  }

  const entry = stack[idx]!;

  // Application par DIFF (TLS-02/04) : on calcule ce que le stash a changé par
  // rapport à son HEAD d'origine (stashWt vs stashHead), puis on applique ce diff
  // sur le working tree courant. On ne touche QUE les chemins effectivement
  // modifiés par le stash (un fichier modifié localement après le stash, mais
  // intact côté stash, est préservé) ; les suppressions du stash sont rejouées.
  const stashHead = treeContentsOf(repo, entry.headHash);
  const stashWt: Record<string, string> = {};
  for (const [path, e] of Object.entries(entry.workingTree)) {
    stashWt[path] = e.content;
  }

  const currentWT: Record<string, string> = {};
  for (const [path, e] of Object.entries(repo.workingTree)) {
    currentWT[path] = e.content;
  }

  const conflictFiles: Record<string, string> = {};
  const resultWT: Record<string, string> = { ...currentWT };

  const touched = new Set([...Object.keys(stashHead), ...Object.keys(stashWt)]);
  for (const path of touched) {
    const base = stashHead[path]; // contenu au HEAD du stash
    const stashed = stashWt[path]; // contenu côté stash
    if (base === stashed) continue; // le stash n'a pas modifié ce chemin

    const current = resultWT[path];
    if (stashed !== undefined) {
      // Ajout / modification vers `stashed`.
      if (current === undefined || current === base) {
        resultWT[path] = stashed; // application propre
      } else if (current === stashed) {
        // déjà dans l'état du stash
      } else {
        conflictFiles[path] = makeConflictMarkers(current, stashed, 'stash');
        resultWT[path] = conflictFiles[path]!;
      }
    } else {
      // Suppression côté stash (base défini, stashed absent).
      if (current === undefined || current === base) {
        delete resultWT[path]; // on rejoue la suppression
      } else {
        conflictFiles[path] = makeConflictMarkers(current, '(deleted by stash)', 'stash');
        resultWT[path] = conflictFiles[path]!;
      }
    }
  }

  const hasConflicts = Object.keys(conflictFiles).length > 0;

  // Appliquer le résultat au WT.
  repo.workingTree = buildWorkingTreeFromFiles(repo, resultWT);

  // TLS-03 : les changements reviennent NON stagés (sauf --index, non géré) →
  // index aligné sur le HEAD courant. Ça rend aussi visibles les conflits via
  // `git status` (TLS-06, minimum).
  repo.index = buildIndexFromFiles(repo, treeContentsOf(repo, headCommitHash(repo)));

  if (hasConflicts) {
    // Ne pas supprimer le stash en cas de conflit (même pour pop)
    const conflictMessages = Object.keys(conflictFiles)
      .sort()
      .map((path) => `CONFLICT (content): Conflict in ${path}`);
    return { output: conflictMessages, errors: [], exitCode: 1 };
  }

  if (pop) {
    // Supprimer le stash et ré-indexer
    stack.splice(idx, 1);
    repo.stashStack = stack;
    const msgSuffix = entry.message ? `: ${entry.message}` : '';
    return ok([`Dropped refs/stash@{${idx}} (${entry.headHash.slice(0, 7)}${msgSuffix})`]);
  }

  return ok([`Applied stash@{${idx}}`]);
}
