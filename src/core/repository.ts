/**
 * Classe Repository : gère l'état mutable du dépôt Git en mémoire.
 *
 * Expose les helpers de haut niveau utilisés par les commandes.
 */

import type { Blob, Commit, Index, IndexEntry, Repository, Tree, WorkingTree, WorkingTreeEntry } from './model';
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
 * Résout un committish (nom de branche, nom de tag, hash court ou long,
 * ou révision ~n) en hash de commit complet, ou null si introuvable.
 *
 * Ordre de résolution :
 * 0. Si l'input contient `~n`, résoudre la base puis remonter n parents
 * 1. HEAD
 * 2. Nom de branche dans refs.heads
 * 3. Nom de tag dans refs.tags
 * 4. Hash exact dans objects (commit complet)
 * 5. Hash court (préfixe, min 4 chars) dans objects
 */
export function resolveCommitish(repo: Repository, ref: string): string | null {
  // 0. Supporter la notation ~n : regex greedy, format <base>~<n>
  const tildeMatch = /^(.+?)~(\d+)$/.exec(ref);
  if (tildeMatch) {
    const base = tildeMatch[1]!;
    const n = parseInt(tildeMatch[2]!, 10);
    // Résoudre la base récursivement
    const baseHash = resolveCommitish(repo, base);
    if (!baseHash) return null;
    // Remonter n générations via le 1er parent
    let current = baseHash;
    for (let i = 0; i < n; i++) {
      const commit = getCommit(repo, current);
      if (!commit || commit.parents.length === 0) return null;
      current = commit.parents[0]!;
    }
    return current;
  }

  // 1. HEAD
  if (ref === 'HEAD') {
    return headCommitHash(repo);
  }

  // 2. Branche
  if (branchExists(repo, ref)) {
    const h = repo.refs.heads[ref]!;
    return h || null; // branche vide → null
  }

  // 3. Tag
  if (tagExists(repo, ref)) {
    return repo.refs.tags[ref]!;
  }

  // 4. Hash exact (commit)
  const exactObj = repo.objects[ref];
  if (exactObj && exactObj.type === 'commit') {
    return ref;
  }

  // 5. Hash court (préfixe, min 4 chars)
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

// ---------------------------------------------------------------------------
// Phase 4 : helpers isAncestor, mergeBase, buildIndexFromTree, tree diff
// ---------------------------------------------------------------------------

/**
 * Retourne true si `a` est un ancêtre de `b` dans le DAG (ou si a === b).
 * Algorithme BFS depuis `b` en remontant les parents.
 */
export function isAncestor(repo: Repository, a: string, b: string): boolean {
  if (a === b) return true;
  const visited = new Set<string>();
  const queue: string[] = [b];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    if (current === a) return true;

    const commit = getCommit(repo, current);
    if (!commit) continue;
    for (const parent of commit.parents) {
      if (!visited.has(parent)) {
        queue.push(parent);
      }
    }
  }

  return false;
}

/**
 * Trouve l'ancêtre commun le plus récent (LCA) de deux commits a et b.
 * Retourne null si pas d'ancêtre commun.
 *
 * Algorithme : BFS simultanée depuis a et b.
 * Plus simple : collecter tous les ancêtres de a, puis parcourir ancêtres de b BFS
 * (plus proche = trouvé en premier = ancêtre commun le plus récent).
 */
export function mergeBase(repo: Repository, a: string, b: string): string | null {
  // Collecter tous les ancêtres de a (incluant a lui-même)
  const ancestorsOfA = new Set<string>();
  const queueA: string[] = [a];
  while (queueA.length > 0) {
    const current = queueA.shift()!;
    if (ancestorsOfA.has(current)) continue;
    ancestorsOfA.add(current);
    const commit = getCommit(repo, current);
    if (!commit) continue;
    for (const parent of commit.parents) {
      queueA.push(parent);
    }
  }

  // BFS depuis b, retourner le premier commit commun trouvé
  const visitedB = new Set<string>();
  const queueB: string[] = [b];
  while (queueB.length > 0) {
    const current = queueB.shift()!;
    if (visitedB.has(current)) continue;
    visitedB.add(current);

    if (ancestorsOfA.has(current)) {
      return current;
    }

    const commit = getCommit(repo, current);
    if (!commit) continue;
    for (const parent of commit.parents) {
      queueB.push(parent);
    }
  }

  return null;
}

