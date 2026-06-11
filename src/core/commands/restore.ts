import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { flattenTree, headCommitHash, isInitialized, resolveCommitish } from '../repository';
import { getCommit } from '../objectStore';
import { notARepo } from './init';

/**
 * git restore <pathspec...>                            — Cas 1 : WT ← index
 * git restore --staged <pathspec...>                   — Cas 2 : index ← HEAD
 * git restore --source=<commit> <pathspec...>          — Cas 3 : WT ← commit
 * git restore --staged --source=<commit> <pathspec...> — Cas 4 : index ← commit
 *
 * Règle du quadrant (spec 46) : `--staged` PRIME — s'il est présent, la cible est
 * toujours l'index (Cas 2/4), sinon le working tree (Cas 1/3). `--source` ne fait
 * que changer la SOURCE des blobs, jamais la cible.
 *
 * Atomicité : tous les pathspecs explicites sont validés avant toute écriture ;
 * un seul pathspec introuvable → erreur, aucune restauration.
 */
export function cmdRestore(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

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

  // Résoudre la source --source en table path → blobHash (si fournie).
  let commitFiles: Record<string, string> | null = null;
  if (sourceRef !== null) {
    const commitHash = resolveCommitish(repo, sourceRef);
    if (!commitHash) {
      return fail([`fatal: reference is not a tree: '${sourceRef}'`]);
    }
    const commit = getCommit(repo, commitHash);
    if (!commit) {
      return fail([`fatal: reference is not a tree: '${sourceRef}'`]);
    }
    commitFiles = flattenTree(repo, commit.tree);
  }

  return isStaged
    ? restoreToIndex(repo, pathspecs, commitFiles)
    : restoreToWorkingTree(repo, pathspecs, commitFiles);
}

/**
 * Cas 1 (commitFiles === null, source = index) et Cas 3 (commitFiles, source = commit).
 * Cible : working tree.
 */
function restoreToWorkingTree(
  repo: Repository,
  pathspecs: string[],
  commitFiles: Record<string, string> | null,
): CommandResult {
  // Un chemin est "connu" s'il existe dans la source. Pour une source commit, un
  // chemin SUIVI (dans l'index) absent du commit est aussi valide (il sera
  // supprimé du WT, comme le vrai git) — mais PAS un fichier non suivi (NAV-14 :
  // `git restore --source=… <untracked>` ne doit pas supprimer l'untracked).
  const inSource = (p: string): boolean =>
    commitFiles ? p in commitFiles || p in repo.index : p in repo.index;

  const { paths, error } = expandAndValidate(repo, pathspecs, inSource, commitFiles);
  if (error) return error;

  for (const path of paths) {
    if (commitFiles) {
      const blobHash = commitFiles[path];
      if (!blobHash) {
        delete repo.workingTree[path];
        continue;
      }
      const obj = repo.objects[blobHash];
      if (obj && obj.type === 'blob') {
        repo.workingTree[path] = { content: obj.content, mode: '100644' };
      }
    } else {
      const indexEntry = repo.index[path];
      if (indexEntry) {
        repo.workingTree[path] = { content: indexEntry.content, mode: indexEntry.mode };
      }
    }
  }

  return ok();
}

/**
 * Cas 2 (commitFiles === null, source = HEAD) et Cas 4 (commitFiles, source = commit).
 * Cible : index.
 */
function restoreToIndex(
  repo: Repository,
  pathspecs: string[],
  commitFiles: Record<string, string> | null,
): CommandResult {
  // Source : HEAD (Cas 2) ou le commit --source (Cas 4).
  let sourceFiles: Record<string, string>;
  if (commitFiles) {
    sourceFiles = commitFiles;
  } else {
    const headHash = headCommitHash(repo);
    // NAV-09 : `git restore --staged` sans --source sur un HEAD non-né échoue
    // (le bon geste pré-commit est `git rm --cached`).
    if (!headHash) {
      return fail(['fatal: could not resolve HEAD'], 128);
    }
    sourceFiles = {};
    const commit = getCommit(repo, headHash);
    if (commit) Object.assign(sourceFiles, flattenTree(repo, commit.tree));
  }

  // Un chemin est valide s'il existe dans la source OU dans l'index : un fichier
  // présent dans l'index mais absent de la source est désindexé (supprimé de l'index).
  const inSource = (p: string): boolean => p in sourceFiles || p in repo.index;

  const { paths, error } = expandAndValidate(repo, pathspecs, inSource, sourceFiles);
  if (error) return error;

  for (const path of paths) {
    const blobHash = sourceFiles[path];
    if (!blobHash) {
      delete repo.index[path];
      continue;
    }
    const obj = repo.objects[blobHash];
    if (obj && obj.type === 'blob') {
      repo.index[path] = { blobHash, content: obj.content, mode: '100644' };
    }
  }

  return ok();
}

/**
 * Développe les pathspecs (`.` → tous les chemins de la source + du WT) et valide
 * atomiquement les pathspecs explicites. `globSource` fournit les chemins pour `.`
 * (l'index quand null).
 */
function expandAndValidate(
  repo: Repository,
  pathspecs: string[],
  inSource: (p: string) => boolean,
  globSource: Record<string, string> | null,
): { paths: string[]; error: CommandResult | null } {
  const missing: string[] = [];
  const expanded: string[] = [];

  for (const spec of pathspecs) {
    if (spec === '.') {
      // Opération globale : pas de validation, on prend tout ce qui est connu.
      const base = globSource ?? repo.index;
      expanded.push(...Object.keys(base));
      expanded.push(...Object.keys(repo.workingTree));
      continue;
    }
    if (!inSource(spec)) {
      missing.push(spec);
    } else {
      expanded.push(spec);
    }
  }

  if (missing.length > 0) {
    return {
      paths: [],
      error: fail(missing.map((ps) => `error: pathspec '${ps}' did not match any files`)),
    };
  }

  return { paths: [...new Set(expanded)], error: null };
}
