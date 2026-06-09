# Phase 9 – Split-Screen Graph : Visualisation du distant côte à côte

## Contexte

Cette spec couvre la **visualisation côte à côte** du graphe local et du graphe distant dans `GraphView.vue`. Elle formalise le **refactor architectural du rendu** en composant paramétrable et la présence des décorations de synchronisation visuelle (refs de suivi, commits non-poussés, à récupérer).

## 1. Flux de données et dépendances

### 1.1 Snapshot enrichi (fourni par le moteur Phase 7-8)

Le snapshot expose :

```typescript
interface RepoSnapshot {
  // Existant (graphe local)
  allCommits?: SnapshotCommit[];
  commits: SnapshotCommit[];
  branches: Record<string, string>;
  head: { type: 'branch'; name: string } | { type: 'detached'; hash: string };
  tags: Record<string, string>;
  
  // Nouveau (distant) — Phases 7-8
  remotes?: {
    origin?: {
      allCommits: SnapshotCommit[];
      branches: Record<string, string>;
      // (pas de HEAD ni index ni working tree distant)
    }
  };
  remoteTrackingRefs?: {
    origin?: Record<string, string>; // origin/main -> hash
  };
  tracking?: {
    [branch: string]: {
      ahead: number;     // commits locaux non-poussés
      behind: number;    // commits distants non-récupérés
      upstream: { remote: string; branch: string }; // origin/main
    }
  };
}
```

### 1.2 Réutilisabilité du layout

`computeLayout(input)` est **pur et générique** (spec 16). Appelé deux fois :
- une fois sur le local : `computeLayout({ commits: snapshot.allCommits, branches: snapshot.branches, head, tags })`
- une fois sur le distant : `computeLayout({ commits: snapshot.remotes.origin.allCommits, branches: snapshot.remotes.origin.branches, head: null, tags: {} })`

Chaque appel retourne un `GraphLayout` indépendant.

## 2. Architecture du rendu — Refactor en composant paramétrable

### 2.1 Extraction du composant `GraphCanvas`

**Actuellement** (`GraphView.vue`, spec 17) : un monolithe SVG + interactions dans un seul composant.

**Après refactor** :

```vue
<!-- src/components/GraphCanvas.vue (nouveau) -->
<!-- Composant "sans état" : reçoit layout, head, tags en prop -->
<!-- Gère le rendu SVG + interactions (hover, selection, zoom, pan) -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GraphLayout } from '@/graph/types';

interface Props {
  layout: GraphLayout | null;
  badges?: Array<{ hash: string; kind: 'head' | 'branch' | 'remote' | 'tag'; label: string; color: string }>;
  nodeColors?: Map<string, string>;
  highlightedNodes?: Set<string>; // commits non-poussés, à récupérer, etc.
}

const props = withDefaults(defineProps<Props>(), {
  badges: () => [],
  nodeColors: () => new Map(),
  highlightedNodes: () => new Set(),
});

const emit = defineEmits<{
  selectNode: [hash: string];
  hover: [hash: string | null];
}>();

// State local : zoom, pan, hover
const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const hoveredHash = ref<string | null>(null);
const selectedHash = ref<string | null>(null);

// ... (méthodes handleWheel, startPan, etc. — reprises de GraphView.vue)
</script>

<template>
  <!-- SVG paramétrable : badges, couleurs, highlights en props -->
  <svg v-if="layout" class="graph-canvas" ...>
    <!-- Nœuds, arêtes, badges calculés depuis les props -->
  </svg>
  <div v-else class="graph-placeholder">...</div>
</template>

<style scoped>
/* Styles du rendu SVG */
</style>
```

**Avantages** :
- Composant réutilisable pour local ET distant.
- Logique d'interaction (zoom, pan, hover) isolée.
- Séparation données (props) et rendu.

### 2.2 Nouveau `GraphView.vue` comme conteneur

**Après refactor** : `GraphView.vue` devient un **conteneur** qui gère la disposition split-screen et orchestre deux instances de `GraphCanvas`.

