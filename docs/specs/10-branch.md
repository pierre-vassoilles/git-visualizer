# Phase 2 : git branch

## Résumé

La commande `git branch` gère les branches du dépôt : les lister, créer une nouvelle branche, ou supprimer une branche existante. Elle ne change pas HEAD ; elle manipule uniquement les références dans `refs/heads/`.

## Syntaxe

```
git branch [options] [branchname]
```

### Options supportées en Phase 2

| Option | Argument | Comportement | Notes |
|--------|----------|-------------|-------|
| (aucun) | (aucun) | Liste toutes les branches | Marque la branche courante avec `*` |
| (aucun) | `<branchname>` | Crée une nouvelle branche | À partir du commit HEAD courant |
| `-d` | `<branchname>` | Supprime une branche (safe) | Erreur si branche non mergée ou courante |
| `-D` | `<branchname>` | Supprime une branche (force) | Ignore l'état de merge |

**Remarque** : Les flags `-a`, `-r`, `--contains`, `--track`, `--set-upstream`, `-u`, `--move`, `-m`, etc. ne sont pas implémentés en Phase 2.

## Comportement nominal

### Cas 1 : Lister les branches (`git branch`)

**Condition** : Aucun argument.

**Processus** :
1. Parcourir `repo.refs.heads` (toutes les branches)
2. Pour chaque branche, afficher son nom sur une ligne
3. Si la branche est courante (HEAD symbolique → son nom), préfixer par `* ` et en couleur (verte ou standard)

**Sortie** :
```
* main
  feature
  develop
```

(Avec coloration : le nom courant en vert, les autres en blanc.)

Cas particulier : S'il n'y a qu'une branche (main, sans autre), l'affichage est :
```
* main
```

Cas particulier (dépôt vierge) : Après `git init`, afficher :
```
* main
```
même s'il n'y a pas encore de commits.

**Code de sortie** : 0

### Cas 2 : Créer une branche (`git branch <branchname>`)

**Condition** : Un argument, pas de flag.

**Processus** :
1. Vérifier que `<branchname>` n'existe pas déjà dans `refs.heads`
2. Récupérer le hash du commit HEAD courant (si HEAD détaché ou sur une branche existante)
3. Créer l'entrée `refs.heads[<branchname>] = <hash_du_commit_HEAD>`
4. **Pas d'output** (succès muet, comme Git)
5. **Code de sortie** : 0

**Cas particulier** : Si HEAD est sur une branche vide (pas encore de commits), créer quand même la nouvelle branche vide :
```
refs.heads[<branchname>] = ""
```

**Cas particulier** : Créer une branche en mode HEAD détaché crée une branche pointant vers ce commit détaché :
```
git checkout abc123   # HEAD détaché
git branch feature    # feature → abc123
```

### Cas 3 : Supprimer une branche (`git branch -d <branchname>`)

**Condition** : Flag `-d` et un argument (nom de branche).

**Processus** :
1. Vérifier que `<branchname>` existe
2. Vérifier que ce n'est pas la branche courante
3. Vérifier que la branche est « mergée » ou à jour (optionnel Phase 2 : si on ignore le vrai merge, on peut simplifier : vérifier que le commit pointé est un ancêtre de HEAD)
4. Supprimer l'entrée `refs.heads[<branchname>]`
5. **Sortie** : `Deleted branch <branchname> (was <shortHash>).`
6. **Code de sortie** : 0

