# Phase 8 : git push

## Résumé

La commande `git push` envoie les commits locaux vers un dépôt distant (par défaut `origin`), met à jour les branches distantes, et met à jour les **références de suivi à distance** locales. Contrairement à `fetch`, `push` modifie l'état du distant et protège contre les **non-fast-forward** par défaut (rejette les tentatives de réécrire l'historique distant).

**Variantes** :
- `git push` : pousse la branche courante vers son upstream (si configuré) ; erreur sinon
- `git push <remote>` : pousse toutes les branches de la branche courante vers le distant
- `git push <remote> <branch>` : pousse une branche spécifique
- `git push <remote> <branch> -u | --set-upstream` : pousse et configure l'upstream
- `git push <remote> <branch> --force | -f` : force le push même si non-fast-forward

## Syntaxe

```
git push [<remote>] [<branch>] [-u | --set-upstream] [--force | -f]
```

### Paramètres et flags supportés en Phase 8

| Paramètre/Flag | Type | Comportement | Par défaut |
|--------|------|-------------|-----------|
| `<remote>` | optionnel | Nom du distant (ex. "origin") | upstream du dépôt local ou "origin" |
| `<branch>` | optionnel | Branche locale à pousser | branche courante (de HEAD si symbolique) |
| `-u`, `--set-upstream` | flag | Configure l'upstream de la branche | Non (push uniquement) |
| `--force`, `-f` | flag | Force le push même si non-fast-forward | Non (refus par défaut) |

**Remarques Phase 8** :
- `--all`, `--tags`, `-d` (delete), `--dry-run` : NON implémentés
- Refspec avancées (`<local>:<remote>`) : NON implémentées
- `--force-with-lease` : NON implémenté

## Concepts fondamentaux

### Non-fast-forward et protection

**Push fast-forward** : la branche distante a reculé ou avancé lineairement depuis la ref de suivi locale.

```
Local ref de suivi : C1 → C2 (old)
Local branche      : C1 → C2 → C3 (local)
Distant            : C1 → C2 (old)
    → Après push   : C1 → C2 → C3 (distant OK)
```

**Push non-fast-forward** : la branche distante a avancé d'une manière incompatible.

```
Local ref de suivi : C1 → C2 (old)
Local branche      : C1 → C3 (rebasé)
Distant            : C1 → C2 (old)
    → Après push SANS --force : REJETÉ
    → Après push AVEC --force : C1 → C3 (distant mis à jour de force)
```

**Raison du rejet** : éviter les pertes de données silencieuses ; l'administrateur du distant (ou un autre collaborateur) a potentiellement avancé la branche, et réécrire sans consentement serait destructeur.

### Upstream tracking

Une branche locale peut avoir un **upstream** (branche de suivi à distance) :

```typescript
branchUpstream: Record<branchName, { remote: string, branch: string }>
```

Exemple :
```typescript
branchUpstream = {
  "main": { remote: "origin", branch: "main" },
  "develop": { remote: "origin", branch: "develop" }
}
```

**Effet** :
- `git push` sans arguments pousse vers l'upstream configuré
- `git push -u` configure l'upstream après le push

### Copie d'objets du distant

Inversement à `fetch`, `push` copie les commits du **local** vers le **distant** :

```
repo.objectStore → (copyMissingObjects) → remote.objectStore
```

Helper : `copyMissingObjects(srcStore, dstStore, commitHashes)` (réutilisé de fetch, générique).

### Mise à jour double des refs

Le push met à jour **deux côtés** :
1. **Côté distant** : `remote.refs.heads[branch]`
2. **Côté local (ref de suivi)** : `repo.refs.remotes[remote][branch]`

Les deux doivent pointer le même hash après un push réussi.

## Comportement nominal

### Cas 1 : Push simple (avec upstream)

**Condition** :
- Branche courante a un upstream configuré (ex. origin/main)
- Branche locale a avancé fast-forward depuis la ref de suivi

**Processus** :
1. Résoudre l'upstream depuis `branchUpstream[currentBranch]` → `{ remote: "origin", branch: "main" }`
2. Vérifier que le distant existe ; erreur sinon
3. Récupérer le hash de la branche courante : `getCurrentBranchHash()` → `localHash`
4. Récupérer le hash de la ref de suivi : `repo.refs.remotes.origin.main` → `trackingHash`
5. **Vérifier fast-forward** :
   - Si `localHash === trackingHash` : rien à faire → message "Everything up-to-date"
   - Si `localHash` est descendant de `trackingHash` (via `isAncestor(trackingHash, localHash)`) : OK, procéder
   - Sinon : **non-fast-forward** → message d'erreur (cf. Cas d'erreur)
