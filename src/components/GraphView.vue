<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue';
import { computeLayout } from '@/graph/layout';
import type { GraphEdge, GraphNode } from '@/graph/types';
import { useRepoStore } from '@/stores/repo';

const repo = useRepoStore();

// ---------------------------------------------------------------------------
// Layout réactif (recalculé à chaque changement de snapshot)
// ---------------------------------------------------------------------------

const layout = computed(() => {
  const snap = repo.snapshot;
  if (!snap.initialized) return null;
  const commits = snap.allCommits ?? snap.commits;
  if (commits.length === 0) return null;
  return computeLayout({
    commits,
    branches: snap.branches,
    head: snap.head,
    tags: snap.tags,
  });
});

// ---------------------------------------------------------------------------
// HEAD helpers
// ---------------------------------------------------------------------------

const isHeadDetached = computed(() => repo.snapshot.head.type === 'detached');

const headHash = computed((): string | null => {
  const head = repo.snapshot.head;
  if (head.type === 'detached') return head.hash;
  return repo.snapshot.branches[head.name] ?? null;
});

const headBranchName = computed((): string | null => {
  const head = repo.snapshot.head;
  if (head.type === 'branch') return head.name;
  return null;
});

const headBadgeLabel = computed((): string => {
  if (isHeadDetached.value) {
    const head = repo.snapshot.head as { type: 'detached'; hash: string };
    return `HEAD (${head.hash.slice(0, 7)})`;
  }
  return 'HEAD';
});

function isHeadCommit(hash: string): boolean {
  return hash === headHash.value;
}

// ---------------------------------------------------------------------------
// Interaction state
// ---------------------------------------------------------------------------

const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const hoveredHash = ref<string | null>(null);
const selectedHash = ref<string | null>(null);
const tooltipX = ref(0);
const tooltipY = ref(0);

// ---------------------------------------------------------------------------
// Computed helpers
// ---------------------------------------------------------------------------

const hoveredNode = computed((): GraphNode | null => {
  if (!hoveredHash.value || !layout.value) return null;
  return layout.value.nodes.find(n => n.hash === hoveredHash.value) ?? null;
});

const showLabels = computed(() => zoom.value > 0.4);

const nodeRadius = 6;

// ---------------------------------------------------------------------------
// SVG rendering helpers
// ---------------------------------------------------------------------------

function getBezierPath(edge: GraphEdge): string {
  const { fromX, fromY, toX, toY } = edge;
  const midY = (fromY + toY) / 2;
  const controlX1 = fromX + (toX - fromX) * 0.2;
  const controlX2 = toX - (toX - fromX) * 0.2;
  return `M ${fromX} ${fromY} C ${controlX1} ${midY}, ${controlX2} ${midY}, ${toX} ${toY}`;
}

function getEdgeColor(edge: GraphEdge): string {
  const node = layout.value?.nodes.find(n => n.hash === edge.fromHash);
  return node?.color ?? '#999';
}

function truncateMessage(msg: string, maxLen: number): string {
  return msg.length > maxLen ? msg.slice(0, maxLen) + '…' : msg;
}

function isEdgeRelated(edge: GraphEdge): boolean {
  if (!hoveredHash.value) return false;
  return edge.fromHash === hoveredHash.value || edge.toHash === hoveredHash.value;
}

