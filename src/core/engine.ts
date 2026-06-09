import { ok, type CommandResult } from './types';
import type { Repository } from './model';
import { createEmptyRepo, currentBranch, flattenTree, getCommitHistoryWithHashes, headCommitHash } from './repository';
import { hashBlob } from './objectStore';
import { dispatch } from './parser';
import { shortHash } from './sha1';

// ---------------------------------------------------------------------------
// Type du snapshot (consommé par le graphe en phase 3)
// ---------------------------------------------------------------------------

/** Entrée d'un commit dans le snapshot. */
export interface SnapshotCommit {
  /** Hash complet SHA-1 (40 caractères). */
  readonly hash: string;
  /** Hash court (7 caractères). */
  readonly shortHash: string;
  /** Message du commit. */
  readonly message: string;
  /** Hashes des parents (tableau vide pour le commit racine). */
  readonly parents: string[];
  /**
   * Noms des branches dont le tip pointe directement sur ce commit.
   * Plusieurs branches (et plus tard des tags) peuvent décorer un même commit ;
   * tableau vide si aucune. Utilisé par le graphe (phase 3) pour les labels de refs.
   */
  readonly branches: string[];
}

/** Statut d'un fichier dans le working tree selon le snapshot. */
export type FileStatus = 'clean' | 'modified' | 'untracked' | 'staged' | 'deleted';

/** Entrée du working tree dans le snapshot. */
export interface SnapshotFile {
  readonly path: string;
  readonly status: FileStatus;
}

/** Snapshot sérialisable et immuable de l'état du dépôt. */
export interface RepoSnapshot {
  /** Indique si le dépôt a été initialisé. */
  readonly initialized: boolean;
  /**
   * Map branche → hash de commit (hash vide "" si la branche n'a pas encore de commit).
   */
  readonly branches: Record<string, string>;
  /**
   * HEAD courant.
   * - `{ type: "branch", name: "main" }` en mode symbolique
   * - `{ type: "detached", hash: "abc123..." }` si HEAD détaché
   */
  readonly head:
    | { readonly type: 'branch'; readonly name: string }
    | { readonly type: 'detached'; readonly hash: string };
  /**
   * Liste des commits accessibles depuis HEAD, du plus récent au plus ancien.
   */
  readonly commits: SnapshotCommit[];
  /**
   * Chemins présents dans l'index (staging area).
   */
  readonly indexPaths: string[];
  /**
   * Fichiers du working tree avec leur statut calculé.
   */
  readonly files: SnapshotFile[];
}

// ---------------------------------------------------------------------------
// Moteur Git
// ---------------------------------------------------------------------------

/**
 * Moteur Git Phase 1.
 *
 * API publique stable :
 *   execute(input: string): CommandResult
 *   snapshot(): RepoSnapshot
 */
export class GitEngine {
  private readonly repo: Repository = createEmptyRepo();

  /** Exécute une ligne de commande brute et renvoie un résultat structuré. */
  execute(input: string): CommandResult {
    const line = input.trim();
    if (line === '') {
      return ok();
    }
    return dispatch(this.repo, line);
  }

  /**
   * Renvoie un snapshot sérialisable et immuable de l'état courant du dépôt.
   * Appelé après chaque execute() par le store pour mettre à jour le graphe.
   */
  snapshot(): RepoSnapshot {
    const repo = this.repo;
    const initialized = 'main' in repo.refs.heads;

    // Branches
    const branches: Record<string, string> = {};
    for (const [name, hash] of Object.entries(repo.refs.heads)) {
      branches[name] = hash;
    }

    // HEAD
    const headState: RepoSnapshot['head'] = repo.head.symbolic
      ? { type: 'branch', name: currentBranch(repo) ?? 'main' }
      : { type: 'detached', hash: repo.head.target };

    // Commits
    const history = getCommitHistoryWithHashes(repo);

    // Map hash → branches dont le tip est ce commit (plusieurs possibles).
    const hashToBranches: Record<string, string[]> = {};
    for (const [name, hash] of Object.entries(repo.refs.heads)) {
      if (hash) (hashToBranches[hash] ??= []).push(name);
    }

    const commits: SnapshotCommit[] = history.map(({ hash, commit }) => ({
      hash,
      shortHash: shortHash(hash),
      message: commit.message,
      parents: Object.freeze([...commit.parents]) as string[],
      branches: Object.freeze([...(hashToBranches[hash] ?? [])]) as string[],
    }));

    // Index
    const indexPaths = Object.keys(repo.index).sort();

    // Fichiers (working tree + index + HEAD)
    const headHash = headCommitHash(repo);
    const headFiles: Record<string, string> = {};
    if (headHash) {
      const commit = repo.objects[headHash];
      if (commit && commit.type === 'commit') {
        Object.assign(headFiles, flattenTree(repo, commit.tree));
      }
    }

    const allPaths = new Set([
      ...Object.keys(repo.workingTree),
      ...Object.keys(repo.index),
      ...Object.keys(headFiles),
    ]);

    const files: SnapshotFile[] = [];
    for (const path of [...allPaths].sort()) {
      const wtEntry = repo.workingTree[path];
      const indexEntry = repo.index[path];
      const headBlobHash = headFiles[path];

      let status: FileStatus;

      if (!wtEntry && !indexEntry) {
        // Dans HEAD mais pas dans le reste — ne se produit pas dans le WT
        continue;
      } else if (!indexEntry && !headBlobHash) {
        status = 'untracked';
      } else if (indexEntry && !headBlobHash) {
        // Fichier dans l'index, pas dans HEAD → staged (new file)
        if (wtEntry && hashBlob(wtEntry.content) !== indexEntry.blobHash) {
          status = 'modified'; // stagé mais aussi modifié dans le WT
        } else {
          status = 'staged';
        }
      } else if (!indexEntry && headBlobHash) {
        // Dans HEAD mais supprimé de l'index
        status = 'deleted';
      } else if (indexEntry && headBlobHash) {
        // Fichier tracké
        if (!wtEntry) {
          status = 'deleted';
        } else {
          const wtHash = hashBlob(wtEntry.content);
          if (wtHash !== indexEntry.blobHash || indexEntry.blobHash !== headBlobHash) {
            status = 'modified';
          } else {
            status = 'clean';
          }
        }
      } else {
        status = 'untracked';
      }

      files.push({ path, status });
    }

    // Immuabilité (cf. contrat RepoSnapshot) : on gèle les conteneurs pour
    // qu'un composant ne puisse pas muter le snapshot posé dans le store.
    return Object.freeze({
      initialized,
      branches: Object.freeze(branches),
      head: Object.freeze(headState),
      commits: Object.freeze(commits.map((c) => Object.freeze(c))) as SnapshotCommit[],
      indexPaths: Object.freeze(indexPaths) as string[],
      files: Object.freeze(files.map((f) => Object.freeze(f))) as SnapshotFile[],
    });
  }
}
