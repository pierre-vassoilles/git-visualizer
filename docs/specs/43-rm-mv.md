# Phase 6+ : git rm & git mv

## Résumé

Les commandes `git rm` et `git mv` permettent de gérer les fichiers dans le dépôt : suppression avec désindexation, et déplacement/renommage. Elles modifient l'index et le working tree, et préparent les changements pour le prochain commit.

**Points clés** :
- **`git rm`** : supprime un fichier du working tree ET de l'index (le désuivit complètement). Optionnellement (`--cached`), retire du suivi sans supprimer du WT.
- **`git mv`** : renomme/déplace un fichier dans le WT ET l'index. Git détecte automatiquement le renommage (même hash de blob, chemin différent).
- **Sémantique de sécurité** : refus si le fichier a des modifications non stagées (sauf `-f/--force`).

## Syntaxe

### git rm

```
git rm [options] <pathspec...>
```

### Options supportées

| Option | Comportement | Notes |
|--------|-------------|-------|
| (aucun) | Supprime du WT et de l'index | Par défaut |
| `--cached` | Supprime de l'index uniquement, garde le WT | Désindexation sans suppression physique |
| `-r` ou `--recursive` | Supprimer récursivement un répertoire | Appliqué à tous les fichiers du répertoire |
| `-f` ou `--force` | Force la suppression même si modifié | Contourne la vérification de modification |

### git mv

```
git mv [options] <src> <dst>
```

### Options supportées

| Option | Comportement | Notes |
|--------|-------------|-------|
| (aucun) | Déplace/renomme le fichier | Par défaut |
| `-f` ou `--force` | Force le déplacement, écrase la destination | Si destination existe |

## Concepts fondamentaux

### git rm

#### Logique nominale

1. **Résoudre le pathspec** : Identifier tous les fichiers matchant `<pathspec>`.
2. **Vérifier les modifications** :
   - Si le fichier a des changements non stagés (WT ≠ index) : refuser avec erreur (à moins de `-f`)
   - Si le fichier a des changements stagés (index ≠ HEAD) : refuser (strictement)
3. **Supprimer** :
   - Supprimer du working tree (si pas `--cached`)
   - Supprimer de l'index
4. **Résultat** : Le fichier est complètement désindexé. Un `git commit` ultérieur enregistrera la suppression.

#### Mode --cached

**Cas spécial** : `git rm --cached <path>` retire le fichier de l'index SANS le supprimer du WT.

**Résultat** : Le fichier devient untracked (visible comme « ?? » dans `git status -s`).

**Cas de sécurité** : Pas de vérification de modification ; `--cached` est une opération de désindexation pure.

#### Mode --recursive (-r)

Appliquer la suppression à tous les fichiers d'un répertoire (récursivement).

