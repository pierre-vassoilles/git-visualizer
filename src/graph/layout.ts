/**
 * Algorithme de layout pur pour la visualisation du DAG Git.
 *
 * Propriétés garanties :
 *   - PURE : pas d'effets de bord, pas de dépendances DOM/Vue.
 *   - DETERMINISTE : même entrée → même sortie (pas de Date.now() / Math.random()).
 *   - CORRECTE : ordre topologique respecté (parents toujours après enfants en Y).
 *
 * Spec de référence :
 *   - docs/specs/15-graph-model.md (types LayoutInput / GraphLayout)
 *   - docs/specs/16-graph-layout.md (étapes détaillées de l'algorithme)
 *
 * @module
 */

import type { SnapshotCommit } from '@/core/engine';
import type {
  GraphEdge,
  GraphLayout,
  GraphNode,
  LayoutInput,
  LayoutOptions,
} from './types';

// Re-export public types so consumers can import from a single path.
export type { GraphEdge, GraphLayout, GraphNode, LayoutInput, LayoutOptions };
export type { GraphLayout as GraphLayoutType };

// ---------------------------------------------------------------------------
// Palette de couleurs par défaut (8 couleurs contrastées)
// ---------------------------------------------------------------------------

/**
 * Palette de couleurs par défaut pour les lanes.
 * Index 0 = branche primaire (main/master), indices 1-7 = autres branches.
 * Contrastées pour être lisibles sur fond clair ou sombre.
 */
export const DEFAULT_COLOR_PALETTE: readonly string[] = Object.freeze([
  '#3b82f6', // 0 - blue     (primary branch)
  '#f59e0b', // 1 - amber
  '#10b981', // 2 - emerald
  '#ef4444', // 3 - red
  '#8b5cf6', // 4 - violet
  '#06b6d4', // 5 - cyan
  '#f97316', // 6 - orange
  '#ec4899', // 7 - pink
]);

// ---------------------------------------------------------------------------
// Étape 1 : Tri topologique (DFS post-ordre inversé)
// ---------------------------------------------------------------------------

/**
 * Trie les commits en ordre topologique : enfants avant parents.
 *
 * Algorithme : DFS post-ordre depuis les racines (commits sans parents).
 * Les enfants de chaque nœud sont triés par hash avant visite pour garantir
 * le déterminisme en cas de branches parallèles.
 *
 * Complexité : O(C + E) où C = nombre de commits, E = nombre d'arêtes parent-enfant.
 *
 * @param commits - Liste immuable de commits.
 * @returns Liste ordonnée : enfants avant leurs parents (feuilles en tête).
 */
