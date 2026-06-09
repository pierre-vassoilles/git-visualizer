# Phase 4 : git rebase (non-interactif)

## Résumé

La commande `git rebase` replaye une série de commits (ceux de la branche courante absent de la base) au-dessus d'une autre branche, changeant leurs parents et créant de **nouveaux commits** (de nouveaux hashes). Cela linéarise l'historique contrairement à `git merge` (qui préserve les deux branches).

**Variantes** :
- `git rebase <base>` : rejoue la branche courante au-dessus de `<base>`
- `git rebase -i <base>` : rebase interactif (non implémenté Phase 4 ; Phase 5)
- `git rebase --continue` : continue après résolution (optionnel Phase 4)
- `git rebase --abort` : annule le rebase (optionnel Phase 4)

## Syntaxe

```
git rebase [options] <base>
```

### Options supportées en Phase 4

| Option | Argument | Comportement | Notes |
|--------|----------|-------------|-------|
| (aucun) | `<base>` | Rebase la branche courante au-dessus de `<base>` | |

**Remarque** : `-i` (interactif), `-p` (preserve merges), `--onto`, `-x` (exec), `--continue`, `--abort`, etc. ne sont pas implémentés en Phase 4.

## Concepts fondamentaux

### Commits à rejouer

Un rebase sur `<base>` identifie les commits à rejouer comme ceux accessibles depuis HEAD qui ne sont **pas** accessibles depuis `<base>`.

**Mathématiquement** :
```
commits_to_rebase = commits(HEAD) \ commits(<base>)
```

(Tous les commits accessibles depuis HEAD sauf ceux accessibles depuis <base>)

Puis, rejouer chaque commit sur la nouvelle base, créant un arbre linéaire.

**Exemple** :
```
Avant :
    C1 ← C2 (main)
   /
C0
   \
    D1 ← D2 (feature/HEAD)

git rebase main (depuis feature) :
Commits à rejouer : [D1, D2]
Nouvelle base : C2

Après :
    C1 ← C2 ← D1' ← D2' (feature/HEAD)
   /
C0
   \
    D1 ← D2 (orphelins, si pas de ref)
```

### Cas spéciaux

#### Déjà à jour (up to date)

Si HEAD est un ancêtre de `<base>` (ou égal), aucun commit à rejouer.

```
Message : "Current branch ... is already up to date."
Code : 0
```

#### Fast-forward possible

Si HEAD est descendant de `<base>`, mais aucun commit divergent ne sépare les branches, un fast-forward peut être appliqué.

```
C0 ← C1 (base) ← C2 ← C3 (HEAD)
```

Dans ce cas, le rebase avance simplement HEAD vers la base (fast-forward implicite).

#### Rebase sur soi-même

```
git rebase main   (déjà sur main)
```

Message : `"Current branch is already up to date."`

## Comportement nominal

### Cas 1 : Rebase simple (sans conflit)

**Condition** : 
- HEAD est sur une branche
- `<base>` pointe un commit différent de HEAD
- Les commits à rejouer peuvent être appliqués sans conflit

**Processus** :
1. Résoudre `<base>` en hash via `resolveCommitish(repo, base)`
2. Vérifier que `<base>` existe
3. **Vérifier qu'on n'est pas en rebase interactif** (état de rebase antérieur actif)
4. **Identifier les commits à rejouer** :
   - Appeler `mergeBase(repo, HEAD, base)` → `commonAncestor`
   - Lister tous les commits depuis HEAD jusqu'à `commonAncestor` (ascendants linéaires seulement, pas les merges)
   - Ces commits sont ceux à rejouer, dans l'ordre croissant (ancêtres en premier)
5. **Pour chaque commit `C` à rejouer** :
   - Déterminer les changements de `C` (par rapport à son parent)
   - Appliquer les changements au-dessus du nouveau parent (la base précédente, ou le commit rejoué précédent)
   - Créer un nouveau commit `C'` avec les mêmes changements mais parent = nouveau parent
   ```
   C'.tree = newParent.tree + (C.tree - C.parent.tree)
   C'.parents = [newParent]
   C'.message = C.message
   C'.author = C.author (copié)
   C'.date = nextTimestamp() (nouvel timestamp)
   ```
   - Si conflit : voir Cas 2