Exemple : `git rm -r src/` supprime tous les fichiers du répertoire `src/` (s'il y en a).

#### Mode --force (-f)

Contourner la vérification « fichier modifié » et forcer la suppression.

### git mv

#### Logique nominale

1. **Résoudre le source** : Vérifier que `<src>` existe dans l'index et le WT
2. **Valider la destination** : 
   - Si `<dst>` existe et n'est pas un répertoire : erreur (à moins de `-f`)
   - Si `<dst>` est un répertoire : traiter comme `mv src dst/`
3. **Déplacer le fichier** :
   - Renommer dans le working tree : `WT[dst] = WT[src]`, supprimer `WT[src]`
   - Renommer dans l'index : `index[dst] = index[src]`, supprimer `index[src]`
4. **Détection de renommage** : Git détecte implicitement le renommage (même blob hash, chemin différent). Un `git commit` ultérieur enregistrera le changement comme un renommage (optionnel : afficher le statut « renamed » dans `git status`).

#### Mode --force (-f)

Si `<dst>` existe, l'écraser (remplacer le fichier de destination).

### Interaction avec git status

Après `git rm` ou `git mv`, le `git status` doit refléter les changements :

- **`git rm <path>`** : Le fichier apparaît comme « deleted » (staged) dans `git status -s` (code `D `)
- **`git rm --cached <path>`** : Le fichier devient untracked dans `git status -s` (code `??`)
- **`git mv <src> <dst>`** : Le fichier ancien disparaît, le nouveau apparaît comme `renamed from <src>` dans le long format (optionnel en Phase 1 ; code court : `R  <src> -> <dst>` selon Git 2.0+, ou simplement `A  <dst>` / `D  <src>`)

## Comportement nominal

### Cas 1 : git rm <path> (suppression simple)

**Condition** : Un pathspec, pas de flag.

**Processus** :
1. Résoudre le pathspec → fichier `F`
2. Vérifier que `F` est dans l'index
3. Vérifier que le contenu du WT de `F` correspond exactement au contenu de l'index (pas de modification unstaged)
4. Vérifier que le contenu de l'index est IDENTIQUE au contenu du HEAD (pas de modification stagée différente)
5. Supprimer `F` du WT
6. Supprimer `F` de l'index
7. **Sortie** : Aucune (succès muet)
8. **Code de sortie** : 0

### Cas 2 : git rm --cached <path> (désindexation)

**Condition** : Flag `--cached`.

**Processus** :
1. Résoudre le pathspec → fichier `F`
2. Vérifier que `F` est dans l'index
3. Supprimer `F` de l'index UNIQUEMENT
4. Le WT n'est pas touché
5. **Sortie** : Aucune
6. **Code de sortie** : 0

### Cas 3 : git rm -r <dir> (suppression récursive)

**Condition** : Flag `-r` (ou `--recursive`), et `<dir>` est un répertoire.

**Processus** :
1. Énumérer tous les fichiers du répertoire (récursivement)
2. Pour chaque fichier, appliquer les mêmes vérifications et suppressions que Cas 1
3. **Sortie** : Aucune
4. **Code de sortie** : 0

### Cas 4 : git rm -f <path> (force)

**Condition** : Flag `-f` (ou `--force`).

**Processus** :
1. Résoudre le pathspec
2. **Omettre la vérification de modification** (ne pas refuser si WT ≠ index)
3. Supprimer du WT et de l'index
4. **Sortie** : Aucune
5. **Code de sortie** : 0

### Cas 5 : git mv <src> <dst> (déplacement/renommage)

**Condition** : Deux pathspecs, pas de flag.

**Processus** :
1. Résoudre `<src>` → fichier source
2. Vérifier que `<src>` existe dans l'index ET le WT
3. Vérifier que `<src>` a les MÊMES contenus dans WT et index (pas de modification unstaged)
4. Résoudre `<dst>` :
   - Si `<dst>` existe ET est un répertoire : traiter comme `mv <src> <dst>/<basename(src)>`
   - Si `<dst>` existe ET n'est pas un répertoire : erreur (à moins de `-f`)
   - Si `<dst>` n'existe pas : c'est le nom cible
5. Renommer dans le WT : `WT[dst] = WT[src]`, supprimer `WT[src]`
6. Renommer dans l'index : `index[dst] = index[src]`, supprimer `index[src]`
7. **Sortie** : Aucune (succès muet)
8. **Code de sortie** : 0

### Cas 6 : git mv -f <src> <dst> (force)

**Condition** : Flag `-f` (ou `--force`).

**Processus** :
1. Comme Cas 5, mais :
2. Si `<dst>` existe, l'écraser (supprimer le fichier `<dst>` de l'index et WT avant de renommer `<src>`)
3. **Sortie** : Aucune
4. **Code de sortie** : 0

## Cas d'erreur

### Pathspec inexistant (rm)

**Condition** : `git rm <pathspec>` où `<pathspec>` ne correspond à aucun fichier de l'index.

**Message d'erreur** (stderr) :
```
fatal: pathspec '<pathspec>' did not match any files
```

**Code de sortie** : 128

**Comportement** : Aucune suppression.

### Fichier modifié (rm sans -f)

**Condition** : `git rm <path>` où le fichier a des modifications non stagées.

**Message d'erreur** (stderr) :
```
error: the following file has local modifications:
    <path>
(use --cached to keep the file, or -f to force removal)
```

**Code de sortie** : 1

