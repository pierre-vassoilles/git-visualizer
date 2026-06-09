# Phase 4 : git cherry-pick

## Résumé

La commande `git cherry-pick` applique les changements d'un commit spécifié sur le commit courant, créant un **nouveau commit** avec les mêmes changements. Contrairement à `git revert` (qui annule), `git cherry-pick` duplique et reproduit.

**Variantes** :
- `git cherry-pick <commit>` : applique les changements de commit
- `git cherry-pick <commit1> <commit2> ...` : applique plusieurs commits (non implémenté Phase 4)
- `git cherry-pick --continue` : continue après résolution de conflits (non implémenté Phase 4)
- `git cherry-pick --abort` : annule l'opération (optionnel Phase 4)

## Syntaxe

```
git cherry-pick [options] <commit>
```

### Options supportées en Phase 4

| Option | Argument | Comportement | Notes |
|--------|----------|-------------|-------|
| (aucun) | `<commit>` | Applique les changements du commit | Crée un nouveau commit |

**Remarque** : `--continue`, `--abort`, `-n` (no commit), `--ff`, multiple commits, etc. ne sont pas implémentés en Phase 4.

## Concepts fondamentaux

### Copie des changements

Pour cherry-picker un commit `C` sur le HEAD courant, on crée un nouveau commit `P` qui :
1. Récupère les changements de `C` (par rapport à son parent)
2. Les applique sur HEAD
3. Crée un commit avec ces changements

**Formule** :
```
P.tree = HEAD.tree + (C.tree - C.parent.tree)
P.parent = HEAD
P.message = C.message (même message que C)
```

**Exemple** :
```
Commit C sur la branche feature :
  Modifie : feature.ts = "old" → "new"
  Ajoute : config-feature.txt = "feature config"

Branche main (HEAD) :
  feature.ts = "base"
  config.txt = "base config"

Après cherry-pick :
  feature.ts = "new" (changement de C appliqué)
  config-feature.txt = "feature config" (ajout de C appliqué)
  config.txt = "base config" (inchangé sur main)
```

### Différence avec rebase

- **Rebase** : rejoue une **série de commits** en changeant leur parent
- **Cherry-pick** : applique **un commit spécifique** en créant un nouveau commit avec le même changement (mais de hash différent)

### Cas spécial : Commit qui est le parent de HEAD

Si le commit à cherry-picker est déjà un ancêtre de HEAD, le cherry-pick peut :
- **Option A** : Créer un nouveau commit (même changement appliquée deux fois)
- **Option B** : Détectable et ignorer (déjà appliqué)

Phase 4 choisit **Option B** pour éviter la duplication stupide.

## Comportement nominal

### Cas 1 : Cherry-pick simple (changement appliquable)

**Condition** : Commit `C` a 1 parent, et les changements peuvent être appliquées sans conflit.

**Processus** :
1. Résoudre `<commit>` en hash via `resolveCommitish(repo, commit)`
2. Vérifier que le commit existe
3. Récupérer le parent de C : `C.parents[0]` → `parentHash`
4. **Déterminer les changements** :
   - Comparer l'arbre du parent et l'arbre de C
   - Lister les opérations : ajout, suppression, modification
5. **Appliquer les changements au HEAD courant** :
   - Commencer avec l'arbre de HEAD
   - Appliquer les changements déterminées en (4)
   - Vérifier s'il y a conflit (fichier modifié différemment des deux côtés)
6. **Si pas de conflit** :
   - Créer un nouveau commit :
     ```
     {
       type: "commit",
       tree: <arbre_appliqué>,
       parents: [HEAD],
       author: AUTHOR,
       date: nextTimestamp(),
       message: C.message  (même message que C)
     }
     ```
   - Mettre à jour HEAD (branche ou détaché)
   - **Sortie** :
     ```
     [main abc1234] <commit_message_of_C>
      1 file changed, 1 insertion(+)
     ```
   - **Code de sortie** : 0
7. **Si conflit** :
   - Écrire marqueurs de conflit
   - État "cherry-picking" (optionnel Phase 4)
   - Message : `CONFLICT (content): Conflict in <file>`
   - **Code de sortie** : 1
   - Suggestion : résoudre et `git commit`, ou `git cherry-pick --abort`

### Cas 2 : Cherry-pick d'un commit déjà appliqué

**Condition** : Les changements de `C` sont **déjà dans HEAD** (le commit C est un ancêtre de HEAD).

**Comportement Phase 4** :

**Option A (Implémentée)** : Détecter et rejeter
```
error: commit <hash> is a merge but no -m option was given.
```
(Ou un message plus explicite)

**Option B (Alternative)** : Appliquer quand même (crée un commit dupliqué)

Phase 4 choisit **Option A** (détection).

### Cas 3 : Cherry-pick d'un merge commit

**Condition** : Commit `C` a 2+ parents.

**Comportement Phase 4** :

Refuser l'opération ; message :
```
error: commit ... is a merge commit; use -m <parent> to specify which parent to cherry-pick with respect to.
```

(Ou ignorer et utiliser le 1er parent comme base de comparaison.)

Phase 4 choisit **refuser** pour clarté.

### Cas 4 : Cherry-pick sur HEAD détaché

**Condition** : HEAD est détaché.

**Comportement** :
1. Exécuter cherry-pick normal
2. Mettre à jour `HEAD.target` vers le nouveau commit
3. **Sortie** : Standard

## Cas d'erreur

### Commit inexistant

**Condition** : `git cherry-pick <commit>` où `<commit>` ne peut pas être résolu.

**Message d'erreur** :
```
fatal: ambiguous argument '<commit>': unknown revision or path not in working tree
```

