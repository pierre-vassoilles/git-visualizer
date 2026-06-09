# Phase 8 : git pull

## Résumé

La commande `git pull` récupère les changements d'un dépôt distant et les intègre dans la branche courante. Elle combine deux opérations : `git fetch` (copie des objets distants, mise à jour des refs de suivi) puis **intégration** (merge ou rebase) de l'upstream dans la branche courante.

**Variantes** :
- `git pull [<remote>] [<branch>]` : fetch puis merge (par défaut)
- `git pull --rebase [<remote>] [<branch>]` : fetch puis rebase de l'upstream
- `git pull --no-rebase [<remote>] [<branch>]` : force le merge (annule `pull.rebase` global)

## Syntaxe

```
git pull [options] [<remote>] [<branch>]
```

### Options supportées en Phase 8

| Option | Argument | Comportement | Notes |
|--------|----------|-------------|-------|
| (aucun) | `[<remote>] [<branch>]` | Fetch + merge par défaut | Utilise upstream si non fourni |
| `--rebase` | (aucun) | Fetch + rebase | Utilisé au lieu de merge |
| `--no-rebase` | (aucun) | Force merge | Annule `pull.rebase` (Phase 8 : pas de config) |
| `--abort` | (aucun) | Annule un pull en cours (merge/rebase conflictuel) | Optionnel Phase 8 |

**Remarques Phase 8** :
- `--force`, `--allow-unrelated-histories`, `-X strategy`, etc. : NON implémentés Phase 8
- `pull.rebase` configuration : NON implémentée Phase 8 (le default est toujours merge)

## Concepts fondamentaux

### Upstream tracking

Un pull sans arguments `[<remote>] [<branch>]` utilise la **branche upstream** de la branche courante (configurée via `git branch --set-upstream-to` ou `git clone`).

```typescript
// Snapshot expose :
branchUpstream?: Record<branch, { remote: string; branch: string }>
// Exemple : branchUpstream['feature'] = { remote: 'origin', branch: 'develop' }
```

Résolution des arguments :
1. Si `<branch>` fourni : utiliser `<remote>/<branch>`
2. Sinon si `<remote>` fourni : utiliser `<remote>/HEAD` par défaut
3. Sinon utiliser l'upstream de la branche courante
4. Si aucun upstream et pas d'argument : erreur « There is no tracking information »

### Fetch puis intégration

Le pull se décompose en deux étapes immuables :

1. **Fetch** : `git fetch [<remote>] [<branch>]`
   - Copie les objets manquants du distant vers le local
   - Met à jour les refs de suivi (`refs/remotes/origin/*`)
   - **Ne change pas les branches locales ni le working tree**

2. **Intégration** : merge ou rebase de `origin/<branch>` dans la branche courante
   - **Merge (défaut)** : `git merge <remote>/<branch>` (fast-forward, true merge, conflits)
   - **Rebase** : `git rebase <remote>/<branch>` (rejoue les commits locaux, conflits)

### "Already up to date."

Si après le fetch, la branche courante pointe déjà le même commit que l'upstream, aucune intégration n'est nécessaire.

```
message: "Already up to date."
exitCode: 0
```

## Comportement nominal

### Cas 1 : Pull simple (fetch + fast-forward merge)

**Condition** :
- Branche courante a un upstream configuré (ou fourni en argument)
- Le distant a de nouveaux commits
- Le tip du distant est un descendant du tip local (fast-forward possible)

