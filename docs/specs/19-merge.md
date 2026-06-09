# Phase 4 : git merge

## Résumé

La commande `git merge <branche>` fusionne une branche (ou un commit) dans la branche courante. Elle crée un commit de fusion si nécessaire, ou effectue un fast-forward simple si possible.

**Variantes** :
- `git merge <branchname>` : fusion classique
- `git merge --no-ff <branchname>` : force un commit de fusion même en cas de fast-forward
- `git merge -m <message> <branchname>` : message de fusion personnalisé
- Gestion de conflits simplifiée

## Syntaxe

```
git merge [options] <branchname>
```

### Options supportées en Phase 4

| Option | Argument | Comportement | Défaut Phase 4 |
|--------|----------|-------------|---|
| (aucun) | `<branchname>` | Fusion normale | Oui |
| `--no-ff` | (aucun) | Force un commit de fusion | Non |
| `-m` | `<message>` | Message personnalisé pour le merge | Auto-généré |
| `--abort` | (aucun) | Annule un merge en cours (état "merging") | Voir note |

**Notes Phase 4** :
- `--abort` : géré via un état "merging" exposé dans le snapshot ; peut être optionnel si les conflits sont résolus immédiatement
- `--squash`, `--no-commit`, `-X strategy`, etc. : NON implémentés Phase 4 ; Phase 5+

## Concept : Fast-Forward vs True Merge

### Fast-Forward

**Condition** : HEAD est un ancêtre du tip de la branche à merger (i.e., `isAncestor(HEAD, branchTip)`).

**Comportement** :
- Aucun commit de merge n'est créé
- HEAD avance simplement vers le tip de la branche
- Message : `Fast-forward`

Exemple :
```
Before:
C0 ← C1 (main/HEAD) ← C2 ← C3 (feature)

After (git merge feature):
C0 ← C1 ← C2 ← C3 (main/HEAD, feature)
```

### True Merge

**Condition** : Les branches sont divergentes (aucune n'est ancêtre de l'autre).

**Comportement** :
- Créer un commit de fusion à 2 parents : [HEAD, branchTip]
- Fusionner les arbres (voir section Conflits ci-dessous)
- Mettre à jour HEAD vers ce nouveau commit

Exemple :
```
Before:
    C1 ← C2 (main/HEAD)
   /
C0
   \
    D1 ← D2 (feature)

After (git merge feature):
    C1 ← C2 ←─┐
   /          M (merge commit)
C0 ← ─────────┤
   \          │
    D1 ← D2 ──┘ (feature)

M.parents = [C2, D2]
```

## Comportement nominal

### Cas 1 : Fast-Forward (`git merge <branchname>`)

**Condition** :
- `<branchname>` existe
- Le tip de `<branchname>` est un descendant de HEAD (ou HEAD === tip, i.e., already up to date)
- Pas de flag `--no-ff`

**Processus** :
1. Vérifier que `<branchname>` existe ; erreur sinon
2. Récupérer le hash du tip de `<branchname>`
3. Appeler `isAncestor(repo, headCommitHash, branchTip)`
4. Si `true` :
   - Si HEAD === branchTip : message "Already up to date." et code 0
   - Sinon : mettre à jour la branche courante pour pointer `branchTip`
   - Message : `Fast-forward`
5. Vider l'index et restaurer le working tree depuis le nouveau commit
6. **Sortie** :
   ```
   Updating abc1234..def5678
   Fast-forward
    file.txt | 2 +-
    1 file changed, 1 insertion(+), 1 deletion(-)
   ```
   (Phase 4 : simplifié à juste `"Fast-forward"` ou `"Already up to date."`)
7. **Code de sortie** : 0

### Cas 2 : True Merge (branches divergentes)

**Condition** :
- Les deux branches divergent (aucune n'est ancêtre de l'autre)
- Pas de flag `--no-ff` (ou flag présent)

