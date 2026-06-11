import { fail, ok, type CommandResult } from '../types';
import type { Commit, Repository } from '../model';
import { headCommitHash, isInitialized } from '../repository';
import { getCommit } from '../objectStore';
import { shortHash } from '../sha1';
import { renderGraphAscii, type AsciiCommit } from '../../graph/ascii';
import { notARepo } from './init';

/**
 * git log [--oneline] [--graph]
 */
export function cmdLog(repo: Repository, flags: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  const headHash = headCommitHash(repo);
  if (!headHash) {
    return fail(['fatal: No commits yet']);
  }

  const isOneline = flags.includes('--oneline');
  const isGraph = flags.includes('--graph');

  if (isGraph) {
    return logGraph(repo, !isOneline);
  }

  // BAS-02 : `git log` liste TOUS les commits accessibles depuis HEAD (tous les
  // parents), pas seulement la lignée du 1er parent — sinon les commits fusionnés
  // disparaissent de l'historique.
  const history = getReachableSorted(repo, headHash);
  // BAS-11/13 : décorations (HEAD → tags → branches).
  const decorations = collectDecorations(repo, headHash);
  const decorate = (hash: string): string => {
    const labels = decorations.get(hash);
    return labels && labels.length > 0 ? ` (${labels.join(', ')})` : '';
  };

  if (isOneline) {
    const lines = history.map(({ hash, commit }) => {
      const firstLine = commit.message.split('\n')[0] ?? commit.message;
      return `${shortHash(hash)}${decorate(hash)} ${firstLine}`;
    });
    return ok(lines);
  }

  // Format long
  const lines: string[] = [];
  for (let i = 0; i < history.length; i++) {
    const { hash, commit } = history[i]!;
    if (i > 0) lines.push('');
    lines.push(`commit ${hash}${decorate(hash)}`);
    // BAS-12 : ligne Merge pour les commits de fusion.
    if (commit.parents.length > 1) {
      lines.push(`Merge: ${commit.parents.map((p) => shortHash(p)).join(' ')}`);
    }
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
 * Commits accessibles depuis `headHash` (tous parents confondus), triés
 * enfants-avant-parents. Astuce de déterminisme : nos dates sont monotones (un
 * enfant a un commitCount/date strictement supérieurs à ses parents), donc trier
 * par date décroissante (tie-break par hash) produit un ordre topologique valide.
 */
function getReachableSorted(
  repo: Repository,
  headHash: string,
): Array<{ hash: string; commit: Commit }> {
  const reachable = new Set<string>();
  const stack = [headHash];
  while (stack.length > 0) {
    const h = stack.pop()!;
    if (reachable.has(h)) continue;
    reachable.add(h);
    const c = getCommit(repo, h);
    if (c) for (const p of c.parents) stack.push(p);
  }
  return [...reachable]
    .map((hash) => ({ hash, commit: getCommit(repo, hash) }))
    .filter((x): x is { hash: string; commit: Commit } => x.commit != null)
    .sort((a, b) => b.commit.date - a.commit.date || (a.hash < b.hash ? -1 : 1));
}

/**
 * Décorations de refs par hash, dans l'ordre de git : HEAD (→ branche courante),
 * puis les tags, puis les autres branches (BAS-13).
 */
function collectDecorations(repo: Repository, headHash: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const push = (hash: string, label: string): void => {
    if (!map.has(hash)) map.set(hash, []);
    map.get(hash)!.push(label);
  };
  const headSymbolic = repo.head.symbolic;
  const currentBranchName = headSymbolic ? repo.head.target.replace('refs/heads/', '') : null;

  // 1. HEAD (combiné avec la branche courante si symbolique).
  if (headSymbolic && currentBranchName) {
    const tip = repo.refs.heads[currentBranchName];
    if (tip) push(tip, `HEAD -> ${currentBranchName}`);
  } else {
    push(headHash, 'HEAD');
  }
  // 2. Tags (avant les autres branches).
  for (const [name, hash] of Object.entries(repo.refs.tags)) {
    push(hash, `tag: ${name}`);
  }
  // 3. Autres branches.
  for (const [name, hash] of Object.entries(repo.refs.heads)) {
    if (name === currentBranchName) continue; // déjà couvert par HEAD -> name
    if (hash) push(hash, name);
  }
  return map;
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

  const commits: AsciiCommit[] = getReachableSorted(repo, headHash).map(({ hash, commit }) => ({
    hash,
    shortHash: shortHash(hash),
    message: commit.message,
    parents: commit.parents,
    author: commit.author,
    date: commit.date,
  }));

  const refsByHash = collectDecorations(repo, headHash);

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