// Compute per-node badge list: HEAD badge + branch badges + tag badges
interface Badge {
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

function getNodeBadges(node: GraphNode): Badge[] {
  const badges: Badge[] = [];

  // HEAD badge
  if (isHeadCommit(node.hash)) {
    if (!isHeadDetached.value && headBranchName.value && node.snapshot.branches.includes(headBranchName.value)) {
      // HEAD -> branchname combined badge
      badges.push({
        label: `HEAD → ${headBranchName.value}`,
        bgColor: '#dcfce7',
        textColor: '#16a34a',
        borderColor: '#16a34a',
      });
      // Add remaining branches (not the one already shown)
      for (const b of node.snapshot.branches) {
        if (b !== headBranchName.value) {
          badges.push({
            label: b,
            bgColor: '#e0e7ff',
            textColor: '#4f46e5',
            borderColor: '#4f46e5',
          });
        }
      }
    } else {
      // Detached HEAD or HEAD on commit not directly a branch tip
      badges.push({
        label: headBadgeLabel.value,
        bgColor: '#fee2e2',
        textColor: '#dc2626',
        borderColor: '#dc2626',
      });
      for (const b of node.snapshot.branches) {
        badges.push({
          label: b,
          bgColor: '#e0e7ff',
          textColor: '#4f46e5',
          borderColor: '#4f46e5',
        });
      }
    }
  } else {
    for (const b of node.snapshot.branches) {
      badges.push({
        label: b,
        bgColor: '#e0e7ff',
        textColor: '#4f46e5',
        borderColor: '#4f46e5',
      });
    }
  }

  for (const t of node.snapshot.tags) {
    badges.push({
      label: `tag: ${t}`,
      bgColor: '#fef3c7',
      textColor: '#b45309',
      borderColor: '#f59e0b',
    });
  }

  return badges;
}

// Compute badge width based on label length
function badgeWidth(label: string): number {
  return Math.max(40, label.length * 6 + 10);
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

function selectNode(hash: string): void {
  selectedHash.value = selectedHash.value === hash ? null : hash;
}

function handleNodeMouseEnter(hash: string, e: MouseEvent): void {
  hoveredHash.value = hash;
  tooltipX.value = e.clientX + 12;
  tooltipY.value = e.clientY + 12;
}

function handleNodeMouseLeave(): void {
  hoveredHash.value = null;
}

function handleMouseMove(e: MouseEvent): void {
  if (hoveredHash.value) {
    tooltipX.value = e.clientX + 12;
    tooltipY.value = e.clientY + 12;
  }
}

function handleWheel(e: WheelEvent): void {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  zoom.value = Math.max(0.1, Math.min(5, zoom.value * delta));
}

// Référence vers la fonction de nettoyage du drag courant.
// Permet à onBeforeUnmount de retirer les listeners si le composant est démonté pendant un drag.
let currentPanCleanup: (() => void) | null = null;

function startPan(e: MouseEvent): void {
  // Left button drag for pan
  if (e.button !== 0) return;
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const startPanX = panX.value;
  const startPanY = panY.value;

  const onMouseMove = (moveEvent: MouseEvent): void => {
    panX.value = startPanX + (moveEvent.clientX - startX);
    panY.value = startPanY + (moveEvent.clientY - startY);
  };

  const cleanup = (): void => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    currentPanCleanup = null;
  };

  const onMouseUp = (): void => {
    cleanup();
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  currentPanCleanup = cleanup;
}

// Nettoyage des listeners actifs si le composant est démonté pendant un drag (M1)
onBeforeUnmount(() => {
  if (currentPanCleanup !== null) {
    currentPanCleanup();
  }
});

function handleBackdropClick(e: MouseEvent): void {
  // Deselect if click is on the SVG background (not a node)
  if ((e.target as SVGElement).classList.contains('graph-svg')) {
    selectedHash.value = null;
  }
}
</script>

<template>
  <div
    class="graph-view"
    @wheel.prevent="handleWheel"
    @mousedown="startPan"
    @mousemove="handleMouseMove"
  >
    <!-- SVG graphe -->
    <svg
      v-if="layout"
      :viewBox="`0 0 ${layout.width} ${layout.height}`"
      :width="layout.width * zoom"
      :height="layout.height * zoom"
      class="graph-svg"
      :style="{ transform: `translate(${panX}px, ${panY}px)` }"
      @click="handleBackdropClick"
    >
      <!-- Arêtes -->
      <g class="edges">
        <!-- Arêtes linéaires -->
        <line
          v-for="edge in layout.edges.filter(e => e.type === 'linear')"
          :key="`edge-${edge.fromHash}-${edge.toHash}`"
          :x1="edge.fromX"
          :y1="edge.fromY"
          :x2="edge.toX"
          :y2="edge.toY"
          class="edge"
          :class="{ 'edge-related': isEdgeRelated(edge) }"
          :stroke="getEdgeColor(edge)"
        />
        <!-- Arêtes de merge (courbes de Bézier) -->
        <path
          v-for="edge in layout.edges.filter(e => e.type === 'merge')"
          :key="`edge-${edge.fromHash}-${edge.toHash}`"
          :d="getBezierPath(edge)"
          class="edge edge-merge"
          :class="{ 'edge-related': isEdgeRelated(edge) }"
          :stroke="getEdgeColor(edge)"
        />
      </g>

      <!-- Badges de refs (dessinés avant les nœuds pour être sous les cercles) -->
      <g v-if="showLabels" class="badges">
        <g
          v-for="node in layout.nodes"
          :key="`badges-${node.hash}`"
        >
          <g
            v-for="(badge, idx) in getNodeBadges(node)"
            :key="`badge-${node.hash}-${idx}`"
            :transform="`translate(${node.x + nodeRadius + 6}, ${node.y - 12 - (getNodeBadges(node).length - 1 - idx) * 18})`"
            class="badge"
            :class="{
              'badge-head': badge.bgColor === '#dcfce7' || badge.bgColor === '#fee2e2',
              'badge-branch': badge.bgColor === '#e0e7ff',
              'badge-tag': badge.bgColor === '#fef3c7',
            }"
          >
            <rect
              x="0"
              y="-11"
              :width="badgeWidth(badge.label)"
              height="15"
              :fill="badge.bgColor"
              :stroke="badge.borderColor"
              rx="3"
            />
            <text
              x="4"
              y="1"
              font-size="9"
              :fill="badge.textColor"
              font-family="ui-monospace, monospace"
            >{{ badge.label }}</text>
          </g>
        </g>
      </g>