**Processus** :
1. Récupérer le hash du tip de `<branchname>` (soit `branchTip`)
2. Récupérer le hash de HEAD courant (soit `headHash`)
3. Déterminer l'ancêtre commun : `mergeBase(repo, headHash, branchTip)` → `baseHash`
4. **Fusion des arbres** (voir section Conflits) :
   - Récupérer l'arbre de `baseHash` (arbre commun)
   - Récupérer l'arbre de `headHash` (arbre HEAD)
   - Récupérer l'arbre de `branchTip` (arbre branche)
   - Appliquer les changements (3-way merge) :
     - Fichiers présents dans tous trois → prendre le contenu de HEAD et branchTip si identiques, sinon **conflit**
     - Fichiers présents dans base et HEAD mais pas dans branchTip → supprimer (suppression normale)
     - Fichiers présents dans base et branchTip mais pas dans HEAD → ajouter (ajout normal)
     - Fichiers présents dans HEAD et branchTip mais pas dans base → fusionner contenus ; si identiques → ok, sinon **conflit**
     - Fichiers présents uniquement dans branchTip → ajouter
     - Fichiers présents uniquement dans HEAD → garder

5. **Si conflits détectés** (voir section Conflits ci-dessous) :
   - Écrire les marqueurs de conflit dans le working tree
   - Mettre l'index et le working tree en état "merging"
   - Exposer l'état "merging" dans le snapshot
   - Message : `CONFLICT (content): Merge conflict in <file>`
   - Suggestion : `git commit` pour finaliser ou `git merge --abort`
   - **Code de sortie** : 1

