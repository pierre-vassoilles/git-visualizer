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

## Commandes disponibles en Phase 4

### Syntaxe des révisions : `HEAD~n`

Avant de couvrir les commandes de fusion et réécriture, comprenons comment référencer des commits antérieurs à HEAD.

#### Notation `HEAD~n`

`HEAD~n` signifie "le commit n générations avant HEAD, en remontant par le 1er parent".

**Formule** :
- `HEAD~0` → HEAD (commit courant)
- `HEAD~1` → parent direct de HEAD
- `HEAD~2` → parent du parent
- `HEAD~n` → n générations en arrière

**Visuel** :
```
HEAD → C3
       ↑
       C2 (HEAD~1)
       ↑
       C1 (HEAD~2)
       ↑
       C0 (HEAD~3, racine)
```

Dans une session :
```bash
$ git log --oneline
abc1234 Commit 3
def5678 Commit 2
ghi9012 Commit 1

$ git show HEAD     # Affiche le détail de C3 (abc1234)
$ git show HEAD~1   # Affiche le détail de C2 (def5678)
$ git show HEAD~2   # Affiche le détail de C1 (ghi9012)
```

**Avec les branches** :

La notation `~n` s'applique aussi aux branches et tags :
```bash
git show main~1      # 1 commit avant le tip de main
git show feature~2   # 2 commits avant feature
git show v1.0~1      # 1 commit avant le tag v1.0
```

**Cas spécial : merge commits**

Quand un commit a 2 parents (merge commit), `~n` suit le **1er parent** :
```
    C1 ← C2 (main/HEAD)
   /
C0 ← M (merge)
   \
    D1 ← D2 (feature)

M~1 → C1 (premier parent)
M~2 → C0 (parent du premier parent)
```

---

### Fusion et réécriture d'historique

#### `git merge` — Fusionner deux branches

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git merge [options] <branchname>` |
| **Description** | Fusionne une branche dans la branche courante. Crée un commit de fusion si nécessaire, ou avance simplement (fast-forward) si possible |
| **Options Phase 4** | `--no-ff` (force un commit de fusion) ; `-m <message>` (message personnalisé) ; `--abort` (annule un merge en cours) |

##### Concept : Fast-Forward vs True Merge

**Fast-Forward** : Si HEAD est un ancêtre du tip de la branche à merger, Git avance simplement sans créer de commit.

```
Avant :        Après (git merge feature):
C0 ← C1        C0 ← C1 ← C2 ← C3
(main) ← C2    (main/HEAD, feature)
        ← C3
      (feature)
```

**True Merge** : Si les branches divergent, Git crée un commit de fusion à 2 parents.

```
Avant :           Après (git merge feature):
    C1 ← C2           C1 ← C2
   /                 /      \
C0 ← ─────────────→ M (merge)
   \                 \
    D1 ← D2           D1 ← D2

M.parents = [C2, D2]
```

##### Exemples

```bash
# Cas 1 : Fast-forward simple
$ git log --oneline
abc1234 Commit 3 (feature)
def5678 Commit 2 (main/HEAD)
ghi9012 Commit 1

$ git merge feature
Updating def5678..abc1234
Fast-forward
 newfile.txt | 1 +
 1 file changed, 1 insertion(+)

# Cas 2 : True merge (pas de fast-forward)
$ git log --oneline
abc1234 Feature commit (feature)
def5678 Main commit (main/HEAD)
ghi9012 Common base

$ git merge feature
Merge made by the '3-way' merge strategy.
 feature.txt | 1 +
 1 file changed, 1 insertion(+)

# Cas 3 : Forcer un commit de merge avec --no-ff
$ git merge --no-ff feature
Merge made by the 'recursive' merge strategy.
 ...

# Cas 4 : Message personnalisé
$ git merge -m "Fuse feature X into main" feature
```

##### Gestion simplifiée des conflits

Un **conflit** survient quand le même fichier est modifié différemment dans deux branches par rapport à leur ancêtre commun.

**Détection** :
- Si base ≠ HEAD ET base ≠ branch ET HEAD ≠ branch → conflit

**Marqueurs de conflit** :

Quand un conflit est détecté, Git insère des marqueurs dans le fichier :

```
<<<<<<< HEAD
contenu de la branche courante (main)
=======
contenu de la branche à merger (feature)
>>>>>>> feature
```

Exemple concret :
```
config.txt avant merge :

Base (ancêtre commun) :
DEBUG = unknown

Main (HEAD) :
DEBUG = true

Feature (branche) :
DEBUG = false

Après git merge feature :
<<<<<<< HEAD
DEBUG = true
=======
DEBUG = false
>>>>>>> feature
```

**Résolution** :

1. Éditer les fichiers conflictants pour retirer les marqueurs et choisir/combiner les contenus
2. Ajouter les fichiers résolus : `git add <fichier>`
3. Finaliser le merge : `git commit`

```bash
# Après avoir édité config.txt pour résoudre le conflit
$ git add config.txt

$ git status
On branch main
You have unmerged paths.
  (fix conflicts and run "git commit")

$ git commit -m "Resolve merge conflict"
[main abc1234] Merge branch 'feature'
```

**Annuler un merge** :

Si vous changez d'avis pendant un merge en cours :

```bash
$ git merge --abort
Merge aborted.
```

---

#### `git reset` — Déplacer HEAD et réinitialiser

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git reset [--soft \| --mixed \| --hard] [<commit>]` |
| **Description** | Déplace HEAD (et la branche courante) vers un commit donné, et optionnellement réinitialise l'index et le working tree |
| **Options Phase 4** | `--soft` (HEAD seulement) ; `--mixed` (défaut : HEAD + index) ; `--hard` (HEAD + index + working tree) |

##### Les trois modes expliqués

Imaginez trois "étages" : le commit (HEAD), l'index (staging area), et le working tree (fichiers visibles).

```
COMMIT (HEAD) ←─ --soft : déplace seulement ici
INDEX         ←─ --mixed : réinitialise aussi ici (par défaut)
WORKING TREE  ←─ --hard : réinitialise aussi ici
```

###### Mode `--soft` : Garder les changements stagés

**Effet** : Déplace HEAD, mais garde l'index et le working tree inchangés.

**Quand utiliser** : "J'ai committé trop tôt. Je veux garder mes changements stagés pour les recommitter avec un meilleur message."

```bash
Avant :
HEAD → C1, index = {a.txt: "v1"}, WT = {a.txt: "v1"}

$ git reset --soft HEAD~1

Après :
HEAD → C0, index = {a.txt: "v1"} (inchangé !), WT = {a.txt: "v1"}

$ git status
Changes to be committed:
  modified: a.txt
```

###### Mode `--mixed` (défaut) : Réinitialiser l'index

**Effet** : Déplace HEAD, réinitialise l'index avec le contenu de HEAD, garde le working tree inchangé.

**Quand utiliser** : "J'ai addé trop de fichiers. Je veux retirer du staging sans perdre les modifications."

```bash
Avant :
HEAD → C1 (tree: {a.txt: "v0"}), index = {a.txt: "v1"}, WT = {a.txt: "v1"}

$ git reset --mixed HEAD~1
$ # ou simplement : git reset HEAD~1

Après :
HEAD → C0, index = {a.txt: "v0"} (réinitialisé), WT = {a.txt: "v1"} (inchangé)

$ git status
Changes not staged for commit:
  modified: a.txt
```

###### Mode `--hard` : Annuler complètement

**Effet** : Déplace HEAD, réinitialise l'index ET le working tree.

**Quand utiliser** : "Je veux revenir à un état antérieur et supprimer tous mes changements locaux."

⚠️ **DANGER** : Les changements non commités sont **perdus définitivement**.

```bash
Avant :
HEAD → C1 (tree: {a.txt: "v0"}), index = {a.txt: "v1"}, WT = {a.txt: "v1.modified"}

$ git reset --hard HEAD~1

Après :
HEAD → C0, index = {a.txt: "v0"}, WT = {a.txt: "v0"}
(La version "v1.modified" est PERDUE)

$ git status
On branch main
nothing to commit, working tree clean
```

##### Exemples

```bash
# Reset soft : garder les changements stagés
$ git reset --soft HEAD~1

# Reset mixed (défaut) : réinitialiser l'index
$ git reset HEAD~1      # identique à --mixed
$ git reset --mixed HEAD~1

# Reset hard : revenir à un état antérieur
$ git reset --hard HEAD~2

# Reset à HEAD (réinitialise juste l'index)
$ git reset
```

---

#### `git revert` — Créer un commit d'annulation

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git revert [options] <commit>` |
| **Description** | Crée un nouveau commit qui annule les changements d'un commit spécifié |
| **Options Phase 4** | `-m <parent>` (pour les merge commits, optionnel) ; `--abort` (annule un revert en cours) |

##### Concept : Inverser les changements

`git revert` **crée un nouveau commit** qui inverse les changements d'un commit donné. Contrairement à `git reset` (qui supprime l'historique), `git revert` préserve l'historique.

```
Avant :
C0 ← C1 (modifie a.txt: "old" → "new") ← C2 (HEAD)

Après (git revert C1) :
C0 ← C1 ← C2 ← R (annule la modification : a.txt: "new" → "old")
```

##### Exemples

```bash
# Cas 1 : Revert simple
$ git log --oneline
abc1234 Add feature X (HEAD)
def5678 Initial commit

$ git revert abc1234
Revert "Add feature X"

This reverts commit abc1234.

# Cas 2 : Revert d'un commit au milieu de l'historique
$ git log --oneline
ghi9012 Commit 3 (HEAD)
abc1234 Commit 2 (à annuler)
def5678 Commit 1

$ git revert abc1234
(crée un nouveau commit qui annule Commit 2)

$ git log --oneline
xyz1234 Revert "Commit 2"
ghi9012 Commit 3
abc1234 Commit 2
def5678 Commit 1
```

---

#### `git cherry-pick` — Appliquer un commit isolé

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git cherry-pick <commit>` |
| **Description** | Applique les changements d'un commit spécifique sur HEAD, créant un nouveau commit |
| **Options Phase 4** | `--abort` (annule un cherry-pick en cours) |

##### Concept : Dupliquer un commit

`git cherry-pick` prend les changements d'un commit et les applique sur HEAD.

```
Avant :
C0 ← C1 (main/HEAD)
  \
    D1 (modifie a.txt) ← D2 (feature)

Après (git cherry-pick D1 depuis main) :
C0 ← C1 ← C1' (les mêmes changements que D1) (main/HEAD)
  \
    D1 ← D2 (feature, inchangé)
```

##### Exemples

