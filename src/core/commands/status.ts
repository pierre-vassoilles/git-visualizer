import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  computeAheadBehind,
  currentBranch,
  flattenTree,
  headCommit,
  headCommitHash,
  isHeadDetached,
  isInitialized,
} from '../repository';
import { hashBlob } from '../objectStore';
import { shortHash } from '../sha1';
import { notARepo } from './init';

/**
 * git status [-s | --short]
 */
export function cmdStatus(repo: Repository, flags: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  const isShort = flags.includes('-s') || flags.includes('--short');

  // Déterminer l'affichage de la branche courante
  let branchDisplay: string;
  if (isHeadDetached(repo)) {
    const detachedHash = repo.head.target;
    branchDisplay = `HEAD detached at ${shortHash(detachedHash)}`;
  } else {
    branchDisplay = currentBranch(repo) ?? '(HEAD detached)';
  }

  // Calculer les infos de suivi upstream (uniquement pour le format long)
  let upstreamLines: string[] = [];
  if (!isShort) {
    upstreamLines = buildUpstreamLines(repo);
  }

  const commit = headCommit(repo);

  // Construire la map HEAD filepath → blobHash
  const headFiles: Record<string, string> = {};
  if (commit) {
    const flattened = flattenTree(repo, commit.tree);
    Object.assign(headFiles, flattened);
  }

  // --- Calcul des catégories ---

  // 1. Changes to be committed (staged vs HEAD)
  //    - new file: dans index, pas dans HEAD
  //    - modified: dans index ET dans HEAD avec hash différent
  //    - deleted:  dans HEAD, pas dans index
  const stagedNew: string[] = [];
  const stagedModified: string[] = [];
  const stagedDeleted: string[] = [];

  if (commit) {
    // Fichiers dans HEAD mais plus dans l'index → deleted (staged)
    for (const filepath of Object.keys(headFiles)) {
      if (!(filepath in repo.index)) {
        stagedDeleted.push(filepath);
      }
    }
  }

  for (const [filepath, entry] of Object.entries(repo.index)) {
    if (!(filepath in headFiles)) {
      stagedNew.push(filepath);
    } else if (headFiles[filepath] !== entry.blobHash) {
      stagedModified.push(filepath);
    }
  }

  // 2. Changes not staged (working tree vs index)
  //    - modified: dans index ET working tree avec contenu différent
  //    - deleted:  dans index, pas dans working tree
  const unstagedModified: string[] = [];
  const unstagedDeleted: string[] = [];

  for (const [filepath, indexEntry] of Object.entries(repo.index)) {
    const wtEntry = repo.workingTree[filepath];
    if (!wtEntry) {
      unstagedDeleted.push(filepath);
    } else {
      const wtHash = hashBlob(wtEntry.content);
      if (wtHash !== indexEntry.blobHash) {
        unstagedModified.push(filepath);
      }
    }
  }

  // 3. Untracked files : dans le working tree mais PAS dans l'index. Le suivi
  //    est défini par l'index (pas par HEAD) : un fichier retiré de l'index via
  //    `git rm --cached` mais conservé dans le WT redevient untracked, comme
  //    dans le vrai git (qui affiche alors « D » staged + « ?? » untracked).
  const untracked: string[] = [];
  for (const filepath of Object.keys(repo.workingTree)) {
    if (!(filepath in repo.index)) {
      untracked.push(filepath);
    }
  }

  // Tri alphabétique
  const sort = (a: string[]) => [...a].sort();

  if (isShort) {
    return buildShortOutput(
      sort(stagedNew),
      sort(stagedModified),
      sort(stagedDeleted),
      sort(unstagedModified),
      sort(unstagedDeleted),
      sort(untracked),
    );
  }

  return buildLongOutput(
    branchDisplay,
    commit === null,
    upstreamLines,
    sort(stagedNew),
    sort(stagedModified),
    sort(stagedDeleted),
    sort(unstagedModified),
    sort(unstagedDeleted),
    sort(untracked),
  );
}

// ---------------------------------------------------------------------------
// Formatage long
// ---------------------------------------------------------------------------

