# Phase 4 : Révisions & Helpers Fondamentaux

## Résumé

Cette spécification couvre les nouvelles révisions et les helpers nécessaires pour les commandes de Phase 4 (merge, reset, revert, cherry-pick, rebase).

**Nouveautés** :
- Extension de `resolveCommitish()` pour supporter `HEAD~n`, `<branche>~n`, `<hash>~n`
- Nouvel helper `isAncestor(repo, a, b)` : teste si `a` est un ancêtre de `b` dans le DAG
- Nouvel helper `mergeBase(repo, a, b)` : trouve l'ancêtre commun le plus récent de deux commits
- **Correction Phase 2** : `git branch -d` doit vérifier que la branche est mergée (usando `isAncestor`)

## Syntaxe des révisions

### Format supporté

En Phase 4, les révisions acceptent :

| Format | Exemple | Signification |
|--------|---------|---------------|
| Hash complet | `abc123def456...` | Accès direct au commit |
| Hash court | `abc123` (7 chars) | Résolution courte (match first 7 chars) |
| Branche | `main`, `feature` | Tip de la branche (refs/heads/) |
| Tag | `v1.0` (si implémenté Phase 2) | Tag pointant sur un commit |
| **HEAD~n** (NEW) | `HEAD~0`, `HEAD~1`, `HEAD~2` | `HEAD` ancêtre de n générations (via 1er parent) |
| **Branche~n** (NEW) | `main~1`, `feature~2` | Tip de branche ancêtre de n générations |
| **Hash~n** (NEW) | `abc123~1` | Commit ancêtre via 1er parent |
| **HEAD^** (optionnel Phase 4) | `HEAD^`, `HEAD^2` | Non implémenté ; voir notes |

### Sémantique de `~n`

`<commitish>~n` se résout comme suit :

1. **Résoudre `<commitish>`** : trouver le commit C
2. **Remonter n générations** : suivre le 1er parent (parent[0]) n fois
3. **Si parent[0] inexistant avant d'avoir compté n** : erreur "revision not found"

Exemple :
```
C2 ← C1 ← C0 (HEAD)

HEAD~0 → C0
HEAD~1 → C1
HEAD~2 → C2
HEAD~3 → erreur (C2 n'a pas de parent 1)
```

**Cas merge** :
```
C3 (merge C1+C2)
 ├─ C1
 └─ C2

C3~1 → C1 (premier parent)
C3~2 → C0 (suite C1)
```

### Limitation Phase 4

- **`HEAD^` et `<commit>^n`** : **NON implémentés en Phase 4**. La notation `^n` pour accéder aux parents secondaires (merges) peut être implémentée en Phase 5 si besoin.
- **`HEAD@{n}`** (reflog) : **NON implémenté**. Phase 5.

## Helper `resolveCommitish(repo, input: string): string | null`

### Signature

```typescript
export function resolveCommitish(
  repo: Repository,
  input: string
): string | null
```

### Comportement

Résout une révision (`<commitish>`) en hash de commit complet.

**Étapes** :

1. Chercher `~` dans l'input
   - S'il y a `~n`, extraire la base (`<commitish>`) et l'entier `n`
   - Résoudre la base récursivement (appel récursif)
   - Suivre le 1er parent n fois
2. Si pas de `~`, essayer (dans cet ordre) :
   - Si `input === "HEAD"` → utiliser `headCommitHash(repo)` ou erreur si null
   - Si `input` existe dans `refs.heads` → utiliser `repo.refs.heads[input]` ; erreur si vide
   - Si `input` existe dans `refs.tags` → utiliser `repo.refs.tags[input]`
   - Si `input` est un hash dans `objects` (7+ caractères, match prefix) → utiliser ce hash
   - Sinon → erreur

### Erreurs

| Condition | Message | Code |
|-----------|---------|------|
| Aucune révision ne correspond | `fatal: ambiguous argument '<input>': unknown revision or path not in working tree` | 128 |
| Parent n'existe pas (n trop grand) | `fatal: <commitish>~<n>: revision not found` | 128 |
| Branche vide (pas de commit) | `fatal: <branchname>: not a valid object name` | 128 |

### Implémentation : Points clés

1. Parser `~n` : regex `^(.+?)~(\d+)$` pour extraire base et n
2. Récursion : résoudre la base, puis itérer sur les parents
3. Hash court : implémenter `findHashByPrefix(repo, prefix)` (7 chars minimum)
4. Ordre prioritaire : HEAD > branches > tags > hashes (pour éviter les collisions)