```bash
# Cas 1 : Cherry-pick simple
$ git log --oneline
abc1234 Feature commit (feature)
def5678 Main (main/HEAD)

$ git cherry-pick abc1234
[main ghi9012] Feature commit
 1 file changed, 1 insertion(+)

# Cas 2 : Cherry-pick avec conflit
$ git log --oneline
abc1234 Conflicting change (feature)
def5678 Different change (main/HEAD)

$ git cherry-pick abc1234
CONFLICT (content): Conflict in config.txt
(Résoudre comme pour merge, puis git add + git commit)
```

---

#### `git rebase` — Rejouer des commits sur une nouvelle base

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git rebase [options] <base>` |
| **Description** | Rejowe tous les commits de la branche courante (absents de `<base>`) au-dessus de `<base>` |
| **Options Phase 4** | `--continue` (continue après résolution de conflits) ; `--abort` (annule un rebase en cours) |

##### Concept : Linéariser l'historique

`git rebase` repère les commits uniques de la branche courante et les rejoue au-dessus d'une nouvelle base. Cela crée un historique linéaire au lieu de branchements.

```
Avant (merge crée deux branches) :
    C1 ← C2 (main)
   /
C0
   \
    D1 ← D2 (feature/HEAD)

Après (git rebase main) :
C0 ← C1 ← C2 ← D1' ← D2' (feature/HEAD)

D1' et D2' sont des NOUVEAUX commits (hashes différents de D1 et D2)
avec les mêmes changements, mais parents différents.
```

##### Exemples

```bash
# Cas 1 : Rebase simple
$ git checkout feature
$ git log --oneline --graph
* abc1234 Feature commit 2
* def5678 Feature commit 1
| * ghi9012 Main commit (main)
|/
* jkl5678 Base

$ git rebase main
First, rewinding head to replay your work on top of main...
Applying: Feature commit 1
Applying: Feature commit 2

$ git log --oneline --graph
* xyz9999 Feature commit 2 (feature/HEAD)
* abc1111 Feature commit 1
* ghi9012 Main commit (main)
* jkl5678 Base

# Cas 2 : Rebase avec conflit
$ git rebase main
CONFLICT (content): Conflict in file.txt
(Résoudre le conflit)

$ git add file.txt
$ git rebase --continue
(Continues le rebase)

