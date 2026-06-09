# Phase 4 : git revert

## Résumé

La commande `git revert` crée un **nouveau commit** qui inverse les changements d'un commit spécifié. Contrairement à `git reset` (qui réécrit l'historique), `git revert` préserve l'historique et ajoute un commit d'annulation.

**Variantes** :
- `git revert <commit>` : annule les changements du commit spécifié
- `git revert -m` : revert d'un merge commit (spécifier le parent numéro)
- `git revert --no-edit` : utiliser le message par défaut (non implémenté Phase 4)
- `git revert -n` : préparer le revert sans créer un commit (non implémenté Phase 4)

## Syntaxe

```
git revert [options] <commit>
```

### Options supportées en Phase 4

| Option | Argument | Comportement | Notes |
|--------|----------|-------------|-------|
| (aucun) | `<commit>` | Reverte les changements du commit | Crée un nouveau commit |
| `-m <parent>` | `<parent>` | Sélectionne le parent pour les merges | Optionnel, Phase 4 peut l'ignorer |

**Remarque** : `--no-edit`, `-n`, `--continue`, `--abort`, etc. ne sont pas implémentés en Phase 4.

## Concepts fondamentaux

### Inversion des changements

Pour revenir un commit `C`, on crée un nouveau commit `R` qui annule les changements de `C`.

**Mathématiquement** :
- Soit `C.tree` l'arbre du commit `C`
- Soit `P.tree` l'arbre du parent de `C` (la base avant le changement)
- L'inversion applique : `C.tree - P.tree` inversée

**Exemple concret** :
```
Commit C modifie :
- ajoute : new_file.txt = "content"
- modifie : config.txt = "old" → "new"

Revert commit R annule :
- supprime : new_file.txt
- modifie : config.txt = "new" → "old"
```

### Cas spécial : Merge commits

Si on reverte un commit de fusion à 2+ parents :
- Phase 4 peut l'ignorer (hors scope)
- Ou supporter le flag `-m <parent>` pour sélectionner le parent de comparaison

## Comportement nominal

### Cas 1 : Revert simple (non-merge commit)

**Condition** : Commit `C` a exactement 1 parent.

**Processus** :
1. Résoudre `<commit>` en hash via `resolveCommitish(repo, commit)`
2. Vérifier que le commit existe
3. Récupérer le parent de C : `C.parents[0]` → `parentHash`
4. Récupérer l'arbre de C : `C.tree` → `commitTree`
5. Récupérer l'arbre du parent : `getCommit(parentHash).tree` → `parentTree`
6. **Déterminer les changements** :
   - Comparer `parentTree` et `commitTree`
   - Pour chaque fichier : garder (parentTree), supprimer (commitTree), ou modifier (parentTree vers commitTree)
7. **Appliquer l'inversion dans le working tree et l'index** :
   - Ajouter les fichiers supprimés dans C
   - Supprimer les fichiers créés dans C
   - Restaurer les fichiers modifiés à leur version parentTree
8. **Créer un nouveau commit de revert** :
   ```
   {
     type: "commit",
     tree: <arbre_résultant>,
     parents: [HEAD],
     author: AUTHOR,
     date: nextTimestamp(),
     message: "Revert '<commit_message>'\n\nThis reverts commit <shortHash>."
   }
   ```
9. **Mettre à jour HEAD** (la branche courante ou HEAD détaché)
10. **Sortie** :
    ```
    [main abc1234] Revert "Modify config.txt"
     1 file changed, 1 deletion(-)
    ```
    (Phase 4 : simplifié)
11. **Code de sortie** : 0

### Cas 2 : Revert d'un merge commit

**Condition** : Commit `C` a 2+ parents (merge commit).

**Comportement Phase 4** :

**Option A (Implémentée)** : Supporter `-m <parent>` pour sélectionner le parent numéro `<parent>` (1-indexed) :
```bash
git revert -m 1 <merge_commit>  # annule les changements du 2e branche (vs 1er parent)
```

