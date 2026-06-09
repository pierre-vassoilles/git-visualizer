# Phase 3 – Visualisation graphique : Rendu SVG et interactions

## Contexte

Cette spec couvre le **rendu visuel** du graphe Git dans `GraphView.vue` : transformation de la géométrie `GraphLayout` (voir spec 16) en SVG interactif avec badges de refs, tooltips, pan/zoom et mise en évidence.

## 1. Architecture du rendu

### 1.1 Flux de données

```
store.snapshot (réactif)
    ↓
calculateLayout(snapshot) → GraphLayout (géométrie)
    ↓
GraphView.vue (rendu SVG)
    ↓
Écran (user interactions ← → pan/zoom/hover)
```

### 1.2 Structure du composant

```vue
<script setup lang="ts">
// Import du layout
import { calculateLayout } from '@/graph/layout';
import type { GraphLayout, GraphNode, GraphEdge } from '@/graph/layout';

// Store
import { useRepoStore } from '@/stores/repo';
const repo = useRepoStore();

// Computed
const graphLayout = computed(() => {
  if (!repo.snapshot.initialized) {
    return null;
  }
  return calculateLayout({
    commits: repo.snapshot.allCommits ?? repo.snapshot.commits,
    branches: repo.snapshot.branches,
    head: repo.snapshot.head,
    tags: repo.snapshot.tags,
  });
});

// State
const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const hoveredHash = ref<string | null>(null);
const selectedHash = ref<string | null>(null);
</script>

<template>
  <div class="graph-view" @wheel="handleWheel" @mousedown="startPan">
    <svg
      v-if="graphLayout"
      :width="`${graphLayout.width * zoom}px`"
      :height="`${graphLayout.height * zoom}px`"
      class="graph-svg"
      :style="{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }"
    >
      <!-- Arêtes (parent → enfant) -->
      <g class="edges">
        <line
          v-for="edge in graphLayout.edges"
          :key="`edge-${edge.fromHash}-${edge.toHash}`"
          :x1="edge.fromX"
          :y1="edge.fromY"
          :x2="edge.toX"
          :y2="edge.toY"
          class="edge"
          :class="{ 'edge-merge': edge.type === 'merge' }"
          :stroke="getEdgeColor(edge)"
        />
      </g>

      <!-- Nœuds (commits) -->
      <g class="nodes">
        <circle
          v-for="node in graphLayout.nodes"
          :key="`node-${node.hash}`"
          :cx="node.x"
          :cy="node.y"
          :r="nodeRadius"
          :fill="node.color"
          class="node"
          :class="{
            'node-hovered': hoveredHash === node.hash,
            'node-selected': selectedHash === node.hash,
            'node-head': isHeadCommit(node.hash),
          }"
          @mouseenter="hoveredHash = node.hash"
          @mouseleave="hoveredHash = null"
          @click="selectNode(node.hash)"
        />
      </g>

      <!-- Badges (refs : branches, HEAD, tags) -->
      <g class="badges">
        <g
          v-for="node in graphLayout.nodes"
          :key="`badges-${node.hash}`"
          :transform="`translate(${node.x}, ${node.y - nodeRadius - 8})`"
        >
          <!-- HEAD badge (si HEAD pointe ce commit) -->
          <g v-if="isHeadCommit(node.hash)" class="badge-head">
            <rect
              x="0"
              y="0"
              width="50"
              height="16"
              fill="#fff"
              stroke="#333"
              rx="2"
            />
            <text x="4" y="12" font-size="10" fill="#333">HEAD</text>
          </g>

          <!-- Branch badges -->
          <g
            v-for="(branch, idx) in node.snapshot.branches"
            :key="`branch-${node.hash}-${idx}`"
            :transform="`translate(0, ${idx > 0 ? idx * 20 : 0})`"
            class="badge-branch"
          >
            <rect
              :x="idx > 0 ? 0 : 50"
              y="0"
              width="60"
              height="16"
              fill="#e0e7ff"
              stroke="#4f46e5"
              rx="2"
            />
            <text
              :x="idx > 0 ? 4 : 54"
              y="12"
              font-size="9"
              fill="#4f46e5"
            >
              {{ branch }}
            </text>
          </g>

          <!-- Tag badges -->
          <g
            v-for="(tag, idx) in node.snapshot.tags"
            :key="`tag-${node.hash}-${idx}`"
            :transform="`translate(0, ${(node.snapshot.branches.length + idx) * 20})`"
            class="badge-tag"
          >
            <rect
              x="0"
              y="0"
              width="60"
              height="16"
              fill="#fef3c7"
              stroke="#f59e0b"
              rx="2"
            />
            <text x="4" y="12" font-size="9" fill="#f59e0b">{{ tag }}</text>
          </g>
        </g>
      </g>

      <!-- Hash court + message (label principal) -->
      <g class="labels">
        <g
          v-for="node in graphLayout.nodes"
          :key="`label-${node.hash}`"
          class="label"
        >
          <text
            :x="node.x + nodeRadius + 10"
            :y="node.y - 4"
            font-size="11"
            font-family="monospace"
            fill="#333"
            class="label-hash"
          >
            {{ node.snapshot.shortHash }}
          </text>
          <text
            :x="node.x + nodeRadius + 10"
            :y="node.y + 10"
            font-size="10"
            fill="#666"
            class="label-message"
          >
            {{ truncateMessage(node.snapshot.message, 40) }}
          </text>
        </g>
      </g>
    </svg>

    <!-- Placeholder si pas initialisé -->
    <div v-else class="graph-placeholder">
      <p class="title">Graphe Git</p>
      <p class="hint">Initialisez un dépôt pour voir le graphe.</p>
    </div>

    <!-- Tooltip au survol -->
    <div v-if="hoveredHash && hoveredNode" class="tooltip">
      <div class="tooltip-hash">{{ hoveredNode.snapshot.hash }}</div>
      <div class="tooltip-message">{{ hoveredNode.snapshot.message }}</div>
      <div v-if="hoveredNode.snapshot.parents.length" class="tooltip-parents">
        Parents: {{ hoveredNode.snapshot.parents.slice(0, 2).join(', ') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// (suite du script setup, voir section 2)
</script>

<style scoped>
/* (voir section 3) */
</style>
```

