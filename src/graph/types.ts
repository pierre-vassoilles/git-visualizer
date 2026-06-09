/**
 * Contrats TypeScript pour l'algorithme de layout du graphe Git (Phase 3).
 *
 * Ces types sont STABLES et exportés pour être consommés par :
 *   - src/graph/layout.ts (implémentation)
 *   - tests/graph-layout.test.ts (tests Vitest)
 *   - src/components/GraphView.vue (rendu SVG)
 *
 * Spec de référence : docs/specs/15-graph-model.md, docs/specs/16-graph-layout.md
 */

import type { SnapshotCommit } from '@/core/engine';

// ---------------------------------------------------------------------------
// Entrée du layout
// ---------------------------------------------------------------------------

/** Options de rendu (dimensions, espacements, couleurs). */
export interface LayoutOptions {
  /** Écartement horizontal entre lanes (pixels). Défaut : 80. */
  laneWidth?: number;

  /** Écartement vertical entre commits (pixels). Défaut : 60. */
  commitHeight?: number;

  /** Rayon des cercles représentant les nœuds (pixels). Défaut : 6. */
  nodeRadius?: number;

  /** Palette de couleurs pour les lanes. Défaut : voir DEFAULT_COLOR_PALETTE. */
  colorPalette?: string[];
}

/**
 * Entrée de l'algorithme de layout.
 *
 * Reçoit une liste immuable de commits (depuis snapshot) et les refs courantes.
 * Invariant : `commits` doit former un DAG acyclique valide (pas de cycle).
 */
export interface LayoutInput {
  /** Tous les commits (depuis snapshot.allCommits ou snapshot.commits). */
  commits: readonly SnapshotCommit[];

  /**
   * Branches courantes (nom → hash).
   * Utilisé pour l'assignation déterministe des lanes (primary branch d'abord).
   */
  branches: Readonly<Record<string, string>>;

  /** HEAD courant (pour surbrillance optionnelle). */
  head: Readonly<
    | { type: 'branch'; name: string }
    | { type: 'detached'; hash: string }
  >;

  /** Tags courants (tagName → commitHash). */
  tags: Readonly<Record<string, string>>;

  /** Options de rendu (espacement, couleurs, etc.). */
  options?: LayoutOptions;
}

// ---------------------------------------------------------------------------
// Sortie du layout
// ---------------------------------------------------------------------------

/**
 * Modèle géométrique d'un commit sur le graphe.
 *
 * Invariants :
 *   - x = paddingLeft + lane * laneWidth
 *   - y = paddingTop + depth * commitHeight
 *   - hash est unique dans GraphLayout.nodes
 */
export interface GraphNode {
  /** Hash complet SHA-1 (clé unique, 40 caractères). */
  hash: string;

  /** Position horizontale en pixels. */
  x: number;

  /** Position verticale en pixels (0 = haut, croissant vers le bas). */
  y: number;

  /** Indice de lane (0-based). Lane 0 = colonne la plus à gauche. */
  lane: number;

  /** Couleur hex déterministe de la lane (ex. "#3b82f6"). */
  color: string;

  /** Données du snapshot pour affichage (message, branches, tags). */
  snapshot: SnapshotCommit;
}

/**
 * Arête dirigée parent → enfant dans le DAG.
 *
 * Invariants :
 *   - fromHash ∈ GraphLayout.nodes[*].hash
 *   - toHash ∈ GraphLayout.nodes[*].hash
 *   - Y(from) > Y(to)  (parent plus bas que l'enfant car plus récent en haut)
 *   - type === 'linear' ↔ fromLane === toLane
 *   - type === 'merge'  ↔ fromLane !== toLane
 */
export interface GraphEdge {
  /** Hash du parent (origine de l'arête). */
  fromHash: string;

  /** Hash de l'enfant (destination de l'arête). */
  toHash: string;

  /** Position X du parent en pixels. */
  fromX: number;

  /** Position Y du parent en pixels. */
  fromY: number;

  /** Position X de l'enfant en pixels. */
  toX: number;

  /** Position Y de l'enfant en pixels. */
  toY: number;

  /**
   * Type de l'arête :
   *   - 'linear' : parent et enfant sont sur la même lane (ligne droite verticale).
   *   - 'merge'  : parent et enfant sont sur des lanes différentes (courbe de Bézier).
   */
  type: 'linear' | 'merge';

  /** Indice de lane du parent. */
  fromLane: number;

  /** Indice de lane de l'enfant. */
  toLane: number;
}

/**
 * Résultat complet de l'algorithme de layout.
 *
 * Invariants :
 *   - nodes.length === commits.length
 *   - Pour tout edge : Y(parent) > Y(enfant) (parent plus bas, récent en haut)
 *   - laneCount = max(node.lane) + 1
 *   - width = padding.left + laneCount * laneWidth + padding.right
 *   - height = padding.top + (maxDepth + 1) * commitHeight + padding.bottom
 */
export interface GraphLayout {
  /** Nœuds du graphe (un par commit, ordre non garanti). */
  nodes: GraphNode[];

  /** Arêtes parent → enfant (une par relation de parenté). */
  edges: GraphEdge[];

  /** Nombre de lanes utilisées (largeur du DAG). 0 si aucun commit. */
  laneCount: number;

  /** Largeur totale du canvas en pixels. */
  width: number;

  /** Hauteur totale du canvas en pixels. */
  height: number;

  /** Marges appliquées autour du graphe. */
  padding: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}
