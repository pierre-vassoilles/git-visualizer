# Phase 1 : git commit

## Résumé

La commande `git commit` crée un nouveau commit à partir du contenu actuellement dans l'index. Le commit enregistre un snapshot du dépôt (arbre complet), pointe vers ses parents (le ou les commits précédents), et est accessible via la branche courante.

## Syntaxe

```
git commit -m <message>
```

### Arguments et options

| Option | Argument | Comportement | Obligatoire |
|--------|----------|-------------|------------|
| `-m` | `<message>` | Message du commit | Oui en Phase 1 |

**Remarque** : Les options `-a`, `-am`, `--allow-empty`, `--amend`, etc. ne sont pas implémentées en Phase 1.

## Comportement nominal

### Avant commit

- L'index contient des fichiers stagés (avec leurs hashes de blobs)
- La branche courante (via HEAD) pointe vers un commit parent (ou aucun pour le premier commit)

### Processus de commit

1. **Créer un tree** :
   - Construire un arbre qui représente l'état de tous les fichiers dans l'index
   - Récursivement créer des sous-trees pour les répertoires imbriquées
   - Calculer le hash SHA-1 du tree
   - Stocker le tree dans `objects[hash]`

   Exemple :
   ```
   Index: {
     "README.md": { blobHash: "abc123...", content: "# Project" },
     "src/main.ts": { blobHash: "def456...", content: "..." }
   }
   
   Tree généré:
   {
     type: "tree",
     entries: {
       "README.md": { mode: "100644", hash: "abc123..." },
       "src": { mode: "40000", hash: <tree_hash_de_src> }
     }
   }
   
   Sous-tree "src":
   {
     type: "tree",
     entries: {
       "main.ts": { mode: "100644", hash: "def456..." }
     }
   }
   ```

2. **Créer un commit** :
   - Récupérer le hash du tree créé ci-dessus
   - Déterminer les parents :
     - Si c'est le premier commit : `parents = []`
     - Sinon : `parents = [hash du commit actuel de la branche]`
   - Composer le commit :
     ```
     {
       type: "commit",
       tree: <tree_hash>,
       parents: [<parent_hash>, ...],
       author: "Unnamed <unnamed@example.com>",
       date: <timestamp>,
       message: <message_passée_à_-m>
     }
     ```
   - Calculer le hash SHA-1 du commit
   - Stocker le commit dans `objects[hash]`

3. **Mettre à jour la branche** :
   - Si `HEAD.symbolic === true` (cas normal en Phase 1) :
     - Extraire le nom de la branche depuis `HEAD.target` (ex. `refs/heads/main`)
     - Mettre à jour `refs.heads[branchName] = <commit_hash>`

4. **Vider l'index** :
   - Réinitialiser `index = {}`

### Sortie standard

En cas de succès :
```
[main (root-commit) abc1234] Message du commit
 2 files changed, 10 insertions(+)
 create mode 100644 README.md
 create mode 100644 src/main.ts
```

Ou (pour un commit non-racine) :
```
[main abc1234] Deuxième commit
 1 file changed, 5 insertions(+)
 modify mode 100644 file.txt
```

**Simplifié en Phase 1** (acceptable) :
```
[main abc1234] Message du commit
```

### Code de sortie

- **0** : succès
- **1** : erreur (rien à committer, pas d'index, etc.)

## Cas d'erreur

### Rien à committer (aucune modification stagée)

**Condition** : Appeler `git commit -m "msg"` alors qu'aucune modification n'est stagée — c'est-à-dire que l'index (snapshot complet) est identique à l'arbre de HEAD (ou que l'index est vide avant le premier commit).

**Message d'erreur** (stderr) :
```
fatal: no changes added to commit
```

**Code de sortie** : 1

**Comportement** : Aucun commit n'est créé.

### Message vide

**Condition** : Appeler `git commit -m ""` (message vide).

**Message d'erreur** (stderr) :
```
fatal: message cannot be empty
```

**Code de sortie** : 1

**Comportement** : Aucun commit n'est créé.

### Option `-m` manquante

**Condition** : Appeler `git commit` sans l'option `-m`.

**Message d'erreur** (stderr) :
```
fatal: option '-m' is required
```

**Code de sortie** : 1

**Comportement** : Aucun commit n'est créé.

### Dépôt non initialisé

**Condition** : Appeler `git commit -m "msg"` sans avoir appelé `git init` d'abord.

**Message d'erreur** (stderr) :
```
fatal: not a git repository (or any of the parent directories): .git
```

**Code de sortie** : 128

## Critères d'acceptation (Given/When/Then)

### CA-commit-01 : Premier commit

**Given**
- Le dépôt a été initialisé (`git init`)
- Un fichier `hello.txt` avec contenu "hello" existe dans le working tree
- Le fichier a été stagé (`git add hello.txt`)

**When**
- L'utilisateur exécute `git commit -m "First commit"`

**Then**
- `exitCode === 0`
- `output[0]` contient "First commit"
- Un commit a été créé
- `objects[commitHash].type === "commit"`
- `objects[commitHash].parents.length === 0` (pas de parent)
- `objects[commitHash].message === "First commit"`
- `refs.heads.main === commitHash`
- `index` reste aligné sur l'arbre du commit (non vidé) : `indexPaths === ["hello.txt"]`
- `objects[treeHash]` existe (tree du commit)
- `objects[treeHash].entries["hello.txt"].hash` pointe vers le blob "hello"

