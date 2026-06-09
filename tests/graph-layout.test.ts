/**
 * Tests Phase 3 — computeLayout (pur, unitaire)
 *
 * Spec de référence : docs/specs/16-graph-layout.md + docs/specs/15-graph-model.md
 * Principe : tests dérivés des CA spec, pas de l'implémentation.
 *
 * CAs couverts :
 *   CA-layout-01 : Tri topologique (Y parent < Y enfant)
 *   CA-layout-02 : Assignation de lanes déterministe
 *   CA-layout-03 : Branches cohérentes (main → lane 0)
 *   CA-layout-04 : Positions correctes (formules x, y)
 *   CA-layout-05 : Arêtes routées (type linear/merge, fromY > toY)
 *   CA-layout-06 : Cas limites (vide, 1 commit, linéaire, divergent)
 *   CA-layout-07 : Assignation de couleurs (hex valide, déterministe)
 */

import { describe, it, expect } from 'vitest';
import { computeLayout } from '@/graph/layout';
import type { LayoutInput } from '@/graph/types';
import type { SnapshotCommit } from '@/core/engine';
import { replay } from './helpers';

// ---------------------------------------------------------------------------
// Helpers de fabrication de SnapshotCommit
// ---------------------------------------------------------------------------

function makeCommit(
  hash: string,
  message: string,
  parents: string[],
  branches: string[] = [],
  tags: string[] = [],
): SnapshotCommit {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    message,
    parents,
    branches,
    tags,
  };
}

/** LayoutInput minimal pour une branche "main". */
function makeInput(
  commits: SnapshotCommit[],
  branchTips: Record<string, string> = {},
  tags: Record<string, string> = {},
): LayoutInput {
  return {
    commits,
    branches: branchTips,
    head: { type: 'branch', name: 'main' },
    tags,
  };
}

// ---------------------------------------------------------------------------
// Helpers de vérification
// ---------------------------------------------------------------------------

/** Retourne la position y d'un commit dans le layout par hash. */
function yOf(hash: string, layout: ReturnType<typeof computeLayout>): number {
  const node = layout.nodes.find((n) => n.hash === hash);
  if (!node) throw new Error(`Node ${hash} not found in layout`);
  return node.y;
}

function nodeOf(hash: string, layout: ReturnType<typeof computeLayout>) {
  const node = layout.nodes.find((n) => n.hash === hash);
  if (!node) throw new Error(`Node ${hash} not found in layout`);
  return node;
}

