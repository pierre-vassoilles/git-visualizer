import { ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { isInitialized, storeBlob } from '../repository';
import { isIgnored, loadIgnorePatterns } from '../gitignore';
import { notARepo } from './init';

/**
 * git add [-f|--force] <pathspec...>  |  git add [-f] .
 *
 * Ajoute des fichiers du working tree dans l'index. Les fichiers ignorés par
 * `.gitignore` sont refusés (pathspec explicite) ou silencieusement exclus
 * (`git add .`), sauf avec `-f`/`--force`. Un fichier déjà suivi (dans l'index)
 * n'est jamais bloqué par l'ignore.
 */
export function cmdAdd(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  const force = args.includes('-f') || args.includes('--force');
  const pathspecs = args.filter((a) => a !== '-f' && a !== '--force');

  if (pathspecs.length === 0) {
    return { output: [], errors: ['fatal: pathspec cannot be empty'], exitCode: 1 };
  }

  const ignore = force ? [] : loadIgnorePatterns(repo);

  // Résoudre les pathspecs en liste de fichiers
  let filesToAdd: string[];

  if (pathspecs.length === 1 && pathspecs[0] === '.') {
    filesToAdd = Object.keys(repo.workingTree).filter(
      (f) => force || f in repo.index || !isIgnored(f, ignore),
    );
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
      // Refuser un fichier ignoré (sauf déjà suivi ou --force).
      if (!force && !(spec in repo.index) && isIgnored(spec, ignore)) {
        return {
          output: [],
          errors: [
            `fatal: add [--force|-f]: '${spec}' is ignored by one of your .gitignore files, use 'add -f' to add it`,
          ],
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
