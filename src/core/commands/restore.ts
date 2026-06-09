import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { flattenTree, headCommitHash, isInitialized, resolveCommitish } from '../repository';
import { getCommit } from '../objectStore';
import { notARepo } from './init';

/**
 * git restore <pathspec...>                   — restaure WT depuis l'index
 * git restore --staged <pathspec...>          — retire du staging (index ← HEAD)
 * git restore --source=<commit> <pathspec...> — restaure depuis un commit spécifique
 */
export function cmdRestore(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  if (args.length === 0) {
    return fail(['fatal: pathspec cannot be empty']);
  }

  // Parser les options
  const isStaged = args.includes('--staged');
  let sourceRef: string | null = null;
  const pathspecs: string[] = [];

  for (const arg of args) {
    if (arg === '--staged') continue;
    if (arg.startsWith('--source=')) {
      sourceRef = arg.slice('--source='.length);
      continue;
    }
    pathspecs.push(arg);
  }

  if (pathspecs.length === 0) {
    return fail(['fatal: pathspec cannot be empty']);
  }

  // Résoudre la source commit si --source est spécifié
  if (sourceRef !== null) {
    const commitHash = resolveCommitish(repo, sourceRef);
    if (!commitHash) {
      return fail([`fatal: reference is not a tree: '${sourceRef}'`]);
    }
    return restoreFromCommit(repo, pathspecs, commitHash);
  }

  if (isStaged) {
    return restoreStaged(repo, pathspecs);
  }

  return restoreFromIndex(repo, pathspecs);
}

/** Restaure le working tree depuis l'index. */
function restoreFromIndex(repo: Repository, pathspecs: string[]): CommandResult {
  const toRestore = resolvePathspecs(repo, pathspecs);

  if (toRestore.length === 0) {
    // Vérifier si au moins un pathspec existait dans l'index
    const missingPaths: string[] = [];
    for (const spec of pathspecs) {
      if (spec !== '.' && !(spec in repo.index)) {
        missingPaths.push(spec);
      }
    }
    if (missingPaths.length > 0) {
      return fail([`error: pathspec '${missingPaths[0]}' did not match any files`]);
    }
    return ok();
  }

  // Vérifier que tous les pathspecs ont au moins une entrée source
  if (pathspecs.length === 1 && pathspecs[0] !== '.') {
    const spec = pathspecs[0]!;
    if (!(spec in repo.index) && !(spec in repo.workingTree)) {
      return fail([`error: pathspec '${spec}' did not match any files`]);
    }
    if (!(spec in repo.index)) {
      return fail([`error: pathspec '${spec}' did not match any files`]);
    }
  }

  for (const path of toRestore) {
    const indexEntry = repo.index[path];
    if (!indexEntry) continue;

    repo.workingTree[path] = {
      content: indexEntry.content,
      mode: indexEntry.mode,
    };
  }

  return ok();
}

/** Retire du staging : index ← HEAD. */
function restoreStaged(repo: Repository, pathspecs: string[]): CommandResult {
  const headHash = headCommitHash(repo);

  // Construire la map HEAD filepath → blobHash
  const headFiles: Record<string, string> = {}; // path → blobHash
  if (headHash) {
    const commit = getCommit(repo, headHash);
    if (commit) {
      Object.assign(headFiles, flattenTree(repo, commit.tree));
    }
  }

  const toUnstage = resolvePathspecs(repo, pathspecs, headFiles);

  if (toUnstage.length === 0 && pathspecs.length === 1 && pathspecs[0] !== '.') {
    const spec = pathspecs[0]!;
    if (!(spec in repo.index) && !(spec in headFiles)) {
      return fail([`error: pathspec '${spec}' did not match any files`]);
    }
  }

  for (const path of toUnstage) {
    const headBlobHash = headFiles[path];
    if (!headBlobHash) {
      // Fichier n'existe pas dans HEAD → supprimer de l'index
      delete repo.index[path];
    } else {
      // Restaurer depuis HEAD
      const obj = repo.objects[headBlobHash];
      if (obj && obj.type === 'blob') {
        repo.index[path] = {
          blobHash: headBlobHash,
          content: obj.content,
          mode: '100644',
        };
      }
    }
  }

  return ok();
}

/** Restaure le working tree (et éventuellement l'index) depuis un commit spécifique. */
function restoreFromCommit(
  repo: Repository,
  pathspecs: string[],
  commitHash: string,
): CommandResult {
  const commit = getCommit(repo, commitHash);
  if (!commit) {
    return fail([`fatal: reference is not a tree: '${commitHash}'`]);
  }

  const commitFiles = flattenTree(repo, commit.tree); // path → blobHash

  const allPaths: string[] = [];
  for (const spec of pathspecs) {
    if (spec === '.') {
      allPaths.push(...Object.keys(commitFiles));
      // Aussi les fichiers du WT qui seraient supprimés
      allPaths.push(...Object.keys(repo.workingTree));
    } else {
      allPaths.push(spec);
    }
  }

  // Dédoublonner
  const uniquePaths = [...new Set(allPaths)];

  if (
    uniquePaths.length === 0 ||
    (pathspecs.length === 1 &&
      pathspecs[0] !== '.' &&
      !(pathspecs[0] in commitFiles) &&
      !(pathspecs[0] in repo.workingTree))
  ) {
    const spec = pathspecs[0] ?? '';
    return fail([`error: pathspec '${spec}' did not match any files`]);
  }

  for (const path of uniquePaths) {
    const blobHash = commitFiles[path];
    if (!blobHash) {
      // Fichier absent du commit → supprimer du working tree
      delete repo.workingTree[path];
    } else {
      const obj = repo.objects[blobHash];
      if (obj && obj.type === 'blob') {
        repo.workingTree[path] = {
          content: obj.content,
          mode: '100644',
        };
      }
    }
  }

  return ok();
}

/**
 * Résout les pathspecs en liste de chemins réels.
 * Si '.' → tous les fichiers dans l'index ou dans la source additionnelle.
 */
function resolvePathspecs(
  repo: Repository,
  pathspecs: string[],
  additionalSource: Record<string, string> = {},
): string[] {
  const result: string[] = [];

  for (const spec of pathspecs) {
    if (spec === '.') {
      const allPaths = new Set([...Object.keys(repo.index), ...Object.keys(additionalSource)]);
      result.push(...allPaths);
    } else {
      result.push(spec);
    }
  }

  return [...new Set(result)];
}