/** Vérifie qu'une chaîne est une couleur hex valide (#rrggbb). */
function isHexColor(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

// ---------------------------------------------------------------------------
// CA-layout-06 : Cas limites (testé en premier car fondamental)
// ---------------------------------------------------------------------------

describe('computeLayout — CA-layout-06 : cas limites', () => {
  it('CA-layout-06 : dépôt vide → layout vide, pas d\'erreur', () => {
    const layout = computeLayout(makeInput([]));
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.laneCount).toBe(0);
  });

  it('CA-layout-06 : dépôt vide → width et height cohérents (0 ou valeurs minimales)', () => {
    const layout = computeLayout(makeInput([]));
    expect(layout.width).toBeGreaterThanOrEqual(0);
    expect(layout.height).toBeGreaterThanOrEqual(0);
  });

  it('CA-layout-06 : un seul commit → 1 nœud, 0 arête', () => {
    const c = makeCommit('aaaa001', 'only commit', [], ['main']);
    const layout = computeLayout(makeInput([c], { main: 'aaaa001' }));
    expect(layout.nodes).toHaveLength(1);
    expect(layout.edges).toHaveLength(0);
  });

  it('CA-layout-06 : un seul commit → laneCount === 1', () => {
    const c = makeCommit('aaaa001', 'only commit', [], ['main']);
    const layout = computeLayout(makeInput([c], { main: 'aaaa001' }));
    expect(layout.laneCount).toBe(1);
  });

  it('CA-layout-06 : un seul commit → nœud sur lane 0', () => {
    const c = makeCommit('aaaa001', 'only commit', [], ['main']);
    const layout = computeLayout(makeInput([c], { main: 'aaaa001' }));
    expect(layout.nodes[0]!.lane).toBe(0);
  });

  it('CA-layout-06 : chaîne linéaire → tous les nœuds sur lane 0', () => {
    // A ← B ← C (C est le plus récent, feuille)
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001']);
    const c = makeCommit('ccc0003', 'C', ['bbb0002'], ['main']);
    const layout = computeLayout(makeInput([a, b, c], { main: 'ccc0003' }));
    for (const node of layout.nodes) {
      expect(node.lane).toBe(0);
    }
  });

  it('CA-layout-06 : branches divergentes → au moins 2 lanes utilisées', () => {
    // A partagé ; B sur main, C sur feature
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const c = makeCommit('ccc0003', 'C', ['aaa0001'], ['feature']);
    const layout = computeLayout(
      makeInput([a, b, c], { main: 'bbb0002', feature: 'ccc0003' }),
    );
    expect(layout.laneCount).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// CA-layout-01 : Tri topologique (Y parent < Y enfant = parent plus bas)
// ---------------------------------------------------------------------------

describe('computeLayout — CA-layout-01 : tri topologique (Y)', () => {
  it('CA-layout-01 : chaîne A←B←C : Y(A) > Y(B) > Y(C) (parents plus bas, récents en haut)', () => {
    // Spec section 2.4 : "le plus récent (derniers commits topologiquement) en haut"
    // C = feuille (tip), A = racine
    // → Y(C) < Y(B) < Y(A)  i.e. Y(parent) > Y(enfant)
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001']);
    const c = makeCommit('ccc0003', 'C', ['bbb0002'], ['main']);
    const layout = computeLayout(makeInput([a, b, c], { main: 'ccc0003' }));
    expect(yOf('aaa0001', layout)).toBeGreaterThan(yOf('bbb0002', layout));
    expect(yOf('bbb0002', layout)).toBeGreaterThan(yOf('ccc0003', layout));
  });

  it('CA-layout-01 : parent unique → Y(parent) > Y(enfant)', () => {
    const parent = makeCommit('p000001', 'parent', []);
    const child = makeCommit('c000002', 'child', ['p000001'], ['main']);
    const layout = computeLayout(makeInput([parent, child], { main: 'c000002' }));
    expect(yOf('p000001', layout)).toBeGreaterThan(yOf('c000002', layout));
  });

  it('CA-layout-01 : structure en diamond (merge) : racine plus bas que ses enfants', () => {
    // A est racine ; B et C sont parents de D (merge) ; D et B/C sont enfants de A
    // A ← B ← D (merge)
    // A ← C ← D
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001']);
    const c = makeCommit('ccc0003', 'C', ['aaa0001']);
    const d = makeCommit('ddd0004', 'D (merge)', ['bbb0002', 'ccc0003'], ['main']);
    const layout = computeLayout(
      makeInput([a, b, c, d], { main: 'ddd0004' }),
    );
    // A est racine → Y(A) > Y(B), Y(A) > Y(C), Y(A) > Y(D)
    expect(yOf('aaa0001', layout)).toBeGreaterThan(yOf('bbb0002', layout));
    expect(yOf('aaa0001', layout)).toBeGreaterThan(yOf('ccc0003', layout));
    expect(yOf('aaa0001', layout)).toBeGreaterThan(yOf('ddd0004', layout));
    // D est feuille (tip) → Y(D) plus petit que ses parents
    expect(yOf('bbb0002', layout)).toBeGreaterThan(yOf('ddd0004', layout));
    expect(yOf('ccc0003', layout)).toBeGreaterThan(yOf('ddd0004', layout));
  });

  it('CA-layout-01 : nombre de nœuds = nombre de commits', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001']);
    const c = makeCommit('ccc0003', 'C', ['bbb0002'], ['main']);
    const layout = computeLayout(makeInput([a, b, c], { main: 'ccc0003' }));
    expect(layout.nodes).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// CA-layout-02 : Assignation de lanes déterministe
// ---------------------------------------------------------------------------

describe('computeLayout — CA-layout-02 : assignation de lanes déterministe', () => {
  it('CA-layout-02 : même input → même assignation de lanes (appel 1)', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const c = makeCommit('ccc0003', 'C', ['aaa0001'], ['feature']);
    const input = makeInput([a, b, c], { main: 'bbb0002', feature: 'ccc0003' });
    const layout1 = computeLayout(input);
    const layout2 = computeLayout(input);
    // Même hash → même lane
    for (const node of layout1.nodes) {
      const node2 = layout2.nodes.find((n) => n.hash === node.hash);
      expect(node2).toBeDefined();
      expect(node.lane).toBe(node2!.lane);
    }
  });

  it('CA-layout-02 : même input → même layout complet (deep equal)', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const c = makeCommit('ccc0003', 'C', ['aaa0001'], ['feature']);
    const input = makeInput([a, b, c], { main: 'bbb0002', feature: 'ccc0003' });
    expect(computeLayout(input)).toEqual(computeLayout(input));
  });

  it('CA-layout-02 : chaîne linéaire → déterministe (2 appels)', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const input = makeInput([a, b], { main: 'bbb0002' });
    expect(computeLayout(input)).toEqual(computeLayout(input));
  });
});

// ---------------------------------------------------------------------------
// CA-layout-03 : Branches cohérentes (primary branch → lane 0)
// ---------------------------------------------------------------------------

describe('computeLayout — CA-layout-03 : branches cohérentes', () => {
  it('CA-layout-03 : le commit tip de "main" est sur la lane 0', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const layout = computeLayout(makeInput([a, b], { main: 'bbb0002' }));
    const mainTip = nodeOf('bbb0002', layout);
    expect(mainTip.lane).toBe(0);
  });

  it('CA-layout-03 : branche "master" (si main absent) → lane 0', () => {
    const a = makeCommit('aaa0001', 'A', [], ['master']);
    const layout = computeLayout(makeInput([a], { master: 'aaa0001' }));
    expect(nodeOf('aaa0001', layout).lane).toBe(0);
  });

  it('CA-layout-03 : branche feature → lane différente de main', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const c = makeCommit('ccc0003', 'C', ['aaa0001'], ['feature']);
    const layout = computeLayout(
      makeInput([a, b, c], { main: 'bbb0002', feature: 'ccc0003' }),
    );
    const mainTipLane = nodeOf('bbb0002', layout).lane;
    const featureTipLane = nodeOf('ccc0003', layout).lane;
    expect(mainTipLane).toBe(0);
    expect(featureTipLane).not.toBe(mainTipLane);
  });

  it('CA-layout-03 : commit partagé ancêtre de main reste sur lane 0', () => {
    // A partagé ← B (main), A ← C (feature)
    // A est ancêtre de main, donc backtrack depuis B (lane 0) assigne lane 0 à A
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const c = makeCommit('ccc0003', 'C', ['aaa0001'], ['feature']);
    const layout = computeLayout(
      makeInput([a, b, c], { main: 'bbb0002', feature: 'ccc0003' }),
    );
    // A est ancêtre commun → héritage de lane 0 (depuis main, qui est primary)
    expect(nodeOf('aaa0001', layout).lane).toBe(0);
  });

  it('CA-layout-03 : même branche = même lane (stable entre commits de la branche)', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001']);
    const c = makeCommit('ccc0003', 'C', ['bbb0002'], ['main']);
    const layout = computeLayout(makeInput([a, b, c], { main: 'ccc0003' }));
    // Tous les commits de la chaîne linéaire main sont sur lane 0
    expect(nodeOf('aaa0001', layout).lane).toBe(0);
    expect(nodeOf('bbb0002', layout).lane).toBe(0);
    expect(nodeOf('ccc0003', layout).lane).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CA-layout-04 : Positions correctes (formules x, y)
// ---------------------------------------------------------------------------

describe('computeLayout — CA-layout-04 : positions (formules x = paddingLeft + lane * laneWidth, y = paddingTop + depth * commitHeight)', () => {
  const PADDING_LEFT = 40;
  const PADDING_TOP = 40;
  const LANE_WIDTH = 80; // défaut
  const COMMIT_HEIGHT = 60; // défaut

  it('CA-layout-04 : un seul commit → x = paddingLeft (lane 0)', () => {
    const c = makeCommit('aaaa001', 'A', [], ['main']);
    const layout = computeLayout(makeInput([c], { main: 'aaaa001' }));
    expect(layout.nodes[0]!.x).toBe(PADDING_LEFT + 0 * LANE_WIDTH);
  });

  it('CA-layout-04 : un seul commit → y = paddingTop (depth 0 = feuille)', () => {
    const c = makeCommit('aaaa001', 'A', [], ['main']);
    const layout = computeLayout(makeInput([c], { main: 'aaaa001' }));
    expect(layout.nodes[0]!.y).toBe(PADDING_TOP + 0 * COMMIT_HEIGHT);
  });

  it('CA-layout-04 : chaîne linéaire 3 commits → profondeurs 0, 1, 2 correctes', () => {
    // C (feuille, depth 0), B (depth 1), A (racine, depth 2)
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001']);
    const c = makeCommit('ccc0003', 'C', ['bbb0002'], ['main']);
    const layout = computeLayout(makeInput([a, b, c], { main: 'ccc0003' }));
    expect(nodeOf('ccc0003', layout).y).toBe(PADDING_TOP + 0 * COMMIT_HEIGHT); // feuille
    expect(nodeOf('bbb0002', layout).y).toBe(PADDING_TOP + 1 * COMMIT_HEIGHT);
    expect(nodeOf('aaa0001', layout).y).toBe(PADDING_TOP + 2 * COMMIT_HEIGHT);
  });

  it('CA-layout-04 : commit sur lane 1 → x = paddingLeft + 1 * laneWidth', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const c = makeCommit('ccc0003', 'C', ['aaa0001'], ['feature']);
    const layout = computeLayout(
      makeInput([a, b, c], { main: 'bbb0002', feature: 'ccc0003' }),
    );
    const featureNode = nodeOf('ccc0003', layout);
    expect(featureNode.x).toBe(PADDING_LEFT + featureNode.lane * LANE_WIDTH);
  });

  it('CA-layout-04 : options personnalisées laneWidth/commitHeight respectées', () => {
    const c = makeCommit('aaaa001', 'A', [], ['main']);
    const layout = computeLayout({
      ...makeInput([c], { main: 'aaaa001' }),
      options: { laneWidth: 100, commitHeight: 80 },
    });
    expect(layout.nodes[0]!.x).toBe(40 + 0 * 100); // paddingLeft = 40 (fixe)
    expect(layout.nodes[0]!.y).toBe(40 + 0 * 80);
  });

  it('CA-layout-04 : pas de chevauchements — positions uniques', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001']);
    const c = makeCommit('ccc0003', 'C', ['bbb0002'], ['main']);
    const layout = computeLayout(makeInput([a, b, c], { main: 'ccc0003' }));
    const positions = layout.nodes.map((n) => `${n.x},${n.y}`);
    const unique = new Set(positions);
    expect(unique.size).toBe(positions.length);
  });

  it('CA-layout-04 : positions uniques avec branches divergentes', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const c = makeCommit('ccc0003', 'C', ['aaa0001'], ['feature']);
    const layout = computeLayout(
      makeInput([a, b, c], { main: 'bbb0002', feature: 'ccc0003' }),
    );
    const positions = layout.nodes.map((n) => `${n.x},${n.y}`);
    const unique = new Set(positions);
    expect(unique.size).toBe(positions.length);
  });
});

// ---------------------------------------------------------------------------
// CA-layout-05 : Arêtes routées
// ---------------------------------------------------------------------------

describe('computeLayout — CA-layout-05 : arêtes routées', () => {
  it('CA-layout-05 : nb arêtes = somme des parents (chaîne linéaire)', () => {
    // A←B←C : 2 arêtes
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001']);
    const c = makeCommit('ccc0003', 'C', ['bbb0002'], ['main']);
    const layout = computeLayout(makeInput([a, b, c], { main: 'ccc0003' }));
    expect(layout.edges).toHaveLength(2);
  });

  it('CA-layout-05 : nb arêtes = somme des parents (commit de merge, 2 parents)', () => {
    // A←B, A←C, {B,C}←D : 3 arêtes (D→B, D→C, B→A, C→A = 4 arêtes total)
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001']);
    const c = makeCommit('ccc0003', 'C', ['aaa0001']);
    const d = makeCommit('ddd0004', 'D (merge)', ['bbb0002', 'ccc0003'], ['main']);
    const layout = computeLayout(
      makeInput([a, b, c, d], { main: 'ddd0004' }),
    );
    // Somme parents : A=0, B=1, C=1, D=2 → total 4 arêtes
    expect(layout.edges).toHaveLength(4);
  });

  it('CA-layout-05 : toutes les arêtes ont fromHash et toHash présents dans nodes', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001']);
    const c = makeCommit('ccc0003', 'C', ['bbb0002'], ['main']);
    const layout = computeLayout(makeInput([a, b, c], { main: 'ccc0003' }));
    const hashes = new Set(layout.nodes.map((n) => n.hash));
    for (const edge of layout.edges) {
      expect(hashes.has(edge.fromHash)).toBe(true);
      expect(hashes.has(edge.toHash)).toBe(true);
    }
  });

  it('CA-layout-05 : arêtes linéaires ont toX === fromX (même lane)', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const layout = computeLayout(makeInput([a, b], { main: 'bbb0002' }));
    const edge = layout.edges[0]!;
    expect(edge.type).toBe('linear');
    expect(edge.fromX).toBe(edge.toX);
  });

  it('CA-layout-05 : arêtes linéaires ont fromLane === toLane', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const layout = computeLayout(makeInput([a, b], { main: 'bbb0002' }));
    for (const edge of layout.edges) {
      if (edge.type === 'linear') {
        expect(edge.fromLane).toBe(edge.toLane);
      }
    }
  });

  it('CA-layout-05 : arêtes de merge ont type === "merge" quand lanes différentes', () => {
    // Topologie : A←B (branche "main"), A←C (branche "feature"), {B,C}←D (tip "main" après merge)
    // On simule un commit de merge D dont les parents B (lane 0) et C (lane 1) sont sur des lanes différentes.
    // Pour forcer B et C sur des lanes distinctes, on leur donne des branches séparées au moment où
    // on construit l'input, puis D remplace main. La clé : branches = { main: 'ddd0004', feature: 'ccc0003' }
    // Le backtrack de main (D → B → A) met B sur lane 0.
    // Le backtrack de feature (C → A) voudrait A sur lane 1, mais A est déjà sur 0 → C reste sur lane 1.
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001']); // ancêtre de main
    const c = makeCommit('ccc0003', 'C', ['aaa0001']); // tip de feature
    const d = makeCommit('ddd0004', 'D', ['bbb0002', 'ccc0003'], ['main']); // merge commit, tip de main
    const layout = computeLayout(
      makeInput([a, b, c, d], { main: 'ddd0004', feature: 'ccc0003' }),
    );
    // L'arête D→C doit être de type merge (D sur lane 0, C sur lane 1)
    const mergeEdges = layout.edges.filter((e) => e.type === 'merge');
    expect(mergeEdges.length).toBeGreaterThanOrEqual(1);
  });

  it('CA-layout-05 : arête de merge a fromLane !== toLane', () => {
    // Idem que le test précédent : avec feature comme branche distincte, C est sur lane 1
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001']);
    const c = makeCommit('ccc0003', 'C', ['aaa0001']);
    const d = makeCommit('ddd0004', 'D', ['bbb0002', 'ccc0003'], ['main']);
    const layout = computeLayout(
      makeInput([a, b, c, d], { main: 'ddd0004', feature: 'ccc0003' }),
    );
    const mergeEdges = layout.edges.filter((e) => e.type === 'merge');
    for (const edge of mergeEdges) {
      expect(edge.fromLane).not.toBe(edge.toLane);
    }
  });

  it('CA-layout-05 : fromY > toY pour toutes les arêtes (parent plus bas que l\'enfant)', () => {
    // Spec types.ts invariant : Y(from) > Y(to) (parent plus bas, récent en haut)
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001']);
    const c = makeCommit('ccc0003', 'C', ['bbb0002'], ['main']);
    const layout = computeLayout(makeInput([a, b, c], { main: 'ccc0003' }));
    for (const edge of layout.edges) {
      expect(edge.fromY).toBeGreaterThan(edge.toY);
    }
  });

  it('CA-layout-05 : fromY > toY pour arêtes de merge aussi', () => {
    // Branches distinctes pour forcer lanes différentes et obtenir des arêtes merge
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001']);
    const c = makeCommit('ccc0003', 'C', ['aaa0001']);
    const d = makeCommit('ddd0004', 'D', ['bbb0002', 'ccc0003'], ['main']);
    const layout = computeLayout(
      makeInput([a, b, c, d], { main: 'ddd0004', feature: 'ccc0003' }),
    );
    for (const edge of layout.edges) {
      expect(edge.fromY).toBeGreaterThan(edge.toY);
    }
  });
});

