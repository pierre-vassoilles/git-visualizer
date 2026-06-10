<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { computeLayout } from '@/graph/layout';
import { useRepoStore } from '@/stores/repo';
import GraphCanvas from './GraphCanvas.vue';
import type { Badge } from './GraphCanvas.vue';
import type { RepoSnapshot } from '@/core/engine';

const repo = useRepoStore();

// ---------------------------------------------------------------------------
// Mode d'affichage
// ---------------------------------------------------------------------------

type DisplayMode = 'local' | 'split' | 'remote';
const displayMode = ref<DisplayMode>('local');

const hasRemote = computed(() =>
  Object.keys(repo.snapshot.remotes ?? {}).length > 0,
);

// Bascule automatiquement en split si un distant est disponible et qu'on est en local
watch(hasRemote, (val) => {
  if (val && displayMode.value === 'local') {
    displayMode.value = 'split';
  } else if (!val) {
    displayMode.value = 'local';
  }
});

function setMode(mode: DisplayMode): void {
  if (!hasRemote.value && mode !== 'local') return;
  displayMode.value = mode;
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

const localLayout = computed(() => {
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

const remoteLayout = computed(() => {
  const remotes = repo.snapshot.remotes;
  if (!remotes) return null;
  // Prend le premier remote disponible (en pratique : origin)
  const remoteName = Object.keys(remotes)[0];
  if (!remoteName) return null;
  const remote = remotes[remoteName];
  if (!remote || remote.allCommits.length === 0) return null;
  return computeLayout({
    commits: remote.allCommits,
    branches: remote.heads,
    head: remote.head,
    tags: {},
  });
});

// ---------------------------------------------------------------------------
// HEAD helpers (pour badges locaux) — utilisés dans buildLocalBadges
// ---------------------------------------------------------------------------

const headBadgeLabel = computed((): string => {
  const head = repo.snapshot.head;
  if (head.type === 'detached') {
    return `HEAD (${head.hash.slice(0, 7)})`;
  }
  return 'HEAD';
});

// ---------------------------------------------------------------------------
// Badges précalculés (dette Phase 3 : mémoïsation + champ kind)
// ---------------------------------------------------------------------------

function buildLocalBadges(snap: RepoSnapshot): Map<string, Badge[]> {
  const map = new Map<string, Badge[]>();
  const commits = snap.allCommits ?? snap.commits;
  if (!commits.length) return map;

  const hHash = snap.head.type === 'detached'
    ? snap.head.hash
    : (snap.branches[snap.head.name] ?? null);
  const hBranchName = snap.head.type === 'branch' ? snap.head.name : null;
  const hDetached = snap.head.type === 'detached';

  // Refs de suivi distantes : remoteTrackingRefs → Map<hash, label[]>
  const remoteRefsByHash = new Map<string, string[]>();
  const rtr = snap.remoteTrackingRefs;
  if (rtr) {
    for (const [remoteName, refMap] of Object.entries(rtr)) {
      for (const [branch, hash] of Object.entries(refMap)) {
        if (!remoteRefsByHash.has(hash)) remoteRefsByHash.set(hash, []);
        remoteRefsByHash.get(hash)!.push(`${remoteName}/${branch}`);
      }
    }
  }

  for (const commit of commits) {
    const badges: Badge[] = [];
    const isHead = commit.hash === hHash;

    if (isHead) {
      if (!hDetached && hBranchName && commit.branches.includes(hBranchName)) {
        // HEAD → branchname combined badge
        badges.push({
          kind: 'head',
          label: `HEAD → ${hBranchName}`,
          bgColor: '#dcfce7',
          textColor: '#16a34a',
          borderColor: '#16a34a',
        });
        for (const b of commit.branches) {
          if (b !== hBranchName) {
            badges.push({
              kind: 'branch',
              label: b,
              bgColor: '#e0e7ff',
              textColor: '#4f46e5',
              borderColor: '#4f46e5',
            });
          }
        }
      } else {
        // HEAD détaché
        badges.push({
          kind: 'head',
          label: hDetached ? (snap.head as { type: 'detached'; hash: string }).hash.slice(0, 7).concat(' (HEAD)') : headBadgeLabel.value,
          bgColor: '#fee2e2',
          textColor: '#dc2626',
          borderColor: '#dc2626',
        });
        for (const b of commit.branches) {
          badges.push({
            kind: 'branch',
            label: b,
            bgColor: '#e0e7ff',
            textColor: '#4f46e5',
            borderColor: '#4f46e5',
          });
        }
      }
    } else {
      for (const b of commit.branches) {
        badges.push({
          kind: 'branch',
          label: b,
          bgColor: '#e0e7ff',
          textColor: '#4f46e5',
          borderColor: '#4f46e5',
        });
      }
    }

    // Refs de suivi distantes (kind: 'remote')
    const remoteRefs = remoteRefsByHash.get(commit.hash);
    if (remoteRefs) {
      for (const label of remoteRefs) {
        badges.push({
          kind: 'remote',
          label,
          bgColor: '#f0f0f0',
          textColor: '#555',
          borderColor: '#999',
        });
      }
    }

    // Tags
    for (const t of commit.tags) {
      badges.push({
        kind: 'tag',
        label: `tag: ${t}`,
        bgColor: '#fef3c7',
        textColor: '#b45309',
        borderColor: '#f59e0b',
      });
    }

    if (badges.length > 0) {
      map.set(commit.hash, badges);
    }
  }

  return map;
}

function buildRemoteBadges(snap: RepoSnapshot): Map<string, Badge[]> {
  const map = new Map<string, Badge[]>();
  const remotes = snap.remotes;
  if (!remotes) return map;
  const remoteName = Object.keys(remotes)[0];
  if (!remoteName) return map;
  const remote = remotes[remoteName];
  if (!remote) return map;

  // HEAD du distant
  const remoteHead = remote.head;
  const remoteHHash = remoteHead.type === 'detached'
    ? remoteHead.hash
    : (remote.heads[remoteHead.name] ?? null);
  const remoteHBranchName = remoteHead.type === 'branch' ? remoteHead.name : null;
  const remoteHDetached = remoteHead.type === 'detached';

  for (const commit of remote.allCommits) {
    const badges: Badge[] = [];
    const isHead = commit.hash === remoteHHash;

    if (isHead && remoteHBranchName && commit.branches.includes(remoteHBranchName)) {
      badges.push({
        kind: 'head',
        label: `HEAD → ${remoteHBranchName}`,
        bgColor: '#dcfce7',
        textColor: '#16a34a',
        borderColor: '#16a34a',
      });
      for (const b of commit.branches) {
        if (b !== remoteHBranchName) {
          badges.push({
            kind: 'branch',
            label: b,
            bgColor: '#e0e7ff',
            textColor: '#4f46e5',
            borderColor: '#4f46e5',
          });
        }
      }
    } else if (isHead && remoteHDetached) {
      badges.push({
        kind: 'head',
        label: `HEAD (${commit.hash.slice(0, 7)})`,
        bgColor: '#fee2e2',
        textColor: '#dc2626',
        borderColor: '#dc2626',
      });
      for (const b of commit.branches) {
        badges.push({
          kind: 'branch',
          label: b,
          bgColor: '#e0e7ff',
          textColor: '#4f46e5',
          borderColor: '#4f46e5',
        });
      }
    } else {
      for (const b of commit.branches) {
        badges.push({
          kind: 'branch',
          label: b,
          bgColor: '#e0e7ff',
          textColor: '#4f46e5',
          borderColor: '#4f46e5',
        });
      }
    }

    for (const t of commit.tags) {
      badges.push({
        kind: 'tag',
        label: `tag: ${t}`,
        bgColor: '#fef3c7',
        textColor: '#b45309',
        borderColor: '#f59e0b',
      });
    }

    if (badges.length > 0) {
      map.set(commit.hash, badges);
    }
  }

  return map;
}

const localBadgesByHash = computed(() => buildLocalBadges(repo.snapshot));
const remoteBadgesByHash = computed(() => buildRemoteBadges(repo.snapshot));

// HEAD courant (pour l'anneau distinctif sur le nœud) — local et distant
const localHeadHash = computed((): string | null => {
  const h = repo.snapshot.head;
  return h.type === 'detached' ? h.hash : (repo.snapshot.branches[h.name] ?? null);
});
const localHeadDetached = computed(() => repo.snapshot.head.type === 'detached');

const remoteHeadHash = computed((): string | null => {
  const remotes = repo.snapshot.remotes;
  const name = remotes ? Object.keys(remotes)[0] : undefined;
  const r = name ? remotes![name] : null;
  if (!r) return null;
  return r.head.type === 'detached' ? r.head.hash : (r.heads[r.head.name] ?? null);
});
const remoteHeadDetached = computed(() => {
  const remotes = repo.snapshot.remotes;
  const name = remotes ? Object.keys(remotes)[0] : undefined;
  const r = name ? remotes![name] : null;
  return r ? r.head.type === 'detached' : false;
});

// ---------------------------------------------------------------------------
// Surlignage (commits non poussés / à récupérer)
// ---------------------------------------------------------------------------

const nonPushedNodes = computed((): Set<string> => {
  const snap = repo.snapshot;
  const local = snap.allCommits ?? snap.commits;
  // Carte hash → parents (sur le graphe local).
  const parents = new Map<string, string[]>();
  for (const c of local) parents.set(c.hash, c.parents);
  // Tips des refs de suivi distantes = points déjà connus du distant.
  const tips: string[] = [];
  const rtr = snap.remoteTrackingRefs;
  if (rtr) {
    for (const refMap of Object.values(rtr)) {
      for (const hash of Object.values(refMap)) tips.push(hash);
    }
  }
  // « Poussé » = accessible depuis un tip distant (parcours des parents),
  // pas seulement égal à un tip. Évite de marquer les ancêtres comme non poussés.
  const pushed = new Set<string>();
  const stack = [...tips];
  while (stack.length > 0) {
    const h = stack.pop()!;
    if (pushed.has(h)) continue;
    pushed.add(h);
    const ps = parents.get(h);
    if (ps) stack.push(...ps);
  }
  return new Set(local.filter((c) => !pushed.has(c.hash)).map((c) => c.hash));
});

const unpulledNodes = computed((): Set<string> => {
  const snap = repo.snapshot;
  const localHashes = new Set((snap.allCommits ?? snap.commits).map(c => c.hash));
  const remotes = snap.remotes;
  if (!remotes) return new Set();
  const remoteName = Object.keys(remotes)[0];
  if (!remoteName) return new Set();
  const remote = remotes[remoteName];
  if (!remote) return new Set();
  return new Set(remote.allCommits.filter(c => !localHashes.has(c.hash)).map(c => c.hash));
});

// ---------------------------------------------------------------------------
// Sync zoom/pan (optionnel)
// ---------------------------------------------------------------------------

const syncZoomPan = ref(false);

const syncZoom = ref(1);
const syncPanX = ref(0);
const syncPanY = ref(0);

function onWheelLocal(delta: number): void {
  if (syncZoomPan.value) {
    syncZoom.value = Math.max(0.1, Math.min(5, syncZoom.value * delta));
  }
}

function onWheelRemote(delta: number): void {
  if (syncZoomPan.value) {
    syncZoom.value = Math.max(0.1, Math.min(5, syncZoom.value * delta));
  }
}

function onPanLocal(dx: number, dy: number): void {
  if (syncZoomPan.value) {
    syncPanX.value += dx;
    syncPanY.value += dy;
  }
}

function onPanRemote(dx: number, dy: number): void {
  if (syncZoomPan.value) {
    syncPanX.value += dx;
    syncPanY.value += dy;
  }
}

// Computed : valeurs sync ou null (null = GraphCanvas gère son propre état)
const externalZoom = computed(() => syncZoomPan.value ? syncZoom.value : null);
const externalPanX = computed(() => syncZoomPan.value ? syncPanX.value : null);
const externalPanY = computed(() => syncZoomPan.value ? syncPanY.value : null);

// ---------------------------------------------------------------------------
// Nom du premier distant
// ---------------------------------------------------------------------------
const firstRemoteName = computed(() => {
  const remotes = repo.snapshot.remotes;
  if (!remotes) return 'origin';
  return Object.keys(remotes)[0] ?? 'origin';
});
</script>

<template>
  <div class="graph-view">
    <!-- Toolbar mode split-screen -->
    <div class="graph-toolbar">
      <div class="mode-buttons">
        <button
          class="mode-btn"
          :class="{ active: displayMode === 'local' }"
          @click="setMode('local')"
        >
          Local
        </button>
        <button
          class="mode-btn"
          :class="{ active: displayMode === 'split' }"
          :disabled="!hasRemote"
          @click="setMode('split')"
        >
          Split
        </button>
        <button
          class="mode-btn"
          :class="{ active: displayMode === 'remote' }"
          :disabled="!hasRemote"
          @click="setMode('remote')"
        >
          Distant
        </button>
      </div>

      <label v-if="hasRemote" class="sync-label">
        <input v-model="syncZoomPan" type="checkbox" />
        <span>Sync zoom/pan</span>
      </label>
    </div>

    <!-- Conteneur graphes -->
    <div class="graphs-container" :class="`mode-${displayMode}`">
      <!-- Graphe local -->
      <div
        v-if="displayMode === 'local' || displayMode === 'split'"
        class="graph-pane"
        :class="displayMode === 'split' ? 'pane-half' : 'pane-full'"
      >
        <div v-if="displayMode === 'split'" class="pane-header">Local</div>
        <div class="pane-body">
          <GraphCanvas
            v-if="localLayout"
            :layout="localLayout"
            :badges-by-hash="localBadgesByHash"
            :highlighted-nodes="nonPushedNodes"
            :head-hash="localHeadHash"
            :head-detached="localHeadDetached"
            :external-zoom="externalZoom"
            :external-pan-x="externalPanX"
            :external-pan-y="externalPanY"
            @wheel="onWheelLocal"
            @pan="onPanLocal"
          />
          <div v-else-if="!repo.snapshot.initialized" class="graph-placeholder">
            <p class="title">Graphe Git</p>
            <p class="hint">Initialisez un depot pour voir le graphe.</p>
          </div>
          <div v-else class="graph-placeholder">
            <p class="title">Graphe Git</p>
            <p class="hint">Aucun commit pour l'instant.</p>
          </div>
        </div>
      </div>

      <!-- Séparateur en mode split -->
      <div v-if="displayMode === 'split'" class="pane-divider" />

      <!-- Graphe distant -->
      <div
        v-if="displayMode === 'split' || displayMode === 'remote'"
        class="graph-pane"
        :class="displayMode === 'split' ? 'pane-half' : 'pane-full'"
      >
        <div v-if="displayMode === 'split'" class="pane-header">
          {{ firstRemoteName }} (distant)
        </div>
        <div class="pane-body">
          <GraphCanvas
            v-if="remoteLayout"
            :layout="remoteLayout"
            :badges-by-hash="remoteBadgesByHash"
            :highlighted-nodes="unpulledNodes"
            :head-hash="remoteHeadHash"
            :head-detached="remoteHeadDetached"
            :external-zoom="externalZoom"
            :external-pan-x="externalPanX"
            :external-pan-y="externalPanY"
            @wheel="onWheelRemote"
            @pan="onPanRemote"
          />
          <div v-else class="graph-placeholder">
            <p class="title">Graphe distant</p>
            <p class="hint">Aucun commit distant disponible.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* Toolbar */
.graph-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 8px;
  border-bottom: 1px solid #ddd;
  background: #f5f5f5;
  flex-shrink: 0;
  min-height: 30px;
}

.mode-buttons {
  display: flex;
  gap: 2px;
}

.mode-btn {
  padding: 2px 10px;
  font-size: 0.72rem;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 3px;
  cursor: pointer;
  font-family: ui-monospace, monospace;
  transition: background 0.12s;
}

.mode-btn:hover:not(:disabled) {
  background: #e8f4fb;
}

.mode-btn.active {
  background: #24292e;
  color: #fff;
  border-color: #24292e;
}

.mode-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sync-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  color: #555;
  cursor: pointer;
  user-select: none;
}

/* Conteneur graphes */
.graphs-container {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.graphs-container.mode-local,
.graphs-container.mode-remote {
  flex-direction: row;
}

.graphs-container.mode-split {
  flex-direction: row;
}

/* Panneaux */
.graph-pane {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.pane-full {
  flex: 1;
}

.pane-half {
  flex: 1;
  min-width: 0;
}

.pane-header {
  padding: 3px 8px;
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #666;
  background: #f0f0f0;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.pane-body {
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Séparateur */
.pane-divider {
  width: 1px;
  background: #ddd;
  flex-shrink: 0;
}

/* Placeholder (dupliqué ici pour les cas sans GraphCanvas) */
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
</style>
