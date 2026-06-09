# Phase 5 : git stash

## Résumé

La commande `git stash` sauvegarde les modifications non commitées du working tree et de l'index dans une pile (stack), puis nettoie le working tree et l'index pour revenir à l'état de HEAD. Utile pour "ranger" les modifications temporaires et basculer de branche sans perdre de données.

**Cas d'usage** :
- Sauvegarder des modifications pour basculer de branche
- Créer une branche de sauvegarde avant un rebase/merge
- Nettoyer le working tree avant une opération

**Variantes** :
- `git stash` / `git stash push` : sauvegarde et nettoie
- `git stash list` : affiche la pile de stash
- `git stash pop` : applique et supprime le stash le plus récent
- `git stash apply` : applique sans supprimer
- `git stash drop` : supprime un stash
- (Optionnel Phase 5) : `git stash pop <index>`, `git stash apply <index>`, `git stash drop <index>`

## Syntaxe

```
git stash [push | list | pop | apply | drop] [options]
```

### Commandes supportées en Phase 5

| Commande | Argument | Comportement | Notes |
|----------|----------|-----------|---------|
| `stash` (ou `push`) | (aucun) | Sauvegarde modifications et nettoie | Défaut ; `-m` optionnel |
| `stash list` | (aucun) | Affiche la pile | Format : `stash@{n}: ... on <branchname>` |
| `stash pop` | (optionnel) `[<index>]` | Applique et supprime | Défaut : `stash@{0}` |
| `stash apply` | (optionnel) `[<index>]` | Applique sans supprimer | Défaut : `stash@{0}` |
| `stash drop` | (optionnel) `[<index>]` | Supprime un stash | Défaut : `stash@{0}` |

**Remarque** : `--include-untracked`, `--patch`, `--keep-index`, etc. ne sont pas implémentés Phase 5.

## Concepts fondamentaux

### Pile de stash

La pile est une **LIFO stack** (Last-In-First-Out) de "stash entries". Chaque entrée sauvegarde :
- **État du working tree** (tous les fichiers, trackés et non)
- **État de l'index** (staging area)
- **Métadonnées** : branche courante, timestamp, message optionnel (si `-m` fourni)

**Indexation** : `stash@{0}` = plus récent, `stash@{1}` = 2e plus récent, etc.

### Modèle de données du stash

Un stash entry est essentiellement un "snapshot" : l'état du repo à un moment donné.

```typescript
export interface StashEntry {
  /** Index dans la pile (0 = plus récent) */
  index: number;
  /** Branche d'où provient le stash */
  branchName: string | null; // null si HEAD détaché
  /** Message optionnel (si `git stash push -m "msg"`) */
  message: string;
  /** Timestamp (pour tri et affichage) */
  date: number;
  /** Snapshot du working tree au moment du stash */
  workingTree: WorkingTree;
  /** Snapshot de l'index au moment du stash */
  index: Index;
  /** Hash de HEAD au moment du stash (pour replay) */
  headHash: string;
}
```

### Ré-indexation après suppression

Quand un stash est supprimé, les indices des stash restants sont mis à jour :

```
Avant :
  stash@{0}: ... (message: "first")
  stash@{1}: ... (message: "second")
  stash@{2}: ... (message: "third")

Après git stash drop stash@{1} :
  stash@{0}: ... (message: "first")  [inchangé]
  stash@{1}: ... (message: "third")   [était @{2}, réindexé]
```

## Comportement nominal

### Cas 1 : Stash simple (push/stash sans arguments)

