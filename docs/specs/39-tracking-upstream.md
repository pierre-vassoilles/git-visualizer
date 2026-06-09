# Phase 8 : Suivi des branches distantes & tracking

## Résumé

Phase 8 enrichit le modèle Git et l'UI pour gérer le **suivi des branches distantes** (upstream tracking) : configuration d'une relation entre une branche locale et une branche distante, affichage de l'écart (ahead/behind), et révisions `@{upstream}`.

**Commandes associées** :
- `git branch --set-upstream-to=<remote>/<branch> [<branchname>]` (ou `-u`)
- `git branch --unset-upstream [<branchname>]`
- `git branch -vv` : affichage détaillé avec upstream et écart
- `git status` enrichi : messages de suivi (« Your branch is ahead of… »)

**Révisions** :
- `@{upstream}` / `@{u}` : résout le commit de la branche upstream de HEAD
- `<branchname>@{upstream}` : résout le commit de l'upstream de `<branchname>`

## Syntaxe

### `git branch --set-upstream-to=<upstream> [<branchname>]`

```
git branch --set-upstream-to=<remote>/<branch> [<branchname>]
git branch -u <remote>/<branch> [<branchname>]
```

**Argument** :
- `<upstream>` : format `<remote>/<branch>` (ex. `origin/main`)
- `[<branchname>]` : branche locale cible (défaut : branche courante)

### `git branch --unset-upstream [<branchname>]`

```
git branch --unset-upstream [<branchname>]
```

Retire l'upstream d'une branche.

### `git branch -vv`

```
git branch -vv
```

Affichage détaillé : pour chaque branche, affiche le commit court, le message, l'upstream, et l'écart.

### `git status` (enrichissement)

```
git status [options]
```

Ajoute des lignes de suivi à la sortie standard.

## Modèle de données

### Structure snapshot

```typescript
// Dans snapshot, ajouter :

branchUpstream?: Record<string, {
  remote: string;           // 'origin'
  branch: string;           // 'main'
}>;

tracking?: Record<string, {
  upstream?: { remote: string; branch: string }; // idem branchUpstream
  ahead?: number;                                // commits locaux non poussés
  behind?: number;                               // commits distants non intégrés
  remote?: string;          // remote name (normalisé pour messages)
  remoteBranch?: string;    // branch name (normalisé)
}>;

remoteTrackingRefs?: Record<string, string>; // 'origin/main' -> hash
```

### Contrat avec le moteur

`snapshot.branchUpstream` doit être maintenu lors de :
- `git clone` : pose l'upstream de la branche locale sur la branche par défaut du distant
- `git branch --set-upstream-to` : configure l'upstream
- `git branch --unset-upstream` : retire l'upstream
- `git push -u` : configure l'upstream (Phase 8)

`snapshot.tracking` doit être calculé à chaque snapshot pour les branches qui ont un upstream :

```typescript
// Pseudo-code
tracking[branch] = {
  upstream: branchUpstream[branch],
  ahead: isAncestor(repo, remoteTrackingRef, localRef) 
         ? countCommitsBetween(localRef, remoteTrackingRef) 
         : 0,
  behind: isAncestor(repo, localRef, remoteTrackingRef) 
          ? countCommitsBetween(remoteTrackingRef, localRef) 
          : 0,
  remote: branchUpstream[branch]?.remote,
  remoteBranch: branchUpstream[branch]?.branch
}
```

## Concepts fondamentaux

### Upstream tracking

Un upstream (ou branche de suivi) est la relation entre une branche locale et une branche distante.

**Configuration** :
```
git branch --set-upstream-to=origin/main feature
```
Cela pose `branchUpstream['feature'] = { remote: 'origin', branch: 'main' }`.

**Utilité** :
- `git pull` sans argument utilise l'upstream
- `git status` affiche « Your branch is ahead of 'origin/main' by 2 commits »
- `git push` sans argument pousse vers l'upstream (Phase 8)
- Révisions `@{upstream}` résolvent le commit de l'upstream

### Ahead / Behind

Pour une branche avec un upstream :