// ---------------------------------------------------------------------------
// CA-layout-07 : Assignation de couleurs
// ---------------------------------------------------------------------------

describe('computeLayout — CA-layout-07 : assignation de couleurs', () => {
  it('CA-layout-07 : chaque nœud a une couleur hex valide (#rrggbb)', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const layout = computeLayout(makeInput([a, b], { main: 'bbb0002' }));
    for (const node of layout.nodes) {
      expect(isHexColor(node.color)).toBe(true);
    }
  });

  it('CA-layout-07 : commit tip de "main" a la couleur 0 de la palette (#3b82f6)', () => {
    const c = makeCommit('aaaa001', 'A', [], ['main']);
    const layout = computeLayout(makeInput([c], { main: 'aaaa001' }));
    expect(layout.nodes[0]!.color).toBe('#3b82f6');
  });

  it('CA-layout-07 : commit tip de "master" (sans main) a la couleur 0 (#3b82f6)', () => {
    const c = makeCommit('aaaa001', 'A', [], ['master']);
    const layout = computeLayout(makeInput([c], { master: 'aaaa001' }));
    expect(layout.nodes[0]!.color).toBe('#3b82f6');
  });

  it('CA-layout-07 : déterminisme couleurs — même input → mêmes couleurs', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const c = makeCommit('ccc0003', 'C', ['aaa0001'], ['feature']);
    const input = makeInput([a, b, c], { main: 'bbb0002', feature: 'ccc0003' });
    const layout1 = computeLayout(input);
    const layout2 = computeLayout(input);
    for (const node1 of layout1.nodes) {
      const node2 = layout2.nodes.find((n) => n.hash === node1.hash)!;
      expect(node1.color).toBe(node2.color);
    }
  });

  it('CA-layout-07 : couleurs hex valides avec palette personnalisée', () => {
    const c = makeCommit('aaaa001', 'A', [], ['main']);
    const layout = computeLayout({
      ...makeInput([c], { main: 'aaaa001' }),
      options: { colorPalette: ['#ff0000', '#00ff00', '#0000ff'] },
    });
    expect(isHexColor(layout.nodes[0]!.color)).toBe(true);
  });

  it('CA-layout-07 : branches divergentes ont des couleurs différentes sur leurs tips', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const c = makeCommit('ccc0003', 'C', ['aaa0001'], ['feature']);
    const layout = computeLayout(
      makeInput([a, b, c], { main: 'bbb0002', feature: 'ccc0003' }),
    );
    const mainColor = nodeOf('bbb0002', layout).color;
    const featureColor = nodeOf('ccc0003', layout).color;
    expect(mainColor).not.toBe(featureColor);
  });
});