/**
 * Construit un Index à partir d'un hash de tree (inverse de buildTreeFromIndex).
 * Utilisé par reset --mixed/--hard pour réinitialiser l'index.
 */
export function buildIndexFromTree(repo: Repository, treeHash: string): Index {
  const files = flattenTree(repo, treeHash);
  const index: Index = {};
  for (const [path, blobHash] of Object.entries(files)) {
    const obj = repo.objects[blobHash];
    if (obj && obj.type === 'blob') {
      index[path] = {
        blobHash,
        content: (obj as Blob).content,
        mode: '100644',
      };
    }
  }
  return index;
}

/**
 * Construit un WorkingTree à partir d'un hash de tree.
 * Utilisé par reset --hard.
 */
export function buildWorkingTreeFromTree(repo: Repository, treeHash: string): WorkingTree {
  const files = flattenTree(repo, treeHash);
  const wt: WorkingTree = {};
  for (const [path, blobHash] of Object.entries(files)) {
    const obj = repo.objects[blobHash];
    if (obj && obj.type === 'blob') {
      wt[path] = {
        content: (obj as Blob).content,
        mode: '100644',
      };
    }
  }
  return wt;
}

/**
 * Représente une différence entre deux arbres de commits.
 */
export interface TreeDiff {
  /** Fichiers ajoutés dans 'to' par rapport à 'from'. */
  added: Record<string, string>;    // path → content
  /** Fichiers supprimés dans 'to' par rapport à 'from'. */
  deleted: Record<string, string>;  // path → content (de 'from')
  /** Fichiers modifiés (présents dans les deux, contenu différent). */
  modified: Record<string, { from: string; to: string }>;
}

/**
 * Calcule la différence entre deux arbres (fromTreeHash → toTreeHash).
 * Utilisé par revert et cherry-pick pour déterminer les changements à appliquer.
 */
export function computeTreeDiff(
  repo: Repository,
  fromTreeHash: string | null,
  toTreeHash: string | null,
): TreeDiff {
  const fromFiles = fromTreeHash ? flattenTree(repo, fromTreeHash) : {};
  const toFiles = toTreeHash ? flattenTree(repo, toTreeHash) : {};

  const added: Record<string, string> = {};
  const deleted: Record<string, string> = {};
  const modified: Record<string, { from: string; to: string }> = {};

  // Fichiers dans 'to' mais pas dans 'from' → ajoutés
  // Fichiers dans les deux → comparaison
  for (const [path, toBlobHash] of Object.entries(toFiles)) {
    const fromBlobHash = fromFiles[path];
    if (!fromBlobHash) {
      // Ajouté
      const obj = repo.objects[toBlobHash];
      if (obj && obj.type === 'blob') {
        added[path] = (obj as Blob).content;
      }
    } else if (fromBlobHash !== toBlobHash) {
      // Modifié
      const fromObj = repo.objects[fromBlobHash];
      const toObj = repo.objects[toBlobHash];
      if (fromObj && fromObj.type === 'blob' && toObj && toObj.type === 'blob') {
        modified[path] = {
          from: (fromObj as Blob).content,
          to: (toObj as Blob).content,
        };
      }
    }
    // Identiques : pas de diff
  }

  // Fichiers dans 'from' mais pas dans 'to' → supprimés
  for (const [path, fromBlobHash] of Object.entries(fromFiles)) {
    if (!(path in toFiles)) {
      const obj = repo.objects[fromBlobHash];
      if (obj && obj.type === 'blob') {
        deleted[path] = (obj as Blob).content;
      }
    }
  }

  return { added, deleted, modified };
}

