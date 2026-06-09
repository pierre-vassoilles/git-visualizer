/**
 * Classe Repository : gère l'état mutable du dépôt Git en mémoire.
 *
 * Expose les helpers de haut niveau utilisés par les commandes.
 */

import type { Commit, Index, Repository, Tree } from './model';
import { getCommit, getTree, storeBlob, storeCommit, storeTree } from './objectStore';

export const AUTHOR = 'Unnamed <unnamed@example.com>';
export const BASE_TIMESTAMP = 1_000_000_000;
export const VIRTUAL_PATH = './.git/';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Crée un dépôt vierge (non initialisé). */
export function createEmptyRepo(): Repository {
  return {
    objects: {},
    refs: { heads: {}, tags: {} },
    head: { symbolic: true, target: 'refs/heads/main' },
    index: {},
    workingTree: {},
    commitCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers HEAD / branche
// ---------------------------------------------------------------------------

/** Renvoie true si le dépôt a été initialisé. */
export function isInitialized(repo: Repository): boolean {
  // Après init, refs.heads.main existe (valeur "" = pas de commit, ou hash)
  return 'main' in repo.refs.heads;
}

/** Renvoie le nom de la branche courante (HEAD symbolique). */
export function currentBranch(repo: Repository): string | null {
  if (!repo.head.symbolic) return null;
  // "refs/heads/main" → "main"
  const prefix = 'refs/heads/';
  if (repo.head.target.startsWith(prefix)) {
    return repo.head.target.slice(prefix.length);
  }
  return null;
}

/** Renvoie le hash du commit HEAD courant, ou null si aucun commit. */
export function headCommitHash(repo: Repository): string | null {
  if (repo.head.symbolic) {
    const branch = currentBranch(repo);
    if (!branch) return null;
    const hash = repo.refs.heads[branch];
    return hash || null;
  }
  return repo.head.target || null;
}

/** Renvoie le commit HEAD, ou null. */
export function headCommit(repo: Repository): Commit | null {
  const hash = headCommitHash(repo);
  if (!hash) return null;
  return getCommit(repo, hash) ?? null;
}

// ---------------------------------------------------------------------------
// Construction du tree depuis l'index
// ---------------------------------------------------------------------------

/**
 * Construit récursivement les trees depuis le contenu de l'index,
 * stocke les trees dans les objets du dépôt, et renvoie le hash du tree racine.
 */
export function buildTreeFromIndex(repo: Repository, index: Index): string {
  // Décomposer les chemins en arborescence
  // Ex. { "README.md": ..., "src/main.ts": ... }
  // → racine: { README.md: blob, src: tree }
  //   src: { main.ts: blob }

  type DirNode = {
    files: Record<string, string>; // name → blobHash
    dirs: Record<string, DirNode>;
  };

  function makeNode(): DirNode {
    return { files: {}, dirs: {} };
  }

  const root = makeNode();

  for (const [filepath, entry] of Object.entries(index)) {
    const parts = filepath.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!node.dirs[part]) {
        node.dirs[part] = makeNode();
      }
      node = node.dirs[part]!;
    }
    const filename = parts[parts.length - 1]!;
    node.files[filename] = entry.blobHash;
  }

  function buildTree(node: DirNode): string {
    const entries: Tree['entries'] = {};
    for (const [name, blobHash] of Object.entries(node.files)) {
      entries[name] = { mode: '100644', hash: blobHash };
    }
    for (const [name, child] of Object.entries(node.dirs)) {
      const childHash = buildTree(child);
      entries[name] = { mode: '40000', hash: childHash };
    }
    return storeTree(repo, entries);
  }

  return buildTree(root);
}

// ---------------------------------------------------------------------------
// Tree → map chemin→hash (pour comparaison dans status/commit)
// ---------------------------------------------------------------------------

/** Construit une map filepath → blobHash depuis un tree (récursif). */
export function flattenTree(
  repo: Repository,
  treeHash: string,
  prefix = '',
): Record<string, string> {
  const result: Record<string, string> = {};
  const tree = getTree(repo, treeHash);
  if (!tree) return result;

  for (const [name, entry] of Object.entries(tree.entries)) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry.mode === '100644') {
      result[path] = entry.hash;
    } else if (entry.mode === '40000') {
      const sub = flattenTree(repo, entry.hash, path);
      Object.assign(result, sub);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Création d'un commit
// ---------------------------------------------------------------------------

export interface CommitOptions {
  message: string;
}

/**
 * Crée un commit depuis l'état courant de l'index.
 * Met à jour les refs. L'index N'EST PAS vidé : comme dans le vrai Git,
 * il reste un snapshot complet aligné sur l'arbre du nouveau commit (HEAD).
 * Renvoie le hash du commit créé.
 */
export function createCommit(repo: Repository, options: CommitOptions): string {
  const treeHash = buildTreeFromIndex(repo, repo.index);
  const parentHash = headCommitHash(repo);
  const parents = parentHash ? [parentHash] : [];
  const date = BASE_TIMESTAMP + repo.commitCount;

  const commitHash = storeCommit(repo, {
    tree: treeHash,
    parents,
    author: AUTHOR,
    date,
    message: options.message,
  });

  // Mettre à jour la branche
  const branch = currentBranch(repo);
  if (branch !== null) {
    repo.refs.heads[branch] = commitHash;
  }

  // L'index n'est PAS vidé : il reste aligné sur l'arbre du commit (comme Git).

  // Incrémenter le compteur
  repo.commitCount++;

  return commitHash;
}

// ---------------------------------------------------------------------------
// Historique des commits (pour git log)
// ---------------------------------------------------------------------------

/**
 * Renvoie la liste des commits depuis HEAD jusqu'à la racine
 * (du plus récent au plus ancien).
 */
export function getCommitHistory(repo: Repository): Commit[] {
  const history: Commit[] = [];
  const visited = new Set<string>();
  let hash = headCommitHash(repo);

  while (hash) {
    if (visited.has(hash)) break;
    visited.add(hash);
    const commit = getCommit(repo, hash);
    if (!commit) break;
    history.push(commit);
    hash = commit.parents[0] ?? null;
  }

  return history;
}

/**
 * Renvoie la liste des commits avec leurs hashes (du plus récent au plus ancien).
 */
export function getCommitHistoryWithHashes(
  repo: Repository,
): Array<{ hash: string; commit: Commit }> {
  const history: Array<{ hash: string; commit: Commit }> = [];
  const visited = new Set<string>();
  let hash = headCommitHash(repo);

  while (hash) {
    if (visited.has(hash)) break;
    visited.add(hash);
    const commit = getCommit(repo, hash);
    if (!commit) break;
    history.push({ hash, commit });
    hash = commit.parents[0] ?? null;
  }

  return history;
}

// ---------------------------------------------------------------------------
// Helpers storeBlob exposé
// ---------------------------------------------------------------------------

export { storeBlob };