# Cas 3 : Annuler un rebase
$ git rebase --abort
Rebase aborted.
(Retour à l'état avant rebase)
```

---

### Scénario complet : Workflow avec merge et rebase

Voici une session réaliste montrant merge, rebase, et gestion de conflits :

```bash
# 1. Initialiser et créer l'historique de base
$ git init
$ write main.txt "Main content"
$ git add main.txt
$ git commit -m "Initial commit on main"
[main (root-commit) abc1234] Initial commit on main

# 2. Créer une branche feature
$ git branch feature
$ write main.txt "Main updated"
$ git add main.txt
$ git commit -m "Update main"
[main def5678] Update main

# 3. Basculer sur feature et créer des commits
$ git checkout feature
Switched to branch 'feature'

$ write feature.txt "Feature content"
$ git add feature.txt
$ git commit -m "Add feature.txt"
[feature ghi9012] Add feature.txt

$ write config.txt "SETTING = A"
$ git add config.txt
$ git commit -m "Add config"
[feature jkl3456] Add config

# 4. Revenir à main et créer un autre changement
$ git checkout main
Switched to branch 'main'

$ write config.txt "SETTING = B"
$ git add config.txt
$ git commit -m "Add config on main"
[main mno7890] Add config on main

# 5. État avant merge/rebase
$ git log --oneline --graph
* mno7890 Add config on main (main/HEAD)
| * jkl3456 Add config (feature)
| * ghi9012 Add feature.txt
|/
* def5678 Update main
* abc1234 Initial commit on main

# 6. Merger feature dans main : conflit attendu
$ git merge feature
Auto-merging config.txt
CONFLICT (content): Merge conflict in config.txt
Automatic merge failed.

# 7. Examiner le conflit
$ read config.txt
<<<<<<< HEAD
SETTING = B
=======
SETTING = A
>>>>>>> feature

# 8. Résoudre le conflit
$ write config.txt "SETTING = A and B merged"
$ git add config.txt

$ git status
On branch main
You have unmerged paths.
  (fix conflicts and run "git commit")
	
Unmerged paths:
  (use "git add <file>..." to mark resolution)
	both modified: config.txt

# 9. Finaliser le merge
$ git commit -m "Merge feature into main"
[main pqr1111] Merge feature into main

# 10. Afficher l'historique après merge
$ git log --oneline --graph
*   pqr1111 Merge feature into main (main/HEAD)
|\
| * jkl3456 Add config
| * ghi9012 Add feature.txt
* | mno7890 Add config on main
|/
* def5678 Update main
* abc1234 Initial commit on main

# 11. Créer une nouvelle branche et tester rebase
$ git checkout -b develop
Switched to a new branch 'develop'

$ write develop.txt "Develop branch"
$ git add develop.txt
$ git commit -m "Add develop.txt"
[develop stu2222] Add develop.txt

# 12. Sur main, créer un autre commit
$ git checkout main
$ write main.txt "Main: version 2"
$ git add main.txt
$ git commit -m "Update main to v2"
[main vwx3333] Update main to v2

# 13. Rebase develop sur main (linéariser)
$ git checkout develop
Switched to branch 'develop'

$ git rebase main
Successfully rebased and updated develop.

$ git log --oneline --graph
* yz4444 Add develop.txt (develop/HEAD)
* vwx3333 Update main to v2 (main)
*   pqr1111 Merge feature into main
|\
| * jkl3456 Add config
| * ghi9012 Add feature.txt
* | mno7890 Add config on main
|/
* def5678 Update main
* abc1234 Initial commit on main

# 14. Afficher les changements du rebase
$ git log HEAD~1..develop
yz4444 Add develop.txt (nouveau hash, anciennement stu2222)
```

---

## Outils avancés (Phase 5)

### Rebase interactif

#### `git rebase -i` — Rejouer des commits avec contrôle total

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git rebase -i <base>` |
| **Description** | Lance un rebase interactif : affiche une liste des commits à rejouer et permet de les éditer (changer leur ordre, fusionner, renommer, supprimer) avant exécution |
| **Options Phase 5** | `-i` ou `--interactive` (obligatoire) ; `--continue` / `--abort` pour gérer les conflits |

##### Concepts : Actions et todo list

Lors du rebase interactif, vous êtes présenté avec une **liste de commits à rejouer** (todo list) avec une action pour chacun. Les actions disponibles sont :

| Action | Description | Résultat |
|--------|-------------|----------|
| `pick` (p) | Rejouer le commit normalement | Nouveau commit avec le même message et contenu |
| `reword` (r) | Rejouer et éditer le message du commit | Nouveau commit avec message modifié |
| `squash` (s) | Fusionner dans le commit précédent | Un seul commit avec les changements des deux, message combiné |
| `fixup` (f) | Comme squash, mais jetter le message | Un commit sans le message du commit fusionné |
| `drop` (d) | Supprimer entièrement | Le commit est ignoré, aucun nouveau commit créé |

**Réordonnancement** : Vous pouvez aussi réordonner les lignes pour changer l'ordre de rejoue des commits.

##### Interface dans le terminal web

Contrairement à Git standard (qui ouvre un éditeur texte), le Git Visualizer expose une **modale interactive** où vous pouvez :
- Voir la liste des commits à rejouer
- Choisir l'action pour chacun via un dropdown
- Éditer les messages directement (pour `reword`)
- Réordonner les commits (drag-drop)
- Valider avec le bouton "Commencer le rebase"

Une fois validé, le rebase s'exécute. S'il y a des **conflits**, vous les résolvez comme en Phase 4 (`git add` puis `git rebase --continue`).

##### Exemples

**Cas 1 : Squash deux commits**

```bash
# Historique initial
$ git log --oneline
abc1234 Add feature
def5678 Fix typo in feature
ghi9012 Initial commit

# Lancer le rebase interactif
$ git rebase -i main
# (Modale affiche : pick def5678, pick abc1234)
# Modifier : pick def5678, squash abc1234
# Valider

# Résultat : 2 commits fusionnés en 1
$ git log --oneline
xyz1111 Add feature  (contient changements des deux commits)
ghi9012 Initial commit
```

**Cas 2 : Renommer un message (reword)**

```bash
$ git rebase -i main
# Modale affiche les commits
# Modifier action de "Add feature" en "reword"
# Éditer le message : "Add feature X with documentation"
# Valider

# Résultat : commit avec nouveau message
$ git log --oneline
xyz2222 Add feature X with documentation
ghi9012 Initial commit
```

**Cas 3 : Supprimer un commit (drop)**

```bash
$ git rebase -i main
# Modale affiche : pick C1, pick C2 (temporaire), pick C3
# Modifier C2 en "drop"
# Valider

# Résultat : C2 est supprimé, C3 devient enfant direct de C1
$ git log --oneline
xyz3333 C3
xyz1111 C1
ghi9012 Initial commit
```

##### Résolution de conflits

Si un commit rejouée crée un **conflit** lors du squash ou du réordonnancement, le rebase s'arrête avec un message de conflit :

```
CONFLICT (content): Conflict in file.txt
```

Vous résolvez comme en Phase 4 :
1. Éditer le fichier en conflit (retirer les marqueurs `<<<<< / ======= / >>>>>`)
2. Ajouter le fichier : `git add file.txt`
3. Continuer : `git rebase --continue`

Pour annuler le rebase interactif : `git rebase --abort`

---

### Stash : Mettre de côté des modifications

#### `git stash` — Sauvegarder et nettoyer temporairement

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git stash [push \| list \| pop \| apply \| drop] [options]` |
| **Description** | Sauvegarde les modifications non commitées dans une pile, nettoie le working tree et l'index pour revenir à l'état de HEAD |
| **Options Phase 5** | `-m <message>` (message personnalisé) ; index optionnel pour pop/apply/drop |

##### Concept : Ranger les modifications

Le stash est une **pile LIFO** (Last-In-First-Out) de "snapshots" : chaque stash enregistre l'état du working tree et de l'index à un moment donné.

**Cas d'usage** :
- "Je dois basculer de branche rapidement, mais j'ai des modifications. Je les range."
- "Je veux tester un reset/rebase en toute sécurité ; je stash d'abord."
- "J'ai fait des changements sur la mauvaise branche ; je les stash et les rejoue ailleurs."

##### Commandes et exemples

**`git stash` / `git stash push` — Sauvegarder**

```bash
# Situation initiale
$ git status
On branch main
Changes not staged for commit:
  modified: file.txt

Untracked files:
  new.txt

# Stash simple
$ git stash
Saved working directory and index state on main

# Working tree nettoyé
$ git status
On branch main
nothing to commit, working tree clean

# Stash avec message personnel
$ git stash push -m "Save feature work"
Saved working directory and index state on main: Save feature work
```

**Après stash** : votre working tree est identique à HEAD, prêt à basculer de branche ou à tester une opération.

---

**`git stash list` — Voir la pile**

```bash
# Après plusieurs stash
$ git stash list
stash@{0}: On main: Save feature work
stash@{1}: WIP on main: abc1234
stash@{2}: WIP on main: def5678

# Format : stash@{index}: [On branch / WIP on] <branchname>: <message ou commit_msg>
```

Chaque stash a un **index** : `stash@{0}` est le plus récent, `stash@{1}` l'avant-dernier, etc.

---

**`git stash pop` — Appliquer et supprimer**

```bash
# Appliquer le stash le plus récent
$ git stash pop
On branch main
Changes not staged for commit:
  modified: file.txt

Dropped refs/stash@{0}  (...)

# Le stash est supprimé de la pile
$ git stash list
stash@{0}: WIP on main: def5678

# Appliquer un stash spécifique
$ git stash pop stash@{1}
```

⚠️ **Conflits** : Si le stash n'applique pas proprement (le fichier a changé depuis), vous avez un conflit. Vous résolvez et le stash est conservé (vous pouvez retenter après).

---

**`git stash apply` — Appliquer sans supprimer**

```bash
# Comme pop, mais le stash reste dans la pile
$ git stash apply
$ git stash apply stash@{1}

# Après apply
$ git stash list
stash@{0}: ...  (toujours présent)
```

Utile si vous voulez appliquer le même stash plusieurs fois.

---

**`git stash drop` — Supprimer**

```bash
# Supprimer le stash le plus récent
$ git stash drop
Dropped refs/stash@{0}  (...)

# Supprimer un stash spécifique
$ git stash drop stash@{1}

# Les indices sont réajustés après suppression
$ git stash list
stash@{0}: ...  (était stash@{2}, renombré)
```

---

**Scénario complet : Stash et basculement de branche**

```bash
# 1. Sur main avec modifications
$ git status
On branch main
Changes not staged for commit:
  modified: feature.txt

# 2. Vous devez basculer à feature pour un hotfix
$ git stash
Saved working directory and index state on main

# 3. Working tree propre
$ git status
On branch main
nothing to commit, working tree clean

# 4. Basculer à feature
$ git checkout feature
Switched to branch 'feature'

# 5. Faire le hotfix, committer, revenir à main
$ write fix.txt "Hotfix applied"
$ git add fix.txt
$ git commit -m "Quick hotfix"
[feature abc1234] Quick hotfix

$ git checkout main
Switched to branch 'main'

# 6. Récupérer les modifications stashées
$ git stash pop
On branch main
Changes not staged for commit:
  modified: feature.txt

# Continuer votre travail sur main
```

---

### Reflog : L'historique des mouvements

#### `git reflog` — Retrouver les commits "perdus"

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git reflog [show] [<ref>]` |
| **Description** | Affiche un journal chronologique de **tous les mouvements de HEAD** (commits, checkouts, resets, merges, rebases, etc.). Permet de retrouver des commits que vous pensiez "perdus" après un reset ou rebase |
| **Options Phase 5** | Optionnel : `show` (explicite) ; `<ref>` pour afficher le reflog d'une branche |

##### Concept : Time travel via reflog

Le reflog enregistre chaque fois que HEAD bouge :
- **Commit** : HEAD avance vers le nouveau commit
- **Checkout** : HEAD bascule vers une autre branche
- **Reset** : HEAD revient à un commit antérieur
- **Merge / Rebase** : HEAD se déplace vers le résultat

**Accès** : `HEAD@{n}` = l'état de HEAD à la nième opération en arrière.

```
HEAD@{0}  ← état actuel de HEAD (avant la commande présente)
HEAD@{1}  ← HEAD avant la dernière commande
HEAD@{2}  ← HEAD avant celle-ci
HEAD@{3}  ← encore avant
```

Chaque entrée enregistre **quel commit HEAD pointait** et **pourquoi il s'y est déplacé** (action, description).

##### Exemples

**Cas 1 : Afficher le reflog**

```bash
$ git reflog
abc1234 HEAD@{0}: commit: Add feature
def5678 HEAD@{1}: checkout: switched to branch main
9ab0123 HEAD@{2}: reset: hard main~1
cde4567 HEAD@{3}: merge: Merge branch feature

# Format : <shortHash> HEAD@{index}: <action>: <description>
```

**Cas 2 : Retrouver un commit "perdu" après reset**

```bash
# Vous avez accidentellement fait un reset --hard
$ git reset --hard HEAD~3
HEAD is now at 7f3e2d1 Some old commit

# Vous réalisez que vous aviez un commit important
# Consulter le reflog pour retrouver
$ git reflog
7f3e2d1 HEAD@{0}: reset: hard HEAD~3
abc1234 HEAD@{1}: commit: Important feature
def5678 HEAD@{2}: commit: Setup
...

# Retrouver le commit "Important feature" qui était en HEAD@{1}
# Créer une branche dessus pour le conserver
$ git checkout -b recover abc1234
Switched to a new branch 'recover'

# Ou simplement reset à cet état
$ git reset --hard HEAD@{1}
HEAD is now at abc1234 Important feature
```

**Cas 3 : Utiliser `HEAD@{n}` dans des commandes**

```bash
# Voir les changements entre HEAD et HEAD@{2}
$ git log HEAD@{2}..HEAD

# Différence entre deux états
$ git diff HEAD@{3} HEAD

# Reset à un état antérieur
$ git reset --hard HEAD@{5}
```

**Cas 4 : Reflog d'une branche**

```bash
# Voir l'historique de la branche 'main'
$ git reflog show main
abc1234 main@{0}: commit: Latest on main
def5678 main@{1}: merge: Merge branch feature
9ab0123 main@{2}: commit: Previous
```

---

**Scénario "undo" : Récupérer après reset malheureux**

```bash
# 1. Vous aviez un historique bien établi
$ git log --oneline
abc1234 Feature complete (main/HEAD)
def5678 Feature WIP
9ab0123 Setup

# 2. Vous executez accidentellement
$ git reset --hard 9ab0123
HEAD is now at 9ab0123 Setup

# 3. Les deux commits (abc1234 et def5678) semblent "perdus"
$ git log --oneline
9ab0123 Setup

# 4. Mais le reflog les remembers
$ git reflog
9ab0123 HEAD@{0}: reset: hard 9ab0123
abc1234 HEAD@{1}: commit: Feature complete
def5678 HEAD@{2}: commit: Feature WIP

# 5. Récupérer immédiatement
$ git reset --hard HEAD@{1}
HEAD is now at abc1234 Feature complete

# Vous êtes de retour à l'état avant le reset !
$ git log --oneline
abc1234 Feature complete (HEAD)
def5678 Feature WIP
9ab0123 Setup
```

---

---

## Finitions et DX (Phase 6)

### Aide intégrée (`git help`)

Pour découvrir les commandes disponibles, utilisez `git help`.

#### `git help` — Afficher l'aide générale

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git help` ou `git --help` ou `git` (sans arguments) |
| **Description** | Affiche la liste de toutes les commandes disponibles, groupées par catégorie |

**Exemple** :

```bash
$ git help
usage: git [--help] [<commande>]

Initialisation & Configuration
  init          Initialiser un dépôt Git vierge

Fichiers & Index
  add           Ajouter des fichiers à l'index
  status        Afficher l'état du dépôt
  restore       Restaurer fichiers dans l'index ou le working tree
  write         Écrire des fichiers dans le working tree virtuel
  read          Lire des fichiers du working tree virtuel

Commits
  commit        Créer un commit avec les fichiers stagés
  log           Afficher l'historique des commits

Branches
  branch        Créer, lister ou supprimer des branches
  checkout      Basculer de branche ou repositionner HEAD
  switch        Basculer de branche (variante de checkout)
  tag           Créer, lister ou supprimer des étiquettes

Fusion & Réécriture
  merge         Fusionner une branche dans la branche courante
  reset         Réinitialiser HEAD et l'index
  revert        Créer un commit qui annule les changements
  cherry-pick   Appliquer les changements d'un commit ailleurs
  rebase        Rejouer les commits sur une nouvelle base

Outils avancés
  stash         Mettre de côté temporairement des changements
  reflog        Afficher l'historique des mouvements de HEAD

Aide
  help          Afficher cette aide

Use 'git help <command>' for more information.
```

#### `git help <commande>` — Aide détaillée

Pour obtenir l'aide détaillée d'une commande spécifique, utilisez `git help <commande>`.

**Exemples** :

```bash
# Aide détaillée sur git commit
$ git help commit
NAME
  git commit - Créer un commit avec les fichiers stagés

SYNOPSIS
  git commit [options]

DESCRIPTION
  Enregistre les changements actuels de l'index dans un nouveau commit.
  Le message du commit est obligatoire (-m) ; en son absence, une erreur est retournée.

OPTIONS
  -m <message>  Message du commit

EXAMPLES
  git commit -m "Initial commit"
  git commit -m "Fix bug #123"

EXIT CODES
  0  Succès
  1  Erreur (ex: nothing to commit, bad message)
  128 Dépôt non initialisé
```

**Cas d'erreur** : Commande inconnue

```bash
$ git help nosuchcommand
fatal: git 'nosuchcommand' is not a git command. See 'git help'.
```

---

### Autocomplétion du terminal (Tab)

Le terminal propose une autocomplétion intelligente quand vous appuyez sur la touche **Tab**.

#### Autocomplétion des noms de commandes

Si vous commencez à taper une commande, appuyez sur Tab pour compléter automatiquement.

**Cas 1 : Un seul candidat → complétion automatique**

```bash
$ git com[Tab]
$ git commit        # Auto-complété
```

**Cas 2 : Plusieurs candidats → affichage d'une liste**

```bash
$ git ch[Tab]
checkout
cherry-pick

$ git ch█           # Vous pouvez continuer à taper
```

#### Autocomplétion des flags

Après le nom de la commande, vous pouvez compléter les flags (drapeaux).

**Exemple** :

```bash
$ git reset --[Tab]
--soft
--mixed
--hard

$ git reset --s[Tab]
$ git reset --soft      # Auto-complété
```

#### Autocomplétion des noms de branches et tags

Quand une commande attend un argument (branche ou tag), Tab vous propose les noms disponibles.

**Exemple** :

```bash
# Complète les noms de branches disponibles
$ git checkout [Tab]
main
feature
hotfix

$ git checkout fe[Tab]
$ git checkout feature    # Auto-complété si un seul candidat
```

**Cas avec plusieurs refs** :

```bash
# Branche et tags mélangés
$ git checkout [Tab]
main
feature
release
v1.0
v2.0
```

#### Comment utiliser

1. Tapez un début de commande, flag ou nom de branche
2. Appuyez sur **Tab**
3. Si un seul candidat : complétion automatique
4. Si plusieurs candidats : affichage d'une liste ; continuez à taper pour filtrer

---

### Persistance : Sauvegarde automatique de la session

Vos commandes et l'état du dépôt sont sauvegardés automatiquement dans le navigateur. Si vous fermez et rouvrez la page, tout est restauré.

#### Sauvegarde automatique

Chaque fois que vous exécutez une commande avec succès (exit code 0), l'historique est enregistré localement.

```bash
$ git init
$ git add file.txt
$ git commit -m "First commit"
# À chaque succès, la session est sauvegardée
```

#### Rechargement de la page

En fermant la page (ou rafraîchissant), l'historique est conservé dans le **localStorage** du navigateur. À la prochaine visite :

1. Toutes les commandes antérieures sont rejouées silencieusement
2. L'état du dépôt est restauré exactement
3. Vous continuez comme si la page n'avait jamais été fermée

**Important** : La persistance utilise le **localStorage du navigateur**, ce qui signifie :
- Les données sont locales (pas de serveur)
- Elles persistent tant que vous ne videz pas le cache du navigateur
- Elles ne se synchronisent pas entre appareils

#### Réinitialisation manuelle

Pour repartir de zéro et nettoyer la sauvegarde, utilisez le bouton **Reset** visible dans la barre latérale des références (RefsSidebar à gauche).

```bash
# Alternativement, vous pouvez réinitialiser manuellement
# en cherchant le bouton [Reset History] dans la sidebar
```

Après un reset :
1. localStorage est vidé
2. Le dépôt est réinitialisé (vierge)
3. Vous commencez une nouvelle session

---

### Scénarios pédagogiques préchargés

Git Visualizer propose une série de scénarios d'apprentissage prêts à l'emploi. Chaque scénario charge un petit dépôt avec une sequence prédéfinie de commandes pour démontrer un concept Git clé.

#### Liste des scénarios disponibles

Vous trouverez les scénarios dans la **barre latérale de gauche** (RefsSidebar), section "Scénarios d'apprentissage" (ou accédez-les via un panneau dédié).

##### 1. Branche & Merge (Facile)

**Description** : Créer une branche, ajouter des commits, puis fusionner dans main.

**Concept** : Workflow de base avec branches.

**Commandes exécutées** :
```bash
git init
write main.txt "Main content"
git add main.txt
git commit -m "Initial commit on main"
git branch feature
git checkout feature
write feature.txt "Feature content"
git add feature.txt
git commit -m "Add feature"
git checkout main
git merge feature
```

**Résultat** : Vous voyez un graphe avec deux branches qui convergent. Le merge est un fast-forward (main avance simplement pour pointer feature).

---

##### 2. Merge --no-ff (Facile)

**Description** : Forcer la création d'un commit de merge explicite, même quand un fast-forward serait possible.

**Concept** : Différence entre fast-forward et true merge.

**Commandes exécutées** :
```bash
git init
write main.txt "Main content"
git add main.txt
git commit -m "C1: main"
git branch hotfix
git checkout hotfix
write hotfix.txt "Hotfix content"
git add hotfix.txt
git commit -m "C2: hotfix"
git checkout main
git merge --no-ff hotfix -m "Merge branch hotfix"
```

**Résultat** : Vous voyez un commit de merge avec deux parents (historique branché et fusionné explicitement).

---

##### 3. Conflit de Merge & Résolution (Moyen)

**Description** : Modifier le même fichier sur deux branches, créer un conflit, puis le résoudre.

**Concept** : Gestion des conflits de merge.

**Commandes exécutées** (partiellement) :
```bash
git init
write data.txt "Initial data"
git add data.txt
git commit -m "C1: Initial"
git branch feature
git checkout feature
write data.txt "Feature edit: line1\nfeature line"
git add data.txt
git commit -m "C2: feature edits"
git checkout main
write data.txt "Main edit: line1\nmain line"
git add data.txt
git commit -m "C3: main edits"
git merge feature
# À ce point, CONFLIT ! Les deux branches ont modifié data.txt différemment
# Le fichier contient des marqueurs <<<<< / ======= / >>>>>
write data.txt "Merged: line1\nboth edits combined"
git add data.txt
git commit -m "C4: Resolve conflict"
```

**Résultat** : Vous voyez un graphe avec un merge, et vous apprenez comment résoudre les marqueurs de conflit.

---

##### 4. Cherry-pick & Tagging (Moyen)

**Description** : Sélectionner un commit spécifique d'une branche et l'appliquer ailleurs, puis tagguer.

**Concept** : Cherry-pick pour dupliquer des commits, tags pour marquer les releases.

**Commandes exécutées** :
```bash
git init
write main.txt "Main initial"
git add main.txt
git commit -m "C1: main initial"
git branch feature
git checkout feature
write feature.txt "Important feature"
git add feature.txt
git commit -m "C2: important feature"
write extra.txt "Extra stuff"
git add extra.txt
git commit -m "C3: extra stuff"
git checkout main
git cherry-pick feature~1
# Applique C2 sur main (création d'un nouveau commit)
git tag v1.0
git checkout feature
git tag feature-tip
```

**Résultat** : Vous voyez comment cherry-pick crée un nouveau commit avec le même contenu, et comment les tags marquent des points importants.

---

##### 5. Reset & Undo via Reflog (Moyen)

**Description** : Réinitialiser accidentellement, puis restaurer via reflog.

**Concept** : Undo et recovery après un reset malheureux.

**Commandes exécutées** :
```bash
git init
write f1.txt "First file"
git add f1.txt
git commit -m "C1: Good state"
write f2.txt "Second file"
git add f2.txt
git commit -m "C2: Still good"
git reset --hard main~1
# Oups ! On "perd" C2 (mais il reste dans le reflog)
git reset --hard HEAD@{1}
# Undo ! On restaure C2 en se repositionnant via reflog
```

**Résultat** : Vous voyez comment le reflog enregistre tous les mouvements de HEAD, et comment `HEAD@{n}` vous permet de récupérer des commits "perdus".

---

#### Comment charger un scénario

1. Repérez la section **Scénarios d'apprentissage** dans la barre latérale (RefsSidebar) ou dans le panneau dédié
2. Cliquez sur le scénario que vous voulez charger (ex. "Branche & Merge")
3. Une confirmation peut vous demander "Êtes-vous sûr ?" (le dépôt sera réinitialisé)
4. Le scénario se charge : toutes les commandes sont exécutées, et le graphe se construit

#### Important : Réinitialisation lors du chargement

Charger un scénario **réinitialise le dépôt**. Tout travail antérieur est perdu. Si vous voulez conserver votre travail, créez une branche ou exportez avant de charger un scénario.

#### Après le chargement

Une fois un scénario chargé, vous pouvez :
- **Explorer** le graphe : zoom, pan, hover sur les commits
- **Modifier** : exécuter d'autres commandes pour expérimenter
- **Recharger** : charger un autre scénario ou reset pour recommencer

---

### Barre latérale des références (RefsSidebar)

La **RefsSidebar** est la zone de gauche affichant l'état du dépôt en temps réel.

#### Sections de la sidebar

##### Branches

Affiche la liste des branches locales. Un `[*]` indique laquelle a HEAD, `[ ]` pour les autres.

```
Branches
  [*] main          7f3e2d1
  [ ] feature       a7c2e5d
  [ ] hotfix        xyz1234
```

Vous pouvez cliquer sur une branche pour la basculer (optionnel ; tapez aussi `git checkout <branche>` dans le terminal).

---

##### HEAD

Indique où HEAD pointe actuellement.

**Mode symbolique** (normal) :
```
HEAD
  symbolic: true
  → refs/heads/main
```

**Mode détaché** (WARNING) :
```
HEAD
  detached: true
  → abc1234 (short hash)
```

Un HEAD détaché apparaît avec une couleur orange/warning pour vous alerter que vous êtes sur un commit sans branche.

---

##### Tags

Affiche tous les tags (étiquettes) du dépôt, avec le hash court du commit pointé.

```
Tags
  v1.0 (abc1234)
  v1.1 (def5678)
  release (abc1234)
```

---

##### Opération en cours

Si une opération Git est en cours (merge, rebase, cherry-pick), une section **⚠ Opération en cours** s'affiche avec les détails.

**Exemple : Merge en cours avec conflit**

```
⚠ Opération en cours
  Merging
  Source: feature
  Conflicts: 1 file
  
  [Continue] [Abort]
```

**Exemple : Rebase en cours**

```
⚠ Opération en cours
  Rebasing
  Base: main
  Progress: 2/3 commits
  
  [Continue] [Abort]
```

Les boutons :
- **[Continue]** : poursuit l'opération après résolution de conflits
- **[Abort]** : annule l'opération et revient à l'état avant

---

##### Stash

Si vous avez des modifications sauvegardées en stash, un compteur s'affiche.

```
Stash
  Count: 2
  
  stash@{0}: WIP on main: abc1234
  stash@{1}: WIP on feature: def5678
```

---

##### Commandes récentes

Les 5-10 dernières commandes exécutées, les plus récentes en haut.

```
Commandes récentes
  > git checkout main
  > git merge feature
  > git add file.txt
  > git commit -m "Test"
  > git init
  
  [Reset History]
```

Le bouton **[Reset History]** nettoie l'historique et réinitialise le dépôt (confirmation demandée).

---

#### Mise à jour réactive

La sidebar se met à jour **automatiquement** après chaque commande. Vous n'avez pas besoin de rafraîchir.

---

## Dépôts distants (Phase 7)

Git Visualizer introduit le support des dépôts distants, permettant de cloner des repositories, de synchroniser les changements via fetch, et de gérer les remotes (dépôts distants prédéfinis). Sans réseau réel, les dépôts distants sont des catalogues en mémoire qui simulent la collaboration.

### Concept : Dépôt distant et références de suivi

Un **dépôt distant** (ou "remote") est une version de référence du projet, accessible via un nom symbolique (`origin` par défaut). Chaque remote possède :
- Ses propres branches (ex. `main`, `develop`)
- Un ensemble d'objets Git (commits, arbres, fichiers)
- Une branche par défaut (généralement `main`)

Le dépôt local maintient des **références de suivi** (`origin/main`, `origin/develop`, etc.) qui pointent vers les branches distantes. Ces références ne changent que via `fetch`, `clone`, ou `push`—jamais via vos commits locaux.

### Gestion des remotes

#### `git remote` — Lister, ajouter ou supprimer des dépôts distants

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git remote [list]` ou `git remote -v` ou `git remote add <nom> <url>` ou `git remote remove <nom>` |
| **Description** | Gère les dépôts distants : liste, ajoute ou supprime |
| **Options Phase 7** | Aucun argument : liste les remotes ; `-v` : avec URLs ; `add <nom> <url>` : ajouter ; `remove <nom>` : supprimer (alias `rm`) |

##### Lister les remotes

**Cas 1 : Liste simple**

```bash
$ git remote
origin
upstream

# Affiche les noms des remotes configurés
```

**Cas 2 : Liste détaillée avec URLs**

```bash
$ git remote -v
origin    https://github.com/user/project.git (fetch)
origin    https://github.com/user/project.git (push)
upstream  https://github.com/upstream/project.git (fetch)
upstream  https://github.com/upstream/project.git (push)

# L'URL est cosmétique (pas de réseau réel)
```

**Code de sortie :** 0

---

##### Ajouter un remote

**Syntaxe** : `git remote add <nom> <url>`

```bash
# Ajouter un remote nommé "origin"
$ git remote add origin https://github.com/user/project.git

# Ajouter un deuxième remote "upstream"
$ git remote add upstream https://github.com/upstream/project.git

# Vérifier l'ajout
$ git remote -v
origin     https://github.com/user/project.git (fetch)
origin     https://github.com/user/project.git (push)
upstream   https://github.com/upstream/project.git (fetch)
upstream   https://github.com/upstream/project.git (push)
```

**Comportement** :
- Crée un nouveau dépôt distant bare (sans working tree)
- L'URL est stockée cosmétiquement (pas de vérification réseau)
- Erreur si le nom existe déjà

**Code de sortie :** 0 (succès) | 128 (erreur : remote existe)

---

##### Supprimer un remote

**Syntaxe** : `git remote remove <nom>` ou `git remote rm <nom>`

```bash
# Supprimer le remote "upstream"
$ git remote rm upstream

# Vérifier la suppression
$ git remote
origin
```

**Comportement** :
- Supprime le dépôt distant
- Supprime aussi les références de suivi associées (`origin/*`)
- Erreur si le remote n'existe pas

**Code de sortie :** 0 (succès) | 128 (erreur : remote inexistant)

---

### Cloner un dépôt

#### `git clone` — Créer une copie locale d'un dépôt distant

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git clone <source>` |
| **Description** | Initialise un nouveau dépôt local en copiant un dépôt source prédéfini, configure le remote `origin`, et crée une branche locale correspondant à la branche par défaut |
| **Options Phase 7** | Aucun ; `<source>` est un nom de dépôt prédéfini (pas d'URL) |

##### Dépôts source prédéfinis

Phase 7 propose un catalogue de dépôts source pour la démonstration :

| Nom | Description | Branches | Commits |
|-----|-------------|----------|---------|
| `public-repo` | Dépôt public simple | `main` | 3 commits linéaires (C0 ← C1 ← C2) |
| `collab-repo` | Dépôt avec branches | `main`, `develop` | 5 commits (deux branches divergentes) |

Utilisez l'un de ces noms comme argument à `git clone`.

##### Exemple : Clone simple

```bash
# Cloner le dépôt public-repo
$ git clone public-repo
Cloning into 'local-copy'...
remote: Enumerating objects: 3, done.
Receiving objects: 100% (3/3), done.

# Après clone, vous êtes sur la branche par défaut (main) du dépôt source
$ git status
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
```

**État après clone** :
- Dépôt local initialisé (`.git`)
- Remote `origin` configuré et pointant vers `public-repo`
- Tous les objets (commits, arbres, fichiers) copiés
- Branche locale `main` créée et l'upstream configuré vers `origin/main`
- HEAD sur `main`, index et working tree synchronisés
- Références de suivi `origin/*` créées pour toutes les branches distantes

**Code de sortie** : 0 (succès) | 128 (erreur : source inexistante ou dépôt déjà existant)

---

##### Exemple : Clone avec plusieurs branches

```bash
# Cloner collab-repo qui a deux branches
$ git clone collab-repo
Cloning into 'local-copy'...
remote: Enumerating objects: 5, done.
Receiving objects: 100% (5/3), done.

# La branche locale par défaut (main) est créée
$ git status
On branch main
Your branch is up to date with 'origin/main'.

# Les autres branches distantes sont accessibles en tant que références
$ git branch -a
* main
  remotes/origin/main
  remotes/origin/develop

# Vous pouvez créer une branche locale depuis une branche distante
$ git checkout develop
Switched to a new branch 'develop'
Branch 'develop' set up to track 'origin/develop'.

# Maintenant develop est créée localement avec upstream configuré
$ git status
On branch develop
Your branch is up to date with 'origin/develop'.
```

**Comportement** :
1. Initialise un nouveau dépôt
2. Configure le remote `origin` pointant vers la source
3. Copie tous les objets du source
4. Crée les références de suivi `origin/*` pour chaque branche distante
5. Crée la branche locale pour la branche par défaut du source
6. Pose l'upstream de cette branche vers `origin/<branchname>`
7. Checkout et synchronise le working tree

**Code de sortie** : 0

---

### Récupérer les changements distants

#### `git fetch` — Mettre à jour les références distantes

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git fetch [<remote>] [<branche>]` |
| **Description** | Récupère les nouveaux commits et mises à jour de branches d'un dépôt distant, met à jour les références de suivi (`origin/*`). **Ne modifie jamais vos branches locales ou HEAD.** |
| **Options Phase 7** | Optionnel : `<remote>` (défaut : `origin`) ; optionnel : `<branche>` (défaut : toutes les branches) |

##### Concept clé : Fetch ≠ Merge

**`fetch` récupère**, **merge fusionne**.

`git fetch` copie les nouveaux commits du distant et met à jour les références de suivi, mais ne touche pas vos branches locales. C'est une opération sûre et non-destructrice. Pour intégrer les changements distants, vous devez explicitement merger ou rebase après fetch.

---

##### Exemple : Fetch depuis origin

```bash
# Vous avez un dépôt initialisé avec un remote "origin"
$ git remote -v
origin    https://github.com/user/project.git (fetch)

# Le distant a de nouveaux commits ; vous les récupérez
$ git fetch origin
From https://github.com/user/project.git
 * [new branch]      main       -> origin/main
 * [new branch]      develop    -> origin/develop

# Les références de suivi sont mises à jour
$ git branch -a
* main                   (votre branche locale)
  remotes/origin/main    (références de suivi)
  remotes/origin/develop

# Votre branche locale "main" est INCHANGÉE
# Mais "origin/main" pointe le commit distant le plus récent
```

**Comportement** :
1. Vérifie que le remote `origin` existe
2. Pour chaque branche distante :
   - Récupère le commit tip distant
   - Copie tous les objets manquants
   - Met à jour la référence de suivi (`origin/<branchname>`)
3. Affiche un résumé des branches mises à jour

**Code de sortie** : 0

---

##### Exemple : Fetch branche spécifique

```bash
# Récupérer uniquement la branche "develop"
$ git fetch origin develop
From https://github.com/user/project.git
 * branch            develop    -> origin/develop

# Seule "origin/develop" est mise à jour
# "origin/main" reste inchangée
```

---

##### Exemple : Fetch avec changement distant

```bash
# Cas 1 : Nouvelles commits sur le distant (fast-forward)
$ git fetch origin main
From https://github.com/user/project.git
 abc1234..def5678  main       -> origin/main

# Cas 2 : Distant a avancé après votre "origin/main" local
#         (vous aviez copié une version antérieure lors d'un clone antérieur)
$ git branch -vv
* main              abc1234 [origin/main: behind 2]

# Après fetch
$ git fetch origin main
From https://github.com/user/project.git
 abc1234..xyz9999  main       -> origin/main

$ git branch -vv
* main              abc1234 [origin/main: behind 4]
# Maintenant origin/main pointe 4 commits en avance
```

---

##### Fetch par défaut

```bash
# Sans argument, fetch depuis "origin" toutes les branches
$ git fetch
From https://github.com/user/project.git
 * [new branch]      hotfix     -> origin/hotfix
   branch            main       -> origin/main
   branch            develop    -> origin/develop
```

**Équivalent à** : `git fetch origin`

---

### Workflow complet : Clone + Fetch

Voici une session réaliste montrant le workflow distant :

```bash
# 1. Cloner un dépôt
$ git clone public-repo
Cloning into 'local-copy'...
...
$ git status
On branch main
Your branch is up to date with 'origin/main'.

# 2. Examiner votre historique local
$ git log --oneline
abc1234 Add file2
def5678 Add file1
ghi9012 Initial commit

# 3. Vérifier la branche par défaut et les références distantes
$ git branch -a
* main
  remotes/origin/main

$ git remote -v
origin    https://github.com/user/project.git (fetch)

# 4. Plus tard, le distant est mis à jour
#    (simulé : le catalogue change)

# 5. Récupérer les changements distants
$ git fetch origin
From https://github.com/user/project.git
 xyz1234..jkl5678  main       -> origin/main

# 6. Vérifier que votre branche locale est inchangée
$ git status
On branch main
Your branch is behind 'origin/main' by 2 commits.

# 7. Vous pouvez consulter les changements distants
$ git log origin/main
# Affiche les commits du distant

# 8. Fusionner les changements distants
$ git merge origin/main
Updating abc1234..jkl5678
Fast-forward
 file2.txt | 1 +
 1 file changed, 1 insertion(+)

# 9. Maintenant vous êtes à jour
$ git status
On branch main
Your branch is up to date with 'origin/main'.
```

---

### Erreurs courantes

#### Remote inexistant
```bash
$ git fetch nosuchremote
fatal: No remote named 'nosuchremote'
```
**Solution** : Vérifiez le nom avec `git remote` et ajoutez-le si nécessaire.

#### Clone dans un dépôt existant
```bash
$ git init && git clone public-repo
fatal: destination path '.' already exists and is not an empty directory.
```
**Solution** : Clone dans un répertoire vide ou créez un répertoire dédié.

#### Branche distante inexistante
```bash
$ git fetch origin nosuchbranch
fatal: Couldn't find remote ref nosuchbranch
```
**Solution** : Vérifiez les branches distantes avec `git branch -a`.

---

### Envoyer vos changements vers le distant

#### `git push` — Envoyer les commits locaux vers le dépôt distant

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git push [<remote>] [<branch>] [-u \| --set-upstream] [--force \| -f]` |
| **Description** | Envoie les commits locaux d'une branche vers le dépôt distant, met à jour les références de suivi locales, et protège contre les écritures non-fast-forward par défaut |
| **Options Phase 8** | `<remote>` : nom du distant (défaut : `origin`) ; `<branch>` : branche à pousser (défaut : branche courante ou upstream) ; `-u` / `--set-upstream` : configure l'upstream après le push ; `--force` / `-f` : force le push même si non-fast-forward |

##### Concept clé : Protection fast-forward

Contrairement à `fetch`, `push` **modifie le distant**. Pour éviter une perte de données accidentelle, Git **refuse** un push si :
- La branche distante a avancé d'une façon incompatible avec votre historique local
- Vous avez rebasé ou rembobiné votre branche

C'est le **non-fast-forward check**. Vous devez résoudre avec un `pull` d'abord, ou forcer avec `--force` (à utiliser avec précaution !).

---

##### Exemple 1 : Push simple (fast-forward)

**Situation** :
- Vous avez 2 commits locaux sur `main` que le distant n'a pas
- Personne d'autre n'a poussé vers `main` distant

```bash
$ git log --oneline
abc1234 My second commit
def5678 My first commit
ghi9012 Initial commit (same as origin/main)

$ git push origin main
Pushing to origin...
 def5678..abc1234  main -> main
Your branch is up to date with 'origin/main'.

# Le distant est maintenant à jour
$ git status
On branch main
Your branch is up to date with 'origin/main'.
```

---

##### Exemple 2 : Push avec `-u` (configuration upstream)

**Situation** :
- Vous avez une branche locale `feature` sans upstream configuré
- Vous voulez pousser vers le distant ET configurer le suivi

```bash
$ git branch -vv
  main                abc1234 [origin/main]
  feature             def5678 (no upstream)

$ git push -u origin feature
Pushing to origin...
 * [new branch]      feature -> feature
Branch 'feature' set up to track 'origin/feature'.

# Maintenant feature a un upstream
$ git branch -vv
  feature             def5678 [origin/feature]

# `git push` sans arguments pousse vers origin/feature
$ git push
Pushing to origin...
Everything up-to-date.
```

---

##### Exemple 3 : Push rejeté (non-fast-forward)

**Situation** :
- Vous avez rebasé `main` localement
- Le distant a une version antérieure
- Quelqu'un d'autre a aussi poussé entre-temps

```bash
$ git log --oneline
abc1234 Rebased commit (local)
def5678 Initial commit

$ git branch -vv
* main                abc1234 [origin/main: ahead 1]

# Le distant est à origin/main : ghi9012 (un commit différent)
# Vous essayez de pousser sans --force
$ git push origin main
To <url>
 ! [rejected]       main -> main (non-fast-forward)
error: failed to push some refs to '<url>'

# Solution 1 : Pull d'abord pour intégrer les changements distants
$ git pull
# Cela merge ou rebase les changements distants dans votre branche

# Solution 2 : Force le push (à utiliser avec prudence si vous travaillez seul)
$ git push --force origin main
To <url>
 + ghi9012...abc1234 main -> main (forced update)
```

⚠️ **Attention** : `--force` écrase l'historique distant. N'utilisez que si vous êtes certain que c'est intentionnel et que personne d'autre n'a basé de travail sur la version antérieure.

---

##### Exemple 4 : Push sans upstream (erreur)

**Situation** :
- Vous tapez `git push` sans arguments
- Votre branche courante n'a pas d'upstream configuré

```bash
$ git push
fatal: The current branch feature has no upstream branch.
To push the current branch and set the remote as upstream, use
    git push --set-upstream origin feature

# Solution : utilisez -u pour configurer
$ git push -u origin feature
```

---

### Récupérer et intégrer les changements distants

#### `git pull` — Récupérer et fusionner les changements distants

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git pull [options] [<remote>] [<branch>]` |
| **Description** | Combinaison de `git fetch` + intégration (merge ou rebase) : récupère les nouveaux commits distants et les fusionne ou rejoue dans votre branche courante |
| **Options Phase 8** | `[<remote>]` : nom du distant (défaut : origin) ; `[<branch>]` : branche à puller (défaut : branche upstream) ; `--rebase` : utilise rebase au lieu de merge ; `--no-rebase` : force merge (défaut) |

##### Concept : Fetch + Merge (ou Rebase)

`git pull` est un raccourci pour :
1. `git fetch [<remote>] [<branch>]` — Copie les objets distants, met à jour les références de suivi
2. Intégration : **merge** (par défaut) ou **rebase** (si `--rebase`)

Cela permet de récupérer ET d'intégrer en une seule commande, idéal dans un workflow collaboratif.

---

##### Exemple 1 : Pull simple (fast-forward merge)

**Situation** :
- Vous avez clonée `main` depuis le distant
- Le distant a de nouveaux commits
- Vous n'avez fait aucun commit local

```bash
$ git status
On branch main
Your branch is behind 'origin/main' by 2 commits.

$ git pull
From <url>
 abc1234..def5678  main       -> origin/main
Updating abc1234..def5678
Fast-forward
 file.txt | 1 +
 1 file changed, 1 insertion(+)

$ git status
On branch main
Your branch is up to date with 'origin/main'.
```

---

##### Exemple 2 : Pull avec merge (branches divergentes)

**Situation** :
- Vous avez 1 commit local sur `main`
- Le distant a avancé aussi (commits différents)
- Pas de conflit

```bash
$ git log --oneline
abc1234 My local change
def5678 Initial commit (shared)

$ git pull origin main
From <url>
 def5678..ghi9012  main       -> origin/main
Merge made by the '3-way' merge strategy.
 remote.txt | 1 +
 1 file changed, 1 insertion(+)

# Un commit de merge est créé
$ git log --oneline
jkl3456 Merge branch 'main' of <url>
abc1234 My local change
ghi9012 Remote change
def5678 Initial commit
```

---

##### Exemple 3 : Pull avec conflit

**Situation** :
- Vous et quelqu'un d'autre avez modifié le même fichier
- Le pull détecte un conflit

```bash
$ git pull origin main
From <url>
 ...
CONFLICT (content): Merge conflict in config.txt
Automatic merge failed.

$ git status
On branch main
You have unmerged paths.
  (fix conflicts and run "git commit")

Unmerged paths:
  (use "git add <file>..." to mark resolution)
        both modified: config.txt

# Résoudre le conflit
$ read config.txt
<<<<<<< HEAD
DEBUG = true
=======
DEBUG = false
>>>>>>> origin/main

# Choisir ou combiner
$ write config.txt "DEBUG = true"
$ git add config.txt
$ git commit -m "Resolve merge conflict"
[main jkl3456] Merge branch 'main'
```

---

##### Exemple 4 : Pull avec --rebase (historique linéaire)

**Situation** :
- Vous avez 1 commit local
- Le distant a avancé
- Vous préférez une histoire linéaire (pas de merge)

```bash
$ git pull --rebase origin main
From <url>
 def5678..ghi9012  main       -> origin/main
First, rewinding head to replay your work on top of main...
Applying: My local change

$ git log --oneline
abc1234 My local change (nouveau hash !)
ghi9012 Remote change
def5678 Initial commit
```

**Différence** : Avec `--rebase`, vos commits sont rejoués au-dessus des commits distants, au lieu de créer un merge commit. Historique plus propre, mais nécessite attention si vous avez partagé vos commits.

---

### Suivi des branches (Upstream tracking)

#### Configurer le suivi : `git branch --set-upstream-to`

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git branch --set-upstream-to=<remote>/<branch> [<branchname>]` (ou `-u` pour court) |
| **Description** | Configure la relation entre une branche locale et une branche distante, permettant à `git pull`/`git push` de deviner le destination par défaut |

**Exemples** :

```bash
# Configurer main pour suivre origin/main
$ git branch -u origin/main

# Configurer feature pour suivre origin/develop (branche différente)
$ git branch -u origin/develop feature

# Vérifier l'upstream configuré
$ git branch -vv
* main                abc1234 [origin/main: ahead 1]
  feature             def5678 [origin/develop]
```

Une fois configurée, vous pouvez :
- `git pull` sans arguments → pull depuis l'upstream
- `git push` sans arguments → push vers l'upstream
- `git status` affiche un message de suivi (ahead/behind)

---

#### Affichage détaillé : `git branch -vv`

| Aspect | Détail |
|--------|--------|
| **Syntaxe** | `git branch -vv` (verbose verbose) |
| **Description** | Liste les branches avec le commit court, l'upstream, et l'écart (ahead/behind) |

**Exemple** :

```bash
$ git branch -vv
  main                abc1234 [origin/main: ahead 2, behind 1]
  feature             def5678 [origin/develop]
  develop             ghi9012 (no upstream)
```

**Colonnes** :
1. `*` : branche courante
2. Nom de branche
3. Hash court du commit
4. Upstream et écart :
   - `[origin/main]` : à jour
   - `[origin/main: ahead 2]` : 2 commits à pousser
   - `[origin/main: behind 3]` : 3 commits à récupérer
   - `[origin/main: ahead 1, behind 2]` : divergence
   - `(no upstream)` : pas d'upstream configuré

---

#### Retirer le suivi : `git branch --unset-upstream`

```bash
$ git branch --unset-upstream feature
$ git branch -vv
  feature             def5678 (no upstream)
```

---

### Messages de suivi dans `git status`

Quand une branche a un upstream configuré, `git status` affiche un message de suivi :

```bash
# Ahead (à pousser)
$ git status
On branch main
Your branch is ahead of 'origin/main' by 2 commits.
  (use "git push" to publish your local commits)

# Behind (à récupérer)
$ git status
On branch feature
Your branch is behind 'origin/develop' by 3 commits, and can be fast-forwarded.
  (use "git pull" to update your local branch)

# Diverged (branches divergentes)
$ git status
On branch feature
Your branch and 'origin/develop' have diverged,
and have 1 and 2 different commits each, respectively.
  (use "git pull" to merge the remote branch into yours)

# Up to date (synchronisé)
$ git status
On branch main
Your branch is up to date with 'origin/main'.
```

---

### Workflow complet : Collaboration locale-distante

Voici une session réaliste illustrant tout le workflow distant :

```bash
# 1. Cloner un dépôt
$ git clone collab-repo
Cloning into 'local-copy'...
...

# 2. Vérifier l'état : main a un upstream d'emblée
$ git branch -vv
* main    abc1234 [origin/main]

# 3. Créer une branche feature
$ git switch -c feature
$ write feature.txt "New feature"
$ git add feature.txt
$ git commit -m "Add feature"
[feature def5678] Add feature

# 4. Pousser feature vers le distant avec upstream
$ git push -u origin feature
...
Branch 'feature' set up to track 'origin/feature'.

# 5. Plus tard, le distant a des changements sur main
# (quelqu'un d'autre a poussé)

# 6. Récupérer les changements (pull)
$ git checkout main
$ git pull
From <url>
 abc1234..ghi9012  main       -> origin/main
Fast-forward
 ...

$ git status
On branch main
Your branch is up to date with 'origin/main'.

# 7. Basculer sur feature et pousser
$ git checkout feature
$ write feature.txt "Updated feature"
$ git add feature.txt
$ git commit -m "Improve feature"
[feature xyz1234] Improve feature

# Push sans arguments (utilise origin/feature)
$ git push
Pushing to origin...
 def5678..xyz1234  feature -> feature

# 8. Afficher l'écart
$ git branch -vv
  main              ghi9012 [origin/main]
* feature           xyz1234 [origin/feature]
```

---

## Visualisation du distant (Phase 9)

### Modes d'affichage du graphe : Local, Split, Distant

La visualisation graphique peut afficher le dépôt local, le distant, ou les deux côte à côte pour suivre votre synchronisation.

#### Trois modes disponibles

**Toolbar en haut du graphe** :

```
[Local] [Split] [Remote]
```

- **Local** : Graphe local seul (plein écran)
- **Split** : Deux graphes côte à côte (local | distant)
- **Remote** : Graphe distant seul (plein écran, si distant existe)

Cliquez sur un bouton pour basculer de mode.

#### Mode 1 : Local (par défaut si pas de distant)

Affiche uniquement votre dépôt local avec vos branches, commits et HEAD.

```
┌─────────────────────┐
│ [Local] Split ...   │
├─────────────────────┤
│                     │
│   Graphe local      │
│   (vos branches)    │
│                     │
└─────────────────────┘
```

**Commandes pour explorer** :
- **Scroll** : zoom in/out
- **Clic droit + drag** : pan (déplacer le graphe)
- **Hover** : tooltip avec hash complet et message
- **Clic** : sélectionner un commit

#### Mode 2 : Split (par défaut si distant existe)

Affiche le graphe local ET le graphe distant côte à côte. Pratique pour voir ce qui a été poussé, ce qui reste à récupérer.

```
┌────────────────┬────────────────┐
│ [Local] Split …| Remote         │
├────────────────┼────────────────┤
│   Local        │   Remote       │
│                │  (origin)      │
│   Graphe       │                │
│   local        │   Graphe       │
│                │   distant      │
└────────────────┴────────────────┘
```

**Observation clé** :
- À gauche : votre branche locale `main` avec vos commits
- À droite : la branche `main` distante (origin/main) avec ses commits
- **Commits décorés par `[origin/main]`** sur le graphe local (sections 3.2 ci-dessous)

**Interaction** :
- Chaque graphe est zoomable et panning indépendamment
- Option (optionnelle) : **« Zoom/Pan synchronisés »** pour synchroniser les actions sur les deux

#### Mode 3 : Remote (si distant existe)

Affiche uniquement le graphe distant, sans vos branches locales.

```
┌─────────────────────┐
│ Local Split [Remote]│
├─────────────────────┤
│                     │
│   Graphe distant    │
│   (origin)          │
│                     │
└─────────────────────┘
```

Utile pour inspecter uniquement l'état du dépôt distant sans distraction.

#### Condition : Pas de distant ?

Si vous n'avez pas de remote configuré (pas de `git clone` ou `git remote add`), seul le mode **Local** est disponible. Les boutons **Split** et **Remote** sont grisés (désactivés).

```
┌─────────────────────┐
│ [Local] [Split] ... │ ← Split/Remote grisés
├─────────────────────┤
│                     │
│   Graphe local      │
│                     │
│ « Exécutez git clone │
│  ou git remote add  │
│  origin <url>       │
│  pour afficher le   │
│  distant »          │
└─────────────────────┘
```

### Décorations visuelles : Suivi de la synchronisation

Quand un distant est présent, le graphe local reçoit des décorations visuelles pour montrer ce qui a été synchronisé.

#### Badges `origin/<branche>` sur le graphe local

Sur le graphe local, un **badge gris** nommé `origin/main` apparaît sur le commit qui correspond à la dernière version distante.

**Exemple** :

```
C5 [HEAD] [main]         ← Vous êtes ici, 1 commit en avance
│
C4 [origin/main]         ← Dernière version poussée
│
C3
│
C2
│
C1
```

**Format du badge** :
- Couleur : gris clair (différent des branches bleues)
- Label : `origin/branchname` (ex. `origin/feature`)
- Présent uniquement si cette branche distante existe

#### Surlignage : Commits non-poussés (graphe local)

Les commits qui n'ont pas été poussés (absents de `origin/*`) sont **surlignés** visuellement pour vous avertir.

**Visuel** :
- **Bordure épaissie** ou **halo coloré** autour du nœud
- Couleur : orange ou accent distinctif

**Exemple** :

```
C5 ●━━ Surlignage (non-poussé)
│
C4 ● Normal (poussé)
│
C3 ●━━ Surlignage (nouveau commit local)
```

Pour pousser ces commits, utilisez `git push` dans le terminal ou le bouton **[Push]** de la sidebar.

#### Surlignage : Commits non-récupérés (graphe distant)

En mode **Split** ou **Remote**, les commits présents sur le distant mais absents localement sont **surlignés**.

**Visuel** :
- **Bordure épaissie** ou **halo** distinctif
- Couleur : bleu ou accent different

**Exemple (graphe distant)** :

```
C6 ●━━ Surlignage (non-récupéré)
│
C5 ● Normal (déjà copié)
```

Pour récupérer, utilisez `git fetch` ou `git pull`.

### Barre latérale enrichie : Section « Distant »

La **RefsSidebar** (zone gauche) contient maintenant une section **« Distant »** si un remote est configuré.

#### Structure

**Après la section « Commandes récentes »**, vous trouverez :

```
Distant
  origin
  https://github.com/user/project.git
  
  Upstream (main)
  Branches:
    [*] main
        ↑ 2 ↓ 0 [origin/main]
    [ ] feature
        ↑ 1 ↓ 0 [origin/feature]
    [ ] develop
        ↑ 0 ↓ 3 (no upstream)
  
  [Fetch]  [Push]  [Pull]
```

#### Remotes et URLs

**Remotes affichés** : la liste de tous les dépôts distants configurés (généralement juste `origin`).

```
Distant
  origin
  https://github.com/user/project.git
```

L'URL est cosmétique (pas de vérification réseau réelle).

#### Branches avec indicateurs de suivi

**Pour chaque branche locale**, une ligne affiche :

```
[*] main                         ← Branche courante (*)
    ↑ 2 ↓ 0 [origin/main]       ← Ahead 2, Behind 0, upstream: origin/main

[ ] feature
    ↑ 1 ↓ 3 [origin/feature]    ← À pousser (1), à récupérer (3)

[ ] develop
    ↑ 0 ↓ 0 (no upstream)       ← Pas d'upstream configuré
```

**Format** :
- `[*]` ou `[ ]` : indicateur si branche courante
- `↑N` : N commits à pousser (couleur verte ou neutre)
- `↓M` : M commits à récupérer (couleur orange/warning)
- `[origin/branchname]` : upstream configuré (ex. `[origin/main]`)
- `(no upstream)` : branche locale sans suivi

**Cas particuliers** :
- Si `↑0` et `↓0` : branche à jour (couleur verte)
- Si `↑0` et `↓>0` : vous avez du retard (orange)
- Si `↑>0` et `↓>0` : divergence (branche et upstream ont évolué différemment, orange/warning)

#### Boutons d'action

Trois boutons exécutent les commandes distantes courantes sur la branche courante :

```
[Fetch]  [Push]  [Pull]
```

**Comportement** :

- **[Fetch]** : Exécute `git fetch origin`
  - Met à jour toutes les références de suivi
  - Ne touche pas vos branches locales
  - Idéal pour voir ce qui a changé sans intégrer

- **[Push]** : Exécute `git push origin <branche>`
  - Envoie les commits locaux vers le distant
  - Échoue si non-fast-forward (vous devez d'abord `pull`)
  - Configure automatiquement l'upstream si première poussée

- **[Pull]** : Exécute `git pull origin <branche>`
  - Combine fetch + merge
  - Intègre les changements distants dans votre branche
  - Peut créer un merge commit ou rebase selon votre config

**Important** : Si HEAD est détaché (pas sur une branche), les boutons Push/Pull affichent un message d'erreur : « Vous devez être sur une branche pour push/pull ».

### Scénarios distants : Apprendre la collaboration

Quatre nouveaux scénarios pédagogiques montrent des workflows collaboratifs courants. Accédez-les via la **RefsSidebar**, section **« Scénarios d'apprentissage »** (catégorie « Collaboration »).

#### Scénario 7 : Clone, Commit & Push (Facile)

**Description** : Cloner un dépôt, ajouter un commit local, et le pousser vers le distant.

**Concept** : Workflow basique de synchronisation.

**Commandes** :

```bash
git clone public-repo
write feature.txt "New feature"
git add feature.txt
git commit -m "Add feature"
git push
```

**État final attendu** :
- Branche locale `main` et `origin/main` pointent le même commit
- `git branch -vv` affiche : `main ... [origin/main]` (à jour)
- Graphe : commit local déclaré avec badge `[origin/main]`

**Apprentissage** : Voir comment le push synchronise votre travail local vers le distant.

---

#### Scénario 8 : Fetch divergent & Pull (merge) (Moyen)

**Description** : Le distant a avancé pendant que vous committiez localement. Récupérez et intégrez par une fusion.

**Concept** : Gestion de branches divergentes.

**Commandes** :

```bash
git clone diverged-repo
write local.txt "Local work"
git add local.txt
git commit -m "Local change"
git fetch
git pull --no-rebase
```

**État final attendu** :
- Un **commit de merge** à deux parents (local et distant)
- Graphe affiche une fusion explicite
- `tracking.main` montre ahead/behind après sync

**Apprentissage** : Voir comment les branches convergent à nouveau après divergence.

---

#### Scénario 9 : Push rejeté → Pull --rebase → Push (Moyen)

**Description** : Vous tentez un push, mais il est rejeté (le distant a avancé). Vous rebasez votre travail et renvoyez.

**Concept** : Résolution d'un push non-fast-forward.

**Commandes** :

```bash
git clone diverged-repo
write local.txt "Local work"
git add local.txt
git commit -m "Local change"
git push
# ← REJECT: non-fast-forward
git pull --rebase
git push
```

**État final attendu** :
- Historique **linéaire** (pas de merge commit)
- Vos commits rejoués avec nouveaux hashes
- Graphe : ligne droite sans branchement
- `tracking.main` synchronisé

**Apprentissage** : Workflow de rebase pour un historique propre en collaboration.

---

#### Scénario 10 : Collaboration : deux branches (Moyen)

**Description** : `main` et `develop` divergent, chacune reçoit des commits, puis les deux sont poussées sélectivement.

**Concept** : Workflow avec plusieurs branches et upstream.

**Commandes** :

```bash
git init
write shared.txt "Base"
git add shared.txt
git commit -m "Base commit"
git remote add origin local://origin
git push -u origin main
git checkout -b develop
write dev.txt "Develop feature"
git add dev.txt
git commit -m "Develop work"
git push -u origin develop
git checkout main
write main.txt "Main feature"
git add main.txt
git commit -m "Main work"
git push
```

**État final attendu** :
- Dépôt distant contient deux branches : `main` et `develop`
- Les deux branches locales ont upstreams configurés
- `git branch -vv` affiche deux lignes synchronisées
- Graphe local : deux branches indépendantes, toutes deux à jour

**Apprentissage** : Gestion de plusieurs branches en collaboration.

---

#### Comment charger un scénario Distant

1. Ouvrez la **RefsSidebar** (gauche)
2. Scroll jusqu'à **« Scénarios d'apprentissage »**
3. Dans la catégorie **« Collaboration »**, cliquez sur le scénario (ex. "Clone & Push")
4. Une confirmation : « Êtes-vous sûr ? Le dépôt sera réinitialisé »
5. Cliquez **« Charger »**
6. Toutes les commandes du scénario s'exécutent silencieusement
7. Explorez le graphe, la sidebar, et l'état final

**Important** : Charger un scénario **réinitialise votre dépôt**. Tout travail antérieur est perdu.

---

## Inspecter les différences : `git diff` & `git show` (Axe B1)

### `git diff` — comparer des états

```bash
git diff                    # working tree vs index (modifs non stagées)
git diff --staged           # index vs HEAD (modifs stagées) ; --cached = alias
git diff <commit>           # working tree vs un commit / une branche
git diff <commit1> <commit2># entre deux commits/branches
git diff HEAD~1 HEAD        # révisions acceptées (HEAD~n, tags, hash, branches)
git diff -- <chemin>...     # limiter la comparaison à certains chemins
```

La sortie suit le format de Git (`diff --git a/… b/…`, `index …`, `@@ … @@`,
lignes `+`/`-`) et est **colorisée** dans le terminal : vert = ajout, rouge =
suppression, cyan = en-tête de bloc (`@@`), gris = en-têtes de fichier. Les
fichiers binaires (contenant un octet nul) affichent `Binary files … differ`.

### `git show` — examiner un commit

```bash
git show          # HEAD par défaut
git show <commit> # hash, branche, tag, ou révision (HEAD~n)
```

Affiche les métadonnées du commit (`commit <hash>`, `Author:`, `Date:`, message)
puis le diff vs son premier parent (ou vs l'arbre vide pour le commit initial).

---

## Gérer les fichiers : `git rm` & `git mv` (Axe B1)

### `git rm` — supprimer / désindexer

```bash
git rm file.txt          # supprime du working tree ET de l'index (suppression stagée)
git rm --cached file.txt # retire de l'index seulement → le fichier redevient untracked (??)
git rm -r dir/           # suppression récursive d'un répertoire
git rm -f file.txt       # force, même si le fichier a des modifications non stagées
```

Refuse par défaut (exit 1) un fichier **modifié non stagé** (`local modifications`)
ou aux **changements stagés** différents de HEAD (`staged content…`). Après un
`git rm`, le fichier apparaît `D` (deleted, stagé) dans `git status -s`.

### `git mv` — déplacer / renommer

```bash
git mv old.txt new.txt   # renomme (hash du blob conservé)
git mv file.txt dir/     # déplace dans un répertoire (sous le même nom)
git mv -f a.txt b.txt    # écrase la destination si elle existe
```

Refuse (exit 128) si la **destination existe** (sans `-f`), si la **source est
absente**, ou si **source == destination**. Le renommage préserve le hash du blob.

> **Conflit delete/modify** : `git rm <fichier>` + commit sur une branche, puis
> `git merge` depuis une branche qui a modifié le même fichier, produit un
> conflit de fusion (`operationState: merging`) — résolvable via `git add`
> (garder) ou `git rm` (accepter la suppression).

---

## À venir en Phase 10+

Les fonctionnalités suivantes ne sont **pas disponibles en Phase 9** mais seront implémentées ultérieurement :

- **Interactions avancées** : Clic sur une branche pour checkout, clic sur tag pour inspect
- **Historique avancé** : `git log -p` (affichage des diffs), `git log --follow` (historique des fichiers renommés)
- **Shell interactif** : Un shell complet avec `echo`, `cat`, `touch`, etc.
- **Export/Import** : Sauvegarder une session en fichier, charger depuis un fichier
- **`git remote set-url`** : Modifier l'URL d'un remote
- **`git push --delete`** : Supprimer une branche distante
- **Animations** : Transitions visuelles lors du fetch/push
- **Dark mode** : Thème sombre pour le terminal et graphe

**Phase 9 ajoute la visualisation complète du workflow distant** : comprenez ce qui est local, ce qui est distant, et explorez les scénarios de collaboration sans réseau réel !

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

**Phase 4 – Fusion et réécriture d'historique :**
- **Syntaxe de révision** : `HEAD~n` pour référencer des commits antérieurs
- `git merge [--no-ff] [-m <message>]` — Fusionner les branches (fast-forward ou true merge)
- `git reset [--soft | --mixed | --hard]` — Déplacer HEAD et réinitialiser index/working tree
- `git revert` — Créer un commit d'annulation des changements
- `git cherry-pick` — Appliquer un commit isolé sur HEAD
- `git rebase [--continue | --abort]` — Rejouer des commits sur une nouvelle base
- **Gestion simplifiée des conflits** : marqueurs standards, résolution manuelle + `git add` + `git commit`

**Phase 5 – Outils avancés :**
- `git rebase -i <base>` — Rebase interactif avec modale visuelle (pick, reword, squash, fixup, drop, réordonnancement)
- `git stash [push | list | pop | apply | drop]` — Pile de stash pour ranger/restaurer les modifications
- `git reflog [show] [<ref>]` — Historique des mouvements de HEAD et des branches
- **Révisions** : `HEAD@{n}` pour accéder aux états antérieurs du reflog
- **Résolution de conflits avancée** : gestion des conflits lors du squash et du rebase interactif

**Phase 6 – Finitions et Developer Experience :**
- `git help` / `git help <commande>` — Aide intégrée sur les commandes
- **Builtin `clear`** : efface l'écran du terminal (comme sous Linux), sans toucher au dépôt
- **Chaînage de commandes** : `;` enchaîne inconditionnellement, `&&` n'exécute la suivante que si la précédente a réussi. Ex. `git add . && git commit -m "msg"` ou `clear ; git log`. Les séparateurs entre guillemets (`-m "a; b"`) ne sont pas interprétés.
- **Autocomplétion Tab** : complète les noms de commandes, flags, branches et tags
- **Persistance automatique** : sauvegarde du dépôt dans localStorage, restauration au rechargement
- **Scénarios pédagogiques** : 5 scénarios préchargés pour apprendre Git (Branche & Merge, Merge --no-ff, Conflit, Cherry-pick & Tag, Reset & Undo)
- **RefsSidebar enrichie** : affichage de branches, HEAD, tags, opération en cours, stash, commandes récentes, avec boutons d'interaction

**Phase 7 – Dépôts distants :**
- `git remote` — Lister, ajouter ou supprimer des dépôts distants
- `git remote -v` — Afficher les remotes avec leurs URLs (cosmétiques)
- `git remote add <nom> <url>` — Configurer un nouveau remote
- `git remote remove <nom>` (alias `rm`) — Supprimer un remote
- `git clone <source>` — Cloner un dépôt source prédéfini (public-repo, collab-repo)
- `git fetch [<remote>] [<branche>]` — Récupérer les changements distants et mettre à jour les références de suivi
- **Références de suivi** : `origin/main`, `origin/develop` etc., mises à jour uniquement par fetch/clone
- **Dépôts source prédéfinis** : `public-repo` (simple), `collab-repo` (avec branches)
- **Concept** : Fetch récupère sans modifier les branches locales ; à fusionner explicitement

**Phase 8 – Push, Pull & Upstream tracking :**
- `git push [<remote>] [<branch>] [-u | --set-upstream] [--force | -f]` — Envoyer les commits locaux vers le distant
- **Protection fast-forward** : refus du push non-fast-forward (sauf `--force`)
- **Configuration upstream** : `-u` après un push configure le suivi automatique
- `git pull [<remote>] [<branch>] [--rebase]` — Récupérer + intégrer : fetch puis merge ou rebase
- `git branch --set-upstream-to=<remote>/<branch>` (ou `-u`) — Configurer l'upstream d'une branche
- `git branch --unset-upstream` — Retirer l'upstream
- `git branch -vv` — Affichage détaillé avec upstream et ahead/behind count
- **Messages de suivi** : `git status` affiche l'écart (ahead/behind/diverged/gone)
- **Révisions** : `@{upstream}` / `@{u}` pour référencer le commit de l'upstream
- **Workflow collaboratif** : clone → commit → push/pull pour la synchronisation continue

### Workflow complet

1. Initialisez un dépôt (`git init`)
2. Créez et stagez des fichiers (`write`, `git add`)
3. Commitez (`git commit`)
4. Gérez les branches (`git branch`, `git checkout`)
5. **Visualisez votre historique en graphe** (Phase 3)
6. **Fusionnez, rebasez, et réécrivez votre historique** (Phase 4)
7. **Utilisez les outils avancés** : rebase interactif, stash, reflog (Phase 5)
8. **Découvrez avec autocomplétion et aide** : tap Tab pour compléter, `git help` pour apprendre (Phase 6)
9. **Chargez des scénarios** pour apprendre, explorez la sidebar pour maîtriser l'état (Phase 6)
10. **Clonez et synchronisez avec des dépôts distants** : `git clone`, `git fetch`, `git remote` (Phase 7)
11. **Poussez et tirez les changements** : `git push`, `git pull`, et configurez le suivi avec `git branch -u` (Phase 8)

Vous pouvez explorer et maîtriser votre dépôt Git directement dans le terminal web avec un contrôle complet du workflow collaboratif : création de branches, fusion, réécriture d'historique, rebase interactif avec édition visuelle, gestion des modifications temporaires via stash, et récupération des commits "perdus" via reflog. La **Phase 7 ajoute le modèle distant** : clonez des dépôts prédéfinis, configurez plusieurs remotes, et synchronisez vos changements via fetch. La **Phase 8 complète la synchronisation** : poussez vos commits locaux vers le distant avec `git push` (protection fast-forward incluse), récupérez et intégrez les changements avec `git pull` (merge ou rebase), et configurez le suivi des branches pour que Git devine les destinations par défaut. Tout cela avec une vue d'ensemble visuelle et intuitive grâce au graphe interactif, aidé par l'autocomplétion intelligente, les scénarios pédagogiques, et une sidebar enrichie pour maîtriser chaque aspect du dépôt local et distant !