function topologicalSort(commits: readonly SnapshotCommit[]): SnapshotCommit[] {
  const commitMap = new Map<string, SnapshotCommit>();
  for (const c of commits) {
    commitMap.set(c.hash, c);
  }

  // Construire la map inverse : parent → liste d'enfants
  const childrenMap = new Map<string, string[]>();
  for (const c of commits) {
    for (const parentHash of c.parents) {
      if (!childrenMap.has(parentHash)) {
        childrenMap.set(parentHash, []);
      }
      childrenMap.get(parentHash)!.push(c.hash);
    }
  }

  const visited = new Set<string>();
  const result: SnapshotCommit[] = [];

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
    result.push(commit);
  }

  // Identifier les racines (commits sans parents)
  const roots: string[] = [];
  for (const c of commits) {
    if (c.parents.length === 0) {
      roots.push(c.hash);
    }
  }

  // Trier les racines par hash pour déterminisme
  roots.sort();

  if (roots.length === 0 && commits.length > 0) {
    // Cas pathologique : aucune racine (cycle ou graphe corrompu)
    // Visiter le premier commit par ordre de hash
    const firstHash = [...commits].sort((a, b) => a.hash.localeCompare(b.hash))[0]!.hash;
    dfs(firstHash);
  } else {
    for (const rootHash of roots) {
      dfs(rootHash);
    }
  }

  // Vérifier que tous les commits ont été visités (prévention graphe corrompu)
  if (visited.size !== commits.length) {
    // Visiter les commits manquants (graphes non-connectés)
    const unvisited = [...commits]
      .filter(c => !visited.has(c.hash))
      .sort((a, b) => a.hash.localeCompare(b.hash));
    for (const c of unvisited) {
      dfs(c.hash);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Étape 2 : Calcul de profondeur
// ---------------------------------------------------------------------------

/**
 * Calcule la profondeur de chaque commit dans le DAG.
 *
 * Définition : profondeur(C) = max(profondeur(enfant) + 1) pour tous les enfants,
 * ou 0 si C est une feuille (commit sans enfants).
 *
 * Les feuilles (commits sans enfants) ont profondeur 0 et apparaissent en haut du graphe.
 * Les racines (commits sans parents) ont la profondeur maximale.
 *
 * @param commits - Liste de tous les commits.
 * @param topSorted - Commits triés topologiquement (enfants avant parents).
 * @returns Map hash → profondeur (≥ 0).
 */
function calculateDepths(
  commits: readonly SnapshotCommit[],
  topSorted: SnapshotCommit[],
): Map<string, number> {
  // Construire la map inverse : parent → enfants
  const childrenMap = new Map<string, string[]>();
  for (const c of commits) {
    for (const parentHash of c.parents) {
      if (!childrenMap.has(parentHash)) {
        childrenMap.set(parentHash, []);
      }
      childrenMap.get(parentHash)!.push(c.hash);
    }
  }

  const depths = new Map<string, number>();

  // Parcours en ordre topologique (enfants avant parents) → DP bottom-up
  for (const commit of topSorted) {
    let maxChildDepth = -1;
    for (const childHash of childrenMap.get(commit.hash) ?? []) {
      const childDepth = depths.get(childHash);
      if (childDepth !== undefined && childDepth > maxChildDepth) {
        maxChildDepth = childDepth;
      }
    }
    depths.set(commit.hash, maxChildDepth + 1);
  }

  return depths;
}

// ---------------------------------------------------------------------------
// Étape 3 : Assignation de lanes
// ---------------------------------------------------------------------------

/**
 * Hash déterministe d'une chaîne (djb2 simplifié).
 * Utilisé comme tiebreaker pour l'assignation des couleurs par lane.
 *
 * @param s - Chaîne à hasher.
 * @returns Entier non signé 32 bits.
 */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 31) + s.charCodeAt(i);
    h |= 0; // Convertir en entier 32 bits signé
  }
  return h >>> 0; // Convertir en non signé
}

interface LaneAssignmentContext {
  /** Commits triés topologiquement (enfants avant parents). */
  topSorted: SnapshotCommit[];
  /** Map hash → commit. */
  commitMap: Map<string, SnapshotCommit>;
  /** Map parent → liste d'enfants. */
  childrenMap: Map<string, string[]>;
  /** Branches du dépôt (nom → hash du tip). */
  branches: Readonly<Record<string, string>>;
}

/**
 * Assigne chaque commit à une lane (colonne) de manière déterministe,
 * en garantissant l'unicité du couple (lane, depth).
 *
 * Algorithme en 3 phases + résolution de collisions :
 *   1. Assigner une lane aux tips des branches nommées (primary branch = lane 0).
 *   2. Propager la lane du tip vers ses ancêtres par le PREMIER parent uniquement
 *      (continuation de branche façon Git). Les parents secondaires d'un merge
 *      ne reçoivent pas automatiquement la lane du merge commit.
 *   3. Assigner les commits orphelins (non encore assignés) : hériter de la lane
 *      de l'enfant unique si la cellule (lane, depth) est libre, sinon nouvelle lane.
 *   4. Résolution de collisions : si deux commits distincts ont le même couple
 *      (lane, depth), le second reçoit la prochaine lane libre à cette profondeur.
 *
 * Invariants :
 *   - Primary branch (`main`/`master`/`develop`/`dev`) → lane 0.
 *   - Déterministe : même entrée → même assignation.
 *   - Lanes contiguës : 0, 1, 2, ..., n-1.
 *   - Unicité : deux commits distincts n'ont jamais le même couple (lane, depth).
 *
 * @param ctx - Contexte d'assignation.
 * @param depths - Map hash → profondeur (nécessaire pour la résolution de collisions).
 * @returns Map hash → indice de lane.
 */
