# Phase 4 : git reset

## Résumé

La commande `git reset` déplace la branche courante (ou HEAD si détaché) vers un commit spécifié, et optionnellement réinitialise l'index et le working tree. Elle gère trois modes qui affectent l'index et le working tree différemment.

**Variantes** :
- `git reset <commit>` : équivalent à `--mixed` (défaut)
- `git reset --soft <commit>` : déplace HEAD uniquement
- `git reset --mixed <commit>` : déplace HEAD et réinitialise l'index (défaut)
- `git reset --hard <commit>` : déplace HEAD, réinitialise index et working tree
- `git reset` (sans commit) : réinitialise l'index à HEAD (équivalent `--mixed HEAD`)

## Syntaxe

```
git reset [--soft | --mixed | --hard] [<commit>]
```

### Options supportées en Phase 4

| Option | Argument | Comportement | Notes |
|--------|----------|-------------|-------|
| (aucun) | `<commit>` | Équivalent `--mixed` (défaut) | |
| `--soft` | `<commit>` | Déplace HEAD uniquement | Index et WT inchangés |
| `--mixed` | `<commit>` | Déplace HEAD et index | WT inchangé |
| `--hard` | `<commit>` | Déplace HEAD, index, et WT | Risque de perte de données |
| (aucun) | (aucun) | Équivalent `--mixed HEAD` | Réinitialise index uniquement |

**Remarque** : Les flags `--keep`, `--merge`, `-p`, `--patch`, etc. ne sont pas implémentés en Phase 4.

## Concepts fondamentaux

### HEAD symbolique vs détaché

**Si HEAD est symbolique** (sur une branche) :
- La commande met à jour `refs.heads[branchName]` vers le commit cible
- HEAD continue de pointer la branche (l'indirection continue)

**Si HEAD est détaché** :
- La commande met à jour directement `HEAD.target` vers le commit cible

### Les trois modes

#### Mode `--soft`

**Effet** :
- Déplace HEAD (et la branche si symbolique) vers le commit cible
- L'index reste **inchangé** (conserve l'ancien contenu stagé)
- Le working tree reste **inchangé**

**Cas d'usage** : Déplacer HEAD sans perdre les changements stagés (ex. : "j'ai committé trop tôt, je veux garder les changements")

Exemple :
```
Avant : index = {"a.txt": "v1"}, WT = {"a.txt": "v1"}, HEAD → C1

After git reset --soft HEAD~1 :
HEAD → C0
index = {"a.txt": "v1"}  (inchangé)
WT = {"a.txt": "v1"}     (inchangé)
```

#### Mode `--mixed` (défaut)

**Effet** :
- Déplace HEAD vers le commit cible
- L'index est réinitialisé avec l'arbre du nouveau commit
- Le working tree reste **inchangé**

**Cas d'usage** : Retirer des changements du staging sans toucher le working tree (ex. : "j'ai addé par erreur, retire l'index")

Exemple :
```
Avant : index = {"a.txt": "v1", "b.txt": "v2"}, WT = {"a.txt": "v1", "b.txt": "v2"}
HEAD → C1 (tree : {"a.txt": "v1"})

After git reset --mixed HEAD~1 :
C0 (tree : {"a.txt": "v0"})
index = {"a.txt": "v0"}  (réinitialisé)
WT = {"a.txt": "v1"}     (inchangé, différent de l'index maintenant)
```

#### Mode `--hard`

**Effet** :
- Déplace HEAD vers le commit cible
- L'index est réinitialisé avec l'arbre du nouveau commit
- Le working tree est réinitialisé avec l'arbre du nouveau commit

**Cas d'usage** : Annuler complètement les changements locaux (ex. : "je veux revenir à un état antérieur")

**⚠️ Danger** : Si le working tree a des changements non stagés non commités, ils sont **perdus définitivement**.

Exemple :
```
Avant : index = {"a.txt": "v1"}, WT = {"a.txt": "v1.modified"}
HEAD → C1 (tree : {"a.txt": "v1"})

After git reset --hard HEAD~1 :
C0 (tree : {"a.txt": "v0"})
index = {"a.txt": "v0"}
WT = {"a.txt": "v0"}  (perte de "v1.modified")
```

### Argument `<commit>` : par défaut HEAD

Si aucun `<commit>` n'est spécifié, utiliser `HEAD` comme défaut.

```
git reset --mixed      # équivalent à git reset --mixed HEAD
git reset              # équivalent à git reset --mixed HEAD
```

