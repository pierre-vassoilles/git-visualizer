import { fail, ok, type CommandResult } from '../types';
import type { Repository, StashEntry } from '../model';
import {
  buildIndexFromFiles,
  buildWorkingTreeFromFiles,
  cloneIndex,
  cloneWorkingTree,
  currentBranch,
  getTreeFiles,
  headCommitHash,
  isInitialized,
  makeConflictMarkers,
} from '../repository';
import { getCommit } from '../objectStore';
import { notARepo } from './init';

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
      return stashApply(repo, args.slice(1), false);
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

  // Vérifier qu'il y a des changements à sauvegarder
  const headHash = headCommitHash(repo);
  if (!headHash) {
    return ok(['No local changes to save']);
  }

  const headCommitObj = getCommit(repo, headHash);
  if (!headCommitObj) {
    return ok(['No local changes to save']);
  }

  // Comparer WT et index vs HEAD
  const headFiles = getTreeFiles(repo, headCommitObj.tree);

  let hasChanges = false;

  // Vérifier l'index vs HEAD
  for (const path of Object.keys(repo.index)) {
    if (!(path in headFiles) || repo.index[path]!.content !== headFiles[path]) {
      hasChanges = true;
      break;
    }
  }
  if (!hasChanges) {
    for (const path of Object.keys(headFiles)) {
      if (!(path in repo.index)) {
        hasChanges = true;
        break;
      }
    }
  }

  // Vérifier le WT vs index
  if (!hasChanges) {
    for (const [path, wtEntry] of Object.entries(repo.workingTree)) {
      const indexEntry = repo.index[path];
      if (!indexEntry || indexEntry.content !== wtEntry.content) {
        hasChanges = true;
        break;
      }
    }
  }
  if (!hasChanges) {
    for (const path of Object.keys(repo.index)) {
      if (!(path in repo.workingTree)) {
        hasChanges = true;
        break;
      }
    }
  }

  if (!hasChanges) {
    return ok(['No local changes to save']);
  }

  // Créer l'entrée de stash
  const branchName = currentBranch(repo);
  const entry: StashEntry = {
    branchName,
    message,
    date: repo.commitCount,
    workingTree: cloneWorkingTree(repo.workingTree),
    index: cloneIndex(repo.index),
    headHash,
  };

  // Insérer en tête de la pile
  if (!repo.stashStack) {
    repo.stashStack = [];
  }
  repo.stashStack.unshift(entry);

  // Nettoyer WT et index : restaurer à HEAD (comme git reset --hard HEAD)
  const files = getTreeFiles(repo, headCommitObj.tree);
  repo.index = buildIndexFromFiles(repo, files);
  repo.workingTree = buildWorkingTreeFromFiles(repo, files);

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

function stashApply(repo: Repository, args: string[], _unused: boolean): CommandResult {
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

  // Détecter les conflits lors de la restauration
  // Conflit simple : fichier modifié dans le WT courant ET dans le stash, différemment
  const headHash = headCommitHash(repo);
  const headFiles: Record<string, string> = {};
  if (headHash) {
    const headCommitObj = getCommit(repo, headHash);
    if (headCommitObj) {
      Object.assign(headFiles, getTreeFiles(repo, headCommitObj.tree));
    }
  }

  const conflictFiles: Record<string, string> = {};
  const resultWT: Record<string, string> = {};

  // Partir du WT courant
  for (const [path, entry2] of Object.entries(repo.workingTree)) {
    resultWT[path] = entry2.content;
  }

  // Appliquer les fichiers du stash
  for (const [path, stashEntry] of Object.entries(entry.workingTree)) {
    const currentContent = resultWT[path];
    const headContent = headFiles[path];

    if (currentContent === undefined || currentContent === headContent) {
      // Pas de modification locale → appliquer le stash
      resultWT[path] = stashEntry.content;
    } else if (currentContent === stashEntry.content) {
      // Déjà dans le bon état
      resultWT[path] = stashEntry.content;
    } else {
      // Conflit : WT courant modifié ET différent du stash
      conflictFiles[path] = makeConflictMarkers(currentContent, stashEntry.content, 'stash');
      resultWT[path] = conflictFiles[path]!;
    }
  }

  const hasConflicts = Object.keys(conflictFiles).length > 0;

  // Appliquer le résultat au WT
  repo.workingTree = buildWorkingTreeFromFiles(repo, resultWT);

  // Appliquer l'index du stash
  repo.index = cloneIndex(entry.index);

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
