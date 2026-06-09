# Phase 6+ : git diff & git show

## Résumé

Les commandes `git diff` et `git show` permettent de visualiser les différences entre états (working tree vs index, index vs HEAD, entre commits/branches) et d'examiner les métadonnées d'un commit avec ses changements.

**Composants clés** :
- **Diff structuré** : représentation interne (fichier, statut, hunks/lignes) + sortie texte façon git (`diff --git a/… b/…`, `@@`, `+/-`)
- **`git diff`** : compare working tree vs index (défaut), ou index vs HEAD (--staged/--cached), ou deux commits/branches
- **`git show`** : affiche métadonnées du commit + diff vs son premier parent

## Syntaxe

### git diff

```
git diff [options] [<commit|branch> [<commit|branch>]] [-- <pathspec>...]
```

### Options supportées

| Option | Comportement | Notes |
|--------|-------------|-------|
| (aucun) | WT vs index (modified unstaged) | Défaut |
| `--staged` ou `--cached` | Index vs HEAD | Changements stagés |
| `<commit>` | WT vs `<commit>` | Comparer avec un commit |
| `<commit1> <commit2>` | `<commit1>` vs `<commit2>` | Entre deux commits |
| `-- <pathspec>` | Limiter aux chemins spécifiés | Ex. `git diff -- src/` |

### git show

```
git show [options] [<commit>]
```

| Option | Comportement | Notes |
|--------|-------------|-------|
| (aucun) | Affiche HEAD (si pas de commit spécifié) | Défaut |
| `<commit>` | Affiche le commit spécifié | Hash, branche, tag, révision |
| `<commit>:<path>` | Contenu du fichier dans le commit | Phase ultérieure (optionnel) |

## Concepts fondamentaux

### Représentation structurée du diff