**Condition** :
- Working tree ou index ont des modifications par rapport à HEAD
- Aucun rebase/merge/cherry-pick/revert en cours (l'implémentation peut refuser ou les empiler séparément)

**Processus** :
1. Vérifier s'il y a des changements :
   - Comparer `repo.workingTree` vs `repo.index`
   - Comparer `repo.index` vs HEAD
   - Si identiques : erreur "No local changes to save"
2. Créer un stash entry :
   ```typescript
   {
     index: 0,
     branchName: currentBranch(repo),
     message: "", // pas de message si pas de `-m`
     date: Date.now() (ou nextTimestamp() pour cohérence),
     workingTree: cloneWorkingTree(repo.workingTree),
     index: cloneIndex(repo.index),
     headHash: headCommitHash(repo),
   }
   ```
3. Insérer en tête de la pile : `repo.stashStack.unshift(entry)`
4. Nettoyer le working tree et l'index :
   - Restaurer l'index à HEAD (comme `git reset --mixed HEAD`)
   - Restaurer le working tree à HEAD (comme `git reset --hard HEAD`)
5. **Sortie** :
   ```
   Saved working directory and index state on <branchname>: <message>
   (ou juste : "Saved working directory and index state on <branchname>")
   ```
6. **Code de sortie** : 0

### Cas 2 : Stash avec message (-m)

**Condition** : `git stash push -m "Save progress"`

**Processus** : Identique à Cas 1, mais `entry.message = "Save progress"`

**Sortie** : `Saved working directory and index state on <branchname>: Save progress`

### Cas 3 : Stash list

**Condition** : `git stash list`

**Processus** :
1. Parcourir `repo.stashStack` (du plus récent au plus ancien)
2. Formater chaque ligne :
   ```
   stash@{0}: WIP on main: abc1234 (Commit message) - optionnel
   stash@{1}: WIP on feature: def5678 - optionnel (si message : afficher le message de stash au lieu de "WIP on...")
   ```

   Ou si le stash a un message personnalisé :
   ```
   stash@{0}: On main: Save progress
   ```

   **Format standard Git** :
   ```
   stash@{<index>}: <type> on <branchname>: <optional_message_or_commit_msg>
   ```

3. **Sortie** :
   ```
   stash@{0}: WIP on main: abc1234
   stash@{1}: WIP on feature: def5678
   ```
4. **Code de sortie** : 0

### Cas 4 : Stash pop

**Condition** : `git stash pop` (ou `git stash pop stash@{0}`)

**Processus** :
1. Vérifier que la pile n'est pas vide ; erreur sinon
2. Récupérer l'entrée stash (défaut : `stash@{0}`)
3. Tenter d'appliquer le stash :
   - Restaurer `repo.workingTree` depuis `stashEntry.workingTree`
   - Restaurer `repo.index` depuis `stashEntry.index`
   - Si conflits lors de la restauration (voir section Conflits) : laisser les marqueurs, **ne pas supprimer** le stash de la pile
   - Sinon : supprimer le stash de la pile et ré-indexer
4. **Cas sans conflit** :
   - Message : `Dropped refs/stash@{0} (...)`
   - Code de sortie : 0
5. **Cas avec conflit** :
   - Message : `CONFLICT (content): Conflict in <file>`
   - Suggestion : `Use 'git reset' to abort the stash pop.` (optionnel)
   - Code de sortie : 1
   - **État "stashing"** (optionnel) : laisser une indication que le stash est partiellement appliqué

### Cas 5 : Stash apply

**Condition** : `git stash apply` (ou `git stash apply stash@{1}`)

**Processus** :
1. Même que pop (Cas 4), mais **ne pas supprimer** le stash de la pile après application
2. Message : `... (... files changed, ...)` (résumé de fichiers restaurés)
3. Code de sortie : 0 (sans conflit) ou 1 (avec conflit)

**Note** : Si pop/apply crée un conflit, on peut conserver le stash pour retry après résolution.

### Cas 6 : Stash drop

**Condition** : `git stash drop stash@{0}`

**Processus** :
1. Vérifier que l'index est valide (0 ≤ index < taille de pile)
2. Supprimer l'entrée à cet index
3. Ré-indexer les entrées restantes
4. **Sortie** : `Dropped refs/stash@{0} (...)`
5. **Code de sortie** : 0

### Cas 7 : Pop sur une pile vide

**Condition** : `git stash pop` quand `repo.stashStack.length === 0`

**Message d'erreur** :
```
fatal: No stash entries found.
```

**Code de sortie** : 128

**Comportement** : Aucune modification.

### Cas 8 : Pop/apply avec conflit

**Condition** : Appliquer un stash entre en conflit avec l'état courant

**Processus** :
1. Détecter les conflits (comme dans merge/rebase : marqueurs simples)
2. Écrire les marqueurs dans le working tree
3. **Ne pas supprimer** le stash (user peut retry)
4. **Optionnel** : laisser un indicateur dans `repo` que le stash a été partiellement appliqué (pour feedback utilisateur)
5. Message : `CONFLICT (content): ...`
6. Code de sortie : 1

### Cas 9 : Stash sur HEAD détaché

**Condition** : Executer `git stash` quand HEAD est détaché

**Processus** : Identique (créer le stash entry avec `branchName = null`)

**Sortie** : `Saved working directory and index state WIP on HEAD: <hash>`

## Cas d'erreur

### Pas de changements à sauvegarder

**Condition** : `git stash` quand working tree et index sont identiques à HEAD

**Message d'erreur** :
```
No local changes to save
```

**Code de sortie** : 0 (pas une erreur, juste "rien à faire")

### Index invalide

**Condition** : `git stash pop stash@{5}` quand la pile n'a que 3 entrées

**Message d'erreur** :
```
fatal: stash@{5}: no such stash
```

**Code de sortie** : 128

### Pop pendant une opération en cours

**Condition** : `git stash pop` quand un rebase/merge/cherry-pick/revert est en cours

**Message d'erreur** (optionnel Phase 5) :
```
error: Cannot pop stash while another operation is in progress.
```

**Comportement** : Refuser l'opération, ou permettre l'empilement de stash indépendants (décision de design).

Phase 5 choisit : **permettre indépendamment**. Chaque opération a son propre état ; stash est orthogonal.

## Critères d'acceptation

### CA-stash-01 : Stash simple

**Given**
- Repository avec HEAD = C1 contenant `a.txt = "v1"`
- Working tree : `a.txt = "v2"`, `b.txt = "new"`

**When**
- Exécute `git stash`

**Then**
- `exitCode === 0`
- `output[0]` contient "Saved working directory"
- `repo.stashStack.length === 1`
- Working tree restauré : `a.txt = "v1"`, `b.txt` absent
- Index restauré à HEAD

### CA-stash-02 : Stash avec message

**Given**
- Repository avec modifications

**When**
- Exécute `git stash push -m "Save feature work"`

**Then**
- `exitCode === 0`
- `repo.stashStack[0].message === "Save feature work"`
- `output[0]` contient "Save feature work"
- Working tree nettoyé

### CA-stash-03 : Pas de changements

**Given**
- Repository avec working tree et index identiques à HEAD

**When**
- Exécute `git stash`

**Then**
- `exitCode === 0` (pas une erreur)
- `output[0]` contient "No local changes"
- `repo.stashStack` inchangée

### CA-stash-04 : Stash list

**Given**
- Repository avec deux stash : "Save work" et "Fix bug"

**When**
- Exécute `git stash list`

**Then**
- `exitCode === 0`
- `output[0]` contient `"stash@{0}: WIP on main: Save work"`
- `output[1]` contient `"stash@{1}: WIP on main: Fix bug"`

### CA-stash-05 : Stash pop simple

**Given**
- Repository avec un stash : `{ workingTree: { a.txt = "saved" }, ... }`
- Current HEAD : `a.txt = "current"`

**When**
- Exécute `git stash pop`

**Then**
- `exitCode === 0`
- Working tree : `a.txt = "saved"` (restauré)
- `repo.stashStack.length === 0` (stash supprimé)
- `output[0]` contient "Dropped"

### CA-stash-06 : Stash apply simple

**Given**
- Repository avec un stash

**When**
- Exécute `git stash apply`

**Then**
- `exitCode === 0`
- Working tree restauré (identique à pop)
- `repo.stashStack.length === 1` (stash conservé)
- `output[0]` ne contient pas "Dropped"

### CA-stash-07 : Pop sur pile vide

**Given**
- Repository avec `repo.stashStack = []`

**When**
- Exécute `git stash pop`

**Then**
- `exitCode === 128`
- `errors[0]` contient "No stash entries found"
- Aucune modification

### CA-stash-08 : Pop avec index spécifié

**Given**
- Repository avec trois stash : @{0}, @{1}, @{2}

**When**
- Exécute `git stash pop stash@{1}`

**Then**
- `exitCode === 0`
- Stash @{1} appliqué et supprimé
- Ancien @{2} réindexé en @{1}
- `repo.stashStack.length === 2`

### CA-stash-09 : Drop stash

**Given**
- Repository avec deux stash : @{0}, @{1}

**When**
- Exécute `git stash drop stash@{0}`

**Then**
- `exitCode === 0`
- Ancien @{1} réindexé en @{0}
- `repo.stashStack.length === 1`
- `output[0]` contient "Dropped"

### CA-stash-10 : Pop avec conflit

**Given**
- HEAD : `a.txt = "base"`
- Current working tree : `a.txt = "current"`
- Stash : `a.txt = "saved"`
- Impossible de merger simplement

**When**
- Exécute `git stash pop`

**Then**
- `exitCode === 1`
- `output[0]` contient "CONFLICT"
- Working tree : `a.txt` contient marqueurs de conflit
- `repo.stashStack.length === 1` (stash conservé)

### CA-stash-11 : Stash HEAD détaché

**Given**
- HEAD détaché sur commit C1
- Modifications non commitées

**When**
- Exécute `git stash`

**Then**
- `exitCode === 0`
- Stash créé avec `branchName = null`
- `output[0]` contient "WIP on HEAD" ou "WIP on <hash>"

### CA-stash-12 : Pop stash d'une autre branche

**Given**
- Stash créé quand on était sur branche `main`
- Actuellement sur branche `feature`

**When**
- Exécute `git stash pop stash@{0}`

**Then**
- `exitCode === 0`
- Stash appliqué sur `feature` (indépendamment de la branche d'origine)
- Aucun "branch mismatch" warning (Phase 5 pas de warning)

## Décisions de conception (Phase 5)

| Aspect | Décision |
|--------|----------|
| **Structure de pile** | Stack LIFO simple ; indexation depuis 0 (plus récent) |
| **Détection de conflits** | Détection simple (merge 2-way : stashWT vs currentWT) |
| **Conflit + pop** : Stash conservé (retry après résolution) |
| **Stash.index vs Index en Python** | `Index` de Phase 1 (staging area) ; `index` de stash = snapshot de staging |
| **Branche d'origine dans métadonnées** | Stockée pour affichage (`stash list`), mais pop s'applique à HEAD courant |
| **Untracked files** | Sauvegardés dans le stash (dans `workingTree`) ; restaurés par pop/apply |
| **Multiple stash operations** | Permis indépendamment (pas de conflit avec rebase/merge en cours) |
| **Interaction avec reflog** | Optionnel Phase 5 ; stash ops peuvent être tracked si besoin |

## Modèle de données

### Repository (extension)

```typescript
export interface Repository {
  // ... champs existants
  stashStack?: StashEntry[];
}

export interface StashEntry {
  /** Branche d'où provient le stash (null si HEAD détaché) */
  branchName: string | null;
  /** Message optionnel (`git stash -m "..."`) */
  message: string;
  /** Timestamp */
  date: number;
  /** Snapshot du working tree */
  workingTree: WorkingTree;
  /** Snapshot de l'index */
  index: Index;
  /** Hash de HEAD au moment du stash */
  headHash: string;
}
```

### RepoSnapshot (extension)

```typescript
export interface RepoSnapshot {
  // ... champs existants
  /** Stack de stash (du plus récent au plus ancien) */
  stashCount?: number; // simple count pour l'UI (optionnel : exposer full list si besoin)
}
```

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/model.ts` | Ajouter `StashEntry`, étendre `Repository` avec `stashStack` |
| `src/core/commands/stash.ts` | **Nouveau fichier** : implémenter `cmdStash`, `cmdStashPush`, `cmdStashList`, `cmdStashPop`, `cmdStashApply`, `cmdStashDrop` |
| `src/core/engine.ts` | Route `stash`, `stash push`, etc. vers les handlers |
| Tests | Couvrir `26-stash.md` CA-* |

## Notes d'implémentation

### Conflits lors de pop/apply

Lors de la restauration du stash, détecter les conflits **simplement** :
- Comparer `stashEntry.workingTree[path]` vs `currentWorkingTree[path]`
- Si les deux ont été modifiées depuis HEAD, conflit
- Écrire les marqueurs de conflit dans `repo.workingTree`

Pas de fusion 3-way complexe (pas de `baseTree`).

### Ré-indexation

Après suppression d'un stash, mettre à jour les indices de toutes les entrées restantes pour qu'ils soient contigus (0, 1, 2, ...).

### Format de message stash list

Deux cas :
1. Si `stashEntry.message` est vide : `stash@{0}: WIP on main: <commit_msg>`
2. Si `stashEntry.message` est défini : `stash@{0}: On main: <stash_message>`

Adapter selon le contexte.

### Untracked files

Les fichiers non trackés (dans WT mais pas dans index) sont conservés lors du stash. Après `git stash pop`, ils sont restaurés. Cohérent avec Git qui stash les untracked si explicitement demandé (Phase 5 : toujours les sauvegarder).

### Interaction avec reflog (Phase 6)

Potentiellement tracker les opérations stash dans le reflog (comme Git le fait), mais Phase 5 peut ignorer (reflog est Phase 5).
