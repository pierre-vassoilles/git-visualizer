# Guide d'utilisation - Git Visualizer (Phase 1)

## À quoi sert cet outil ?

Git Visualizer est un terminal web qui réimplémente les fonctionnalités Git essentielles en TypeScript. Il permet de créer un dépôt Git, d'ajouter des fichiers, de consulter l'état du dépôt, et de visualiser l'historique des commits.

**Important :** Il n'existe pas de vrai système de fichiers. Pour créer et modifier des fichiers dans le working tree (espace de travail virtuel), utilisez les commandes utilitaires `write` et `read` décrites ci-après.

---

## Commandes disponibles en Phase 1

### Utilitaires du working tree (non-Git)

Ces commandes permettent de gérer les fichiers virtuels. Elles ne font pas partie du standard Git, mais sont essentielles pour tester les fonctionnalités.

#### `write` — Créer ou modifier un fichier

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `write <chemin> [contenu]` |
| **Description** | Crée ou remplace un fichier dans le working tree |
| **Options** | Aucune |

**Exemples :**

```bash
# Créer un fichier avec contenu
write README.md "# Mon Projet"

# Créer un fichier vide
write notes.txt

# Créer un fichier dans un sous-dossier (crée les dossiers automatiquement)
write src/main.ts "console.log('Hello')"
```

**Code de sortie :** 0 (succès) | 1 (chemin invalide)

---

#### `read` — Afficher le contenu d'un fichier

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `read <chemin>` |
| **Description** | Affiche le contenu d'un fichier du working tree |
| **Options** | Aucune |

**Exemples :**

```bash
read README.md
# Affiche le contenu du fichier
```

**Code de sortie :** 0 (succès) | 1 (fichier non trouvé)

---

### Commandes Git

#### `git init` — Initialiser un dépôt

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git init` |
| **Description** | Initialise un dépôt Git vierge avec une branche `main` |
| **Options** | Aucune en Phase 1 |

**Exemple :**

```bash
git init
# Initialized empty Git repository in ./.git/
```

**Code de sortie :** 0 (succès ou dépôt déjà initialisé)

---

#### `git add` — Stager des fichiers

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git add <chemin...>` ou `git add .` |
| **Description** | Enregistre les fichiers du working tree dans l'index (staging area) en vue du prochain commit |
| **Options** | Aucune en Phase 1 |

**Exemples :**

```bash
# Ajouter un fichier spécifique
git add README.md

# Ajouter plusieurs fichiers
git add file1.txt file2.txt src/main.ts

# Ajouter tous les fichiers
git add .
```

**Comportement :**
- Calcule le hash SHA-1 de chaque fichier
- Stocke l'entrée dans l'index (index vide après init)
- Pas de sortie en cas de succès

**Code de sortie :** 0 (succès) | 1 (fichier non trouvé) | 128 (dépôt non initialisé)

---

#### `git status` — Afficher l'état du dépôt

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git status [options]` |
| **Description** | Affiche l'état du dépôt : fichiers stagés, modifiés, non-trackés |
| **Options** | `-s` ou `--short` (affichage compact, optionnel en Phase 1) |

**Exemples :**

```bash
# Affichage long (verbose)
git status

# Affichage court
git status -s
```

**Format long :**

```
On branch main

No commits yet

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        file1.txt

nothing added to commit but untracked files present (use "git add" to track)
```

Ou (après des commits) :

```
On branch main

Changes to be committed:
  (use "git commit" to finalize)
        new file:   newfile.txt

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
        modified:   existing.txt

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        untracked.txt
```

**Format court (`-s`) :**

```
?? untracked.txt
A  staged.txt
M  modified.txt
```

| Code | Sens |
|------|------|
| `??` | Non-tracké |
| `A ` | Ajouté (new file, stagé) |
| `M ` | Modifié (stagé) |
| ` M` | Modifié (non-stagé) |
| `D ` | Supprimé (stagé) |
| ` D` | Supprimé (non-stagé) |

**Code de sortie :** 0 (quel que soit l'état)

---

#### `git commit` — Créer un commit

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git commit -m "<message>"` |
| **Description** | Crée un commit à partir du contenu de l'index (staging area) |
| **Options** | `-m <message>` (obligatoire en Phase 1) |

**Exemple :**

```bash
git commit -m "Initial commit"
# [main (root-commit) abc1234] Initial commit
```