```vue
<!-- src/components/GraphView.vue (refactorisé) -->
<script setup lang="ts">
import { computed } from 'vue';
import { useRepoStore } from '@/stores/repo';
import GraphCanvas from './GraphCanvas.vue';
import type { GraphLayout } from '@/graph/types';

const repo = useRepoStore();

// Mode d'affichage
const displayMode = ref<'local' | 'split' | 'remote'>('split');

// Layouts
const localLayout = computed(() => {
  if (!repo.snapshot.initialized || !repo.snapshot.allCommits) return null;
  return computeLayout({
    commits: repo.snapshot.allCommits,
    branches: repo.snapshot.branches,
    head: repo.snapshot.head,
    tags: repo.snapshot.tags,
  });
});

const remoteLayout = computed(() => {
  if (!repo.snapshot.remotes?.origin?.allCommits) return null;
  return computeLayout({
    commits: repo.snapshot.remotes.origin.allCommits,
    branches: repo.snapshot.remotes.origin.branches,
    head: null,
    tags: {},
  });
});

// Décorateurs : badges avec kind, couleurs enrichies
const localBadges = computed(() => computeBadges(repo.snapshot, 'local'));
const remoteBadges = computed(() => computeBadges(repo.snapshot, 'remote'));

// Highlights (commits à surligner)
const nonPushedCommits = computed(() => highlightNonPushed(repo.snapshot)); // local uniquement
const unpulledCommits = computed(() => highlightUnpulled(repo.snapshot));   // remote uniquement
</script>

<template>
  <div class="graph-view">
    <!-- Toolbar mode split-screen -->
    <div class="graph-toolbar">
      <button
        v-for="mode in ['local', 'split', 'remote']"
        :key="mode"
        :class="{ active: displayMode === mode }"
        @click="displayMode = mode"
      >
        {{ mode === 'split' ? 'Split' : mode === 'local' ? 'Local' : 'Remote' }}
      </button>
    </div>

    <!-- Conteneur graphes -->
    <div class="graphs-container" :data-mode="displayMode">
      <!-- Graphe local -->
      <div v-if="displayMode === 'local' || displayMode === 'split'" class="graph-pane local">
        <h3>Local</h3>
        <GraphCanvas
          :layout="localLayout"
          :badges="localBadges"
          :highlighted-nodes="nonPushedCommits"
          @select-node="onSelectLocalNode"
          @hover="onHoverLocal"
        />
      </div>

      <!-- Graphe distant -->
      <div v-if="displayMode === 'split' || displayMode === 'remote'" class="graph-pane remote">
        <h3>Remote (origin)</h3>
        <GraphCanvas
          :layout="remoteLayout"
          :badges="remoteBadges"
          :highlighted-nodes="unpulledCommits"
          @select-node="onSelectRemoteNode"
          @hover="onHoverRemote"
        />
      </div>
    </div>

    <!-- Option de sync pan/zoom (optionnel) -->
    <label class="sync-option">
      <input v-model="syncZoomPan" type="checkbox" />
      Zoom/Pan synchronisés
    </label>
  </div>
</template>

<style scoped>
.graph-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.graph-toolbar {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #ddd;
  background: #f9f9f9;
}

.graphs-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.graphs-container[data-mode="split"] {
  flex-direction: row;
}

.graphs-container[data-mode="local"] .local,
.graphs-container[data-mode="remote"] .remote {
  flex: 1;
}

.graphs-container[data-mode="split"] .local,
.graphs-container[data-mode="split"] .remote {
  flex: 0.5;
  border-right: 1px solid #ddd;
}

.graph-pane {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.graph-pane h3 {
  padding: 8px;
  margin: 0;
  font-size: 12px;
  font-weight: bold;
  border-bottom: 1px solid #eee;
  background: #f5f5f5;
}

.sync-option {
  padding: 8px;
  border-top: 1px solid #ddd;
  font-size: 12px;
  cursor: pointer;
}
</style>
```

## 3. Décorations visuelles de synchronisation

### 3.1 Badges enrichis (nouveau `kind`)

La **dette Phase 3** (spec 17) identifiait le problème : badges typés par couleur hex. **Solution** : ajouter un champ `kind` discriminant.

