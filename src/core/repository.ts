/**
 * Classe Repository : gère l'état mutable du dépôt Git en mémoire.
 *
 * Expose les helpers de haut niveau utilisés par les commandes.
 */

import type {
  Blob,
  Commit,
  GitObject,
  Index,
  IndexEntry,
  ReflogEntry,
  RemoteRepository,
  Repository,
  Tree,
  WorkingTree,
  WorkingTreeEntry,
} from './model';
import { getCommit, getTree, hashBlob, storeBlob, storeCommit, storeTree } from './objectStore';

export const DEFAULT_USER_NAME = 'Author';
export const DEFAULT_USER_EMAIL = 'author@example.com';
/** Auteur par défaut (rétro-compat). Construit depuis la config par `getAuthor`. */
export const AUTHOR = `${DEFAULT_USER_NAME} <${DEFAULT_USER_EMAIL}>`;
export const BASE_TIMESTAMP = 1_000_000_000;
export const VIRTUAL_PATH = './.git/';

/** Config par défaut d'un dépôt neuf (spec 45). */
export function defaultConfig(): Record<string, string> {
  return { 'user.name': DEFAULT_USER_NAME, 'user.email': DEFAULT_USER_EMAIL };
}

/**
 * Auteur d'un commit, construit depuis la config (`user.name`/`user.email`).
 * Entre dans la chaîne de hachage → déterminisme garanti par le rejeu ordonné.
 */
export function getAuthor(repo: Repository): string {
  const name = repo.config?.['user.name'] ?? DEFAULT_USER_NAME;
  const email = repo.config?.['user.email'] ?? DEFAULT_USER_EMAIL;
  return `${name} <${email}>`;
}

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
    config: defaultConfig(),
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

/** Une opération de séquencement en cours (merge/rebase/cherry-pick/revert). */
export type OperationKind = 'merge' | 'rebase' | 'cherry-pick' | 'revert';

/**
 * Renvoie l'opération de séquencement en cours, ou null. Sert à refuser le
 * démarrage d'une nouvelle opération tant qu'une autre n'est pas finalisée ou
 * annulée (comme le vrai git).
 */
export function getOperationInProgress(repo: Repository): OperationKind | null {
  if (repo.merging) return 'merge';
  if (repo.rebasing) return 'rebase';
  if (repo.cherryPicking) return 'cherry-pick';
  if (repo.reverting) return 'revert';
  return null;
}

/**
 * Liste triée des chemins SUIVIS avec des changements non commités : index ≠
 * arbre de HEAD (changements indexés), ou working tree ≠ index / fichier suivi
 * supprimé du working tree (changements non indexés). Les fichiers non suivis
 * (untracked) ne comptent PAS (ils ne bloquent pas une opération chez git, sauf
 * collision — traitée séparément au checkout).
 */
export function listUncommittedPaths(repo: Repository): string[] {
  const paths = new Set<string>();
  const head = headCommit(repo);
  const headFiles = head ? getTreeFiles(repo, head.tree) : {};
  // Indexé vs HEAD.
  for (const p of new Set([...Object.keys(repo.index), ...Object.keys(headFiles)])) {
    if ((repo.index[p]?.content ?? undefined) !== headFiles[p]) paths.add(p);
  }
  // Non indexé : index vs working tree (fichiers suivis).
  for (const [p, entry] of Object.entries(repo.index)) {
    const wt = repo.workingTree[p];
    if (!wt || wt.content !== entry.content) paths.add(p);
  }
  return [...paths].sort();
}

/** Renvoie true si le dépôt a des changements non commités (cf. listUncommittedPaths). */
export function hasUncommittedChanges(repo: Repository): boolean {
  return listUncommittedPaths(repo).length > 0;
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
    author: getAuthor(repo),
    date,
    message: options.message,
  });

  // Mettre à jour la branche courante, ou faire avancer HEAD si détaché (comme
  // le vrai git : committer en HEAD détaché déplace HEAD sur le nouveau commit).
  const branch = currentBranch(repo);
  if (branch !== null) {
    repo.refs.heads[branch] = commitHash;
  } else {
    repo.head = { symbolic: false, target: commitHash };
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

  // 2. Branche — une branche vide ("") est ignorée (traitée comme inexistante)
  //    pour ne pas court-circuiter un tag/hash court homonyme (spec 46).
  if (branchExists(repo, ref)) {
    const h = repo.refs.heads[ref]!;
    if (h) return h;
    // branche vide → tomber sur tag / hash court ci-dessous
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
 * Décision two-tree par chemin lors d'une bascule de HEAD (source → cible) :
 *  - `carry`              : la source et la cible ont le même contenu pour ce
 *    chemin → on conserve l'état local tel quel (modifs stagées/non stagées,
 *    suppressions, fichiers non suivis tous préservés) ;
 *  - `apply`              : la cible diffère et l'état local est « propre » (ou
 *    une suppression non stagée que git restaure) → on aligne index+WT sur la
 *    cible (`blob` undefined = suppression) ;
 *  - `conflict`           : un changement local suivi serait écrasé → refus ;
 *  - `conflict-untracked` : un fichier non suivi entrerait en collision → refus.
 */