**Comportement :**
1. Crée un arbre (tree) représentant l'état de tous les fichiers stagés
2. Crée un commit pointant vers ce tree avec le message fourni
3. Met à jour la branche courante (main) pour pointer vers ce nouveau commit
4. Vide l'index

**Code de sortie :** 0 (succès) | 1 (index vide, message vide, etc.) | 128 (dépôt non initialisé)

---

#### `git log` — Afficher l'historique des commits

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git log [options]` |
| **Description** | Affiche l'historique des commits en remontant de HEAD à la racine |
| **Options** | `--oneline` (affichage court, optionnel) ; `--graph` (graphique ASCII, optionnel) |

**Exemples :**

```bash
# Affichage long
git log

# Affichage court (une ligne par commit)
git log --oneline
```

**Format long :**

```
commit abc1234567890def1234567890def1234567890
Author: Unnamed <unnamed@example.com>
Date:   Mon Jun 9 12:00:00 2025 +0000

    Message du commit

commit def1234567890abc1234567890abc1234567890
Author: Unnamed <unnamed@example.com>
Date:   Mon Jun 9 11:59:59 2025 +0000

    Deuxième commit
```

**Format `--oneline` :**

```
abc1234 Message du commit
def4567 Deuxième commit
```

**Code de sortie :** 0 (succès) | 1 (aucun commit) | 128 (dépôt non initialisé)

---

## Scénario complet de bout en bout

Voici une session d'utilisation typique montrant toutes les commandes en action :

```bash
# 1. Initialiser le dépôt
$ git init
Initialized empty Git repository in ./.git/

# 2. Créer un fichier
$ write README.md "# Git Visualizer\n\nUn terminal web pour Git"

# 3. Vérifier l'état du dépôt (fichier non-tracké)
$ git status
On branch main

No commits yet

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        README.md

nothing added to commit but untracked files present (use "git add" to track)

# 4. Créer un deuxième fichier
$ write package.json "{}"

# 5. Ajouter les deux fichiers à l'index
$ git add .

# 6. Vérifier l'état (fichiers stagés)
$ git status
On branch main

No commits yet

Changes to be committed:
  (use "git commit" to finalize)
        new file:   README.md
        new file:   package.json

# 7. Créer le premier commit
$ git commit -m "Initial commit"
[main (root-commit) 7f3e2d1] Initial commit

# 8. Afficher l'historique
$ git log --oneline
7f3e2d1 Initial commit

# 9. Créer un nouveau fichier et l'ajouter
$ write src/index.ts "console.log('Hello');"
$ git add src/index.ts

# 10. Vérifier l'état (nouveau fichier stagé)
$ git status
On branch main

Changes to be committed:
  (use "git commit" to finalize)
        new file:   src/index.ts

nothing added to commit but untracked files present (use "git add" to track)

# 11. Créer un deuxième commit
$ git commit -m "Add source file"
[main 9a5c8e4] Add source file

# 12. Afficher l'historique complet
$ git log --oneline
9a5c8e4 Add source file
7f3e2d1 Initial commit

# 13. Lire le contenu d'un fichier
$ read README.md
# Git Visualizer

Un terminal web pour Git
```

---

## Erreurs courantes et dépannage

### Dépôt non initialisé
```
fatal: not a git repository (or any of the parent directories): .git
```
**Solution :** Exécutez `git init` en premier.

### Pathspec non trouvé
```
fatal: pathspec 'filename.txt' did not match any files
```
**Solution :** Vérifiez l'orthographe du chemin. Créez le fichier avec `write` avant d'utiliser `git add`.

### Rien à committer
```
fatal: no changes added to commit
```
**Solution :** Utilisez `git add` pour stager des fichiers avant `git commit`.

### Message vide ou manquant
```
fatal: option '-m' is required
fatal: message cannot be empty
```
**Solution :** Fournissez `-m "<message>"` avec un message non-vide.

### Aucun commit dans l'historique
```
fatal: No commits yet
```
**Solution :** Créez au moins un commit avec `git add` + `git commit -m "..."`.

---

## Commandes disponibles en Phase 2

### Gestion des branches

#### `git branch` — Lister, créer ou supprimer des branches

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git branch [options] [branchname]` |
| **Description** | Gère les branches du dépôt : liste, crée ou supprime |
| **Options** | Aucun argument : liste les branches ; `<branchname>` : crée ; `-d <branchname>` : supprime (safe) ; `-D <branchname>` : supprime (force) |

