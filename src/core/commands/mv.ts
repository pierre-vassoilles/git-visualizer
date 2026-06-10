/**
 * git mv [-f|--force] <src> <dst>
 *
 * Renomme/déplace un fichier dans le working tree ET l'index. Le hash du blob
 * est conservé (contenu inchangé) ⇒ renommage détectable. Refuse si la
 * destination existe (sauf -f).
 *
 * Spec : docs/specs/43-rm-mv.md.
 */

import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { isInitialized } from '../repository';
import { notARepo } from './init';

export function cmdMv(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  const force = args.includes('-f') || args.includes('--force');
  const positionals = args.filter((a) => !a.startsWith('-'));

  if (positionals.length < 2) {
    return fail(['fatal: missing destination file'], 128);
  }

  const src = positionals[0]!;
  const dstArg = positionals[1]!;

  // La source doit exister dans l'index.
  if (!(src in repo.index)) {
    return fail([`fatal: bad source, source=${src}, destination=${dstArg}`], 128);
  }

  // Destination : si c'est un répertoire (slash final ou préfixe d'une entrée
  // existante), déplacer dans ce répertoire sous le nom de base de la source.
  const dirPrefix = dstArg.endsWith('/') ? dstArg : `${dstArg}/`;
  const isDir =
    dstArg.endsWith('/') || Object.keys(repo.index).some((p) => p.startsWith(dirPrefix));
  let dst = dstArg;
  if (isDir) {
    const base = src.split('/').pop()!;
    dst = `${dstArg.replace(/\/+$/, '')}/${base}`;
  }

  if (dst === src) {
    return fail(['fatal: source and destination the same'], 128);
  }

  if (dst in repo.index && !force) {
    return fail(
      ['fatal: destination exists. Use -f to overwrite, or -r to remove duplicates.'],
      128,
    );
  }

  // Application : même entrée d'index (donc même blobHash) sous le nouveau chemin.
  const idxEntry = repo.index[src]!;
  const wtEntry = repo.workingTree[src];

  repo.index[dst] = idxEntry;
  delete repo.index[src];
  if (wtEntry) {
    repo.workingTree[dst] = wtEntry;
    delete repo.workingTree[src];
  }

  return ok();
}
