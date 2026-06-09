# Phase 3 – Quick Start pour développeurs

## TL;DR

Vous implémentez la visualisation du DAG Git (graphe avec branches colorées). Trois étapes :

1. **Core (moteur)** : `getAllCommitsTopologicalOrder()` → expose TOUS les commits du dépôt.
2. **Layout (algorithme pur)** : `calculateLayout(commits, branches)` → géométrie 2D (x, y, lanes, couleurs).
3. **UI (Vue/SVG)** : `GraphView.vue` → rendu SVG interactif (pan, zoom, hover).

---

## 1. Core : Exposer tous les commits

### Fichier : `src/core/repository.ts`

**Ajouter** :

```typescript
/**
 * Retourne TOUS les commits du dépôt en ordre topologique (enfants avant parents).
 * Contrairement à getCommitHistoryWithHashes qui ne retourne que depuis HEAD.
 */
export function getAllCommitsTopologicalOrder(repo: Repository): CommitWithHash[] {
  // 1. Collecter tous les commits
  const commits = new Map<string, Commit>();
  for (const [hash, obj] of Object.entries(repo.objects)) {
    if (obj?.type === 'commit') {
      commits.set(hash, obj);
    }
  }

  if (commits.size === 0) return [];

  // 2. Construire enfants (inverse de parents)
  const children = new Map<string, string[]>();
  for (const [hash, commit] of commits) {
    for (const parent of commit.parents) {
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(hash);
    }
  }

  // 3. DFS post-ordre : enfants avant parents
  const visited = new Set<string>();
  const result: CommitWithHash[] = [];

  function dfs(hash: string) {
    if (visited.has(hash)) return;
    visited.add(hash);

    // Enfants d'abord (post-ordre)
    for (const childHash of (children.get(hash) ?? []).sort()) {
      dfs(childHash);
    }

    const commit = commits.get(hash);
    if (commit) {
      result.push({ hash, commit });
    }
  }

  // Démarrer depuis les racines (pas de parents)
  for (const [hash, commit] of commits) {
    if (commit.parents.length === 0) {
      dfs(hash);
    }
  }

  // Backup : visiter tous si pas de racines (DAG cassé)
  for (const hash of commits.keys()) {
    dfs(hash);
  }

  return result;
}
```

### Fichier : `src/core/engine.ts`

**Dans la méthode `snapshot()`** , après calcul de `commits` (depuis HEAD) :

```typescript
// === NOUVEAU (Phase 3) ===
// Tous les commits du dépôt (pour le graphe complet)
const allCommitsRaw = getAllCommitsTopologicalOrder(repo);
const allCommits: SnapshotCommit[] = allCommitsRaw.map(({ hash, commit }) => ({
  hash,
  shortHash: shortHash(hash),
  message: commit.message,
  parents: Object.freeze([...commit.parents]) as string[],
  branches: Object.freeze([...(hashToBranches[hash] ?? [])]) as string[],
  tags: Object.freeze([...(hashToTags[hash] ?? [])]) as string[],
}));

// Retourner le snapshot
return Object.freeze({
  initialized,
  branches: Object.freeze(branches),
  head: Object.freeze(headState),
  commits: Object.freeze(commits.map((c) => Object.freeze(c))) as SnapshotCommit[],
  tags: Object.freeze(tags),
  indexPaths: Object.freeze(indexPaths) as string[],
  files: Object.freeze(files.map((f) => Object.freeze(f))) as SnapshotFile[],
  allCommits: Object.freeze(allCommits.map((c) => Object.freeze(c))) as SnapshotCommit[], // NOUVEAU
});
```

**Tests** : `tests/graph-layout.test.ts`

```typescript
describe('getAllCommitsTopologicalOrder', () => {
  it('returns empty array for empty repo', () => {
    const repo = createEmptyRepo();
    expect(getAllCommitsTopologicalOrder(repo)).toEqual([]);
  });

  it('returns single commit', () => {
    // Add one commit
    const repo = createEmptyRepo();
    repo.execute('git init');
    repo.execute('echo hello > file.txt');
    repo.execute('git add file.txt');
    repo.execute('git commit -m "First"');

    const commits = getAllCommitsTopologicalOrder(repo);
    expect(commits.length).toBe(1);
  });

  it('respects topological order (children before parents)', () => {
    // A <- B <- C (linear history)
    // Should return [C, B, A] (children first)
    const commits = getAllCommitsTopologicalOrder(repo);
    expect(commits[0].commit.message).toBe('C');
    expect(commits[1].commit.message).toBe('B');
    expect(commits[2].commit.message).toBe('A');
  });

  it('includes all branches (not just from HEAD)', () => {
    // main: A <- B
    // feature: A <- C
    // HEAD = main
    // Should include both B and C (unlike getCommitHistoryWithHashes)
    const commits = getAllCommitsTopologicalOrder(repo);
    const hashes = commits.map(c => c.commit.message);
    expect(hashes).toContain('B');
    expect(hashes).toContain('C');
  });
});
```

