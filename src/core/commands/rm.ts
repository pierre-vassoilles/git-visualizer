/**
 * git rm [--cached] [-r|--recursive] [-f|--force] <pathspec>...
 *
 * Supprime des fichiers du working tree ET de l'index (ou de l'index seul avec
 * --cached). Refuse par défaut un fichier modifié (non stagé) ou aux changements
 * stagés différents de HEAD (sauf -f).
 *
 * Spec : docs/specs/43-rm-mv.md.
 */

import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { flattenTree, headCommitHash, isInitialized } from '../repository';
import { getCommit, hashBlob } from '../objectStore';
import { notARepo } from './init';

export function cmdRm(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  const cached = args.includes('--cached');
  const force = args.includes('-f') || args.includes('--force');
  const recursive = args.includes('-r') || args.includes('--recursive');
  const pathspecs = args.filter((a) => !a.startsWith('-'));

  if (pathspecs.length === 0) {
    return fail(['fatal: No pathspec was given. Which files should I remove?'], 128);
  }

  // Fichiers de HEAD (pour détecter les changements stagés).
  const headHash = headCommitHash(repo);
  const headFiles = headHash ? flattenTree(repo, getCommit(repo, headHash)!.tree) : {};

  // Résolution des cibles (avec récursion sur répertoire si -r).
  const targets: string[] = [];
  for (const spec of pathspecs) {
    if (spec === '') {
      return fail([`fatal: pathspec '${spec}' did not match any files`], 128);
    }
    if (recursive) {
      const prefix = spec.endsWith('/') ? spec : `${spec}/`;
      const matched = Object.keys(repo.index).filter((p) => p === spec || p.startsWith(prefix));
      if (matched.length === 0) {
        return fail([`fatal: pathspec '${spec}' did not match any files`], 128);
      }
      targets.push(...matched);
    } else {
      if (!(spec in repo.index)) {
        return fail([`fatal: pathspec '${spec}' did not match any files`], 128);
      }
      targets.push(spec);
    }
  }

  // Validation préalable (atomicité : rien n'est supprimé si une cible échoue).
  // Matrice de refus fidèle à git, distinguant trois états par fichier :
  //   - staged  = blob d'index ≠ blob de HEAD (modif indexée OU fichier neuf non
  //               encore commité — headBlob undefined) ;
  //   - localMod= fichier présent au WT dont le contenu ≠ blob d'index (modif non
  //               indexée).
  // `git rm` (index+WT) refuse staged seul, localMod seul, ou les deux, avec des
  // messages/hints distincts. `git rm --cached` ne refuse que le cas « les deux »
  // (le blob indexé, distinct du WT ET de HEAD, serait perdu). `-f` force tout.
  if (!force) {
    for (const path of targets) {
      const idx = repo.index[path];
      const wt = repo.workingTree[path];
      const headBlob = headFiles[path];
      if (idx === undefined) continue;

      const staged = idx.blobHash !== headBlob;
      const localMod = wt !== undefined && hashBlob(wt.content) !== idx.blobHash;

      if (staged && localMod) {
        return fail(
          [
            'error: the following file has staged content different from both the file and the HEAD:',
            `    ${path}`,
            '(use -f to force removal)',
          ],
          1,
        );
      }
      // Les autres refus ne s'appliquent pas à `--cached` (le WT est conservé).
      if (cached) continue;

      if (staged) {
        return fail(
          [
            'error: the following file has changes staged in the index:',
            `    ${path}`,
            '(use --cached to keep the file, or -f to force removal)',
          ],
          1,
        );
      }
      if (localMod) {
        return fail(
          [
            'error: the following file has local modifications:',
            `    ${path}`,
            '(use --cached to keep the file, or -f to force removal)',
          ],
          1,
        );
      }
    }
  }

  // Application.
  for (const path of targets) {
    delete repo.index[path];
    if (!cached) delete repo.workingTree[path];
  }

  return ok();
}
