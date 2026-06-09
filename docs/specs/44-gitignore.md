# Phase 6+ : .gitignore Support

## Résumé

Le fichier `.gitignore` (créé via l'utilitaire `write`) contient une liste de patterns qui excluent des chemins du suivi Git. Les fichiers correspondant à ces patterns sont automatiquement ignorés par `git status` (n'apparaissent plus en "Untracked"), et `git add` les refuse sauf avec le flag `-f` (force). Cela permet de contrôler quels fichiers sont visibles et ajoutables dans le dépôt.

## Syntaxe

```
write .gitignore "<patterns>"
```

où `<patterns>` est du texte contenant des règles, une par ligne.

### Format du fichier `.gitignore`

Le fichier est lu ligne par ligne ; chaque ligne est un pattern ou une directive :

| Type | Syntaxe | Exemple | Sens |
|------|---------|---------|------|
| **Pattern glob simple** | `<glob>` | `*.log` | Fichiers matching le glob (wildcards `*` et `?`) |
| **Répertoire** | `<dir>/` | `node_modules/` | Répertoire entier (récursif) |
| **Négation** | `!<pattern>` | `!important.log` | Annule un pattern précédent (réinclut le chemin) |
| **Commentaire** | `#<texte>` | `# Build artifacts` | Ligne ignorée |
| **Ligne vide** | (vide) | | Ignorée |

### Support de patterns

