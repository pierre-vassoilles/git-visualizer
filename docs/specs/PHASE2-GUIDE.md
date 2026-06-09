# Phase 2 : Guide Complet des Interactions

Ce guide synthétise les 5 commandes Phase 2, explique leurs interactions, et fournit des workflows type.

## Vue d'ensemble des commandes

| Commande | Rôle | Modifie HEAD | Modifie Index | Modifie WT |
|----------|------|-------------|----------------|-----------|
| `branch` | Gère les branche (créer, lister, supprimer) | Non | Non | Non |
| `checkout` | Bascule HEAD, met à jour l'état | Oui | Oui | Oui |
| `switch` | Variante moderne de checkout | Oui | Oui | Oui |
| `restore` | Restaure fichiers depuis une source | Non | Parfois | Oui |
| `tag` | Gère les étiquettes | Non | Non | Non |

**Légende** : WT = Working Tree

## Workflows Phase 2

### Workflow 1 : Créer et travailler sur une branche feature

```bash
git init
git add README.md && git commit -m "Initial commit"
# HEAD = refs/heads/main, commit = abc123...

git branch feature
# feature = abc123... (pointe sur le même commit que main)

git checkout feature
# HEAD = refs/heads/feature, prevBranch = "main"

git add code.ts && git commit -m "Feature impl"
# HEAD = refs/heads/feature, commit = def456...

git checkout main
# HEAD = refs/heads/main, prevBranch = "feature"

git checkout -
# HEAD = refs/heads/feature, prevBranch = "main" (retour)
```

**Concepts clés** :
- `branch` crée une ref sans changer HEAD
- `checkout` change HEAD et synchronise index + WT
- `prevBranch` permet de revenir à la branche d'avant

### Workflow 2 : HEAD détaché et navigation

```bash
git log --oneline
# abc123 Commit 1
# def456 Commit 2

git checkout abc123
# HEAD détaché, HEAD.target = "abc123", prevBranch = "main"
# Output : "Note: switching to 'abc123'..."

git checkout -b hotfix
# Crée branche hotfix depuis le commit détaché
# HEAD = refs/heads/hotfix, refs.heads.hotfix = "abc123"

git checkout -
# Retourne vers HEAD détaché ? Ou vers main ?
# Comportement Phase 2 : revient à "main" (prevBranch conservé)
```

**Concepts clés** :
- HEAD détaché est un état transitionnel
- `checkout -b` depuis HEAD détaché crée une branche sur ce commit
- `prevBranch` est conservé même en mode détaché (Option A)

### Workflow 3 : Tagging de versions stables

```bash
git add app.ts && git commit -m "v1.0"
# HEAD = refs/heads/main, commit = abc123...

git tag v1.0
# refs.tags.v1.0 = abc123...

git add features.ts && git commit -m "v1.1"
# commit = def456...

git tag v1.1 def456
# refs.tags.v1.1 = def456...

git tag
# Affiche : v1.0, v1.1 (alphabétique)

git checkout v1.0  # Checkout sur le commit taggé (HEAD détaché)
# HEAD = "abc123", prevBranch = "main"
```

**Concepts clés** :
- Tags sont immuables (pointent toujours sur le même commit)
- Tags et branches peuvent pointer sur le même commit
- Checkout d'un tag crée un HEAD détaché

### Workflow 4 : Restaurer un fichier modifié

```bash
# État initial :
# HEAD : file.txt = "original"
# Index : file.txt = "original"
# WT : file.txt = "original"

git add file.txt
# On le modifie manuellement
echo "modified" > file.txt

# État :
# HEAD : file.txt = "original"
# Index : file.txt = "original"
# WT : file.txt = "modified"

git restore file.txt
# WT : file.txt = "original" (restauré depuis l'index)

# Maintenant on stage une modification
echo "staged" > file.txt
git add file.txt

# État :
# HEAD : file.txt = "original"
# Index : file.txt = "staged"
# WT : file.txt = "staged"

git restore --staged file.txt
# Index : file.txt = "original" (depuis HEAD)
# WT : file.txt = "staged" (inchangé)

git restore file.txt
# WT : file.txt = "original" (depuis l'index mis à jour)
```

**Concepts clés** :
- `restore` sans flag : WT ← Index
- `restore --staged` : Index ← HEAD
- Combiner les deux : annule complètement les changements

### Workflow 5 : Sécurité lors du changement de branche

```bash
# État :
# main : file.txt = "main content"
# feature : file.txt = "feature content"
# HEAD pointe sur main

git add file.txt
echo "modified" > file.txt

# État :
# WT : file.txt = "modified" (différent de main, différent de feature)

git checkout feature
# ERREUR : "Your local changes to the following files would be overwritten"
# État inchangé (HEAD reste sur main)

git restore file.txt
# WT : file.txt = "main content" (depuis l'index, qui = HEAD)

git checkout feature
# SUCCÈS
```