**Implémentation Phase 2 (simplifié)** : Vérifier juste que ce n'est pas la branche courante. Le check "mergée" est une complexité de Phase 4+ ; on peut l'ignorer pour Phase 2, ou le traiter simplement (ex. : si le commit de la branche est un ancêtre de HEAD, c'est "safe to delete").

### Cas 4 : Supprimer une branche (force, `git branch -D <branchname>`)

**Condition** : Flag `-D` et un argument.

**Processus** :
1. Vérifier que `<branchname>` existe
2. Vérifier que ce n'est pas la branche courante
3. Supprimer l'entrée `refs.heads[<branchname>]` sans vérification
4. **Sortie** : `Deleted branch <branchname> (was <shortHash>).`
5. **Code de sortie** : 0

## Cas d'erreur

### Branche déjà existante

**Condition** : Appeler `git branch <branchname>` où `<branchname>` existe déjà dans `refs/heads`.

**Message d'erreur** :
```
fatal: A branch named '<branchname>' already exists.
```

**Code de sortie** : 1

**Comportement** : Aucune modification aux refs.

### Branche à supprimer n'existe pas

**Condition** : Appeler `git branch -d <branchname>` où `<branchname>` n'existe pas.

**Message d'erreur** :
```
fatal: branch '<branchname>' not found.
```

**Code de sortie** : 1

**Comportement** : Aucune modification aux refs.

### Suppression de la branche courante

**Condition** : Appeler `git branch -d <branchname>` où `<branchname>` est la branche sur laquelle HEAD pointe actuellement (HEAD symbolique).

**Message d'erreur** :
```
error: Cannot delete branch '<branchname>' checked out at '<path>'
```

ou (variante Git plus simple) :

```
fatal: Cannot delete the branch '<branchname>' which you are currently on.
```

**Code de sortie** : 1

**Comportement** : Aucune modification aux refs.

### Branche non mergée (Phase 2 simplifié)

**Condition** : Appeler `git branch -d <branchname>` où le commit de `<branchname>` n'est pas un ancêtre de HEAD (en théorie, c'est "non mergée").

**Phase 2 Décision** : Ignoré pour l'instant. On peut afficher un avertissement ou l'ignorer. Si implémenté, message :

```
error: The branch '<branchname>' is not fully merged.
Run 'git branch -D <branchname>' if you want to delete it anyway.
```

**Code de sortie** : 1

### Dépôt non initialisé

**Condition** : Appeler `git branch` sans avoir appelé `git init`.

**Message d'erreur** :
```
fatal: not a git repository (or any of the parent directories): .git
```

**Code de sortie** : 128

**Comportement** : Aucune modification ; erreur.

### Nom de branche invalide

**Condition** : Appeler `git branch <branchname>` où `<branchname>` contient des caractères invalides ou est vide.

**Message d'erreur** (exemples) :
```
fatal: invalid branch name '<branchname>'
```

ou (si vide) :
```
fatal: 'git branch' requires a branch name
```

**Code de sortie** : 1

**Phase 2 Implémentation** : Accepter tout nom alphanummérique + tirets et underscores (simple). Rejeter :
- Noms vides ou uniquement whitespace
- Noms commençant par `-`
- Noms contenant `/` (réservé pour les paths)
- Noms réservés : `HEAD`, `FETCH_HEAD`, etc.

## Critères d'acceptation (Given/When/Then)

### CA-branch-01 : Lister une seule branche (main)

**Given**
- L'engine est initialisé (`git init` exécuté)
- Une seule branche `main` existe
- HEAD pointe sur `main`

**When**
- L'utilisateur exécute `git branch`

**Then**
- `exitCode === 0`
- `output[0]` contient `"* main"`
- Pas d'autres branches listées

### CA-branch-02 : Lister plusieurs branches avec marqueur courant

**Given**
- L'engine est initialisé
- Trois branches existent : `main`, `feature`, `develop`
- HEAD pointe sur `feature`

**When**
- L'utilisateur exécute `git branch`

**Then**
- `exitCode === 0`
- `output` contient les trois lignes :
  - `"* feature"` (marquée)
  - `"  develop"` (non marquée)
  - `"  main"` (non marquée)

### CA-branch-03 : Créer une branche depuis HEAD

**Given**
- L'engine est initialisé
- HEAD pointe sur `main` avec un commit (hash = "abc123...")

**When**
- L'utilisateur exécute `git branch feature`

