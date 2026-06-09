# Phase 6 : RefsSidebar – Finalisation

## Résumé

La **RefsSidebar** est la zone de gauche (sidebar) affichant l'état du dépôt en temps réel : branches, HEAD (symbolique ou détaché), tags, état d'opération en cours, compteur de stash, et historique des commandes. Elle consomme uniquement le `snapshot` du moteur (aucune logique Git) et se met à jour réactivement à chaque commande.

**Phase 2** a défini le modèle ; **Phase 6** finalise l'implémentation réelle.

## Layout et contenu

### Structure générale

```
┌──────────────────────┐
│  Git Visualizer      │
├──────────────────────┤
│ Branches             │
│  [*] main            │ ← HEAD sur main
│  [ ] feature         │
│  [ ] hotfix          │
│                      │
│ HEAD                 │
│  symbolic: true      │
│  target: main        │
│  (ou "detached @ abc1234") │
│                      │
│ Tags                 │
│  v1.0                │
│  v1.1                │
│  release             │
│                      │
│ Opération en cours   │
│  ⚠ Merging...        │
│  Branch: feature     │
│  Files in conflict: 1│
│  (ou "Rebasing...", "Cherry-picking...") │
│                      │
│ Stash                │
│  Count: 2            │
│  (lister les entrées) │
│                      │
│ Commandes récentes   │
│  > git init          │
│  > git add file.txt  │
│  > git commit -m ... │
│  > git branch feat   │
│  > git checkout feat │
│  [Reset History]     │
│                      │
└──────────────────────┘
```

## Composants

### 1. Branches

**Source de donnée** : `snapshot.branches: string[]`

**Rendu** :
- Titre "Branches"
- Liste des noms de branches
- Pour chaque branche :
  - Prefix : `[*]` si HEAD pointe dessus, sinon `[ ]`
  - Nom de la branche
  - Optionnel : hash court du commit
  - Optionnel : bouton de suppression (hover)

**Interaction (optionnel Phase 6)** :
- Clic sur une branche → `git checkout <branche>`
- Ou juste affichage (navigation via terminal)

### 2. HEAD

**Source de donnée** : `snapshot.head: { symbolic: boolean; target: string }`

**Rendu** :
- Titre "HEAD"
- Si `symbolic === true` :
  ```
  symbolic: true
  → refs/heads/main
  ```
- Si `symbolic === false` (détaché) :
  ```
  detached: true
  → abc1234 (short hash)
  ```

**Optionnel** : couleur ou icône pour HEAD détaché (warning)

### 3. Tags

**Source de donnée** : `snapshot.tags: Record<string, string>`

**Rendu** :
- Titre "Tags"
- Afficher les noms des tags (ou liste vide si aucun)
- Chaque tag : nom + optionnel (shortHash du commit visé)

```
Tags
  v1.0 (abc1234)
  v1.1 (def5678)
  release (abc1234)
```

**Interaction** : Optionnel — clic → `git show <tag>` ou juste affichage

### 4. Opération en cours

**Source de donnée** : `snapshot.operationState: OperationState | null`

```typescript
interface OperationState {
  type: "merging" | "rebasing" | "cherry-picking" | "reverting";
  sourceBranch?: string;  // Branch merging in (ex: "feature")
  filesInConflict?: number;  // Count of conflicted files
  progress?: string;  // Ex: "3/5 commits" for rebase
}
```

**Rendu** :
- Afficher uniquement si `operationState !== null`
- Titre : "⚠ Opération en cours"
- Détails de l'opération :
  ```
  Merging
  Source: feature
  Conflicts: 1 file
  
  Actions:
  [Continue] [Abort]
  ```
- Ou pour rebase en cours :
  ```
  Rebasing
  Base: main
  Progress: 2/3 commits
  
  Actions:
  [Continue] [Abort]
  ```

**Interaction** (optionnel Phase 6) :
- Boutons `[Continue]` et `[Abort]` → exécuter `git merge --continue` / `--abort`

### 5. Stash

**Source de donnée** : `snapshot.stashCount: number` (optionnel ; ajouter en Phase 6)

**Rendu** :
```
Stash
  Count: 2
  
  stash@{0}: WIP on main: abc1234
  stash@{1}: WIP on feature: def5678
  
  [List] [Pop] [Apply] [Clear]
```

**Détail optionnel** : si `snapshot.stashEntries: StashEntry[]` disponible
```typescript
interface StashEntry {
  index: number;
  branch: string;
  description: string;
  hash: string;
}
```