**Code de sortie** : 128

**Comportement** : Aucune modification.

### Commit est un merge

**Condition** : Commit a 2+ parents.

**Message d'erreur** :
```
error: commit ... is a merge commit; use -m <parent> to specify which parent.
```

**Code de sortie** : 1

**Comportement** : Aucune modification.

### Commit déjà appliqué (ancêtre de HEAD)

**Condition** : Commit est un ancêtre de HEAD.

**Message d'erreur** :
```
error: commit ... is already included in HEAD.
```

**Code de sortie** : 1

**Comportement** : Aucune modification.

### Cherry-pick en cours (conflits non résolus)

**Condition** : Appeler `git cherry-pick` alors qu'un cherry-pick précédent a laissé des conflits.

**Message d'erreur** :
```
error: There is a pending cherry-pick (CHERRY_PICK_HEAD exists).
Please commit the pending changes before you cherry-pick again.
```

**Code de sortie** : 1

## Critères d'acceptation

### CA-cherry-pick-01 : Cherry-pick simple

**Given**
- Repository :
  - C0 ← C1 (main/HEAD) + C2 (feature)
  - C1 : base
  - C2 : modifie a.txt : "base" → "feature", ajoute b.txt : "new"

**When**
- Exécute `git cherry-pick C2`

**Then**
- `exitCode === 0`
- Nouveau commit P créé
- `P.parents === [C1]`
- `P.message === C2.message`
- Tree de P : {a.txt: "feature", b.txt: "new"} (changements appliqués)
- `refs.heads.main` pointe P

### CA-cherry-pick-02 : Cherry-pick conflit

**Given**
- Repository :
  - C0 ← C1 (main/HEAD, a.txt: "v1") + C2 (feature, a.txt: "v2")
  - Base C0 : a.txt: "base"
  - C2 modifie a.txt : "base" → "v2"

**When**
- Exécute `git cherry-pick C2`

**Then**
- `exitCode === 1`
- `output[0]` contient `"CONFLICT"`
- Marqueurs de conflit dans `workingTree['a.txt']`
- État "cherry-picking" activé (optionnel)
- Aucun commit créé

### CA-cherry-pick-03 : Résolution et commit

**Given**
- État de cherry-pick avec conflits (comme CA-cherry-pick-02)
- Utilisateur a édité a.txt : "resolved"

**When**
- Exécute `git add a.txt`
- Puis `git commit -m "Merge feature changes"`

**Then**
- `exitCode === 0` (pour commit)
- Commit créé avec message du cherry-pick initial (ou message utilisateur)

### CA-cherry-pick-04 : Commit déjà appliqué (ancêtre)

**Given**
- Repository : C0 ← C1 (main/HEAD)
- C1 est le commit à cherry-picker

**When**
- Exécute `git cherry-pick C1`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"already included in HEAD"`

### CA-cherry-pick-05 : Merge commit non supporté

**Given**
- Repository : C0 ← C1 (main) + C2 (feature) → M (merge commit)

**When**
- Exécute `git cherry-pick M`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"is a merge commit"`

### CA-cherry-pick-06 : Cherry-pick sur HEAD détaché

**Given**
- HEAD détaché sur C2

**When**
- Exécute `git cherry-pick C1`

**Then**
- `exitCode === 0`
- Nouveau commit P créé
- `HEAD.target` pointe P
- `HEAD.symbolic === false` (reste détaché)

### CA-cherry-pick-07 : Abort d'un cherry-pick

**Given**
- État de cherry-pick avec conflits

**When**
- Exécute `git cherry-pick --abort`

**Then**
- `exitCode === 0`
- Index et WT restaurés à l'état avant cherry-pick
- État "cherry-picking" désactivé
- Aucun commit créé

### CA-cherry-pick-08 : Cherry-pick avec révisions HEAD~n

**Given**
- Repository : C0 ← C1 ← C2 (HEAD)

**When**
- Exécute `git cherry-pick HEAD~1`

**Then**
- `exitCode === 0`
- Nouveau commit P créé avec les changements de C1

### CA-cherry-pick-09 : Cherry-pick suppression de fichier

**Given**
- Repository : C0 (tree: {a.txt, b.txt}) ← C1 (tree: {a.txt})
- HEAD pointe C0 (ou ailleurs)

**When**
- Exécute `git cherry-pick C1` (depuis un autre commit)

**Then**
- `exitCode === 0`
- Tree de P : supprime b.txt
- `workingTree['b.txt']` n'existe plus

### CA-cherry-pick-10 : Cherry-pick ajout de fichier

**Given**
- Repository : C0 (tree: {a.txt}) ← C1 (tree: {a.txt, b.txt})
- HEAD pointe C0

**When**
- Exécute `git cherry-pick C1`

**Then**
- `exitCode === 0`
- Tree de P : {a.txt, b.txt}
- `workingTree['b.txt']` existe avec contenu de C1

## Décisions de conception (Phase 4)

| Aspect | Décision |
|--------|----------|
| **Cible** | Un seul commit (pas de séquence) |
| **Merge commits** | Refusés (pas de support `-m`) |
| **Commit déjà appliqué** | Refusé (détection via isAncestor) |
| **Conflits** | Marqueurs simples ; état "cherry-picking" optionnel |
| **Message** | Copie du message original ; pas de `-m` en Phase 4 |

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/commands/cherry-pick.ts` | Implémenter cherry-pick avec gestion de conflits |
| `src/core/repository.ts` | Helper `computeTreeDifference` (réutilisé de revert) |
| Tests | Couvrir 22-cherry-pick.md CA-* |
