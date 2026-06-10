import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { branchExists, getReflog, isInitialized } from '../repository';
import { shortHash } from '../sha1';
import { notARepo } from './init';

/**
 * git reflog [show] [<ref>]
 * git reflog list
 *
 * Affiche le journal des mouvements de HEAD et des refs.
 */
export function cmdReflog(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  const sub = args[0];

  if (sub === 'list') {
    return reflogList(repo);
  }

  // git reflog [show] [<ref>]
  const ref = sub === 'show' ? (args[1] ?? 'HEAD') : (sub ?? 'HEAD');
  return reflogShow(repo, ref);
}

// ---------------------------------------------------------------------------
// git reflog [show] [<ref>]
// ---------------------------------------------------------------------------

function reflogShow(repo: Repository, ref: string): CommandResult {
  // Résoudre le ref en nom interne. On accepte HEAD, une branche, ou un tag
  // (y compris un tag/branche supprimé dont le reflog subsiste).
  let refName: string;
  if (ref === 'HEAD') {
    refName = 'HEAD';
  } else if (branchExists(repo, ref) || repo.reflog?.[`refs/heads/${ref}`]) {
    refName = `refs/heads/${ref}`;
  } else if (repo.refs.tags[ref] !== undefined || repo.reflog?.[`refs/tags/${ref}`]) {
    refName = `refs/tags/${ref}`;
  } else {
    return fail([`fatal: ${ref}: no such branch`], 128);
  }

  const entries = getReflog(repo, refName);
  if (entries.length === 0) {
    return ok([]);
  }

  const refLabel = ref === 'HEAD' ? 'HEAD' : ref;
  const lines = entries.map((entry, index) => {
    // Sur une suppression, newHash est vide : on affiche le hash d'origine.
    const short = shortHash(entry.newHash || entry.oldHash);
    return `${short} ${refLabel}@{${index}}: ${entry.action}: ${entry.description}`;
  });

  return ok(lines);
}

// ---------------------------------------------------------------------------
// git reflog list
// ---------------------------------------------------------------------------

function reflogList(repo: Repository): CommandResult {
  if (!repo.reflog) {
    return ok([]);
  }

  const lines: string[] = [];
  for (const refName of Object.keys(repo.reflog).sort()) {
    const entries = repo.reflog[refName] ?? [];
    if (entries.length > 0) {
      const latest = entries[0]!;
      // Sur une suppression, newHash est vide : on retombe sur le hash d'origine
      // (cohérent avec reflogShow).
      const short = shortHash(latest.newHash || latest.oldHash);
      lines.push(`${short} ${refName}`);
    }
  }

  return ok(lines);
}