// ---------------------------------------------------------------------------
// Tests via le moteur (intégration allCommits + computeLayout)
// ---------------------------------------------------------------------------

describe('computeLayout via moteur — intégration Phase 3', () => {
  it('layout depuis allCommits du moteur : nb nœuds = nb allCommits', () => {
    const engine = replay([
      'git init',
      'write file.txt "v1"',
      'git add file.txt',
      'git commit -m "A"',
      'write file.txt "v2"',
      'git add file.txt',
      'git commit -m "B"',
    ]);
    const snap = engine.snapshot();
    const input: LayoutInput = {
      commits: snap.allCommits!,
      branches: snap.branches,
      head: snap.head,
      tags: snap.tags,
    };
    const layout = computeLayout(input);
    expect(layout.nodes).toHaveLength(snap.allCommits!.length);
  });

  it('layout depuis allCommits inclut les commits de branches divergentes', () => {
    const engine = replay([
      'git init',
      'write file.txt "base"',
      'git add file.txt',
      'git commit -m "base"',
      'git branch feature',
      'write file.txt "main v2"',
      'git add file.txt',
      'git commit -m "main work"',
      'git checkout feature',
      'write other.txt "feature"',
      'git add other.txt',
      'git commit -m "feature work"',
    ]);
    const snap = engine.snapshot();
    const input: LayoutInput = {
      commits: snap.allCommits!,
      branches: snap.branches,
      head: snap.head,
      tags: snap.tags,
    };
    const layout = computeLayout(input);
    const messages = layout.nodes.map((n) => n.snapshot.message);
    expect(messages).toContain('base');
    expect(messages).toContain('main work');
    expect(messages).toContain('feature work');
  });

  it('layout déterministe sur allCommits réels (2 appels identiques)', () => {
    const commands = [
      'git init',
      'write file.txt "base"',
      'git add file.txt',
      'git commit -m "base"',
      'git branch feature',
      'write file.txt "main v2"',
      'git add file.txt',
      'git commit -m "main work"',
    ];
    const snap = replay(commands).snapshot();
    const input: LayoutInput = {
      commits: snap.allCommits!,
      branches: snap.branches,
      head: snap.head,
      tags: snap.tags,
    };
    expect(computeLayout(input)).toEqual(computeLayout(input));
  });
});