```typescript
interface Badge {
  hash: string;
  kind: 'head' | 'branch' | 'remote' | 'tag'; // nouveau
  label: string;
  color: string;      // couleur d'affichage
  borderColor: string;
}
```

**Styles par `kind`** :
- `head` : blanc + border noir (surbrillance rouge si local)
- `branch` : bleu clair + border bleu (branche locale)
- `remote` : gris clair + border gris (refs de suivi `origin/main`, affichées **sur le graphe local**)
- `tag` : jaune + border orange

### 3.2 Décoration des refs de suivi sur le graphe local

**Sur le graphe local**, afficher des badges `kind: 'remote'` pour les refs de suivi :
- Consomme `snapshot.remoteTrackingRefs.origin` (ex: `{ "main": "abc123...", "feature": "def456..." }`)
- Pour chaque ref de suivi, trouver le commit local correspondant (par hash)
- Ajouter un badge `kind: 'remote'` label `"origin/main"` sur ce commit

**Exemple visuel** :

```
local : C4 (HEAD -> main)  [HEAD] [main] [origin/main]  <- même commit
        │
        C3 ← [origin/main] peut être sur un commit antérieur
        │    si on a committé localement mais pas pushé
```

### 3.3 Surlignage des commits non-poussés (local)

Commits présents en local, absents du suivi `origin/…` :

```typescript
function highlightNonPushed(snapshot: RepoSnapshot): Set<string> {
  const pushedHashes = new Set(
    Object.values(snapshot.remoteTrackingRefs?.origin ?? {})
  );
  
  return new Set(
    snapshot.allCommits
      ?.filter(c => !pushedHashes.has(c.hash))
      .map(c => c.hash) ?? []
  );
}
```

**Rendu** : Nœuds surlignés (couleur + motif / stroke épaissie / halo).

### 3.4 Surlignage des commits à récupérer (distant)

Commits présents sur `origin`, absents du graphe local :

```typescript
function highlightUnpulled(snapshot: RepoSnapshot): Set<string> {
  const localHashes = new Set(
    snapshot.allCommits?.map(c => c.hash) ?? []
  );
  
  return new Set(
    snapshot.remotes?.origin?.allCommits
      ?.filter(c => !localHashes.has(c.hash))
      .map(c => c.hash) ?? []
  );
}
```

**Rendu** : Nœuds surlignés (couleur / motif / stroke).

## 4. Modes d'affichage

### 4.1 Local seul

```
┌─────────────────────────────┐
│ [Local] Split Remote        │
├─────────────────────────────┤
│                             │
│    Graphe local            │
│    (zoom, pan, normal)      │
│                             │
└─────────────────────────────┘
```

### 4.2 Split-screen (défaut si distant existe)

```
┌───────────────────┬─────────────────┐
│ [Local] Split Remote        │
├───────────┬─────────────────┤
│   Local   │     Remote      │
│           │ (origin)        │
│ Graphe    │                 │
│ local     │ Graphe distant  │
│           │                 │
└───────────┴─────────────────┘
```

Largeur : 50/50 (ajustable via resize ou proportion fixe).

### 4.3 Distant seul

```
┌─────────────────────────────┐
│ Local [Split] Remote        │
├─────────────────────────────┤
│                             │
│    Graphe distant          │
│    (origin)                 │
│                             │
└─────────────────────────────┘
```

## 5. Comportement des modes

### 5.1 Pas de distant

Si `snapshot.remotes?.origin` est absent ou vide :
- Afficher **toujours "Local"** (pas de distant)
- Boutons "Split" et "Remote" désactivés (grisés)
- Message optionnel : « Exécutez `git remote add origin <url>` pour afficher le distant »

### 5.2 Distant présent

