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
  /**
   * Noms des tags pointant directement sur ce commit.
   * Tableau vide si aucun tag ne pointe sur ce commit.
   */
  readonly tags: string[];
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
   * Map tagName → commitHash pour tous les tags du dépôt.
   */
  readonly tags: Record<string, string>;
  /**
   * Chemins présents dans l'index (staging area).
   */
  readonly indexPaths: string[];
  /**
   * Fichiers du working tree avec leur statut calculé.
   */
  readonly files: SnapshotFile[];
  /**
   * PHASE 3 : Tous les commits du dépôt, triés topologiquement
   * (parents avant leurs enfants, soit les commits les plus récents en tête).
   *
   * Contrairement à `commits` (limité aux commits accessibles depuis HEAD),
   * `allCommits` inclut TOUS les commits présents dans repo.objects, y compris
   * ceux de branches divergentes non accessibles depuis HEAD.
   *
   * Chaque commit est décoré avec ses branches et tags (identique à `commits`).
   *
   * Utilisé par GraphView.vue via : `snapshot.allCommits ?? snapshot.commits`
   * pour rétro-compatibilité.
   *
   * Tri : profondeur croissante (feuilles = commits sans enfants en tête, racines en bas).
   * Cette convention est cohérente avec l'algorithme de layout (spec 16) qui place
   * les commits récents (profondeur 0) en haut du canvas (Y le plus petit).
   */
  readonly allCommits?: SnapshotCommit[];
  /**
   * PHASE 4 : État d'opération en cours.
   * Null si aucune opération n'est en cours.
   */
  readonly operationState?: {
    readonly type: 'merging' | 'reverting' | 'cherryPicking' | 'rebasing';
    readonly branchName?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers internes (Phase 3)
// ---------------------------------------------------------------------------

/**
 * Calcule la liste de TOUS les commits du dépôt en ordre topologique.
 *
 * Différence avec `getCommitHistoryWithHashes` : cette fonction parcourt
 * `repo.objects` entièrement au lieu de partir de HEAD, ce qui permet
 * de récupérer les commits de branches non accessibles depuis HEAD.
 *
 * Algorithme : DFS post-ordre depuis les racines (commits sans parents),
 * avec tiebreaker par hash pour garantir le déterminisme.
 *
 * Ordre de sortie : enfants avant parents (profondeur 0 en tête = commits récents,
 * racines en fin de liste). Cohérent avec l'algorithme de layout (spec 16).
 *
 * Complexité : O(C log C) où C = nombre total de commits.
 *
 * @param repo - Le dépôt courant.
 * @param hashToBranches - Map hash → noms de branches dont le tip est ce commit.
 * @param hashToTags - Map hash → noms de tags pointant sur ce commit.
 * @returns Liste de SnapshotCommit décorés, triés topologiquement.
 */
function getAllCommitsTopologicalOrder(
  repo: import('./model').Repository,
  hashToBranches: Record<string, string[]>,
  hashToTags: Record<string, string[]>,
): SnapshotCommit[] {
  // 1. Collecter tous les commits depuis repo.objects
  const commitEntries: Array<{ hash: string; commit: import('./model').Commit }> = [];
  for (const [hash, obj] of Object.entries(repo.objects)) {
    if (obj && obj.type === 'commit') {
      commitEntries.push({ hash, commit: obj });
    }
  }

  if (commitEntries.length === 0) return [];

  // 2. Construire les maps de lookup
  const commitMap = new Map<string, import('./model').Commit>();
  for (const { hash, commit } of commitEntries) {
    commitMap.set(hash, commit);
  }

  // Map parent → liste d'enfants (inverse de parents)
  const childrenMap = new Map<string, string[]>();
  for (const { hash, commit } of commitEntries) {
    for (const parentHash of commit.parents) {
      if (!childrenMap.has(parentHash)) {
        childrenMap.set(parentHash, []);
      }
      childrenMap.get(parentHash)!.push(hash);
    }
  }

  // 3. Tri topologique : DFS post-ordre depuis les racines
  const visited = new Set<string>();
  const result: string[] = [];

  function dfs(hash: string): void {
    if (visited.has(hash)) return;
    visited.add(hash);

    const commit = commitMap.get(hash);
    if (!commit) return;

    // Trier les enfants par hash pour déterminisme
    const children = [...(childrenMap.get(hash) ?? [])].sort();
    for (const childHash of children) {
      dfs(childHash);
    }

    // Post-ordre : ajouter après les enfants
    result.push(hash);
  }

  // Identifier les racines (commits sans parents) et les trier par hash
  const roots = commitEntries
    .filter(({ commit }) => commit.parents.length === 0)
    .map(({ hash }) => hash)
    .sort();

  if (roots.length === 0) {
    // Cas pathologique : commencer par le commit avec le hash le plus petit
    const firstHash = commitEntries.map(e => e.hash).sort()[0]!;
    dfs(firstHash);
  } else {
    for (const rootHash of roots) {
      dfs(rootHash);
    }
  }

  // Visiter les commits non encore atteints (graphes non-connectés)
  if (visited.size < commitEntries.length) {
    const unvisited = commitEntries
      .map(e => e.hash)
      .filter(h => !visited.has(h))
      .sort();
    for (const hash of unvisited) {
      dfs(hash);
    }
  }

  // 4. Décorer les commits avec branches et tags
  return result.map((hash) => {
    const commit = commitMap.get(hash)!;
    return Object.freeze({
      hash,
      shortHash: shortHash(hash),
      message: commit.message,
      parents: Object.freeze([...commit.parents]) as string[],
      branches: Object.freeze([...(hashToBranches[hash] ?? [])]) as string[],
      tags: Object.freeze([...(hashToTags[hash] ?? [])]) as string[],
    });
  });
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

    // Map hash → tags pointant sur ce commit
    const hashToTags: Record<string, string[]> = {};
    for (const [name, hash] of Object.entries(repo.refs.tags)) {
      if (hash) (hashToTags[hash] ??= []).push(name);
    }

    const commits: SnapshotCommit[] = history.map(({ hash, commit }) => ({
      hash,
      shortHash: shortHash(hash),
      message: commit.message,
      parents: Object.freeze([...commit.parents]) as string[],
      branches: Object.freeze([...(hashToBranches[hash] ?? [])]) as string[],
      tags: Object.freeze([...(hashToTags[hash] ?? [])]) as string[],
    }));

    // Tags globaux (pour le snapshot)
    const tags: Record<string, string> = {};
    for (const [name, hash] of Object.entries(repo.refs.tags)) {
      tags[name] = hash;
    }

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

    // Phase 3 : tous les commits du dépôt en ordre topologique
    const allCommitsRaw = getAllCommitsTopologicalOrder(repo, hashToBranches, hashToTags);

    // Phase 4 : état d'opération en cours
    let operationState: RepoSnapshot['operationState'] = undefined;
    if (repo.merging) {
      operationState = { type: 'merging', branchName: repo.merging.branchName };
    } else if (repo.rebasing) {
      operationState = { type: 'rebasing' };
    } else if (repo.reverting) {
      operationState = { type: 'reverting' };
    } else if (repo.cherryPicking) {
      operationState = { type: 'cherryPicking' };
    }

    // Immuabilité (cf. contrat RepoSnapshot) : on gèle les conteneurs pour
    // qu'un composant ne puisse pas muter le snapshot posé dans le store.
    return Object.freeze({
      initialized,
      branches: Object.freeze(branches),
      head: Object.freeze(headState),
      commits: Object.freeze(commits.map((c) => Object.freeze(c))) as SnapshotCommit[],
      tags: Object.freeze(tags),
      indexPaths: Object.freeze(indexPaths) as string[],
      files: Object.freeze(files.map((f) => Object.freeze(f))) as SnapshotFile[],
      allCommits: Object.freeze(allCommitsRaw) as SnapshotCommit[],
      operationState: operationState ? Object.freeze(operationState) : undefined,
    });
  }
}
