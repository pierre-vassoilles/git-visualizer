import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { getCommitHistoryWithHashes, headCommitHash, isInitialized } from '../repository';
import { getCommit } from '../objectStore';
import { shortHash } from '../sha1';
import { renderGraphAscii, type AsciiCommit } from '../../graph/ascii';
import { notARepo } from './init';

/**
 * git log [--oneline] [--graph]
 */
export function cmdLog(repo: Repository, flags: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  const history = getCommitHistoryWithHashes(repo);

  if (history.length === 0) {
    return fail(['fatal: No commits yet']);
  }

  const isOneline = flags.includes('--oneline');
  const isGraph = flags.includes('--graph');

  if (isGraph) {
    return logGraph(repo, !isOneline);
  }

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
 * git log --graph [--oneline] : rendu ASCII du DAG accessible depuis HEAD.
 *
 * Commits accessibles depuis HEAD, triés enfants-avant-parents. Astuce de
 * déterminisme : nos dates sont monotones (un enfant a un commitCount, donc une
 * date, strictement supérieurs à ceux de ses parents), donc trier par date
 * décroissante (tie-break par hash) produit un ordre topologique valide.
 */
function logGraph(repo: Repository, verbose: boolean): CommandResult {
  const headHash = headCommitHash(repo);
  if (!headHash) return fail(['fatal: No commits yet']);

  // Ensemble des commits accessibles depuis HEAD.
  const reachable = new Set<string>();
  const stack = [headHash];
  while (stack.length > 0) {
    const h = stack.pop()!;
    if (reachable.has(h)) continue;
    reachable.add(h);
    const c = getCommit(repo, h);
    if (c) for (const p of c.parents) stack.push(p);
  }

  const commits: AsciiCommit[] = [...reachable]
    .map((hash) => ({ hash, commit: getCommit(repo, hash)! }))
    .filter((x) => x.commit)
    .sort((a, b) => b.commit.date - a.commit.date || (a.hash < b.hash ? -1 : 1))
    .map(({ hash, commit }) => ({
      hash,
      shortHash: shortHash(hash),
      message: commit.message,
      parents: commit.parents,
      author: commit.author,
      date: commit.date,
    }));

  // Décorations : HEAD, branches, tags par hash.
  const refsByHash = new Map<string, string[]>();
  const push = (hash: string, label: string): void => {
    if (!refsByHash.has(hash)) refsByHash.set(hash, []);
    refsByHash.get(hash)!.push(label);
  };
  const headSymbolic = repo.head.symbolic;
  const currentBranchName = headSymbolic ? repo.head.target.replace('refs/heads/', '') : null;
  // HEAD en premier (sur le commit pointé).
  if (headSymbolic && currentBranchName) {
    const tip = repo.refs.heads[currentBranchName];
    if (tip) push(tip, `HEAD -> ${currentBranchName}`);
  } else if (headHash) {
    push(headHash, 'HEAD');
  }
  for (const [name, hash] of Object.entries(repo.refs.heads)) {
    if (name === currentBranchName) continue; // déjà couvert par HEAD -> name
    if (hash) push(hash, name);
  }
  for (const [name, hash] of Object.entries(repo.refs.tags)) {
    push(hash, `tag: ${name}`);
  }

  const lines = renderGraphAscii({ commits, refsByHash, verbose, formatDate });
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
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
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