Processus (similaire à Cas 1, mais comparaison contre le parent sélectionné) :
1. Vérifier que C a au moins 2 parents
2. Récupérer le parent numéro `<parent>` (vérifier qu'il existe)
3. Comparer `parentSelectedTree` et `commitTree`
4. Appliquer l'inversion
5. Créer le commit de revert

**Option B (Ignorée)** : Refuser de revetter les merge commits sans `-m`.

**Message d'erreur** :
```
error: commit is a merge commit and -m option was not specified.
Please specify which parent the revert should be with respect to, using:
  git revert -m <parent>
```

Phase 4 choisit **Option A** (supporter `-m`, mais rendre `-m` optionnel si le commit n'a qu'un parent).

### Cas 3 : Revert commit racine

**Condition** : Commit `C` n'a pas de parent (`parents === []`).

**Comportement** :
1. Inverser tous les changements (tous les fichiers présents dans C sont supprimés)
2. Créer le commit de revert avec parent = HEAD
3. **Sortie** : Standard

### Cas 4 : Conflits lors du revert

**Condition** : L'inversion des changements crée un conflit avec l'état courant du working tree / de l'index.

**Processus** :
1. Déterminer les changements à inverser (comme Cas 1)
2. Essayer d'appliquer à l'index et au working tree
3. **Si conflit** : 
   - Écrire les marqueurs de conflit (similaire à merge)
   - Laisser l'état en "reverting" (ou "merging", selon implémentation)
   - Message : `CONFLICT (content): Conflict in <file>`
   - **Code de sortie** : 1
   - Suggestion : résoudre et `git commit`, ou `git revert --abort`
4. **Si pas de conflit** :
   - Créer le commit (Cas 1, étape 8+)

## Cas d'erreur

### Commit inexistant

**Condition** : `git revert <commit>` où `<commit>` ne peut pas être résolu.

**Message d'erreur** :
```
fatal: ambiguous argument '<commit>': unknown revision or path not in working tree
```

**Code de sortie** : 128

**Comportement** : Aucune modification.

### Revert d'un merge sans `-m`

**Condition** : Commit a 2+ parents et aucun flag `-m`.

**Message d'erreur** :
```
error: commit ... is a merge but no -m option was given.
```

**Code de sortie** : 1

**Comportement** : Aucune modification.

### Revert en cours (conflits non résolus)

**Condition** : Appeler `git revert` alors qu'un revert précédent a laissé des conflits.

**Message d'erreur** :
```
error: There is a pending revert (REVERT_HEAD exists).
Please commit the pending changes before you revert again.
```

**Code de sortie** : 1

## Critères d'acceptation

### CA-revert-01 : Revert simple (un fichier modifié)

**Given**
- Repository : C0 (tree: {a.txt: "original"}) ← C1 (HEAD, tree: {a.txt: "modified"})

**When**
- Exécute `git revert C1`

**Then**
- `exitCode === 0`
- Un nouveau commit R créé
- `R.parents === [C1]` (parent = HEAD avant revert)
- `R.message` contient `"Revert"` et le message de C1
- Tree de R : {a.txt: "original"} (annule la modification)
- Index et WT alignés à R
- `refs.heads[branch]` (ou HEAD détaché) pointe R

### CA-revert-02 : Revert avec ajout de fichier

**Given**
- Repository : C0 (tree: {a.txt}) ← C1 (HEAD, tree: {a.txt, b.txt})

**When**
- Exécute `git revert C1`

**Then**
- `exitCode === 0`
- Tree de R : {a.txt} (b.txt supprimé, annulant l'ajout)
- `workingTree['b.txt']` n'existe plus

### CA-revert-03 : Revert commit racine

**Given**
- Repository : C0 (tree: {a.txt: "v0"}, parents: [])

**When**
- Exécute `git revert C0` (HEAD pointe un commit ailleurs)

**Then**
- `exitCode === 0`
- Tree de R : {} (tous les fichiers supprimés)

### CA-revert-04 : Revert conflit

**Given**
- Repository : C0 ← C1 (HEAD, modifié a.txt: "v1") ← C2 (modifié a.txt: "v2")
- WT actuellement a {a.txt: "v2"}
- Revert de C1 tenterait de restaurer a.txt à sa version avant C1 (v0), mais C2 a changé à v2

**When**
- Exécute `git revert C1`

**Then**
- `exitCode === 1`
- `output[0]` contient `"CONFLICT"`
- Marqueurs de conflit dans `workingTree['a.txt']`
- État "reverting" activé

### CA-revert-05 : Résolution et commit

**Given**
- État de revert avec conflits (comme CA-revert-04)
- Utilisateur a édité a.txt pour résoudre

**When**
- Exécute `git add a.txt`
- Puis `git commit` (sans `-m`, accepter le message par défaut du revert)

**Then**
- `exitCode === 0` (pour commit)
- Commit de revert créé, conflits résolus

### CA-revert-06 : Revert merge commit sans `-m`

**Given**
- Repository avec commit de merge M à 2 parents

**When**
- Exécute `git revert M` (sans `-m`)

**Then**
- `exitCode === 1`
- `errors[0]` contient `"is a merge but no -m option"`

### CA-revert-07 : Revert merge commit avec `-m 1`

**Given**
- Repository : C0 ← C1 (main) + C2 (feature)
- Merge M : M.parents = [C1, C2], créé avec changements de C2

**When**
- Exécute `git revert -m 1 M`

**Then**
- `exitCode === 0`
- Tree de R : même que C1 (annule les changements de C2)
- R.message contient `"Revert"` et mentionne M

### CA-revert-08 : Revert sur HEAD détaché

**Given**
- HEAD détaché sur C2

**When**
- Exécute `git revert C1`

**Then**
- `exitCode === 0`
- Commit de revert R créé
- `HEAD.target` pointe R (HEAD détaché mis à jour)
- `HEAD.symbolic === false`

### CA-revert-09 : Abort d'un revert

**Given**
- État de revert avec conflits

**When**
- Exécute `git revert --abort`

**Then**
- `exitCode === 0`
- Index et WT restaurés à l'état avant revert
- État "reverting" désactivé
- Aucun commit créé

### CA-revert-10 : Revert suppression (fichier supprimé dans C)

**Given**
- Repository : C0 (tree: {a.txt, b.txt}) ← C1 (HEAD, tree: {a.txt}, supprime b.txt)

**When**
- Exécute `git revert C1`

**Then**
- `exitCode === 0`
- Tree de R : {a.txt, b.txt} (b.txt restauré)
- `workingTree['b.txt']` rétabli

### CA-revert-11 : Revert avec révisions HEAD~n

**Given**
- Repository : C0 ← C1 ← C2 (HEAD)

**When**
- Exécute `git revert HEAD~1`

**Then**
- `exitCode === 0`
- Commit de revert créé qui annule les changements de C1

## Décisions de conception (Phase 4)

| Aspect | Décision |
|--------|----------|
| **Réécriture historique** | Non (à la différence de reset) |
| **Merge commits** | Support du flag `-m` pour sélectionner le parent |
| **Conflits** | Marqueurs simples (identiques à merge) |
| **Message** | Auto-généré "Revert ..." ; pas de `-m` pour le message en Phase 4 |
| **État "reverting"** | Optionnel, mais cohérent avec "merging" |

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/commands/revert.ts` | Implémenter revert avec gestion de conflits, merge commits (-m) |
| `src/core/repository.ts` | Helper `computeTreeDifference` (déterminer les changements entre deux arbres) |
| Tests | Couvrir 21-revert.md CA-* |