**Processus** :
1. Résoudre `<remote>` (défaut : `origin`)
2. Résoudre `<branch>` (défaut : branche de même nom que l'upstream)
3. Vérifier que l'upstream existe (sinon erreur « no tracking information »)
4. **Fetch** : copier les objets du distant, mettre à jour `refs/remotes/origin/<branch>`
5. **Merge** : appeler `git merge origin/<branch>` (reuse de la logique merge Phase 4)
   - Si fast-forward : mettre à jour la branche courante, afficher « Fast-forward »
   - Si already up to date : afficher « Already up to date. »
6. Mettre à jour l'index et le working tree
7. **Sortie** :
   ```
   remote: Counting objects: ...
   remote: Compressing objects: ...
   Updating abc1234..def5678
   Fast-forward
    file.txt | 2 +-
    1 file changed, 1 insertion(+), 1 deletion(-)
   ```
   (Phase 8 : simplifié, pas du texte détaillé)
8. **Code de sortie** : 0

### Cas 2 : Pull avec true merge (branches divergentes)

**Condition** :
- Branche courante et upstream ont divergé
- Pas de flag `--rebase`

**Processus** :
1. **Fetch** (comme Cas 1)
2. **Merge** : appeler `git merge origin/<branch>` (reuse Phase 4)
   - 3-way merge détecte divergence
   - Crée un commit de fusion si pas de conflit
   - Si conflit : marqueurs + état "merging" (voir Phase 4)
3. **Sortie** : `"Merge made by the '3-way' merge strategy."`
4. **Code de sortie** : 0 (ou 1 si conflit)

### Cas 3 : Pull --rebase (fetch + rebase)

**Condition** :
- Flag `--rebase` fourni (ou `pull.rebase = true` en config, non implémenté Phase 8)
- Branche courante a des commits absents de l'upstream

**Processus** :
1. **Fetch** (comme Cas 1)
2. **Rebase** : appeler `git rebase origin/<branch>` (reuse Phase 4)
   - Rejoue les commits locaux au-dessus de l'upstream
   - Crée de nouveaux commits avec nouveaux hashes
   - Si conflit : marqueurs + état "rebasing" (voir Phase 4)
3. **Sortie** : `"Successfully rebased and updated <branchname>."`
4. **Code de sortie** : 0 (ou 1 si conflit)

### Cas 4 : Pull avec arguments explicites

**Condition** :
- Syntaxe `git pull <remote> <branch>` fournie (sans upstream)

**Processus** :
1. **Fetch** depuis `<remote>` la branche `<branch>`
2. **Merge** (ou rebase) depuis `<remote>/<branch>` dans la branche courante
3. Aucune modification à `branchUpstream` (pas d'upstream implicite)

### Cas 5 : Pull sur une branche sans upstream

**Condition** :
- `git pull` exécuté sans argument
- Branche courante n'a pas d'upstream configuré

**Message d'erreur** :
```
fatal: There is no tracking information for the current branch.
Please specify which branch you want to merge with.
See git-pull(1) for details.

    git pull <remote> <branch>
```

**Code de sortie** : 1

**Comportement** : Aucune modification.

### Cas 6 : Pull avec conflit de merge

**Condition** :
- Le merge provoque des conflits (conditions de Phase 4 : CA-merge-04)

**Processus** :
1. **Fetch** réussit
2. **Merge** détecte conflit et s'arrête
3. État "merging" activé (Phase 4)
4. Marqueurs de conflit dans le working tree
5. Message : `"CONFLICT (content): Merge conflict in <file>"`
6. Suggestion : résoudre et `git commit`, ou `git merge --abort`
7. **Code de sortie** : 1

**L'état du pull est préservé** : l'utilisateur peut résoudre les conflits et relancer le merge via `git commit` (pas besoin de refaire le fetch).

### Cas 7 : Pull avec conflit de rebase

**Condition** :
- Le rebase provoque des conflits (conditions de Phase 4 : CA-rebase-03)

**Processus** :
1. **Fetch** réussit
2. **Rebase** détecte conflit et s'arrête
3. État "rebasing" activé (Phase 4)
4. Marqueurs de conflit dans le working tree
5. Message : `"CONFLICT (content): Conflict in <file>"`
6. Suggestion : résoudre et `git rebase --continue`, ou `git rebase --abort`
7. **Code de sortie** : 1

### Cas 8 : Pull du même commit (already up to date)

**Condition** :
- Branche courante pointe déjà le même commit que l'upstream
- Après fetch, aucune modification

**Processus** :
1. **Fetch** réussit, pas de changement
2. **Merge** détecte que HEAD === upstream, affiche « Already up to date. »
3. **Code de sortie** : 0

### Cas 9 : Pull HEAD détaché

**Condition** :
- HEAD est détaché
- Arguments explicites fournis (`<remote>` `<branch>`)

**Comportement** :
1. **Fetch** normal
2. **Merge** ou **Rebase** normal (HEAD détaché autorisé, Phase 4)
3. HEAD.target mis à jour vers le nouveau commit

## Cas d'erreur

### Branche distante inexistante

**Condition** : `git pull origin nosuchbranch` où `origin/nosuchbranch` n'existe pas.

**Message d'erreur** :
```
fatal: 'nosuchbranch' - not something we can merge
```

**Code de sortie** : 1

**Comportement** : Fetch réussit (pas de changement), merge échoue.

### Merge/rebase en cours

**Condition** : Appeler `git pull` alors qu'un merge ou rebase précédent a laissé des conflits (état "merging" ou "rebasing" actif).

**Message d'erreur** (reuse Phase 4) :
```
error: You have not concluded your merge (MERGE_HEAD exists).
Please, commit your changes before you merge again.
```

ou

```
error: It seems that there is already a rebase in progress.
Please, commit your changes and try again.
```

**Code de sortie** : 1

**Comportement** : Aucune modification.

### Remote inexistant

**Condition** : `git pull nosuchremote branch` où `nosuchremote` n'existe pas dans `remotes`.

**Message d'erreur** :
```
fatal: 'nosuchremote' does not appear to be a git repository
```

**Code de sortie** : 128

**Comportement** : Aucune modification (fetch échoue avant merge).

### Pas d'argument, pas d'upstream

(Voir Cas 5 ci-dessus)

**Code de sortie** : 1

## Critères d'acceptation

### CA-pull-01 : Pull simple fast-forward

**Given**
- Repository initialisé avec clone (upstream configuré : origin/main)
- Local : C0 ← C1 (main/HEAD)
- Distant (origin) : C0 ← C1 ← C2 ← C3 (main)

**When**
- Exécute `git pull`

**Then**
- `exitCode === 0`
- Objets C2, C3 copiés du distant
- `refs.remotes.origin.main === hash(C3)`
- `refs.heads.main === hash(C3)` (fast-forward)
- `output` contient `"Fast-forward"`
- `index` et `workingTree` alignés sur C3

### CA-pull-02 : Pull avec true merge

**Given**
- Repository avec upstream (origin/main)
- Local : C0 ← C1 (main/HEAD) + C2
- Distant : C0 ← C1 ← D1 ← D2 (main)
- C1 a modifié `a.txt` = "a1"
- D2 a modifié `b.txt` = "b2"

**When**
- Exécute `git pull`

**Then**
- `exitCode === 0`
- Fetch met à jour `refs.remotes.origin.main === hash(D2)`
- Merge créé : M.parents = [C2, D2]
- `refs.heads.main === hash(M)`
- `output` contient `"Merge made by"`
- `index` et `workingTree` alignés sur M

### CA-pull-03 : Pull --rebase

**Given**
- Repository avec upstream
- Local : C0 ← C1 (main) ← D1 ← D2 (feature/HEAD, upstream: origin/main)
- Distant : C0 ← C1 ← C2 (main)
- Merge-base : C1

**When**
- Exécute `git pull --rebase`

**Then**
- `exitCode === 0`
- Fetch met à jour `refs.remotes.origin.main === hash(C2)`
- Rebase rejoue D1, D2 au-dessus de C2 → D1', D2'
- `refs.heads.feature === hash(D2')`
- `output` contient `"Successfully rebased"`
- Aucun commit de fusion créé

### CA-pull-04 : Pull avec conflit

**Given**
- Repository avec upstream
- Local : C0 ← C1 (main/HEAD) + C2
- Distant : C0 ← C1 ← D1
- Base C0 : `config.txt` = "base"
- C2 : `config.txt` = "local"
- D1 : `config.txt` = "distant"

**When**
- Exécute `git pull`

**Then**
- `exitCode === 1`
- Fetch réussit, refs de suivi mises à jour
- Merge détecte conflit
- `output` contient `"CONFLICT (content): Merge conflict in config.txt"`
- Marqueurs de conflit dans `workingTree['config.txt']`
- État "merging" activé

### CA-pull-05 : Résolution et commit après pull conflictuel

**Given**
- État de pull avec conflit (comme CA-pull-04)
- Utilisateur a résolu `config.txt` : "local"

**When**
- Exécute `git add config.txt`
- Puis `git commit -m "Merge pull"`

**Then**
- `exitCode === 0` (pour commit)
- Commit de fusion créé avec parents [C2, D1]
- État "merging" désactivé
- `refs.heads.main` pointe le merge commit

### CA-pull-06 : Pull avec arguments explicites

**Given**
- Repository initialisé (sans upstream sur feature)
- Local : C0 ← C1 (main) ← C2 (feature/HEAD)
- Distant (origin) : C0 ← C1 ← C3 (develop)

**When**
- Exécute `git pull origin develop` (depuis feature)

**Then**
- `exitCode === 0`
- Fetch copie C3 du distant
- `refs.remotes.origin.develop === hash(C3)`
- Merge (ou FF) origin/develop dans feature
- `refs.heads.feature` avancée vers C3 (ou merge commit)
- Aucune modification à `branchUpstream['feature']` (pas d'upstream implicit)

### CA-pull-07 : Pull sans upstream configuré

**Given**
- Repository initialisé
- Branche courante n'a pas d'upstream
- Aucun argument fourni

**When**
- Exécute `git pull`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"no tracking information"`
- Suggestion : `"git pull <remote> <branch>"`
- Aucune modification

### CA-pull-08 : Pull already up to date

**Given**
- Repository avec upstream
- Local : C0 ← C1 (main/HEAD, upstream: origin/main)
- Distant : C0 ← C1 (main) — même commit

**When**
- Exécute `git pull`

**Then**
- `exitCode === 0`
- Fetch s'exécute (rien à copier)
- Merge détecte already up to date
- `output` contient `"Already up to date"`
- Aucune modification

### CA-pull-09 : Pull --no-rebase force merge

**Given**
- Repository avec upstream, config pull.rebase = false (Phase 8 : non implémenté, ignore)
- Branches divergentes

**When**
- Exécute `git pull --no-rebase`

**Then**
- `exitCode === 0`
- Merge créé (non rebase)
- Commit de fusion avec 2 parents

### CA-pull-10 : Pull --rebase avec conflit

**Given**
- Repository avec upstream
- Local : C0 ← C1 (main) ← D1 (feature/HEAD)
- Distant : C0 ← C1 ← C2 (main, upstream)
- Base C0 : `a.txt` = "base"
- C2 : `a.txt` = "distant"
- D1 : `a.txt` = "local"

**When**
- Exécute `git pull --rebase`

**Then**
- `exitCode === 1`
- Fetch réussit
- Rebase détecte conflit lors de la rejoue de D1
- État "rebasing" activé
- `output` contient `"CONFLICT"`
- Marqueurs de conflit dans WT

### CA-pull-11 : Pull HEAD détaché

**Given**
- HEAD détaché sur C2
- Distant a C3 (origin/main)
- Arguments explicites : `git pull origin main`

**When**
- Exécute `git pull origin main` (depuis HEAD détaché)

**Then**
- `exitCode === 0`
- Fetch réussit
- Merge (ou FF) appliqué à HEAD détaché
- `HEAD.target` pointe le nouveau commit

### CA-pull-12 : Pull branche distante inexistante

**Given**
- Repository initialisé

**When**
- Exécute `git pull origin nosuchbranch`

**Then**
- `exitCode === 1`
- Fetch échoue ou réussit (selon si remote existe)
- Merge échoue : `"not something we can merge"`

## Décisions de conception (Phase 8)

| Aspect | Décision |
|--------|----------|
| **Commande combinée** | `git pull` = `git fetch` + intégration (merge/rebase), étapes immuables |
| **Merge par défaut** | Sans `--rebase`, utiliser merge (Phase 4) |
| **Rebase sur demande** | Flag `--rebase` active la reuse de Phase 4 |
| **Upstream** | Utilisé si pas d'argument ; erreur si absent |
| **Conflits** | Réutilisent état "merging"/"rebasing" Phase 4 ; résolution manuelle |
| **Already up to date** | Message simple, code 0, aucune action |
| **Arguments explicites** | Non récursifs (pas de branche upstream implicite) |
| **Config pull.rebase** | Non implémentée Phase 8 (défaut toujours merge) |

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/commands/pull.ts` | Implémenter `git pull` : parse args, resolve upstream, fetch, merge/rebase |
| `src/core/repository.ts` | Helper `resolveUpstream(repo, branch)` (retourne `{ remote, branch }` ou error) |
| Tests | Couvrir 38-pull.md CA-* |