## 2. Logique Vue du composant

### 2.1 Computed

```typescript
const hoveredNode = computed(() => {
  if (!hoveredHash.value || !graphLayout.value) return null;
  return graphLayout.value.nodes.find(n => n.hash === hoveredHash.value);
});

const isHeadDetached = computed(() => {
  return repo.snapshot.head.type === 'detached';
});

const headHash = computed(() => {
  if (repo.snapshot.head.type === 'detached') {
    return repo.snapshot.head.hash;
  }
  // Trouver le commit pointé par la branche HEAD
  return repo.snapshot.branches[repo.snapshot.head.name] ?? null;
});
```

### 2.2 Méthodes

```typescript
function isHeadCommit(hash: string): boolean {
  return hash === headHash.value;
}

function selectNode(hash: string): void {
  selectedHash.value = selectedHash.value === hash ? null : hash;
}

function getEdgeColor(edge: GraphEdge): string {
  // Couleur selon la source (lane du parent)
  const node = graphLayout.value?.nodes.find(n => n.hash === edge.fromHash);
  return node?.color ?? '#999';
}

function truncateMessage(msg: string, maxLen: number): string {
  return msg.length > maxLen ? msg.slice(0, maxLen) + '…' : msg;
}

function handleWheel(e: WheelEvent): void {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  zoom.value = Math.max(0.1, Math.min(5, zoom.value * delta));
}

function startPan(e: MouseEvent): void {
  if (e.button !== 2) return; // Clic droit pour pan
  const startX = e.clientX;
  const startY = e.clientY;
  const startPanX = panX.value;
  const startPanY = panY.value;

  function onMouseMove(moveEvent: MouseEvent) {
    panX.value = startPanX + (moveEvent.clientX - startX);
    panY.value = startPanY + (moveEvent.clientY - startY);
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}
```

## 3. Styles CSS