## Comportement nominal

### Cas 1 : Reset soft

**Condition** : Flag `--soft` et un `<commit>`.

**Processus** :
1. Résoudre `<commit>` en hash via `resolveCommitish(repo, commit)`
2. Vérifier que le commit existe
3. Déplacer HEAD vers le commit cible :
   - Si symbolique : `refs.heads[currentBranch] = <commit>`
   - Si détaché : `HEAD.target = <commit>`
4. **Index et working tree inchangés**
5. **Sortie** : Aucune (succès muet)
6. **Code de sortie** : 0

### Cas 2 : Reset mixed (défaut)

**Condition** : Flag `--mixed` (ou aucun) et un `<commit>`.

**Processus** :
1. Résoudre `<commit>` en hash
2. Vérifier que le commit existe
3. Déplacer HEAD (comme Cas 1)
4. Récupérer l'arbre du commit cible
5. Réinitialiser l'index : `repo.index = buildIndexFromTree(repo, targetTree)`
6. **Working tree inchangé**
7. **Sortie** : Aucune
8. **Code de sortie** : 0

### Cas 3 : Reset hard

**Condition** : Flag `--hard` et un `<commit>`.

**Processus** :
1-5. (Identique à mixed)
6. Réinitialiser le working tree : `repo.workingTree = flattenTree(repo, targetTree)`
7. **Sortie** :
   ```
   HEAD is now at <shortHash> <commit_message>
   ```
8. **Code de sortie** : 0

### Cas 4 : Reset sans commit (par défaut --mixed HEAD)

**Condition** : Aucun flag ou `--mixed`, et aucun argument `<commit>`.

**Processus** :
1. Utiliser HEAD comme commit cible
2. Réinitialiser l'index à HEAD (comme Cas 2)
3. **Sortie** : Aucune (succès muet)
4. **Code de sortie** : 0

### Cas 5 : Reset avec révisions `HEAD~n`

**Condition** : `git reset --hard HEAD~2`, par exemple.

**Processus** :
1. Appeler `resolveCommitish(repo, "HEAD~2")` pour obtenir le hash du commit
2. Exécuter reset normal (hard, soft, ou mixed) vers ce commit
3. **Sortie** : Standard

## Cas d'erreur

### Commit inexistant

**Condition** : `git reset <commit>` où `<commit>` ne peut pas être résolu.

**Message d'erreur** :
```
fatal: ambiguous argument '<commit>': unknown revision or path not in working tree
```

**Code de sortie** : 128

**Comportement** : Aucune modification à HEAD, l'index, ou le working tree.

### Branche vide (pas de HEAD)

**Condition** : Appeler `git reset` sur un dépôt vierge sans aucun commit.

**Comportement** : Acceptable ; HEAD reste undefined, aucune action (ou erreur, selon implémentation).

**Message d'erreur alternatif** :
```
fatal: your current branch 'main' does not have any commits yet
```

## Critères d'acceptation

### CA-reset-01 : Reset soft HEAD~1

**Given**
- Repository : C0 ← C1 (HEAD), index avec {a.txt: "v1"}, WT avec {a.txt: "v1"}

**When**
- Exécute `git reset --soft HEAD~1`

**Then**
- `exitCode === 0`
- `HEAD.target` pointe C0 (ou `refs.heads[branch]` si symbolique)
- `index['a.txt'] === "v1"` (inchangé)
- `workingTree['a.txt'] === "v1"` (inchangé)

### CA-reset-02 : Reset mixed HEAD~1

**Given**
- Repository : C0 (tree: {a.txt: "v0"}) ← C1 (HEAD, tree: {a.txt: "v1"})
- index : {a.txt: "v1"}
- WT : {a.txt: "v1"}

**When**
- Exécute `git reset --mixed HEAD~1`