## Helper `isAncestor(repo, a: string, b: string): boolean`

### Signature

```typescript
export function isAncestor(
  repo: Repository,
  a: string,
  b: string
): boolean
```

### Comportement

Retourne `true` si le commit `a` est un ancêtre de `b` dans le DAG (i.e., `b` est accessible en remontant les parents à partir de `a`).

**Cas spéciaux** :
- `isAncestor(repo, a, a)` → `true` (un commit est son propre ancêtre)
- Si `a` ou `b` n'existe pas → `false`

### Implémentation : Points clés

Algorithme BFS ou DFS depuis `b` :
1. Ajouter `b` à la queue/pile de visite
2. Pour chaque commit C visité :
   - Si `C === a` → retourner `true`
   - Ajouter les parents de C à la queue
   - Marquer C comme visité (éviter cycles ; inutile théoriquement dans un DAG)
3. Si la queue est vide sans avoir trouvé `a` → retourner `false`

**Complexité** : O(commits) dans le pire cas (parcours du DAG entier).

### Usage dans Phase 4

- **`git merge`** : vérifier fast-forward (est-ce que HEAD est ancêtre du tip de la branche à merger ?)
- **`git reset`** : optionnel, mais utile pour vérifier la cohérence
- **`git rebase`** : vérifier que la base n'est pas un descendant (erreur sinon)
- **`git branch -d`** (correction Phase 2) : vérifier que la branche est mergée (tip de branche est ancêtre de HEAD)

## Helper `mergeBase(repo, a: string, b: string): string | null`

### Signature

```typescript
export function mergeBase(
  repo: Repository,
  a: string,
  b: string
): string | null
```

### Comportement

Trouve l'ancêtre commun le plus récent (LCA = Lowest Common Ancestor) de deux commits `a` et `b`. Retourne le hash du commit LCA, ou `null` si aucun ancêtre commun.

**Cas spéciaux** :
- `mergeBase(repo, a, a)` → `a` (le commit lui-même)
- `mergeBase(repo, a, b)` où `a` ancêtre de `b` → `a`
- `mergeBase(repo, a, b)` où `b` ancêtre de `a` → `b`

### Implémentation : Points clés

Algorithme (BFS simultanée depuis `a` et `b`) :

1. Initialiser deux queues : `queueA` et `queueB`, ajouter `a` et `b` respectivement
2. Initialiser deux sets : `visitedA` et `visitedB`
3. Itérer niveau par niveau (BFS) :
   - Traiter tous les nœuds de `queueA` niveau actuel ; ajouter parents à `queueA`
   - Pour chaque nœud traité, si déjà visité dans `visitedB` → retourner ce commit
   - Idem pour `queueB`
