/**
 * Modèle de données du dépôt Git en mémoire.
 * Conforme à la spec Phase 1 (00-model.md).
 */

// ---------------------------------------------------------------------------
// Objets Git (immuables)
// ---------------------------------------------------------------------------

export interface Blob {
  readonly type: 'blob';
  readonly content: string;
}

export interface TreeEntry {
  readonly mode: '100644' | '40000';
  readonly hash: string;
}

export interface Tree {
  readonly type: 'tree';
  readonly entries: Record<string, TreeEntry>;
}

export interface Commit {
  readonly type: 'commit';
  readonly tree: string;
  readonly parents: string[];
  readonly author: string;
  readonly date: number;
  readonly message: string;
}

export type GitObject = Blob | Tree | Commit;

// ---------------------------------------------------------------------------
// Références
// ---------------------------------------------------------------------------

export interface Head {
  /** true → HEAD pointe vers une branche (refs/heads/X) ; false → HEAD détaché */
  readonly symbolic: boolean;
  /** "refs/heads/main" en mode symbolique, ou hash direct si détaché */
  readonly target: string;
}

// ---------------------------------------------------------------------------
// Index (staging area)
// ---------------------------------------------------------------------------

export interface IndexEntry {
  readonly blobHash: string;
  readonly content: string;
  readonly mode: '100644' | '100755';
}

export type Index = Record<string, IndexEntry>;

// ---------------------------------------------------------------------------
// Working Tree
// ---------------------------------------------------------------------------

export interface WorkingTreeEntry {
  readonly content: string;
  readonly mode: '100644' | '100755';
}

export type WorkingTree = Record<string, WorkingTreeEntry>;

// ---------------------------------------------------------------------------
// Dépôt complet
// ---------------------------------------------------------------------------

/** État d'un merge en cours (conflits non résolus). */
export interface MergingState {
  /** Nom de la branche en train d'être fusionnée. */
  branchName: string;
  /** Hash de l'ancêtre commun (merge-base). */
  baseHash: string;
  /** Hash du tip de la branche en cours de fusion. */
  branchTipHash: string;
  /** Hash HEAD au moment du début du merge (pour --abort). */
  headHashBeforeMerge: string;
  /** Snapshot de l'index avant le merge (pour --abort). */
  indexBeforeMerge: Index;
  /** Snapshot du working tree avant le merge (pour --abort). */
  workingTreeBeforeMerge: WorkingTree;
  /** Parents du commit de merge à créer [headHash, branchTipHash]. */
  mergeParents: [string, string];
}

/** État d'un revert en cours (conflits non résolus). */
export interface RevertingState {
  /** Hash du commit en train d'être reverté. */
  commitHash: string;
  /** Message par défaut du commit de revert. */
  defaultMessage: string;
  /** Hash HEAD avant le revert (pour --abort). */
  headHashBeforeRevert: string;
  /** Snapshot de l'index avant le revert (pour --abort). */
  indexBeforeRevert: Index;
  /** Snapshot du working tree avant le revert (pour --abort). */
  workingTreeBeforeRevert: WorkingTree;
}

/** État d'un cherry-pick en cours (conflits non résolus). */
export interface CherryPickingState {
  /** Hash du commit en train d'être cherry-pické. */
  commitHash: string;
  /** Message du commit original (à réutiliser). */
  originalMessage: string;
  /** Hash HEAD avant le cherry-pick (pour --abort). */
  headHashBeforePick: string;
  /** Snapshot de l'index avant le cherry-pick (pour --abort). */
  indexBeforePick: Index;
  /** Snapshot du working tree avant le cherry-pick (pour --abort). */
  workingTreeBeforePick: WorkingTree;
}

// ---------------------------------------------------------------------------
// Phase 5 : Rebase interactif
// ---------------------------------------------------------------------------

/** Un item de la todo list du rebase interactif. */
export interface TodoItem {
  /** Action à appliquer sur ce commit. */
  action: 'pick' | 'reword' | 'squash' | 'fixup' | 'drop' | 'edit';
  /** Hash du commit original. */
  commitHash: string;
  /** Message du commit (éditable pour reword). */
  message: string;
}

