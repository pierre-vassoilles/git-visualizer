<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import type { GraphLayout, GraphEdge, GraphNode, Badge } from '@/graph/types';
import { culledLayout, type Viewport } from '@/graph/culling';

// `Badge` est défini dans @/graph/types (source de vérité). Réexporté ici pour
// rétro-compatibilité des imports existants (`from './GraphCanvas.vue'`).
export type { Badge };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  layout: GraphLayout | null;
  /** Badges indexés par hash de commit (précalculés par le conteneur). */
  badgesByHash?: Map<string, Badge[]>;
  /** Commits à surligner (halo autour du nœud). */
  highlightedNodes?: Set<string>;
  /** Hash du commit sur lequel pointe HEAD (anneau distinctif). */
  headHash?: string | null;
  /** true si HEAD est détaché (anneau rouge au lieu de vert). */
  headDetached?: boolean;
  /** Titre du panneau (optionnel, affiché en en-tête). */
  title?: string;
  /** Zoom externe (pour sync pan/zoom). Si fourni, écrase le zoom interne. */
  externalZoom?: number | null;
  /** Pan externe. Si fourni, écrase le pan interne. */
  externalPanX?: number | null;
  externalPanY?: number | null;
}

const props = withDefaults(defineProps<Props>(), {
  badgesByHash: () => new Map(),
  highlightedNodes: () => new Set(),
  headHash: null,
  headDetached: false,
  title: '',
  externalZoom: null,
  externalPanX: null,
  externalPanY: null,
});

const emit = defineEmits<{
  selectNode: [hash: string];
  hover: [hash: string | null];
  wheel: [delta: number];
  pan: [dx: number, dy: number];
}>();

// ---------------------------------------------------------------------------
// Interaction state
// ---------------------------------------------------------------------------

const _zoom = ref(1);
const _panX = ref(0);
const _panY = ref(0);
// Dimensions pixel du conteneur (mesurées) — pour calculer le viewport logique.
const containerEl = ref<HTMLDivElement | null>(null);
const containerW = ref(0);
const containerH = ref(0);
const hoveredHash = ref<string | null>(null);
const selectedHash = ref<string | null>(null);
const tooltipX = ref(0);
const tooltipY = ref(0);

const zoom = computed(() => props.externalZoom ?? _zoom.value);
const panX = computed(() => props.externalPanX ?? _panX.value);
const panY = computed(() => props.externalPanY ?? _panY.value);

// ---------------------------------------------------------------------------
// Computed helpers
// ---------------------------------------------------------------------------

const nodeRadius = 6;

const hoveredNode = computed((): GraphNode | null => {
  if (!hoveredHash.value || !props.layout) return null;
  return props.layout.nodes.find(n => n.hash === hoveredHash.value) ?? null;
});

const showLabels = computed(() => zoom.value > 0.4);

/**
 * Layout effectivement rendu, après virtualisation (culling) du viewport.
 * Sous le seuil (petits graphes, cas pédagogique courant) c'est exactement
 * `props.layout` — aucun changement visuel. Sur gros DAG, seuls les
 * nœuds/arêtes visibles (+ buffer) sont conservés.
 */
const renderedLayout = computed((): GraphLayout | null => {
  const lay = props.layout;
  if (!lay) return null;
  if (containerW.value === 0 || containerH.value === 0) return lay;
  // Conversion pixel → coordonnées logiques : screen = logical * zoom + pan.
  const z = zoom.value || 1;
  const viewport: Viewport = {
    x: -panX.value / z,
    y: -panY.value / z,
    width: containerW.value / z,
    height: containerH.value / z,
  };
  return culledLayout(lay, viewport);
});

/** Map hash → couleur de nœud (précalculée sur le layout complet). */
const colorByHash = computed((): Map<string, string> => {
  const map = new Map<string, string>();
  for (const node of props.layout?.nodes ?? []) {
    map.set(node.hash, node.color);
  }
  return map;
});

/** Arêtes linéaires visibles (précalculées). */
const linearEdges = computed(() =>
  renderedLayout.value?.edges.filter(e => e.type === 'linear') ?? [],
);

/** Arêtes de merge visibles (précalculées). */
const mergeEdges = computed(() =>
  renderedLayout.value?.edges.filter(e => e.type === 'merge') ?? [],
);

/** Nœuds visibles (après culling). */
const visibleNodes = computed(() => renderedLayout.value?.nodes ?? []);

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
  return colorByHash.value.get(edge.fromHash) ?? '#999';
}

function truncateMessage(msg: string, maxLen: number): string {
  return msg.length > maxLen ? msg.slice(0, maxLen) + '…' : msg;
}

function isEdgeRelated(edge: GraphEdge): boolean {
  if (!hoveredHash.value) return false;
  return edge.fromHash === hoveredHash.value || edge.toHash === hoveredHash.value;
}

