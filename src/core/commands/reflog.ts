import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  branchExists,
  getReflog,
  isInitialized,
} from '../repository';
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
  const ref = (sub === 'show') ? (args[1] ?? 'HEAD') : (sub ?? 'HEAD');
  return reflogShow(repo, ref);
}

// ---------------------------------------------------------------------------
// git reflog [show] [<ref>]
// ---------------------------------------------------------------------------

function reflogShow(repo: Repository, ref: string): CommandResult {
  // Résoudre le ref en nom interne
  let refName: string;
  if (ref === 'HEAD') {
    refName = 'HEAD';
  } else if (branchExists(repo, ref)) {
    refName = `refs/heads/${ref}`;
  } else {
    // Vérifier si c'est une branche qui n'existe pas
    return fail([`fatal: ${ref}: no such branch`], 128);
  }

  const entries = getReflog(repo, refName);
  if (entries.length === 0) {
    return ok([]);
  }

  const refLabel = ref === 'HEAD' ? 'HEAD' : ref;
  const lines = entries.map((entry, index) => {
    const short = shortHash(entry.newHash);
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
      const short = shortHash(latest.newHash);
      lines.push(`${short} ${refName}`);
    }
  }

  return ok(lines);
}