type SwitchAction =
  | { kind: 'carry' }
  | { kind: 'apply'; blob: string | undefined }
  | { kind: 'conflict' }
  | { kind: 'conflict-untracked' };

function treeFilesOf(repo: Repository, commitHash: string | null): Record<string, string> {
  if (!commitHash) return {};
  const commit = getCommit(repo, commitHash);
  return commit ? flattenTree(repo, commit.tree) : {};
}

/**
 * Classe chaque chemin pour une bascule `sourceHash → targetHash` selon la
 * sémantique two-tree de git (`git read-tree -m -u` simplifié à notre modèle où
 * l'index est un snapshot complet). Voir {@link SwitchAction}.
 */
function classifySwitch(
  repo: Repository,
  sourceHash: string | null,
  targetHash: string | null,
): Map<string, SwitchAction> {
  const sFiles = treeFilesOf(repo, sourceHash);
  const tFiles = treeFilesOf(repo, targetHash);
  const paths = new Set<string>([
    ...Object.keys(sFiles),
    ...Object.keys(tFiles),
    ...Object.keys(repo.index),
    ...Object.keys(repo.workingTree),
  ]);

  const result = new Map<string, SwitchAction>();
  for (const path of paths) {
    const sBlob = sFiles[path];
    const tBlob = tFiles[path];
    const iBlob = repo.index[path]?.blobHash;
    const wtEntry = repo.workingTree[path];
    const wBlob = wtEntry ? hashBlob(wtEntry.content) : undefined;

    // S === T : rien à appliquer → on conserve l'état local (carry).
    if (sBlob === tBlob) {
      result.set(path, { kind: 'carry' });
      continue;
    }

    // La cible diffère de la source pour ce chemin : le checkout doit l'aligner.
    // Changement indexé (index ≠ source) = précieux.
    if (iBlob !== sBlob) {
      // Déjà indexé sur la cible → pas de perte, on garde (carry).
      result.set(path, iBlob === tBlob ? { kind: 'carry' } : { kind: 'conflict' });
      continue;
    }

    // index === source. État du working tree ?
    if (wBlob === iBlob) {
      // WT propre (== index == source) → on applique la cible.
      result.set(path, { kind: 'apply', blob: tBlob });
      continue;
    }
    if (wBlob === undefined) {
      // Suppression non stagée → git restaure la version cible (pas de refus).
      result.set(path, { kind: 'apply', blob: tBlob });
      continue;
    }
    if (wBlob === tBlob) {
      // Le WT correspond déjà à la cible → application sans perte.
      result.set(path, { kind: 'apply', blob: tBlob });
      continue;
    }
    // Modification non stagée qui diffère de la cible → serait écrasée.
    result.set(path, iBlob === undefined ? { kind: 'conflict-untracked' } : { kind: 'conflict' });
  }
  return result;
}

/** Conflits bloquant une bascule de HEAD, séparés par nature (pour le message). */
export interface SwitchConflicts {
  /** Changements locaux suivis qui seraient écrasés. */
  tracked: string[];
  /** Fichiers non suivis qui seraient écrasés. */
  untracked: string[];
}

/**
 * Vérifie qu'on peut basculer du commit courant (HEAD) vers `targetCommitHash`
 * sans perdre de données, selon la sémantique two-tree (cf. {@link classifySwitch}).
 * Retourne `null` si la bascule est sûre, sinon les chemins en conflit séparés
 * en suivis / non suivis. Doit être appelé AVANT de déplacer HEAD (la source est
 * le HEAD courant).
 */
export function canSwitchWithoutDataLoss(
  repo: Repository,
  targetCommitHash: string | null,
): SwitchConflicts | null {
  const sourceHash = headCommitHash(repo);
  const actions = classifySwitch(repo, sourceHash, targetCommitHash);
  const tracked: string[] = [];
  const untracked: string[] = [];
  for (const [path, action] of actions) {
    if (action.kind === 'conflict') tracked.push(path);
    else if (action.kind === 'conflict-untracked') untracked.push(path);
  }
  if (tracked.length === 0 && untracked.length === 0) return null;
  return { tracked: tracked.sort(), untracked: untracked.sort() };
}

