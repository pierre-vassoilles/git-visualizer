# Phase 2 : git checkout

## Résumé

La commande `git checkout` bascule HEAD vers une branche existante, un commit spécifique (HEAD détaché), ou crée et bascule vers une nouvelle branche. Elle met à jour l'index et le working tree pour refléter l'arbre du commit cible.

Variantes :
- `git checkout <branchname>` : bascule HEAD vers une branche
- `git checkout -b <branchname>` : crée et bascule vers une nouvelle branche
- `git checkout <commit>` : détache HEAD sur un commit spécifique
- `git checkout -` : revient à la branche précédente
- `git checkout --detach <commit>` : détache HEAD de manière explicite

## Syntaxe

```
git checkout [options] [<tree-ish>]
```

### Options supportées en Phase 2

| Option | Argument | Comportement | Notes |
|--------|----------|-------------|-------|
| (aucun) | `<branchname>` | Bascule vers une branche existante | |
| (aucun) | `<commit>` | Détache HEAD sur ce commit | Hash court ou complet |
| `-b` | `<branchname>` | Crée et bascule vers une nouvelle branche | Depuis HEAD courant |
| `-` | (aucun) | Revient à la branche précédente | Idem `git checkout -` |
| `--detach` | `<commit>` | Détache HEAD de manière explicite | Variante de `git checkout <commit>` |

**Remarque** : Les flags `-p`, `--patch`, `-f`, `--force`, `--orphan`, `-t`, `--track`, etc. ne sont pas implémentés en Phase 2.

## Comportement nominal

### Cas 1 : Basculer vers une branche existante (`git checkout <branchname>`)

**Condition** : `<branchname>` existe dans `refs/heads/`.

**Processus** :
1. Vérifier que le working tree est « propre » (pas de changements locaux non stagés qui seraient écrasés par le changement de HEAD)
2. Récupérer le hash du commit pointé par la branche
3. Mettre à jour HEAD :
   - `HEAD.symbolic = true`
   - `HEAD.target = "refs/heads/<branchname>"`
4. Sauvegarder l'ancienne branche dans `prevBranch` (pour `checkout -`)
5. Mettre à jour l'index avec l'arbre du nouveau commit
6. Mettre à jour le working tree avec l'arbre du nouveau commit
7. **Sortie** : `Switched to branch '<branchname>'`
8. **Code de sortie** : 0

**Cas particulier** : Si HEAD est détaché (`HEAD.symbolic === false`), alors :
- Ancienne branche = valeur de `prevBranch` (si non-null) sinon pas de "previous branch"
- Mettre à jour `prevBranch = <branchname>` après le switch

**Cas particulier** : Si on est déjà sur la branche, l'opération est silencieuse mais sans erreur (idempotent).

### Cas 2 : Créer et basculer vers une branche (`git checkout -b <branchname>`)

**Condition** : Flag `-b` et un nom de branche qui n'existe pas.

**Processus** :
1. Créer la branche (comme `git branch <branchname>` depuis HEAD courant)
2. Basculer vers la branche (comme le Cas 1)
3. **Sortie** : `Switched to a new branch '<branchname>'`
4. **Code de sortie** : 0

### Cas 3 : Détacher HEAD sur un commit (`git checkout <commit>`)

**Condition** : `<commit>` est un hash (court ou complet) ou ne correspond pas à un nom de branche.

**Processus** :
1. Vérifier que le working tree est propre
2. Vérifier que `<commit>` existe dans `objects`
3. Mettre à jour HEAD :
   - `HEAD.symbolic = false`
   - `HEAD.target = <full_hash>`
4. Sauvegarder l'ancienne branche courante dans `prevBranch` (si HEAD était symbolique)
5. Mettre à jour l'index avec l'arbre du commit
6. Mettre à jour le working tree
7. **Sortie** :
   ```
   Note: switching to '<short_hash>'.
   
   You are in 'detached HEAD' state. You can look around, make experimental
   changes and commit them, and you can discard any commits you make in this
   state without impacting any branches by switching back to a branch.
   
   If you want to create a new branch to retain commits you create, you may
   do so (now or later) with -b flag with the switch command. Example:
   
     git switch -c <new-branch-name>
   
   HEAD is now at <short_hash> <commit_message>
   ```