---

## 2. Layout : Algorithme pur

### Fichier : `src/graph/layout.ts`

**Structure types** :

```typescript
export interface GraphNode {
  hash: string;
  x: number;
  y: number;
  lane: number;
  color: string;  // hex, ex. '#3b82f6'
  snapshot: SnapshotCommit;
}

export interface GraphEdge {
  fromHash: string;
  toHash: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  type: 'linear' | 'merge';
  fromLane: number;
  toLane: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  laneCount: number;
  width: number;
  height: number;
  padding: { top: number; bottom: number; left: number; right: number };
}

export interface LayoutOptions {
  laneWidth?: number;    // défaut: 80
  commitHeight?: number; // défaut: 60
  nodeRadius?: number;   // défaut: 6
}

export interface LayoutInput {
  commits: readonly SnapshotCommit[];
  branches: Readonly<Record<string, string>>;
  head: Readonly<{ type: 'branch'; name: string } | { type: 'detached'; hash: string }>;
  tags: Readonly<Record<string, string>>;
  options?: LayoutOptions;
}
```

**Fonction principale** :

```typescript
export function calculateLayout(input: LayoutInput): GraphLayout {
  const { commits, branches, head, tags, options = {} } = input;

  // Cas vide
  if (commits.length === 0) {
    return {
      nodes: [],
      edges: [],
      laneCount: 0,
      width: 0,
      height: 0,
      padding: { top: 40, bottom: 40, left: 40, right: 40 },
    };
  }

  // === Étape 1 : Tri topologique ===
  const topSorted = topologicalSort(commits);

  // === Étape 2 : Profondeur ===
  const depths = calculateDepths(commits, topSorted);

  // === Étape 3 : Lanes ===
  const laneAssignments = assignLanes(commits, branches, depths);

  // === Étape 4 : Positions (x, y) ===
  const laneWidth = options.laneWidth ?? 80;
  const commitHeight = options.commitHeight ?? 60;
  const padding = { top: 40, bottom: 40, left: 40, right: 40 };

  const positions = new Map<string, { x: number; y: number }>();
  for (const commit of commits) {
    const lane = laneAssignments.get(commit.hash) ?? 0;
    const depth = depths.get(commit.hash) ?? 0;
    positions.set(commit.hash, {
      x: padding.left + lane * laneWidth,
      y: padding.top + depth * commitHeight,
    });
  }

  // === Étape 5 : Arêtes ===
  const edges = buildEdges(commits, laneAssignments, positions);

  // === Étape 6 : Couleurs ===
  const colorPalette = defaultColorPalette();
  const laneToColor = assignColors(branches, laneAssignments, colorPalette);

  // === Construire nœuds ===
  const nodes: GraphNode[] = commits.map(commit => ({
    hash: commit.hash,
    x: positions.get(commit.hash)!.x,
    y: positions.get(commit.hash)!.y,
    lane: laneAssignments.get(commit.hash) ?? 0,
    color: laneToColor.get(laneAssignments.get(commit.hash) ?? 0) ?? colorPalette[0],
    snapshot: commit,
  }));

  // === Dimensions ===
  const laneCount = Math.max(...[...laneAssignments.values()], 0) + 1;
  const maxDepth = Math.max(...[...depths.values()], 0);
  const width = padding.left + laneCount * laneWidth + padding.right;
  const height = padding.top + (maxDepth + 1) * commitHeight + padding.bottom;

  return { nodes, edges, laneCount, width, height, padding };
}

function defaultColorPalette(): string[] {
  return [
    '#3b82f6', // Bleu
    '#ef4444', // Rouge
    '#10b981', // Vert
    '#f59e0b', // Orange
    '#8b5cf6', // Violet
    '#ec4899', // Rose
    '#06b6d4', // Cyan
    '#6366f1', // Indigo
  ];
}
```

**Helper functions** (voir spec 16 pour détails) :

- `topologicalSort(commits)` → liste ordonnée.
- `calculateDepths(commits, topSorted)` → Map hash → depth.
- `assignLanes(commits, branches, depths)` → Map hash → lane.
- `buildEdges(commits, lanes, positions)` → GraphEdge[].
- `assignColors(branches, lanes, palette)` → Map lane → color.

---

## 3. UI : Composant Vue

### Fichier : `src/components/GraphView.vue`

**Squelette** :

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { calculateLayout } from '@/graph/layout';

