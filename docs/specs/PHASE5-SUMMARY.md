# Phase 5 : Résumé des décisions structurantes

## Vue d'ensemble

La Phase 5 implémente trois fonctionnalités majeures (rebase interactif, stash, reflog) et traite la dette technique Phase 4 (déduplification de la logique de replay). Cette synthèse document les décisions architecturales clés qui impactent l'orchestration et l'intégration entre le moteur (core) et l'UI.

## 1. Refactorisation de la logique de replay (dette Phase 4)

### Problème
En Phase 4, `cmdRebase` et `rebaseContinue` contiennent ~80 lignes de code dupliquées pour :
- Calculer le diff d'un commit
- Appliquer le diff sur un nouvel arbre
- Détecter les conflits
- Créer le commit ou laisser les marqueurs

Cette duplication existe aussi dans cherry-pick et revert (réimplémentations inline).

### Solution Phase 5
**Extraire un helper centralisé `replayCommit(repo, options)`** utilisable par rebase, rebase -i, cherry-pick, revert.

**Signature** :
```typescript
export function replayCommit(
  repo: Repository,
  { origCommit, origHash, newParentHash, label }: ReplayCommitOptions
): ReplayCommitResult {
  // Retourne : { newHash, conflicts, resumeState }
}
```

**Contrat** :
- Entrée : le commit original, son nouveau parent, un label pour les marqueurs
- Sortie : le hash du commit créé (ou null si conflit)
- Effet de bord : mise à jour de `repo.index` et `repo.workingTree` (avec marqueurs si conflit)

**Cas sans conflit** :
- Crée et retourne le nouveau commit (hash)
- Met à jour index/WT

**Cas avec conflit** :
- Retourne `null` pour newHash
- Retourne les fichiers en conflit
- Retourne `resumeState` (message + parent) pour continuer après résolution
- Met à jour index/WT avec marqueurs

### Variante : `replayCommitContinue`
Après résolution manuelle (utilisateur a édité les fichiers et exécuté `git add`), créer le commit avec l'index courant :

```typescript
export function replayCommitContinue(
  repo: Repository,
  { commitMessage, newParentHash }
): string {
  // Retourne le hash du commit créé
}
```

### Impact
- Réduction ~80 lignes de duplication dans rebase.ts
- Fondation solide pour rebase interactif (boucle sur `replayCommit`)
- Testabilité : `replayCommit` est testable en isolation

**Fichiers impactés** :
- `src/core/repository.ts` : ajouter `replayCommit`, `replayCommitContinue`
- `src/core/commands/rebase.ts` : refactoriser pour utiliser `replayCommit`

## 2. Rebase interactif : mécanisme d'édition de la todo dans un terminal web

### Défi unique
Git utilise `$EDITOR` pour éditer la todo list (vim, nano, etc.). Le terminal web n'a pas d'éditeur externe.

### Solution : Modale interactive Vue

**Flux utilisateur** :

1. **Initiation** : `git rebase -i <base>`
   - Moteur génère la todo list (tous les commits à rejouer avec action `pick` par défaut)
   - Retourne l'état sans exécuter : `snapshot.operationState.type = 'rebasing'`, `snapshot.rebasing.interactive = { awaitingTodoEdit: true, todoList }`
   - Code de sortie : 0 (pas une erreur, juste "en attente")

2. **Affichage UI** : Détecte `snapshot.rebasing.interactive.awaitingTodoEdit`
   - Affiche `InteractiveRebaseModal.vue` (nouvelle composante)
   - Modale expose la todo list : chaque commit avec :
     - **Action** : dropdown (`pick`, `reword`, `squash`, `fixup`, `drop`)
     - **Message** : éditable inline (pour `reword`)
     - **Ordre** : réordonnable (drag-drop ou up/down buttons ; optionnel)

3. **Édition par l'utilisateur** :
   - Change actions
   - Édite messages (pour commits avec action `reword`)
   - Réordonne les lignes

4. **Validation** : Bouton "Start rebase"
   - Envoie la todo list éditée via **nouvelle action** : `executeRebaseInteractive(todoList)`
   - Moteur valide la todo list
   - Lance l'exécution : rejoue les commits selon les actions

