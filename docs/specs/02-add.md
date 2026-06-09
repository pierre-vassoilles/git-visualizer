# Phase 1 : git add

## Résumé

La commande `git add` enregistre des fichiers du working tree dans l'index (staging area), en vue du prochain commit. Il s'agit de calculer des hashes de contenu et de stocker les métadonnées dans l'index.

## Syntaxe

```
git add <pathspec...>
```

ou

```
git add .
```

### Arguments

| Argument | Comportement |
|----------|-------------|
| `<pathspec>` | Chemin relatif d'un fichier à ajouter (ex. `README.md`, `src/main.ts`, `dir/subdir/file.txt`) |
| `.` | Ajoute tous les fichiers du working tree |
| (aucun) | Erreur : "pathspec cannot be empty" |

### Options supportées en Phase 1

Aucune (pas de `-A`, `-u`, `-p`, `--intent-to-add`, etc.).

## Comportement nominal

### Avant add

- Fichier `F` existe dans le working tree avec contenu `C`
- L'index ne contient pas `F` (ou contient une version ancienne)

### Après add F

1. Calculer le hash SHA-1 du blob : `hash = SHA1("blob " + len(C) + "\0" + C)`
2. Stocker le blob dans `objects[hash]` (si pas déjà présent)
3. Ajouter/mettre à jour l'entrée index[F] :
   ```
   {
     blobHash: hash,
     content: C,
     mode: "100644"
   }
   ```
4. **Pas de sortie** sur le canal stdout (comportement Git standard)
5. **Code de sortie** : 0

### Sortie standard

Aucune (ligne vide en cas de succès).

### Code de sortie

- **0** : succès
- **1** : erreur (fichier non trouvé, pathspec invalide, etc.)

## Cas d'erreur

### Fichier non trouvé

**Condition** : Appeler `git add <pathspec>` où `<pathspec>` ne correspond à aucun fichier du working tree.

**Message d'erreur** (stderr) :
```
fatal: pathspec '<pathspec>' did not match any files
```

**Code de sortie** : 1

**Comportement** : L'index n'est pas modifié.

### Pathspec vide

**Condition** : Appeler `git add` sans argument (pas même un `.`).

**Message d'erreur** (stderr) :
```
fatal: pathspec cannot be empty
```

**Code de sortie** : 1

### Dépôt non initialisé

**Condition** : Appeler `git add <pathspec>` sans avoir appelé `git init` d'abord.

**Message d'erreur** (stderr) :
```
fatal: not a git repository (or any of the parent directories): .git
```

**Code de sortie** : 128

**Comportement** : L'index n'est pas modifié.

## Critères d'acceptation (Given/When/Then)

### CA-add-01 : Ajouter un fichier simple

**Given**
- Le dépôt a été initialisé (`git init`)
- Un fichier `hello.txt` avec le contenu `"hello world"` existe dans le working tree
- L'index est vide

**When**
- L'utilisateur exécute `git add hello.txt`

**Then**
- `exitCode === 0`
- `output` est vide
- `index["hello.txt"]` existe
- `index["hello.txt"].content === "hello world"`
- `index["hello.txt"].blobHash` est un SHA-1 valide
- `objects[blobHash].type === "blob"`
- `objects[blobHash].content === "hello world"`

### CA-add-02 : Ajouter plusieurs fichiers

**Given**
- Le dépôt a été initialisé
- Trois fichiers existent : `a.txt` (contenu "A"), `b.txt` (contenu "B"), `c.txt` (contenu "C")
- L'index est vide

**When**
- L'utilisateur exécute `git add a.txt b.txt c.txt`

**Then**
- `exitCode === 0`
- `index["a.txt"]`, `index["b.txt"]`, `index["c.txt"]` existent
- `index["a.txt"].content === "A"`
- `index["b.txt"].content === "B"`
- `index["c.txt"].content === "C"`
- Trois blobs distincts sont dans `objects`