**Exemples :**

```bash
# Lister toutes les branches
git branch

# Créer une nouvelle branche depuis HEAD
git branch feature

# Supprimer une branche
git branch -d feature

# Supprimer une branche (force)
git branch -D feature
```

**Comportement :**
- **Lister** : Affiche toutes les branches, en marquant la courante avec `*`
- **Créer** : Crée une nouvelle branche pointant vers le commit HEAD courant ; erreur si la branche existe déjà
- **Supprimer (-d)** : Supprime la branche si elle n'est pas la branche courante ; erreur si elle est courante
- **Supprimer (-D)** : Force la suppression (même si branche courante)

**Code de sortie :** 0 (succès) | 1 (erreur) | 128 (dépôt non initialisé)

---

#### `git checkout` — Changer de branche ou détacher HEAD

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git checkout [options] <branchname \| commit>` |
| **Description** | Bascule HEAD vers une branche, crée et bascule, ou détache HEAD sur un commit |
| **Options** | Aucun argument : bascule vers une branche existante ; `-b <branchname>` : crée et bascule ; `-` : revient à la branche précédente ; `--detach` : détache HEAD (variante) |

**Exemples :**

```bash
# Basculer vers une branche existante
git checkout feature

# Créer et basculer vers une nouvelle branche
git checkout -b develop

# Détacher HEAD sur un commit spécifique
git checkout abc1234

# Revenir à la branche précédente
git checkout -

# Détacher HEAD de manière explicite
git checkout --detach abc1234
```

**Comportement :**
- **Basculer vers branche** : Met à jour HEAD, l'index et le working tree
- **Créer et basculer (-b)** : Crée la branche comme `git branch`, puis bascule dessus
- **Détacher HEAD** : Passe HEAD en mode détaché (pointe directement sur le commit)
- **Revenir (-)** : Bascule vers la branche précédemment active

**Code de sortie :** 0 (succès) | 1 (erreur) | 128 (dépôt non initialisé)

---

#### `git switch` — Changer de branche (variante moderne de checkout)

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git switch [options] <branchname>` |
| **Description** | Alternative plus claire et explicite à `checkout` pour basculer entre branches |
| **Options** | Aucun argument : bascule vers une branche existante ; `-c <branchname>` : crée et bascule ; `-` : revient à la branche précédente ; `--detach <commit>` : détache HEAD |

**Exemples :**

```bash
# Basculer vers une branche existante
git switch feature

# Créer et basculer vers une nouvelle branche
git switch -c develop

# Détacher HEAD sur un commit
git switch --detach abc1234

# Revenir à la branche précédente
git switch -
```

**Comportement :**
- Équivalent à `git checkout`, mais avec des messages plus explicites
- **-c** : Crée et bascule (équivalent à `checkout -b`)
- **--detach** : Détache HEAD sur un commit

**Code de sortie :** 0 (succès) | 1 (erreur) | 128 (dépôt non initialisé)

---

#### `git restore` — Restaurer des fichiers

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git restore [options] <pathspec...>` |
| **Description** | Restaure les fichiers du working tree ou de l'index en les obtenant d'une source |
| **Options** | Aucun : restaure depuis l'index ; `--staged` : retire du staging (index ← HEAD) ; `--source=<commit>` : restaure depuis un commit spécifié |

**Exemples :**

```bash
# Restaurer un fichier depuis l'index (annuler les modifications)
git restore file.txt

# Restaurer tous les fichiers depuis l'index
git restore .

# Retirer un fichier du staging
git restore --staged file.txt

# Restaurer un fichier depuis un commit spécifique
git restore --source=abc1234 file.txt
```

**Comportement :**
- **Restore (défaut)** : Écrase le working tree avec le contenu de l'index
- **Restore --staged** : Remplace l'index avec le contenu de HEAD (retire du staging)
- **Restore --source** : Restaure depuis un commit spécifié

**Code de sortie :** 0 (succès) | 1 (erreur) | 128 (dépôt non initialisé)

---

### Gestion des tags (étiquettes)

#### `git tag` — Lister, créer ou supprimer des tags

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git tag [options] [tagname [commit]]` |
| **Description** | Gère les étiquettes nommées (tags) du dépôt |
| **Options** | Aucun argument : liste les tags ; `<tagname>` : crée un tag sur HEAD ; `<tagname> <commit>` : crée sur un commit spécifié ; `-d <tagname>` : supprime un tag |

