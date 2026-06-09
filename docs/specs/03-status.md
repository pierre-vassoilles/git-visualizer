# Phase 1 : git status

## Résumé

La commande `git status` affiche l'état du dépôt : fichiers untracked, modifiés, staged (dans l'index), ainsi que la branche courante et le résumé. Le format doit être clairement lisible et proche du vrai Git.

## Syntaxe

```
git status [options]
```

### Options supportées en Phase 1

| Flag | Comportement | Notes |
|------|-------------|-------|
| Aucun | Affichage long (verbose) | État par défaut |
| `-s` ou `--short` | Affichage court (compacte) | Phase 1 optionnel |

**Remarque** : Les flags `--porcelain`, `--long`, `--untracked-files`, etc. ne sont pas implémentés en Phase 1.

## Comportement nominal

### Calcul de l'état

L'affichage de `git status` dépend de trois sources :

1. **Working Tree** : fichiers présents sur le disque (virtuel)
2. **Index** : fichiers stagés (prêts à committer)
3. **HEAD Commit** : l'arbre du dernier commit (s'il existe)

**Trois catégories de fichiers** :

- **Tracked & Committed** : fichier dans le HEAD commit ET (inchangé dans index/working tree OU modifié)
- **Staged** : fichier dans l'index mais pas encore dans un commit
- **Untracked** : fichier dans le working tree mais pas dans l'index ni le HEAD

**Modifications** :

- **Modified (staged)** : fichier dans l'index avec contenu différent du HEAD
- **Modified (unstaged)** : fichier dans le working tree avec contenu différent de l'index
- **Deleted (staged)** : fichier dans le HEAD mais pas dans l'index
- **Deleted (unstaged)** : fichier dans l'index mais pas dans le working tree (utilisateur a supprimé le fichier)

### Format long (verbose)

Affichage multi-lignes proche du vrai Git :

```
On branch main

No commits yet

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        file1.txt
        file2.txt

nothing added to commit but untracked files present (use "git add" to track)
```

ou (avec des commits) :

```
On branch main

Changes to be committed:
  (use "git commit" to finalize)
        new file:   newfile.txt
        modified:   modified.txt

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
        modified:   changes.txt

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        untracked.txt

```

**Règles de formatage** :

1. **En-têtes de section** : affichés seulement si la section contient des fichiers
2. **Statut des fichiers** :
   - `new file:` : fichier dans l'index, pas dans le HEAD
   - `modified:` : fichier dans l'index avec contenu différent du HEAD (ou dans working tree, différent de l'index)
   - `deleted:` : fichier dans le HEAD, pas dans l'index
3. **Messages informatifs** : affiché en bas selon l'état global
4. **Indentation** : 8 espaces pour les fichiers (ou 2 espaces + chemin)

### Format court (-s / --short)

Affichage compact, 2 caractères par ligne :

```
?? untracked.txt
A  new_staged.txt
AM modified_staged_and_unstaged.txt
M  modified_unstaged.txt
```

**Code statut** (2 caractères) :

| Caractère 1 | Caractère 2 | Sens |
|------------|------------|------|
| `?` | `?` | Untracked |
| `A` | ` ` | Added (new file, staged) |
| `M` | ` ` | Modified (staged) |
| ` ` | `M` | Modified (unstaged) |
| `D` | ` ` | Deleted (staged) |
| ` ` | `D` | Deleted (unstaged) |
| `A` | `M` | Added & Modified |
| `M` | `M` | Modified (staged) & Modified (unstaged) |

### Code de sortie