**Comportement** : Aucune suppression.

### Fichier avec changements stagés (rm)

**Condition** : Le contenu de l'index pour `<path>` diffère du contenu du HEAD (fichier modifié et stagé).

**Message d'erreur** (stderr) :
```
error: the following file has staged content different from both the file and the HEAD:
    <path>
(use -f to force removal)
```

**Code de sortie** : 1

**Comportement** : Aucune suppression.

### Dépôt non initialisé

**Condition** : `git rm` ou `git mv` sans `git init`.

**Message d'erreur** (stderr) :
```
fatal: not a git repository (or any of the parent directories): .git
```

**Code de sortie** : 128

### Source inexistante (mv)

**Condition** : `git mv <src> <dst>` où `<src>` n'existe pas dans l'index ou le WT.

**Message d'erreur** (stderr) :
```
fatal: renaming '<src>' failed: not found in index
```

**Code de sortie** : 128

**Comportement** : Aucun déplacement.

### Destination existe, non répertoire (mv sans -f)

**Condition** : `git mv <src> <dst>` où `<dst>` existe et n'est pas un répertoire.

**Message d'erreur** (stderr) :
```
fatal: destination exists. Use -f to overwrite, or -r to remove duplicates.
```

**Code de sortie** : 128

**Comportement** : Aucun déplacement.

### Source et destination identiques (mv)

**Condition** : `git mv a.txt a.txt` (même chemin).

**Message d'erreur** (stderr) :
```
fatal: source and destination the same
```

**Code de sortie** : 128

**Comportement** : Aucun déplacement.

## Critères d'acceptation

### CA-rm-mv-01 : Supprimer un fichier simple

**Given**
- Le dépôt est initialisé
- Un fichier `file.txt` avec contenu "hello" est commité dans C1
- Le WT et l'index sont alignés à C1

**When**
- L'utilisateur exécute `git rm file.txt`

**Then**
- `exitCode === 0`
- `output` est vide
- `workingTree['file.txt']` n'existe plus
- `index['file.txt']` n'existe plus
- `git status -s` affiche `D  file.txt` (deleted, staged)

### CA-rm-mv-02 : Supprimer sans modification

**Given**
- Même configuration que CA-rm-mv-01

**When**
- L'utilisateur exécute `git rm file.txt`

**Then**
- `exitCode === 0`
- Le fichier peut être commité comme suppression avec `git commit -m "Remove file"`
- Le commit suivant n'aura plus le fichier

### CA-rm-mv-03 : Supprimer fichier modifié, refus

**Given**
- Le dépôt a C1 (file.txt: "v1")
- L'utilisateur modifie file.txt à "v1-modified" dans le WT SANS staging

**When**
- L'utilisateur exécute `git rm file.txt`

**Then**
- `exitCode === 1`
- `errors[0]` contient "local modifications"
- `workingTree['file.txt']` existe toujours
- `index['file.txt']` existe toujours (inchangé)

### CA-rm-mv-04 : Supprimer fichier modifié, force

**Given**
- Même configuration que CA-rm-mv-03

**When**
- L'utilisateur exécute `git rm -f file.txt`

**Then**
- `exitCode === 0`
- `output` est vide
- `workingTree['file.txt']` n'existe plus
- `index['file.txt']` n'existe plus

### CA-rm-mv-05 : Supprimer avec --cached (désindexation)

**Given**
- Le dépôt a C1 (file.txt: "v1")
- WT et index alignés à C1

**When**
- L'utilisateur exécute `git rm --cached file.txt`