function badgeWidth(label: string): number {
  return Math.max(40, label.length * 6 + 10);
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

function selectNode(hash: string): void {
  selectedHash.value = selectedHash.value === hash ? null : hash;
  emit('selectNode', hash);
}

function handleNodeMouseEnter(hash: string, e: MouseEvent): void {
  hoveredHash.value = hash;
  tooltipX.value = e.clientX + 12;
  tooltipY.value = e.clientY + 12;
  emit('hover', hash);
}

function handleNodeMouseLeave(): void {
  hoveredHash.value = null;
  emit('hover', null);
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
  if (props.externalZoom === null) {
    _zoom.value = Math.max(0.1, Math.min(5, _zoom.value * delta));
  }
  emit('wheel', delta);
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const el = containerEl.value;
  if (!el) return;
  const measure = (): void => {
    containerW.value = el.clientWidth;
    containerH.value = el.clientHeight;
  };
  measure();
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(el);
  }
});

let currentPanCleanup: (() => void) | null = null;

function startPan(e: MouseEvent): void {
  if (e.button !== 0) return;
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const startPanXv = _panX.value;
  const startPanYv = _panY.value;
  let lastDx = 0;
  let lastDy = 0;

  const onMouseMove = (moveEvent: MouseEvent): void => {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    if (props.externalPanX === null) {
      _panX.value = startPanXv + dx;
      _panY.value = startPanYv + dy;
    }
    const ddx = dx - lastDx;
    const ddy = dy - lastDy;
    lastDx = dx;
    lastDy = dy;
    emit('pan', ddx, ddy);
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

onBeforeUnmount(() => {
  if (currentPanCleanup !== null) {
    currentPanCleanup();
  }
  if (resizeObserver !== null) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

function handleBackdropClick(e: MouseEvent): void {
  if ((e.target as SVGElement).classList.contains('graph-canvas-svg')) {
    selectedHash.value = null;
  }
}
</script>

<template>
  <div
    ref="containerEl"
    class="graph-canvas"
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
      class="graph-canvas-svg"
      :style="{ transform: `translate(${panX}px, ${panY}px)` }"
      @click="handleBackdropClick"
    >
      <!-- Arêtes -->
      <g class="edges">
        <!-- Arêtes linéaires -->
        <line
          v-for="edge in linearEdges"
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
          v-for="edge in mergeEdges"
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
          v-for="node in visibleNodes"
          :key="`badges-${node.hash}`"
        >
          <g
            v-for="(badge, idx) in (badgesByHash.get(node.hash) ?? [])"
            :key="`badge-${node.hash}-${idx}`"
            :transform="`translate(${node.x + nodeRadius + 6}, ${node.y - 12 - ((badgesByHash.get(node.hash) ?? []).length - 1 - idx) * 18})`"
            class="badge"
            :class="`badge-${badge.kind}`"
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
        <!-- Halo pour commits surlignés (non poussés / à récupérer) -->
        <circle
          v-for="node in visibleNodes.filter(n => highlightedNodes.has(n.hash))"
          :key="`halo-${node.hash}`"
          :cx="node.x"
          :cy="node.y"
          :r="nodeRadius + 4"
          class="node-halo"
        />
        <circle
          v-for="node in visibleNodes"
          :key="`node-${node.hash}`"
          :cx="node.x"
          :cy="node.y"
          :r="nodeRadius"
          :fill="node.color"
          class="node"
          :class="{
            'node-hovered': hoveredHash === node.hash,
            'node-selected': selectedHash === node.hash,
            'node-highlighted': highlightedNodes.has(node.hash),
            'node-head': headHash !== null && node.hash === headHash && !headDetached,
            'node-head-detached': headHash !== null && node.hash === headHash && headDetached,
          }"
          @mouseenter="(e) => handleNodeMouseEnter(node.hash, e)"
          @mouseleave="handleNodeMouseLeave"
          @click.stop="selectNode(node.hash)"
        />
      </g>

      <!-- Labels hash + message -->
      <g v-if="showLabels" class="labels">
        <g
          v-for="node in visibleNodes"
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

    <!-- Placeholder -->
    <div v-else class="graph-placeholder">
      <p class="title">{{ title || 'Graphe Git' }}</p>
      <slot name="placeholder">
        <p class="hint">Aucun commit pour l'instant.</p>
      </slot>
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
.graph-canvas {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fafafa;
  position: relative;
  user-select: none;
  cursor: grab;
}

.graph-canvas:active {
  cursor: grabbing;
}

.graph-canvas-svg {
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

/* Halos pour commits surlignés */
.node-halo {
  fill: none;
  stroke: #f59e0b;
  stroke-width: 2;
  opacity: 0.55;
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

.node-highlighted {
  stroke: #f59e0b;
  stroke-width: 2.5;
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
