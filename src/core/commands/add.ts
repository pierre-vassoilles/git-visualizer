import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { isInitialized, storeBlob } from '../repository';
import { isIgnored, loadIgnorePatterns } from '../gitignore';
import { notARepo } from './init';

/**
 * git add [-f|--force] [-A|--all] <pathspec...>  |  git add [-f] .
 *
 * Ajoute des changements du working tree dans l'index :
 *  - un pathspec peut désigner un fichier OU un répertoire (récursif, BAS-06) ;
 *  - une suppression d'un fichier suivi est stageable (BAS-07) ;
 *  - `-A`/`--all` (et `git add .`) stagent tous les changements, suppressions
 *    comprises (BAS-08).
 * Les fichiers ignorés par `.gitignore` sont refusés (pathspec fichier explicite)
 * ou silencieusement exclus (glob/`.`/`-A`), sauf `-f`/`--force` ; un fichier déjà
 * suivi n'est jamais bloqué par l'ignore.
 */
export function cmdAdd(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  const force = args.includes('-f') || args.includes('--force');
  const all = args.includes('-A') || args.includes('--all');
  const pathspecs = args.filter((a) => !a.startsWith('-'));

  if (pathspecs.length === 0 && !all) {
    // BAS-14 : git n'échoue pas, il informe (exit 0) avec un hint.
    return ok(['Nothing specified, nothing added.', "hint: Maybe you wanted to say 'git add .'?"]);
  }

  const ignore = force ? [] : loadIgnorePatterns(repo);
  // Ensemble des chemins connus : working tree (modifs/ajouts) ∪ index (pour voir
  // les suppressions de fichiers suivis).
  const candidates = new Set([...Object.keys(repo.workingTree), ...Object.keys(repo.index)]);

  let toStage: string[];

  if (all || (pathspecs.length === 1 && pathspecs[0] === '.')) {
    toStage = [...candidates].filter((p) => keepPath(repo, p, ignore, force));
  } else {
    toStage = [];
    for (const spec of pathspecs) {
      const prefix = spec.endsWith('/') ? spec : `${spec}/`;
      const matched = [...candidates].filter((p) => p === spec || p.startsWith(prefix));
      if (matched.length === 0) {
        // BAS-15 : exit 128 (cohérent avec `git rm` et le vrai git).
        return fail([`fatal: pathspec '${spec}' did not match any files`], 128);
      }
      // Pathspec EXACT pointant un fichier ignoré non suivi → erreur (comme git).
      if (!force && spec in repo.workingTree && !(spec in repo.index) && isIgnored(spec, ignore)) {
        return fail(
          [
            `fatal: add [--force|-f]: '${spec}' is ignored by one of your .gitignore files, use 'add -f' to add it`,
          ],
          1,
        );
      }
      for (const p of matched) {
        if (keepPath(repo, p, ignore, force)) toStage.push(p);
      }
    }
  }

  for (const path of toStage) {
    const wt = repo.workingTree[path];
    if (wt) {
      const blobHash = storeBlob(repo, wt.content);
      repo.index[path] = { blobHash, content: wt.content, mode: wt.mode };
    } else {
      // Fichier suivi supprimé du working tree → stager la suppression.
      delete repo.index[path];
    }
  }

  return ok();
}

/**
 * Faut-il stager ce chemin ? Une suppression (absent du WT) est toujours gardée ;
 * un fichier présent est gardé sauf s'il est ignoré ET non suivi (hors `--force`).
 */
function keepPath(
  repo: Repository,
  path: string,
  ignore: ReturnType<typeof loadIgnorePatterns>,
  force: boolean,
): boolean {
  if (!(path in repo.workingTree)) return true; // suppression d'un fichier suivi
  return force || path in repo.index || !isIgnored(path, ignore);
}