const repo = useRepoStore();
const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const hoveredHash = ref<string | null>(null);

const graphLayout = computed(() => {
  if (!repo.snapshot.initialized) return null;
  return calculateLayout({
    commits: repo.snapshot.allCommits ?? repo.snapshot.commits,
    branches: repo.snapshot.branches,
    head: repo.snapshot.head,
    tags: repo.snapshot.tags,
  });
});

const headHash = computed(() => {
  if (repo.snapshot.head.type === 'detached') return repo.snapshot.head.hash;
  return repo.snapshot.branches[repo.snapshot.head.name] ?? null;
});

function handleWheel(e: WheelEvent) {
  e.preventDefault();
  zoom.value = Math.max(0.1, Math.min(5, zoom.value * (e.deltaY > 0 ? 0.9 : 1.1)));
}

function handleMouseDown(e: MouseEvent) {
  if (e.button !== 2) return; // Clic droit
  const start = { x: e.clientX, y: e.clientY, panX: panX.value, panY: panY.value };
  const move = (me: MouseEvent) => {
    panX.value = start.panX + (me.clientX - start.x);
    panY.value = start.panY + (me.clientY - start.y);
  };
  const up = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

function isHeadCommit(hash: string) {
  return hash === headHash.value;
}
</script>

<template>
  <div class="graph-view" @wheel="handleWheel" @mousedown="handleMouseDown">
    <svg v-if="graphLayout" class="graph-svg" :width="graphLayout.width" :height="graphLayout.height"
      :style="{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }">
      <!-- Arêtes -->
      <g class="edges">
        <line v-for="edge in graphLayout.edges" :key="`edge-${edge.fromHash}-${edge.toHash}`"
          :x1="edge.fromX" :y1="edge.fromY" :x2="edge.toX" :y2="edge.toY"
          class="edge" :class="{ 'edge-merge': edge.type === 'merge' }" stroke="#999" stroke-width="1.5" />
      </g>

      <!-- Nœuds -->
      <g class="nodes">
        <circle v-for="node in graphLayout.nodes" :key="`node-${node.hash}`"
          :cx="node.x" :cy="node.y" :r="6" :fill="node.color"
          class="node" :class="{ 'node-head': isHeadCommit(node.hash) }"
          @mouseenter="hoveredHash = node.hash" @mouseleave="hoveredHash = null" />
      </g>

      <!-- Labels -->
      <g class="labels">
        <text v-for="node in graphLayout.nodes" :key="`label-${node.hash}`"
          :x="node.x + 16" :y="node.y - 4" font-size="11" font-family="monospace" fill="#333">
          {{ node.snapshot.shortHash }}
        </text>
      </g>

      <!-- Badges (braches, tags, HEAD) -->
      <g class="badges">
        <g v-for="node in graphLayout.nodes" :key="`badges-${node.hash}`"
          :transform="`translate(${node.x}, ${node.y - 14})`">
          <rect v-if="isHeadCommit(node.hash)" x="0" y="0" width="50" height="16"
            fill="#fff" stroke="#333" rx="2" />
          <text v-if="isHeadCommit(node.hash)" x="4" y="12" font-size="10" fill="#333">HEAD</text>
          <rect v-for="(branch, idx) in node.snapshot.branches" :key="`branch-${idx}`"
            :y="idx > 0 ? idx * 20 : 0" x="0" width="60" height="16"
            fill="#e0e7ff" stroke="#4f46e5" rx="2" />
          <text v-for="(branch, idx) in node.snapshot.branches" :key="`branch-text-${idx}`"
            :y="idx > 0 ? idx * 20 + 12 : 12" x="4" font-size="9" fill="#4f46e5">
            {{ branch }}
          </text>
        </g>
      </g>
    </svg>

    <div v-else class="graph-placeholder">
      <p class="title">Graphe Git</p>
      <p class="hint">Initialisez un dépôt pour voir le graphe.</p>
    </div>
  </div>
</template>

<style scoped>
.graph-view {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fafafa;
}

.graph-svg {
  transform-origin: 0 0;
  cursor: grab;
}

.node {
  cursor: pointer;
  stroke: #fff;
  stroke-width: 2;
  opacity: 0.8;
  transition: all 0.15s;
}

.node:hover,
.node-head {
  opacity: 1;
  stroke-width: 3;
}

.node-head {
  stroke: #ef4444;
  filter: drop-shadow(0 0 6px rgba(239, 68, 68, 0.5));
}

.edge {
  stroke: #999;
  opacity: 0.6;
  fill: none;
}

.edge-merge {
  stroke-dasharray: 3, 3;
  opacity: 0.5;
}

.edge-merge {
  stroke-dasharray: 3, 3;
}

.graph-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  flex-direction: column;
  color: #999;
}

