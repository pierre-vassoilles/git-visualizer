# Phase 2 : git restore

## Résumé

La commande `git restore` restaure des fichiers (ou des chemins) du working tree ou de l'index en les obtenant d'une source (l'index par défaut, ou un commit spécifié). Elle est une alternative plus spécialisée et claire au `git checkout -- <pathspec>` de Phase 1.

Variantes :
- `git restore <pathspec>` : restaure le working tree depuis l'index
- `git restore --staged <pathspec>` : retire du staging (index ← HEAD)
- `git restore --source=<commit> <pathspec>` : restaure depuis un commit spécifique

## Syntaxe

```
git restore [options] <pathspec...>
```

### Options supportées en Phase 2

| Option | Argument | Comportement | Notes |
|--------|----------|-------------|-------|
| (aucun) | `<pathspec...>` | Restaure le working tree depuis l'index | |
| `--staged` | `<pathspec...>` | Retire du staging (index ← HEAD) | |
| `--source` | `<commit>` | Source personnalisée pour la restauration | Doit être accompagné d'un `<pathspec>` |
| (aucun) | `.` | Restaure tous les fichiers | |

**Remarque** : Les flags `-p`, `--patch`, `-S`, `--worktree`, etc. ne sont pas implémentés en Phase 2.

## Comportement nominal

### Cas 1 : Restaurer depuis l'index (`git restore <pathspec>`)

**Condition** : `<pathspec>` existe dans l'index.

**Processus** :
1. Récupérer le blob depuis l'index pour `<pathspec>`
2. Écrire le contenu du blob dans le working tree à `<pathspec>`
3. Mettre à jour le mode (100644 ou 100755) si nécessaire
4. **Sortie** : Aucune (succès muet)
5. **Code de sortie** : 0

**Cas particulier** : Si `<pathspec>` est `.`, restaurer tous les fichiers de l'index dans le working tree.

**Cas particulier** : Si le fichier n'existe pas dans l'index (jamais stagé), aucune action (ou erreur, voir cas d'erreur).

### Cas 2 : Retirer du staging (`git restore --staged <pathspec>`)

**Condition** : `<pathspec>` existe dans l'index.

**Processus** :
1. Récupérer le blob du HEAD courant pour `<pathspec>`
2. Remplacer l'entrée `index[<pathspec>]` par le blob/mode de HEAD
3. Le working tree reste **inchangé**
4. **Sortie** : Aucune (succès muet)
5. **Code de sortie** : 0

**Cas particulier** : Si HEAD n'existe pas (dépôt vierge), `index[<pathspec>]` est supprimé (c'était un fichier "new file" en staging).

**Cas particulier** : Si le fichier n'existe pas dans HEAD non plus, supprimer l'entrée de l'index.

### Cas 3 : Restaurer depuis un commit (`git restore --source=<commit> <pathspec>`)

**Condition** : `<commit>` existe ; `<pathspec>` peut exister ou non.

**Processus** :
1. Vérifier que `<commit>` existe dans `objects`
2. Récupérer le blob du commit pour `<pathspec>` (via son tree)
3. Écrire le contenu du blob dans le working tree à `<pathspec>`
4. **Sortie** : Aucune
5. **Code de sortie** : 0

**Cas particulier** : Si le fichier n'existe pas dans le commit, supprimer `<pathspec>` du working tree.

## Cas d'erreur

### Pathspec n'existe pas ou est invalide

**Condition** : Appeler `git restore <pathspec>` où `<pathspec>` n'existe dans aucune source (index, HEAD, ou commit).

**Message d'erreur** (exemple) :
```
error: pathspec '<pathspec>' did not match any files
```

**Code de sortie** : 1

**Comportement** : Aucune modification au working tree ou à l'index.

### Pathspec vide

**Condition** : Appeler `git restore` sans argument.

**Message d'erreur** :
```
fatal: pathspec cannot be empty
```

**Code de sortie** : 1

### Commit inexistant (--source)

**Condition** : Appeler `git restore --source=abc123 <pathspec>` où `abc123` n'existe pas.

**Message d'erreur** :
```
fatal: reference is not a tree: 'abc123'
```

**Code de sortie** : 1

**Comportement** : Aucune modification.

### Dépôt non initialisé

**Condition** : Appeler `git restore` sans `git init`.

**Message d'erreur** :
```
fatal: not a git repository (or any of the parent directories): .git
```

**Code de sortie** : 128

### --staged sur dépôt vierge (HEAD n'existe pas)

**Condition** : Appeler `git restore --staged <pathspec>` sur un dépôt vierge (aucun commit).

**Comportement** : Supprimer `<pathspec>` de l'index (car il n'existe pas dans HEAD).

**Sortie** : Aucune (silencieuse).

**Code de sortie** : 0

## Critères d'acceptation (Given/When/Then)

### CA-restore-01 : Restaurer le working tree depuis l'index

**Given**
- L'engine est initialisé avec un commit
- Un fichier `file.txt` existe dans l'index avec contenu "staged content"
- Le fichier existe dans le working tree avec contenu "modified content" (différent)

**When**
- L'utilisateur exécute `git restore file.txt`