// ---------------------------------------------------------------------------
// Régression B1/B2 — merge en losange (M5)
// ---------------------------------------------------------------------------

describe('computeLayout — merge réel (régression B1/B2)', () => {
  /**
   * Topologie en losange :
   *   A (racine)
   *   ├── B (enfant de A)
   *   └── C (enfant de A)
   *       M (merge de [B, C] — seul tip : branches = { main: hashM })
   *
   * M est le tip de "main". B et C ne sont pointés par aucune branche.
   * Avant la correction B1 : B et C reçoivent tous les deux la lane de M → chevauchements.
   * Après la correction : B reste sur la lane héritée par premier-parent (lane de main),
   * C obtient une lane distincte, et toutes les positions (x, y) sont uniques.
   */
  const hashA = 'aaa0001';
  const hashB = 'bbb0002';
  const hashC = 'ccc0003';
  const hashM = 'mmm0004';

  function buildDiamondInput(): LayoutInput {
    const a = makeCommit(hashA, 'A (root)', []);
    const b = makeCommit(hashB, 'B', [hashA]);
    const c = makeCommit(hashC, 'C', [hashA]);
    // M est un merge commit ; parents[0] = B (continuation de branche), parents[1] = C
    const m = makeCommit(hashM, 'M (merge)', [hashB, hashC], ['main']);
    return makeInput([a, b, c, m], { main: hashM });
  }

  it('(a) toutes les positions (x, y) des nœuds sont UNIQUES', () => {
    const layout = computeLayout(buildDiamondInput());
    const positions = layout.nodes.map((n) => `${n.x},${n.y}`);
    const unique = new Set(positions);
    expect(unique.size).toBe(positions.length);
  });

  it('(b) B et C n\'ont pas la même lane', () => {
    const layout = computeLayout(buildDiamondInput());
    const laneB = nodeOf(hashB, layout).lane;
    const laneC = nodeOf(hashC, layout).lane;
    expect(laneB).not.toBe(laneC);
  });

  it('(c) au moins une arête de M vers ses parents a type === "merge"', () => {
    const layout = computeLayout(buildDiamondInput());
    // Arêtes issues de M (toHash === hashM)
    const edgesFromM = layout.edges.filter((e) => e.toHash === hashM);
    expect(edgesFromM.length).toBe(2); // M a 2 parents
    const hasMergeEdge = edgesFromM.some((e) => e.type === 'merge');
    expect(hasMergeEdge).toBe(true);
  });

  it('déterminisme : deux appels identiques → même layout', () => {
    const input = buildDiamondInput();
    expect(computeLayout(input)).toEqual(computeLayout(input));
  });
});