.title {
  font-weight: 600;
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
}
</style>
```

---

## 4. Tests essentiels (Vitest)

### `tests/graph-layout.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { calculateLayout } from '@/graph/layout';
import type { SnapshotCommit } from '@/core/engine';

describe('calculateLayout', () => {
  // Cas vide
  it('returns empty layout for no commits', () => {
    const layout = calculateLayout({
      commits: [],
      branches: {},
      head: { type: 'branch', name: 'main' },
      tags: {},
    });
    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
  });

  // Un commit
  it('places single commit at (paddingLeft, paddingTop)', () => {
    const commit: SnapshotCommit = {
      hash: 'abc123',
      shortHash: 'abc1234',
      message: 'First',
      parents: [],
      branches: ['main'],
      tags: [],
    };
    const layout = calculateLayout({
      commits: [commit],
      branches: { main: 'abc123' },
      head: { type: 'branch', name: 'main' },
      tags: {},
    });
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0].x).toBe(40); // paddingLeft
    expect(layout.nodes[0].y).toBe(40); // paddingTop
    expect(layout.nodes[0].lane).toBe(0);
  });

  // Topologie
  it('respects topological order (parents before children)', () => {
    const commitA: SnapshotCommit = {
      hash: 'aaa',
      shortHash: 'aaa0000',
      message: 'A',
      parents: [],
      branches: [],
      tags: [],
    };
    const commitB: SnapshotCommit = {
      hash: 'bbb',
      shortHash: 'bbb0000',
      message: 'B',
      parents: ['aaa'],
      branches: ['main'],
      tags: [],
    };
    const layout = calculateLayout({
      commits: [commitB, commitA], // Ordre quelconque en entrée
      branches: { main: 'bbb' },
      head: { type: 'branch', name: 'main' },
      tags: {},
    });
    const nodeA = layout.nodes.find(n => n.hash === 'aaa')!;
    const nodeB = layout.nodes.find(n => n.hash === 'bbb')!;
    expect(nodeA.y).toBeLessThan(nodeB.y); // A avant B
  });

  // Déterminisme
  it('produces same layout on repeated calls', () => {
    const input = { /* ... */ };
    const layout1 = calculateLayout(input);
    const layout2 = calculateLayout(input);
    expect(layout1.nodes).toEqual(layout2.nodes);
    expect(layout1.edges).toEqual(layout2.edges);
  });
});
```

---

## 5. Checklist de développement

### Phase 1 : Core

- [ ] `getAllCommitsTopologicalOrder()` implémentée.
- [ ] Tests CA-model-01/02/03/04 passent.
- [ ] `engine.ts` expose `allCommits`.

### Phase 2 : Layout

- [ ] `calculateLayout()` implémentée (6 étapes).
- [ ] Tests CA-layout-01/02/.../07 passent.
- [ ] Déterminisme vérifié (1000 appels identiques).

### Phase 3 : UI

- [ ] `GraphView.vue` remplace placeholder.
- [ ] SVG rendu (nœuds, arêtes, labels, badges).
- [ ] Interactions (pan, zoom, hover).
- [ ] Tests CA-graph-01/02/.../09 passent.

### Validation finale

- [ ] `npm run build` vert.
- [ ] `npm test` vert.
- [ ] Revue code OK.
- [ ] DAG visualisé correctement (démo).

---

## 6. Débogage rapide

**L'algorithme retourne un layout vide** ?
→ Vérifier que `commits` n'est pas vide. Vérifier `getAllCommitsTopologicalOrder()`.

**Les nœuds se chevauchent** ?
→ Vérifier les valeurs de `laneWidth` et `commitHeight` (augmenter).

**Les arêtes ne connectent pas les nœuds** ?
→ Vérifier que `positions.get()` retourne quelque chose pour tous les hashes.

**Couleurs non déterministes** ?
→ Vérifier que la palette est fixe, pas aléatoire. Vérifier le tiebreaker du hash de branche.

**SVG ne rendu pas du tout** ?
→ Vérifier que `graphLayout` est non-null. Vérifier console pour erreurs JS.

---

## 7. Ressources

- **Spec complète** : `15-graph-model.md`, `16-graph-layout.md`, `17-graph-render.md`.
- **Index** : `PHASE3-INDEX.md`.
- **Summary** : `PHASE3-SUMMARY.md`.
- **Code existant** : `src/core/engine.ts`, `src/stores/repo.ts`.

---

**Bon coding ! 🚀**

Phase 3 = 3–5 jours si layout + UI bien coordonnés. Tester chaque étape avant de passer à la suivante.