/**
 * Résultat d'une tentative d'application d'un diff sur un arbre courant.
 */
export interface ApplyDiffResult {
  /** Map path → content des fichiers dans l'état résultant (sans conflits). */
  files: Record<string, string>;
  /** Fichiers en conflit avec marqueurs. */
  conflicts: Record<string, string>;
}

/**
 * Applique un diff (changements de 'from' → 'to') au-dessus d'un arbre courant.
 * Utilisé par cherry-pick, revert et rebase.
 *
 * currentFiles : état actuel (HEAD ou base du rebase), path → content
 * diff : changements à appliquer
 * contextLabel : label pour les marqueurs de conflit (ex: "feature", "HEAD~1", ...)
 *
 * Retourne les fichiers résultants et les conflits détectés.
 */
export function applyDiff(
  currentFiles: Record<string, string>,
  diff: TreeDiff,
  _contextLabel: string,
): ApplyDiffResult {
  const files: Record<string, string> = { ...currentFiles };
  const conflicts: Record<string, string> = {};

  // Ajouts : ajouter le fichier si absent, conflit si présent avec contenu différent
  for (const [path, content] of Object.entries(diff.added)) {
    if (path in files) {
      if (files[path] !== content) {
        // Conflit : fichier existant vs ajout
        conflicts[path] = content;
      }
      // Si même contenu : pas de conflit, déjà là
    } else {
      files[path] = content;
    }
  }

  // Suppressions : supprimer le fichier
  for (const path of Object.keys(diff.deleted)) {
    delete files[path];
  }

  // Modifications
  for (const [path, { from, to }] of Object.entries(diff.modified)) {
    const current = files[path];
    if (current === undefined) {
      // Fichier absent dans current mais modifié dans diff → appliquer (file was deleted locally)
      // Appliquer la version 'to' (le changement cible)
      files[path] = to;
    } else if (current === from) {
      // Pas de modification locale, appliquer le changement
      files[path] = to;
    } else if (current === to) {
      // Déjà appliqué, rien à faire
    } else {
      // Conflit : le fichier a été modifié localement ET dans le diff
      conflicts[path] = path; // marquer comme conflit
      // Garder le fichier local (les marqueurs seront écrits par l'appelant)
    }
  }

  return { files, conflicts };
}

/**
 * Crée les marqueurs de conflit pour un fichier.
 * Format Git standard : <<<<<<< HEAD\n<ours>\n=======\n<theirs>\n>>>>>>> <label>
 */
export function makeConflictMarkers(ours: string, theirs: string, label: string): string {
  return `<<<<<<< HEAD\n${ours}\n=======\n${theirs}\n>>>>>>> ${label}`;
}

/**
 * Identifie les commits à rejouer lors d'un rebase.
 * Retourne les commits accessibles depuis HEAD mais pas depuis base,
 * triés du plus ancien au plus récent (pour rejouer dans l'ordre).
 */
export function getCommitsToReplay(
  repo: Repository,
  headHash: string,
  baseHash: string,
): Array<{ hash: string; commit: Commit }> {
  // Collecter tous les commits accessibles depuis base
  const baseAncestors = new Set<string>();
  const queue: string[] = [baseHash];
  while (queue.length > 0) {
    const h = queue.shift()!;
    if (baseAncestors.has(h)) continue;
    baseAncestors.add(h);
    const c = getCommit(repo, h);
    if (!c) continue;
    for (const p of c.parents) queue.push(p);
  }

  // Collecter les commits depuis HEAD jusqu'au merge-base, en excluant ceux déjà dans base
  const toReplay: Array<{ hash: string; commit: Commit }> = [];
  const visited = new Set<string>();
  const headQueue: string[] = [headHash];

  while (headQueue.length > 0) {
    const h = headQueue.shift()!;
    if (visited.has(h)) continue;
    visited.add(h);
    if (baseAncestors.has(h)) continue; // ancêtre de base → ne pas rejouer

    const c = getCommit(repo, h);
    if (!c) continue;
    toReplay.push({ hash: h, commit: c });
    // Suivre uniquement le premier parent (pas les branches de merge)
    if (c.parents.length > 0) {
      headQueue.push(c.parents[0]!);
    }
  }

  // Inverser pour avoir l'ordre chronologique (du plus ancien au plus récent)
  toReplay.reverse();
  return toReplay;
}