5. **Exécution** :
   - Itère sur chaque TodoItem, appelle `replayCommit`
   - Si conflit : arrête, expose `currentIndex` du commit en conflit
   - Suivre Phase 4 : `--continue` / `--abort` pour conflits

### Modèle de données

**Repository.rebasing** (extension) :
```typescript
rebasing?: {
  base: string;
  toReplay: string[];
  replayed: string[];
  // ... champs Phase 4 ...
  interactive?: {
    awaitingTodoEdit: boolean;
    todoList: TodoItem[];
    currentIndex: number; // index du commit en cours (ou -1 en attente)
  };
};
```

**TodoItem** :
```typescript
{
  action: 'pick' | 'reword' | 'squash' | 'fixup' | 'drop' | 'edit';
  commitHash: string;
  message: string; // éditable pour reword
}
```

**RepoSnapshot** expose `operationState.interactive` pour l'UI.

### Interface moteur ↔ UI

**Nouvelle action du store** (`stores/repo.ts`) :
```typescript
function executeRebaseInteractive(todoList: TodoItem[]): CommandResult {
  return this.engine.executeRebaseInteractive(this.repo, todoList);
}
```

**Nouvelle fonction core** (`src/core/commands/rebase.ts`) :
```typescript
export function executeRebaseInteractive(
  repo: Repository,
  todoList: TodoItem[]
): CommandResult {
  // Valide, exécute, gère conflits
}
```

### Squash/fixup : traitement spécial
Quand action[i] est `squash` ou `fixup` :
- Rejouer le commit courant applique ses changements **sur le commit précédent** (pas créer de commit)
- Fusionner les messages (squash) ou jeter le message (fixup)
- Créer un commit fusionné avec parent = parent du commit précédent

Résultat : deux commits (original + suivant) deviennent un.

### Conflits lors du rebase interactif
Identiques à Phase 4 : marqueurs simples, état `rebasing.interactive.currentIndex` pointe le commit en conflit, `--continue` / `--abort` pour gestion.

### Decision : reword sans pause supplémentaire
Message éditable dans la modale **avant** exécution. Pas de pause supplémentaire après rejoue (plus simple que Git qui demande `git rebase --continue` pour reword).