- **Globs simples** : `*` (n'importe quel caractère sauf `/`), `?` (exactement un caractère), `**` (répertoires imbriqués si en préfixe/suffixe, ex. `**/temp` match `a/temp`, `a/b/temp`, etc.)
- **Chemins littéraux** : `src/cache` match le fichier ou répertoire `src/cache` (chemin exact ou préfixe si répertoire)
- **Répertoires** : pattern terminé par `/` = match les répertoires uniquement (récursif)
- **Négation** : pattern commençant par `!` = annule les patterns précédents (réinclut) ; appliquée dans l'ordre d'apparition
- **Commentaires et vides** : ignorés

### Résolution et ordre

Les patterns sont évalués dans l'**ordre d'apparition** du fichier (du haut vers le bas). Un fichier est ignoré si :
1. Il match au moins un pattern positif (non-négation)
2. ET il ne match aucun pattern de négation (`!...`) apparu après le dernier pattern positif qui l'a matché

Équivalent Git : « last matching pattern wins ».

## Comportement nominal

### Lecture du `.gitignore`

Lors de l'exécution de `git status` ou `git add`, le moteur :
1. Lit le fichier `.gitignore` (s'il existe)
2. Parse les patterns
3. Crée une fonction de filtrage déterministe (ordre garanti)
4. L'applique à tous les chemins du working tree

### Impact sur `git status`

- Les fichiers matchant les patterns sont **exclus du statut "Untracked"**
- Ils n'apparaissent donc jamais dans le résultat de `git status` (même long ou -s)
- Sauf si le fichier est **déjà suivi** (dans le HEAD ou l'index) → reste affiché (Git conserve les fichiers ignorés mais suivis)

### Impact sur `git add`

- `git add <pathspec>` où `<pathspec>` match un fichier ignoré → **erreur** : `fatal: add [--force|-f]: <pathspec> is ignored by one of your .gitignore files, use 'add -f' to add it`
- `git add .` ignore les fichiers matchant `.gitignore` (ne les ajoute pas)
- `git add -f <pathspec>` **force l'ajout** même si ignoré
- `git add -f .` ajoute tous les fichiers y compris les ignorés

### Cas special : fichier déjà suivi

**Condition** : Un fichier `doc.txt` est suivi (présent dans le HEAD ou l'index), puis ajouté à `.gitignore`.

**Comportement** :
- `doc.txt` reste **suivi** (continue d'apparaître dans les commits)
- Dans `git status`, il peut être modifié mais le pattern l'ignore **pour les fichiers untracked seulement**
- Si le fichier est modifié et non-stagé, il apparaît sous "Changes not staged for commit" (car il est suivi)
- C'est conforme à Git : l'ignore s'applique aux **non-suivis** ; les suivis ne sont jamais ignorés

### Cache/Évaluation

Pour chaque commande (`status`, `add`), le moteur relit le `.gitignore` et recompile la liste des patterns (pas de cache complexe). L'ordre d'évaluation est déterministe → résultats stables.

## Cas d'erreur

### Patterns invalides

**Condition** : Le fichier `.gitignore` contient des patterns syntaxiquement invalides (ex. caractères de contrôle, guillemets mal échappés).

**Comportement** :
- Les patterns invalides sont **ignorés silencieusement** ou **traitées comme littérales**
- Pas d'erreur levée (Git fait de même)
- Exemple : `[broken` (crochet non fermé) est traité comme littéral

### Fichier `.gitignore` absent

**Condition** : Il n'existe pas de fichier `.gitignore` dans le dépôt.

**Comportement** :
- Aucun fichier n'est ignoré par pattern
- `git status` et `git add` fonctionnent normalement (tous les fichiers untracked sont considérés)
- Pas d'erreur

## Critères d'acceptation (Given/When/Then)

### CA-gitignore-01 : Pattern glob simple `*.log`

**Given**
- Le dépôt a été initialisé (`git init`)
- Le fichier `.gitignore` contient `*.log`
- Trois fichiers existent : `file.txt`, `debug.log`, `app.log`

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` contient "Untracked files:" (si d'autres fichiers untracked)
- `output` contient `file.txt`
- `output` NE contient PAS `debug.log`
- `output` NE contient PAS `app.log`

### CA-gitignore-02 : Répertoire avec `node_modules/`

**Given**
- Le dépôt a été initialisé
- Le fichier `.gitignore` contient `node_modules/`
- Fichiers : `main.js`, `node_modules/lodash/index.js`, `node_modules/lodash/package.json`

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` contient `main.js`
- `output` NE contient PAS `node_modules` (ni `lodash`, ni les fichiers du répertoire)

### CA-gitignore-03 : Glob `**/temp`

**Given**
- Le dépôt a été initialisé
- Le fichier `.gitignore` contient `**/temp`
- Fichiers : `temp`, `a/temp`, `a/b/temp`, `template`

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` contient `template` (ne match pas `**/temp`)
- `output` NE contient PAS `temp`, `a/temp`, `a/b/temp` (tous match `**/temp`)

### CA-gitignore-04 : Négation avec `!`

**Given**
- Le dépôt a été initialisé
- Le fichier `.gitignore` contient :
  ```
  *.log
  !important.log
  ```
- Fichiers : `debug.log`, `important.log`, `app.log`

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` NE contient PAS `debug.log` et `app.log` (ignorés)
- `output` contient `important.log` (réinclus par négation)

### CA-gitignore-05 : Ordre d'évaluation (last match wins)

**Given**
- Le dépôt a été initialisé
- Le fichier `.gitignore` contient :
  ```
  *.log
  !debug.log
  *.log
  ```
- Fichiers : `debug.log`, `app.log`

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` NE contient PAS `debug.log` ni `app.log` (le dernier `*.log` gagne)

### CA-gitignore-06 : `git add` refuse les fichiers ignorés

**Given**
- Le dépôt a été initialisé
- Le fichier `.gitignore` contient `*.log`
- Un fichier `debug.log` existe

**When**
- L'utilisateur exécute `git add debug.log`

**Then**
- `exitCode === 1`
- `errors[0]` contient "is ignored by one of your .gitignore files"

### CA-gitignore-07 : `git add -f` force l'ajout

**Given**
- Le dépôt a été initialisé
- Le fichier `.gitignore` contient `*.log`
- Un fichier `debug.log` existe

**When**
- L'utilisateur exécute `git add -f debug.log`

**Then**
- `exitCode === 0`
- `index["debug.log"]` existe
- Le fichier est stagé (force a forcé)

### CA-gitignore-08 : `git add .` ignore les fichiers ignorés

**Given**
- Le dépôt a été initialisé
- Le fichier `.gitignore` contient `*.log`
- Fichiers : `file.txt`, `debug.log`, `app.log`

**When**
- L'utilisateur exécute `git add .`

**Then**
- `exitCode === 0`
- `index["file.txt"]` existe
- `index["debug.log"]` N'existe PAS
- `index["app.log"]` N'existe PAS

### CA-gitignore-09 : Fichier déjà suivi reste visible

**Given**
- Le dépôt a été initialisé
- Un commit contient un fichier `doc.txt` avec contenu "v1"
- Le fichier `.gitignore` est créé et contient `*.txt`
- Le fichier `doc.txt` est modifié à "v2" dans le working tree

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` contient "Changes not staged for commit:"
- `output` contient `doc.txt` (modifié ; n'est pas ignoré car suivi)

### CA-gitignore-10 : Commentaires et lignes vides ignorés

**Given**
- Le dépôt a été initialisé
- Le fichier `.gitignore` contient :
  ```
  # Build artifacts
  *.log

  # Deps
  node_modules/
  ```
- Fichiers : `debug.log`, `node_modules/lodash`, `src/app.js`

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` NE contient PAS `debug.log` ni `node_modules`
- `output` contient `src/app.js`

### CA-gitignore-11 : Pattern littéral `src/cache`

**Given**
- Le dépôt a été initialisé
- Le fichier `.gitignore` contient `src/cache`
- Fichiers : `src/cache`, `src/cache.txt`, `src/main.ts`, `cache`

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` NE contient PAS `src/cache` (match exact ou préfixe si dir)
- `output` contient `src/cache.txt` (ne match pas)
- `output` contient `src/main.ts`
- `output` contient `cache` (pattern appliqué depuis la racine)

### CA-gitignore-12 : Pas de `.gitignore` → aucun fichier ignoré

**Given**
- Le dépôt a été initialisé
- Aucun fichier `.gitignore` créé
- Fichiers : `*.log`, `node_modules/` (créés comme noms littéraux)

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- Tous les fichiers (y compris noms littéraux `*.log` et `node_modules/`) sont listés comme untracked
- Aucun fichier n'est filtré

### CA-gitignore-13 : `git add -f .` ajoute tous y compris ignorés

**Given**
- Le dépôt a été initialisé
- Le fichier `.gitignore` contient `*.log`
- Fichiers : `file.txt`, `debug.log`

**When**
- L'utilisateur exécute `git add -f .`

**Then**
- `exitCode === 0`
- `index["file.txt"]` existe
- `index["debug.log"]` existe (force a forcé l'ajout malgré ignore)

### CA-gitignore-14 : Négation annule ignores antérieures

**Given**
- Le dépôt a été initialisé
- Le fichier `.gitignore` contient :
  ```
  /build
  !/build/keep/
  ```
- Fichiers : `build/artifact.o`, `build/keep/data.txt`, `src/main.ts`

**When**
- L'utilisateur exécute `git status`

**Then**
- `exitCode === 0`
- `output` NE contient PAS `build/artifact.o` (ignoré)
- `output` contient `build/keep/data.txt` (réinclus par négation)
- `output` contient `src/main.ts`

---

## Implémentation : Points clés

1. **Lecture du `.gitignore`** : Implémenter en `repository.ts` une méthode `loadGitignore()` qui lit le fichier (s'il existe) et parse les patterns ligne par ligne.
2. **Fonction de filtrage** : Construire une fonction pure déterministe `isIgnored(path): boolean` qui applique les patterns dans l'ordre.
3. **Support de globs** : Implémenter `*` (any char except `/`), `?` (single char), `**` (recursive), littéraux.
4. **Négatifs** : Gérer les patterns `!...` en gardant l'ordre (last match wins).
5. **Appliquer partout** : Mettre à jour `git status` (exclure les untracked ignorés) et `git add` (refuser les ignorés sauf `-f`).
6. **Fichiers suivis non ignorés** : Un fichier déjà suivi ne doit jamais être filtré, même s'il match un pattern.
7. **Détérminisme** : Pas de cache volatile ; réévaluation à chaque appel garantit la cohérence.

## Dépendances inter-commandes

- **Utilisé par** : `git status`, `git add`
- **Dépend de** : `git init` (dépôt doit être initialisé)
- **Indépendant** : Pas de lien avec les phases précédentes

---

## Notes pour le développement

- Le `.gitignore` est créé via `write .gitignore "..."` (pas une commande git dédiée) ; c'est un fichier virtuel du working tree.
- L'implémentation doit être headless (testable via Vitest) : une fonction pure de filtrage.
- Les patterns invalides ne doivent pas lever d'erreur ; elles sont traitées comme littérales (comme Git).
- L'ordre d'apparition dans le fichier est critique ; tester exhaustivement « last match wins ».