/**
 * Crée un commit de merge (ou normal) avec des parents explicites.
 * Plus flexible que createCommit (qui ne gère qu'un seul parent = HEAD).
 */
export function createCommitWithParents(
  repo: Repository,
  options: {
    message: string;
    treeHash: string;
    parents: string[];
  },
): string {
  const date = BASE_TIMESTAMP + repo.commitCount;

  const commitHash = storeCommit(repo, {
    tree: options.treeHash,
    parents: options.parents,
    author: AUTHOR,
    date,
    message: options.message,
  });

  // Mettre à jour la branche courante ou HEAD détaché
  const branch = currentBranch(repo);
  if (branch !== null) {
    repo.refs.heads[branch] = commitHash;
  } else {
    // HEAD détaché : mettre à jour target directement
    repo.head = { symbolic: false, target: commitHash };
  }

  repo.commitCount++;
  return commitHash;
}

/**
 * Construit un WorkingTree depuis un map path → content.
 */
export function buildWorkingTreeFromFiles(
  _repo: Repository,
  files: Record<string, string>,
): WorkingTree {
  const wt: WorkingTree = {};
  for (const [path, content] of Object.entries(files)) {
    wt[path] = { content, mode: '100644' };
  }
  return wt;
}

/**
 * Construit un Index depuis un map path → content.
 * Stocke les blobs dans repo.objects.
 */
export function buildIndexFromFiles(
  repo: Repository,
  files: Record<string, string>,
): Index {
  const index: Index = {};
  for (const [path, content] of Object.entries(files)) {
    const blobHash = storeBlob(repo, content);
    index[path] = { blobHash, content, mode: '100644' };
  }
  return index;
}

/**
 * Retourne les contenus (path → content) des fichiers dans un arbre de commit.
 */
export function getTreeFiles(repo: Repository, treeHash: string): Record<string, string> {
  const blobHashes = flattenTree(repo, treeHash);
  const files: Record<string, string> = {};
  for (const [path, blobHash] of Object.entries(blobHashes)) {
    const obj = repo.objects[blobHash];
    if (obj && obj.type === 'blob') {
      files[path] = (obj as Blob).content;
    }
  }
  return files;
}

/**
 * Retourne les contenus du working tree courant (path → content).
 */
export function getCurrentFiles(repo: Repository): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [path, entry] of Object.entries(repo.workingTree)) {
    files[path] = entry.content;
  }
  return files;
}

/**
 * Deepcopy d'un Index (pour sauvegarder l'état avant une opération).
 */
export function cloneIndex(index: Index): Index {
  const clone: Index = {};
  for (const [path, entry] of Object.entries(index)) {
    clone[path] = { ...entry } as IndexEntry;
  }
  return clone;
}

/**
 * Deepcopy d'un WorkingTree (pour sauvegarder l'état avant une opération).
 */
export function cloneWorkingTree(wt: WorkingTree): WorkingTree {
  const clone: WorkingTree = {};
  for (const [path, entry] of Object.entries(wt)) {
    clone[path] = { ...entry } as WorkingTreeEntry;
  }
  return clone;
}

/**
 * Applique un map de fichiers (path → content) à l'index et au working tree.
 * Stocke les blobs dans repo.objects.
 */
export function applyFilesToRepo(repo: Repository, files: Record<string, string>): void {
  repo.index = buildIndexFromFiles(repo, files);
  repo.workingTree = buildWorkingTreeFromFiles(repo, files);
}