function assignLanes(
  ctx: LaneAssignmentContext,
  depths: Map<string, number>,
): Map<string, number> {
  const laneAssignments = new Map<string, number>();
  let nextLane = 0;

  // Ensemble d'occupation : clé "${lane}:${depth}" → hash occupant
  // Permet de détecter les collisions (lane, depth) dès l'assignation.
  const occupied = new Map<string, string>();

  /**
   * Tente d'assigner `lane` au commit `hash`.
   * Si la cellule (lane, depth) est déjà occupée par un autre commit,
   * alloue la prochaine lane libre à cette profondeur.
   * Ne réassigne jamais un commit déjà assigné.
   *
   * @returns La lane effectivement assignée.
   */
  function assignLane(hash: string, lane: number): number {
    if (laneAssignments.has(hash)) {
      return laneAssignments.get(hash)!;
    }
    const depth = depths.get(hash) ?? 0;

    // Chercher une lane libre à cette profondeur, en partant de `lane`
    let candidateLane = lane;
    while (true) {
      const cellKey = `${candidateLane}:${depth}`;
      const occupant = occupied.get(cellKey);
      if (occupant === undefined || occupant === hash) {
        // Cellule libre (ou déjà réservée pour ce hash) : on l'utilise
        break;
      }
      // Collision : passer à la lane suivante
      candidateLane++;
      // S'assurer que nextLane est mis à jour si on dépasse
      if (candidateLane >= nextLane) {
        nextLane = candidateLane + 1;
      }
    }

    laneAssignments.set(hash, candidateLane);
    occupied.set(`${candidateLane}:${depth}`, hash);
    return candidateLane;
  }

  // === Phase 1 : Assigner les branches nommées à des lanes ===
  const primaryBranchNames = ['main', 'master', 'develop', 'dev'];
  const branchOrder: string[] = [];

  // Primary branch en premier
  for (const name of primaryBranchNames) {
    if (name in ctx.branches) {
      branchOrder.push(name);
      break;
    }
  }

  // Autres branches triées alphabétiquement pour déterminisme
  for (const name of Object.keys(ctx.branches).sort()) {
    if (!branchOrder.includes(name)) {
      branchOrder.push(name);
    }
  }

  // Assigner une lane unique à chaque tip de branche
  for (const branchName of branchOrder) {
    const branchHash = ctx.branches[branchName];
    if (branchHash && !laneAssignments.has(branchHash)) {
      assignLane(branchHash, nextLane);
      nextLane++;
    }
  }

  // === Phase 2 : Backtrack de chaque tip vers la racine — PREMIER PARENT UNIQUEMENT ===
  //
  // Correction B1 : on ne propage la lane que le long du PREMIER parent (parents[0]),
  // qui représente la continuation de branche façon Git. Les parents secondaires
  // (parents[1..]) ne reçoivent PAS automatiquement la lane du merge commit ;
  // ils seront traités par la Phase 3 (orphelins) et placeront sur leur propre lane.
  for (const branchName of branchOrder) {
    const branchHash = ctx.branches[branchName];
    if (!branchHash) continue;

    // Lane du tip de cette branche (déjà assignée en Phase 1)
    const tipLane = laneAssignments.get(branchHash);
    if (tipLane === undefined) continue;

    const visitedBacktrack = new Set<string>();

    const backtrack = (hash: string): void => {
      if (visitedBacktrack.has(hash)) return;
      visitedBacktrack.add(hash);

      const commit = ctx.commitMap.get(hash);
      if (!commit) return;

      // Assigner la lane seulement si le commit n'est pas encore assigné
      if (!laneAssignments.has(hash)) {
        assignLane(hash, tipLane);
      }

      // Backtrack uniquement via le PREMIER parent (continuation de branche)
      // Les parents secondaires (merge) ne reçoivent pas la lane automatiquement.
      if (commit.parents.length > 0) {
        backtrack(commit.parents[0]!);
      }
    };

    backtrack(branchHash);
  }

  // === Phase 3 : Assigner les commits orphelins ===
  // Commits non encore assignés (ex. en HEAD détaché, commits isolés,
  // parents secondaires d'un merge non couverts par une branche).
  //
  // Correction B1+B2 : on tente d'hériter la lane de l'enfant UNIQUE assigné,
  // mais seulement si la cellule (lane, depth) est libre. Sinon, nouvelle lane.
  for (const commit of ctx.topSorted) {
    if (laneAssignments.has(commit.hash)) continue;

    const depth = depths.get(commit.hash) ?? 0;

    // Collecter les lanes des enfants assignés (via childrenMap)
    // On ne regarde que les enfants dont ce commit est le PREMIER parent,
    // pour rester cohérent avec la propagation Phase 2.
    const childLanesViaFirstParent: number[] = [];
    for (const childHash of ctx.childrenMap.get(commit.hash) ?? []) {
      const childCommit = ctx.commitMap.get(childHash);
      if (!childCommit) continue;
      // Ce commit est-il le premier parent de l'enfant ?
      if (childCommit.parents[0] === commit.hash) {
        const childLane = laneAssignments.get(childHash);
        if (childLane !== undefined) {
          childLanesViaFirstParent.push(childLane);
        }
      }
    }

    // Dédupliquer et trier pour déterminisme
    const uniqueChildLanes = [...new Set(childLanesViaFirstParent)].sort((a, b) => a - b);

    if (uniqueChildLanes.length === 1) {
      // Un seul enfant (via premier parent) : tenter d'hériter sa lane
      const candidateLane = uniqueChildLanes[0]!;
      const cellKey = `${candidateLane}:${depth}`;
      if (!occupied.has(cellKey)) {
        assignLane(commit.hash, candidateLane);
      } else {
        // Cellule occupée : nouvelle lane
        assignLane(commit.hash, nextLane);
        nextLane++;
      }
    } else {
      // Aucun enfant ou plusieurs enfants différents : nouvelle lane
      assignLane(commit.hash, nextLane);
      nextLane++;
    }
  }

  return laneAssignments;
}