**Exemples :**

```bash
# Lister tous les tags
git tag

# Créer un tag sur HEAD
git tag v1.0

# Créer un tag sur un commit spécifique
git tag v1.0 abc1234

# Supprimer un tag
git tag -d v1.0
```

**Comportement :**
- **Lister** : Affiche tous les tags en ordre alphabétique
- **Créer** : Crée une étiquette légère pointant vers le commit spécifié (ou HEAD)
- **Supprimer** : Supprime l'étiquette du dépôt

**Code de sortie :** 0 (succès) | 1 (erreur) | 128 (dépôt non initialisé)

---

## État détaché de HEAD (Detached HEAD)

Quand vous exécutez `git checkout <commit>` (avec un hash de commit), HEAD entre en **mode détaché**. Cela signifie que HEAD pointe directement sur un commit, au lieu de pointer sur une branche.

### Comprendre le mode détaché

En mode normal, HEAD pointe sur une branche (ex. `main`), et la branche pointe sur un commit :
```
HEAD → refs/heads/main → commit abc123
```

En mode détaché, HEAD pointe directement sur le commit :
```
HEAD → commit abc123
```

### Comment accéder à l'état détaché

```bash
# Récupérer le hash court ou complet d'un commit (via git log)
$ git log --oneline
abc1234 Message du dernier commit

# Détacher HEAD sur un commit ancien
$ git checkout abc1234
Note: switching to 'abc1234'.
You are in 'detached HEAD' state. You can look around, make experimental
changes and commit them, and you can discard any commits you make in this
state without impacting any branches by switching back to a branch.

HEAD is now at abc1234 Message du commit
```

### Ce que Git affiche

Quand vous êtes en mode détaché, `git status` affiche :

```
HEAD detached at abc1234
```

Au lieu du message normal :

```
On branch main
```

### Comment sortir du mode détaché

Pour sortir du mode détaché, basculez vers une branche existante :

```bash
# Revenir à la branche main
$ git checkout main
Switched to branch 'main'

# Ou revenir à la branche précédente
$ git checkout -
```

### Cas particulier : commits en mode détaché

Si vous créez des commits alors que HEAD est détaché, ces commits restent "orphelins" (pas liés à une branche). Vous pouvez :
- Créer une branche pour les conserver : `git checkout -b new-branch`
- Les abandonner en basculant vers une autre branche

---

## Scénario complet : Workflow de branche

Voici une session illustrant un workflow de branche réaliste, du début à la fin :

```bash
# 1. Initialiser le dépôt et créer un commit initial
$ git init
Initialized empty Git repository in ./.git/

$ write README.md "# Projet Git Visualizer"
$ git add README.md
$ git commit -m "Initial commit"
[main (root-commit) 7f3e2d1] Initial commit

# 2. Lister les branches (seule main existe)
$ git branch
* main

# 3. Créer deux commits sur main
$ write src/main.ts "console.log('Main branch');"
$ git add src/main.ts
$ git commit -m "Add main.ts on main"
[main 9a5c8e4] Add main.ts on main

$ write docs/guide.md "# Guide d'utilisation"
$ git add docs/guide.md
$ git commit -m "Add guide"
[main 8e2f1b3] Add guide

# 4. Vérifier l'historique
$ git log --oneline
8e2f1b3 Add guide
9a5c8e4 Add main.ts on main
7f3e2d1 Initial commit

# 5. Créer une nouvelle branche feature
$ git branch feature
$ git branch
  feature
* main

# 6. Basculer vers la branche feature
$ git checkout feature
Switched to branch 'feature'

# 7. Créer un commit sur feature
$ write src/feature.ts "console.log('Feature branch');"
$ git add src/feature.ts
$ git commit -m "Add feature.ts on feature branch"
[feature a7c2e5d] Add feature.ts on feature branch

# 8. Afficher l'historique de feature
$ git log --oneline
a7c2e5d Add feature.ts on feature branch
8e2f1b3 Add guide
9a5c8e4 Add main.ts on main
7f3e2d1 Initial commit

# 9. Revenir à main
$ git checkout main
Switched to branch 'main'

# 10. Vérifier l'historique de main (feature.ts n'existe pas)
$ git log --oneline
8e2f1b3 Add guide
9a5c8e4 Add main.ts on main
7f3e2d1 Initial commit

# 11. Lister les fichiers sur main (feature.ts absent)
$ read src/feature.ts
fatal: no such file

# 12. Poser un tag sur le commit courant (main)
$ git tag v1.0
$ git tag
v1.0

# 13. Revenir à feature via git switch (alternative à checkout)
$ git switch feature
Switched to branch 'feature'

# 14. Poser un tag sur feature
$ git tag v1.1

# 15. Lister tous les tags
$ git tag
v1.0
v1.1

# 16. Détacher HEAD sur le commit initial
$ git log --oneline
a7c2e5d Add feature.ts on feature branch
8e2f1b3 Add guide
9a5c8e4 Add main.ts on main
7f3e2d1 Initial commit

$ git checkout 7f3e2d1
Note: switching to '7f3e2d1'.
You are in 'detached HEAD' state.

HEAD is now at 7f3e2d1 Initial commit

# 17. Vérifier l'état
$ git status
HEAD detached at 7f3e2d1

# 18. Revenir à la branche précédente (feature)
$ git checkout -
Switched to branch 'feature'
```

