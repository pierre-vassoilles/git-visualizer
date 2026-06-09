import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { getCommitHistoryWithHashes, isInitialized } from '../repository';
import { shortHash } from '../sha1';
import { notARepo } from './init';

/**
 * git log [--oneline]
 */
export function cmdLog(repo: Repository, flags: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  const history = getCommitHistoryWithHashes(repo);

  if (history.length === 0) {
    return fail(['fatal: No commits yet']);
  }

  const isOneline = flags.includes('--oneline');

  if (isOneline) {
    const lines = history.map(({ hash, commit }) => {
      const firstLine = commit.message.split('\n')[0] ?? commit.message;
      return `${shortHash(hash)} ${firstLine}`;
    });
    return ok(lines);
  }

  // Format long
  const lines: string[] = [];
  for (let i = 0; i < history.length; i++) {
    const { hash, commit } = history[i]!;
    if (i > 0) lines.push('');
    lines.push(`commit ${hash}`);
    lines.push(`Author: ${commit.author}`);
    lines.push(`Date:   ${formatDate(commit.date)}`);
    lines.push('');
    // Message indenté de 4 espaces
    for (const msgLine of commit.message.split('\n')) {
      lines.push(`    ${msgLine}`);
    }
  }

  return ok(lines);
}

/**
 * Formate un timestamp Unix en format Git lisible.
 * Exemple : "Mon Jun  9 12:00:00 2025 +0000"
 */
function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const dow = days[d.getUTCDay()]!;
  const mon = months[d.getUTCMonth()]!;
  const day = String(d.getUTCDate()).padStart(2, ' ');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${dow} ${mon} ${day} ${hh}:${mm}:${ss} ${year} +0000`;
}
