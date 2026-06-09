# Phase 6+ : git restore/checkout Complet — Solde de la Dette Phase 2

## Résumé

Cette spec corrige et complète les implémentations de `git restore` (Phase 2) et `git checkout -- <pathspec>` (Phase 1 compat) en traitant les 4 items de dette listés dans `CLAUDE.md` :

1. **`git restore --staged --source=<commit>` combinés** : router selon le quadrant `(isStaged, sourceRef)` — 4 cas précis
2. **`git restore` avec pathspecs MULTIPLES** : un chemin inexistant parmi plusieurs génère une erreur
3. **`git checkout -- <pathspec>`** : compat Phase 1 — restaure depuis l'index
4. **Ambiguïté `resolveCommitish`** : lever le conflit quand une branche vide (`""`) « consomme » un nom

Phase 2 avait implémenté `restore` de base ; cette spec précise les cas limites et les combinaisons manquantes.

## Syntaxe

```
git restore [options] <pathspec...>
git checkout -- <pathspec...>
```

### Options supportées (Phase 6+)

| Option | Argument | Comportement | Interaction |
|--------|----------|-------------|---|
| (aucun) | `<pathspec...>` | Restaure WT depuis l'index | — |
| `--staged` | `<pathspec...>` | Retire du staging (index ← HEAD) | Exclut `--source` |
| `--source` | `<commit>` | Source personnalisée | Affecte WT ET index selon flag `--staged` |
| `--source` + `--staged` | `<commit>` | **Cas 3 & 4 du quadrant** | Routing spécifique |

## Quadrant : `--staged` × `--source`

Nouvelle clarification Phase 6 : le comportement change selon la **présence ou absence** de `--source` ET `--staged`.

### Cas 1 : Restaurer WT depuis l'index (défaut : aucun flag)

**Syntaxe** : `git restore <pathspec>`

