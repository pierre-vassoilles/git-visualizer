/**
 * Virtualisation / culling du graphe SVG (dette technique B4, spec 61 §4).
 *
 * Fonction PURE : ne dépend ni de Vue ni du DOM. Filtre les nœuds/arêtes d'un
 * `GraphLayout` pour ne conserver que ce qui intersecte le viewport visible
 * (+ une marge de buffer), sans toucher au layout lui-même (positions, tailles,
 * largeur/hauteur de canvas inchangées). Sur de gros DAG (>1000 commits) cela
 * évite de rendre des milliers d'éléments SVG hors écran.
 *
 * Le layout d'origine n'est jamais muté : `culledLayout` renvoie un nouvel
 * objet partageant les mêmes références de nœuds/arêtes (filtrées).
 */

import type { GraphLayout, GraphNode, GraphEdge } from './types';

/** Rectangle visible en coordonnées LOGIQUES du graphe (avant zoom/pan). */
export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CullingOptions {
  /**
   * En-dessous de ce nombre de nœuds, le culling est sauté (overhead non
   * justifié) et le layout est renvoyé tel quel. Défaut : 100.
   */
  threshold?: number;
  /**
   * Fraction de marge ajoutée autour du viewport (lissage du scroll).
   * Défaut : 0.2 (20 %).
   */
  buffer?: number;
}

/** Teste si un point logique est dans le rectangle (bornes incluses). */
function pointInRect(x: number, y: number, r: Viewport): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

/**
 * Renvoie un `GraphLayout` dont `nodes`/`edges` sont filtrés au viewport visible.
 *
 * Invariants :
 *  - Aucune mutation du layout d'entrée.
 *  - `width`/`height`/`laneCount`/`padding` inchangés (le canvas garde sa taille).
 *  - Une arête est conservée si AU MOINS une de ses extrémités est visible
 *    (les deux extrémités hors viewport ⇒ arête exclue).
 *  - Sous le seuil, le layout d'entrée est renvoyé tel quel (référence identique).
 */
export function culledLayout(
  layout: GraphLayout,
  viewport: Viewport,
  options: CullingOptions = {},
): GraphLayout {
  const { threshold = 100, buffer = 0.2 } = options;

  if (layout.nodes.length < threshold) {
    return layout;
  }

  // Viewport élargi de `buffer` de chaque côté.
  const mx = viewport.width * buffer;
  const my = viewport.height * buffer;
  const expanded: Viewport = {
    x: viewport.x - mx,
    y: viewport.y - my,
    width: viewport.width + 2 * mx,
    height: viewport.height + 2 * my,
  };

  const visibleNodes: GraphNode[] = layout.nodes.filter((n) => pointInRect(n.x, n.y, expanded));

  const visibleEdges: GraphEdge[] = layout.edges.filter(
    (e) => pointInRect(e.fromX, e.fromY, expanded) || pointInRect(e.toX, e.toY, expanded),
  );

  return {
    ...layout,
    nodes: visibleNodes,
    edges: visibleEdges,
  };
}
