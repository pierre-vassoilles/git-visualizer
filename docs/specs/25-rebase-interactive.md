# Phase 5 : git rebase -i (rebase interactif)

## Résumé

Le rebase interactif `git rebase -i <base>` permet à l'utilisateur de **contrôler l'ordre et l'action** de chaque commit en cours de rebase. Contrairement au rebase non-interactif (Phase 4), l'utilisateur édite une "todo list" pour spécifier comment traiter chaque commit : `pick` (rejouer), `reword` (changer le message), `squash` (fusionner), `drop` (supprimer), etc.

**Défi unique à un terminal web** : pas d'éditeur externe (`$EDITOR`). Solution : l'UI expose une **modale interactive** (`InteractiveRebaseModal.vue`) où l'utilisateur édite la todo list de manière visuelle (drag-drop, boutons d'action, édition inline de messages). Le moteur expose l'état "todo" via le snapshot.

**Variantes** :
- `git rebase -i <base>` : lance le rebase interactif
- Actions supportées : `pick`, `reword`, `edit` (optionnel), `squash`, `fixup`, `drop`, réordonnancement
- `--continue` / `--abort` : gestion des conflits (réutilise Phase 4)

## Syntaxe

```
git rebase -i <base>
```

### Options supportées en Phase 5

| Option | Argument | Comportement | Notes |
|--------|----------|-------------|-------|
| `-i`, `--interactive` | `<base>` | Lance le rebase interactif | Action requise utilisateur |

**Remarque** : `-p` (preserve merges), `--autosquash`, `-x` (exec), `--root`, etc. ne sont pas implémentés Phase 5.

## Concepts fondamentaux

### Todo list

La "todo list" est une liste d'instructions pour traiter les commits à rejouer. Format texte Git standard :

```
pick abc1234 Commit message 1
pick def5678 Commit message 2
squash 9ab0123 Commit message 3
drop cde4567 Commit message 4
reword 5fgh789 Commit message 5
```

**Champs** :
- **Action** : `pick`, `reword`, `squash`, `fixup`, `drop`, `edit` (optionnel Phase 5)
- **Hash court** (7 chars) : identification du commit
- **Message** : message du commit original

**Ordre** : Du plus ancien au plus récent (comme `git log` en sens inverse). La todo list commence par la première action à exécuter.

### Actions supportées

| Action | Shortcut | Effet | Résultat |
|--------|----------|--------|----------|
| `pick` | `p` | Rejouer le commit normalement | Nouveau commit avec le même message et changements |
| `reword` | `r` | Rejouer le commit et permettre l'édition du message | Nouveau commit avec message modifié |
| `squash` | `s` | Fusionner dans le précédent et combiner les messages | Un commit avec la combinaison des deux messages |
| `fixup` | `f` | Comme squash mais jette le message du commit courant | Un commit sans le message du commit jeté |
| `drop` | `d` | Supprimer le commit | Aucun commit créé |
| `edit` | `e` | S'arrêter après rejouer pour amender le commit (optionnel Phase 5) | État "rebasing" qui demande `rebase --continue` |

### Sémantique de `squash` et `fixup`

**Squash** fusionne le commit courant avec le commit précédent **après rejoue** :

```
Avant (originals) :
  C1 (message: "First")
  C2 (message: "Second")
  C3 (message: "Third")

Todo list :
  pick C1
  squash C2
  pick C3

Exécution :
  1. Rejouer C1 → C1' (nouveau commit)
  2. Rejouer C2 :
     - Changementsappliqués sur C1'
     - Créer un commit qui fusionne C1'+C2 → C1_squashed
     - Message combiné : "First\n\nSecond" (ou "First" uniquement si fixup)
     - C1_squashed.parent = C1'.parent
     - C1_squashed remplace C1' dans la chaîne
  3. Rejouer C3 → C3' (parent: C1_squashed)

Résultat final :
  C1_squashed (First + Second combinés)
  C3'
```

**Squash du premier commit** : Si le premier commit de la todo est squashé, on l'échoue (impossible de fusionner avec "rien avant"). Message d'erreur : "fatal: cannot squash the first commit".