- **0** : succès (quel que soit l'état du dépôt)

## Cas d'erreur

### Dépôt non initialisé

**Condition** : Appeler `git status` sans avoir appelé `git init` d'abord.

**Message d'erreur** (stderr) :
```
fatal: not a git repository (or any of the parent directories): .git
```

**Code de sortie** : 128

## Critères d'acceptation (Given/When/Then)

### CA-status-01 : Dépôt vide, aucun fichier

**Given**
- Le dépôt a été initialisé (`git init`)
- Le working tree est vide
- L'index est vide
- Aucun commit

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output[0]` contient "On branch main"
- `output` contient "No commits yet"
- `output` contient "nothing added to commit"
- Aucune section "Changes to be committed" ou "Untracked files"

### CA-status-02 : Fichiers untracked seulement

**Given**
- Le dépôt a été initialisé
- Trois fichiers untracked : `file1.txt`, `file2.txt`, `nested/file3.txt`
- L'index est vide

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` contient "Untracked files:"
- `output` contient "file1.txt"
- `output` contient "file2.txt"
- `output` contient "nested/file3.txt"
- Aucune section "Changes to be committed"
- Aucune section "Changes not staged for commit"

### CA-status-03 : Fichiers stagés (before first commit)

**Given**
- Le dépôt a été initialisé
- Deux fichiers dans le working tree : `a.txt`, `b.txt`
- Les deux fichiers ont été ajoutés à l'index (`git add a.txt b.txt`)

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` contient "Changes to be committed:"
- `output` contient "new file:   a.txt"
- `output` contient "new file:   b.txt"
- Aucune section "Untracked files"

### CA-status-04 : Mix de staged et untracked

**Given**
- Le dépôt a été initialisé
- Trois fichiers : `staged.txt` (dans l'index), `untracked.txt` (pas dans l'index)
- Aucun commit

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` contient "Changes to be committed:"
- `output` contient "new file:   staged.txt"
- `output` contient "Untracked files:"
- `output` contient "untracked.txt"

### CA-status-05 : Fichier modifié après staging

**Given**
- Le dépôt a été initialisé
- Un premier commit existe avec un fichier `doc.md` contenu "v1"
- Le fichier a été modifié dans le working tree à "v2"
- Le fichier N'A PAS été re-stagé

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` contient "Changes not staged for commit:"
- `output` contient "modified:   doc.md"
- Aucune section "Changes to be committed" (rien de nouveau)

### CA-status-06 : Fichier modifié, stagé, puis remodifié

**Given**
- Le dépôt a été initialisé
- Un premier commit existe avec `file.txt` contenu "original"
- L'utilisateur change le fichier à "modified" et l'ajoute (`git add file.txt`)
- Puis change à nouveau le fichier à "remodified"

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` contient "Changes to be committed:"
- `output` contient "modified:   file.txt" (la version stagée)
- `output` contient "Changes not staged for commit:"
- Encore "modified:   file.txt" (la version unstaged/remodified)

### CA-status-07 : Format court (-s)

**Given**
- Le dépôt a été initialisé
- Fichier untracked `untracked.txt`
- Fichier staged `staged.txt`
- Fichier modifié unstaged `modified.txt`

**When**
- L'utilisateur exécute `git status -s`

**Then**
- `exitCode === 0`
- `output` contient "?? untracked.txt"
- `output` contient "A  staged.txt"
- `output` contient " M modified.txt"

### CA-status-08 : Dépôt non initialisé

**Given**
- L'engine est en état vierge (pas d'appel à `git init`)

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 128`
- `errors[0]` contient "not a git repository"

### CA-status-09 : Dépôt avec commits, état propre

**Given**
- Le dépôt a été initialisé
- Un commit a été créé
- Tous les fichiers du commit correspondent au working tree et à l'index

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` contient "On branch main"
- `output` contient "nothing to commit, working tree clean"
- Aucune section "Changes to be committed" ou "Changes not staged"

---

## Implémentation : Points clés

1. **Calcul de l'état** : Comparer les trois sources (HEAD, index, working tree) pour déterminer le statut de chaque fichier.
2. **Tri des fichiers** : Afficher les fichiers dans un ordre alphabétique (Unix sort).
3. **Messages contextuels** : Adapter les messages en bas en fonction de l'état (ex. si rien, afficher "nothing to commit").
4. **Gestion du premier commit** : Afficher "No commits yet" et "nothing added to commit" dans les cas appropriés.
5. **Format court** : Implémenter optionnellement en Phase 1 pour plus de complétude.

## Dépendances inter-commandes

- **Dépend de** : `git init` (dépôt doit être initialisé)
- **Dépend de** : `git add`, `git commit` (pour avoir un état non-trivial)

---

## Notes pour le développement

- La logique de calcul de l'état est le cœur de `git status` ; il faut tester exhaustivement.
- Les messages doivent exactement matcher le format Git pour une meilleure UX.
- Les chemins doivent être affichés dans un ordre cohérent (sortés).