8. **Code de sortie** : 0

(On peut simplifier l'output en Phase 2 : juste `"Note: switching to '<short_hash>'."` + le dernier message de position.)

### Cas 4 : Revenir à la branche précédente (`git checkout -`)

**Condition** : Flag `-` seul (pas d'argument supplémentaire).

**Processus** :
1. Récupérer `prevBranch` depuis le dépôt
2. Si `prevBranch === null` ou n'existe pas, erreur (voir cas d'erreur)
3. Sinon, basculer vers la branche `prevBranch` (comme le Cas 1)
4. **Sortie** : `Switched to branch '<prevBranch>'`
5. **Code de sortie** : 0

### Cas 5 : Détacher de manière explicite (`git checkout --detach <commit>`)

**Condition** : Flag `--detach` et un argument `<commit>`.

**Processus** : Identique au Cas 3 (détacher HEAD).

## Impact sur l'index et le working tree

### Règle générale

Quand on change HEAD vers un commit différent :
- **Index** : restauré avec l'arbre du nouveau commit
- **Working tree** : restauré avec l'arbre du nouveau commit
- **Fichiers supprimés** : Si un fichier existait dans l'ancien tree mais pas dans le nouveau, il est supprimé du working tree
- **Fichiers créés** : Si un fichier existe dans le nouveau tree mais pas dans l'ancien, il est créé
- **Fichiers modifiés** : Remplaced avec le contenu du nouveau tree

### Sécurité : « Changements locaux seraient écrasés »

Avant de changer HEAD, vérifier que les modifications locales ne seraient pas écrasées :

**Condition pour refuser** :
1. Il existe un fichier `F` dans le working tree avec des modifications non stagées (différent de l'index)
2. Le nouveau commit cible a un arbre différent pour `F`
3. Le contenu du working tree de `F` est différent du contenu du nouveau tree

**Message d'erreur** :
```
error: Your local changes to the following files would be overwritten by checkout:
	<file1>
	<file2>
Please commit your changes or stash them before you switch branches.
```

**Code de sortie** : 1

**Comportement** : Aucune modification à HEAD, l'index, ou le working tree.

### Cas particulier : Fichiers stagés

Si un fichier est dans l'index (stagé) mais le working tree est propre (fichier non modifié depuis le stage), on **peut** le changer car le working tree n'a pas de modifications non stagées.

## Cas d'erreur

### Branche inexistante

**Condition** : Appeler `git checkout <branchname>` où `<branchname>` n'existe pas dans `refs/heads/` et n'est pas un commit.

**Message d'erreur** :
```
error: pathspec '<branchname>' did not match any file(s) known to git
```

ou

```
fatal: reference is not a tree: '<branchname>'
```

**Code de sortie** : 1

**Comportement** : Aucune modification à HEAD.

### Commit inexistant

**Condition** : Appeler `git checkout <commit>` où `<commit>` n'existe pas dans `objects`.

**Message d'erreur** :
```
fatal: reference is not a tree: '<commit>'
```

**Code de sortie** : 1

**Comportement** : Aucune modification à HEAD.

### Changements locaux écrasés (décrit ci-dessus dans Impact)

**Condition** : Voir section "Sécurité" ci-dessus.

**Message d'erreur** : Afficher les fichiers qui seraient écrasés.

**Code de sortie** : 1

### `-b` avec branche existante

**Condition** : Appeler `git checkout -b <branchname>` où `<branchname>` existe déjà.

**Message d'erreur** :
```
fatal: A branch named '<branchname>' already exists.
```

**Code de sortie** : 1

**Comportement** : Aucune modification à HEAD ou refs.

### Pas de branche précédente (`git checkout -`)

**Condition** : Appeler `git checkout -` alors que `prevBranch === null` (jamais eu de branche précédente).

**Message d'erreur** :
```
error: You are not currently on a branch.
```

ou

```
fatal: no previous branch to checkout
```

**Code de sortie** : 1

**Comportement** : Aucune modification.

### Dépôt non initialisé

**Condition** : Appeler `git checkout` sans avoir appelé `git init`.

**Message d'erreur** :
```
fatal: not a git repository (or any of the parent directories): .git
```

**Code de sortie** : 128

## Critères d'acceptation (Given/When/Then)

### CA-checkout-01 : Basculer vers une branche existante

**Given**
- L'engine est initialisé avec deux commits sur `main`
- La branche `feature` existe et pointe sur le deuxième commit
- HEAD pointe sur `main`
- Index et working tree sont syncés avec le tree de HEAD

**When**
- L'utilisateur exécute `git checkout feature`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Switched to branch 'feature'"`
- `HEAD.symbolic === true`
- `HEAD.target === "refs/heads/feature"`
- `prevBranch === "main"`
- `index` contient l'arbre du commit de `feature`
- `workingTree` reflète l'arbre de `feature`

### CA-checkout-02 : Créer et basculer avec `-b`

**Given**
- L'engine est initialisé sur `main` avec commits
- Aucune branche `newbranch` n'existe

**When**
- L'utilisateur exécute `git checkout -b newbranch`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Switched to a new branch 'newbranch'"`
- `refs.heads.newbranch` existe et pointe sur le même commit que `main`
- `HEAD.symbolic === true`
- `HEAD.target === "refs/heads/newbranch"`

### CA-checkout-03 : Détacher HEAD sur un commit

**Given**
- L'engine est initialisé avec 3 commits (hashes : c1, c2, c3)
- HEAD pointe sur `main` (c3)
- Aucune modification locale

**When**
- L'utilisateur exécute `git checkout c2` (hash court ou complet)

**Then**
- `exitCode === 0`
- `output` contient `"Note: switching to"`
- `HEAD.symbolic === false`
- `HEAD.target === c2` (ou hash complet)
- `prevBranch === "main"` (branche d'avant)
- `index` contient l'arbre du commit c2
- `workingTree` reflète l'arbre de c2

### CA-checkout-04 : Revenir à la branche précédente

**Given**
- L'engine a changé de `main` vers `feature`, puis vers HEAD détaché
- `prevBranch === "feature"` (ou pas à jour, voir note Phase 2)
- HEAD est détaché

**When**
- L'utilisateur exécute `git checkout -`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Switched to branch 'feature'"`
- `HEAD.symbolic === true`
- `HEAD.target === "refs/heads/feature"`

### CA-checkout-05 : Erreur : branche inexistante

**Given**
- L'engine est initialisé
- Aucune branche `nosuchbranch`

**When**
- L'utilisateur exécute `git checkout nosuchbranch`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"did not match any file"` ou `"is not a tree"`
- `HEAD` inchangé

### CA-checkout-06 : Erreur : changements locaux écrasés

**Given**
- L'engine a deux branches : `main` et `feature` avec arbres différents
- HEAD pointe sur `main`
- Un fichier `file.txt` a été modifié dans le working tree (différent de l'index et de HEAD)

**When**
- L'utilisateur exécute `git checkout feature`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"Your local changes"` et mentionne `file.txt`
- `HEAD` inchangé
- `workingTree` inchangé

### CA-checkout-07 : Erreur : `-b` avec branche existante

**Given**
- L'engine est initialisé
- La branche `main` existe

**When**
- L'utilisateur exécute `git checkout -b main`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"A branch named 'main' already exists."`
- `HEAD` inchangé

### CA-checkout-08 : Erreur : pas de branche précédente

**Given**
- L'engine est initialisé pour la première fois
- `prevBranch === null`

**When**
- L'utilisateur exécute `git checkout -`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"no previous branch"` ou similaire

### CA-checkout-09 : Basculer vers la même branche (idempotent)

**Given**
- HEAD pointe sur `main`

**When**
- L'utilisateur exécute `git checkout main`

**Then**
- `exitCode === 0`
- `output` peut être vide ou une confirmation silencieuse
- `HEAD` inchangé
- `prevBranch` inchangé

### CA-checkout-10 : Détacher HEAD depuis une branche, puis basculer vers une autre

**Given**
- HEAD est détaché sur un commit (c2)
- `prevBranch === "main"`
- La branche `feature` existe

**When**
- L'utilisateur exécute `git checkout feature`

**Then**
- `exitCode === 0`
- `HEAD.symbolic === true`
- `HEAD.target === "refs/heads/feature"`
- `prevBranch === "feature"` (ancienne branche courant était feature? non, était main en-avant)
- (Note : gestion de prevBranch en mode détaché à clarifier — voir Phase 2 note ci-dessous)

### CA-checkout-11 : --detach explicite

**Given**
- L'engine a des commits avec le hash c2
- HEAD pointe sur `main`

**When**
- L'utilisateur exécute `git checkout --detach c2`

**Then**
- `exitCode === 0`
- `HEAD.symbolic === false`
- `HEAD.target === c2`

## Notes Phase 2

### Gestion de prevBranch en mode détaché

En Phase 2, `prevBranch` est utilisé pour `checkout -`. Le comportement exact en mode détaché est à clarifier :

**Option A** : `prevBranch` reste la dernière branche symbolique connue (même en mode détaché)
```
git checkout main      # prevBranch = null ou "main"
git checkout abc123    # HEAD détaché, prevBranch = "main" (conservé)
git checkout -         # revient à main
```

**Option B** : `prevBranch` est null en mode détaché
```
git checkout main      # prevBranch = null ou "main"
git checkout abc123    # HEAD détaché, prevBranch = null
git checkout -         # erreur : "no previous branch"
```

**Phase 2 Recommandation** : Implémenter Option A (conserve prevBranch). Plus intuitive.

### Détection de « branche vide »

Si HEAD pointe sur une branche vide (pas encore de commit), `git checkout <branch>` doit quand même fonctionner — elle bascule simplement la branche, laissant l'index/working tree inchangés (ou vides selon le cas).

### Fusion de changements stagés

En Phase 2, l'index est un snapshot complet aligné sur HEAD. Lors d'un changement de HEAD, l'index est remplacé intégralement. Si l'utilisateur a des changements stagés, ils sont perdus silencieusement (ou un avertissement peut être affiché, mais c'est de la subtilité Phase 4+).

## Implémentation : Points clés

1. **Vérifier working tree propre** : Créer une fonction `canCheckoutWithoutDataLoss(repo, targetCommitHash)` qui compare l'arbre cible avec l'arbre courant
2. **Déterminer branchname ou commit** : Parser l'argument pour déterminer si c'est un nom de branche ou un hash
3. **Mettre à jour HEAD** : Assigner `HEAD.symbolic` et `HEAD.target` correctement
4. **Gérer prevBranch** : Sauvegarder l'ancienne branche avant le changement
5. **Restaurer index et working tree** : Appeler `flattenTree` et reconstruire workingTree/index depuis l'arbre du nouveau commit
6. **Messages** : Adapter l'output en fonction du type de changement (branche, détaché, erreur)

## Dépendances inter-commandes

- **`git checkout`** dépend de `git init` (dépôt initialisé)
- **`git checkout`** dépend de `git branch` (branches doivent exister)
- **`git checkout <commit>`** dépend de commits existants (Phase 1)
- **`git checkout <pathspec>`** : **Hors scope Phase 2**. C'est une variante qui restaure les fichiers depuis HEAD ou l'index — elle est couverte par `git restore` (Phase 2, commande séparée)