**Then**
- `exitCode === 0`
- `output` est vide (succès muet)
- `workingTree['file.txt'].content === "staged content"` (restauré depuis l'index)
- `index['file.txt']` inchangé

### CA-restore-02 : Restaurer tous les fichiers (avec .)

**Given**
- L'engine a plusieurs fichiers : `file1.txt`, `file2.txt`
- Les deux ont été modifiés dans le working tree mais existent dans l'index

**When**
- L'utilisateur exécute `git restore .`

**Then**
- `exitCode === 0`
- `workingTree['file1.txt']` restauré depuis l'index
- `workingTree['file2.txt']` restauré depuis l'index

### CA-restore-03 : Retirer du staging

**Given**
- L'engine a un commit avec `file.txt` (contenu "original")
- `file.txt` est dans l'index avec contenu "staged content" (différent)
- `file.txt` dans le working tree avec contenu "staged content" (aligné avec l'index)

**When**
- L'utilisateur exécute `git restore --staged file.txt`

**Then**
- `exitCode === 0`
- `index['file.txt'].content === "original"` (restauré depuis HEAD)
- `workingTree['file.txt'].content === "staged content"` (inchangé)

### CA-restore-04 : Retirer du staging un fichier nouveau

**Given**
- L'engine a un commit initial
- Un nouveau fichier `newfile.txt` a été stagé (dans l'index, pas dans HEAD)

**When**
- L'utilisateur exécute `git restore --staged newfile.txt`

**Then**
- `exitCode === 0`
- `index['newfile.txt']` est supprimé (n'existait pas dans HEAD)
- `workingTree['newfile.txt']` peut rester (optionnel : reste ou est supprimé selon Git)

### CA-restore-05 : Restaurer depuis un commit

**Given**
- L'engine a deux commits : c1 (avec `file.txt` = "v1") et c2 (avec `file.txt` = "v2")
- HEAD pointe sur c2
- Le working tree a `file.txt` = "modified"

**When**
- L'utilisateur exécute `git restore --source=c1 file.txt`

**Then**
- `exitCode === 0`
- `workingTree['file.txt'].content === "v1"` (restauré depuis c1)
- `index['file.txt']` inchangé

### CA-restore-06 : Restaurer un fichier inexistant dans le commit (suppression)

**Given**
- L'engine a un commit c1 sans `newfile.txt`
- Le working tree a `newfile.txt`

**When**
- L'utilisateur exécute `git restore --source=c1 newfile.txt`

**Then**
- `exitCode === 0`
- `workingTree['newfile.txt']` est supprimé
- `index['newfile.txt']` inchangé

### CA-restore-07 : Erreur : pathspec inexistant

**Given**
- L'engine est initialisé
- Aucun fichier `nosuchfile.txt` ne s'est produit dans index, HEAD, ou working tree

**When**
- L'utilisateur exécute `git restore nosuchfile.txt`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"did not match any files"`
- Aucune modification au working tree ou à l'index

### CA-restore-08 : Erreur : commit inexistant

**Given**
- L'engine est initialisé

**When**
- L'utilisateur exécute `git restore --source=nosuchcommit file.txt`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"is not a tree"`
- Aucune modification

### CA-restore-09 : Erreur : pathspec vide

**Given**
- L'engine est initialisé

**When**
- L'utilisateur exécute `git restore`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"pathspec cannot be empty"`

## Implémentation : Points clés

1. **Parser les options** : Distinguer `--staged`, `--source=<commit>`, et pathspecs
2. **Récupérer la source** :
   - Défaut : `index`
   - `--staged` : `HEAD`
   - `--source=<commit>` : le commit spécifié
3. **Chercher le blob** :
   - Utiliser `flattenTree()` pour obtenir la map `path → hash` depuis l'arbre source
   - Récupérer le blob depuis `objects[hash]`
4. **Restaurer le contenu** : Écrire dans `workingTree[pathspec]` ou `index[pathspec]` selon la cible
5. **Gestion du `.`** : Utiliser un helper pour déterminer si `.` signifie « tous les fichiers » et appliquer pour chaque
6. **Validation** : Vérifier que le pathspec correspond à au moins une entrée dans la source

## Dépendances inter-commandes

- **`git restore`** dépend de `git init`
- **`git restore --staged`** dépend de `git add` (Phase 1)
- **`git restore`** peut travailler sur des fichiers modifiés par `git add` (Phase 1)
- **`git restore --source=<commit>`** dépend de commits existants (Phase 1)

## Notes Phase 2

### Différence avec Phase 1 `git checkout -- <pathspec>`

En Phase 1, `git checkout -- <file>` restaurait le fichier. En Phase 2, on introduit `git restore` comme la forme recommandée (plus claire).

On peut implémenter `restore` comme une commande Phase 2 et optionnellement laisser `checkout --` en tant que wrapper pour compatibilité.

### Interaction avec `git add`

L'index est un snapshot complet (Phase 1). Quand on restaure un fichier depuis l'index :
- Le contenu du working tree est remplacé
- L'entrée dans l'index reste inchangée

Quand on fait `restore --staged` :
- L'entrée de l'index est remplacée avec le contenu de HEAD
- Le working tree reste inchangé

### Restauration d'un fichier modifié puis stagé

Scénario :
```
HEAD: file.txt = "original"
index: file.txt = "staged v1"
working tree: file.txt = "modified"
```

Commandes :
- `git restore file.txt` → working tree = "staged v1" (depuis l'index)
- `git restore --staged file.txt` → index = "original" (depuis HEAD) ; working tree inchangé
- `git restore --staged file.txt && git restore file.txt` → tout = "original"