### CA-add-03 : Ajouter tous les fichiers avec "."

**Given**
- Le dépôt a été initialisé
- Quatre fichiers existent : `file1.txt`, `file2.txt`, `dir/file3.txt`, `dir/file4.txt`
- L'index est vide

**When**
- L'utilisateur exécute `git add .`

**Then**
- `exitCode === 0`
- Les quatre fichiers sont dans l'index (chemins complets)
- Quatre blobs distincts sont créés

### CA-add-04 : Mettre à jour un fichier déjà stagé

**Given**
- Le dépôt a été initialisé
- Un fichier `doc.md` avec contenu "v1" est dans le working tree et l'index
- Le contenu du fichier est ensuite modifié à "v2" dans le working tree

**When**
- L'utilisateur exécute `git add doc.md`

**Then**
- `exitCode === 0`
- `index["doc.md"].content === "v2"`
- `index["doc.md"].blobHash` change (nouveau hash pour nouveau contenu)
- `objects[oldBlobHash]` existe toujours (immuabilité)
- `objects[newBlobHash]` existe et contient "v2"

### CA-add-05 : Fichier non trouvé

**Given**
- Le dépôt a été initialisé
- Le fichier `nonexistent.txt` n'existe pas dans le working tree

**When**
- L'utilisateur exécute `git add nonexistent.txt`

**Then**
- `exitCode === 1`
- `errors[0]` contient "did not match any files"
- `index` reste inchangé

### CA-add-06 : Pathspec vide

**Given**
- Le dépôt a été initialisé

**When**
- L'utilisateur exécute `git add` (sans argument)

**Then**
- `exitCode === 1`
- `errors[0]` contient "pathspec cannot be empty"
- `index` reste inchangé

### CA-add-07 : Dépôt non initialisé

**Given**
- L'engine est en état vierge (pas d'appel à `git init`)

**When**
- L'utilisateur exécute `git add file.txt`

**Then**
- `exitCode === 128`
- `errors[0]` contient "not a git repository"
- Aucune modification d'index (qui n'existe pas)

### CA-add-08 : Ajouter un fichier avec chemin imbriqué

**Given**
- Le dépôt a été initialisé
- Un fichier `src/core/main.ts` avec contenu "code" existe dans le working tree

**When**
- L'utilisateur exécute `git add src/core/main.ts`

**Then**
- `exitCode === 0`
- `index["src/core/main.ts"]` existe et contient "code"

### CA-add-09 : Deux ajouts du même fichier avec contenu différent

**Given**
- Le dépôt a été initialisé
- Un fichier `log.txt` avec contenu "first" est ajouté à l'index
- Le contenu du fichier dans le working tree est changé à "second"

**When**
- L'utilisateur exécute `git add log.txt` à nouveau

**Then**
- `exitCode === 0`
- `index["log.txt"].content === "second"`
- `index["log.txt"].blobHash` a changé

---

## Implémentation : Points clés

1. **Parser les pathspecs** : Supporter `"."` comme "tous les fichiers" et des chemins individuels.
2. **Validation des chemins** : Rejeter les chemins invalides (`/absolute/path`, etc.).
3. **Calcul des hashes** : SHA-1 strictement identique au format Git.
4. **Glob support futur** : En Phase 1, pas de wildcards (`*.txt`) ; à ajouter ultérieurement.
5. **Erreurs multiples** : Si plusieurs pathspecs sont invalides, rapporter le premier (Git fait pareil).

## Dépendances inter-commandes

- **Dépend de** : `git init` (dépôt doit être initialisé)
- **Utilisé par** : `git commit`, `git status`

---

## Notes pour le développement

- Les chemins du working tree doivent être normalisés (pas de `//`, de `.`, etc.).
- Le hash des blobs doit être déterministe : même contenu, même hash, à chaque fois.
- L'index est une structure mutable ; chaque `git add` peut changer ses entrées.