6. **Copier les commits** : appeler `copyMissingObjects(repo.objectStore, origin.objectStore, localHash)`
7. **Mettre à jour le distant** : `origin.refs.heads.main = localHash`
8. **Mettre à jour la ref de suivi** : `repo.refs.remotes.origin.main = localHash`
9. **Sortie** :
   ```
   To <remote-url>
    <short_tracking>..<short_local>  main -> main
   ```
   (Phase 8 : simplifié à "Pushed main to origin")
10. **Code de sortie** : 0

### Cas 2 : Push avec remote et branche spécifiés

**Condition** :
- Arguments : `git push origin develop`
- Branche locale develop a avancé

**Processus** :
1. Vérifier que `origin` existe
2. Vérifier que branche locale develop existe dans `refs.heads`
3. Récupérer le hash de develop local : `refs.heads.develop` → `localHash`
4. Déterminer la branche distante cible : `develop` (même nom par défaut)
5. Récupérer la ref de suivi : `repo.refs.remotes.origin.develop` → `trackingHash` (peut ne pas exister si c'est un push initial)
6. **Vérifier fast-forward** :
   - Si tracking n'existe pas : OK (création nouvelle branche distante)
   - Si `localHash === trackingHash` : "Everything up-to-date"
   - Si `localHash` est descendant : OK
   - Sinon : **non-fast-forward** → rejeté
7. **Copier et mettre à jour** : identique à Cas 1
8. **Sortie** :
   - Si nouvelle branche : `[new branch]      develop -> develop`
   - Sinon : `<short>..<short>  develop -> develop`
9. **Code de sortie** : 0

### Cas 3 : Push avec `-u` (set-upstream)

**Condition** :
- Commande : `git push -u origin main`
- Branche courante main (ou explicite)

**Processus** :
1. Exécuter le push normal (Cas 1 ou 2)
2. **Après succès** : configurer l'upstream
   - Ajouter à `branchUpstream["main"] = { remote: "origin", branch: "main" }`
3. **Sortie** : identique au push normal, optionnellement mentionner la configuration
   ```
   To <url>
    * [new branch]      main -> main
   Branch 'main' set up to track 'origin/main'.
   ```
4. **Code de sortie** : 0

### Cas 4 : Push sans upstream (erreur)

**Condition** :
- Commande : `git push` (sans arguments)
- Branche courante n'a pas d'upstream configuré

**Message d'erreur** :
```
fatal: The current branch <branch> has no upstream branch.
To push the current branch and set the remote as upstream, use

    git push --set-upstream <remote> <branch>

To have this happen automatically for branches without a tracking
upstream, see 'push.default' in 'git config' and the 'workflow'
section in 'git help tutorials'.
```

**Code de sortie** : 128

**Comportement** : Aucune modification.

**Note Phase 8** : Peut être simplifié à un message plus court.

### Cas 5 : Push initial (nouvelle branche distante)

**Condition** :
- Branche locale main n'existe pas en distant (première création)
- Aucune ref de suivi ne pointe main distant

**Processus** :
1. Récupérer le hash local : `refs.heads.main` → `localHash`
2. Déterminer la branche distante cible : `main` (même nom)
3. Récupérer la ref de suivi : `repo.refs.remotes.origin.main` → n'existe pas
4. **Pas de vérification fast-forward** (création nouvelle branche)
5. Copier les commits et mettre à jour le distant
6. **Sortie** :
   ```
   To <url>
    * [new branch]      main -> main
   ```
7. **Code de sortie** : 0

### Cas 6 : Push force (`--force`)

**Condition** :
- Commande : `git push --force origin main`
- Branche locale a été rebasée (non-fast-forward)

**Processus** :
1. Récupérer le hash local : `refs.heads.main` → `localHash` (rebasé, non-descendant)
2. **Ignorer la vérification fast-forward** (flag `--force` bypass)
3. Copier les commits (y compris les rebasés)
4. Mettre à jour le distant de force : `origin.refs.heads.main = localHash`
5. Mettre à jour la ref de suivi : `repo.refs.remotes.origin.main = localHash`
6. **Sortie** :
   ```
   To <url>
    + <short_old>...<short_new> main -> main (forced update)
   ```
7. **Code de sortie** : 0

### Cas 7 : Push, tout déjà à jour

**Condition** :
- Branche locale main === tracking ref === distant
- Rien à faire

**Processus** :
1. Vérifier que tout est aligné
2. Aucune action
3. **Sortie** :
   ```
   Everything up-to-date.
   ```
4. **Code de sortie** : 0

### Cas 8 : Push HEAD détaché

**Condition** :
- HEAD est détaché sur un commit
- Commande : `git push origin <commit-hash>` (ou équivalent)

**Processus** :
1. Phase 8 : simplification — ne pas supporter push de HEAD détaché (spécifié en Phase 9 ou +)
2. **Message d'erreur** :
   ```
   error: You cannot push a detached HEAD
   ```
   ou accepter et pousser le commit courant (décision à trancher)
3. **Code de sortie** : 128 ou 0 (selon décision)

## Cas d'erreur

### Distant inexistant

**Condition** : `git push nosuchremote main`.

**Message d'erreur** :
```
fatal: No remote named 'nosuchremote'
```

**Code de sortie** : 128

**Comportement** : Aucune modification.

### Branche locale inexistante

**Condition** : `git push origin nosuchbranch` où `nosuchbranch` n'existe pas localement.

**Message d'erreur** :
```
fatal: 'nosuchbranch' - not something we can push
```

ou

```
error: src refspec 'nosuchbranch' does not match any branch
```

**Code de sortie** : 128

**Comportement** : Aucune modification.

### Push rejeté (non-fast-forward)

**Condition** :
- Branche distante a avancé depuis la ref de suivi locale
- Branche locale ne peut pas faire un fast-forward (rebasée ou rewind)

**Message d'erreur** :
```
To <url>
 ! [rejected]       main -> main (non-fast-forward)
error: failed to push some refs to '<url>'
hint: Updates were rejected because the remote contains work that you do
hint: not have locally. This is usually caused by another repository pushing
hint: to the same ref. You may want to first integrate the remote changes
hint: (e.g., 'git pull ...') before pushing again.
hint: See the 'Notes on fast-forwards' in 'git push --help' for details.
```

**Code de sortie** : 1

**Comportement** : Aucune modification au distant ni aux refs locales.

### Push sans upstream, pas d'argument

**Condition** : `git push` (sans arguments) et pas d'upstream.

**Message d'erreur** : (cf. Cas 4)

**Code de sortie** : 128

### Branche distante inexistante, sans création

**Condition** : Spécifié une branche cible distante inexistante sans intention de créer.

**Phase 8** : Accepter la création implicite (cas normal).

## Critères d'acceptation

### CA-push-01 : Push simple fast-forward

**Given**
- Branche locale main === hash(C2)
- Ref de suivi origin/main === hash(C1)
- C2 est descendant de C1 via fast-forward
- Distant origin avec main === hash(C1)

**When**
- Exécute `git push origin main` (avec upstream configuré)

**Then**
- `exitCode === 0`
- `origin.refs.heads.main === hash(C2)`
- `repo.refs.remotes.origin.main === hash(C2)`
- `remote.objectStore` contient C2 et ses nouveaux commits
- `output[0]` contient `"main"` et indication de succès

### CA-push-02 : Push création branche distante

**Given**
- Branche locale develop === hash(D1)
- Aucune ref de suivi origin/develop
- Distant origin sans branche develop

**When**
- Exécute `git push origin develop`

**Then**
- `exitCode === 0`
- `origin.refs.heads.develop === hash(D1)`
- `repo.refs.remotes.origin.develop === hash(D1)` (créée)
- `output[0]` contient `"[new branch]"`

### CA-push-03 : Push avec -u (set-upstream)

**Given**
- Branche locale main === hash(C2)
- Pas d'upstream configuré pour main

**When**
- Exécute `git push -u origin main`

**Then**
- `exitCode === 0`
- Push succède (Cas 1)
- `branchUpstream["main"] === { remote: "origin", branch: "main" }`
- Commandes ultérieures `git push` (sans arguments) utiliseront origin/main

### CA-push-04 : Push sans upstream, pas d'argument

**Given**
- Branche courante main sans upstream

**When**
- Exécute `git push` (aucun argument)

**Then**
- `exitCode === 128`
- `errors[0]` contient `"has no upstream branch"`
- Aucune modification

### CA-push-05 : Push rejeté (non-fast-forward)

**Given**
- Branche locale main === hash(C3), rebasée depuis C1
- Ref de suivi origin/main === hash(C2)
- Distant origin/main === hash(C2)
- C1 ← C2 (distant), C0 ← C3 (local, rebasé)

**When**
- Exécute `git push origin main`

**Then**
- `exitCode === 1`
- `output[0]` ou `errors[0]` contient `"rejected"` et `"non-fast-forward"`
- `origin.refs.heads.main` inchangé (===hash(C2))
- `repo.refs.remotes.origin.main` inchangé (===hash(C2))

### CA-push-06 : Push force (--force)

**Given**
- (Même état que CA-push-05)
- Branche locale rebasée, rejet normal

**When**
- Exécute `git push --force origin main`

**Then**
- `exitCode === 0`
- `origin.refs.heads.main === hash(C3)`
- `repo.refs.remotes.origin.main === hash(C3)`
- `output[0]` contient `"forced update"` ou mention de force

### CA-push-07 : Push distant inexistant

**Given**
- Repository local initialisé

**When**
- Exécute `git push nosuchremote main`

**Then**
- `exitCode === 128`
- `errors[0]` contient `"No remote named"`
- Aucune modification

### CA-push-08 : Push branche locale inexistante

**Given**
- Branche locale main existe, pas de develop

**When**
- Exécute `git push origin develop`

**Then**
- `exitCode === 128`
- `errors[0]` contient `"not something we can push"` ou `"does not match any branch"`
- Aucune modification

### CA-push-09 : Push, tout à jour

**Given**
- Branche locale main === hash(C1)
- Ref de suivi origin/main === hash(C1)
- Distant origin/main === hash(C1)

**When**
- Exécute `git push origin main`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Everything up-to-date"`
- Aucune modification

### CA-push-10 : Push n'affecte pas HEAD local ni branches autres

**Given**
- Branche courante : main (HEAD symbolique sur main)
- Autre branche : develop (non courante)
- Push : `git push origin main`

**When**
- Exécute push

**Then**
- `exitCode === 0`
- `HEAD` toujours symbolique sur main
- `refs.heads.develop` inchangé (si elle n'était pas target)

### CA-push-11 : Push force avec -f

**Given**
- (Même état que CA-push-06)

**When**
- Exécute `git push -f origin main` (alias court)

**Then**
- `exitCode === 0`
- Comportement identique à `--force`

### CA-push-12 : Push configure upstream et succède

**Given**
- Branche locale feature === hash(F1)
- Pas d'upstream

**When**
- Exécute `git push --set-upstream origin feature`

**Then**
- `exitCode === 0`
- Push fast-forward vers distant (création ou mise à jour)
- `branchUpstream["feature"] === { remote: "origin", branch: "feature" }`

### CA-push-13 : Snapshot expose remotes mis à jour

**Given**
- Repository local après push

**When**
- Inspecter `snapshot.remotes.origin`

**Then**
- `snapshot.remotes.origin.allCommits` reflète l'état distant après push
- Commits locaux sont visibles dans le graphe distant

## Décisions de conception (Phase 8)

| Aspect | Décision |
|--------|----------|
| **Protection fast-forward** | Défaut ; refus si non-fast-forward, sauf `--force` |
| **Upstream tracking** | Posé via `-u` ; `git push` sans args utilise l'upstream |
| **Création branche distante** | Implicite (aucun flag requis) |
| **Rewind distant** | Accepté uniquement avec `--force` |
| **HEAD détaché** | Optionnel en Phase 8 ; simplifier à refus ou déléguer Phase 9 |
| **Copie d'objets** | Réutilisé `copyMissingObjects` (générique) |
| **Snapshot** | Mis à jour après push ; expose distant synchronized |

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/model.ts` | Ajouter `branchUpstream: Record<branchName, { remote, branch }>` à `Repository` ; étendre `Snapshot` |
| `src/core/commands/push.ts` | Implémenter push avec vérification fast-forward, support `-u`/`--force` |
| `src/core/repository.ts` | Helper `getUpstreamRef(repo, branchName)`, `setUpstreamTracking(repo, branchName, remote, remoteBranch)` |
| Tests | Couvrir 37-push.md CA-* |
