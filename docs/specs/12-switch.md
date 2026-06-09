# Phase 2 : git switch

## Résumé

La commande `git switch` est une variante plus moderne et explicite de `git checkout` pour changer de branche ou détacher HEAD. Elle sépare les concepts :
- **Branches** : `git switch <branchname>`
- **Commits détachés** : `git switch --detach <commit>`

Les messages et comportements sont légèrement différents de `checkout` pour plus de clarté.

## Syntaxe

```
git switch [options] [<branch>]
```

### Options supportées en Phase 2

| Option | Argument | Comportement | Notes |
|--------|----------|-------------|-------|
| (aucun) | `<branch>` | Bascule vers une branche existante | |
| `-c` | `<branchname>` | Crée et bascule vers une nouvelle branche | Depuis HEAD courant |
| `--detach` | `<commit>` | Détache HEAD sur ce commit | |
| `-` | (aucun) | Revient à la branche précédente | |

**Remarque** : Les flags `--no-track`, `-t`, `--force-create`, `-f`, etc. ne sont pas implémentés en Phase 2.

## Comportement nominal

### Cas 1 : Basculer vers une branche (`git switch <branchname>`)

**Condition** : `<branchname>` existe dans `refs/heads/`.

**Processus** : Identique à `git checkout <branchname>`.

**Sortie** :
```
Switched to branch '<branchname>'
```

**Code de sortie** : 0

### Cas 2 : Créer et basculer vers une branche (`git switch -c <branchname>`)

**Condition** : Flag `-c` et un nom de branche qui n'existe pas.

**Processus** : Identique à `git checkout -b <branchname>`.

**Sortie** :
```
Switched to a new branch '<branchname>'
```

**Code de sortie** : 0

### Cas 3 : Détacher HEAD (`git switch --detach <commit>`)

**Condition** : Flag `--detach` et un argument `<commit>`.

**Processus** : Identique à `git checkout <commit>` (détacher).

**Sortie** :
```
Switched to detached HEAD state at <short_hash>
```

(Optionnellement, ajouter les messages d'information sur l'état détaché, comme dans `checkout`.)

**Code de sortie** : 0

### Cas 4 : Revenir à la branche précédente (`git switch -`)

**Condition** : Flag `-` seul.

**Processus** : Identique à `git checkout -`.

**Sortie** :
```
Switched to branch '<prevBranch>'
```

**Code de sortie** : 0

## Différences avec `git checkout`

### Syntaxe et clarté

- **checkout** : polyvalent, peut faire checkout de fichiers, branches, commits → messages et flags complexes
- **switch** : uniquement pour branches/détachement → plus prévisible

### Messages d'erreur

Certains messages sont plus spécifiques :

| Scénario | checkout | switch |
|----------|----------|--------|
| Branche inexistante | "did not match any file" | "switch: invalid choice: '...' (maybe you meant...)" |
| Pas de branche précédente | "no previous branch" | "switch: invalid choice: '-'" |
| Changements écrasés | "Your local changes..." | "Your local changes..." (identique) |

Pour Phase 2, on peut simplifier et utiliser des messages cohérents entre les deux.

## Cas d'erreur

Tous les cas d'erreur sont identiques à `git checkout`, avec messages adaptés :

### Branche inexistante

**Condition** : Appeler `git switch <branchname>` où `<branchname>` n'existe pas.

**Message d'erreur** :
```
error: switch: invalid choice: '<branchname>'
```

ou (variante simple) :

```
error: reference is not a tree: '<branchname>'
```

**Code de sortie** : 1

### Commit inexistant (--detach)

**Condition** : Appeler `git switch --detach <commit>` où `<commit>` n'existe pas.

**Message d'erreur** :
```
fatal: reference is not a tree: '<commit>'
```

**Code de sortie** : 1

### Changements locaux écrasés

**Condition** : Identique à `checkout`.

**Message d'erreur** : Identique à `checkout` (messages ne se distinguent pas).

**Code de sortie** : 1

### `-c` avec branche existante

**Condition** : Appeler `git switch -c <branchname>` où `<branchname>` existe déjà.

**Message d'erreur** :
```
fatal: A branch named '<branchname>' already exists.
```