---

## Visualisation graphique (Phase 3)

### Comprendre le graphe

La visualisation graphique affiche vos commits sous forme d'un **arbre** où vous pouvez voir comment votre dépôt a évolué : les branches, les points de divergence, et où pointe HEAD.

#### Structure du graphe

Le graphe se lit de haut en bas :

- **Haut = commits récents**
- **Bas = commit initial (racine)**
- **Chaque colonne = une branche** : Git Visualizer assigne une colonne (lane) à chaque branche pour la garder visuellement cohérente
- **Couleurs** : chaque branche a sa propre couleur pour la distinguer rapidement
- **Nœuds** : les cercles de couleur représentent les commits
- **Lignes** : les arêtes relient les parents aux enfants

#### Exemples de lecture

**Cas 1 : Historique linéaire**

```
(récent) ● Commit 3
         |
         ● Commit 2
         |
         ● Commit 1
(ancien) |
```

Tous les commits sont sur la même colonne, une seule branche (`main` généralement).

**Cas 2 : Branches divergentes**

```
(récent) ● Commit D (feature)      ● Commit C (main)
         |                         |
         ● Commit B (feature)      |
         |                         |
         +----→ Commit A (merge point)
(ancien) 
```

La `main` est à gauche, `feature` à droite. Ils divergent du commit A. Les deux branches évoluent indépendamment jusqu'à un possible merge.

**Cas 3 : HEAD détaché**

```
● Commit 3 [main]
|
● Commit 2 [HEAD (détaché)]  ← Vous êtes ici
|
● Commit 1 [feature]
```

Un badge spécial "HEAD (détaché)" indique que HEAD pointe directement sur un commit, au lieu de pointer une branche.

#### Badges et libellés

Chaque commit affiche des informations :

- **Hash court** : les 7 premiers caractères du SHA-1 (ex. `abc1234`)
- **Message** : la première ligne du message du commit
- **Badge HEAD** : rectangle blanc avec "HEAD" si HEAD pointe ce commit
- **Badges de branches** : rectangles bleus avec les noms des branches pointant ce commit (ex. `main`, `feature`)
- **Badges de tags** : rectangles jaunes avec les noms des tags (étiquettes) pointant ce commit

**Exemple de badges sur un commit :**

```
┌─ HEAD (badge blanc)
│  ┌─ main (badge bleu)
│  │  ┌─ v1.0 (badge jaune)
│  │  │
│  ○──┴──  abc1234
     Add feature
```

Si un commit a plusieurs branches, les badges s'empilent verticalement.

#### Distinction HEAD attaché vs détaché

- **HEAD attaché** : HEAD pointe une branche (comportement normal). Badge "HEAD" sur le commit pointé par la branche courante.
- **HEAD détaché** : HEAD pointe directement un commit, sans branche. Badge "HEAD (détaché)" sur ce commit (optionnel : peut afficher le hash court), et le commit a une surbrillance visuelle (ex. bordure rouge).

Pour sortir du mode détaché, basculez vers une branche : `git checkout main`.

### Interactions avec le graphe

Le graphe est interactif pour explorer votre historique.

#### Survol (hover)

En plaçant votre souris sur un nœud (commit) :

- Le nœud **s'éclaircit** et son contour épaissit
- Une **tooltip** apparaît avec :
  - **Hash complet** du commit (40 caractères)
  - **Message complet** du commit
  - **Hashes des parents** (si le commit a plusieurs parents, ex. merge)

