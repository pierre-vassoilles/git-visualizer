# Phase 7 : Palette de commandes & Aide contextuelle

## Résumé

La **Palette de commandes** est un système de recherche floue (fuzzy search) qui unifie l'accès aux commandes Git, scénarios pédagogiques, tutoriels et actions UI. Invoquée via **Ctrl/Cmd+K**, elle propose des suggestions contextuelles selon l'état du dépôt (ex. proposer `git commit` si l'index n'est pas vide, `--continue` si une opération est en cours). Aucune logique Git ne réside dans la palette ; elle **consulte** uniquement le catalogue, le snapshot et l'état du store.

## Architecture

### 1.1 Flux de données

```
Utilisateur tape Ctrl+K
        ↓
Modale CommandPalette.vue s'affiche
        ↓
Utilisateur tape dans l'input (ex. "com")
        ↓
searchCommands(query, catalog, snapshot, operationState)
        ↓
Candidats filtrés (fuzzy) affichés
        ↓
Utilisateur sélectionne (↓ / Enter)
        ↓
store.execute(cmd) OU ui action (toggle thème, etc.)
        ↓
Modale ferme
```

### 1.2 Contenu source

La palette compile des informations depuis :

1. **Catalogue de commandes** (`src/core/catalog.ts` ou `i18n.getCatalog()`)
   - Noms : `init`, `add`, `commit`, `merge`, ...
   - Catégories : `basics`, `branches`, `merging`, ...
   - Descriptions : "Initialize a new Git repository", ...

2. **Snapshot du dépôt** (`store.snapshot`)
   - État opération : merging/rebasing/cherry-picking → proposer `--continue`/`--abort`
   - Index non-empty → proposer `git commit`
   - Working tree modifié → proposer `git status`, `git diff`
   - Branches/tags existantes → proposer `checkout`, `merge`, `push`, ...

3. **Scénarios** (`scenarios.ts`)
   - Titre/description
   - Actions : "Initier un dépôt" → exécute scénario 1

4. **Actions UI**
   - Toggle thème sombre
   - Changer langue
   - Afficher/masquer RefsSidebar (mobile)
   - Reset dépôt
   - Charger/exporter session

5. **Tutoriels** (Phase 8+)
   - Titre, description, objectifs
   - Action : lancer le tutoriel

## Interface

### 2.1 Invocation

**Raccourci clavier** :
- **Linux/Windows** : `Ctrl+K`
- **macOS** : `Cmd+K`

**Éléments déclencheurs** (optionnel Phase 7) :
- Menu "Help" avec lien "Open command palette"
- Icône en haut à droite

### 2.2 Layout de la modale

```
┌─────────────────────────────────────┐
│  Command Palette             [×]    │
├─────────────────────────────────────┤
│ 🔍 Type to search...                │
│ Ctrl+K to close                     │
├─────────────────────────────────────┤
│ Recent                              │
│ > git commit (last used)            │
│ > git log                           │
│                                     │
│ Matching "com"                      │
│ • commit — Create a new commit      │
│ • config — Get/set config           │
│                                     │
│ Suggested (based on your repo)      │
│ • merge — Merge a branch            │
│ • push — Push commits               │
│                                     │
│ Scenarios                           │
│ • Scenario: Initier un dépôt        │
│                                     │
│ Actions                             │
│ • Toggle Dark Mode                  │
│ • Change Language                   │
│                                     │
└─────────────────────────────────────┘
```

### 2.3 Sections affichées

La palette affiche jusqu'à 5 sections :