6. **Après avoir rejoué tous les commits** :
   - Mettre à jour la branche courante : `refs.heads[branch] = <hash_du_dernier_commit_rejoué>`
   - Ou si HEAD détaché : `HEAD.target = <hash_du_dernier_commit_rejoué>`
   - **Sortie** :
     ```
     Successfully rebased and updated <branchname>.
     ```
     (Ou liste les commits si Phase 4 verbose)
   - **Code de sortie** : 0

### Cas 2 : Rebase avec conflits

**Condition** : L'application d'un commit lors du rebase crée un conflit.

**Processus** :
1. Lors de la rejoue du commit `C` (étape 5 ci-dessus), conflit détecté
2. Arrêter le rebase et laisser l'état en "rebasing"
3. Écrire les marqueurs de conflit dans le working tree
4. Message : `CONFLICT (content): Conflict in <file>`
5. **Code de sortie** : 1
6. Suggestion : résoudre et `git rebase --continue`, ou `git rebase --abort`
7. **État "rebasing"** (optionnel) :
   ```typescript
   rebasing?: {
     base: string;        // hash de la base
     toReplay: string[];  // liste des commits restant à rejouer
     replayed: string[];  // liste des commits déjà rejoués (nouveaux hashes)
   }
   ```

### Cas 3 : Rebase déjà à jour

**Condition** : HEAD est un ancétre ou égal à `<base>`.

**Processus** :
1. Appeler `isAncestor(repo, HEAD, base)` → `true`
2. Message : `"Current branch ... is already up to date."`
3. **Code de sortie** : 0
4. Aucune modification

### Cas 4 : Fast-forward rebase

**Condition** : HEAD est un descendant de `<base>` (tous les commits sont linéaires).

**Processus** :
1. Identifier qu'il n'y a pas d'ancêtre commun strict (base est ancêtre direct)
2. Avancer HEAD vers `<base>` sans créer de nouveaux commits
3. **Sortie** : `"Fast-forward"`
4. **Code de sortie** : 0

### Cas 5 : Rebase HEAD détaché

**Condition** : HEAD est détaché.

**Comportement** :
1. Exécuter rebase normal (identifier commits à rejouer depuis HEAD)
2. Mettre à jour `HEAD.target` vers le dernier commit rejoué
3. **Sortie** : Adaptée (pas de "branchname")

## Cas d'erreur

### Base inexistante

**Condition** : `git rebase <base>` où `<base>` ne peut pas être résolu.

**Message d'erreur** :
```
fatal: ambiguous argument '<base>': unknown revision or path not in working tree
```

**Code de sortie** : 128

**Comportement** : Aucune modification.

### Rebase en cours (conflits non résolus)

**Condition** : Appeler `git rebase` alors qu'un rebase précédent a laissé des conflits (état "rebasing" actif).

**Message d'erreur** :
```
error: It seems that there is already a rebase in progress.
Please, commit your changes and try again.
```

**Code de sortie** : 1

**Comportement** : Aucune modification.

### Base est un descendant de HEAD

**Condition** : `git rebase <base>` où `<base>` est un descendant de HEAD (rebase "upwards").

**Message d'erreur** :
```
fatal: rebase in reverse order?
```