### CA-commit-02 : Deuxième commit (avec parent)

**Given**
- Le premier commit a été créé
- Un fichier `world.txt` avec contenu "world" est ajouté au working tree
- Le fichier est stagé (`git add world.txt`)

**When**
- L'utilisateur exécute `git commit -m "Add world file"`

**Then**
- `exitCode === 0`
- `output[0]` contient "Add world file"
- Un nouveau commit a été créé
- `objects[newCommitHash].parents.length === 1`
- `objects[newCommitHash].parents[0] === <firstCommitHash>`
- `refs.heads.main === newCommitHash`
- `index` reste aligné sur l'arbre du commit : `indexPaths === ["hello.txt", "world.txt"]`
- Le tree du nouveau commit contient deux entrées : `hello.txt` et `world.txt`

### CA-commit-03 : Modification d'un fichier existant

**Given**
- Un commit avec `file.txt` ("original") existe
- Le fichier est modifié dans le working tree à "modified"
- Le fichier est stagé (`git add file.txt`)

**When**
- L'utilisateur exécute `git commit -m "Modify file"`

**Then**
- `exitCode === 0`
- Un nouveau commit a créé
- Le tree du nouveau commit contient `file.txt` avec le nouveau contenu
- Le blob du nouveau contenu existe dans `objects`
- `refs.heads.main` pointe vers ce nouveau commit

### CA-commit-04 : Index vide, rien à committer

**Given**
- Le dépôt a été initialisé
- L'index est vide (pas de `git add`)

**When**
- L'utilisateur exécute `git commit -m "Rien à committer"`

**Then**
- `exitCode === 1`
- `errors[0]` contient "no changes added to commit"
- Aucun nouveau commit n'est créé
- `refs.heads.main` reste inchangée

### CA-commit-05 : Message vide

**Given**
- Le dépôt a été initialisé
- Un fichier a été stagé

**When**
- L'utilisateur exécute `git commit -m ""`

**Then**
- `exitCode === 1`
- `errors[0]` contient "message cannot be empty"
- Aucun commit n'est créé

### CA-commit-06 : Option `-m` manquante

**Given**
- Le dépôt a été initialisé
- Un fichier a été stagé

**When**
- L'utilisateur exécute `git commit` (sans `-m`)

**Then**
- `exitCode === 1`
- `errors[0]` contient "option '-m' is required"
- Aucun commit n'est créé

### CA-commit-07 : Multiple fichiers stagés dans un commit

**Given**
- Le dépôt a été initialisé
- Trois fichiers `a.txt`, `b.txt`, `c.txt` sont stagés

**When**
- L'utilisateur exécute `git commit -m "Three files"`

**Then**
- `exitCode === 0`
- Un commit a été créé
- Le tree du commit contient trois entrées
- Trois blobs sont dans `objects`

### CA-commit-08 : Hash du commit est déterministe

**Given**
- Le dépôt a été initialisé
- Un fichier avec un contenu spécifique est stagé

**When**
- L'utilisateur crée deux dépôts différents avec le même fichier et le même message
- Les deux commits ont le même contenu parent/message/author/date

**Then**
- Les hashes des deux commits doivent être identiques (déterminisme)

### CA-commit-09 : Dépôt non initialisé

**Given**
- L'engine est en état vierge (pas d'appel à `git init`)

**When**
- L'utilisateur exécute `git commit -m "msg"`

**Then**
- `exitCode === 128`
- `errors[0]` contient "not a git repository"

### CA-commit-10 : Multiple pathspecs dans git add, puis commit

**Given**
- Le dépôt a été initialisé
- L'utilisateur exécute `git add file1.txt file2.txt file3.txt`
- L'utilisateur modifie `file2.txt`
- L'utilisateur exécute `git add file2.txt` à nouveau
- L'utilisateur exécute `git commit -m "All three with file2 modified"`

**Then**
- `exitCode === 0`
- Le commit contient les trois fichiers avec la version finale de `file2.txt`

---

## Implémentation : Points clés

1. **Construction du tree** : Parcourir l'index, créer des trees imbriquées pour les chemins profonds.
2. **Hash déterministe** : Le hash du commit doit être identique pour le même contenu (y compris message, author, date).
3. **Timestamp de date** : Utiliser un timestamp Unix auto-incrémenté pour chaque commit (ex. 1000000000 + numCommits).
4. **Nettoyage d'index** : Toujours vider l'index après un commit succès.
5. **Validation du message** : Rejeter les messages vides ou manquants.

## Dépendances inter-commandes

- **Dépend de** : `git init` (dépôt doit être initialisé)
- **Dépend de** : `git add` (pour remplir l'index)
- **Utilisé par** : `git log`, `git status`

---

## Notes pour le développement

- La construction du tree depuis l'index est la tâche la plus complexe ; utiliser une fonction récursive pour gérer l'imbrication.
- Les parents du commit doivent être précis : aucun parent pour le premier, un seul parent (HEAD) pour les suivants.
- Le timestamp doit être unique pour chaque commit dans la même session de test.