function buildLongOutput(
  branch: string,
  noCommits: boolean,
  upstreamLines: string[],
  stagedNew: string[],
  stagedModified: string[],
  stagedDeleted: string[],
  unstagedModified: string[],
  unstagedDeleted: string[],
  untracked: string[],
): CommandResult {
  const lines: string[] = [];

  lines.push(`On branch ${branch}`);

  // Lignes de suivi upstream (si présentes)
  for (const upLine of upstreamLines) {
    lines.push(upLine);
  }

  lines.push('');

  const hasStaged = stagedNew.length + stagedModified.length + stagedDeleted.length > 0;
  const hasUnstaged = unstagedModified.length + unstagedDeleted.length > 0;
  const hasUntracked = untracked.length > 0;

  if (noCommits) {
    lines.push('No commits yet');
    lines.push('');
  }

  if (hasStaged) {
    lines.push('Changes to be committed:');
    lines.push('  (use "git commit" to finalize)');
    for (const f of stagedNew) lines.push(`        new file:   ${f}`);
    for (const f of stagedModified) lines.push(`        modified:   ${f}`);
    for (const f of stagedDeleted) lines.push(`        deleted:    ${f}`);
    lines.push('');
  }

  if (hasUnstaged) {
    lines.push('Changes not staged for commit:');
    lines.push('  (use "git add <file>..." to update what will be committed)');
    for (const f of unstagedModified) lines.push(`        modified:   ${f}`);
    for (const f of unstagedDeleted) lines.push(`        deleted:    ${f}`);
    lines.push('');
  }

  if (hasUntracked) {
    lines.push('Untracked files:');
    lines.push('  (use "git add <file>..." to include in what will be committed)');
    for (const f of untracked) lines.push(`        ${f}`);
    lines.push('');
  }

  if (!hasStaged && !hasUnstaged && !hasUntracked) {
    if (noCommits) {
      lines.push('nothing added to commit (create/copy files and use "git add" to track)');
    } else {
      lines.push('nothing to commit, working tree clean');
    }
  } else if (!hasStaged && !hasUnstaged && hasUntracked) {
    lines.push('nothing added to commit but untracked files present (use "git add" to track)');
  }

  return ok(lines);
}

// ---------------------------------------------------------------------------
// Lignes de suivi upstream
// ---------------------------------------------------------------------------

/**
 * Construit les lignes de suivi upstream à afficher après "On branch X".
 * Retourne un tableau vide si pas d'upstream ou HEAD détaché.
 */
function buildUpstreamLines(repo: Repository): string[] {
  const branch = currentBranch(repo);
  if (!branch) return []; // HEAD détaché

  const upstream = repo.branchUpstream?.[branch];
  if (!upstream) return []; // pas d'upstream configuré

  const upstreamLabel = `'${upstream.remote}/${upstream.branch}'`;

  const remoteHash = repo.refs.remotes?.[upstream.remote]?.[upstream.branch];
  if (!remoteHash) {
    // Gone : la ref distante a disparu
    return [
      `Your branch is based on ${upstreamLabel}, but the upstream branch has been deleted.`,
      `  (use "git branch --unset-upstream" to forget the upstream)`,
    ];
  }

  const localHash = headCommitHash(repo);
  if (!localHash) {
    // Branche sans commit (vide) — pas de ligne de suivi
    return [];
  }

  const { ahead, behind } = computeAheadBehind(repo, localHash, remoteHash);

  if (ahead === 0 && behind === 0) {
    return [`Your branch is up to date with ${upstreamLabel}.`];
  }

  if (ahead > 0 && behind === 0) {
    const s = ahead === 1 ? '' : 's';
    return [
      `Your branch is ahead of ${upstreamLabel} by ${ahead} commit${s}.`,
      `  (use "git push" to publish your local commits)`,
    ];
  }

  if (ahead === 0 && behind > 0) {
    const s = behind === 1 ? '' : 's';
    return [
      `Your branch is behind ${upstreamLabel} by ${behind} commit${s}, and can be fast-forwarded.`,
      `  (use "git pull" to update your local branch)`,
    ];
  }

  // Diverged
  return [
    `Your branch and ${upstreamLabel} have diverged,`,
    `and have ${ahead} and ${behind} different commits each, respectively.`,
    `  (use "git pull" to merge the remote branch into yours)`,
  ];
}

// ---------------------------------------------------------------------------
// Formatage court (-s / --short)
// ---------------------------------------------------------------------------

function buildShortOutput(
  stagedNew: string[],
  stagedModified: string[],
  stagedDeleted: string[],
  unstagedModified: string[],
  unstagedDeleted: string[],
  untracked: string[],
): CommandResult {
  if (
    stagedNew.length === 0 &&
    stagedModified.length === 0 &&
    stagedDeleted.length === 0 &&
    unstagedModified.length === 0 &&
    unstagedDeleted.length === 0 &&
    untracked.length === 0
  ) {
    return fail([], 0);
  }

  const lines: string[] = [];

  // Collecter tous les fichiers avec leur statut
  const statusMap: Record<string, [string, string]> = {};

  for (const f of stagedNew) statusMap[f] = ['A', ' '];
  for (const f of stagedModified) statusMap[f] = ['M', ' '];
  for (const f of stagedDeleted) statusMap[f] = ['D', ' '];
  for (const f of untracked) statusMap[f] = ['?', '?'];

  for (const f of unstagedModified) {
    const existing = statusMap[f];
    if (existing) {
      statusMap[f] = [existing[0], 'M'];
    } else {
      statusMap[f] = [' ', 'M'];
    }
  }

  for (const f of unstagedDeleted) {
    const existing = statusMap[f];
    if (existing) {
      statusMap[f] = [existing[0], 'D'];
    } else {
      statusMap[f] = [' ', 'D'];
    }
  }

  const allFiles = Object.keys(statusMap).sort();
  for (const f of allFiles) {
    const [x, y] = statusMap[f]!;
    lines.push(`${x}${y} ${f}`);
  }

  return ok(lines);
}