Déplacez votre souris pour voir la tooltip suivre.

#### Clic (sélection)

En cliquant sur un nœud :

- Le nœud devient **sélectionné** (surbrillance visuelle distincte, bordure noire/épaisse)
- Un deuxième click désélectionne

Cela peut servir à focaliser sur un commit particulier.

#### Pan (déplacement du graphe)

Si le graphe est plus grand que votre écran :

- **Clic droit + drag** : déplace le graphe entier pour voir d'autres zones
- **Déplacement fluid** : le graphe suit votre souris

#### Zoom

Utilisez la **molette de la souris** :

- **Scroll vers le haut** : zoom in (aggrandir)
- **Scroll vers le bas** : zoom out (réduire)
- **Limites** : le zoom est restreint entre 0.1x (très loin) et 5x (très proche)

À zoom très faible, les libellés de commits peuvent se chevaucher. Vous pouvez toujours survoler pour voir les détails dans la tooltip.

#### Cas typiques

**Voir tout l'historique d'un coup**

Zoom out (scroll bas) pour voir l'ensemble du dépôt en vue d'ensemble. Parfait pour comprendre la structure globale.

**Explorer un commit spécifique**

Hover sur un commit pour lire son hash et message complets. Zoom in pour mieux voir une zone densément peuplée.

**Naviguer un gros dépôt**

Clic droit + drag pour pan et explorer les zones non-visibles. Combinez avec le zoom pour naviguer librement.

### Cas limites

**Dépôt sans commit**

Si vous venez de faire `git init` sans aucun commit, le graphe affiche un placeholder : "Initialisez un dépôt pour voir le graphe."

**Dépôt vide après `git init`**

Créez au moins un commit avec `git add` + `git commit -m "..."` pour voir le graphe.

**Beaucoup de commits (>100)**

Le graphe peut être grand. Utilisez pan et zoom pour naviguer. Les performances restent bonnes (rendu SVG natif).

**Branches avec noms similaires**

Chaque branche obtient une couleur unique. Si vous avez beaucoup de branches, certaines peuvent partager une couleur dans le cycle de la palette, mais elles restent sur des colonnes distinctes.

---

## À venir en Phase 4+

Les fonctionnalités suivantes ne sont **pas disponibles en Phase 3** mais seront implémentées ultérieurement :

- **Fusion** : `git merge`, `git rebase`
- **Historique avancé** : `git log -p`, `git log --follow`, `git diff`
- **Modifications avancées** : `git reset`, `git revert`, `git cherry-pick`
- **Stash** : `git stash`
- **Rebase interactif** : `git rebase -i`
- **Reflog** : `git reflog`
- **Shell interactif** : Un shell complet avec `echo`, `cat`, `touch`, etc.

---

## Résumé

### Phases disponibles

**Phase 1 – Commandes Git essentielles :**
- `git init` — Initialiser le dépôt
- `git add <chemin...>` — Stager des fichiers
- `git status [-s]` — Afficher l'état du dépôt
- `git commit -m "<message>"` — Créer un commit
- `git log [--oneline]` — Afficher l'historique
- Utilitaires : `write` et `read` pour gérer les fichiers virtuels

**Phase 2 – Gestion des branches et tags :**
- `git branch` — Lister, créer ou supprimer des branches
- `git checkout` / `git switch` — Changer de branche ou détacher HEAD
- `git restore` — Restaurer des fichiers
- `git tag` — Créer et gérer des étiquettes

**Phase 3 – Visualisation graphique :**
- **Graphe visuel interactif** : affichage SVG de votre arbre Git
- **Lecture intuitive** : commits, branches, tags, HEAD sur un diagramme
- **Interactions** : hover (tooltip), pan (drag), zoom (scroll)
- **Badges intelligents** : affichage des branches, tags et HEAD sur chaque commit

### Workflow complet

1. Initialisez un dépôt (`git init`)
2. Créez et stagez des fichiers (`write`, `git add`)
3. Commitez (`git commit`)
4. Gérez les branches (`git branch`, `git checkout`)
5. **Visualisez votre historique en graphe** (Phase 3)

Vous pouvez explorer et maîtriser votre dépôt Git directement dans le terminal web, avec une vue d'ensemble visuelle et intuitive grâce au graphe interactif !