### Décision : edit action optionnel
Non implémenté Phase 5 (demande une pause et une modale d'amend). Phase 6+.

**Fichiers impactés** :
- `src/core/model.ts` : ajouter `TodoItem`, étendre `RebasingState`
- `src/core/commands/rebase.ts` : implémenter `executeRebaseInteractive`, `rebaseInteractiveContinue`
- `src/stores/repo.ts` : ajouter action `executeRebaseInteractive`
- `src/components/InteractiveRebaseModal.vue` : **nouveau composant**

## 3. Modèle de données stash et pile stash

### Pile LIFO
`git stash` utilise une pile (stack) LIFO : chaque stash est un snapshot du repo (index + workingTree) à un moment.

**Indexation** : `stash@{0}` = plus récent, `stash@{1}` = 2e plus récent, etc.

### StashEntry
```typescript
{
  branchName: string | null; // branche d'où le stash vient
  message: string; // message optionnel (`git stash -m "..."`)
  date: number;
  workingTree: WorkingTree; // snapshot complet
  index: Index; // snapshot complet
  headHash: string; // hash HEAD au moment du stash
}
```

### Opérations
- **`git stash` / `push`** : crée une entrée, vide index/WT
- **`git stash list`** : affiche `stash@{0}: WIP on main: ...`
- **`git stash pop` / `apply`** : restaure index/WT depuis l'entrée
- **`git stash drop`** : supprime une entrée, ré-indexe les autres

### Conflits lors de pop/apply
Détection simple : si current WT et stashWT différentes depuis HEAD, conflit possible. Écrire marqueurs. Conserver le stash (retry après résolution).

### Décisions de design
- **Untracked files** : sauvegardés dans le stash (dans `workingTree`)
- **Conflits + pop** : stash conservé (retry après édition)
- **Interaction avec reflog** : stash ops trackées si reflog implémenté

**Fichiers impactés** :
- `src/core/model.ts` : ajouter `StashEntry`, étendre `Repository`
- `src/core/commands/stash.ts` : **nouveau fichier**

## 4. Reflog : journal des mouvements de HEAD et des refs

### Entrée du reflog
```typescript
{
  oldHash: string;
  newHash: string;
  action: string; // "commit", "checkout", "reset", "merge", "rebase", ...
  description: string;
  timestamp: number;
}
```

### Reflog par ref
- **HEAD reflog** : chaque mouvement de HEAD
- **Branch reflog** (par branche) : chaque mise à jour de la branche
- **Tag reflog** (optionnel)

### Révisions HEAD@{n}
**Extension de `resolveCommitish`** pour supporter `HEAD@{n}`, `<branchname>@{n}`.

Implémentation :
```typescript
const atMatch = /^(.+?)@\{(\d+)\}$/.exec(ref);
if (atMatch) {
  const base = atMatch[1]!;
  const n = parseInt(atMatch[2]!, 10);
  const refName = base === 'HEAD' ? 'HEAD' : `refs/heads/${base}`;
  const entries = repo.reflog?.[refName] ?? [];
  return entries[n]?.newHash ?? null;
}
```

### Quand ajouter une entrée
Après chaque opération qui change HEAD ou une ref :
- `commit` : dans `createCommit` / `createCommitWithParents`
- `checkout` : dans `cmdCheckout`
- `reset` : dans `cmdReset`
- `merge` : dans `cmdMerge`
- `rebase` : dans `cmdRebase` (une seule entrée au succès)
- `cherry-pick` : dans `cmdCherryPick`
- `revert` : dans `cmdRevert`
- (optionnel) `tag` : dans `cmdTag`

### Affichage
```
abc1234 HEAD@{0}: commit: Message
def5678 HEAD@{1}: checkout: switched to branch main
9ab0123 HEAD@{2}: reset: hard main
```

### Impact sur commits orphelins
Rebase/reset créent des commits orphelins (inaccessibles depuis HEAD). Reflog conserve ces commits accessibles via `HEAD@{n}` → **undo possible**.

Exemple : après `git reset --hard HEAD~1`, l'ancien HEAD est accessible via `HEAD@{1}`, `git reset --hard HEAD@{1}` le restaure.

### Décisions de design
- **Durée de vie** : pas de cleanup en Phase 5 (pas de limite de jours)
- **Reflog list** : optionnel Phase 5 (simple `git reflog show` suffit)
- **Entrées par op** : une seule entrée au succès (pas d'intermédiaires pour rebase multi-step)

**Fichiers impactés** :
- `src/core/model.ts` : ajouter `ReflogEntry`, étendre `Repository`
- `src/core/repository.ts` : ajouter `addReflogEntry`, helpers
- `src/core/commands/reflog.ts` : **nouveau fichier**
- **Tous les commands** : appel à `addReflogEntry` après changement de HEAD/ref

## 5. Impact du snapshot sur l'UI

### Nouvel état exposé
```typescript
snapshot.operationState?: {
  type: 'rebasing';
  interactive?: {
    awaitingTodoEdit: boolean;
    todoList: TodoItem[];
    currentIndex: number;
  };
};

snapshot.stashCount?: number; // optionnel : count ou full list
snapshot.reflogHeadRecent?: Array<...>; // optionnel : top N entries pour debug
```

### UI comportement
- **`awaitingTodoEdit === true`** : afficher `InteractiveRebaseModal.vue`
- **Stash** : afficher bouton/menu pour `git stash`
- **Reflog** : afficher historique HEAD en tooltip ou side panel (optionnel)

## 6. Ordre d'implémentation recommandé

1. **Phase 5a** : Refactorisation replay (24-replay-refactor.md)
   - Extraire `replayCommit`, `replayCommitContinue`
   - Refactoriser `rebase.ts` pour utiliser (pas de changement de comportement)
   - Tests Phase 4 doivent rester verts (régression check)

2. **Phase 5b** : Stash (26-stash.md)
   - Indépendant, peut être parallèle à 5a
   - Modèle simple (pile LIFO)
   - Pas d'interaction avec reflog en Phase 5

3. **Phase 5c** : Reflog (27-reflog.md)
   - Dépend partiellement de 5a (appels à `addReflogEntry` partout)
   - Tous les commands doivent tracker les changements
   - Peut être parallèle à 5b

4. **Phase 5d** : Rebase interactif (25-rebase-interactive.md)
   - Dépend entièrement de `replayCommit` (5a)
   - Dépend du snapshot exposant `operationState.interactive` (modèle 5a+)
   - UI : nouvelle modale (5d exclusive)

**Critères de go-no-go** :
- `npm run build` vert (strict typecheck)
- `npm test` vert (tous les tests)
- Pas de régression Phase 4

## 7. Vocabulaire et conventions

### Termes clés
- **Todo list** : liste d'instructions pour rebase interactif (action + commit + message)
- **Replay** : rejouer un commit sur un nouveau parent (changement de parent, nouveau hash)
- **Squash** : fusionner deux commits (changement du nombre total de commits)
- **Stash entry** : snapshot du repo (index + workingTree) à un moment
- **Reflog entry** : enregistrement d'un mouvement de HEAD ou ref

### Marqueurs de conflit (uniformes)
Tous les conflits utilisent le même format :
```
<<<<<<< HEAD
<ours>
=======
<theirs>
>>>>>>> <label>
```

Label pour chaque contexte :
- Rebase : shortHash du commit original
- Merge : branchName
- Cherry-pick : shortHash du commit cherry-pické
- Stash pop : "stash"

### Indices zéro-based
- `HEAD@{0}` = plus récent (ou juste créé/changé)
- `stash@{0}` = plus récent
- `TodoItem` dans `todoList` : index 0+ pour l'ordre de jouée

## 8. Points critiques à documenter dans CLAUDE.md après Phase 5

1. **`replayCommit` contrat figé** : toutes les futures opérations de replay doivent l'utiliser
2. **Snapshot.operationState.interactive** : UI doit le décider pour afficher modale rebase
3. **Reflog ajouts systématiques** : chaque command changeant HEAD doit appeler `addReflogEntry`
4. **Stash pile immuable** : opérations doivent préserver la LIFO order et ré-indexer

## Fichiers impactés (synthèse)

### Nouveau (Phase 5 exclusif)
- `src/core/commands/rebase.ts` : refactoriser + `executeRebaseInteractive`
- `src/core/commands/stash.ts` : tout neuf
- `src/core/commands/reflog.ts` : tout neuf
- `src/components/InteractiveRebaseModal.vue` : tout neuf

### Modifié
- `src/core/model.ts` : ajouter `TodoItem`, `StashEntry`, `ReflogEntry`
- `src/core/repository.ts` : ajouter `replayCommit`, `replayCommitContinue`, helpers reflog
- `src/core/engine.ts` : route nouvelles commandes
- `src/stores/repo.ts` : ajouter action `executeRebaseInteractive`
- Tous les `src/core/commands/*.ts` : appel à `addReflogEntry` (commit, checkout, reset, merge, rebase, cherry-pick, revert)

### Tests
- `tests/replay.test.ts` : tests `replayCommit`, `replayCommitContinue`
- `tests/rebaseInteractive.test.ts` : tests 25-rebase-interactive.md
- `tests/stash.test.ts` : tests 26-stash.md
- `tests/reflog.test.ts` : tests 27-reflog.md
- Phase 4 tests : doivent rester verts (régression)

## Clarifications supplémentaires pour l'orchestrateur

1. **Phase 5 ne traite pas** : `-p` (preserve merges), `--autosquash`, `--patch`, `--keep-index`, tags reflog, limit d'entrées reflog
2. **Phase 5 ne change pas** : le layout du graphe, le rendering, les commandes Phase 1-4
3. **Phase 5 ajoute** : 3 nouvelles commandes + 1 modale UI + 2 helpers critiques + reflog tracking partout

## Validation avant phase 6

**Checklist orchestrateur** :
- [ ] Tous les specs 24-27 lus et compris
- [ ] `replayCommit` contrat clair pour les implémenteurs
- [ ] Modale rebase interactive UI design validé
- [ ] Reflog tracking plan complet (tous les commands à modifier)
- [ ] Régression Phase 4 plan (tests existing qui doivent passer)
- [ ] Équipes (dev core, dev UI, tests, QA) alignées
