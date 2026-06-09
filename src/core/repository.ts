/**
 * Classe Repository : gère l'état mutable du dépôt Git en mémoire.
 *
 * Expose les helpers de haut niveau utilisés par les commandes.
 */

import type { Blob, Commit, Index, Repository, Tree, WorkingTree } from './model';
import { getCommit, getTree, hashBlob, storeBlob, storeCommit, storeTree } from './objectStore';

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
    prevBranch: null,
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
// Helpers Phase 2 : HEAD détaché, branches, tags, navigation
// ---------------------------------------------------------------------------

/** Renvoie true si HEAD est en mode détaché (pointe directement sur un commit). */
export function isHeadDetached(repo: Repository): boolean {
  return !repo.head.symbolic;
}

/** Renvoie true si la branche existe dans refs.heads. */
export function branchExists(repo: Repository, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(repo.refs.heads, name);
}

/** Renvoie true si le tag existe dans refs.tags. */
export function tagExists(repo: Repository, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(repo.refs.tags, name);
}

/** Renvoie l'ensemble des branches (branchName → commitHash). */
export function getBranches(repo: Repository): Record<string, string> {
  return repo.refs.heads;
}

/** Renvoie l'ensemble des tags (tagName → commitHash). */
export function getTags(repo: Repository): Record<string, string> {
  return repo.refs.tags;
}

/** Renvoie la valeur de prevBranch. */
export function getPrevBranch(repo: Repository): string | null {
  return repo.prevBranch;
}

/** Met à jour prevBranch. */
export function setPrevBranch(repo: Repository, branchName: string | null): void {
  repo.prevBranch = branchName;
}

/**
 * Résout un committish (nom de branche, nom de tag, hash court ou long)
 * en hash de commit complet, ou null si introuvable.
 *
 * Ordre de résolution :
 * 1. Nom de branche dans refs.heads
 * 2. Nom de tag dans refs.tags
 * 3. Hash exact dans objects (commit complet)
 * 4. Hash court (préfixe) dans objects
 */
export function resolveCommitish(repo: Repository, ref: string): string | null {
  // 1. Branche
  if (branchExists(repo, ref)) {
    const h = repo.refs.heads[ref]!;
    return h || null; // branche vide → null
  }

  // 2. Tag
  if (tagExists(repo, ref)) {
    return repo.refs.tags[ref]!;
  }

  // 3. Hash exact (commit)
  const exactObj = repo.objects[ref];
  if (exactObj && exactObj.type === 'commit') {
    return ref;
  }

  // 4. Hash court (préfixe)
  if (ref.length >= 4) {
    const matches = Object.keys(repo.objects).filter(
      (h) => h.startsWith(ref) && repo.objects[h]?.type === 'commit',
    );
    if (matches.length === 1) {
      return matches[0]!;
    }
  }

  return null;
}

/**
 * Vérifie si on peut basculer vers un commit cible sans perdre de données.
 *
 * Retourne null si ok, ou un tableau de chemins problématiques.
 *
 * La règle : un fichier du working tree a des modifications non stagées
 * (WT ≠ index) ET ce fichier sera différent dans le commit cible.
 * Dans ce cas, le checkout écraserait les modifications.
 */
export function canSwitchWithoutDataLoss(
  repo: Repository,
  targetCommitHash: string | null,
): string[] | null {
  // Construire la map du working tree cible
  const targetFiles: Record<string, string> = {}; // path → blobHash
  if (targetCommitHash) {
    const commit = getCommit(repo, targetCommitHash);
    if (commit) {
      Object.assign(targetFiles, flattenTree(repo, commit.tree));
    }
  }

  const problematic: string[] = [];

  // Vérifier chaque fichier du working tree
  for (const [path, wtEntry] of Object.entries(repo.workingTree)) {
    const indexEntry = repo.index[path];

    // Pas dans l'index → fichier non tracké, pas de risque
    if (!indexEntry) continue;

    // Vérifier si le WT est différent de l'index (modification non stagée)
    const wtHash = hashBlob(wtEntry.content);
    if (wtHash === indexEntry.blobHash) continue; // pas de modif non stagée

    // WT modifié non stagé : vérifier si le target a une version différente
    const targetHash = targetFiles[path];
    if (targetHash === undefined) {
      // Fichier absent du target → sera supprimé, perte potentielle
      problematic.push(path);
    } else if (targetHash !== wtHash) {
      // Target a un contenu différent → serait écrasé
      problematic.push(path);
    }
  }

  return problematic.length > 0 ? problematic.sort() : null;
}

/**
 * Applique l'arbre d'un commit (ou null pour un arbre vide)
 * à l'index et au working tree du dépôt, lors d'une bascule de HEAD.
 *
 * L'index est intégralement remplacé par l'arbre cible (snapshot complet).
 * Le working tree est aligné sur l'arbre cible MAIS les fichiers non trackés
 * (présents dans le working tree, absents de l'index courant) sont PRÉSERVÉS,
 * comme le fait le vrai Git — sauf s'ils entrent en collision avec un fichier
 * de l'arbre cible (ce cas devrait être bloqué en amont par la garde de
 * sécurité avant la bascule).
 */
export function applyTreeToRepo(repo: Repository, commitHash: string | null): void {
  const newFiles: Record<string, string> = {}; // path → blobHash

  if (commitHash) {
    const commit = getCommit(repo, commitHash);
    if (commit) {
      Object.assign(newFiles, flattenTree(repo, commit.tree));
    }
  }

  // Capturer les fichiers non trackés AVANT de réécrire l'index :
  // un fichier présent dans le working tree mais absent de l'index courant.
  const untracked: WorkingTree = {};
  for (const [path, entry] of Object.entries(repo.workingTree)) {
    if (!(path in repo.index)) {
      untracked[path] = entry;
    }
  }

  // Reconstruire l'index depuis l'arbre cible
  repo.index = {};
  for (const [path, blobHash] of Object.entries(newFiles)) {
    const obj = repo.objects[blobHash];
    if (obj && obj.type === 'blob') {
      repo.index[path] = {
        blobHash,
        content: (obj as Blob).content,
        mode: '100644',
      };
    }
  }

  // Reconstruire le working tree depuis l'arbre cible
  repo.workingTree = {};
  for (const [path, blobHash] of Object.entries(newFiles)) {
    const obj = repo.objects[blobHash];
    if (obj && obj.type === 'blob') {
      repo.workingTree[path] = {
        content: (obj as Blob).content,
        mode: '100644',
      };
    }
  }

  // Réintégrer les fichiers non trackés qui n'entrent pas en collision
  // avec l'arbre cible (préservation, fidèle à Git).
  for (const [path, entry] of Object.entries(untracked)) {
    if (!(path in newFiles)) {
      repo.workingTree[path] = entry;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers storeBlob exposé
// ---------------------------------------------------------------------------

export { storeBlob };