```css
.graph-view {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fafafa;
  position: relative;
  user-select: none;
}

.graph-svg {
  cursor: grab;
  transform-origin: 0 0;
  transition: transform 0.2s ease;
}

.graph-svg:active {
  cursor: grabbing;
}

/* Arêtes */
.edge {
  stroke: #999;
  stroke-width: 1.5;
  fill: none;
  opacity: 0.6;
}

.edge-merge {
  stroke-dasharray: 3, 3;
  opacity: 0.5;
}

/* Nœuds */
.node {
  cursor: pointer;
  opacity: 0.8;
  transition: all 0.15s ease;
  stroke: #fff;
  stroke-width: 2;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
}

.node:hover {
  opacity: 1;
  stroke-width: 3;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.node-hovered {
  opacity: 1;
  stroke-width: 3;
}

.node-selected {
  stroke: #000;
  stroke-width: 3;
}

.node-head {
  stroke: #ef4444;
  stroke-width: 3;
  filter: drop-shadow(0 0 6px rgba(239, 68, 68, 0.5));
}

/* Badges */
.badge-head {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
}

.badge-branch {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
}

.badge-tag {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
}

.badge-head text,
.badge-branch text,
.badge-tag text {
  font-weight: 500;
}

/* Labels */
.label {
  pointer-events: none;
}

.label-hash {
  font-weight: 600;
}

.label-message {
  fill: #888;
}

/* Placeholder */
.graph-placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #999;
}

.graph-placeholder .title {
  font-size: 1.2rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.graph-placeholder .hint {
  font-size: 0.9rem;
  color: #bbb;
}

/* Tooltip */
.tooltip {
  position: fixed;
  background: #333;
  color: #fff;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
  z-index: 1000;
  pointer-events: none;
  max-width: 300px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.tooltip-hash {
  font-weight: 600;
  margin-bottom: 4px;
}

.tooltip-message {
  margin-bottom: 4px;
  word-break: break-word;
}

.tooltip-parents {
  opacity: 0.8;
  font-size: 10px;
}
```

## 4. Rendu des arêtes (détails)

### 4.1 Arêtes linéaires

Les arêtes **même-lane** sont des lignes droites simples :

```typescript
// Dans le template SVG
<line
  v-for="edge in graphLayout.edges.filter(e => e.type === 'linear')"
  :key="`edge-${edge.fromHash}-${edge.toHash}`"
  :x1="edge.fromX"
  :y1="edge.fromY"
  :x2="edge.toX"
  :y2="edge.toY"
  class="edge"
  stroke="#999"
  stroke-width="1.5"
/>
```

### 4.2 Arêtes de merge (courbes)

Les arêtes **lanes différentes** sont des **courbes de Bézier cubiques** qui serpentent entre les lanes pour éviter les croisements.

```typescript
function getBezierPath(edge: GraphEdge, laneWidth: number = 80): string {
  const { fromX, fromY, toX, toY } = edge;
  const midY = (fromY + toY) / 2;

  // Points de contrôle : "écarter" latéralement pour éviter les croisements
  const controlX1 = fromX + (toX - fromX) * 0.2;
  const controlX2 = toX - (toX - fromX) * 0.2;

  return `
    M ${fromX} ${fromY}
    C ${controlX1} ${midY},
      ${controlX2} ${midY},
      ${toX} ${toY}
  `;
}

// Dans le template SVG
<path
  v-for="edge in graphLayout.edges.filter(e => e.type === 'merge')"
  :key="`edge-${edge.fromHash}-${edge.toHash}`"
  :d="getBezierPath(edge)"
  class="edge edge-merge"
  stroke="#999"
  stroke-width="1.5"
  stroke-dasharray="3, 3"
/>
```

## 5. Badges et décoration des refs

### 5.1 Positionnement des badges

Les badges (branches, tags, HEAD) sont positionnés **au-dessus du nœud** :

- **HEAD badge** : petit rectangle blanc avec texte noir "HEAD".
- **Branch badges** : rectangles bleus clair avec texte bleu (`#e0e7ff` / `#4f46e5`).
- **Tag badges** : rectangles jaunes avec texte orange (`#fef3c7` / `#f59e0b`).

**Disposition verticale** : si plusieurs branches/tags, les empiler verticalement avec offset +20px chacun.

