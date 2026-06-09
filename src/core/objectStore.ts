/**
 * Stockage et hachage des objets Git.
 *
 * Gère le calcul déterministe des hashes SHA-1 selon le format canonique Git
 * et le stockage dans le dictionnaire d'objets du dépôt.
 */

import { sha1 } from './sha1';
import type { Blob, Commit, GitObject, Repository, Tree } from './model';

// ---------------------------------------------------------------------------
// Format canonique → string pour hachage
// ---------------------------------------------------------------------------

/**
 * Calcule le hash d'un blob.
 * Format : "blob <len>\0<content>"
 */
export function hashBlob(content: string): string {
  // Encode content length in UTF-8 bytes to match git's byte counting
  const byteLen = new TextEncoder().encode(content).length;
  return sha1(`blob ${byteLen}\0${content}`);
}

/**
 * Calcule le hash d'un tree.
 *
 * Note d'implémentation : Git utilise un format binaire (hash en 20 octets).
 * Ici, comme on n'implémente pas l'encodage binaire byte-exact, on utilise
 * un format canonique lisible déterministe :
 *   Pour chaque entrée triée par nom : "<mode> <name>\0<hash>"
 * Cela garantit le déterminisme sans dépendance binaire.
 */
export function hashTree(entries: Tree['entries']): string {
  const sorted = Object.keys(entries).sort();
  const canonical = sorted
    .map((name) => {
      const entry = entries[name]!;
      return `${entry.mode} ${name}\0${entry.hash}`;
    })
    .join('\n');
  return sha1(`tree\n${canonical}`);
}

/**
 * Calcule le hash d'un commit.
 * Format canonique (identique au format texte de Git) :
 *   "tree <hash>\n"
 *   "parent <hash>\n" (répété pour chaque parent)
 *   "author <author> <date> +0000\n"
 *   "committer <author> <date> +0000\n"
 *   "\n"
 *   "<message>"
 */
export function hashCommit(commit: Omit<Commit, 'type'>): string {
  const lines: string[] = [];
  lines.push(`tree ${commit.tree}`);
  for (const parent of commit.parents) {
    lines.push(`parent ${parent}`);
  }
  lines.push(`author ${commit.author} ${commit.date} +0000`);
  lines.push(`committer ${commit.author} ${commit.date} +0000`);
  lines.push('');
  lines.push(commit.message);
  const canonical = lines.join('\n');
  return sha1(canonical);
}

// ---------------------------------------------------------------------------
// Stockage
// ---------------------------------------------------------------------------

/**
 * Stocke un objet dans le dépôt et renvoie son hash.
 * Idempotent : si l'objet existe déjà, on renvoie simplement son hash.
 */
export function storeBlob(repo: Repository, content: string): string {
  const hash = hashBlob(content);
  if (!repo.objects[hash]) {
    const blob: Blob = { type: 'blob', content };
    repo.objects[hash] = blob;
  }
  return hash;
}

export function storeTree(repo: Repository, entries: Tree['entries']): string {
  const hash = hashTree(entries);
  if (!repo.objects[hash]) {
    const tree: Tree = { type: 'tree', entries };
    repo.objects[hash] = tree;
  }
  return hash;
}

export function storeCommit(repo: Repository, data: Omit<Commit, 'type'>): string {
  const hash = hashCommit(data);
  if (!repo.objects[hash]) {
    const commit: Commit = { type: 'commit', ...data };
    repo.objects[hash] = commit;
  }
  return hash;
}

// ---------------------------------------------------------------------------
// Accesseurs typés
// ---------------------------------------------------------------------------

export function getCommit(repo: Repository, hash: string): Commit | undefined {
  const obj: GitObject | undefined = repo.objects[hash];
  if (obj && obj.type === 'commit') return obj;
  return undefined;
}

export function getTree(repo: Repository, hash: string): Tree | undefined {
  const obj: GitObject | undefined = repo.objects[hash];
  if (obj && obj.type === 'tree') return obj;
  return undefined;
}