// ---------------------------------------------------------------------------
// Dimensions du layout
// ---------------------------------------------------------------------------

describe('computeLayout — dimensions width/height cohérentes', () => {
  it('width = padding.left + laneCount * laneWidth + padding.right', () => {
    const a = makeCommit('aaa0001', 'A', []);
    const b = makeCommit('bbb0002', 'B', ['aaa0001'], ['main']);
    const c = makeCommit('ccc0003', 'C', ['aaa0001'], ['feature']);
    const layout = computeLayout(
      makeInput([a, b, c], { main: 'bbb0002', feature: 'ccc0003' }),
    );
    const expected =
      layout.padding.left + layout.laneCount * 80 + layout.padding.right;
    expect(layout.width).toBe(expected);
  });

  it('height inclut le padding et au moins un commit', () => {
    const c = makeCommit('aaaa001', 'A', [], ['main']);
    const layout = computeLayout(makeInput([c], { main: 'aaaa001' }));
    expect(layout.height).toBeGreaterThan(layout.padding.top + layout.padding.bottom);
  });

  it('padding a les 4 propriétés (top, bottom, left, right)', () => {
    const layout = computeLayout(makeInput([]));
    expect(typeof layout.padding.top).toBe('number');
    expect(typeof layout.padding.bottom).toBe('number');
    expect(typeof layout.padding.left).toBe('number');
    expect(typeof layout.padding.right).toBe('number');
  });
});