/**
 * Applique une bascule de HEAD `sourceHash → commitHash` à l'index et au working
 * tree selon la sémantique two-tree : les chemins inchangés entre les deux arbres
 * conservent l'état local (modifs stagées/non stagées, suppressions, fichiers non
 * suivis) ; les autres sont alignés sur la cible. À appeler APRÈS avoir vérifié
 * `canSwitchWithoutDataLoss` (les conflits sont alors traités en `apply`/`carry`
 * sans perte, mais le refus a déjà eu lieu côté commande).
 *
 * `sourceHash` par défaut `null` (arbre source vide) reproduit l'ancien
 * comportement « tout réécrire depuis la cible » — utilisé par `git clone` sur un
 * dépôt vierge.
 */
export function applyTreeToRepo(
  repo: Repository,
  commitHash: string | null,
  sourceHash: string | null = null,
): void {
  const actions = classifySwitch(repo, sourceHash, commitHash);
  for (const [path, action] of actions) {
    if (action.kind === 'carry') continue; // état local conservé
    // 'apply' et (par sécurité) les conflits : on aligne sur la cible.
    if (
      action.kind === 'apply' ||
      action.kind === 'conflict' ||
      action.kind === 'conflict-untracked'
    ) {
      const blob = action.kind === 'apply' ? action.blob : treeFilesOf(repo, commitHash)[path];
      if (blob === undefined) {
        delete repo.index[path];
        delete repo.workingTree[path];
      } else {
        const obj = repo.objects[blob];
        if (obj && obj.type === 'blob') {
          const content = (obj as Blob).content;
          repo.index[path] = { blobHash: blob, content, mode: '100644' };
          repo.workingTree[path] = { content, mode: '100644' };
        }
      }
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

/** Collecte tous les ancêtres d'un commit (lui-même inclus). */
function collectAncestors(repo: Repository, start: string): Set<string> {
  const ancestors = new Set<string>();
  const queue: string[] = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (ancestors.has(current)) continue;
    ancestors.add(current);
    const commit = getCommit(repo, current);
    if (!commit) continue;
    for (const parent of commit.parents) queue.push(parent);
  }
  return ancestors;
}

/**
 * Retourne TOUTES les bases de fusion maximales (ancêtres communs non dominés par
 * un autre ancêtre commun). Un seul élément dans le cas linéaire ; plusieurs dans
 * un historique criss-cross. Tri déterministe (hash croissant). Spec 47.
 */
export function findMergeBases(repo: Repository, a: string, b: string): string[] {
  const ancA = collectAncestors(repo, a);
  const ancB = collectAncestors(repo, b);
  const common = [...ancA].filter((h) => ancB.has(h));
  // Maximaux : aucun autre ancêtre commun n'a `c` pour ancêtre (c n'est pas dominé).
  const maximal = common.filter(
    (c) => !common.some((other) => other !== c && isAncestor(repo, c, other)),
  );
  return maximal.sort();
}

/**
 * 3-way merge PUR de tables path→content (pour la base synthétique). Sur conflit,
 * `ours` l'emporte (déterministe, sans marqueurs) — la base synthétique est interne
 * et ne doit jamais contenir de marqueurs.
 */
function threeWayMergeFiles(
  base: Record<string, string>,
  ours: Record<string, string>,
  theirs: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = {};
  const paths = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
  for (const path of paths) {
    const b = base[path];
    const o = ours[path];
    const t = theirs[path];
    if (o === t) {
      if (o !== undefined) merged[path] = o;
    } else if (b === o) {
      if (t !== undefined) merged[path] = t;
    } else if (b === t) {
      if (o !== undefined) merged[path] = o;
    } else {
      // Conflit : ours gagne (déterministe), sinon theirs.
      if (o !== undefined) merged[path] = o;
      else if (t !== undefined) merged[path] = t;
    }
  }
  return merged;
}

/**
 * Calcule la table path→content de la base à utiliser pour fusionner `a` et `b`.
 * - 0 base : table vide (historiques sans ancêtre commun).
 * - 1 base : l'arbre de cette base (= comportement Phase 4).
 * - >1 bases (criss-cross) : **base synthétique** obtenue en fusionnant récursivement
 *   les bases 2 à 2 (stratégie « recursive » simplifiée, spec 47). Limite de
 *   profondeur 5 → fallback sur la 1ʳᵉ base.
 */
export function mergeBaseFiles(
  repo: Repository,
  a: string,
  b: string,
  depth = 0,
): Record<string, string> {
  const bases = findMergeBases(repo, a, b);
  if (bases.length === 0) return {};

  const treeOf = (commitHash: string): Record<string, string> => {
    const c = getCommit(repo, commitHash);
    return c ? getTreeFiles(repo, c.tree) : {};
  };

  if (bases.length === 1 || depth > 5) {
    return treeOf(bases[0]!);
  }

  // Fusion virtuelle des bases 2 à 2 : la base de chaque paire est calculée
  // récursivement, puis on empile les arbres.
  let acc = treeOf(bases[0]!);
  for (let i = 1; i < bases.length; i++) {
    const pairBase = mergeBaseFiles(repo, bases[0]!, bases[i]!, depth + 1);
    acc = threeWayMergeFiles(pairBase, acc, treeOf(bases[i]!));
  }
  return acc;
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
  added: Record<string, string>; // path → content
  /** Fichiers supprimés dans 'to' par rapport à 'from'. */
  deleted: Record<string, string>; // path → content (de 'from')
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

// ---------------------------------------------------------------------------
// Résolution de conflits (spec 50) — helpers PURS pour l'éditeur 3-way
// ---------------------------------------------------------------------------

/** Une section de conflit extraite d'un fichier (versions ours/theirs). */
export interface ConflictSection {
  ours: string;
  theirs: string;
}

/** true si le contenu contient au moins un marqueur de conflit `<<<<<<<`. */
export function hasConflictMarkers(content: string): boolean {
  return content.includes('<<<<<<<');
}

/**
 * Parse un contenu contenant des marqueurs de conflit Git
 * (`<<<<<<< ... ======= ... >>>>>>>`) et retourne les sections ours/theirs.
 * Le contenu hors conflit (avant `<<<<<<<` / après `>>>>>>>`) est ignoré.
 * Retourne `[]` si aucun conflit. Pur, testable headless.
 */
export function parseConflictContent(content: string): ConflictSection[] {
  const lines = content.split('\n');
  const sections: ConflictSection[] = [];
  let currentOurs = '';
  let currentTheirs = '';
  let inConflict = false;
  let inOurs = false;

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      inConflict = true;
      inOurs = true;
      currentOurs = '';
      currentTheirs = '';
      continue;
    }
    if (inConflict && line.startsWith('=======')) {
      inOurs = false;
      continue;
    }
    if (inConflict && line.startsWith('>>>>>>>')) {
      inConflict = false;
      sections.push({
        ours: currentOurs.replace(/\n$/, ''),
        theirs: currentTheirs.replace(/\n$/, ''),
      });
      continue;
    }
    if (inConflict) {
      if (inOurs) currentOurs += line + '\n';
      else currentTheirs += line + '\n';
    }
  }

  return sections;
}

/**
 * Construit le contenu résolu d'une section de conflit selon le choix.
 *  - 'ours'   → version locale
 *  - 'theirs' → version distante
 *  - 'both'   → ours puis theirs (concaténées par un saut de ligne)
 *  - 'manual' → contenu fourni par l'utilisateur
 * Pur, testable headless.
 */
export function buildResolvedContent(
  ours: string,
  theirs: string,
  choice: 'ours' | 'theirs' | 'both' | 'manual',
  manualContent?: string,
): string {
  switch (choice) {
    case 'ours':
      return ours;
    case 'theirs':
      return theirs;
    case 'both':
      return `${ours}\n${theirs}`;
    case 'manual':
      return manualContent ?? '';
  }
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
    author: getAuthor(repo),
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
export function buildIndexFromFiles(repo: Repository, files: Record<string, string>): Index {
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
  /** Hash du commit rejoué (créé), ou null si conflit OU résultat vide. */
  newHash: string | null;
  /** Fichiers en conflit avec marqueurs (si conflit). */
  conflicts: Record<string, string>;
  /**
   * true si le replay est VIDE (l'arbre résultant est identique à celui du
   * nouveau parent : changements déjà présents en amont). Aucun commit n'est
   * créé. Le rebase saute ce commit ; le cherry-pick s'arrête (« now empty »).
   */
  empty?: boolean;
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
export function replayCommit(repo: Repository, options: ReplayCommitOptions): ReplayCommitResult {
  const { origCommit, origHash: _origHash, newParentHash, label } = options;

  // 1. Calculer le diff du commit original
  const parentHash = origCommit.parents[0] ?? null;
  const parentTreeHash = parentHash ? (getCommit(repo, parentHash)?.tree ?? null) : null;
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

  // Pas de conflit : si l'arbre résultant est identique à celui du nouveau
  // parent, le commit rejoué serait vide (rien à appliquer) → on ne crée rien.
  const treeHash = buildTreeFromIndex(repo, repo.index);
  if (treeHash === newParentCommit.tree) {
    return { newHash: null, conflicts: {}, empty: true };
  }

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
export function replayCommitContinue(repo: Repository, options: ReplayContinueOptions): string {
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
export function cloneStashEntry(entry: import('./model').StashEntry): import('./model').StashEntry {
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