**Then**
- `exitCode === 0`
- `output === []` (succès muet)
- `refs.heads.feature === "abc123..."`
- `refs.heads.main` inchangé

### CA-branch-04 : Créer une branche sur dépôt vierge

**Given**
- L'engine est initialisé
- Aucun commit ne s'est produit
- HEAD pointe sur `main` (branche vide)

**When**
- L'utilisateur exécute `git branch feature`

**Then**
- `exitCode === 0`
- `refs.heads.feature === ""` (branche vide)
- `refs.heads.main === ""` (inchangé)

### CA-branch-05 : Créer une branche en mode HEAD détaché

**Given**
- L'engine est initialisé avec commits
- HEAD est en mode détaché (pointant sur "abc123...")

**When**
- L'utilisateur exécute `git branch feature`

**Then**
- `exitCode === 0`
- `refs.heads.feature === "abc123..."` (pointant sur le même commit que le HEAD détaché)

### CA-branch-06 : Erreur : branche déjà existante

**Given**
- L'engine est initialisé
- La branche `main` existe

**When**
- L'utilisateur exécute `git branch main`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"A branch named 'main' already exists."`
- `refs.heads` inchangé

### CA-branch-07 : Supprimer une branche avec `-d`

**Given**
- L'engine est initialisé
- Deux branches existent : `main` (courant, commit "abc123...") et `feature` (commit "abc123..." aussi)
- HEAD pointe sur `main`

**When**
- L'utilisateur exécute `git branch -d feature`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Deleted branch 'feature'"`
- `refs.heads.feature` n'existe plus
- `refs.heads.main` inchangé

### CA-branch-08 : Erreur : supprimer la branche courante

**Given**
- L'engine est initialisé
- La branche `main` existe et est courante (HEAD symbolique)

**When**
- L'utilisateur exécute `git branch -d main`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"Cannot delete the branch 'main' which you are currently on."`
- `refs.heads.main` inchangé

### CA-branch-09 : Supprimer avec `-D` (force)

**Given**
- L'engine est initialisé
- Deux branches : `main` (courant) et `feature` (différent commit ou non mergé)
- HEAD pointe sur `main`

**When**
- L'utilisateur exécute `git branch -D feature`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Deleted branch 'feature'"`
- `refs.heads.feature` n'existe plus

### CA-branch-10 : Erreur : supprimer une branche inexistante

**Given**
- L'engine est initialisé
- Aucune branche `nonexistent`

**When**
- L'utilisateur exécute `git branch -d nonexistent`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"branch 'nonexistent' not found."`
- Aucune modification aux refs

### CA-branch-11 : Dépôt non initialisé

**Given**
- L'engine est en état vierge (pas d'init)

**When**
- L'utilisateur exécute `git branch`

**Then**
- `exitCode === 128`
- `errors[0]` contient `"not a git repository"`

### CA-branch-12 : Nom de branche invalide (vide)

**Given**
- L'engine est initialisé

**When**
- L'utilisateur exécute `git branch ""`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"invalid branch name"` ou similaire

## Implémentation : Points clés

1. **Listage** : Itérer sur `Object.entries(repo.refs.heads)`, comparer chaque nom à `currentBranch(repo)`, marquer avec `*` si courant
2. **Création** : Vérifier l'unicité dans `refs.heads`, puis assigner le hash de HEAD courant
3. **Suppression** : Vérifier l'unicité et que ce n'est pas la branche courante, puis `delete refs.heads[name]`
4. **Validation de nom** : Utiliser une fonction helper `isValidBranchName(name: string): boolean`
5. **Sortie de suppression** : Récupérer le shortHash du commit avant la suppression pour l'inclure dans le message

## Dépendances inter-commandes

- **`git branch`** dépend de `git init` (dépôt initialisé)
- **`git branch`** peut interagir avec `git checkout` (Phase 2 : sélectionner une branche créée)
- **`git branch -d`** peut interagir avec merge (Phase 4 : check du merge status)