1. **Recent** : dernières commandes exécutées (depuis store.history)
2. **Matching** : commandes/scénarios correspondant à la requête (fuzzy)
3. **Suggested** : suggestions contextuelles (basées sur l'état du dépôt)
4. **Scenarios** : tous les scénarios disponibles (si pas déjà matchés)
5. **Actions** : actions UI (thème, langue, reset, etc.)

### 2.4 Navigation & sélection

**Clavier** :
- **↓ / ↑** : naviguer dans les candidats (wrapping)
- **Enter** : exécuter le candidat sélectionné
- **Escape** : fermer la palette sans action
- **Tab** : passer à la section suivante (optionnel)

**Souris** :
- Clic sur un candidat → sélectionne et exécute

## Contenu détaillé

### 3.1 Commandes Git

**Sources** :
- Catalogue du core (tous les noms)
- Flags courants (ex. `--force`, `--soft`) proposés après la commande

**Groupement par catégorie** (optionnel) :
```
Basics
  init — Initialise un nouveau dépôt
  add — Ajoute des fichiers à l'index
  
Branches
  branch — Liste/crée/supprime des branches
  checkout — Bascule vers une branche
  switch — Bascule (alternative à checkout)
```

**Description affichée** : première ligne du synopsis/description du catalogue

### 3.2 Suggestions contextuelles

Basées sur le `snapshot.operationState` et l'état du dépôt :

**Cas 1 : Merge en cours**
```
snapshot.operationState.type === 'merging'
→ Proposer :
  • merge --continue — Continuer le merge
  • merge --abort — Abandonner le merge
```

**Cas 2 : Rebase en cours**
```
snapshot.operationState.type === 'rebasing'
→ Proposer :
  • rebase --continue
  • rebase --abort
```

**Cas 3 : Index non vide** (fichiers staged)
```
snapshot.index différent de snapshot.commits[HEAD].tree
→ Proposer :
  • commit -m — Créer un commit
  • status — Voir l'état actuel
  • restore --staged — Unstage les fichiers
```

**Cas 4 : Working tree modifié** (fichiers non staged)
```
snapshot.workingTree différent de snapshot.index
→ Proposer :
  • add — Stage les fichiers
  • diff — Voir les changements
  • restore — Restaurer les fichiers
```

**Cas 5 : Branches multiples**
```
snapshot.branches.length > 1
→ Proposer :
  • merge — Fusionner une branche
  • checkout — Changer de branche
  • branch -d — Supprimer une branche
```

**Cas 6 : Tags existants**
```
Object.keys(snapshot.tags).length > 0
→ Proposer :
  • tag — Afficher/créer/supprimer des tags
```

### 3.3 Scénarios

Tous les scénarios (depuis `scenarios.ts`) sont listés/filtrables :

```
Scenario: Initier un dépôt
  Objective: Learn to create a repository and make your first commit
  [Click to execute or press Enter]
```

**Exécution** : `executeScenario(id)` du store

### 3.4 Actions UI

Actions non-Git natives :

```
• Toggle Dark Mode — Switch between light and dark themes
• Change Language (FR/EN) — Change the interface language
• Reset Repository — Clear the repository and start fresh
• Show/Hide Sidebar — Toggle the refs sidebar (mobile)
• Export Session — Download command history as JSON
• Import Session — Load a previously exported session (if available)
```

**Exécution** : appel direct (ex. `theme.setTheme(...)`) ou `store.reset()`

## Implémentation

### 4.1 Fonction de recherche (headless)

**`src/utils/commandPalette.ts`** :

```typescript
export interface PaletteItem {
  id: string;                    // unique id
  section: 'recent' | 'matching' | 'suggested' | 'scenarios' | 'actions';
  category?: string;             // ex. "basics", "branches"
  title: string;                 // ex. "commit"
  subtitle?: string;             // ex. "Create a new commit"
  command?: string;              // ex. "git commit -m" (si commande)
  action?: () => void;           // callback (si action UI)
  scenarioId?: string;           // (si scénario)
  icon?: string;                 // optionnel, ex. "📝"
}

export interface PaletteResult {
  items: PaletteItem[];
}

export function searchPalette(
  query: string,
  catalog: CommandCatalog,
  snapshot: RepoSnapshot,
  operationState: OperationState | null,
  scenarios: Scenario[],
  store: RepoStore
): PaletteResult {
  const items: PaletteItem[] = [];

  // 1. Recent
  const recent = store.history?.slice(-5).reverse() ?? [];
  recent.forEach((cmd) => {
    items.push({
      id: `recent-${cmd}`,
      section: 'recent',
      title: cmd,
      command: cmd,
    });
  });

  // 2. Matching (fuzzy search dans commandes)
  const cmdMatches = fuzzySearchCommands(query, catalog);
  cmdMatches.forEach((cmd) => {
    items.push({
      id: `cmd-${cmd.name}`,
      section: 'matching',
      category: cmd.category,
      title: cmd.name,
      subtitle: cmd.description,
      command: `git ${cmd.name}`,
    });
  });

  // 3. Suggested (contextuelles)
  const suggested = suggestContextual(snapshot, operationState);
  suggested.forEach((sug) => {
    items.push({
      id: `suggested-${sug.id}`,
      section: 'suggested',
      title: sug.title,
      subtitle: sug.description,
      command: sug.command,
    });
  });

  // 4. Scenarios
  const scenarioMatches = fuzzySearchScenarios(query, scenarios);
  scenarioMatches.forEach((scn) => {
    items.push({
      id: `scenario-${scn.id}`,
      section: 'scenarios',
      title: scn.title,
      subtitle: scn.description,
      scenarioId: scn.id,
    });
  });

  // 5. Actions
  const actionMatches = fuzzySearchActions(query);
  actionMatches.forEach((act) => {
    items.push({
      id: `action-${act.id}`,
      section: 'actions',
      title: act.title,
      subtitle: act.description,
      action: act.callback,
    });
  });

  return { items };
}

function fuzzySearchCommands(
  query: string,
  catalog: CommandCatalog
): CommandEntry[] {
  if (!query) return [];
  return catalog.commands
    .filter((cmd) => fuzzyMatch(query, cmd.name))
    .sort((a, b) => fuzzyScore(query, a.name) - fuzzyScore(query, b.name));
}

function fuzzyMatch(query: string, text: string): boolean {
  // Implémentation fuzzy basique : tous les chars de query se trouvent dans text (in order)
  let qIdx = 0;
  for (let tIdx = 0; tIdx < text.length && qIdx < query.length; tIdx++) {
    if (text[tIdx].toLowerCase() === query[qIdx].toLowerCase()) {
      qIdx++;
    }
  }
  return qIdx === query.length;
}

function fuzzyScore(query: string, text: string): number {
  // Score de match : moins de caractères entre matches = meilleur score
  let score = 0;
  let qIdx = 0;
  for (let tIdx = 0; tIdx < text.length && qIdx < query.length; tIdx++) {
    if (text[tIdx].toLowerCase() === query[qIdx].toLowerCase()) {
      score -= tIdx;
      qIdx++;
    }
  }
  return score; // Négatif = meilleur (triage ascendant)
}

function suggestContextual(
  snapshot: RepoSnapshot,
  operationState: OperationState | null
): Array<{ id: string; title: string; description: string; command: string }> {
  const suggestions: any[] = [];

  if (operationState?.type === 'merging') {
    suggestions.push({
      id: 'merge-continue',
      title: 'merge --continue',
      description: 'Continue the merge',
      command: 'git merge --continue',
    });
    suggestions.push({
      id: 'merge-abort',
      title: 'merge --abort',
      description: 'Abort the merge',
      command: 'git merge --abort',
    });
  }

  if (operationState?.type === 'rebasing') {
    suggestions.push({
      id: 'rebase-continue',
      title: 'rebase --continue',
      description: 'Continue the rebase',
      command: 'git rebase --continue',
    });
    suggestions.push({
      id: 'rebase-abort',
      title: 'rebase --abort',
      description: 'Abort the rebase',
      command: 'git rebase --abort',
    });
  }

  // Index non vide
  if (snapshot.index && isIndexNonEmpty(snapshot)) {
    suggestions.push({
      id: 'commit',
      title: 'commit -m',
      description: 'Create a new commit',
      command: 'git commit -m ""',
    });
  }

  // Working tree modifié
  if (snapshot.workingTree && isWorkingTreeModified(snapshot)) {
    suggestions.push({
      id: 'add',
      title: 'add',
      description: 'Stage files',
      command: 'git add ',
    });
    suggestions.push({
      id: 'status',
      title: 'status',
      description: 'Show repository status',
      command: 'git status',
    });
  }

  return suggestions;
}

function isIndexNonEmpty(snapshot: RepoSnapshot): boolean {
  if (!snapshot.commits.length) return false;
  const headTree = snapshot.commits[snapshot.commits.length - 1]?.tree;
  return snapshot.index?.root !== headTree?.root;
}

function isWorkingTreeModified(snapshot: RepoSnapshot): boolean {
  if (!snapshot.index) return false;
  return snapshot.workingTree?.root !== snapshot.index?.root;
}

function fuzzySearchScenarios(query: string, scenarios: Scenario[]): Scenario[] {
  if (!query) return scenarios;
  return scenarios
    .filter((s) => fuzzyMatch(query, s.title) || fuzzyMatch(query, s.description))
    .sort((a, b) => fuzzyScore(query, a.title) - fuzzyScore(query, b.title));
}

function fuzzySearchActions(query: string): Array<any> {
  const actions = [
    { id: 'theme', title: 'Toggle Dark Mode', description: 'Switch between light and dark themes' },
    { id: 'language', title: 'Change Language', description: 'Switch between FR/EN' },
    { id: 'reset', title: 'Reset Repository', description: 'Clear and start fresh' },
    // ...
  ];
  if (!query) return actions;
  return actions.filter((a) => fuzzyMatch(query, a.title) || fuzzyMatch(query, a.description));
}
```

### 4.2 Composant Vue

**`src/components/CommandPalette.vue`** :

```vue
<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="palette-overlay" @click.self="close">
        <div class="palette-modal">
          <!-- Header -->
          <div class="palette-header">
            <span class="title">Command Palette</span>
            <button aria-label="Close" @click="close" class="btn-close">×</button>
          </div>

          <!-- Search input -->
          <div class="palette-search">
            <span class="icon">🔍</span>
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              placeholder="Type to search..."
              @keydown.down="selectNext"
              @keydown.up="selectPrev"
              @keydown.enter="executeSelected"
              @keydown.escape="close"
              autocomplete="off"
            />
            <span class="hint">{{ selectedIdx + 1 }} of {{ filteredItems.length }} • Ctrl+K to close</span>
          </div>

          <!-- Results -->
          <div class="palette-results" ref="resultsRef">
            <!-- Sections -->
            <div
              v-for="section in groupedSections"
              :key="section.name"
              class="palette-section"
            >
              <div class="section-title">{{ section.name }}</div>
              <div
                v-for="(item, idx) in section.items"
                :key="item.id"
                @click="() => execute(item)"
                @mouseenter="selectedIdx = globalIdx(section, idx)"
                class="palette-item"
                :class="{ selected: selectedIdx === globalIdx(section, idx) }"
              >
                <div class="item-title">
                  {{ item.icon ?? '•' }} {{ item.title }}
                </div>
                <div class="item-subtitle">{{ item.subtitle }}</div>
              </div>
            </div>

            <!-- Empty state -->
            <div v-if="filteredItems.length === 0" class="empty">
              No results for "{{ query }}"
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useI18n } from '@/i18n';
import { useTheme } from '@/composables/useTheme';
import { searchPalette } from '@/utils/commandPalette';
import type { PaletteItem } from '@/utils/commandPalette';

const store = useRepoStore();
const { t } = useI18n();
const theme = useTheme();

const isOpen = ref(false);
const query = ref('');
const selectedIdx = ref(0);
const inputRef = ref<HTMLInputElement>();
const resultsRef = ref<HTMLDivElement>();

const snapshot = computed(() => store.snapshot);

const searchResults = computed(() =>
  searchPalette(
    query.value,
    // TODO: getCatalog from i18n
    snapshot.value,
    store.snapshot.operationState || null,
    [], // scenarios
    store
  )
);

const filteredItems = computed(() => searchResults.value.items);

const groupedSections = computed(() => {
  const groups: Record<string, PaletteItem[]> = {};
  filteredItems.value.forEach((item) => {
    if (!groups[item.section]) groups[item.section] = [];
    groups[item.section].push(item);
  });
  return Object.entries(groups).map(([name, items]) => ({ name, items }));
});

function globalIdx(section: any, idx: number): number {
  let count = 0;
  for (const grp of groupedSections.value) {
    if (grp.name === section.name) {
      return count + idx;
    }
    count += grp.items.length;
  }
  return 0;
}

function open() {
  isOpen.value = true;
  query.value = '';
  selectedIdx.value = 0;
  onMounted(() => {
    inputRef.value?.focus();
  });
}

function close() {
  isOpen.value = false;
}

function selectNext() {
  if (filteredItems.value.length === 0) return;
  selectedIdx.value = (selectedIdx.value + 1) % filteredItems.value.length;
  scrollToSelected();
}

function selectPrev() {
  if (filteredItems.value.length === 0) return;
  selectedIdx.value =
    (selectedIdx.value - 1 + filteredItems.value.length) % filteredItems.value.length;
  scrollToSelected();
}

function scrollToSelected() {
  // Scroll pour que selectedItem soit visible
  if (resultsRef.value) {
    const items = resultsRef.value.querySelectorAll('.palette-item');
    items[selectedIdx.value]?.scrollIntoView({ block: 'nearest' });
  }
}

function executeSelected() {
  if (selectedIdx.value < filteredItems.value.length) {
    execute(filteredItems.value[selectedIdx.value]);
  }
}

function execute(item: PaletteItem) {
  if (item.command) {
    store.execute(item.command);
  } else if (item.scenarioId) {
    store.executeScenario(item.scenarioId);
  } else if (item.action) {
    item.action();
  }
  close();
}

// Raccourci Ctrl+K / Cmd+K
onMounted(() => {
  const handleKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      isOpen.value ? close() : open();
    }
  };
  window.addEventListener('keydown', handleKey);
  onUnmounted(() => window.removeEventListener('keydown', handleKey));
});

defineExpose({ open, close });
</script>

<style scoped>
.palette-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.palette-modal {
  width: 90%;
  max-width: 600px;
  background: var(--bg-primary);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.palette-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-weight: 600;
  color: var(--text-primary);
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0;
}

.palette-search {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  gap: 8px;
  align-items: center;
}

.icon {
  font-size: 18px;
}

.palette-search input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--text-primary);
}

.palette-search input::placeholder {
  color: var(--text-tertiary);
}

.hint {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.palette-results {
  overflow-y: auto;
  flex: 1;
  padding: 8px 0;
}

.palette-section {
  padding: 8px 0;
}

.section-title {
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.palette-item {
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.1s;
  border: none;
}

.palette-item:hover,
.palette-item.selected {
  background: var(--bg-secondary);
}

.item-title {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
}

.item-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.empty {
  padding: 20px 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
```

### 4.3 Intégration dans App.vue

```vue
<script setup lang="ts">
import CommandPalette from '@/components/CommandPalette.vue';

const paletteRef = ref();

// Optionnel : exposer via ref pour appels depuis d'autres composants
</script>

<template>
  <CommandPalette ref="paletteRef" />
  <!-- ... reste de l'app ... -->
</template>
```

## Critères d'acceptation

### CA-palette-01 : Ouvrir avec Ctrl+K

**Given**
- Page chargée
- Aucune modale ouverte

**When**
- Utilisateur tape Ctrl+K (Cmd+K sur Mac)

**Then**
- CommandPalette s'affiche
- Input reçoit le focus automatiquement
- Aucune commande ne s'exécute

### CA-palette-02 : Fermer avec Escape

**Given**
- Palette ouverte

**When**
- Utilisateur tape Escape

**Then**
- Palette se ferme
- Focus revient au document

### CA-palette-03 : Fermer avec Ctrl+K

**Given**
- Palette ouverte

**When**
- Utilisateur tape Ctrl+K à nouveau

**Then**
- Palette se ferme

### CA-palette-04 : Recherche floue sur commandes

**Given**
- Palette ouverte
- Catalogue contient : init, add, commit, checkout, cherry-pick

**When**
- Utilisateur tape "ch"

**Then**
- Candidats affichés : checkout, cherry-pick
- Ordre : meilleur match en tête (ex. "checkout" avant "cherry-pick")

### CA-palette-05 : Suggestions contextuelles

**Given**
- Utilisateur a modifié des fichiers (index non vide)

**When**
- Palette ouverte

**Then**
- Section "Suggested" propose "commit -m"
- Autres suggestions : "add", "status", "restore --staged"

### CA-palette-06 : Continue/Abort en opération

**Given**
- Merge en cours

**When**
- Palette ouverte

**Then**
- Section "Suggested" propose "merge --continue" et "merge --abort"
- Pas d'autres suggestions de merge

### CA-palette-07 : Scénarios affichés

**Given**
- 5 scénarios définis

**When**
- Palette ouverte, requête vide

**Then**
- Section "Scenarios" listée
- Tous les 5 scénarios affichés (titre + description courte)

### CA-palette-08 : Recherche dans scénarios

**Given**
- Scénario 1 : "Initier un dépôt"
- Scénario 2 : "Naviguer entre branches"

**When**
- Utilisateur tape "initial"

**Then**
- Seul le scénario 1 matché et affichée
- Fuzzy match : "initial" contient "init"

### CA-palette-09 : Actions UI affichées

**Given**
- Palette ouverte

**When**
- Section "Actions" visible

**Then**
- "Toggle Dark Mode" affiché
- "Change Language" affiché
- "Reset Repository" affiché

### CA-palette-10 : Naviguer avec ↓↑ et Enter

**Given**
- Palette ouverte
- 3 candidats : init, add, commit

**When**
- Utilisateur : ↓ ↓ Enter

**Then**
- Sélection : init → add → commit
- Commit exécuté : `store.execute('git commit')`
- Palette ferme

### CA-palette-11 : Exécuter avec souris

**Given**
- Palette ouverte
- "commit" visible dans la liste

**When**
- Utilisateur clique sur "commit"

**Then**
- `store.execute('git commit')` appelé
- Palette ferme

### CA-palette-12 : Recent commands affichés

**Given**
- store.history = ["init", "add f.txt", "commit -m \"test\""]

**When**
- Palette ouverte, requête vide

**Then**
- Section "Recent" affichée
- 3 commandes listées en inverse order (plus récente en haut)

### CA-palette-13 : Scénario exécuté

**Given**
- Palette ouverte
- Scénario 1 sélectionné

**When**
- Utilisateur appuie Enter

**Then**
- `store.executeScenario(scenario1.id)` appelé
- Palette ferme

### CA-palette-14 : Toggle dark mode action

**Given**
- Palette ouverte
- Action "Toggle Dark Mode" sélectionnée

**When**
- Utilisateur appuie Enter

**Then**
- `theme.setTheme(...)` appelé
- Thème change
- Palette ferme

### CA-palette-15 : Pas de résultats

**Given**
- Palette ouverte
- Utilisateur tape "nosuchcommand"

**When**
- Affichage

**Then**
- Section "No results for ..." affichée
- Pas de candidats
- Aucune exécution si Enter

### CA-palette-16 : Scroll automatique

**Given**
- Palette avec beaucoup de candidats
- Utilisateur navigue avec ↓

**When**
- Sélection atteint un item hors viewport

**Then**
- Scroll automatique pour afficher le candidat
- Smooth scroll ou instant (optionnel)

### CA-palette-17 : Focus visible sur item sélectionné

**Given**
- Palette ouverte

**When**
- Candidats affichés, un sélectionné

**Then**
- Item sélectionné a classe `selected`
- Couleur de fond changée (contrast visible)

### CA-palette-18 : Type-safe commands

**Given**
- Code source

**When**
- Dev tape `store.execute('invalid-cmd')`

**Then**
- TypeScript error (ou runtime warning gracieux)
- Suggestions auto-complète proposent les commandes valides

**Automatisation** : Vérifier que `command` est un subset de CommandCatalog.names

### CA-palette-19 : Fuzzy score correct

**Given**
- Query : "co"
- Candidats : "checkout", "config", "commit"

**When**
- Appel `searchPalette(...)`

**Then**
- Tous 3 matchent
- Ordre : "commit" (meilleur : "co" au début) > "checkout" > "config"

**Automatisation** : Test unitaire sur `fuzzyScore`

### CA-palette-20 : Pas d'exécution accidentelle

**Given**
- Palette affichée
- Utilisateur commence à taper une commande

**When**
- Utilisateur tape Escape avant de sélectionner

**Then**
- Palette se ferme
- Aucune commande n'a été exécutée
- Terminal reste inchangé

## Optionnel Phase 7 (polish)

- **Icônes** : Ajouter emoji/icônes pour chaque catégorie (ex. 📝 pour commit, 🌳 pour branch)
- **Groupement** : Grouper par catégorie (Basics, Branches, Merging, etc.)
- **Récent persistent** : Persister `store.history` au-delà de la session
- **Statistiques** : Afficher combien de fois chaque commande a été exécutée
- **Tutoriels** : Section supplémentaire si tutoriels implémentés en Phase 8

## Dépendances inter-phases

- **Phase 7** : Palette basique (commandes, scénarios, actions UI)
- **Phase 8** : Ajouter suggestions intelligentes plus fines (ex. détection « user wants to push »)
- **Phase 9** : Intégration avec tutoriels guidés + export/import session

## Points clés

1. **Headless search** : `searchPalette()` est une fonction pure testable

2. **Fuzzy matching** : Simple implémentation (tous les chars in order) ; peut être raffinée après

3. **Réactivité** : `filteredItems` recomputed à chaque changement de `query` ou `snapshot`

4. **Contexte dépôt** : Suggestions basées sur l'état réel (index, opération, branches)

5. **Pas de logique Git** : Palette consulte le store/snapshot, ne calcule pas Git

6. **Keyboard-first** : Navigation clavier fluide, optionnel souris

7. **Accessible** : Focus management, ARIA role/labels, clavier inclusif