**Concepts clés** :
- Git refuse un changement de branche si cela perdrait des données
- `restore` avant `checkout` peut résoudre le conflit

## Interactions avec Phase 1

### Compatible

- `git init` : initialise le dépôt, ajoute `refs.tags = {}` et `prevBranch = null`
- `git add`, `git commit` : fonctionnent sur la branche courante (symbolique ou détachée via HEAD)
- `git status`, `git log` : affichent l'historique depuis HEAD (indépendant du mode)

### Changements mineurs

- `git status` : message changer pour afficher "detached HEAD at abc123" au lieu de "On branch..."
- `git log` : pas de changement, affiche l'historique depuis HEAD

## Cas limites et pièges

### 1. Checkout vers une branche vide

```bash
git init
git branch empty
git checkout empty
# Index et WT restent vides (aucun commit à checkout)
# HEAD = refs/heads/empty (vide)

git add file.txt && git commit -m "First"
# refs.heads.empty = abc123...
```

**Impact** : Les branches vides sont autorisées et ne causent pas d'erreur.

### 2. Supprimer la branche courante

```bash
git branch -d main
# ERREUR : "Cannot delete the branch 'main' which you are currently on"
```

**Impact** : Invariant respecté — on ne peut pas supprimer la branche sur laquelle on est.

### 3. Supprimer une branche, puis checkout

```bash
git branch feature
git branch -d feature
git checkout feature
# ERREUR : "did not match any file"
```

**Impact** : Suppression d'une branche rend impossible le checkout sur elle (attendu).

### 4. Créer un tag, puis supprimer la branche

```bash
git tag v1.0  # v1.0 = abc123...
git branch -D main  # Si on ne cherche pas à la supprimer (erreur ci-dessus)
git tag
# v1.0 affiche toujours (tag indépendant de la branche)
```

**Impact** : Tags persistent indépendamment des branches.

### 5. prevBranch après suppression de branche

```bash
git checkout main
git checkout feature
git checkout main  # prevBranch = "feature"

git branch -d feature
git checkout -
# ERREUR : prevBranch n'existe plus

# Ou comportement : basculer quand même ? Non, erreur.
```

**Impact** : Si la branche sauvegardée dans `prevBranch` est supprimée, `checkout -` échoue (comportement Git standard).

## Messages d'erreur clés à vérifier en QA

### Branch

- `"A branch named 'X' already exists."` (créer dupliquée)
- `"branch 'X' not found."` (supprimer inexistante)
- `"Cannot delete the branch 'X' which you are currently on."` (supprimer courante)

### Checkout / Switch

- `"error: Your local changes to the following files would be overwritten by checkout:"` (sécurité)
- `"did not match any file"` ou `"is not a tree"` (branche inexistante)
- `"fatal: A branch named 'X' already exists."` (-b sur existante)
- `"no previous branch to checkout"` (checkout - sans historique)

### Restore

- `"did not match any files"` (pathspec inexistant)
- `"pathspec cannot be empty"` (aucun argument)
- `"is not a tree"` (--source inexistant)

### Tag

- `"tag 'X' already exists"` (créer dupliquée)
- `"tag 'X' not found."` (supprimer inexistante)
- `"is not a commit"` (créer sur commit inexistant)
- `"Failed to resolve 'HEAD' as a valid ref."` (créer sur HEAD vierge)

## Matrice de compatibilité : Quels states permettent quoi

| État | `git checkout <branch>` | `git checkout <commit>` | `git restore` | `git tag` |
|-----|--------|--------|---------|-----------|
| Sur une branche | ✓ | ✓ | ✓ | ✓ |
| HEAD détaché | ✓ | ✓ | ✓ | ✓ |
| Dépôt vierge (aucun commit) | ✓ (sur branche vide) | ✗ | ✓ (depuis index) | ✗ |

## Ordre de déploiement recommandé

1. **Charger les specs** : tous les fichiers 09-14 + PHASE2-SUMMARY.md
2. **Implémenter modèle** : Repository, helpers, snapshot
3. **Implémenter commandes** :
   - `branch` (la plus simple)
   - `checkout` (la plus complexe, dépend de branch)
   - `restore` (indépendante, utile pour les tests de checkout)
   - `switch` (wrapper de checkout)
   - `tag` (indépendante)
4. **Tester** : tous les critères d'acceptation de chaque spec
5. **QA** : invariants, workflows, régressions Phase 1

## Prochaines phases dépendant de Phase 2

### Phase 3 : Visualisation graphique

- Afficher les branches et tags au-dessus/côté des commits dans le DAG
- Colorer les branches différemment
- Indiquer HEAD (flèche vers la branche ou le commit détaché)

### Phase 4 : Reset et Rebase

- `git reset` : utilise les branches et HEAD pour réécrire l'historique
- `git rebase` : dépend de checkout pour naviguer entre les commits

### Phase 5 : Merge et Conflict Resolution

- `git merge` : dépend de branches multiples et de la fusion d'arbres
- Détection de conflits lors du merge