/** État d'un rebase en cours. */
export interface RebasingState {
  /** Hash de la base du rebase. */
  base: string;
  /** Commits restant à rejouer (hashes originaux, du plus ancien au plus récent). */
  toReplay: string[];
  /** Hashes des nouveaux commits déjà rejoués. */
  replayed: string[];
  /** Hash HEAD (branche) avant le rebase (pour --abort). */
  headHashBeforeRebase: string;
  /** Nom de branche avant le rebase (null si HEAD détaché). */
  branchBeforeRebase: string | null;
  /** Snapshot de l'index avant le rebase (pour --abort). */
  indexBeforeRebase: Index;
  /** Snapshot du working tree avant le rebase (pour --abort). */
  workingTreeBeforeRebase: WorkingTree;
  /** Message du commit courant en cours de replay (pour --continue). */
  currentCommitMessage: string;
  /** État du rebase interactif (Phase 5). */
  interactive?: {
    /** true si en attente d'édition de la todo par l'utilisateur. */
    awaitingTodoEdit: boolean;
    /** Todo list (initiale ou en cours d'exécution). */
    todoList: TodoItem[];
    /** Index du commit en cours de traitement (-1 si en attente). */
    currentIndex: number;
    /**
     * Message combiné (squash/fixup) à utiliser lors de la continuation après conflit.
     * Présent uniquement quand le conflit s'est produit sur une marche squash/fixup.
     * Utilisé par --continue pour reconstruire le commit squashé en remplacement du précédent.
     */
    pendingSquashMessage?: string;
  };
}

// ---------------------------------------------------------------------------
// Phase 5 : Reflog
// ---------------------------------------------------------------------------

/** Une entrée du reflog (journal des mouvements de HEAD/refs). */
export interface ReflogEntry {
  /** Hash avant le mouvement (vide pour création). */
  oldHash: string;
  /** Hash après le mouvement. */
  newHash: string;
  /** Type d'action : commit, checkout, reset, merge, rebase, cherry-pick, revert, etc. */
  action: string;
  /** Description additionnelle. */
  description: string;
  /** Timestamp de l'opération. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Phase 5 : Stash
// ---------------------------------------------------------------------------

/** Une entrée de la pile de stash. */
export interface StashEntry {
  /** Branche d'où provient le stash (null si HEAD détaché). */
  branchName: string | null;
  /** Message optionnel (`git stash push -m "..."`). */
  message: string;
  /** Timestamp déterministe (commitCount au moment du stash). */
  date: number;
  /** Snapshot du working tree au moment du stash. */
  workingTree: WorkingTree;
  /** Snapshot de l'index au moment du stash. */
  index: Index;
  /** Hash de HEAD au moment du stash. */
  headHash: string;
}

export interface Repository {
  objects: Record<string, GitObject>;
  refs: {
    heads: Record<string, string>; // branchName → commitHash (or "" for empty branch)
    tags: Record<string, string>;  // tagName → commitHash
  };
  head: Head;
  index: Index;
  workingTree: WorkingTree;
  /** Nombre de commits créés — utilisé pour le timestamp déterministe */
  commitCount: number;
  /** Nom de la branche précédente (pour git checkout -) */
  prevBranch: string | null;
  /** État de merge en cours, si applicable. */
  merging?: MergingState;
  /** État de revert en cours, si applicable. */
  reverting?: RevertingState;
  /** État de cherry-pick en cours, si applicable. */
  cherryPicking?: CherryPickingState;
  /** État de rebase en cours, si applicable. */
  rebasing?: RebasingState;
  /** Pile de stash (Phase 5). Du plus récent (index 0) au plus ancien. */
  stashStack?: StashEntry[];
  /** Reflog par ref (Phase 5). Map ref → liste d'entrées (du plus récent au plus ancien). */
  reflog?: Record<string, ReflogEntry[]>;
}