// ---------------------------------------------------------------------------
// Étape 4 : Calcul de positions (x, y)
// ---------------------------------------------------------------------------

/**
 * Calcule la position en pixels de chaque commit.
 *
 * Formules :
 *   x = paddingLeft + lane * laneWidth
 *   y = paddingTop  + depth * commitHeight
 *
 * @param commits - Liste de tous les commits.
 * @param laneAssignments - Map hash → indice de lane.
 * @param depths - Map hash → profondeur.
 * @param options - Options de rendu (espacements, marges).
 * @returns Map hash → {x, y} en pixels.
 */
function calculatePositions(
  commits: readonly SnapshotCommit[],
  laneAssignments: Map<string, number>,
  depths: Map<string, number>,
  options: LayoutOptions,
): Map<string, { x: number; y: number }> {
  const laneWidth = options.laneWidth ?? 80;
  const commitHeight = options.commitHeight ?? 60;
  const paddingLeft = 40;
  const paddingTop = 40;

  const positions = new Map<string, { x: number; y: number }>();

  for (const commit of commits) {
    const lane = laneAssignments.get(commit.hash) ?? 0;
    const depth = depths.get(commit.hash) ?? 0;

    positions.set(commit.hash, {
      x: paddingLeft + lane * laneWidth,
      y: paddingTop + depth * commitHeight,
    });
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Étape 5 : Routage des arêtes
// ---------------------------------------------------------------------------

/**
 * Calcule les arêtes du graphe (une par relation parent-enfant).
 *
 * Type d'arête :
 *   - 'linear' : fromLane === toLane (ligne droite verticale).
 *   - 'merge'  : fromLane !== toLane (courbe de Bézier côté rendu SVG).
 *
 * Invariant : pour chaque arête, fromY > toY (parent plus bas, enfant en haut).
 *
 * @param commits - Liste de tous les commits.
 * @param commitMap - Map hash → commit.
 * @param laneAssignments - Map hash → indice de lane.
 * @param positions - Map hash → {x, y}.
 * @returns Liste de toutes les arêtes.
 */
function routeEdges(
  commits: readonly SnapshotCommit[],
  commitMap: Map<string, SnapshotCommit>,
  laneAssignments: Map<string, number>,
  positions: Map<string, { x: number; y: number }>,
): GraphEdge[] {
  const edges: GraphEdge[] = [];

  for (const commit of commits) {
    const childLane = laneAssignments.get(commit.hash) ?? 0;
    const childPos = positions.get(commit.hash);
    if (!childPos) continue;

    for (const parentHash of commit.parents) {
      if (!commitMap.has(parentHash)) continue;

      const parentLane = laneAssignments.get(parentHash) ?? 0;
      const parentPos = positions.get(parentHash);
      if (!parentPos) continue;

      edges.push({
        type: parentLane === childLane ? 'linear' : 'merge',
        fromHash: parentHash,
        toHash: commit.hash,
        fromX: parentPos.x,
        fromY: parentPos.y,
        toX: childPos.x,
        toY: childPos.y,
        fromLane: parentLane,
        toLane: childLane,
      });
    }
  }

  return edges;
}

// ---------------------------------------------------------------------------
// Étape 6 : Assignation de couleurs
// ---------------------------------------------------------------------------

/**
 * Détermine la couleur d'un nœud à partir de sa lane.
 *
 * Règles (ordre de priorité) :
 *   1. Si le commit est le tip d'une branche primaire (main/master/develop) → couleur 0.
 *   2. Si le commit est le tip d'une branche nommée → couleur déterministe par hash du nom.
 *   3. Sinon → couleur basée sur l'indice de lane modulo la longueur de la palette.
 *
 * @param lane - Indice de lane du commit.
 * @param commitHash - Hash du commit.
 * @param branches - Branches du dépôt (nom → hash du tip).
 * @param colorPalette - Palette de couleurs.
 * @returns Couleur hex (ex. "#3b82f6").
 */
function getColorForCommit(
  lane: number,
  commitHash: string,
  branches: Readonly<Record<string, string>>,
  colorPalette: readonly string[],
): string {
  if (colorPalette.length === 0) return '#3b82f6';

  const primaryBranchNames = ['main', 'master', 'develop', 'dev'];

  // Vérifier si ce commit est le tip d'une branche primaire
  for (const name of primaryBranchNames) {
    if (branches[name] === commitHash) {
      return colorPalette[0]!;
    }
  }

  // Chercher si ce commit est le tip d'une branche nommée
  for (const [branchName, branchHash] of Object.entries(branches)) {
    if (branchHash === commitHash && !primaryBranchNames.includes(branchName)) {
      const h = hashString(branchName);
      const colorIndex = 1 + (h % (colorPalette.length - 1));
      return colorPalette[colorIndex] ?? colorPalette[0]!;
    }
  }

  // Fallback : couleur par indice de lane
  return colorPalette[lane % colorPalette.length]!;
}

// ---------------------------------------------------------------------------
// Fonction principale exportée
// ---------------------------------------------------------------------------

/**
 * Calcule la géométrie 2D complète du DAG Git.
 *
 * Fonction PURE : même entrée → même sortie, sans effets de bord.
 *
 * Étapes internes :
 *   1. Tri topologique (DFS post-ordre, tiebreaker par hash)
 *   2. Calcul de profondeur (DP bottom-up)
 *   3. Assignation de lanes (branches nommées d'abord, backtrack premier-parent,
 *      orphelins, résolution de collisions (lane, depth))
 *   4. Calcul de positions (x = paddingLeft + lane * laneWidth, y = paddingTop + depth * commitHeight)
 *   5. Routage des arêtes (linéaire si même lane, merge sinon)
 *   6. Assignation de couleurs (déterministe par lane/branche)
 *
 * Cas limites gérés sans erreur :
 *   - Dépôt vide (commits.length === 0) → GraphLayout vide.
 *   - Un seul commit → un nœud en (paddingLeft, paddingTop), laneCount === 1.
 *   - Branches multiples divergentes → chaque branche sur sa lane.
 *   - HEAD détaché → pas d'impact sur le layout (la surbrillance est à la charge du rendu).
 *   - Commits sans branche (orphelins) → nouvelle lane ou héritage de la lane enfant.
 *   - Commit de merge → parents secondaires sur des lanes distinctes du merge commit.
 *
 * @param input - Entrée du layout (commits + refs + options).
 * @returns Géométrie complète prête à rendre (nœuds, arêtes, dimensions).
 */
export function computeLayout(input: LayoutInput): GraphLayout {
  const { commits, branches, options = {} } = input;

  const padding = { top: 40, bottom: 40, left: 40, right: 40 };

  // Cas vide : retourner un layout vide sans erreur
  if (commits.length === 0) {
    return {
      nodes: [],
      edges: [],
      laneCount: 0,
      width: 0,
      height: 0,
      padding,
    };
  }

  // Résolution des options avec valeurs par défaut
  const laneWidth = options.laneWidth ?? 80;
  const commitHeight = options.commitHeight ?? 60;
  const colorPalette = options.colorPalette ?? [...DEFAULT_COLOR_PALETTE];

  // Construire les maps de lookup
  const commitMap = new Map<string, SnapshotCommit>();
  for (const c of commits) {
    commitMap.set(c.hash, c);
  }

  const childrenMap = new Map<string, string[]>();
  for (const c of commits) {
    for (const parentHash of c.parents) {
      if (!childrenMap.has(parentHash)) {
        childrenMap.set(parentHash, []);
      }
      childrenMap.get(parentHash)!.push(c.hash);
    }
  }

  // === Étapes séquentielles ===

  // 1. Tri topologique (enfants avant parents)
  const topSorted = topologicalSort(commits);

  // 2. Profondeur (feuilles = 0, racines = max)
  const depths = calculateDepths(commits, topSorted);

  // 3. Assignation de lanes (avec depths pour résolution de collisions)
  const laneAssignments = assignLanes(
    {
      topSorted,
      commitMap,
      childrenMap,
      branches,
    },
    depths,
  );

  // 4. Positions (x, y) en pixels
  const positions = calculatePositions(commits, laneAssignments, depths, options);

  // 5. Arêtes
  const edges = routeEdges(commits, commitMap, laneAssignments, positions);

  // 6. Construction des nœuds avec couleurs
  const nodes: GraphNode[] = [];
  for (const commit of commits) {
    const lane = laneAssignments.get(commit.hash) ?? 0;
    const pos = positions.get(commit.hash) ?? { x: padding.left, y: padding.top };

    nodes.push({
      hash: commit.hash,
      x: pos.x,
      y: pos.y,
      lane,
      color: getColorForCommit(lane, commit.hash, branches, colorPalette),
      snapshot: commit,
    });
  }

  // === Calcul des dimensions ===
  const allLanes = [...laneAssignments.values()];
  const laneCount = allLanes.length > 0 ? Math.max(...allLanes) + 1 : 1;

  const allDepths = [...depths.values()];
  const maxDepth = allDepths.length > 0 ? Math.max(...allDepths) : 0;

  const width = padding.left + laneCount * laneWidth + padding.right;
  const height = padding.top + (maxDepth + 1) * commitHeight + padding.bottom;

  return {
    nodes,
    edges,
    laneCount,
    width,
    height,
    padding,
  };
}