À chaque exécution de diff, une structure interne est calculée (non exposée en sortie texte, mais contrat pour l'UI) :

```typescript
interface DiffResult {
  files: DiffFile[];
  rawOutput: string[];  // Sortie texte git-compatible
}

interface DiffFile {
  path: string;                      // Chemin du fichier
  status: 'added' | 'deleted' | 'modified';
  oldMode?: string;                  // Mode ancien (ex. "100644")
  newMode?: string;                  // Mode nouveau
  oldHash?: string;                  // Hash blob ancien
  newHash?: string;                  // Hash blob nouveau
  hunks: DiffHunk[];                 // Blocs de changements
}

interface DiffHunk {
  oldStart: number;                  // Ligne de début dans ancien fichier
  oldCount: number;                  // Nombre de lignes dans ancien fichier
  newStart: number;                  // Ligne de début dans nouveau fichier
  newCount: number;                  // Nombre de lignes dans nouveau fichier
  lines: DiffLine[];                 // Lignes du hunk
}

interface DiffLine {
  type: 'context' | 'added' | 'deleted';  // Type de ligne
  content: string;                   // Contenu de la ligne
}
```

### Algorithme de diff

**Diff simple ligne à ligne** :
1. Diviser ancien et nouveau contenu par `\n`
2. Appliquer un algorithme **LCS (Longest Common Subsequence)** simplifié ou un diff **Myers** basique
3. Identifier les blocs continus de +/- et les wrapper dans des hunks avec contexte

**Contexte** : Par défaut, 3 lignes de contexte avant/après chaque modification (configurable, optionnel en Phase 1).

**Cas spéciaux** :
- Fichier ajouté : ancien = vide, nouveau = contenu complet
- Fichier supprimé : ancien = contenu complet, nouveau = vide
- Fichier renommé : non traité en Phase 6 (introduit par `git mv` Phase 7+)
- Fichier binaire : détecté si le blob contient des octets nuls ; afficher "Binary files differ"

### Sortie texte (format Git)

**Entête du diff pour chaque fichier** :
```
diff --git a/<path> b/<path>
index <oldHash>..<newHash> [<mode>]
[deleted file mode <mode>] | [new file mode <mode>] | [...]
--- a/<path>
+++ b/<path>
```

**Hunk** :
```
@@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@ [optionnel: context]
```

**Lignes** :
```
 <context line>
+<added line>
-<deleted line>
```

**Exemple complet** :
```
diff --git a/README.md b/README.md
index abc1234..def5678 100644
--- a/README.md
+++ b/README.md
@@ -1,3 +1,4 @@
 # My Project
+New line added
 
 Some description
@@ -10,1 +11,2 @@
 Last line
-Old content
+New content
```

## Comportement nominal

### Cas 1 : git diff (WT vs index)

**Condition** : Aucun flag ni argument.

**Processus** :
1. Récupérer tous les fichiers du working tree ET de l'index
2. Pour chaque fichier présent dans l'un ou l'autre :
   - Déterminer le statut : added (WT seul), deleted (index seul), modified (contenu différent)
   - Calculer le diff ligne à ligne entre ancien (index) et nouveau (WT)
   - Générer la structure `DiffFile` avec hunks
3. Formatter en sortie texte Git
4. **Sortie** : Lignes de diff (plusieurs lignes possibles) ou rien si pas de changement
5. **Code de sortie** : 0

### Cas 2 : git diff --staged / --cached (index vs HEAD)

**Condition** : Flag `--staged` ou `--cached`.

**Processus** :
1. Récupérer tous les fichiers de l'index ET du HEAD (arbre du commit courant)
2. Pour chaque fichier :
   - Comparer l'index (nouveau) vs le tree HEAD (ancien)
   - Calculer le diff
3. Formatter en sortie texte
4. **Sortie** : Lignes de diff ou rien si pas de changement
5. **Code de sortie** : 0

### Cas 3 : git diff \<commit\> (WT vs commit)

**Condition** : Un argument `<commit>` sans flag --staged.

**Processus** :
1. Résoudre `<commit>` en hash via `resolveCommitish(repo, commit)`
2. Récupérer l'arbre du commit cible
3. Comparer WT (nouveau) vs arbre du commit (ancien)
4. Formatter en sortie texte
5. **Sortie** : Lignes de diff
6. **Code de sortie** : 0

### Cas 4 : git diff \<commit1\> \<commit2\> (entre commits)

**Condition** : Deux arguments `<commit1>` et `<commit2>`.

**Processus** :
1. Résoudre les deux commits
2. Récupérer leurs arbres respectifs
3. Comparer arbre de `<commit1>` (ancien) vs arbre de `<commit2>` (nouveau)
4. Formatter en sortie texte
5. **Sortie** : Lignes de diff
6. **Code de sortie** : 0

### Cas 5 : git diff -- \<pathspec\> (limiter aux chemins)

**Condition** : Flag `--` suivi d'un ou plusieurs chemins.

**Processus** :
1. Exécuter le diff normal (WT vs index, index vs HEAD, etc.)
2. Filtrer le résultat pour n'inclure que les fichiers qui matchent les pathspecs
3. Formatter en sortie
4. **Sortie** : Lignes de diff filtrées
5. **Code de sortie** : 0 (même si aucun fichier ne correspond, succès silencieux)

### Cas 6 : git show [commit]

**Condition** : Aucun ou un argument `<commit>`.

**Processus** :
1. Si `<commit>` absent, utiliser HEAD (si existe)
2. Résoudre `<commit>`
3. Récupérer le commit
4. **Afficher métadonnées** (sur stdout, formatage Git-like) :
   ```
   commit <hash>
   Author: <author> <date>
   
       <message>
   
   ```
5. **Calculer diff** : commit (nouveau) vs premier parent (ancien)
   - Si le commit n'a pas de parent (commit initial) : comparer vs arbre vide
   - Si le commit a 2+ parents (merge) : afficher le merge commit mais pas de diff détaillé (optionnel : afficher « Merge made by ... »)
6. Formatter et afficher le diff comme dans `git diff`
7. **Sortie** : Métadonnées + diff
8. **Code de sortie** : 0

## Cas d'erreur

### Commit inexistant (diff/show)

**Condition** : `git diff <commit>` ou `git show <commit>` où `<commit>` ne peut pas être résolu.

**Message d'erreur** (stderr) :
```
fatal: ambiguous argument '<commit>': unknown revision or path not in working tree
```

**Code de sortie** : 128

**Comportement** : Aucune sortie, erreur seulement.

### Dépôt non initialisé

**Condition** : `git diff` ou `git show` sans `git init`.

**Message d'erreur** (stderr) :
```
fatal: not a git repository (or any of the parent directories): .git
```

**Code de sortie** : 128

### git show sans commit (branche vide)

**Condition** : `git show` sur un dépôt vierge (pas de HEAD).

**Message d'erreur** (stderr) :
```
fatal: your current branch 'main' does not have any commits yet
```

**Code de sortie** : 128

## Critères d'acceptation

### CA-diff-show-01 : Diff WT vs index, aucun changement

**Given**
- Le dépôt est initialisé
- Un fichier `file.txt` avec contenu "hello" est commité
- WT et index alignés à HEAD

**When**
- L'utilisateur exécute `git diff`

**Then**
- `exitCode === 0`
- `output` est vide (aucune sortie)
- `output.length === 0`

### CA-diff-show-02 : Diff WT vs index, fichier modifié

**Given**
- Le dépôt est initialisé
- Deux commits : C0 (file.txt: "v0") ← C1 (HEAD, file.txt: "v1")
- L'utilisateur modifie file.txt dans le WT à "v1-modified" SANS staging

**When**
- L'utilisateur exécute `git diff`

**Then**
- `exitCode === 0`
- `output[0]` contient "diff --git a/file.txt b/file.txt"
- `output` contient "--- a/file.txt"
- `output` contient "+++ b/file.txt"
- `output` contient "-v1" (ancienne ligne)
- `output` contient "+v1-modified" (nouvelle ligne)
- `output` contient "@@"

### CA-diff-show-03 : Diff --staged, fichier stagé différent

**Given**
- Le dépôt est initialisé
- Deux commits : C0 (file.txt: "v0") ← C1 (HEAD, file.txt: "v1")
- L'utilisateur modifie file.txt à "v1-staged" et stage (`git add`)

**When**
- L'utilisateur exécute `git diff --staged`

**Then**
- `exitCode === 0`
- `output[0]` contient "diff --git a/file.txt b/file.txt"
- `output` contient "-v1" (HEAD version)
- `output` contient "+v1-staged" (staged version)

### CA-diff-show-04 : Diff --cached (alias --staged)

**Given**
- Même configuration que CA-diff-show-03

**When**
- L'utilisateur exécute `git diff --cached`

**Then**
- `exitCode === 0`
- `output` identique à CA-diff-show-03 (--cached = --staged)

### CA-diff-show-05 : Diff <commit>, WT vs ancien commit

**Given**
- Le dépôt a trois commits : C0 ← C1 ← C2 (HEAD)
- C0 : file.txt = "v0"
- C1 : file.txt = "v1"
- C2 : file.txt = "v2"
- WT : file.txt = "v2-modified"

**When**
- L'utilisateur exécute `git diff C0`

**Then**
- `exitCode === 0`
- `output` contient "diff --git a/file.txt"
- `output` contient "-v0" (C0 version)
- `output` contient "+v2-modified" (WT version)

### CA-diff-show-06 : Diff <commit1> <commit2>, entre commits

**Given**
- Le dépôt a trois commits : C0 (file.txt: "v0") ← C1 (file.txt: "v1") ← C2 (file.txt: "v2", HEAD)

**When**
- L'utilisateur exécute `git diff C0 C2`

**Then**
- `exitCode === 0`
- `output[0]` contient "diff --git a/file.txt"
- `output` contient "-v0" (C0)
- `output` contient "+v2" (C2)

### CA-diff-show-07 : Diff avec fichier ajouté

**Given**
- Le dépôt est initialisé
- Un premier commit C0 avec `a.txt` = "content"
- L'utilisateur crée `b.txt` = "new file content" dans le WT sans staging

**When**
- L'utilisateur exécute `git diff`

**Then**
- `exitCode === 0`
- `output[0]` contient "diff --git a/b.txt b/b.txt"
- `output` contient "new file mode 100644" (optionnel mais recommandé)
- `output` contient "+new file content"
- Aucune ligne commençant par "-" (pas de contenu ancien)

### CA-diff-show-08 : Diff avec fichier supprimé

**Given**
- Le dépôt a C1 (HEAD) contenant `file.txt` = "content"
- L'utilisateur supprime `file.txt` dans le WT

**When**
- L'utilisateur exécute `git diff`

**Then**
- `exitCode === 0`
- `output[0]` contient "diff --git a/file.txt b/file.txt"
- `output` contient "deleted file mode 100644" (optionnel)
- `output` contient "-content"
- Aucune ligne commençant par "+" (pas de nouveau contenu)

### CA-diff-show-09 : Diff -- <pathspec>, limiter aux chemins

**Given**
- Le dépôt a C1 (HEAD) avec {a.txt: "A", b.txt: "B", dir/c.txt: "C"}
- WT modifié : {a.txt: "A-modified", b.txt: "B-modified", dir/c.txt: "C-modified"}

**When**
- L'utilisateur exécute `git diff -- a.txt dir/`

**Then**
- `exitCode === 0`
- `output` contient "diff --git a/a.txt"
- `output` contient "diff --git a/dir/c.txt"
- `output` N'INCLUT PAS "b.txt"

### CA-diff-show-10 : Diff pathspec inexistant, succès silencieux

**Given**
- Le dépôt a C1 (HEAD) avec `file.txt`
- WT modifié : `file.txt` = "modified"

**When**
- L'utilisateur exécute `git diff -- nonexistent.txt`

**Then**
- `exitCode === 0`
- `output` est vide (aucun changement n'existe pour ce chemin)

### CA-diff-show-11 : git show HEAD, métadonnées + diff

**Given**
- Le dépôt a C0 ← C1 (HEAD, file.txt: "v1")
- Message de C1 : "Add file"

**When**
- L'utilisateur exécute `git show`

**Then**
- `exitCode === 0`
- `output[0]` contient "commit" et le hash de C1
- `output` contient "Author:" et l'auteur
- `output` contient "Add file"
- `output` contient "diff --git"
- `output` contient "-v0" (ancien, de C0)
- `output` contient "+v1" (nouveau, de C1)

### CA-diff-show-12 : git show <commit>, commit spécifique

**Given**
- Le dépôt a C0 ← C1 ← C2 (HEAD)
- C1 : file.txt: "v1", message "Commit 1"
- C0 : file.txt: "v0"

**When**
- L'utilisateur exécute `git show C1`

**Then**
- `exitCode === 0`
- `output[0]` contient "commit" et le hash de C1
- `output` contient "Commit 1"
- `output` contient "diff --git"
- `output` contient "-v0" (C0 parent)
- `output` contient "+v1" (C1)

### CA-diff-show-13 : git show commit initial, diff vs arbre vide

**Given**
- Le dépôt a un seul commit C0 : file.txt: "initial content", message "Initial"
- C0 n'a pas de parent

**When**
- L'utilisateur exécute `git show C0`

**Then**
- `exitCode === 0`
- `output[0]` contient "commit" et le hash de C0
- `output` contient "Initial"
- `output` contient "diff --git a/file.txt b/file.txt"
- `output` contient "new file mode" (ou au minimum le diff avec +initial content)
- Aucune ligne "-" (pas de contenu ancien)

### CA-diff-show-14 : Diff avec fichier binaire (contient \0)

**Given**
- Le dépôt a C1 (HEAD) avec `image.bin` contenant des octets nuls (binaire)
- WT modifié : `image.bin` avec contenu différent (toujours binaire)

**When**
- L'utilisateur exécute `git diff`

**Then**
- `exitCode === 0`
- `output[0]` contient "diff --git a/image.bin"
- `output` contient "Binary files differ" (au lieu de +/- lignes)

### CA-diff-show-15 : Erreur commit inexistant

**Given**
- Le dépôt est initialisé avec au moins un commit

**When**
- L'utilisateur exécute `git diff nosuchcommit`

**Then**
- `exitCode === 128`
- `errors[0]` contient "unknown revision"

### CA-diff-show-16 : Erreur git show sans commit, branche vide

**Given**
- Le dépôt est initialisé mais vierge (aucun commit)

**When**
- L'utilisateur exécute `git show`

**Then**
- `exitCode === 128`
- `errors[0]` contient "does not have any commits yet" ou "unknown revision"

### CA-diff-show-17 : Erreur dépôt non initialisé

**Given**
- L'engine est en état vierge (pas d'appel à `git init`)

**When**
- L'utilisateur exécute `git diff`

**Then**
- `exitCode === 128`
- `errors[0]` contient "not a git repository"

### CA-diff-show-18 : Diff avec révisions HEAD~n

**Given**
- Le dépôt a C0 ← C1 ← C2 (HEAD)
- C0: file.txt: "v0", C1: file.txt: "v1", C2: file.txt: "v2"

**When**
- L'utilisateur exécute `git diff HEAD~1 HEAD`

**Then**
- `exitCode === 0`
- `output` contient "-v1" (HEAD~1)
- `output` contient "+v2" (HEAD)

### CA-diff-show-19 : Diff <branch>, comparer avec branche

**Given**
- Le dépôt a C0 ← C1 (main, HEAD) et C0 ← C2 (feature)
- C1: file.txt: "main", C2: file.txt: "feature"

**When**
- L'utilisateur exécute `git diff feature`

**Then**
- `exitCode === 0`
- `output` contient "-feature" (branche feature)
- `output` contient "+main" (WT courant, main)

### CA-diff-show-20 : Diff multiple fichiers, plusieurs hunks

**Given**
- Le dépôt a C1 (HEAD) avec `file.txt` contenant 20 lignes
- WT modifié : ligne 3 changée, ligne 15 changée

**When**
- L'utilisateur exécute `git diff`

**Then**
- `exitCode === 0`
- `output` contient "diff --git a/file.txt"
- `output` contient au moins 2 blocs "@@ ... @@" (deux hunks distincts)
- Chaque hunk affiche 3+ lignes de contexte autour des modifications

---

## Implémentation : Points clés

1. **Diff algorithmique** : Implémenter un LCS simplifié ou Myers pour calculer les différences ligne à ligne.
2. **Contexte** : Par défaut 3 lignes de contexte ; rendre configurable pour tests/optimisation.
3. **Détection binaire** : Vérifier la présence d'octets nuls (`\0`) pour identifier les fichiers binaires.
4. **Formatage Git-compatible** : Respecter strictement le format des en-têtes et des hunks.
5. **Pathspecs** : Supporter `--` suivi de chemins pour filtrer le résultat.
6. **Snapshot interne** : Exposer une structure `DiffResult` pour un futur visualiseur UI (modale ou panneau de diff).

## Dépendances inter-commandes

- **Dépend de** : `git init` (dépôt doit être initialisé), `git add`, `git commit`
- **Utilisé par** : Interface de visualisation de diff (UI future)

---

## Notes pour le développement

- La structure `DiffResult` et ses types sont définies pour un contrat futur avec l'UI, mais ne doivent pas bloquer l'implémentation initiale (priorité : sortie texte correcte).
- L'algorithme de diff peut être basique initialement (ligne à ligne, pas de déplacement de bloc) ; optimisations futures possibles.
- `git show` réutilise largement la logique de diff : cible le même algorithme + formatage de métadonnées.
- Tester sur de gros fichiers (100+ lignes) pour valider les perfs (O(n²) acceptable pour n < 1000).