### Réordonnancement

La todo list peut être réordonnée : simplement changer l'ordre des lignes change l'ordre de jouée.

```
Todo list (réordonnée) :
  pick def5678
  pick abc1234
  pick 9ab0123
```

Résultat : def5678 est rejoué en premier, puis abc1234, puis 9ab0123. L'ordre topologique du résultat final suit l'ordre de la todo (les ancêtres deviennent les commits spécifiés en premier).

### Édition interactive dans le terminal web

**Problème** : Git utilise `$EDITOR` (vim, nano, etc). Pas applicable dans le terminal web.

**Solution Phase 5** :

1. **Flux utilisateur** :
   - Utilisateur tape `git rebase -i <base>`
   - Moteur détecte `-i` et génère la todo list
   - Moteur retourne un **snapshot avec état spécial** `rebasing.interactive = true` et expose `rebasing.todoList`
   - **UI** (Vue) affiche une **modale `InteractiveRebaseModal.vue`** avec :
     - Liste des commits avec actions (dropdown ou boutons)
     - Messages éditables inline
     - Drag-drop pour réordonner (optionnel ; aussi possible via contrôle d'ordre)
     - Bouton "Commencer le rebase" → envoie la todo éditée
   - Utilisateur valide → `store.executeRebaseInteractive(todoList)` (nouvelle action)
   - Moteur traite la todo et lance la jouée (comme `rebase --continue`)
   - Conflits gérés comme Phase 4 (marqueurs, `--continue`/`--abort`)

2. **Modèle de données** (dans `Repository.rebasing`) :
   ```typescript
   export interface RebasingState {
     // ... champs existants (base, toReplay, replayed, ...)
     interactive?: {
       /** true si en mode interactif (en attente d'édition de la todo) */
       awaitingTodoEdit: boolean;
       /** Todo list (avant édition ou en cours d'exécution) */
       todoList: TodoItem[];
       /** Index du commit en cours de traitement */
       currentIndex: number;
     };
   }

   export interface TodoItem {
     /** Action : pick, reword, squash, fixup, drop */
     action: 'pick' | 'reword' | 'squash' | 'fixup' | 'drop' | 'edit';
     /** Hash du commit original */
     commitHash: string;
     /** Message du commit original (éditable en cas de reword) */
     message: string;
   }
   ```

3. **Interface moteur ↔ UI** :
   - `snapshot.operationState.type === 'rebasing'` + `snapshot.rebasing?.interactive?.awaitingTodoEdit === true` → afficher modale
   - Modale expose la todo liste depuis le snapshot, permet édition
   - Utilisateur clique "Start" → envoie la todo éditée via **nouvelle commande interne** :
     ```typescript
     export function executeRebaseInteractive(
       repo: Repository,
       todoList: TodoItem[]
     ): CommandResult
     ```
     (Ou expose comme sous-commande : `git rebase --start-interactive <json_of_todo>` ; voir notes d'implémentation)
   - Moteur valide la todo, lance la jouée
   - Si conflit : `snapshot.rebasing.interactive.currentIndex` pointe le commit en conflit
   - Utilisateur résout et `git rebase --continue` (comme Phase 4)

## Comportement nominal

### Cas 1 : Initiation du rebase interactif

**Condition** : `git rebase -i <base>`

**Processus** :
1. Résoudre `<base>` en hash
2. Identifier les commits à rejouer (comme Phase 4 : `getCommitsToReplay`)
3. Créer la todo list initiale : chaque commit a action `pick` par défaut
4. Mettre le dépôt en état `rebasing.interactive = { awaitingTodoEdit: true, todoList, currentIndex: -1 }`
5. **Retourner à l'UI** (pas d'exécution immédiate) :
   ```
   output: ["Interactive rebase in progress; waiting for todo list edit."]
   exitCode: 0 (pas d'erreur, juste "en attente")
   snapshot.rebasing.interactive: { awaitingTodoEdit: true, todoList: [...] }
   ```

**UI** :
- Détecte `snapshot.rebasing.interactive.awaitingTodoEdit === true`
- Affiche `InteractiveRebaseModal.vue`
- Modale présente la todo list
- Utilisateur édite (actions, messages, réordonnancement)
- Utilisateur clique "Start rebase" → envoie la todo éditée

### Cas 2 : Exécution de la todo list éditée

**Condition** : Utilisateur a validé la todo list depuis la modale (appel interne à `executeRebaseInteractive(repo, todoList)`)

**Processus** :
1. Valider la todo list :
   - Chaque commit doit exister dans repo.objects
   - Actions doivent être valides
   - Si squash/fixup : le premier commit ne peut pas être squashé (erreur)
2. Déterminer les "blocages" (squash réachachne les actions) :
   - Si action[i] est `squash` ou `fixup`, le résultat du commit i-1 et i sont fusionnés
   - Construire une liste d'étapes de jouée en tenant compte des fusions
3. Exécuter la todo list commit par commit :
   - Pour `pick`, `reword`, `edit` : appeler `replayCommit` (helper Phase 5)
   - Pour `squash` / `fixup` :
     - Rejouer le commit courant
     - Fusionner avec le commit précédent (combiner les messages si squash, jeté si fixup)
     - Mettre à jour le hash du commit précédent
   - Pour `drop` : ignorer (aucun commit créé)
4. **Si conflit** lors de la jouée d'un commit :
   - Arrêter et laisser l'état `rebasing` avec `interactive.currentIndex` pointant le commit en conflit
   - Suivre la même gestion que Phase 4 (`--continue`/`--abort`)
   - Message : `CONFLICT (content): ...`
   - Code de sortie : 1
5. **Si pas de conflit** :
   - Mettre à jour la branche/HEAD vers le dernier commit
   - Décrémenter `rebasing` (rebase terminé)
   - Message : `Successfully rebased and updated <branchname>.`
   - Code de sortie : 0

### Cas 3 : Reword (édition du message)

**Condition** : Action `reword` dans la todo list

**Processus** :
1. Rejouer le commit normalement (avec `replayCommit`)
2. Après création du commit D' :
   - **Optionnel Phase 5** : s'arrêter et demander à l'utilisateur d'éditer le message (état `edit`)
   - **Plus simple Phase 5** : utiliser le message modifié dans la todo list (utilisateur l'a édité dans la modale)
3. Créer D' avec le message éditéÀ lieu du message original

**Phase 5 choisit l'option "plus simple"** : l'édition du message se fait dans la modale avant d'exécuter la todo ; pas de pauses supplémentaires en cours d'exécution.

### Cas 4 : Squash avec fusion de messages

**Condition** : Action `squash` sur C2 (C1 créé, puis C2 squashé)

**Processus** :
1. Rejouer C1 → C1'
2. Rejouer C2 : calculer les changements, les appliquer sur C1' sans créer de commit (juste mettre à jour index/WT)
3. Fusionner les messages :
   ```
   C1_squashed.message = `${C1.message}\n\n${C2.message}`
   ```
4. Créer C1_squashed avec parent = C1'.parent, tree = arbre fusionné, message combiné
5. Marquer "C1 a été squashé" : continuer avec le commit suivant en utilisant C1_squashed comme parent

### Cas 5 : Drop avec suppression

**Condition** : Action `drop` sur C2

**Processus** :
1. Ignorer C2 entièrement
2. Rejouer C3 avec parent = C1' (le commit précédent créé)

### Cas 6 : Conflit en cours de squash

**Condition** : Squash de C2 sur C1', conflit lors de l'application des changements de C2

**Processus** :
1. Arrêter
2. État `rebasing.interactive` :
   ```
   awaitingTodoEdit: false  (on exécute, pas on attend)
   currentIndex: 1          (C2 est le commit en conflit)
   ```
3. Retourner conflit message
4. Utilisateur résout et `git rebase --continue`
5. Continuer avec `rebaseInteractiveContinue` : créer le commit C1_squashed et poursuivre

### Cas 7 : Abort du rebase interactif

**Condition** : `git rebase --abort` en cours de rebase interactif

**Processus** : Identique à Phase 4 (aucun différentiel). Restaurer l'état avant rebase.

## Cas d'erreur

### Todo list vide

**Condition** : Utilisateur valide une todo list sans aucun commit (supprime tout).

**Message d'erreur** :
```
fatal: No commits found to rebase.
```

**Code de sortie** : 1

### Premier commit squashé

**Condition** : Première action est `squash` ou `fixup`

**Message d'erreur** :
```
fatal: cannot squash the first commit
```

**Code de sortie** : 1

### Action invalide

**Condition** : Action non reconnue dans la todo list (ex. `wip`)

**Message d'erreur** :
```
fatal: unknown action: 'wip'
```

**Code de sortie** : 1

### Commit introuvable

**Condition** : Todo list référence un hash qui n'existe pas

**Message d'erreur** :
```
fatal: commit <hash> not found
```

**Code de sortie** : 128

### Réordonnancement créant une boucle cyclique

**Condition** : Todo list réordonnée crée un cycle (ex. : C → D → C). Impossible en pratique car commits sont acycliques.

**Comportement** : Ne se produit pas (DAG garanti acyclique).

## Critères d'acceptation

### CA-rebasei-01 : Initiation rebase interactif

**Given**
- Repository avec C0 ← C1 (main), C0 ← D1 ← D2 (feature/HEAD)

**When**
- Exécute `git rebase -i main`

**Then**
- `exitCode === 0`
- `snapshot.operationState.type === 'rebasing'`
- `snapshot.rebasing.interactive.awaitingTodoEdit === true`
- `snapshot.rebasing.interactive.todoList` contient 2 items : D1 (pick), D2 (pick)

### CA-rebasei-02 : UI modale affichée

**Given**
- État du CA-rebasei-01

**When**
- UI détecte `snapshot.rebasing.interactive.awaitingTodoEdit`

**Then**
- `InteractiveRebaseModal.vue` est affiché
- Modale affiche les deux commits avec actions en dropdown
- Messages sont éditables inline
- Bouton "Start rebase" est visible

### CA-rebasei-03 : Simple pick (pas d'édition)

**Given**
- Rebase interactif en attente (CA-rebasei-01)
- Utilisateur clique "Start" sans modifier la todo

**When**
- Exécute `executeRebaseInteractive(repo, [{ action: 'pick', commitHash: D1_hash, ... }, { action: 'pick', commitHash: D2_hash, ... }])`

**Then**
- `exitCode === 0`
- Deux nouveaux commits D1', D2' créés
- `refs.heads.feature` pointe D2'
- État rebasing désactivé

### CA-rebasei-04 : Reword (édition de message)

**Given**
- Rebase interactif en attente
- Todo list : D1 (reword), D2 (pick)
- Utilisateur change le message de D1 : "First commit" → "Modified first commit"

**When**
- Exécute `executeRebaseInteractive(repo, [{ action: 'reword', commitHash: D1_hash, message: "Modified first commit" }, ...])`

**Then**
- D1' créé avec `message === "Modified first commit"`
- D1'.tree et D1'.parents inchangés (seul le message change)
- D2' créé avec parent D1'

### CA-rebasei-05 : Squash

**Given**
- Rebase interactif
- Todo list : D1 (pick), D2 (squash), D3 (pick)
- D1, D2, D3 ont des changements distincts

**When**
- Exécute `executeRebaseInteractive(repo, [{ action: 'pick', ... }, { action: 'squash', ... }, { action: 'pick', ... }])`

**Then**
- D1' créé avec changements de D1
- D2 squashé dans D1' → résultat a changements D1 + D2, message combiné "D1\n\nD2"
- D3' créé avec parent = commit squashé de D1+D2
- 2 commits finaux au lieu de 3

### CA-rebasei-06 : Fixup (squash + discard message)

**Given**
- Rebase interactif
- Todo list : D1 (pick), D2 (fixup)
- Messages : D1 = "Feature", D2 = "Fix typo"

**When**
- Exécute `executeRebaseInteractive(repo, [{ action: 'pick', ... }, { action: 'fixup', ... }])`

**Then**
- Résultat squashé avec message "Feature" (message D2 jeté)
- Aucun "Fix typo" dans le message final

### CA-rebasei-07 : Drop (suppression de commit)

**Given**
- Rebase interactif
- Todo list : D1 (pick), D2 (drop), D3 (pick)

**When**
- Exécute `executeRebaseInteractive(repo, [{ action: 'pick', ... }, { action: 'drop', ... }, { action: 'pick', ... }])`

**Then**
- D1' créé
- D2 ignoré (aucun commit créé)
- D3' créé avec parent D1'
- 2 commits finaux au lieu de 3

### CA-rebasei-08 : Réordonnancement

**Given**
- Rebase interactif
- Original ordre : D1, D2, D3
- Utilisateur réordonne : D2, D1, D3

**When**
- Exécute `executeRebaseInteractive(repo, [D2_item, D1_item, D3_item])`

**Then**
- D2' créé avec parent C1
- D1' créé avec parent D2'
- D3' créé avec parent D1'
- Ordre final suit la todo list

### CA-rebasei-09 : Conflit en cours de squash

**Given**
- D1 modifie `a.txt` : "base" → "d1"
- D2 modifie `a.txt` : "base" → "d2" (conflit avec D1)
- Todo : D1 (pick), D2 (squash)

**When**
- Exécute `executeRebaseInteractive(...)`

**Then**
- `exitCode === 1`
- `output` mentionne conflit
- `snapshot.rebasing.interactive.currentIndex === 1` (D2 en conflit)
- État rebasing garde la todo list et l'exécution

### CA-rebasei-10 : Continue après conflit de squash

**Given**
- État de conflit du CA-rebasei-09
- Utilisateur a résolu `a.txt` : "resolved"

**When**
- Exécute `git rebase --continue`

**Then**
- Commit squashé D1_D2 créé avec contenu résolu
- D3' (s'il existe) créé avec parent D1_D2
- État rebasing désactivé

### CA-rebasei-11 : Premier commit squashé (erreur)

**Given**
- Rebase interactif
- Todo list : D1 (squash), D2 (pick)

**When**
- Exécute `executeRebaseInteractive(...)`

**Then**
- `exitCode === 1`
- `errors[0]` contient "cannot squash the first commit"
- Aucun commit créé
- État rebasing restauré à "en attente" (allow retry)

### CA-rebasei-12 : Abort rebase interactif

**Given**
- Rebase interactif en cours (en attente de todo ou en exécution)

**When**
- Exécute `git rebase --abort`

**Then**
- `exitCode === 0`
- État rebasing supprimé
- Branche/HEAD restaurée à son état initial
- Todo list oubliée

## Décisions de conception (Phase 5)

| Aspect | Décision |
|--------|----------|
| **Édition de la todo** | Modale Vue `InteractiveRebaseModal.vue` (drag-drop optionnel, actions dropdown, messages inline) ; pas d'éditeur externe |
| **Édition de message (reword)** | Dans la modale avant exécution ; pas de pauses supplémentaires en cours d'exécution |
| **Edit action** | Non implémenté Phase 5 ; reserve pour Phase 6 (demande une pause et `--continue` pour amender) |
| **Merge commits en rebase -i** | Refusés (comme Phase 4) ; `-p` non implémenté |
| **Autosquash** | Non implémenté Phase 5 |
| **Exec action** | Non implémenté Phase 5 |
| **Multiple branches rebase** | Non supporté Phase 5 (un seul `<base>`) |
| **Interface moteur ↔ UI** | Nouvelle action `executeRebaseInteractive(repo, todoList)` exposée depuis le store ; ou encoding JSON dans `git rebase --start-interactive` (voir notes) |
| **Conflits** | Réutilise Phase 4 (`--continue`/`--abort`) ; pas de différentiel |

## Modèle de données (extension de Phase 4)

### Repository.rebasing (étendu)

```typescript
export interface RebasingState {
  // ... champs existants (base, toReplay, replayed, ...)
  interactive?: {
    /** true si en attente d'édition de la todo (utilisateur doit soumettre la todo) */
    awaitingTodoEdit: boolean;
    /** Todo list (initial ou en cours d'exécution) */
    todoList: TodoItem[];
    /** Index du commit en cours de traitement (-1 si en attente, 0+ si exécution) */
    currentIndex: number;
  };
}

export interface TodoItem {
  action: 'pick' | 'reword' | 'squash' | 'fixup' | 'drop' | 'edit';
  commitHash: string;
  message: string; // message éditable (utilisé pour reword)
}
```

### RepoSnapshot (exposé pour l'UI)

```typescript
export interface RepoSnapshot {
  // ... champs existants
  operationState?: {
    type: 'rebasing';
    // Nouveautés Phase 5 :
    interactive?: {
      awaitingTodoEdit: boolean;
      todoList: Array<{ action: string; commitHash: string; message: string }>;
      currentIndex: number;
    };
  };
}
```

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/model.ts` | Ajouter `TodoItem`, étendre `RebasingState` avec `interactive` |
| `src/core/repository.ts` | Ajouter `buildTodoListFromCommits`, helpers squash/fixup |
| `src/core/commands/rebase.ts` | Implémenter `cmdRebaseInteractive(repo, args)` et `executeRebaseInteractive(repo, todoList)` ; refactoriser `cmdRebase` pour supporter `-i` |
| `src/stores/repo.ts` | Ajouter action `executeRebaseInteractive(todoList)` exposée à l'UI |
| `src/components/InteractiveRebaseModal.vue` | **Nouvelle composante** : UI modale pour éditer la todo list |
| `src/graph/` | Aucun changement (graphe affiche les commits finaux) |
| Tests | Couvrir `25-rebase-interactive.md` CA-* |

## Notes d'implémentation

### Interface moteur ↔ UI (détails)

**Option A : Nouvelle action exposée par le store**
```typescript
// Dans stores/repo.ts
function executeRebaseInteractive(todoList: TodoItem[]): CommandResult {
  return this.engine.executeRebaseInteractive(this.repo, todoList);
}

// Dans core/commands/rebase.ts (nouveau)
export function executeRebaseInteractive(
  repo: Repository,
  todoList: TodoItem[]
): CommandResult {
  // Valider et exécuter
}
```

**Option B : Sous-commande spéciale**
```bash
git rebase --start-interactive <base64_json_of_todoList>
```

Phase 5 choisit **Option A** pour clarté (pas de sérialisation complexe).

### Gestion de l'ordre des commits squashés

Quand D2 est squashé dans D1', le commit créé est D1_squashed avec :
- `D1_squashed.parents = [C1]` (même parent que D1')
- `D1_squashed.tree = arbre_fusionné(D1 + D2)`
- `D1_squashed.message = combine(D1.message, D2.message)`

Le reste de la chaîne utilise D1_squashed comme parent :
```
C1 → D1_squashed (D1 + D2) → D3' → ...
```

Pas de "D2' orphelin" : D2 n'a jamais de commit créé.

### Vérification cohérence todo vs commits original

Avant d'exécuter, vérifier que chaque `todoItem.commitHash` existe dans `repo.objects`. Sinon, erreur.

### Reword sans édition : inline dans la modale

Message du commit est éditable dans la modale (TextField/textarea inline). Si `action === 'reword'` et l'utilisateur modifie le message, utiliser le message édité. Pas de prompt supplémentaire.

### Abort préserve la branche/index/WT

`git rebase --abort` rétablit l'état **exact** sauvegardé avant la première commande `git rebase -i`. Pas de différentiel avec Phase 4 (même mécanisme).

## Impact sur Phase 6+

- **Edit action** : demande une pause et une modale d'amend (similar à reword mais après creation du commit)
- **Cherry-pick multiples** : peut utiliser la même infra de todo list (nouvelle commande `git cherry-pick -m <list>` ou similaire)
- **Autosquash** : parse les messages pour détecter `squash!`, `fixup!` et réordonne automatiquement la todo list