**Then**
- `exitCode === 0`
- `output` est vide
- `workingTree['file.txt']` EXISTE TOUJOURS (contenu "v1")
- `index['file.txt']` n'existe plus (retiré de l'index)
- `git status -s` affiche `?? file.txt` (untracked, car plus dans l'index)

### CA-rm-mv-06 : Supprimer répertoire avec -r

**Given**
- Le dépôt a C1 avec les fichiers {dir/a.txt: "A", dir/b.txt: "B", file.txt: "root"}

**When**
- L'utilisateur exécute `git rm -r dir/`

**Then**
- `exitCode === 0`
- `workingTree['dir/a.txt']` n'existe plus
- `workingTree['dir/b.txt']` n'existe plus
- `workingTree['file.txt']` existe toujours
- `index['dir/a.txt']` n'existe plus
- `index['dir/b.txt']` n'existe plus
- `index['file.txt']` existe toujours

### CA-rm-mv-07 : Supprimer, erreur pathspec vide

**Given**
- Le dépôt est initialisé

**When**
- L'utilisateur exécute `git rm nonexistent.txt`

**Then**
- `exitCode === 128`
- `errors[0]` contient "did not match any files"
- Aucun changement à l'index ou WT

### CA-rm-mv-08 : Renommer fichier simple

**Given**
- Le dépôt a C1 (file.txt: "hello")
- WT et index alignés à C1

**When**
- L'utilisateur exécute `git mv file.txt renamed.txt`

**Then**
- `exitCode === 0`
- `output` est vide
- `workingTree['file.txt']` n'existe plus
- `workingTree['renamed.txt']` existe avec contenu "hello"
- `index['file.txt']` n'existe plus
- `index['renamed.txt']` existe
- Le hash du blob dans l'index reste IDENTIQUE (contenu inchangé, seul le chemin a changé)

### CA-rm-mv-09 : Renommer dans un répertoire (destination = répertoire)

**Given**
- Le dépôt a C1 avec {file.txt: "content", dir/}
- WT et index alignés

**When**
- L'utilisateur exécute `git mv file.txt dir/`

**Then**
- `exitCode === 0`
- `workingTree['file.txt']` n'existe plus
- `workingTree['dir/file.txt']` existe avec contenu "content"
- `index['file.txt']` n'existe plus
- `index['dir/file.txt']` existe

### CA-rm-mv-10 : Renommer, destination existe, refus

**Given**
- Le dépôt a C1 avec {a.txt: "A", b.txt: "B"}
- WT et index alignés

**When**
- L'utilisateur exécute `git mv a.txt b.txt` (b.txt existe)

**Then**
- `exitCode === 128`
- `errors[0]` contient "destination exists"
- `workingTree['a.txt']` existe toujours
- `workingTree['b.txt']` existe toujours (inchangé)
- `index` inchangé

### CA-rm-mv-11 : Renommer, destination existe, force

**Given**
- Même configuration que CA-rm-mv-10

**When**
- L'utilisateur exécute `git mv -f a.txt b.txt`

**Then**
- `exitCode === 0`
- `workingTree['a.txt']` n'existe plus
- `workingTree['b.txt']` existe avec contenu "A"
- `index['a.txt']` n'existe plus
- `index['b.txt']` existe et pointe vers le blob original de a.txt

### CA-rm-mv-12 : Renommer, erreur source inexistante

**Given**
- Le dépôt est initialisé avec C1

**When**
- L'utilisateur exécute `git mv nonexistent.txt target.txt`

**Then**
- `exitCode === 128`
- `errors[0]` contient "not found in index" ou "unknown path"
- Aucun changement à l'index ou WT

### CA-rm-mv-13 : Renommer avec même source et destination

**Given**
- Le dépôt a C1 avec file.txt

**When**
- L'utilisateur exécute `git mv file.txt file.txt`

**Then**
- `exitCode === 128`
- `errors[0]` contient "source and destination the same"
- Aucun changement

### CA-rm-mv-14 : Détection de renommage dans git status

**Given**
- Le dépôt a C1 avec {a.txt: "content"}
- L'utilisateur exécute `git mv a.txt b.txt`

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` affiche le changement (optionnel : « renamed a.txt -> b.txt » ou « deleted a.txt » + « new file b.txt »)
- Un commit ultérieur enregistre le renommage

### CA-rm-mv-15 : Supprimer fichier modifié, erreur changements stagés

**Given**
- Le dépôt a C1 (file.txt: "v1")
- L'utilisateur modifie file.txt à "v2" et l'ajoute à l'index (`git add`)

**When**
- L'utilisateur exécute `git rm file.txt`

**Then**
- `exitCode === 1`
- `errors[0]` contient "staged content different" ou "has staged content"
- `workingTree['file.txt']` existe toujours
- `index['file.txt']` existe toujours

### CA-rm-mv-16 : Dépôt non initialisé, suppression

**Given**
- L'engine est en état vierge (pas d'appel à `git init`)

**When**
- L'utilisateur exécute `git rm file.txt`

**Then**
- `exitCode === 128`
- `errors[0]` contient "not a git repository"

### CA-rm-mv-17 : Dépôt non initialisé, renommage

**Given**
- L'engine est en état vierge

**When**
- L'utilisateur exécute `git mv a.txt b.txt`

**Then**
- `exitCode === 128`
- `errors[0]` contient "not a git repository"

### CA-rm-mv-18 : Supprimer plusieurs fichiers

**Given**
- Le dépôt a C1 avec {a.txt: "A", b.txt: "B", c.txt: "C"}

**When**
- L'utilisateur exécute `git rm a.txt c.txt`

**Then**
- `exitCode === 0`
- `workingTree['a.txt']` n'existe plus
- `workingTree['c.txt']` n'existe plus
- `workingTree['b.txt']` existe toujours
- `index['a.txt']` n'existe plus
- `index['c.txt']` n'existe plus

### CA-rm-mv-19 : Scenario de conflit delete/modify (Phase 4 debt resolution)

**Given**
- Le dépôt a C0 (file.txt: "initial")
- Branche main : C0 ← C1 (file.txt: "modified")
- Branche feature : C0 ← C2 (supprime file.txt via `git rm file.txt` + commit)
- L'utilisateur est sur main et fusionne feature

**When**
- L'utilisateur exécute `git merge feature`

**Then**
- `exitCode === 1` (conflit)
- `snapshot.operationState === "merging"`
- Conflit marqué : file.txt doit être résolu
- L'utilisateur peut résoudre avec `git add file.txt` (garder) ou `git rm file.txt` (accepter suppression)

### CA-rm-mv-20 : Détection de renommage avec contenu identique

**Given**
- Le dépôt a C1 avec file.txt contenant "unique content" et hash blob X
- L'utilisateur exécute `git mv file.txt newname.txt`

**When**
- L'utilisateur exécute `git log --oneline --follow newname.txt` (ou examine le snapshot)

**Then**
- Le hash du blob reste X (contenu inchangé)
- Le chemin du fichier dans l'index passe de file.txt à newname.txt
- Un post-commit reveal le renommage (via analyse : même blob, chemins différents)

---

## Implémentation : Points clés

1. **Validation stricte pour rm** : Vérifier que le fichier n'a pas de modifications unstaged ET que l'index correspond à HEAD (deux conditions séparées).
2. **Désindexation --cached** : Supprimer de l'index sans toucher le WT.
3. **Récursion -r** : Énumérer les fichiers d'un répertoire et appliquer rm à chacun.
4. **Force -f** : Contourner les vérifications de modification.
5. **Renommage mv** : Mécanisme simple : supprimer l'ancien chemin de l'index, créer le nouveau avec la même entrée d'index (hash identique).
6. **Détection implicite** : Git détecte le renommage lors du commit (même blob, chemins différents) ; en Phase 1, pas besoin de marquer explicitement dans l'index.
7. **Test delete/modify conflict** : `git rm` + merge lève la dette Phase 4 (conflits delete/modify enfin testables en boîte noire).

## Dépendances inter-commandes

- **Dépend de** : `git init`, `git add`, `git commit` (opérations préalables)
- **Utilisé par** : `git merge` (conflits delete/modify), `git status`

---

## Notes pour le développement

- L'opération de renommage dans l'index est purement conceptuelle : il suffit de créer une nouvelle entrée avec le même hash blob et de supprimer l'ancienne.
- Les messages d'erreur doivent correspondre à ceux de Git pour une meilleure UX.
- `git mv` avec destination = répertoire existant nécessite de détecter les répertoires (enregistrés implicitement via les chemins des fichiers dans l'index).
- Cas limite : un chemin vide (`git rm ""`) doit être rejeté (pathspec vide).