      <!-- Nœuds (commits) -->
      <g class="nodes">
        <circle
          v-for="node in layout.nodes"
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
            'node-head-detached': isHeadCommit(node.hash) && isHeadDetached,
          }"
          @mouseenter="(e) => handleNodeMouseEnter(node.hash, e)"
          @mouseleave="handleNodeMouseLeave"
          @click.stop="selectNode(node.hash)"
        />
      </g>

      <!-- Labels hash + message -->
      <g v-if="showLabels" class="labels">
        <g
          v-for="node in layout.nodes"
          :key="`label-${node.hash}`"
          class="label"
          :transform="`translate(${node.x + nodeRadius + 8}, ${node.y})`"
        >
          <text
            x="0"
            y="4"
            font-size="10"
            font-family="ui-monospace, monospace"
            fill="#333"
            class="label-hash"
          >{{ node.snapshot.shortHash }}</text>
          <text
            x="0"
            y="16"
            font-size="9"
            font-family="system-ui, sans-serif"
            fill="#888"
            class="label-message"
          >{{ truncateMessage(node.snapshot.message, 36) }}</text>
        </g>
      </g>
    </svg>

    <!-- Placeholder dépôt non initialisé -->
    <div v-else-if="!repo.snapshot.initialized" class="graph-placeholder">
      <p class="title">Graphe Git</p>
      <p class="hint">Initialisez un dépôt pour voir le graphe.</p>
    </div>

    <!-- Placeholder dépôt vide (initialisé mais aucun commit) -->
    <div v-else class="graph-placeholder">
      <p class="title">Graphe Git</p>
      <p class="hint">Aucun commit pour l'instant.</p>
    </div>

    <!-- Tooltip au survol -->
    <div
      v-if="hoveredHash && hoveredNode"
      class="tooltip"
      :style="{ left: `${tooltipX}px`, top: `${tooltipY}px` }"
    >
      <div class="tooltip-hash">{{ hoveredNode.snapshot.hash }}</div>
      <div class="tooltip-message">{{ hoveredNode.snapshot.message }}</div>
      <div v-if="hoveredNode.snapshot.parents.length" class="tooltip-parents">
        Parents: {{ hoveredNode.snapshot.parents.slice(0, 2).map(h => h.slice(0, 7)).join(', ') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-view {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fafafa;
  position: relative;
  user-select: none;
  cursor: grab;
}

.graph-view:active {
  cursor: grabbing;
}

.graph-svg {
  transform-origin: 0 0;
  display: block;
}

/* Arêtes */
.edge {
  stroke-width: 1.5;
  fill: none;
  opacity: 0.6;
}

.edge-merge {
  stroke-dasharray: 4, 3;
  opacity: 0.55;
}

.edge-related {
  opacity: 1;
  stroke-width: 2.5;
}

/* Nœuds */
.node {
  cursor: pointer;
  opacity: 0.85;
  transition: opacity 0.12s ease, stroke-width 0.12s ease;
  stroke: #fff;
  stroke-width: 2;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.12));
}

.node:hover,
.node-hovered {
  opacity: 1;
  stroke-width: 3;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.22));
}

.node-selected {
  stroke: #111;
  stroke-width: 3;
}

.node-head {
  stroke: #16a34a;
  stroke-width: 3;
  filter: drop-shadow(0 0 5px rgba(22, 163, 74, 0.45));
}

.node-head-detached {
  stroke: #dc2626;
  stroke-width: 3;
  filter: drop-shadow(0 0 5px rgba(220, 38, 38, 0.45));
}

/* Badges */
.badge {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.08));
}

.badge text {
  font-weight: 500;
  font-size: 9px;
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
  font-size: 1.1rem;
  font-weight: 600;
  color: #555;
  margin-bottom: 0.5rem;
}

.graph-placeholder .hint {
  font-size: 0.85rem;
  color: #bbb;
}

/* Tooltip */
.tooltip {
  position: fixed;
  background: #1f2937;
  color: #f9fafb;
  padding: 8px 12px;
  border-radius: 5px;
  font-size: 11px;
  font-family: ui-monospace, monospace;
  z-index: 1000;
  pointer-events: none;
  max-width: 320px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
  line-height: 1.5;
}

.tooltip-hash {
  font-weight: 700;
  margin-bottom: 3px;
  color: #93c5fd;
  word-break: break-all;
}

.tooltip-message {
  margin-bottom: 3px;
  word-break: break-word;
  color: #e5e7eb;
}

.tooltip-parents {
  opacity: 0.75;
  font-size: 10px;
  color: #9ca3af;
}
</style>