**Interaction** : Optionnel — boutons pour pop/apply/list/drop

### 6. Commandes récentes

**Source de donnée** : `store.history: string[]` (historique d'exécution)

**Rendu** :
- Titre "Commandes récentes"
- Afficher les 5-10 dernières commandes (reverse chronologique : plus récent en haut)
- Format : `> git <commande>`
- Optionnel : clic pour re-exécuter

```
Commandes récentes
  > git checkout main
  > git merge feature
  > git add file.txt
  > git commit -m "Test"
  > git init
  
  [Reset History]
```

**Interaction** :
- Clic sur une commande → re-exécuter (ou copier dans le terminal ?)
- Bouton "Reset History" → nettoie localStorage + réinitialise l'engine

## Modèle de données (snapshot)

Vérifier que le snapshot expose tous les champs nécessaires :

```typescript
export interface RepoSnapshot {
  // Existants
  branches: string[];
  head: { symbolic: boolean; target: string };
  tags: Record<string, string>;
  commits: SnapshotCommit[];
  allCommits?: SnapshotCommit[];
  operationState?: OperationState;
  
  // À ajouter en Phase 6 pour la sidebar
  stashCount?: number;
  stashEntries?: Array<{
    index: number;
    branch: string;
    description: string;
    hash: string;
  }>;
  
  // Pour affichage des tags sur commits
  // (déjà existant ?)
}

interface OperationState {
  type: "merging" | "rebasing" | "reverting" | "cherry-picking";
  sourceBranch?: string;
  filesInConflict?: number;
  progress?: string;
}
```

## Composant Vue

```vue
<!-- src/components/RefsSidebar.vue -->
<template>
  <aside class="refs-sidebar">
    <!-- Branches -->
    <section class="section-branches">
      <h2>Branches</h2>
      <div v-if="snapshot.branches.length === 0" class="empty">
        No branches
      </div>
      <ul v-else class="branch-list">
        <li v-for="branch in snapshot.branches" :key="branch">
          <span class="branch-indicator">
            {{ isHeadOnBranch(branch) ? '[*]' : '[ ]' }}
          </span>
          <span class="branch-name">{{ branch }}</span>
          <span class="branch-hash">{{ getBranchHash(branch) }}</span>
        </li>
      </ul>
    </section>

    <!-- HEAD -->
    <section class="section-head">
      <h2>HEAD</h2>
      <div v-if="snapshot.head.symbolic" class="head-symbolic">
        <strong>{{ snapshot.head.target }}</strong>
      </div>
      <div v-else class="head-detached">
        <strong>detached</strong>
        <br />
        <code>{{ shortHash(snapshot.head.target) }}</code>
      </div>
    </section>

    <!-- Tags -->
    <section class="section-tags" v-if="tagsArray.length > 0">
      <h2>Tags</h2>
      <ul class="tags-list">
        <li v-for="tag in tagsArray" :key="tag">
          <span class="tag-name">{{ tag }}</span>
          <span class="tag-hash">{{ getTagHash(tag) }}</span>
        </li>
      </ul>
    </section>

    <!-- Opération en cours -->
    <section class="section-operation" v-if="snapshot.operationState">
      <h2>⚠ Opération en cours</h2>
      <div class="operation-details">
        <p><strong>{{ snapshot.operationState.type }}</strong></p>
        <p v-if="snapshot.operationState.sourceBranch">
          Source: {{ snapshot.operationState.sourceBranch }}
        </p>
        <p v-if="snapshot.operationState.filesInConflict">
          Conflicts: {{ snapshot.operationState.filesInConflict }} file(s)
        </p>
        <p v-if="snapshot.operationState.progress">
          {{ snapshot.operationState.progress }}
        </p>
        <div class="operation-actions">
          <button @click="continueOperation" class="btn-continue">
            Continue
          </button>
          <button @click="abortOperation" class="btn-abort">Abort</button>
        </div>
      </div>
    </section>

    <!-- Stash -->
    <section class="section-stash" v-if="snapshot.stashCount! > 0">
      <h2>Stash</h2>
      <div class="stash-count">Count: {{ snapshot.stashCount }}</div>
      <ul v-if="snapshot.stashEntries" class="stash-list">
        <li v-for="entry in snapshot.stashEntries" :key="entry.index">
          stash@{{ '{' }}{{ entry.index }}{{ '}' }}: {{ entry.description }}
        </li>
      </ul>
    </section>

    <!-- Commandes récentes -->
    <section class="section-history">
      <h2>Commandes récentes</h2>
      <ul v-if="recentCommands.length > 0" class="command-list">
        <li v-for="(cmd, i) in recentCommands" :key="i" class="command-item">
          <code>> git {{ cmd }}</code>
        </li>
      </ul>
      <div v-else class="empty">No commands yet</div>
      <button v-if="recentCommands.length > 0" @click="resetHistory" class="btn-reset">
        Reset History
      </button>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRepoStore } from "@/stores/repo";

const store = useRepoStore();

const snapshot = computed(() => store.snapshot);

const tagsArray = computed(() =>
  snapshot.value.tags ? Object.keys(snapshot.value.tags) : []
);

const recentCommands = computed(() => {
  const all = store.history ?? [];
  return all.slice(-10).reverse();  // 10 dernières, plus récente en haut
});

const isHeadOnBranch = (branchName: string): boolean => {
  if (!snapshot.value.head.symbolic) return false;
  return snapshot.value.head.target === `refs/heads/${branchName}`;
};

const getBranchHash = (branchName: string): string => {
  const commit = snapshot.value.commits.find((c) =>
    c.branches.includes(branchName)
  );
  return commit ? shortHash(commit.hash) : "";
};

const getTagHash = (tagName: string): string => {
  const hash = snapshot.value.tags?.[tagName];
  return hash ? shortHash(hash) : "";
};

const shortHash = (hash: string): string => hash.slice(0, 7);

const continueOperation = () => {
  const opType = snapshot.value.operationState?.type;
  if (opType === "merging") {
    store.execute("merge --continue");
  } else if (opType === "rebasing") {
    store.execute("rebase --continue");
  } else if (opType === "cherry-picking") {
    store.execute("cherry-pick --continue");
  } else if (opType === "reverting") {
    // Revert doesn't have --continue, mais on peut offer next revert
  }
};

const abortOperation = () => {
  const opType = snapshot.value.operationState?.type;
  const cmd = {
    merging: "merge --abort",
    rebasing: "rebase --abort",
    cherry-picking: "cherry-pick --abort",
  }[opType!];
  if (cmd) {
    store.execute(cmd);
  }
};

const resetHistory = () => {
  if (confirm("Reset history and clear localStorage?")) {
    store.resetStorage();
  }
};
</script>

<style scoped>
.refs-sidebar {
  width: 280px;
  padding: 16px;
  background: #f5f5f5;
  border-right: 1px solid #ddd;
  overflow-y: auto;
  font-family: monospace;
  font-size: 13px;
}

.section {
  margin-bottom: 20px;
}

h2 {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 8px;
  border-bottom: 1px solid #ccc;
  padding-bottom: 4px;
}

.branch-list,
.tags-list,
.command-list,
.stash-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.branch-list li,
.tags-list li,
.command-list li,
.stash-list li {
  padding: 4px 0;
  border-bottom: 1px solid #eee;
}

.branch-indicator {
  margin-right: 8px;
  font-weight: bold;
  color: #0066cc;
}

.branch-name {
  font-weight: bold;
}

.branch-hash,
.tag-hash {
  color: #666;
  font-size: 11px;
  margin-left: 8px;
}

.head-symbolic {
  padding: 8px;
  background: #e8f4f8;
  border-left: 3px solid #0099ff;
}

.head-detached {
  padding: 8px;
  background: #fff0e8;
  border-left: 3px solid #ff9900;
}

.operation-details {
  padding: 8px;
  background: #fff3cd;
  border-left: 3px solid #ffc107;
  border-radius: 2px;
}

.operation-actions {
  margin-top: 8px;
  display: flex;
  gap: 6px;
}

.btn-continue,
.btn-abort,
.btn-reset {
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid #ccc;
  background: white;
  border-radius: 2px;
}

.btn-continue:hover {
  background: #d4edda;
}

.btn-abort:hover {
  background: #f8d7da;
}

.btn-reset:hover {
  background: #e2e3e5;
}

.empty {
  color: #999;
  font-style: italic;
  padding: 8px 0;
}

.stash-count {
  padding: 4px 0;
  font-weight: bold;
}

.command-item code {
  color: #0066cc;
}
</style>
```

## Critères d'acceptation

### CA-refs-sidebar-01 : Affiche les branches

**Given**
- Snapshot contient branches : ["main", "feature"]

**When**
- RefsSidebar est montée

**Then**
- Affiche la section "Branches"
- Répertorie "main" et "feature"
- Indiquant laquelle a le HEAD

### CA-refs-sidebar-02 : Indique HEAD symbolique

**Given**
- HEAD.symbolic === true, HEAD.target === "refs/heads/main"

**When**
- RefsSidebar affiche

**Then**
- Section "HEAD" affiche "main" (ou "refs/heads/main")
- Style neutre (pas de warning)

### CA-refs-sidebar-03 : Indique HEAD détaché

**Given**
- HEAD.symbolic === false, HEAD.target === "abc1234..."

**When**
- RefsSidebar affiche

**Then**
- Section "HEAD" affiche "detached"
- Hash court affiché : "abc1234"
- Style warning (couleur orangée)

### CA-refs-sidebar-04 : Affiche les tags

**Given**
- Snapshot.tags = { "v1.0": "abc123...", "release": "def456..." }

**When**
- RefsSidebar affiche

**Then**
- Section "Tags" affiche "v1.0" et "release"
- Hash court associé à chaque tag

### CA-refs-sidebar-05 : Affiche opération en cours

**Given**
- Snapshot.operationState = { type: "merging", sourceBranch: "feature", filesInConflict: 1 }

**When**
- RefsSidebar affiche

**Then**
- Section "⚠ Opération en cours" visible
- Affiche "merging", "Source: feature", "Conflicts: 1 file"
- Boutons [Continue] et [Abort] présents

### CA-refs-sidebar-06 : N'affiche pas opération si null

**Given**
- Snapshot.operationState === null

**When**
- RefsSidebar affiche

**Then**
- Section "Opération en cours" absente
- Pas de warning

### CA-refs-sidebar-07 : Affiche compteur stash

**Given**
- Snapshot.stashCount === 2

**When**
- RefsSidebar affiche

**Then**
- Section "Stash" visible
- Affiche "Count: 2"

### CA-refs-sidebar-08 : Affiche commandes récentes

**Given**
- store.history = ["init", "add f1.txt", "commit -m \"test\""]

**When**
- RefsSidebar affiche

**Then**
- Section "Commandes récentes" visible
- Affiche les 3 commandes en reverse order (plus récente en haut)
- Format : "> git commit -m \"test\""

### CA-refs-sidebar-09 : Bouton Reset History

**Given**
- Historique non-vide

**When**
- Clique sur [Reset History] et confirme

**Then**
- localStorage est purgé
- store.reset() appelé
- Historique disparaît
- Sidebar rafraîchit

### CA-refs-sidebar-10 : Réactivité après commande

**Given**
- User exécute `git commit`

**When**
- Snapshot mis à jour (réactif)

**Then**
- RefsSidebar se rafraîchit automatiquement
- Historique affiche la nouvelle commande
- Branches/HEAD/Tags à jour

### CA-refs-sidebar-11 : Continue operation (merge)

**Given**
- Opération en cours : merging
- Conflit résolu (fichier modifié + staged)

**When**
- Clique [Continue]

**Then**
- Exécute `git merge --continue` automatiquement
- Snapshot.operationState devient null
- Section opération disparaît

### CA-refs-sidebar-12 : Abort operation

**Given**
- Opération en cours : rebasing

**When**
- Clique [Abort]

**Then**
- Exécute `git rebase --abort`
- HEAD restauré à l'état avant rebase
- Snapshot.operationState === null

## Implémentation : Points clés

1. **Computed properties** : `tagsArray`, `recentCommands`, etc. pour éviter les mutations directes

2. **Responsivité** : Chaque section s'affiche/masque selon le state (v-if)

3. **Styling** : Simples couleurs, pas de lib CSS complexe ; focus sur la lisibilité

4. **Aucune logique Git** : Le composant lit le snapshot et exécute des commandes basiques via le store

5. **Interactions** : Boutons Continue/Abort, Reset History — tout via `store.execute()`

## Dépendances inter-commandes

- Consomme le **snapshot réactif** (Pinia)
- Dépend de **toutes les commandes Phase 5** (pour afficher branches, tags, opérations)
- Affichage optionnel des **scénarios** (bouton pour charger un scénario)

## Notes pour Phase 6+

- **Phase 6** : Affichage basique + boutons Continue/Abort/Reset
- **Phase 7** : Ajouter interactions détaillées (clic sur branch → checkout, clic sur tag → show)
- **Phase 8** : Intégration avec ScenarioPanel (charger un scénario depuis la sidebar)
- **UI Polish** : Ajouter icônes, animations, dark mode, layout responsive