**Then**
- `exitCode === 0`
- `HEAD.target` pointe C0
- `index['a.txt'].content === "v0"` (réinitialisé à C0)
- `workingTree['a.txt'].content === "v1"` (inchangé, maintenant différent de l'index)

### CA-reset-03 : Reset hard HEAD~1

**Given**
- Repository : C0 (tree: {a.txt: "v0"}) ← C1 (HEAD, tree: {a.txt: "v1"})
- index : {a.txt: "v1"}
- WT : {a.txt: "v1.modified"}

**When**
- Exécute `git reset --hard HEAD~1`

**Then**
- `exitCode === 0`
- `output[0]` contient `"HEAD is now at"` et shortHash de C0
- `HEAD.target` pointe C0
- `index['a.txt'].content === "v0"`
- `workingTree['a.txt'].content === "v0"` (perte de "v1.modified")

### CA-reset-04 : Reset sans commit (reset index)

**Given**
- Repository : C0 (tree: {a.txt: "v0"}) pointe par HEAD
- index : {a.txt: "v1"}
- WT : {a.txt: "v1"}

**When**
- Exécute `git reset` (aucun argument ni flag)

**Then**
- `exitCode === 0`
- `HEAD` inchangé (toujours C0)
- `index['a.txt'].content === "v0"` (réinitialisé à HEAD)
- `workingTree['a.txt'].content === "v1"` (inchangé)

### CA-reset-05 : Reset avec révisions HEAD~n

**Given**
- Repository : C0 ← C1 ← C2 (HEAD)

**When**
- Exécute `git reset HEAD~2`

**Then**
- `exitCode === 0`
- `HEAD.target` pointe C0
- Tree et index alignés à C0

### CA-reset-06 : Reset sur HEAD détaché

**Given**
- HEAD détaché sur C2 (symbolic === false, target === C2_hash)
- Tree et index alignés à C2

**When**
- Exécute `git reset --hard HEAD~1`

**Then**
- `exitCode === 0`
- `HEAD.symbolic === false` (reste détaché)
- `HEAD.target` pointe C1
- Index et WT alignés à C1

### CA-reset-07 : Erreur commit inexistant

**Given**
- Repository initialisé

**When**
- Exécute `git reset nosuchcommit`

**Then**
- `exitCode === 128`
- `errors[0]` contient `"unknown revision"`
- HEAD, index, WT inchangés

### CA-reset-08 : Reset avec suppression de fichiers

**Given**
- Repository : C0 (tree: {a.txt, b.txt}) ← C1 (HEAD, tree: {a.txt, b.txt, c.txt})
- index et WT alignés à C1

**When**
- Exécute `git reset --hard HEAD~1`

**Then**
- `exitCode === 0`
- `workingTree['c.txt']` n'existe plus (supprimé)
- `index['c.txt']` n'existe plus
- `workingTree['a.txt']` et `workingTree['b.txt']` existent

### CA-reset-09 : Reset multiple fichiers

**Given**
- Repository : C0 (tree: {a.txt, b.txt}) ← C1 (HEAD, tree: {a.txt, b.txt, c.txt, d.txt})
- Tous les fichiers présents dans C1 et le WT

**When**
- Exécute `git reset --hard HEAD~1`

**Then**
- `exitCode === 0`
- `c.txt` et `d.txt` supprimés du WT et index
- `a.txt` et `b.txt` conservés

### CA-reset-10 : Reset soft ne sauvegarde les modifications

**Given**
- Repository : C0 ← C1 (HEAD)
- Utilisateur a stagé {a.txt: "v1", b.txt: "v2"}

**When**
- Exécute `git reset --soft HEAD~1`

**Then**
- `exitCode === 0`
- `index` conserve {a.txt: "v1", b.txt: "v2"} (changements stagés préservés)
- Peut ensuite `git commit` pour créer un commit à C0 avec ces changements

### CA-reset-11 : Reset hard avec branche symbolique

**Given**
- HEAD symbolique sur `main` pointant C1

**When**
- Exécute `git reset --hard HEAD~1`

**Then**
- `exitCode === 0`
- `HEAD.symbolic === true` (reste sur branche)
- `HEAD.target === "refs/heads/main"`
- `refs.heads.main` pointe C0
- Index et WT alignés à C0

## Décisions de conception (Phase 4)

| Aspect | Décision |
|--------|----------|
| **Modes** | --soft, --mixed (défaut), --hard implémentés |
| **Révisions** | Support de HEAD~n via resolveCommitish |
| **HEAD détaché** | Accepté ; met à jour HEAD.target directement |
| **Danger --hard** | Pas de sauvegarde ; changements non commités perdus |
| **Message output** | Minimal (succès muet sauf --hard) |
| **Conflits** | N/A (reset ne fusionne pas) |

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/commands/reset.ts` | Implémenter reset avec 3 modes (soft, mixed, hard) |
| `src/core/repository.ts` | Helper `buildIndexFromTree` (inverse de `buildTreeFromIndex`) |
| Tests | Couvrir 20-reset.md CA-* |