6. **Si pas de conflits** :
   - Construire le tree de fusion (de l'index après résolution)
   - Créer le commit de fusion :
     ```
     {
       type: "commit",
       tree: <tree_fusion>,
       parents: [headHash, branchTip],
       author: AUTHOR,
       date: nextTimestamp(),
       message: "Merge branch '<branchname>'" (ou message `-m` si fourni)
     }
     ```
   - Mettre à jour la branche courante pour pointer ce commit
   - Mettre à jour l'index et le working tree
   - Message : `Merge made by the '3-way' merge strategy.`
   - **Code de sortie** : 0

### Cas 3 : Forcer un merge commit avec `--no-ff`

**Condition** : Flag `--no-ff` présent, même si fast-forward possible.

**Processus** :
1. Ignorer le check fast-forward
2. Traiter comme un true merge (Cas 2) : créer un commit de merge
3. Si le merge-base est égal à HEAD (branchTip est descendant), créer un commit de fusion artificiel quand même
4. **Message** : `Merge made by the 'recursive' merge strategy.` (ou simplement accepter le merge)

### Cas 4 : Merge de soi-même ou branche à jour

**Condition** : `git merge <branchname>` où `<branchname>` pointe le même commit que HEAD, ou déjà mergée.

**Processus** :
1. Récupérer branchTip
2. Si `branchTip === headHash` :
   - Message : `Already up to date.`
   - Code de sortie : 0
   - Aucune action

### Cas 5 : Message personnalisé (`git merge -m <message> <branchname>`)

**Condition** : Flag `-m` avec un message.

**Processus** :
1. Exécuter un merge normal (true ou fast-forward)
2. Si c'est un true merge créant un commit de fusion, utiliser `<message>` au lieu du message par défaut
3. Si c'est un fast-forward, ignorer le `-m` (pas de commit créé)

## Gestion simplifiée des conflits (Phase 4)

### Définition d'un conflit

Un conflit survient quand le même fichier est modifié **différemment** dans deux branches par rapport à leur ancêtre commun.

**Détection de conflit** :

Pour chaque fichier `F` :
1. Récupérer le contenu dans `base` (ancêtre commun)
2. Récupérer le contenu dans `HEAD`
3. Récupérer le contenu dans `branchTip`
4. Si `(base ≠ HEAD) && (base ≠ branchTip) && (HEAD ≠ branchTip)` → conflit
   - Ou plus simplement : si HEAD a modifié F ET branchTip l'a modifié différemment → conflit

**Cas sans conflit** :
- Si base === HEAD, prendre branchTip (branchTip a changé, HEAD non)
- Si base === branchTip, prendre HEAD (HEAD a changé, branchTip non)
- Si HEAD === branchTip, aucun changement (identique des deux côtés)

### Matérialisation du conflit

**Option A : Marqueurs de conflit dans le WT** (implémenté en Phase 4)

Écrire les marqueurs standards Git dans le working tree :

```
<<<<<<< HEAD
contenu de HEAD
=======
contenu de branchTip
>>>>>>> <branchname>
```

Exemple :
```
Le fichier `config.txt` a :
<<<<<<< HEAD
DEBUG = true
=======
DEBUG = false
>>>>>>> feature-branch
```

**Étapes** :
1. Ajouter les marqueurs `<<<<<<<`, `=======`, `>>>>>>>` au contenu du fichier
2. Écrire ce contenu dans le working tree
3. Laisser l'entrée dans l'index en attente (voir ci-dessous)
4. Mettre un flag "merging" dans le snapshot (optionnel Phase 4)

### État "merging" dans le snapshot

Optionnel en Phase 4 ; utile pour l'UI (afficher "You have unmerged paths" dans `git status`).

```typescript
// Dans Repository ou snapshot
merging?: {
  branchName: string;
  baseHash: string;
  branchTipHash: string;
}
```

Quand l'utilisateur exécute :
- `git add <file>` → résout le conflit pour ce fichier
- `git merge --abort` → annule le merge, restaure l'index et WT
- `git commit` → finalise le merge (résout tous les conflits)

### Résolution des conflits

En Phase 4, l'utilisateur résout les conflits manuellement :
1. Éditer les fichiers conflictants pour retirer les marqueurs
2. Exécuter `git add <file>` pour chaque conflit résolu
3. Exécuter `git commit` pour finaliser le merge

Message de `git status` :
```
On branch main
You have unmerged paths.
  (fix conflicts and run "git commit")
  (use "git merge --abort" to abort the merge)

Unmerged paths:
  both modified: config.txt
```

## Cas d'erreur

### Branche inexistante

**Condition** : `git merge <branchname>` où `<branchname>` n'existe pas dans `refs/heads/`.

**Message d'erreur** :
```
fatal: '<branchname>' - not something we can merge
```

**Code de sortie** : 128

**Comportement** : Aucune modification.

### Merge en cours (conflits non résolus)

**Condition** : Appeler `git merge` alors qu'un merge précédent a laissé des conflits non résolus (état "merging" actif).

**Message d'erreur** :
```
error: You have not concluded your merge (MERGE_HEAD exists).
Please, commit your changes before you merge again.
```

**Code de sortie** : 1

**Comportement** : Aucune modification.

### HEAD détaché

**Condition** : Merger sur un HEAD détaché.

**Comportement** : Autorisé. Le merge crée/met à jour le commit détaché de HEAD.

**Message** : Similaire à un merge sur branche.

### Merge commit sans message (rarissime)

Accepter un message vide pour un merge (contrairement à `git commit -m ""`).

## Critères d'acceptation

### CA-merge-01 : Fast-forward simple

**Given**
- Repository : C0 ← C1 (main/HEAD) ← C2 ← C3 (feature)

**When**
- Exécute `git merge feature`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Fast-forward"`
- `refs.heads.main === hash(C3)`
- Aucun commit de fusion créé
- `index` et `workingTree` alignés sur C3

### CA-merge-02 : Already up to date

**Given**
- Repository : main pointe C2, feature pointe C2

**When**
- Exécute `git merge feature`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Already up to date"`
- Aucune modification

### CA-merge-03 : True merge sans conflit

**Given**
- Repository :
  - C0 ← C1 (main/HEAD) + C2 (feature)
  - C1 a modifié `a.txt` = "a1"
  - C2 a modifié `b.txt` = "b2"
  - Base C0 : `a.txt` = "a", `b.txt` = "b"

**When**
- Exécute `git merge feature`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Merge made by the"`
- Un nouveau commit de fusion M créé
- `M.parents === [C1, C2]`
- `M.message` contient `"Merge branch 'feature'"`
- Tree de M contient : `a.txt` = "a1", `b.txt` = "b2"
- `refs.heads.main === hash(M)`
- `index` et `workingTree` alignés sur M

### CA-merge-04 : True merge avec conflit

**Given**
- Repository :
  - C0 ← C1 (main/HEAD) + C2 (feature)
  - Base C0 : `config.txt` = "DEBUG = unknown"
  - C1 : `config.txt` = "DEBUG = true"
  - C2 : `config.txt` = "DEBUG = false"

**When**
- Exécute `git merge feature`

**Then**
- `exitCode === 1`
- `output[0]` contient `"CONFLICT (content): Merge conflict in config.txt"`
- `workingTree['config.txt'].content` contient marqueurs `<<<<<<<`, `=======`, `>>>>>>>`
- Fichier contient : "<<<<<<< HEAD\nDEBUG = true\n=======\nDEBUG = false\n>>>>>>> feature"
- État "merging" activé (si implémenté)
- Aucun commit de fusion créé
- `index` laissé en état "merging"

### CA-merge-05 : Résolution et commit

**Given**
- État de merge avec conflits (comme CA-merge-04)
- Utilisateur a édité `config.txt` pour résoudre : "DEBUG = true"

**When**
- Exécute `git add config.txt`
- Puis exécute `git commit -m "Merge feature"`

**Then**
- `exitCode === 0` (pour commit)
- Commit de fusion créé avec parents [C1, C2]
- `config.txt` dans le tree a contenu "DEBUG = true"
- Aucun marqueur de conflit dans le arbre final
- État "merging" désactivé
- `refs.heads.main` pointe le commit de fusion

### CA-merge-06 : Abort d'un merge

**Given**
- État de merge avec conflits

**When**
- Exécute `git merge --abort`

**Then**
- `exitCode === 0`
- `index` restauré à l'état avant le merge
- `workingTree` restauré à l'état avant le merge
- État "merging" désactivé
- Aucune modification aux refs

### CA-merge-07 : --no-ff force un commit

**Given**
- Repository : C0 ← C1 (main/HEAD) ← C2 ← C3 (feature)

**When**
- Exécute `git merge --no-ff feature`

**Then**
- `exitCode === 0`
- Un commit de fusion M créé (même si FF possible)
- `M.parents === [C1, C3]`
- Tree de M === tree de C3
- `refs.heads.main === hash(M)`

### CA-merge-08 : Message personnalisé `-m`

**Given**
- Repository avec branches divergentes

**When**
- Exécute `git merge -m "Custom merge msg" feature`

**Then**
- `exitCode === 0`
- Commit de fusion créé
- `commit.message === "Custom merge msg"`

### CA-merge-09 : Merge sur HEAD détaché

**Given**
- HEAD détaché sur C2
- feature pointe C3
- Branchement : C0 ← C1 ← C2, C0 ← C3

**When**
- Exécute `git merge feature`

**Then**
- `exitCode === 0`
- Commit de fusion M créé
- `M.parents === [C2, C3]`
- `HEAD.target === hash(M)` (HEAD détaché mis à jour)
- `HEAD.symbolic === false`

### CA-merge-10 : Erreur branche inexistante

**Given**
- Repository initialisé

**When**
- Exécute `git merge nosuchbranch`

**Then**
- `exitCode === 128`
- `errors[0]` contient `"not something we can merge"`

### CA-merge-11 : Conflit suppression/modification

**Given**
- Base C0 : `file.txt` existant
- C1 (main) : `file.txt` modifié
- C2 (feature) : `file.txt` supprimé

**When**
- Exécute `git merge feature`

**Then**
- `exitCode === 1`
- `output[0]` contient `"CONFLICT (delete/modify): file.txt"`
- Marqueurs de conflit dans WT (ou suppression avec annotation)

### CA-merge-12 : Multiple fichiers, un conflit

**Given**
- Base C0 : `a.txt`, `b.txt`, `c.txt`
- C1 (main) : tous modifiés différemment que base
- C2 (feature) : `b.txt` modifié pareil que C1 ; `c.txt` modifié différemment

**When**
- Exécute `git merge feature`

**Then**
- `exitCode === 1` (1 conflit)
- `output` mentionne `"1 file changed"` avec conflit
- Conflit seulement dans `c.txt`
- `a.txt` et `b.txt` fusionnées sans conflit

## Décisions de conception (Phase 4)

| Aspect | Décision |
|--------|----------|
| **Stratégie de merge** | 3-way merge uniquement (pas `ours`, `theirs`, `recursive`, etc.) |
| **Marqueurs de conflit** | Implémentés dans le WT ; `<<<<<<<`, `=======`, `>>>>>>> <branchname>` |
| **État "merging"** | Exposé dans snapshot pour feedback utilisateur (optionnel, mais recommandé) |
| **Conflit suppression** | Marqueurs simples (pas de "CONFLICT (delete/modify)" complexe) |
| **Auto-résolution** | Aucune ; utilisateur édite et `git add` |
| **Revert merge** | Hors scope Phase 4 (`git revert -m` Phase 5+) |

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/model.ts` | Ajouter champ optionnel `merging?: { branchName, baseHash, branchTipHash }` à `Repository` |
| `src/core/commands/merge.ts` | Implémenter merge avec fast-forward, true merge, résolution simple de conflits |
| `src/core/repository.ts` | Helpers : `isAncestor`, `mergeBase`, `performThreeWayMerge` (privé) |
| Tests | Couvrir 19-merge.md CA-* |