**Effet** : Working tree ← index (l'index ne change pas)

**Cible** : Working tree uniquement

**Condition** : `--staged` absent, `--source` absent

**Processus** :
1. Récupérer le blob depuis `index[<pathspec>]`
2. Écrire dans `workingTree[<pathspec>]`
3. Index inchangé

**Exemple** :
```
HEAD:     file.txt = "original"
index:    file.txt = "staged"
WT:       file.txt = "modified"

$ git restore file.txt
→ WT: "staged" (restauré depuis index)
  index: "staged" (inchangé)
  HEAD: "original" (inchangé)
```

### Cas 2 : Retirer du staging (défaut : `--staged` seul)

**Syntaxe** : `git restore --staged <pathspec>`

**Effet** : Index ← HEAD (le working tree ne change pas)

**Cible** : Index uniquement

**Condition** : `--staged` présent, `--source` absent

**Processus** :
1. Récupérer le blob depuis `HEAD[<pathspec>]` (ou `BASE` si dépôt vierge)
2. Remplacer `index[<pathspec>]` par ce blob
3. Working tree inchangé

**Exemple** :
```
HEAD:     file.txt = "original"
index:    file.txt = "staged"
WT:       file.txt = "staged"

$ git restore --staged file.txt
→ index: "original" (restauré depuis HEAD)
  WT: "staged" (inchangé)
  HEAD: "original" (inchangé)
```

### Cas 3 : Restaurer WT depuis un commit (défaut : `--source` seul)

**Syntaxe** : `git restore --source=<commit> <pathspec>`

**Effet** : Working tree ← <commit> (l'index ne change pas)

**Cible** : Working tree uniquement

**Condition** : `--source` présent, `--staged` absent

**Processus** :
1. Récupérer le blob depuis `<commit>[<pathspec>]`
2. Écrire dans `workingTree[<pathspec>]`
3. Index inchangé

**Exemple** :
```
HEAD (c1):  file.txt = "v1"
c2:         file.txt = "v2"
index:      file.txt = "v1"
WT:         file.txt = "modified"

$ git restore --source=c2 file.txt
→ WT: "v2" (restauré depuis c2)
  index: "v1" (inchangé)
```

### Cas 4 : Restaurer index depuis un commit (NEW : `--staged` + `--source` combinés)

**Syntaxe** : `git restore --staged --source=<commit> <pathspec>`

**Effet** : Index ← <commit> (le working tree ne change pas)

**Cible** : Index uniquement

**Condition** : `--staged` présent ET `--source` présent

**Processus** :
1. Récupérer le blob depuis `<commit>[<pathspec>]`
2. Remplacer `index[<pathspec>]` par ce blob
3. Working tree inchangé

**Remarque** : **Phase 2 avait un bug** : `--source` court-circuitait `--staged` et modifiait le WT à la place. Cette spec corrige : `--staged` **toujours** cible l'index, quel que soit `--source`.

**Exemple** :
```
HEAD (c1):   file.txt = "v1"
c2:          file.txt = "v2"
index:       file.txt = "v1"
WT:          file.txt = "v1"

$ git restore --staged --source=c2 file.txt
→ index: "v2" (restauré depuis c2)
  WT: "v1" (inchangé)
  HEAD: "v1" (inchangé)
```

## Pathspecs Multiples — Validation

### Cas Phase 2 (bug)

En Phase 2, `git restore <pathspec1> <pathspec2> …` ignorait silencieusement les pathspecs inexistants.

**Exemple bugué** :
```
index:    file1.txt = "a", file2.txt = "b"
WT:       file1.txt = "modified", nosuchfile.txt n'existe pas

$ git restore file1.txt nosuchfile.txt
→ (Phase 2 bug) WT: file1.txt = "a", et silencieusement ignore nosuchfile.txt
   exitCode: 0 (faux)
```

### Comportement correct (Phase 6+)

**Condition** : Un ou plusieurs pathspecs n'existent dans AUCUNE source (index pour Cas 1, HEAD pour Cas 2, commit pour Cas 3/4).

**Processus** :
1. **Valider d'abord tous les pathspecs** : pour chaque `<pathspec>` en argument
   - Si la source (index, HEAD, ou commit) ne contient ce pathspec → ajouter à la liste des erreurs
2. **Si au moins un pathspec invalide** :
   - Retourner une erreur complète
   - **Ne rien restaurer** (atomicité)
   - Message : lister tous les pathspecs non trouvés
3. **Si tous les pathspecs valides** :
   - Restaurer normalement

**Message d'erreur** (exemple) :
```
error: pathspec 'nosuchfile.txt' did not match any files
```

ou, si plusieurs absents :
```
error: pathspec 'nosuchfile1.txt' did not match any files
error: pathspec 'nosuchfile2.txt' did not match any files
```

**Code de sortie** : 1

**Exemple corrigé** :
```
index:    file1.txt = "a"
WT:       file1.txt = "modified", nosuchfile.txt n'existe pas

$ git restore file1.txt nosuchfile.txt
→ exitCode: 1
  errors[0]: "error: pathspec 'nosuchfile.txt' did not match any files"
  WT: inchangé (file1.txt non restauré car au moins un pathspec échoue)
```

### Cas particulier : `.` avec pathspecs invalides

Si l'utilisateur appelle `git restore .` (tous les fichiers), les pathspecs inexistants ne génèrent **pas** d'erreur (c'est une opération globale). Cependant, si l'utilisateur énumère spécifiquement des chemins, chacun doit exister.

## `git checkout -- <pathspec>` — Compatibilité Phase 1

### Contexte

En Phase 1, `git checkout -- <pathspec>` restaurait un fichier depuis HEAD. En Phase 2, on a introduit `git restore` (plus claire). Phase 6+ clarifie la compat et corrige les bugs.

### Comportement

`git checkout -- <pathspec...>` est un **alias** pour `git restore <pathspec...>` (Cas 1 : restaurer WT depuis l'index).

**Syntaxe** : `git checkout -- <pathspec>`

**Équivalent** : `git restore <pathspec>`

**Processus** :
1. Récupérer le blob depuis `index[<pathspec>]`
2. Écrire dans `workingTree[<pathspec>]`
3. **Validation pathspecs multiples** : appliquer les mêmes règles que restore

**Message** : Succès muet (pas de sortie, code 0)

**Erreur** : Idem `restore` (pathspec inexistant)

**Exemple** :
```
$ git checkout -- file.txt
```

**Déprécation** : Phase 6+, préférer `git restore file.txt` (plus clair et générique).

## `resolveCommitish` — Levée d'ambiguïté

### Contexte (dette Phase 2)

En Phase 2, `resolveCommitish(repo, "name")` pouvait être ambigu si une branche vide (`refs/heads/name = ""`) existait. Elle « consommait » le nom et empêchait la résolution d'un tag ou hash court homonyme.

**Exemple bugué** :
```
refs.heads.abc = ""    (branche vide)
refs.tags.abc = hash1  (tag nommé abc)
objects: hash2 (hash court abc123…)

resolveCommitish(repo, "abc")
→ (Phase 2) tentait refs.heads.abc (vide), puis échouait
→ (Phase 2) ne consultait pas refs.tags.abc ni le hash court
```

### Correction Phase 6+

**Règle** : Ignorer les branches vides lors de la résolution ; traiter comme inexistantes.

**Algorithme révisé** :

1. Parser `~n` (voir Phase 4, spec 18)
2. Résoudre la base récursivement
3. Chercher `<commitish>` (sans `~n`) :
   - Si `<commitish> === "HEAD"` → `headCommitHash(repo)` (ou erreur si null)
   - Si `<commitish>` dans `refs.heads` **ET non vide** → utiliser ce hash
   - Sinon, si `<commitish>` dans `refs.tags` → utiliser ce hash
   - Sinon, si `<commitish>` est un hash valide dans `objects` (7+ chars) → utiliser
   - Sinon → erreur "unknown revision"

**Changement** : Une branche vide (`""`) n'est **plus jamais retournée** ; elle est ignorée au profit d'un tag ou hash homonyme.

**Exemple corrigé** :
```
refs.heads.abc = ""    (branche vide, ignorée)
refs.tags.abc = hash1  (tag)

resolveCommitish(repo, "abc")
→ Retourne hash1 (du tag, car branche vide ignorée)
```

## Cas d'erreur

### Pathspec n'existe pas ou est invalide (Cas 1–4 génériques)

**Condition** : Un ou plusieurs `<pathspec>` n'existe dans aucune source.

**Message d'erreur** :
```
error: pathspec '<pathspec>' did not match any files
```

**Code de sortie** : 1

**Comportement** : Aucune modification au working tree ou à l'index (atomicité).

### Pathspec vide

**Condition** : Appeler `git restore` ou `git checkout --` sans pathspec.

**Message d'erreur** :
```
fatal: pathspec cannot be empty
```

**Code de sortie** : 1

### Commit inexistant (`--source`)

**Condition** : `git restore --source=<commit>` où `<commit>` n'existe pas.

**Message d'erreur** :
```
fatal: reference is not a tree: '<commit>'
```

**Code de sortie** : 1

**Comportement** : Aucune modification.

### Dépôt non initialisé

**Condition** : Appeler `git restore` ou `git checkout --` sans `git init`.

**Message d'erreur** :
```
fatal: not a git repository (or any of the parent directories): .git
```

**Code de sortie** : 128

### `--staged` sur dépôt vierge (HEAD n'existe pas)

**Condition** : `git restore --staged <pathspec>` sur un dépôt neuf (aucun commit).

**Comportement** : Supprimer `<pathspec>` de l'index (car il n'existe pas dans HEAD).

**Message** : Succès muet.

**Code de sortie** : 0

### `--staged --source` invalide (Cas 4)

**Condition** : `git restore --staged --source=<commit> <pathspec>` où `<commit>` n'existe pas.

**Message d'erreur** :
```
fatal: reference is not a tree: '<commit>'
```

**Code de sortie** : 1

**Comportement** : Aucune modification.

## Critères d'acceptation

### CA-restore-quadrant-01 : Cas 1 — Restaurer WT depuis l'index

**Given**
- Repository avec un commit contenant `file.txt` = "original"
- `index['file.txt']` = "staged"
- `workingTree['file.txt']` = "modified"

**When**
- Exécute `git restore file.txt`

**Then**
- `exitCode === 0`
- `workingTree['file.txt'].content === "staged"` (depuis l'index)
- `index['file.txt'].content === "staged"` (inchangé)
- Pas de sortie (succès muet)

### CA-restore-quadrant-02 : Cas 2 — Retirer du staging

**Given**
- Repository avec un commit : `file.txt` = "original"
- `index['file.txt']` = "staged"
- `workingTree['file.txt']` = "staged"

**When**
- Exécute `git restore --staged file.txt`

**Then**
- `exitCode === 0`
- `index['file.txt'].content === "original"` (depuis HEAD)
- `workingTree['file.txt'].content === "staged"` (inchangé)

### CA-restore-quadrant-03 : Cas 3 — Restaurer WT depuis un commit

**Given**
- Repository avec commits c1 (`file.txt` = "v1") et c2 (`file.txt` = "v2")
- HEAD pointe c2
- `index['file.txt']` = "v2"
- `workingTree['file.txt']` = "modified"

**When**
- Exécute `git restore --source=c1 file.txt`

**Then**
- `exitCode === 0`
- `workingTree['file.txt'].content === "v1"` (depuis c1)
- `index['file.txt'].content === "v2"` (inchangé)

### CA-restore-quadrant-04 : Cas 4 — Restaurer index depuis un commit (NEW)

**Given**
- Repository avec commits c1 (`file.txt` = "v1") et c2 (`file.txt` = "v2")
- HEAD pointe c1
- `index['file.txt']` = "v1"
- `workingTree['file.txt']` = "v1"

**When**
- Exécute `git restore --staged --source=c2 file.txt`

**Then**
- `exitCode === 0`
- `index['file.txt'].content === "v2"` (depuis c2)
- `workingTree['file.txt'].content === "v1"` (inchangé)
- Aucun marqueur "Cas 3 appliqué" n'apparaît

### CA-restore-pathspec-multi-01 : Validation pathspecs multiples — tout valide

**Given**
- `index['file1.txt']` = "a", `index['file2.txt']` = "b"
- `workingTree['file1.txt']` = "modified", `workingTree['file2.txt']` = "modified"

**When**
- Exécute `git restore file1.txt file2.txt`

**Then**
- `exitCode === 0`
- `workingTree['file1.txt'].content === "a"`
- `workingTree['file2.txt'].content === "b"`

### CA-restore-pathspec-multi-02 : Un pathspec manquant parmi plusieurs — atomicité

**Given**
- `index['file1.txt']` = "a"
- Aucun `file2.txt` dans l'index
- `workingTree['file1.txt']` = "modified"

**When**
- Exécute `git restore file1.txt file2.txt`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"did not match any files"` et `"file2.txt"`
- `workingTree['file1.txt'].content === "modified"` (inchangé — atomicité)
- Aucune restauration n'a lieu

### CA-restore-pathspec-multi-03 : Plusieurs pathspecs manquants — tous listés

**Given**
- `index['file1.txt']` = "a"
- Aucun `file2.txt` ni `file3.txt` dans l'index

**When**
- Exécute `git restore file1.txt file2.txt file3.txt`

**Then**
- `exitCode === 1`
- `errors` contient messages pour `file2.txt` et `file3.txt` (ou une erreur consolidée)
- Aucune restauration

### CA-checkout-dash-dash-01 : `git checkout -- <pathspec>` équivalent restore

**Given**
- `index['file.txt']` = "staged"
- `workingTree['file.txt']` = "modified"

**When**
- Exécute `git checkout -- file.txt`

**Then**
- `exitCode === 0`
- `workingTree['file.txt'].content === "staged"` (depuis l'index, Cas 1 restore)

### CA-checkout-dash-dash-02 : `git checkout --` pathspec manquant

**Given**
- Aucun `nosuchfile.txt` dans l'index

**When**
- Exécute `git checkout -- nosuchfile.txt`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"did not match any files"`

### CA-resolveCommitish-ambiguity-01 : Branche vide ignorée en faveur d'un tag

**Given**
- Repository : `refs.heads.abc = ""` (branche vide)
- `refs.tags.abc = hash1` (tag)
- Un commit `hash1` existe

**When**
- `resolveCommitish(repo, "abc")` est appelé

**Then**
- Retourne `hash1` (du tag, pas d'erreur sur branche vide)

### CA-resolveCommitish-ambiguity-02 : Branche vide ignorée en faveur d'un hash court

**Given**
- Repository : `refs.heads.abc = ""` (branche vide)
- Un commit `abc1234def...` existe (hash valide commençant par `abc`)
- Aucun tag nommé `abc`

**When**
- `resolveCommitish(repo, "abc")` est appelé (hash court 7+ chars)

**Then**
- Retourne le hash complet (du commit, branche vide ignorée)

### CA-resolveCommitish-ambiguity-03 : Branche vide est la seule source — erreur

**Given**
- Repository : `refs.heads.abc = ""` (branche vide)
- Aucun tag `abc`
- Aucun commit matchant `abc` en hash court

**When**
- `resolveCommitish(repo, "abc")` est appelé

**Then**
- Retourne `null` (erreur : "unknown revision")

## Notes d'implémentation

### Atomicité des pathspecs multiples

Quand plusieurs pathspecs sont fournis :
1. **Valider tous d'abord** : parcourir tous les pathspecs, collecter les erreurs
2. **Si erreurs** : retourner sans modifier WT/index
3. **Si OK** : appliquer les restaurations

Code pattern :
```typescript
const missing = pathspecs.filter(ps => !sourceContains(ps));
if (missing.length > 0) {
  return fail(missing.map(ps => `error: pathspec '${ps}' did not match any files`));
}
// Appliquer restaurations
```

### Branche vide (`""`) vs inexistante

- Branche vide : `refs.heads[name] === ""` (clé existe, valeur vide)
- Branche inexistante : clé n'existe pas
- Les deux doivent être traitées comme « pas de branche »

### Cas 3 vs Cas 4 — Flag `--staged` Prime

Dans l'implémentation, `--staged` **prime** : si le flag est présent, toujours cibler l'index, quel que soit `--source`.

```typescript
if (args.staged) {
  // Cas 2 ou 4 : toujours index
  const source = args.source ? resolveCommitish(repo, args.source) : "HEAD";
  // restaurer depuis source dans index
} else {
  // Cas 1 ou 3 : toujours WT
  const source = args.source ? resolveCommitish(repo, args.source) : "index";
  // restaurer depuis source dans WT
}
```

## Dépendances inter-commandes

- Dépend de : `git init`, `git add`, `git commit`
- Impacte : Aucune (commandes en aval utilisent le WT/index mais ne testent pas restore)

## Résumé des changements

| Aspect | Phase 2 | Phase 6+ |
|--------|---------|---------|
| `--staged` sans `--source` | Cas 2 (index ← HEAD) | Cas 2 (inchangé) |
| `--source` seul | Cas 3 (WT ← commit) | Cas 3 (inchangé) |
| `--staged --source` combinés | Bug : WT ← commit | **Cas 4 : index ← commit** |
| Pathspecs multiples invalides | Silencieusement ignorés | Erreur atomique |
| Branche vide dans resolveCommitish | Consomme le nom, empêche tag/hash | Ignorée, tag/hash résolus |
| `git checkout --` | Non implémenté Phase 2 | Alias restore Cas 1 |