4. Si les deux queues sont vides → retourner `null` (pas d'ancêtre commun ; cas rare, sauf repos disconnectés)

**Complexité** : O(commits) dans le pire cas.

**Alternative simple** (moins efficace) :
- Parcourir tous les ancêtres de `a` dans un set
- Puis parcourir les ancêtres de `b` et retourner le premier trouvé dans le set

### Usage dans Phase 4

- **`git merge`** : Déterminer la base pour les conflits (si vrai merge, pas fast-forward)
- **`git rebase`** : Trouver la base du rebase (ancêtre commun) pour identifier les commits à rejouer
- Optionnel : `git log --merge` (Phase 5+)

## Correction Phase 2 : `git branch -d` avec vérification merge

### Contexte

En Phase 2, `git branch -d <branchname>` ne vérifiait pas si la branche était mergée. Cette phase corrige ce comportement.

### Comportement nominal

### Cas 1 : Branche mergée (safe delete)

**Condition** : Le tip de `<branchname>` est un ancêtre de HEAD (i.e., `isAncestor(repo, branchTip, HEAD)`).

**Processus** :
1. Appeler `isAncestor(repo, branchTip, headCommitHash(repo))`
2. Si `true` → supprimer la branche (comme avant)
3. **Message** : `Deleted branch <branchname> (was <shortHash>).`

### Cas 2 : Branche non mergée (refuse par défaut)

**Condition** : Le tip de `<branchname>` n'est PAS un ancêtre de HEAD.

**Message d'erreur** :
```
error: The branch '<branchname>' is not fully merged.
If you are sure you want to delete it, run 'git branch -D <branchname>'.
```

**Code de sortie** : 1

**Comportement** : Aucune suppression.

### Cas 3 : Branche vide ou inexistante

Idem Phase 2 (pas de changement).

### Implémentation

Remplacer le check Phase 2 par :

```typescript
// Au lieu de :
// if (branchName === currentBranch(repo)) { error; return; }

// Faire :
const branchTip = repo.refs.heads[branchName];
if (branchTip === '') {
  // Branche vide : autoriser la suppression
} else if (branchTip) {
  const headHash = headCommitHash(repo);
  if (!headHash || !isAncestor(repo, branchTip, headHash)) {
    // Branche non mergée → erreur
    return fail(['error: The branch ...']);
  }
} else {
  // Branche n'existe pas : erreur (déjà couverte)
}
```

## Critères d'acceptation

### CA-revisions-01 : Résoudre HEAD~n

**Given**
- Repository avec 3 commits : C0 ← C1 ← C2, HEAD pointe C2

**When**
- Appel `resolveCommitish(repo, "HEAD~1")`

**Then**
- Retourne hash de C1

### CA-revisions-02 : Résoudre branche~n

**Given**
- Repository avec branche `main` pointant C2, C0 ← C1 ← C2

**When**
- Appel `resolveCommitish(repo, "main~2")`

**Then**
- Retourne hash de C0

### CA-revisions-03 : Erreur n trop grand

**Given**
- Repository avec 2 commits, HEAD sur le plus récent

**When**
- Appel `resolveCommitish(repo, "HEAD~5")`

**Then**
- Retourne `null`

### CA-revisions-04 : isAncestor true

**Given**
- C0 ← C1 ← C2

**When**
- Appel `isAncestor(repo, C0_hash, C2_hash)`

**Then**
- Retourne `true`

### CA-revisions-05 : isAncestor false

**Given**
- C0 ← C1 ← C2, avec branche divergente D1 ← D2

**When**
- Appel `isAncestor(repo, D1_hash, C2_hash)`

**Then**
- Retourne `false`

### CA-revisions-06 : mergeBase deux commits linéaires

**Given**
- C0 ← C1 ← C2, C2 ancêtre de C1

**When**
- Appel `mergeBase(repo, C0_hash, C2_hash)`

**Then**
- Retourne hash de C0

### CA-revisions-07 : mergeBase deux branches divergentes

**Given**
- C0 ← C1, C0 ← C2 (merge commit), branches `main` (C1) et `feature` (C2)

**When**
- Appel `mergeBase(repo, C1_hash, C2_hash)`

**Then**
- Retourne hash de C0

### CA-branch-d-01 : Suppression branche mergée (NEW Phase 4)

**Given**
- Repository avec `main` (C2) et `feature` (C1), C0 ← C1 ← C2, HEAD sur `main`

**When**
- Exécute `git branch -d feature`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Deleted branch 'feature'"`
- `refs.heads.feature` supprimée

### CA-branch-d-02 : Refusal branche non mergée (NEW Phase 4)

**Given**
- Repository avec `main` (C1) et `feature` (C2), C0 ← C1, C0 ← C2 (branches divergentes), HEAD sur `main`

**When**
- Exécute `git branch -d feature`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"not fully merged"`
- `refs.heads.feature` inchangée

## Notes d'implémentation

1. **`resolveCommitish` : ordre prioritaire** : Éviter l'ambiguïté tags vs hashes courts. Recommandation : essayer branche → tag → hash, plutôt que hash → branche.
2. **Memoization** : `isAncestor` peut être appelé plusieurs fois sur les mêmes arguments ; envisager un cache `Map<`a-b`, boolean>`.
3. **Ordre topologique** : Pour les helpers, l'ordre des commits dans `repo.objects` n'a pas d'importance (BFS/DFS garantissent la complétude).
4. **Erreur vs null** : `resolveCommitish` retourne `null` en cas d'erreur, puis la commande (merge/reset/etc) le transforme en `fail([message])`. Les helpers `isAncestor` et `mergeBase` retournent `boolean` / `null` (pas d'erreur levée).

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/repository.ts` | Ajouter `resolveCommitish` (étendu), `isAncestor`, `mergeBase` |
| `src/core/commands/branch.ts` | Mettre à jour `branch -d` pour appeler `isAncestor` |
| Tests | Couvrir `18-revisions-helpers.md` CA-* |
