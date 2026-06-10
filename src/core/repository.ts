/**
 * Classe Repository : gère l'état mutable du dépôt Git en mémoire.
 *
 * Expose les helpers de haut niveau utilisés par les commandes.
 */

import type { Blob, Commit, GitObject, Index, IndexEntry, ReflogEntry, RemoteRepository, Repository, Tree, WorkingTree, WorkingTreeEntry } from './model';
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
    refs: { heads: {}, tags: {}, remotes: {} },
    head: { symbolic: true, target: 'refs/heads/main' },
    index: {},
    workingTree: {},
    commitCount: 0,
    prevBranch: null,
    remotes: {},
    branchUpstream: {},
  };
}

// ---------------------------------------------------------------------------
// Helpers HEAD / branche
// ---------------------------------------------------------------------------

/** Renvoie true si le dépôt a été initialisé. */
export function isInitialized(repo: Repository): boolean {
  // Un dépôt vierge (createEmptyRepo) a refs.heads vide et HEAD symbolique sur
  // refs/heads/main (clé absente). Après `git init` la clé `main` existe (""),
  // après `git clone` la branche par défaut existe (pas forcément `main`), et un
  // clone détaché a un HEAD non symbolique pointant un hash réel.
  if (Object.keys(repo.refs.heads).length > 0) return true;
  if (!repo.head.symbolic && repo.head.target !== '') return true;
  return false;
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

/** Noms de refs réservés (pseudo-refs Git), interdits comme noms de branche. */
const RESERVED_REF_NAMES = ['HEAD', 'FETCH_HEAD', 'ORIG_HEAD', 'MERGE_HEAD', 'CHERRY_PICK_HEAD'];

/**
 * Valide un nom de branche selon un sous-ensemble des règles de
 * `git check-ref-format` — autorise les `/` (ex. `feature/login`) mais rejette
 * les formes structurellement invalides.
 *
 * Rejette :
 *  - vide / espaces / caractères de contrôle ;
 *  - commençant par `-` ;
 *  - commençant ou finissant par `/`, ou contenant `//` (composant vide) ;
 *  - un composant commençant par `.` ou finissant par `.lock` ;
 *  - contenant `..`, `@{`, ou l'un de ` ~ ^ : ? * [ \` ;
 *  - finissant par `.` ;
 *  - le nom `@` seul, ou un pseudo-ref réservé (HEAD, …).
 */
export function isValidBranchName(name: string): boolean {
  if (!name || name.trim() === '') return false;
  if (name.startsWith('-')) return false;
  if (name.startsWith('/') || name.endsWith('/')) return false;
  if (name.includes('//')) return false;
  if (name.includes('..')) return false;
  if (name.endsWith('.')) return false;
  if (name.includes('@{')) return false;
  if (name === '@') return false;
  // Espaces, caractères de contrôle et caractères spéciaux Git.
  if (/[\s~^:?*[\\]/.test(name)) return false;
  for (const ch of name) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return false;
  }
  // Validation par composant (séparés par `/`).
  for (const component of name.split('/')) {
    if (component === '') return false;
    if (component.startsWith('.')) return false;
    if (component.endsWith('.lock')) return false;
  }
  if (RESERVED_REF_NAMES.includes(name)) return false;
  return true;
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
 * ou révision ~n / @{n} / @{upstream} / @{u}) en hash de commit complet,
 * ou null si introuvable.
 *
 * Ordre de résolution :
 * 0a. Si l'input est `@{upstream}` / `@{u}` ou `<branch>@{upstream}` / `<branch>@{u}` →
 *     résoudre via branchUpstream puis refs.remotes
 * 0b. Si l'input contient `@{n}` (chiffres), résoudre via le reflog
 * 0c. Si l'input contient `~n`, résoudre la base puis remonter n parents
 * 1. HEAD
 * 2. Nom de branche dans refs.heads
 * 3. Nom de tag dans refs.tags
 * 4. Ref de suivi distant `<remote>/<branch>` dans refs.remotes
 * 5. Hash exact dans objects (commit complet)
 * 6. Hash court (préfixe, min 4 chars) dans objects
 */
export function resolveCommitish(repo: Repository, ref: string): string | null {
  // 0a. Supporter @{upstream} / @{u} / <branch>@{upstream} / <branch>@{u}
  //     Attention : distinguer du @{n} numérique (reflog).
  const upstreamMatch = /^(.*?)@\{(?:upstream|u)\}$/.exec(ref);
  if (upstreamMatch) {
    const branchPrefix = upstreamMatch[1]!;
    // Déterminer la branche locale cible
    let targetBranch: string | null;
    if (branchPrefix === '' || branchPrefix === 'HEAD') {
      targetBranch = currentBranch(repo);
    } else {
      targetBranch = branchPrefix;
    }
    if (!targetBranch) return null;
    const upstream = repo.branchUpstream?.[targetBranch];
    if (!upstream) return null; // pas d'upstream → null (l'appelant gère l'erreur)
    return repo.refs.remotes?.[upstream.remote]?.[upstream.branch] ?? null;
  }

  // 0b. Supporter la notation @{n} pour le reflog : HEAD@{n}, <branch>@{n}
  const atMatch = /^(.+?)@\{(\d+)\}$/.exec(ref);
  if (atMatch) {
    const base = atMatch[1]!;
    const n = parseInt(atMatch[2]!, 10);
    const refName = base === 'HEAD' ? 'HEAD' : `refs/heads/${base}`;
    const entries = repo.reflog?.[refName] ?? [];
    if (n < entries.length) {
      return entries[n]!.newHash;
    }
    return null; // revision not found
  }

  // 0c. Supporter la notation ~n : regex greedy, format <base>~<n>
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

  // 4. Ref de suivi distant : <remote>/<branch>
  //    Tenter de séparer le premier composant comme remote et le reste comme branch.
  if (ref.includes('/')) {
    const slashIdx = ref.indexOf('/');
    const remotePart = ref.slice(0, slashIdx);
    const branchPart = ref.slice(slashIdx + 1);
    const remoteHash = repo.refs.remotes?.[remotePart]?.[branchPart];
    if (remoteHash) {
      return remoteHash;
    }
  }

  // 5. Hash exact (commit)
  const exactObj = repo.objects[ref];
  if (exactObj && exactObj.type === 'commit') {
    return ref;
  }

  // 6. Hash court (préfixe, min 4 chars)
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

// ---------------------------------------------------------------------------
// Phase 5 : helper centralisé de replay de commit (spec 24)
// ---------------------------------------------------------------------------

export interface ReplayCommitOptions {
  /** Commit original à rejouer. */
  origCommit: Commit;
  /** Hash du commit original (pour les marqueurs de conflit). */
  origHash: string;
  /** Hash du nouveau parent (base) sur lequel rejouer. */
  newParentHash: string;
  /** Label pour les marqueurs de conflit (ex: shortHash du commit original). */
  label: string;
}

export interface ReplayCommitResult {
  /** Hash du commit rejoué (créé), ou null si conflit. */
  newHash: string | null;
  /** Fichiers en conflit avec marqueurs (si conflit). */
  conflicts: Record<string, string>;
  /** État à préserver pour continuer après résolution (si conflit). */
  resumeState?: {
    /** Message du commit à créer après résolution. */
    commitMessage: string;
  };
}

export interface ReplayContinueOptions {
  /** Message du commit à créer (du commit original). */
  commitMessage: string;
  /** Hash du nouveau parent. */
  newParentHash: string;
}

/**
 * Rejoue un commit unique au-dessus d'un nouveau parent.
 *
 * Processus :
 * 1. Calcule le diff du commit original (parent → origCommit)
 * 2. Applique le diff sur les fichiers du nouveau parent
 * 3. Si conflit : met à jour index/WT avec marqueurs, retourne conflicts + resumeState
 * 4. Si pas de conflit : crée le commit, met à jour index/WT, retourne newHash
 */
export function replayCommit(
  repo: Repository,
  options: ReplayCommitOptions,
): ReplayCommitResult {
  const { origCommit, origHash: _origHash, newParentHash, label } = options;

  // 1. Calculer le diff du commit original
  const parentHash = origCommit.parents[0] ?? null;
  const parentTreeHash = parentHash
    ? (getCommit(repo, parentHash)?.tree ?? null)
    : null;
  const diff = computeTreeDiff(repo, parentTreeHash, origCommit.tree);

  // 2. Récupérer les fichiers du nouveau parent
  const newParentCommit = getCommit(repo, newParentHash);
  if (!newParentCommit) {
    throw new Error(`replayCommit: parent commit not found: ${newParentHash}`);
  }
  const newParentFiles = getTreeFiles(repo, newParentCommit.tree);
  const resultFiles: Record<string, string> = { ...newParentFiles };
  const conflictFiles: Record<string, string> = {};

  // 3a. Suppressions
  for (const path of Object.keys(diff.deleted)) {
    delete resultFiles[path];
  }

  // 3b. Ajouts
  for (const [path, content] of Object.entries(diff.added)) {
    if (path in resultFiles && resultFiles[path] !== content) {
      conflictFiles[path] = makeConflictMarkers(resultFiles[path]!, content, label);
      resultFiles[path] = conflictFiles[path]!;
    } else {
      resultFiles[path] = content;
    }
  }

  // 3c. Modifications
  for (const [path, { from, to }] of Object.entries(diff.modified)) {
    const current = resultFiles[path];
    if (current === undefined) {
      resultFiles[path] = to;
    } else if (current === from) {
      resultFiles[path] = to;
    } else if (current === to) {
      // Déjà appliqué, ok
    } else {
      conflictFiles[path] = makeConflictMarkers(current, to, label);
      resultFiles[path] = conflictFiles[path]!;
    }
  }

  // 4. Mettre à jour index et WT (toujours, même en cas de conflit)
  repo.index = buildIndexFromFiles(repo, resultFiles);
  repo.workingTree = buildWorkingTreeFromFiles(repo, resultFiles);

  // 5. Gérer les conflits ou créer le commit
  if (Object.keys(conflictFiles).length > 0) {
    return {
      newHash: null,
      conflicts: conflictFiles,
      resumeState: {
        commitMessage: origCommit.message,
      },
    };
  }

  // Pas de conflit : créer le commit
  const treeHash = buildTreeFromIndex(repo, repo.index);
  const newCommitHash = createCommitWithParents(repo, {
    message: origCommit.message,
    treeHash,
    parents: [newParentHash],
  });

  return {
    newHash: newCommitHash,
    conflicts: {},
  };
}

/**
 * Crée le commit après résolution manuelle de conflits.
 * Utilise l'index courant du repo comme source de l'arbre final.
 */
export function replayCommitContinue(
  repo: Repository,
  options: ReplayContinueOptions,
): string {
  const treeHash = buildTreeFromIndex(repo, repo.index);
  return createCommitWithParents(repo, {
    message: options.commitMessage,
    treeHash,
    parents: [options.newParentHash],
  });
}

// ---------------------------------------------------------------------------
// Phase 5 : helpers reflog (spec 27)
// ---------------------------------------------------------------------------

/**
 * Ajoute une entrée dans le reflog d'un ref donné.
 * Le reflog est une liste ordonnée du plus récent (index 0) au plus ancien.
 */
export function addReflogEntry(
  repo: Repository,
  refName: string,
  entry: Omit<ReflogEntry, 'timestamp'>,
): void {
  if (!repo.reflog) {
    repo.reflog = {};
  }
  const entries = repo.reflog[refName] ?? [];
  // Utiliser commitCount comme timestamp déterministe
  const newEntry: ReflogEntry = {
    ...entry,
    timestamp: repo.commitCount,
  };
  // Insérer en tête (le plus récent en premier)
  repo.reflog[refName] = [newEntry, ...entries];
}

/**
 * Ajoute une entrée dans le reflog de HEAD ET dans le reflog de la branche courante
 * (si HEAD est symbolique).
 */
export function addReflogEntryForHead(
  repo: Repository,
  entry: Omit<ReflogEntry, 'timestamp'>,
): void {
  addReflogEntry(repo, 'HEAD', entry);
  const branch = currentBranch(repo);
  if (branch !== null) {
    addReflogEntry(repo, `refs/heads/${branch}`, entry);
  }
}

/**
 * Récupère le reflog d'un ref donné (du plus récent au plus ancien).
 * Retourne [] si aucune entrée.
 */
export function getReflog(repo: Repository, refName: string): ReflogEntry[] {
  return repo.reflog?.[refName] ?? [];
}

// ---------------------------------------------------------------------------
// Phase 5 : helpers stash
// ---------------------------------------------------------------------------

/**
 * Deepcopy d'une entrée de stash (pour éviter les mutations partagées).
 */
export function cloneStashEntry(
  entry: import('./model').StashEntry,
): import('./model').StashEntry {
  return {
    branchName: entry.branchName,
    message: entry.message,
    date: entry.date,
    workingTree: cloneWorkingTree(entry.workingTree),
    index: cloneIndex(entry.index),
    headHash: entry.headHash,
  };
}

// ---------------------------------------------------------------------------
// Phase 7 : helpers remotes
// ---------------------------------------------------------------------------

/**
 * Copie récursivement depuis srcObjects vers dstObjects tous les objets
 * atteignables depuis fromCommitHash (commit → tree → blobs + parents)
 * qui sont absents de dstObjects.
 */
export function copyMissingObjects(
  srcObjects: Record<string, GitObject>,
  dstObjects: Record<string, GitObject>,
  fromCommitHash: string,
): void {
  const visited = new Set<string>();
  const queue: string[] = [fromCommitHash];

  while (queue.length > 0) {
    const hash = queue.shift()!;
    if (visited.has(hash)) continue;
    visited.add(hash);

    const obj = srcObjects[hash];
    if (!obj) continue;

    // Copier l'objet s'il est absent de la destination
    if (!dstObjects[hash]) {
      dstObjects[hash] = obj;
    }

    if (obj.type === 'commit') {
      // Parcourir le tree et les parents
      queue.push(obj.tree);
      for (const parent of obj.parents) {
        queue.push(parent);
      }
    } else if (obj.type === 'tree') {
      // Parcourir les entrées du tree
      for (const entry of Object.values(obj.entries)) {
        queue.push(entry.hash);
      }
    }
    // blob : pas d'enfants
  }
}

/**
 * Détermine la branche par défaut d'un dépôt distant.
 * - HEAD symbolique : extrait le nom depuis "refs/heads/<x>"
 * - HEAD détaché : première branche alphabétiquement, ou null si aucune
 */
export function getDefaultBranch(remote: RemoteRepository): string | null {
  if (remote.head.symbolic) {
    const match = /^refs\/heads\/(.+)$/.exec(remote.head.target);
    return match ? match[1]! : null;
  }
  // HEAD détaché : fallback alphabétique
  const branches = Object.keys(remote.refs.heads).sort();
  return branches.length > 0 ? branches[0]! : null;
}

/**
 * Calcule le nombre de commits en avance (ahead) et en retard (behind)
 * de localHash par rapport à remoteHash.
 *
 * ahead  = commits dans local non accessibles depuis remote (local a avancé)
 * behind = commits dans remote non accessibles depuis local (remote a avancé)
 */
export function computeAheadBehind(
  repo: Repository,
  localHash: string,
  remoteHash: string,
): { ahead: number; behind: number } {
  if (localHash === remoteHash) return { ahead: 0, behind: 0 };

  /** Ensemble des commits accessibles depuis `tip` (lui inclus), via TOUS les parents. */
  function reachable(tip: string): Set<string> {
    const seen = new Set<string>();
    const stack = [tip];
    while (stack.length > 0) {
      const h = stack.pop()!;
      if (seen.has(h)) continue;
      seen.add(h);
      const commit = getCommit(repo, h);
      if (commit) stack.push(...commit.parents);
    }
    return seen;
  }

  // ahead/behind = différence symétrique des ensembles accessibles (sémantique
  // `git rev-list --count remote..local` / `local..remote`), correcte sur tout DAG.
  const localReach = reachable(localHash);
  const remoteReach = reachable(remoteHash);

  let ahead = 0;
  for (const h of localReach) if (!remoteReach.has(h)) ahead++;
  let behind = 0;
  for (const h of remoteReach) if (!localReach.has(h)) behind++;

  return { ahead, behind };
}

/**
 * Valide un nom de remote.
 * Accepte : lettres, chiffres, '.', '_', '-', '/'.
 * Refuse : vide, espaces, ou autres caractères spéciaux.
 */
export function validateRemoteName(name: string): boolean {
  if (!name || name.trim() === '') return false;
  return /^[A-Za-z0-9._/-]+$/.test(name);
}
