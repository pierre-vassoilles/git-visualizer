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
}
