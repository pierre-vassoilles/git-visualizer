import { ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { isInitialized, storeBlob } from '../repository';
import { notARepo } from './init';

/**
 * git add <pathspec...>  |  git add .
 *
 * Ajoute des fichiers du working tree dans l'index.
 */
export function cmdAdd(repo: Repository, pathspecs: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  if (pathspecs.length === 0) {
    return { output: [], errors: ['fatal: pathspec cannot be empty'], exitCode: 1 };
  }

  // Résoudre les pathspecs en liste de fichiers
  let filesToAdd: string[];

  if (pathspecs.length === 1 && pathspecs[0] === '.') {
    filesToAdd = Object.keys(repo.workingTree);
  } else {
    // Valider et résoudre chaque pathspec
    for (const spec of pathspecs) {
      if (!(spec in repo.workingTree)) {
        return {
          output: [],
          errors: [`fatal: pathspec '${spec}' did not match any files`],
          exitCode: 1,
        };
      }
    }
    filesToAdd = pathspecs;
  }

  for (const filepath of filesToAdd) {
    const entry = repo.workingTree[filepath];
    if (!entry) continue;
    const blobHash = storeBlob(repo, entry.content);
    repo.index[filepath] = {
      blobHash,
      content: entry.content,
      mode: entry.mode,
    };
  }

  return ok();
}