- **Ahead** : commits présents dans la branche locale mais absents de l'upstream
  - Commits non poussés
  - Calcul : compter les commits depuis l'upstream jusqu'à HEAD (si HEAD est descendant de l'upstream)

- **Behind** : commits présents dans l'upstream mais absents de la branche locale
  - Commits non intégrés (fetch + pull)
  - Calcul : compter les commits depuis HEAD jusqu'à l'upstream (si upstream est descendant de HEAD)

- **Diverged** : ni l'un ni l'autre n'est ancêtre (branchement)
  - Affichage : « [origin/main: ahead 2, behind 1] » ou « diverged »

- **Gone** : la ref de suivi distant a été supprimée
  - Affichage : « [origin/main: gone] »

### Révisions `@{upstream}`

La notation `@{upstream}` (ou `@{u}`) résout le commit pointé par la branche upstream de HEAD.

**Syntaxe** :
```
@{upstream}
@{u}
<branchname>@{upstream}
<branchname>@{u}
```

**Processus de résolution** :
1. Déterminer la branche locale cible (HEAD ou `<branchname>` explicite)
2. Chercher `branchUpstream[branch]` → `{ remote, branch }`
3. Résoudre `remote/branch` en hash via `refs.remotes[remote][branch]`
4. Retourner ce hash

**Exemple** :
```
git rev-parse @{u}      # affiche hash de l'upstream de HEAD
git show feature@{u}    # affiche le commit pointé par l'upstream de feature
```

**Erreur si pas d'upstream** :
```
fatal: No upstream branch found for 'feature'
```

## Comportement nominal

### Cas 1 : Configurer un upstream

**Commande** : `git branch --set-upstream-to=origin/main feature`

**Processus** :
1. Vérifier que la branche `feature` existe (locale)
2. Vérifier que `origin/main` existe (ref de suivi distant)
3. Poser `branchUpstream['feature'] = { remote: 'origin', branch: 'main' }`
4. Message : `"Branch 'feature' set up to track 'origin/main'."`
5. **Code de sortie** : 0

### Cas 2 : Configurer upstream sur branche courante

**Commande** : `git branch -u origin/develop` (depuis feature)

**Processus** :
1. Utiliser la branche courante (feature)
2. Même processus que Cas 1
3. Message : `"Branch 'feature' set up to track 'origin/develop'."`
4. **Code de sortie** : 0

### Cas 3 : Retirer un upstream

**Commande** : `git branch --unset-upstream feature`

**Processus** :
1. Vérifier que la branche `feature` existe
2. Supprimer `branchUpstream['feature']`
3. Message : `"Branch 'feature' set up to track 'origin/main'."`  
   (Phase 8 : message simple ou vide)
4. **Code de sortie** : 0

### Cas 4 : Affichage détaillé (-vv)

**Commande** : `git branch -vv`

**Format** :
```
  main                1234567 [origin/main] Commit message
  feature             abcdefg [origin/develop: ahead 2, behind 1] Feature commit
  local-only          xyz9876 (no upstream) Untracked commit
```

**Colonnes** :
1. `*` ou ` ` : branche courante
2. Nom de branche
3. Hash court (7 caractères)
4. Upstream + écart (si configuré)
5. Message du commit (sujet)

**Processus** :
1. Lister toutes les branches locales
2. Pour chaque branche :
   - Récupérer le commit courant
   - Si `branchUpstream[branch]` existe :
     - Calculer ahead/behind via `computeAheadBehind(repo, branch, remote/branch)`
     - Afficher : `[<remote>/<branch>: ahead <N>, behind <M>]`
     - Ou si déjà à jour : `[<remote>/<branch>]`
     - Ou si gone : `[<remote>/<branch>: gone]`
   - Sinon afficher : `(no upstream)` (optionnel Phase 8)
3. Afficher le sujet du commit

### Cas 5 : Révision @{upstream}

**Commande** : `git rev-parse @{u}` ou `git show feature@{u}`

**Processus** :
1. Identifier la branche cible (HEAD ou `<branchname>`)
2. Chercher `branchUpstream[branch]`
3. Si absent : erreur « No upstream branch found »
4. Sinon : résoudre `<remote>/<branch>` en hash
5. Retourner le hash

**Exemple** :
```
$ git rev-parse @{u}
abc1234567def890
$ git log @{u}..HEAD
(affiche commits locaux non poussés)
$ git log HEAD..@{u}
(affiche commits distants non intégrés)
```

### Cas 6 : Status enrichi — ahead

**Commande** : `git status` (avec upstream configuré)

**Condition** :
- Branche courante a un upstream
- HEAD est un descendant de l'upstream (ahead)

**Output ajouté** :
```
On branch feature
Your branch is ahead of 'origin/develop' by 2 commits.
  (use "git push" to publish your local commits)

[reste du status normal]
```

### Cas 7 : Status enrichi — behind

**Condition** :
- Branche courante a un upstream
- Upstream est descendant de HEAD (behind)

**Output ajouté** :
```
On branch feature
Your branch is behind 'origin/develop' by 3 commits, and can be fast-forwarded.
  (use "git pull" to update your local branch)

[reste du status normal]
```

### Cas 8 : Status enrichi — diverged

**Condition** :
- Branche courante et upstream ont divergé (ni l'un ni l'autre ancêtre)

**Output ajouté** :
```
On branch feature
Your branch and 'origin/develop' have diverged,
and have 2 and 1 different commits each, respectively.
  (use "git pull" to merge the remote branch into yours)

[reste du status normal]
```

### Cas 9 : Status enrichi — up to date

**Condition** :
- Branche courante et upstream pointent le même commit

**Output ajouté** :
```
On branch main
Your branch is up to date with 'origin/main'.

[reste du status normal]
```

### Cas 10 : Status enrichi — gone (ref distante supprimée)

**Condition** :
- Branche courante a un upstream
- Ref de suivi distant `refs/remotes/<remote>/<branch>` n'existe plus

**Output ajouté** :
```
On branch feature
Your branch is based on 'origin/develop', but the upstream branch has been deleted.
  (use "git branch --unset-upstream" to forget the upstream)

[reste du status normal]
```

## Cas d'erreur

### Upstream inexistant

**Condition** : `git branch -u origin/nosuchbranch feature`

**Message d'erreur** :
```
fatal: upstream branch 'origin/nosuchbranch' does not exist
```

**Code de sortie** : 128

**Comportement** : Aucune modification.

### Branche locale inexistante

**Condition** : `git branch -u origin/main nosuchbranch`

**Message d'erreur** :
```
error: No such branch 'nosuchbranch'
```

**Code de sortie** : 128

**Comportement** : Aucune modification.

### Unset upstream inexistant

**Condition** : `git branch --unset-upstream feature` où feature n'a pas d'upstream

**Comportement** :
- Message vide (ou optionnel : « Branch 'feature' has no upstream »)
- **Code de sortie** : 0 (idempotent)

### Révision @{upstream} sans upstream

**Condition** : `git rev-parse @{u}` depuis une branche sans upstream

**Message d'erreur** :
```
fatal: No upstream branch found for '<branchname>'
```

**Code de sortie** : 128

**Comportement** : Aucune modification.

## Critères d'acceptation

### CA-tracking-01 : Set upstream

**Given**
- Repository avec branches `feature`, `origin/main` (ref de suivi)

**When**
- Exécute `git branch -u origin/main feature`

**Then**
- `exitCode === 0`
- `snapshot.branchUpstream['feature'] === { remote: 'origin', branch: 'main' }`
- `output[0]` contient `"set up to track"`

### CA-tracking-02 : Set upstream sur branche courante

**Given**
- Branche courante : `feature`

**When**
- Exécute `git branch -u origin/develop`

**Then**
- `exitCode === 0`
- `snapshot.branchUpstream['feature'] === { remote: 'origin', branch: 'develop' }`

### CA-tracking-03 : Unset upstream

**Given**
- `branchUpstream['feature'] === { remote: 'origin', branch: 'main' }`

**When**
- Exécute `git branch --unset-upstream feature`

**Then**
- `exitCode === 0`
- `snapshot.branchUpstream['feature']` est vide ou undefined
- Branche toujours existe

### CA-tracking-04 : Branch -vv format

**Given**
- Repository avec branches :
  - `main` pointe C2, upstream `origin/main` (C2), ahead 0, behind 0
  - `feature` pointe D1, upstream `origin/develop` (C2), ahead 1, behind 2

**When**
- Exécute `git branch -vv`

**Then**
- `exitCode === 0`
- `output` contient `"* main    ... [origin/main]"` (ou pas de ahead/behind si 0/0)
- `output` contient `"feature  ... [origin/develop: ahead 1, behind 2]"`

### CA-tracking-05 : Ahead calculation

**Given**
- Repository :
  - Local `feature` : C0 ← C1 ← D1 ← D2 (HEAD)
  - Upstream `origin/main` : C0 ← C1 (pointe C1)
  - `branchUpstream['feature'] = { remote: 'origin', branch: 'main' }`

**When**
- Exécute `git branch -vv`

**Then**
- `snapshot.tracking['feature'].ahead === 2` (D1, D2)
- `snapshot.tracking['feature'].behind === 0`

### CA-tracking-06 : Behind calculation

**Given**
- Repository :
  - Local `feature` : C0 ← C1 ← D1 (HEAD)
  - Upstream `origin/develop` : C0 ← C1 ← C2 ← C3 (pointe C3)

**When**
- Exécute `git branch -vv`

**Then**
- `snapshot.tracking['feature'].ahead === 1` (D1)
- `snapshot.tracking['feature'].behind === 2` (C2, C3)

### CA-tracking-07 : Diverged branches

**Given**
- Repository :
  - Local : C0 ← C1 ← D1 (HEAD)
  - Upstream : C0 ← C1 ← C2

**When**
- Exécute `git branch -vv`

**Then**
- Affiché : `"[origin/main: ahead 1, behind 1]"` ou `"[origin/main: diverged]"`

### CA-tracking-08 : Rev-parse @{u}

**Given**
- Repository avec upstream configuré
- Upstream `origin/main` pointe C3

**When**
- Exécute `git rev-parse @{u}`

**Then**
- `exitCode === 0`
- `output[0] === hash(C3)`

### CA-tracking-09 : Rev-parse branchname@{u}

**Given**
- Repository avec `feature@upstream = origin/develop` pointant D2

**When**
- Exécute `git rev-parse feature@{u}`

**Then**
- `exitCode === 0`
- `output[0] === hash(D2)`

### CA-tracking-10 : Status ahead message

**Given**
- Branche courante `feature` avec upstream `origin/main`
- `tracking['feature'].ahead === 2`, `behind === 0`

**When**
- Exécute `git status`

**Then**
- `exitCode === 0`
- `output` contient `"Your branch is ahead of 'origin/main' by 2 commits"`
- `output` contient `"use \"git push\" to publish"`

### CA-tracking-11 : Status behind message

**Given**
- Branche courante avec `ahead === 0`, `behind === 3`

**When**
- Exécute `git status`

**Then**
- `output` contient `"Your branch is behind 'origin/main' by 3 commits"`
- `output` contient `"can be fast-forwarded"` ou `"use \"git pull\""`

### CA-tracking-12 : Status diverged message

**Given**
- Branche courante avec `ahead === 2`, `behind === 1`

**When**
- Exécute `git status`

**Then**
- `output` contient `"Your branch and 'origin/main' have diverged"`
- `output` contient `"ahead 2 and behind 1"` ou `"2 and 1 different commits"`

### CA-tracking-13 : Status gone

**Given**
- Branche courante a upstream configuré
- Ref de suivi `origin/main` n'existe plus

**When**
- Exécute `git status`

**Then**
- `output` contient `"upstream branch has been deleted"` ou `"gone"`

### CA-tracking-14 : Status up to date

**Given**
- Branche courante avec upstream, ahead === 0, behind === 0

**When**
- Exécute `git status`

**Then**
- `output` contient `"Your branch is up to date with 'origin/main'"`

### CA-tracking-15 : Error rev-parse no upstream

**Given**
- Branche courante sans upstream

**When**
- Exécute `git rev-parse @{u}`

**Then**
- `exitCode === 128`
- `errors[0]` contient `"No upstream branch found"`

### CA-tracking-16 : Error set upstream not exists

**Given**
- Repository initialisé, branche `feature` existe

**When**
- Exécute `git branch -u origin/nosuchbranch`

**Then**
- `exitCode === 128`
- `errors[0]` contient `"does not exist"`
- Aucune modification à `branchUpstream`

### CA-tracking-17 : Clone pose upstream

**Given**
- `git clone <source>` amorçant depuis un distant avec branche par défaut `develop`

**When**
- Clone réussit, branche locale `develop` créée

**Then**
- `snapshot.branchUpstream['develop'] === { remote: 'origin', branch: 'develop' }`
- HEAD checked out sur `develop`

### CA-tracking-18 : Revisions in log

**Given**
- Repository avec commits C0 ← C1 (local) ← D1 (upstream)

**When**
- Exécute `git log @{u}..HEAD` (commits locaux non poussés)

**Then**
- `exitCode === 0`
- `output` liste C1 (ou D1 selon la direction)

## Décisions de conception (Phase 8)

| Aspect | Décision |
|--------|----------|
| **Upstream storage** | Dans `branchUpstream: Record<branch, { remote, branch }>` du snapshot |
| **Ahead/Behind** | Calculés à chaque snapshot pour branches avec upstream |
| **Révisions** | `@{upstream}` et `@{u}` supportées ; `<branch>@{upstream}` aussi |
| **Gone tracking** | Branche supprimée distante affichée en status |
| **-vv format** | Compact : nom + commit court + upstream + écart |
| **Status enrichi** | Ajoute ligne de suivi après "On branch X" |
| **Idempotence** | `--unset-upstream` quand absent = code 0 |
| **Erreurs** | Ref distante inexistante = 128 ; branche inexistante = 128 |

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/model.ts` | Ajouter `branchUpstream`, `tracking`, `remoteTrackingRefs` au snapshot |
| `src/core/commands/branch.ts` | Ajouter `-u` / `--set-upstream-to` et `--unset-upstream` ; renforcer `-vv` |
| `src/core/commands/status.ts` | Enrichir output avec lignes de suivi (ahead/behind/diverged/gone) |
| `src/core/repository.ts` | Helper `computeAheadBehind(repo, branch, remoteBranch)` (count via `isAncestor`) |
| `src/core/types.ts` ou `parser.ts` | Étendre `resolveCommitish` pour supporter `@{upstream}`, `@{u}`, `<branch>@{u}` |
| Tests | Couvrir 39-tracking-upstream.md CA-* |