**Code de sortie** : 1

### Pas de branche précédente (`git switch -`)

**Condition** : Appeler `git switch -` sans branche précédente.

**Message d'erreur** :
```
error: no previous branch to switch to
```

**Code de sortie** : 1

### Dépôt non initialisé

**Condition** : Appeler `git switch` sans `git init`.

**Message d'erreur** :
```
fatal: not a git repository (or any of the parent directories): .git
```

**Code de sortie** : 128

## Critères d'acceptation (Given/When/Then)

### CA-switch-01 : Basculer vers une branche existante

**Given**
- L'engine est initialisé avec deux commits sur `main`
- La branche `feature` existe et pointe sur le deuxième commit
- HEAD pointe sur `main`

**When**
- L'utilisateur exécute `git switch feature`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Switched to branch 'feature'"`
- `HEAD.symbolic === true`
- `HEAD.target === "refs/heads/feature"`
- `prevBranch === "main"`

### CA-switch-02 : Créer et basculer avec `-c`

**Given**
- L'engine est initialisé sur `main`
- Aucune branche `newbranch` n'existe

**When**
- L'utilisateur exécute `git switch -c newbranch`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Switched to a new branch 'newbranch'"`
- `refs.heads.newbranch` existe

### CA-switch-03 : Détacher HEAD avec --detach

**Given**
- L'engine a plusieurs commits
- HEAD pointe sur `main`

**When**
- L'utilisateur exécute `git switch --detach abc123`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Switched to detached HEAD"`
- `HEAD.symbolic === false`
- `HEAD.target === abc123` (ou hash complet)

### CA-switch-04 : Revenir à la branche précédente

**Given**
- HEAD a basculé de `main` vers `feature`
- `prevBranch === "main"`

**When**
- L'utilisateur exécute `git switch -`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Switched to branch 'main'"`
- `HEAD.target === "refs/heads/main"`

### CA-switch-05 : Erreur : branche inexistante

**Given**
- L'engine est initialisé
- Aucune branche `nosuchbranch`

**When**
- L'utilisateur exécute `git switch nosuchbranch`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"invalid choice"` ou `"is not a tree"`
- `HEAD` inchangé

### CA-switch-06 : Erreur : changements locaux écrasés

**Given**
- HEAD pointe sur `main`
- Un fichier a été modifié dans le working tree sans être stagé
- La branche `feature` a un arbre différent pour ce fichier

**When**
- L'utilisateur exécute `git switch feature`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"Your local changes"`
- `HEAD` inchangé

### CA-switch-07 : Erreur : `-c` avec branche existante

**Given**
- La branche `main` existe

**When**
- L'utilisateur exécute `git switch -c main`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"A branch named 'main' already exists."`

### CA-switch-08 : Erreur : pas de branche précédente

**Given**
- `prevBranch === null`

**When**
- L'utilisateur exécute `git switch -`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"no previous branch"`

## Implémentation : Points clés

### Stratégie

`git switch` et `git checkout` partagent beaucoup de logique. On peut :

**Option A** : Implémenter `switch` comme wrapper léger autour de `checkout`
```typescript
// Dans commands/switch.ts
function handleSwitch(repo: Repository, args: string[]): CommandResult {
  // Parser les flags de switch
  // Convertir en appel équivalent checkout
  // Adapter les messages
}
```

**Option B** : Implémenter `switch` indépendamment mais partager les helpers
```typescript
// Dans commands/switch.ts et commands/checkout.ts
// Partager les fonctions : updateHead(), validateWorkingTree(), etc.
```

**Phase 2 Recommandation** : Option A (wrapper) pour éviter la duplication et faciliter la maintenance.

### Messages spécifiques

Distinguer les cas pour adapter les messages :
- Basculer vers branche : "Switched to branch 'X'"
- Créer + basculer : "Switched to a new branch 'X'"
- Détacher : "Switched to detached HEAD state at abc123"
- Revenir : "Switched to branch 'X'"

## Dépendances inter-commandes

- **`git switch`** dépend de `git init`
- **`git switch`** peut coexister avec `git checkout` (alternative à l'utilisateur)
- **`git switch -c`** dépend de `git branch` (indirectement, crée une branche)