### 5.2 Styles de badges

```typescript
interface BadgeStyle {
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  width: number;
}

const badgeStyles: Record<string, BadgeStyle> = {
  head: {
    label: 'HEAD',
    bgColor: '#fff',
    textColor: '#333',
    borderColor: '#333',
    width: 50,
  },
  branch: {
    bgColor: '#e0e7ff',
    textColor: '#4f46e5',
    borderColor: '#4f46e5',
    width: 60,
  },
  tag: {
    bgColor: '#fef3c7',
    textColor: '#f59e0b',
    borderColor: '#f59e0b',
    width: 60,
  },
};
```

### 5.3 HEAD détaché

Si HEAD est détaché :

- Le commit pointé par `head.hash` reçoit un badge "HEAD (détaché)" ou une surbrillance distinctive.
- Optionnel : afficher le hash court du HEAD détaché à côté du commit.

```typescript
const headBadgeLabel = computed(() => {
  if (repo.snapshot.head.type === 'detached') {
    return `HEAD (${repo.snapshot.head.hash.slice(0, 7)})`;
  }
  return 'HEAD';
});
```

## 6. Interactions utilisateur

### 6.1 Hover (survol)

Au survol d'un nœud :

1. Le nœud devient **opaque à 100%**, stroke épaissit.
2. Une **tooltip** apparaît avec :
   - Hash complet (40 chars).
   - Message complet du commit.
   - Hashes des parents (jusqu'à 2 affichés).
3. Les **arêtes liées** au nœud se distinguent (couleur plus sombre, opacité 100%).

```typescript
function highlightRelatedEdges(hash: string): void {
  // Chercher les edges avec fromHash ou toHash === hash
  // Les mettre en classe 'edge-related' pour styling distinctif
}
```

**CSS pour arêtes liées** :

```css
.edge-related {
  stroke: #333;
  opacity: 1;
  stroke-width: 2.5;
}
```

### 6.2 Click (sélection)

Au click sur un nœud :

1. Toggle : le nœud est "sélectionné" (border noir, highlight).
2. Un panel latéral optionnel peut afficher les détails complets du commit.
3. Click ailleurs désélectionne.

### 6.3 Pan (déplacement)

**Clic droit + drag** : translate le graphe dans le viewport. Utiliser `transform: translate(panX, panY)` sur le SVG.

### 6.4 Zoom

**Scroll souris** : zoom in/out, limité à [0.1x, 5x]. Modifier le SVG avec `transform: scale(zoom)`.

**Comportement** : zoom au centre du viewport (ou position de la souris).

```typescript
function handleWheel(e: WheelEvent): void {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  zoom.value = Math.max(0.1, Math.min(5, zoom.value * delta));
}
```

## 7. Gestion des états limites

### 7.1 Dépôt non initialisé

Afficher un placeholder :

```
┌─────────────────────┐
│     Graphe Git      │
│                     │
│ Initialisez un      │
│ dépôt pour voir     │
│ le graphe.          │
└─────────────────────┘
```

### 7.2 Dépôt sans commit

Placeholder :

```
Aucun commit pour l'instant.
```

### 7.3 Branche unique linéaire

Tous les nœuds sur une lane, Y croissant régulièrement. Pas de courbes.

### 7.4 Nombreux commits (scroll)

- SVG peut être **plus large/haut que le viewport**.
- Le conteneur `.graph-view` a `overflow: hidden`.
- Pan & zoom permettent de naviguer.
- Optionnel : minimap (small preview dans un coin).

### 7.5 Commits très rapprochés (zoom out)

À zoom très bas (ex. 0.1x), les commits peuvent être illisibles. Optionnel : masquer les labels à faible zoom.

```typescript
const showLabels = computed(() => zoom.value > 0.4);
```

## 8. Critères d'acceptation (rendu et interactions)

### CA-graph-01 : Rendu SVG basique

- [ ] `GraphView.vue` remplace le placeholder.
- [ ] SVG rendu sans erreur (pas de console error).
- [ ] Nœuds (cercles) visibles, colorés.
- [ ] Arêtes (lignes) visibles, connectent les nœuds.

### CA-graph-02 : Labels et badges

- [ ] Chaque nœud affiche son shortHash + message.
- [ ] Branches affichent leurs noms (badge bleu).
- [ ] Tags affichent leurs noms (badge jaune).
- [ ] HEAD détaché marqué distinctement.

### CA-graph-03 : Hover et tooltip

- [ ] Survol d'un nœud → opacity/stroke changent.
- [ ] Tooltip apparaît avec hash + message + parents.
- [ ] Tooltip suit la souris.

### CA-graph-04 : Pan et zoom

- [ ] Scroll souris → zoom in/out (0.1x à 5x).
- [ ] Clic droit + drag → translate le graphe.
- [ ] Pan/zoom limites respectées.

### CA-graph-05 : Sélection

- [ ] Click nœud → sélectionné (border noir).
- [ ] Click ailleurs → désélectionné.
- [ ] Un seul nœud sélectionné à la fois (ou multi-select optionnel).

### CA-graph-06 : États limites

- [ ] Dépôt non initialisé → placeholder, pas erreur SVG.
- [ ] Dépôt sans commit → placeholder.
- [ ] Branche linéaire → tous les nœuds lane 0, Y croissants.
- [ ] Nombreux commits (>100) → SVG redimensionné, pan/zoom fonctionne.

### CA-graph-07 : Arêtes de merge

- [ ] Commits avec 2+ parents : 2+ arêtes présentes.
- [ ] Arêtes merge : courbes (path SVG, pas lignes droites).
- [ ] Arêtes merge : pointillé (stroke-dasharray).

### CA-graph-08 : Couleurs déterministes

- [ ] Même branche = même couleur.
- [ ] Primary branch (`main`) = couleur 0.
- [ ] Refresh de la page → mêmes couleurs.

### CA-graph-09 : HEAD détaché

- [ ] Si HEAD détaché : commit pointé marqué (badge rouge / halo).
- [ ] Si HEAD branche : badge "HEAD -> main" (ex.).
- [ ] Distinction visuelle claire.

## 9. Considérations de performance

### 9.1 Virtualisation (optionnel, Phase 4+)

Pour dépôts > 1000 commits, considérer :

- **SVG virtuel** : ne rendre que les nœuds visibles dans le viewport.
- **Lazy loading** : charger les commits par batch.

### 9.2 Debouncing

- Zoom/pan : debounce les re-render (50ms).
- Hover : debounce la tooltip (100ms).

```typescript
const debouncedTooltip = useDebounceFn(() => {
  // Recalculer la tooltip
}, 100);
```

### 9.3 Memoization

Mémoriser `GraphLayout` tant que le snapshot n'a pas changé.

```typescript
const graphLayout = computed(() => {
  // calculateLayout est pur : pas de re-run si input identique
  return calculateLayout({
    commits: repo.snapshot.allCommits ?? repo.snapshot.commits,
    branches: repo.snapshot.branches,
    head: repo.snapshot.head,
    tags: repo.snapshot.tags,
  });
});
```

## 10. Palette de couleurs proposée

```typescript
const defaultColorPalette = (): string[] => [
  '#3b82f6', // Bleu (main)
  '#ef4444', // Rouge (feature/fix)
  '#10b981', // Vert (develop)
  '#f59e0b', // Orange (release)
  '#8b5cf6', // Violet (hotfix)
  '#ec4899', // Rose (temp)
  '#06b6d4', // Cyan (test)
  '#6366f1', // Indigo (another)
  '#14b8a6', // Teal (another)
  '#d97706', // Amber (another)
];
```

## 11. Références

- **15-graph-model.md** : contrat du snapshot, extension `allCommits`.
- **16-graph-layout.md** : structure `GraphLayout`, `GraphNode`, `GraphEdge`.
- **GraphView.vue** : composant à implémenter.

---

**Prochaines étapes** :
- Implémentation dans `src/components/GraphView.vue`.
- Implémentation dans `src/graph/layout.ts`.
- Tests Vitest : `tests/graph-render.test.ts` (snapshots SVG, interactions).
- Itération sur le design (styles CSS, couleurs, spacing).