**Ou accepter silencieusement** (Git le fait, mais c'est rare).

Phase 4 peut refuser pour clarté.

## Critères d'acceptation

### CA-rebase-01 : Rebase simple

**Given**
- Repository :
  - C0 ← C1 (main) ← C2
  - C0 ← D1 ← D2 (feature/HEAD)
  - Merge-base : C0

**When**
- Exécute `git rebase main` (depuis feature)

**Then**
- `exitCode === 0`
- `output[0]` contient `"Successfully rebased"`
- Deux nouveaux commits D1' et D2' créés
- `refs.heads.feature` pointe D2'
- `D1'.parents === [C2]`, `D2'.parents === [D1']`
- Messages et contenus : identiques à D1, D2

### CA-rebase-02 : Rebase déjà à jour

**Given**
- Repository : C0 ← C1 (main) ← C2 (feature/HEAD)

**When**
- Exécute `git rebase main`

**Then**
- `exitCode === 0`
- `output[0]` contient `"is already up to date"`
- Aucun commit créé

### CA-rebase-03 : Rebase conflit

**Given**
- Repository :
  - C0 (a.txt: "base") ← C1 (a.txt: "main") (main)
  - C0 ← D1 (a.txt: "feature") (feature/HEAD)

**When**
- Exécute `git rebase main`

**Then**
- `exitCode === 1`
- `output[0]` contient `"CONFLICT"`
- Marqueurs de conflit dans `workingTree['a.txt']`
- État "rebasing" activé
- Aucun commit D1' créé (en attente de résolution)

### CA-rebase-04 : Résolution et continue

**Given**
- État de rebase avec un conflit (comme CA-rebase-03)
- Utilisateur a édité a.txt : "resolved"

**When**
- Exécute `git add a.txt`
- Puis `git rebase --continue`

**Then**
- `exitCode === 0`
- Commit D1' créé avec changements appliqués (contenu résolu)
- État "rebasing" désactivé
- `refs.heads.feature` pointe D1'

### CA-rebase-05 : Multiple commits

**Given**
- Repository :
  - C0 ← C1 (main)
  - C0 ← D1 ← D2 ← D3 (feature/HEAD)

**When**
- Exécute `git rebase main`

**Then**
- `exitCode === 0`
- Trois nouveaux commits D1', D2', D3' créés
- `refs.heads.feature` pointe D3'
- `D1'.parents === [C1]`, `D2'.parents === [D1']`, `D3'.parents === [D2']`

### CA-rebase-06 : Rebase sur HEAD détaché

**Given**
- HEAD détaché sur C1
- feature pointe D2

**When**
- Exécute `git rebase C1` (depuis une autre position, ou switch d'abord)

**Then**
- `exitCode === 0`
- Commits replayed créés
- `HEAD.target` pointe le dernier commit rejoué

### CA-rebase-07 : Abort d'un rebase

**Given**
- État de rebase avec conflits

**When**
- Exécute `git rebase --abort`

**Then**
- `exitCode === 0`
- Tous les commits rejoués annulés
- Branche restaurée à l'état avant rebase
- État "rebasing" désactivé

### CA-rebase-08 : Rebase avec révisions HEAD~n

**Given**
- Repository : C0 ← C1 ← C2 (main), C0 ← D1 ← D2 (feature/HEAD)

**When**
- Exécute `git rebase main~1`

**Then**
- `exitCode === 0`
- Commits replayed au-dessus de C1

### CA-rebase-09 : Fast-forward rebase

**Given**
- Repository : C0 ← C1 (main) ← C2 ← C3 (feature/HEAD)
- Tous linéaires

**When**
- Exécute `git rebase main`

**Then**
- `exitCode === 0`
- Pas de nouveaux commits créés (fast-forward)
- `refs.heads.feature` pointe C3
- `output[0]` contient `"Fast-forward"` ou équivalent

### CA-rebase-10 : Merge commits en rebase

**Given**
- Repository avec un commit de merge dans la branche à rebaser

**When**
- Exécute `git rebase main`

**Then**
- **Phase 4** : Peut ignorer les merges (les traiter comme des commits à 1 parent) ou refuser
- Message : `"error: cannot rebase merges"` (si non supporté)
- Ou : traiter le merge comme un commit normal et rejouer son premier parent

## Décisions de conception (Phase 4)

| Aspect | Décision |
|--------|----------|
| **Scope** | Non-interactif uniquement ; `-i` Phase 5 |
| **Commits à rejouer** | Ceux accessibles depuis HEAD, absent de base |
| **Merge commits** | Traités comme commits normaux (1er parent) ; `-p` Phase 5 |
| **Conflits** | Marqueurs simples ; état "rebasing" optionnel |
| **Continue/abort** | Optionnels Phase 4, recommandés pour UX |
| **Timestamps** | Nouveaux timestamps pour commits rejoués |

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/commands/rebase.ts` | Implémenter rebase non-interactif avec gestion de conflits |
| `src/core/repository.ts` | Helper `getCommitsToReplay` (identifie commits à rejouer) |
| Tests | Couvrir 23-rebase.md CA-* |

## Notes sur les timestamps

En Phase 4, chaque commit rejoué reçoit un **nouveau timestamp** (nextTimestamp()) au lieu de copier l'original. Cela préserve l'ordre chronologique mais "marque" les commits comme reproduits.

Alternative (plus complexe) : copier l'auteur et le timestamp original (le commit devient "identique" en contenu, mais hash différent à cause du parent changé).

Phase 4 choisit les nouveaux timestamps pour clarté.
