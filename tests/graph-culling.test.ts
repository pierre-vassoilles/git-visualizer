import { describe, it, expect } from 'vitest';
import { culledLayout, type Viewport } from '@/graph/culling';
import type { GraphLayout, GraphNode, GraphEdge } from '@/graph/types';

// ---------------------------------------------------------------------------
// Fabriques de layout de test
// ---------------------------------------------------------------------------

function node(hash: string, x: number, y: number): GraphNode {
  return {
    hash,
    x,
    y,
    lane: 0,
    color: '#000',
    snapshot: {
      hash,
      shortHash: hash.slice(0, 7),
      message: hash,
      parents: [],
      branches: [],
      tags: [],
    } as unknown as GraphNode['snapshot'],
  };
}

function edge(from: GraphNode, to: GraphNode): GraphEdge {
  return {
    fromHash: from.hash,
    toHash: to.hash,
    fromX: from.x,
    fromY: from.y,
    toX: to.x,
    toY: to.y,
    type: from.x === to.x ? 'linear' : 'merge',
    fromLane: 0,
    toLane: 0,
  };
}

/** Crée un layout vertical de n nœuds espacés de 60px. */
function makeLayout(n: number): GraphLayout {
  const nodes: GraphNode[] = [];
  for (let i = 0; i < n; i++) {
    nodes.push(node(`c${i}`, 40, 30 + i * 60));
  }
  const edges: GraphEdge[] = [];
  for (let i = 0; i < n - 1; i++) {
    edges.push(edge(nodes[i + 1]!, nodes[i]!));
  }
  const height = 60 + (n - 1) * 60;
  return {
    nodes,
    edges,
    laneCount: 1,
    width: 200,
    height,
    padding: { top: 30, bottom: 30, left: 40, right: 40 },
  };
}

const FULL_VIEWPORT: Viewport = { x: 0, y: 0, width: 10000, height: 10000 };

describe('culledLayout — seuil (CA-perf-04)', () => {
  it('sous le seuil (défaut 100) renvoie le layout tel quel (même référence)', () => {
    const layout = makeLayout(50);
    const small: Viewport = { x: 0, y: 0, width: 100, height: 100 };
    expect(culledLayout(layout, small)).toBe(layout);
  });

  it('seuil personnalisable', () => {
    const layout = makeLayout(10);
    const small: Viewport = { x: 0, y: 0, width: 100, height: 100 };
    // threshold 5 → culling actif sur 10 nœuds
    const result = culledLayout(layout, small, { threshold: 5 });
    expect(result).not.toBe(layout);
    expect(result.nodes.length).toBeLessThan(layout.nodes.length);
  });
});

describe('culledLayout — filtrage (CA-perf-01)', () => {
  it('ne conserve que les nœuds dans le viewport (+ buffer)', () => {
    const layout = makeLayout(200); // y de 30 à 30+199*60 = 11970
    // Viewport ne montrant que la bande y ∈ [0, 300] → ~5 nœuds + buffer.
    const viewport: Viewport = { x: 0, y: 0, width: 200, height: 300 };
    const result = culledLayout(layout, viewport);
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes.length).toBeLessThan(layout.nodes.length);
    // Tous les nœuds conservés sont dans la zone élargie (buffer 20 % = 60px).
    for (const n of result.nodes) {
      expect(n.y).toBeGreaterThanOrEqual(0 - 60);
      expect(n.y).toBeLessThanOrEqual(300 + 60);
    }
  });

  it('viewport couvrant tout → tous les nœuds conservés', () => {
    const layout = makeLayout(200);
    const result = culledLayout(layout, FULL_VIEWPORT);
    expect(result.nodes.length).toBe(layout.nodes.length);
    expect(result.edges.length).toBe(layout.edges.length);
  });

  it('conserve une arête si au moins une extrémité est visible', () => {
    const layout = makeLayout(200);
    const viewport: Viewport = { x: 0, y: 0, width: 200, height: 300 };
    const result = culledLayout(layout, viewport);
    // Aucune arête conservée ne doit avoir ses DEUX extrémités hors zone élargie.
    const yMin = -60;
    const yMax = 360;
    for (const e of result.edges) {
      const fromIn = e.fromY >= yMin && e.fromY <= yMax;
      const toIn = e.toY >= yMin && e.toY <= yMax;
      expect(fromIn || toIn).toBe(true);
    }
  });
});

describe('culledLayout — invariants', () => {
  it("ne mute pas le layout d'entrée", () => {
    const layout = makeLayout(200);
    const nodesBefore = layout.nodes.length;
    const edgesBefore = layout.edges.length;
    culledLayout(layout, { x: 0, y: 0, width: 100, height: 100 });
    expect(layout.nodes.length).toBe(nodesBefore);
    expect(layout.edges.length).toBe(edgesBefore);
  });

  it('préserve width/height/laneCount/padding', () => {
    const layout = makeLayout(200);
    const result = culledLayout(layout, { x: 0, y: 0, width: 100, height: 100 });
    expect(result.width).toBe(layout.width);
    expect(result.height).toBe(layout.height);
    expect(result.laneCount).toBe(layout.laneCount);
    expect(result.padding).toEqual(layout.padding);
  });
});