- Les trois modes sont actifs
- Défaut : mode "split" (si l'utilisateur a un distant)

### 5.3 Bascule de mode

Au clic sur un bouton mode :
- Transition instant (pas d'animation en Phase 9)
- État persisté ? (optionnel ; à câbler en Phase 10)

## 6. Synchronisation de pan/zoom (optionnel)

### 6.1 Option "Zoom/Pan synchronisés"

Checkbox dans la toolbar :

```
[ ] Zoom/Pan synchronisés
```

### 6.2 Comportement si activé

- Action `wheel` sur un graphe → applique au **deux** canvases (même zoom factor)
- Action `pan` (clic droit + drag) sur un graphe → applique aux **deux** canvases (même translation)

**Implémentation** :

```typescript
const syncZoomPan = ref(false);

function onZoomLocal(factor: number) {
  zoomLocal.value *= factor;
  if (syncZoomPan.value) {
    zoomRemote.value = zoomLocal.value; // Sync
  }
}

function onPanLocal(dx: number, dy: number) {
  panXLocal.value += dx;
  panYLocal.value += dy;
  if (syncZoomPan.value) {
    panXRemote.value += dx;
    panYRemote.value += dy; // Sync
  }
}
```

## 7. Traitement de la dette Phase 3

### 7.1 Badges avec champ `kind`

**Implémentation dans `GraphCanvas.vue`** :

Au lieu de :
```typescript
function getNodeBadges(hash: string): Badge[] {
  // Typage par couleur hex (fragile)
  if (color === '#fff') { /* head */ }
}
```

Utiliser :
```typescript
function getNodeBadges(hash: string): Badge[] {
  const badges: Badge[] = [];
  
  if (hash === headHash) {
    badges.push({
      hash,
      kind: 'head',
      label: isHeadDetached ? `HEAD (${hash.slice(0, 7)})` : 'HEAD',
      color: '#fff',
      borderColor: '#333',
    });
  }
  
  for (const branch of branchesOnNode[hash] ?? []) {
    badges.push({
      hash,
      kind: 'branch',
      label: branch,
      color: '#e0e7ff',
      borderColor: '#4f46e5',
    });
  }
  
  // Refs de suivi (local graph only)
  for (const remoteRef of remoteRefsOnNode[hash] ?? []) {
    badges.push({
      hash,
      kind: 'remote',
      label: remoteRef,
      color: '#f0f0f0',
      borderColor: '#888',
    });
  }
  
  // Tags...
  return badges;
}
```

**Avantage** : Render switch sur `kind` au lieu de comparaison couleur.

### 7.2 Mémoïsation des badges et couleurs

**Computed Vue dans `GraphCanvas.vue`** :

```typescript
const badgesByHash = computed(() => {
  const map = new Map<string, Badge[]>();
  for (const node of layout.value?.nodes ?? []) {
    map.set(node.hash, getNodeBadges(node.hash));
  }
  return map;
});

const colorMap = computed(() => {
  const map = new Map<string, string>();
  for (const node of layout.value?.nodes ?? []) {
    map.set(node.hash, node.color);
  }
  return map;
});
```

**Render** :

```vue
<text v-for="badge in badgesByHash.get(node.hash) ?? []" ...>
  {{ badge.label }}
</text>
```

**Gain** : `getNodeBadges()` et `getEdgeColor()` ne sont appelées qu'une fois par render (pas 2×/badge).

## 8. Critères d'acceptation

### CA-split-01 : Refactor GraphCanvas (composant paramétrable)

- [ ] `GraphCanvas.vue` créé (composant sans état, reçoit `layout` en prop)
- [ ] Expose `selectNode`, `hover` events
- [ ] Rendu SVG identique au `GraphView.vue` original (spec 17)
- [ ] Réutilisable : peut être appelé plusieurs fois dans le même parent

### CA-split-02 : GraphView refactorisé en conteneur

- [ ] `GraphView.vue` devient un conteneur (2 instances de `GraphCanvas` ou une seule selon le mode)
- [ ] Pas de rendu SVG direct dans `GraphView.vue`
- [ ] `npm run build` vert, pas de regression visuellement (local seul)

### CA-split-03 : Modes d'affichage (local, split, remote)

- [ ] Trois boutons dans la toolbar : "Local", "Split", "Remote"
- [ ] Clic sur un bouton bascule le mode
- [ ] Affichage correct pour chaque mode (50/50 split, full-screen local, full-screen remote)

### CA-split-04 : Pas de distant → local seul

- [ ] Si `snapshot.remotes?.origin` absent/vide : seul "Local" actif
- [ ] Boutons "Split" et "Remote" grisés (disabled)
- [ ] Message utilisateur optionnel visible

### CA-split-05 : Badges avec `kind` discriminant

- [ ] Type `Badge.kind` existant, non plus inféré de la couleur
- [ ] Render peut switcher sur `kind` (testablité améliorée)
- [ ] Styles visuels inchangés

### CA-split-06 : Refs de suivi sur graphe local (si distant présent)

- [ ] Badges `kind: 'remote'` visibles sur le graphe local pour les refs `origin/main`, etc.
- [ ] Label format : "origin/main" (ou "origin/feature")
- [ ] Style distinct (gris, différent des branches)

### CA-split-07 : Surlignage commits non-poussés

- [ ] Commits en local, absents du suivi : surlignés visuellement (couleur, halo ou stroke)
- [ ] Highlight appliqué via `highlighted-nodes` prop de `GraphCanvas`
- [ ] Testé sur un scénario push divergent (Phase 9, spec 41)

### CA-split-08 : Surlignage commits à récupérer

- [ ] Commits distants, absents localement : surlignés visuellement
- [ ] Affichés sur le graphe distant
- [ ] Testé sur un scénario fetch divergent

### CA-split-09 : Sync zoom/pan (optionnel)

- [ ] Checkbox "Zoom/Pan synchronisés" visible dans la toolbar
- [ ] Si coché : actions sur un graphe appliquées aux deux
- [ ] Si décoché : zoom/pan indépendants (comportement par défaut)

### CA-split-10 : Mode split par défaut (si distant existe)

- [ ] À chargement de l'app : si `snapshot.remotes.origin` présent → mode "split" actif
- [ ] Sinon → mode "local"

### CA-split-11 : Mémoïsation badges/couleurs

- [ ] Computed properties pour `badgesByHash`, `colorMap`, etc.
- [ ] Pas de recalcul à chaque render (inspectable via profiler)
- [ ] Perf améliorée sur graphes volumineux (>200 commits)

### CA-split-12 : Layouts indépendants

- [ ] Local et distant ont chacun leur `GraphLayout` (appels indépendants à `computeLayout`)
- [ ] Hashes identiques → mêmes positions (déterministe)
- [ ] Hashes différents → layouts différents (algorithme pur)

### CA-split-13 : Pas de regression visuelle (local seul)

- [ ] Avant refactor : affichage du graphe local (spec 17) identique
- [ ] Après refactor : idem
- [ ] Pan/zoom/hover/selection conservent le même comportement

## 9. Implémentation : Points clés

1. **Extraction composant** :
   - Créer `src/components/GraphCanvas.vue` (nouveau)
   - Copier le rendu SVG + interactions de `GraphView.vue` (spec 17)
   - Paramétriser via props (`layout`, `badges`, `highlighted-nodes`)

2. **Refactor GraphView** :
   - Importer `GraphCanvas`
   - Implémenter la logique de mode (local, split, remote)
   - Calculer `localLayout`, `remoteLayout`, `badges`, `highlights` en computed

3. **Décorateurs** :
   - Helper `computeBadges(snapshot, 'local' | 'remote')` retourne `Badge[]` avec `kind`
   - Helper `highlightNonPushed()`, `highlightUnpulled()`
   - Intégrer dans le computed de la prop `highlighted-nodes`

4. **Persistance** (Phase 10) :
   - Sauvegarder `displayMode` dans localStorage (optionnel pour Phase 9)

## 10. Références

- **Spec 15** : Modèle snapshot enrichi (remotes, tracking)
- **Spec 16** : Layout pur et générique
- **Spec 17** : Rendu SVG original (`GraphView.vue`)
- **ROADMAP Phase 9** : Axe A split-screen

---

**Prochaines étapes** :
- Implémentation `GraphCanvas.vue` (extraction)
- Refactor `GraphView.vue` (conteneur + modes)
- Tests composants : modes, badges, highlights (Vitest + @vue/test-utils, Phase 10)
- Scénarios distants (spec 41)
