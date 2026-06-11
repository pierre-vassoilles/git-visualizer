/**
 * git mv [-f|--force] <src>... <dst>
 *
 * Renomme/déplace des fichiers (ou répertoires) dans le working tree ET l'index.
 * Le blobHash est conservé (contenu inchangé) ⇒ renommage détectable.
 *  - destination existante (index OU working tree non suivi) → refus sauf -f (CNT-07) ;
 *  - source répertoire → déplace toutes les entrées sous `src/` (CNT-08) ;
 *  - >2 positionnels → la dernière est la destination, qui doit être un répertoire (CNT-09).
 *
 * Spec : docs/specs/43-rm-mv.md.
 */

import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { isInitialized } from '../repository';
import { notARepo } from './init';

const basename = (p: string): string => p.replace(/\/+$/, '').split('/').pop()!;
const stripSlash = (p: string): string => p.replace(/\/+$/, '');

export function cmdMv(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  const force = args.includes('-f') || args.includes('--force');
  const positionals = args.filter((a) => !a.startsWith('-'));

  if (positionals.length < 2) {
    return fail(['fatal: missing destination file'], 128);
  }

  const dstArg = positionals[positionals.length - 1]!;
  const sources = positionals.slice(0, -1);
  const dstDir = stripSlash(dstArg);

  const indexPaths = Object.keys(repo.index);
  const dstIsExistingDir = indexPaths.some((p) => p.startsWith(`${dstDir}/`));
  // La destination est un répertoire si : slash final ou répertoire existant.
  const dstIsDir = dstArg.endsWith('/') || dstIsExistingDir;

  // Plusieurs sources exigent une destination répertoire (existante).
  if (sources.length > 1 && !dstIsDir) {
    return fail([`fatal: destination '${dstArg}' is not a directory`], 128);
  }

  // Construire la liste des déplacements (from → to).
  const moves: Array<{ from: string; to: string }> = [];
  for (const src of sources) {
    if (src in repo.index) {
      // Source = fichier.
      const to = dstIsDir ? `${dstDir}/${basename(src)}` : dstArg;
      moves.push({ from: src, to });
    } else {
      // Source = répertoire ? (entrées d'index sous `src/`).
      const srcPrefix = `${stripSlash(src)}/`;
      const dirEntries = indexPaths.filter((p) => p.startsWith(srcPrefix));
      if (dirEntries.length === 0) {
        return fail([`fatal: bad source, source=${src}, destination=${dstArg}`], 128);
      }
      for (const p of dirEntries) {
        const suffix = p.slice(srcPrefix.length);
        // dst existant → on déplace le répertoire DANS dst ; sinon on le RENOMME.
        const to = dstIsExistingDir
          ? `${dstDir}/${basename(src)}/${suffix}`
          : `${dstDir}/${suffix}`;
        moves.push({ from: p, to });
      }
    }
  }

  // Validation atomique : pas de no-op, pas de collision (index OU working tree)
  // sans -f.
  for (const { from, to } of moves) {
    if (to === from) {
      return fail(['fatal: source and destination the same'], 128);
    }
    if (!force && (to in repo.index || to in repo.workingTree)) {
      return fail([`fatal: destination exists, source=${from}, destination=${to}`], 128);
    }
  }

  // Application : même entrée d'index (donc même blobHash) sous le nouveau chemin.
  for (const { from, to } of moves) {
    const idxEntry = repo.index[from]!;
    const wtEntry = repo.workingTree[from];
    repo.index[to] = idxEntry;
    delete repo.index[from];
    if (wtEntry) {
      repo.workingTree[to] = wtEntry;
      delete repo.workingTree[from];
    }
  }

  return ok();
}
