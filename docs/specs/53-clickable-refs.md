# Phase 6+ – Refs cliquables et menu contextuel

## Résumé

Cette spec couvre les **interactions** sur le graphe et la sidebar : clic sur une branche/tag → `git checkout <ref>` automatique ; menu contextuel (clic droit) sur un commit → actions destructrices ou constructrices (reset, revert, cherry-pick, tag, checkout détaché, copier hash). Toutes les actions passent par `store.execute()` (aucune logique git dans l'UI). Les confirmations protègent contre les accidents.

## 1. Interactions sur la sidebar (RefsSidebar.vue)

### 1.1 Clic sur une branche

**Élément** : Badge de branche dans la section "Branches" (`RefsSidebar`).

**Comportement** :
- Clic simple : `git checkout <branchName>`
- **Confirmation** : aucune (safe operation).
- **Effets** :
  - Snapshot.head se met à jour (devient symbolic avec `target: refs/heads/<branchName>`).
  - Graphe se met à jour (HEAD badge se déplace).
  - Sidebar se rafraîchit (autre branche marquée `[*]`).

**État désactivé** :
- Si déjà sur cette branche : clic → noop (optionnel : visual disable / cursor not-allowed).

### 1.2 Clic sur un tag

**Élément** : Nom du tag dans la section "Tags".

**Comportement** :
- Clic simple : `git checkout <tagName>` (HEAD détaché sur le commit du tag).
- **Confirmation** : Optionnel (warning : "HEAD will be detached").
- **Effets** : HEAD détaché, graphe se met à jour.

### 1.3 Boutons Continue/Abort (existants)

**Specs 33 (RefsSidebar Phase 6)** les couvre déjà.

## 2. Interactions sur le graphe (GraphView.vue)

### 2.1 Clic simple sur un nœud

**Élément** : Cercle de commit dans le SVG.

**Comportement actuel** (spec 17) : Toggle sélection (visual highlight).

**Comportement nouveau** : Optionnel — afficher un **popup d'infos** ou un panel latéral :

```
Commit abc1234
Message: "Fix login bug"
Author: Unnamed <unnamed@example.com>
Date: Mon Jun 9 12:00:00 2025 +0000
Parents: def5678, abc7890
```

**Aucune action** : clic seul ne déclenche rien (juste affichage).

### 2.2 Clic droit (menu contextuel) sur un nœud

**Élément** : Cercle de commit (clic droit).

**Comportement** : Afficher un **menu contextuel** au-dessus du clic avec les actions suivantes :

```
┌──────────────────────────────────┐
│ ✓ Checkout (detached)            │
│ ↻ Reset --soft                   │
│ ↻ Reset --mixed                  │
│ ↻ Reset --hard                   │
│ ⮌ Revert                         │
│ ✪ Cherry-pick                    │
│ 🏷 Tag                           │
│ ─────────────────────────────────│
│ 📋 Copy hash                     │
└──────────────────────────────────┘
```

**Chaque action** :

#### 2.2.1 Checkout (detached)

- **Label** : "Checkout (detached)" ou juste "Checkout"
- **Commande** : `git checkout <shortHash>`
- **Confirmation** : Aucune
- **État désactivé** : Si HEAD pointe déjà ce commit
- **Effet** : HEAD détaché, graphe se met à jour

#### 2.2.2 Reset --soft

- **Label** : "Reset --soft"
- **Commande** : `git reset --soft <shortHash>`
- **Confirmation** : Warning « HEAD will move to this commit. Working tree and index unchanged. »
- **État désactivé** : Jamais (toujours possible si détaché ou sur une branche)
- **Effet** : HEAD se déplace, commits "oubliés" disparaissent du graphe

#### 2.2.3 Reset --mixed

- **Label** : "Reset --mixed"
- **Commande** : `git reset --mixed <shortHash>`
- **Confirmation** : Warning « HEAD will move. Index will be reset. »
- **Effet** : Comme --soft + index réinitialisé

#### 2.2.4 Reset --hard

- **Label** : "Reset --hard" (en rouge/warning style)
- **Commande** : `git reset --hard <shortHash>`
- **Confirmation** : **Confirmation obligatoire** : « You are about to permanently discard all changes. Continue? »
- **Danger** : Destructeur, changes lost
- **Effet** : HEAD, index, working tree tous réinitialisés

#### 2.2.5 Revert

- **Label** : "Revert"
- **Commande** : `git revert <shortHash>`
- **Confirmation** : Aucune (ou optional : nom de l'auteur du commit à reverter)
- **État désactivé** : Si c'est la racine (premier commit sans parent)
- **Effet** : Nouveau commit créé (copie inversée), graphe s'étend

#### 2.2.6 Cherry-pick

- **Label** : "Cherry-pick"
- **Commande** : `git cherry-pick <shortHash>`
- **Confirmation** : Aucune (ou optional : afficher le message du commit à picker)
- **État désactivé** : Jamais
- **Effet** : Nouveau commit créé sur HEAD, graphe s'étend

#### 2.2.7 Tag

- **Label** : "Tag"
- **Commande** : Afficher une **modale de dialogue** pour saisir le nom du tag
- **Modale** :
  ```
  Tag this commit:
  ┌────────────────────┐
  │ v1.0               │ (input text)
  └────────────────────┘
  [Create]  [Cancel]
  ```
- **Validation** : Nom de tag valide (voir `isValidTagName` en `repository.ts`)
- **Commande finale** : `git tag v1.0 <shortHash>`
- **Effet** : Tag créé, apparaît sur le commit dans le graphe

#### 2.2.8 Copy hash

- **Label** : "Copy hash"
- **Commande** : Copier le hash complet (40 chars) dans le clipboard via `navigator.clipboard.writeText(hash)`
- **Confirmation** : Aucune
- **Feedback** : Optionnel — message de confirmation "Copied to clipboard" (tooltip 1s)
- **Effet** : Pas d'effet sur l'état du repo

### 2.3 Menu contextuel : style et UX

**Positionnement** :
- Apparaître à la position du clic droit (souris).
- Ne pas dépasser les bords du viewport (repositionner si nécessaire).

**Fermeture** :
- Clic sur une action → exécute + ferme le menu.
- Clic ailleurs (Escape ou click outside) → ferme le menu sans rien faire.

**Styling** :
- Fond sombre (#333 ou rgba), texte blanc.
- Icônes avant les labels (optionnel).
- Actions **danger** (reset --hard) : fond rouge/orange.
- Séparateur visuel (ligne horizontale) avant "Copy hash".

```css
.context-menu {
  position: fixed;
  background: #2b2b2b;
  color: #fff;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  min-width: 200px;
}

.context-menu-item {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}

.context-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.context-menu-item.danger {
  color: #ff6b6b;
}

.context-menu-separator {
  height: 1px;
  background: rgba(255, 255, 255, 0.2);
  margin: 4px 0;
}
```

## 3. Implémentation Vue

### 3.1 State du menu contextuel

```typescript
// GraphView.vue
import { ref } from 'vue';

const contextMenu = ref<{
  show: boolean;
  x: number;
  y: number;
  targetHash: string;
} | null>(null);

function openContextMenu(e: MouseEvent, hash: string) {
  e.preventDefault();  // Empêcher le menu natif du navigateur

  contextMenu.value = {
    show: true,
    x: e.clientX,
    y: e.clientY,
    targetHash: hash,
  };
}

function closeContextMenu() {
  contextMenu.value = null;
}

function handleContextMenuAction(action: string, hash: string) {
  switch (action) {
    case 'checkout':
      store.execute(`checkout ${hash.slice(0, 7)}`);
      break;
    case 'reset-soft':
      if (confirm('Reset --soft to this commit?')) {
        store.execute(`reset --soft ${hash.slice(0, 7)}`);
      }
      break;
    case 'reset-mixed':
      if (confirm('Reset --mixed to this commit? Index will be reset.')) {
        store.execute(`reset --mixed ${hash.slice(0, 7)}`);
      }
      break;
    case 'reset-hard':
      if (
        confirm(
          'DANGER: Reset --hard will permanently discard all changes. Continue?',
        )
      ) {
        store.execute(`reset --hard ${hash.slice(0, 7)}`);
      }
      break;
    case 'revert':
      store.execute(`revert ${hash.slice(0, 7)}`);
      break;
    case 'cherry-pick':
      store.execute(`cherry-pick ${hash.slice(0, 7)}`);
      break;
    case 'tag':
      openTagDialog(hash);
      break;
    case 'copy-hash':
      navigator.clipboard.writeText(hash);
      // Optionnel : toast "Copied!"
      break;
  }

  closeContextMenu();
}

function openTagDialog(hash: string) {
  const tagName = prompt('Tag name:');
  if (tagName && tagName.trim()) {
    store.execute(`tag ${tagName} ${hash.slice(0, 7)}`);
  }
}
```

### 3.2 Template du menu

```vue
<template>
  <!-- ... (GraphView main) ... -->

  <!-- Context menu -->
  <div
    v-if="contextMenu?.show"
    class="context-menu"
    :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    @click.stop  <!-- Empêcher la fermeture au clic sur le menu -->
  >
    <div
      v-if="!isHeadCommit(contextMenu.targetHash)"
      class="context-menu-item"
      @click="handleContextMenuAction('checkout', contextMenu.targetHash)"
    >
      Checkout (detached)
    </div>

    <div
      class="context-menu-item"
      @click="handleContextMenuAction('reset-soft', contextMenu.targetHash)"
    >
      Reset --soft
    </div>

    <div
      class="context-menu-item"
      @click="handleContextMenuAction('reset-mixed', contextMenu.targetHash)"
    >
      Reset --mixed
    </div>

    <div
      class="context-menu-item danger"
      @click="handleContextMenuAction('reset-hard', contextMenu.targetHash)"
    >
      Reset --hard
    </div>

    <div
      v-if="!isRootCommit(contextMenu.targetHash)"
      class="context-menu-item"
      @click="handleContextMenuAction('revert', contextMenu.targetHash)"
    >
      Revert
    </div>

    <div
      class="context-menu-item"
      @click="handleContextMenuAction('cherry-pick', contextMenu.targetHash)"
    >
      Cherry-pick
    </div>

    <div
      class="context-menu-item"
      @click="handleContextMenuAction('tag', contextMenu.targetHash)"
    >
      Tag...
    </div>

    <div class="context-menu-separator"></div>

    <div
      class="context-menu-item"
      @click="handleContextMenuAction('copy-hash', contextMenu.targetHash)"
    >
      Copy hash
    </div>
  </div>

  <!-- Fermer le menu au clic outside -->
  <div v-if="contextMenu?.show" class="context-menu-overlay" @click="closeContextMenu()" />
</template>

<style scoped>
.context-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;  /* Sous le menu, au-dessus du reste */
}

.context-menu {
  position: fixed;
  /* voir ci-dessus */
}
</style>
```

### 3.3 Helpers

```typescript
function isHeadCommit(hash: string): boolean {
  return snapshot.value.head.type === 'detached'
    ? snapshot.value.head.hash === hash
    : snapshot.value.branches.find((b) => b === 'HEAD')?.hash === hash;
}

function isRootCommit(hash: string): boolean {
  const commit = snapshot.value.commits.find((c) => c.hash === hash);
  return commit?.parents.length === 0;
}
```

## 4. Actions sur la sidebar

### 4.1 Clic sur une branche

**Implémentation dans RefsSidebar.vue** :

```vue
<template>
  <!-- Branches section -->
  <section class="section-branches">
    <h2>Branches</h2>
    <ul class="branch-list">
      <li
        v-for="branch in snapshot.branches"
        :key="branch"
        class="branch-item"
        :class="{ current: isHeadOnBranch(branch) }"
        @click="checkoutBranch(branch)"
      >
        <span class="branch-indicator">
          {{ isHeadOnBranch(branch) ? '[*]' : '[ ]' }}
        </span>
        <span class="branch-name">{{ branch }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
function checkoutBranch(branchName: string) {
  if (isHeadOnBranch(branchName)) {
    return;  // Already on this branch
  }
  store.execute(`checkout ${branchName}`);
}

function isHeadOnBranch(branchName: string): boolean {
  if (!snapshot.value.head.symbolic) return false;
  return snapshot.value.head.target === `refs/heads/${branchName}`;
}
</script>

<style scoped>
.branch-item {
  cursor: pointer;
  transition: background 0.15s;
}

.branch-item:not(.current):hover {
  background: rgba(0, 0, 0, 0.05);
}

.branch-item.current {
  font-weight: bold;
  background: rgba(0, 102, 204, 0.1);
}

.branch-item.current:hover {
  cursor: default;
}
</style>
```

### 4.2 Clic sur un tag

**Implémentation dans RefsSidebar.vue** :

```vue
<template>
  <!-- Tags section -->
  <section class="section-tags" v-if="tagsArray.length > 0">
    <h2>Tags</h2>
    <ul class="tags-list">
      <li
        v-for="tag in tagsArray"
        :key="tag"
        class="tag-item"
        @click="checkoutTag(tag)"
      >
        <span class="tag-name">{{ tag }}</span>
        <span class="tag-hash">{{ getTagHash(tag) }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
function checkoutTag(tagName: string) {
  const tagHash = snapshot.value.tags?.[tagName];
  if (!tagHash) return;

  // Checkout to the hash the tag points to (detached)
  store.execute(`checkout ${tagHash.slice(0, 7)}`);
}

const tagsArray = computed(() =>
  snapshot.value.tags ? Object.keys(snapshot.value.tags) : [],
);
</script>

<style scoped>
.tag-item {
  cursor: pointer;
  transition: background 0.15s;
  padding: 4px 0;
}

.tag-item:hover {
  background: rgba(0, 0, 0, 0.05);
}
</style>
```

## 5. États désactivés et protection

### 5.1 Confirmations

**Actions avec confirmation** :
- `reset --soft` : Warning dialogue
- `reset --mixed` : Warning dialogue
- `reset --hard` : **Mandatory confirmation**, message grave
- `revert` : Optionnel (show commit message ?)

**Actions sans confirmation** :
- `checkout <ref>` : safe
- `cherry-pick` : safe (peut créer conflict, mais géré par le moteur)
- `tag` : safe
- `copy hash` : safe

### 5.2 Actions désactivées

**Checkout (detached)** :
- Désactivé si HEAD pointe déjà ce commit → disabled visual + no-pointer

**Revert** :
- Désactivé si c'est la racine (pas de parent) → disabled + tooltip "Cannot revert root commit"

**Branch checkout** :
- Désactivé si déjà sur cette branche → visual (bold, grayed) + cursor:default

## 6. Intégration avec l'animation (spec 52)

Quand une action est exécutée (ex. `reset --hard`), le snapshot change → layout change → animation déclenche (spec 52). **Pas de coordination spéciale** : l'animation observe le changement de snapshot automatiquement.

## 7. Critères d'acceptation

### CA-clickable-01 : Clic sur branche dans sidebar

- [ ] User clique sur "feature" dans RefsSidebar.
- [ ] `git checkout feature` exécuté.
- [ ] HEAD se déplace, graphe se met à jour.
- [ ] Branche "feature" devient `[*]`.

### CA-clickable-02 : Clic désactivé sur branche courante

- [ ] User sur "main", clique sur "main".
- [ ] Aucune commande exécutée.
- [ ] Visual feedback : item grisé / curseur default.

### CA-clickable-03 : Clic sur tag dans sidebar

- [ ] User clique sur "v1.0" dans RefsSidebar.
- [ ] `git checkout <hash>` exécuté (vers le commit du tag).
- [ ] HEAD détaché sur ce commit.

### CA-clickable-04 : Menu contextuel sur nœud (clic droit)

- [ ] User clic droit sur un commit.
- [ ] Menu contextuel s'affiche aux coordonnées du clic.
- [ ] Menu disparaît au clic outside ou Escape.

### CA-clickable-05 : Checkout (détaché) depuis menu

- [ ] User sélectionne "Checkout (detached)" sur un commit.
- [ ] `git checkout <shortHash>` exécuté.
- [ ] HEAD détaché, graphe se met à jour.

### CA-clickable-06 : Checkout désactivé si HEAD déjà là

- [ ] HEAD pointe un commit.
- [ ] Clic droit sur ce commit → "Checkout" absent du menu ou grisé.

### CA-clickable-07 : Reset --soft avec confirmation

- [ ] User sélectionne "Reset --soft".
- [ ] Dialogue de confirmation s'affiche.
- [ ] User confirme → `git reset --soft <hash>` exécuté.
- [ ] HEAD se repositionne, commits "oubliés" disparaissent.

### CA-clickable-08 : Reset --hard avec confirmation stricte

- [ ] User sélectionne "Reset --hard".
- [ ] Dialogue grave s'affiche : « DANGER... »
- [ ] User décline → aucune exécution.
- [ ] User confirme → `git reset --hard <hash>` exécuté.

### CA-clickable-09 : Revert depuis menu

- [ ] User sélectionne "Revert" sur un commit.
- [ ] `git revert <shortHash>` exécuté.
- [ ] Nouveau commit créé, graphe s'étend.

### CA-clickable-10 : Revert désactivé sur racine

- [ ] Commit est la racine (pas de parent).
- [ ] Clic droit → "Revert" absent ou grisé.

### CA-clickable-11 : Cherry-pick depuis menu

- [ ] User sélectionne "Cherry-pick".
- [ ] `git cherry-pick <shortHash>` exécuté.
- [ ] Nouveau commit créé sur HEAD.

### CA-clickable-12 : Tag depuis menu (modale)

- [ ] User sélectionne "Tag...".
- [ ] Modale de saisie du nom de tag s'affiche.
- [ ] User tape "v1.0" et clique [Create].
- [ ] `git tag v1.0 <hash>` exécuté.
- [ ] Tag apparaît sur le commit dans le graphe.

### CA-clickable-13 : Copy hash

- [ ] User sélectionne "Copy hash".
- [ ] Hash complet (40 chars) copié en clipboard.
- [ ] `navigator.clipboard.writeText()` appelé.
- [ ] Optionnel : toast "Copied!" (1s).

### CA-clickable-14 : Menu styling

- [ ] Menu a fond sombre, texte blanc.
- [ ] Actions danger (reset --hard) : couleur rouge/orange.
- [ ] Separateur visuel avant "Copy hash".
- [ ] Icônes optionnelles présentes.

### CA-clickable-15 : Pas d'exception UI

- [ ] Toutes les actions passent par `store.execute()`.
- [ ] Erreurs git retournées dans `CommandResult.errors`.
- [ ] UI ne throws pas (erreurs loggées ou affichées).

### CA-clickable-16 : Clic outside ferme menu

- [ ] Menu affiché.
- [ ] User clique sur le graphe (hors menu).
- [ ] Menu disparaît.

### CA-clickable-17 : Escape ferme menu

- [ ] Menu affiché.
- [ ] User presse Escape.
- [ ] Menu disparaît.

### CA-clickable-18 : Intégration avec animations (spec 52)

- [ ] User exécute `reset --hard` via menu.
- [ ] Graphe anime la disparition des commits (spec 52).
- [ ] Animation fluide, pas de saccade.

---

## Notes pour implémentation

1. **Menu contextuel** : utiliser `@contextmenu` (Vue) ou `addEventListener('contextmenu')` JS.
2. **Confirmations** : `window.confirm()` simple ou composant modale custom.
3. **Clipboard** : `navigator.clipboard.writeText()` async (modernes navigateurs).
4. **Hash court** : 7 chars (convention du projet).
5. **Aucune logique git** : tout passe par `store.execute(cmd)`.
6. **Fermeture menu** : utiliser un overlay transparent + event delegation.

## Dépendances inter-specs

- **Spec 17 (render)** : graphe SVG, nœuds cliquables.
- **Spec 33 (sidebar)** : branches/tags cliquables.
- **Spec 52 (animations)** : animations déclenche automatiquement après actions.
- **Spec 05 (log)** : pas d'impact.
- **Spec 54 (log --graph)** : pas d'impact.
