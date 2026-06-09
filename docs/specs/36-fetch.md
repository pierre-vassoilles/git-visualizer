# Phase 7 : git fetch

## Résumé

La commande `git fetch` récupère les nouveaux commits et les références d'un dépôt distant (par défaut `origin`), les ajoute à l'object store local, et met à jour les **références de suivi à distance** (`refs/remotes/origin/*`). **Elle ne modifie jamais les branches locales, HEAD, ou le working tree.** C'est une opération "lecture + mise à jour des refs de suivi" uniquement.

**Variantes** :
- `git fetch` : récupère du distant `origin` (par défaut), tous les branches
- `git fetch <remote>` : récupère depuis un distant nommé autre que origin
- `git fetch <remote> <branch>` : récupère une branche spécifique du distant
- (Optionnel Phase 7 : `git fetch --all`, `git fetch --prune` non implémentés)

## Syntaxe

```
git fetch [<remote>] [<branch>]
```

### Paramètres supportés en Phase 7

| Paramètre | Type | Comportement | Par défaut |
|-----------|------|-------------|-----------|
| `<remote>` | optionnel | Nom du distant (ex. "origin") | "origin" |
| `<branch>` | optionnel | Branche distante à récupérer (ex. "main") | Toutes les branches |

**Remarques Phase 7** :
- `--all`, `--prune`, `--dry-run`, `-f`, `--force`, etc. : NON implémentés
- `--depth`, `--single-branch` : NON implémentés (pas de shallow clone)

## Concepts fondamentaux

### Dépôt distant (`origin`)

Phase 7 introduit un **registre de dépôts distants** :

```typescript
remotes: Record<string, RemoteRepository>
```

Un `RemoteRepository` est un dépôt **bare** (sans working tree ni index) possédant :
- Son propre `objectStore` (Blob/Tree/Commit)
- Ses propres `refs.heads` (branches distantes)
- Un `HEAD` (référence par défaut)

Lors d'une `fetch`, on copie les objets manquants du store du distant vers le store local.

### Références de suivi à distance

Le dépôt local possède une nouvelle structure `refs.remotes` :

```typescript
refs.remotes: Record<remote, Record<branch, hash>>
```

Par exemple :
```typescript
refs.remotes = {
  "origin": {
    "main": "abc123...",
    "develop": "def456..."
  }
}
```

**Invariant** : Une ref de suivi `refs/remotes/origin/main` ne bouge QUE via `fetch`, `push`, ou `clone`. Elle ne change jamais via un commit local ou un `checkout`.

### Object store partagé (fetch)

`fetch` applique l'algorithme suivant :

1. **Déterminer les refs du distant** : récupérer `remote.refs.heads[branch]` (ou toutes les branches si omis)
2. **Copier les objets manquants** : depuis `remote.objectStore` vers `repo.objectStore`
   - Helper `copyMissingObjects(srcStore, dstStore, commits)` : parcourt récursivement l'arbre des commits et ajoute les objets manquants
3. **Mettre à jour les refs de suivi** : pour chaque branche récupérée, faire `refs.remotes[remote][branch] = remote.refs.heads[branch]`
4. **Snapshot enrichi** : exposer `snapshot.remotes[name]` (graphe du distant réutilisable par le layout) et `snapshot.remoteTrackingRefs` (décoration des labels sur le local)

### Calcul ahead/behind (optionnel Phase 7)

Une fois fetch complété, on peut calculer si une branche locale est en avance (ahead) ou en retard (behind) par rapport à son upstream :

```typescript
computeAheadBehind(repo, localBranch, remoteRef): { ahead: number, behind: number }
```

Utilise `isAncestor` pour déterminer la relation entre deux commits et compte les commits intermédiaires. Optionnel en Phase 7 ; peut être ajouté à la spec snapshot plus tard.

## Comportement nominal

### Cas 1 : Fetch depuis origin, toutes les branches

**Condition** :
- Distant `origin` existe
- Remote a une ou plusieurs branches (ex. main, develop)

**Processus** :
1. Vérifier que `origin` existe dans `remotes` ; erreur sinon
2. Parcourir toutes les branches du distant : `origin.refs.heads`
3. Pour chaque branche `B` :
   - Récupérer le commit tip : `origin.refs.heads[B]` → `commitHash`
   - Appeler `copyMissingObjects(origin.objectStore, repo.objectStore, commitHash)`
   - Mettre à jour la ref de suivi : `repo.refs.remotes.origin[B] = commitHash`
4. **Sortie** : résumé des branches mises à jour
   ```
   From <remote-url>
    * [new branch]      main       -> origin/main
    * [new branch]      develop    -> origin/develop
   ```
   (Phase 7 : simplifié à `"Fetched X branches from origin"` ou liste simple)
5. **Code de sortie** : 0

### Cas 2 : Fetch depuis origin, branche spécifique

**Condition** :
- Distant `origin` existe
- Branche `<branch>` existe sur le distant

**Processus** :
1. Vérifier que `origin` existe
2. Vérifier que `origin.refs.heads[branch]` existe ; erreur sinon
3. Récupérer le commit tip : `origin.refs.heads[branch]` → `commitHash`
4. Appeler `copyMissingObjects(origin.objectStore, repo.objectStore, commitHash)`
5. Mettre à jour la ref de suivi : `repo.refs.remotes.origin[branch] = commitHash`
6. **Sortie** :
   ```
   From <remote-url>
    * branch            main       -> origin/main
   ```
   (Phase 7 : simplifié)
7. **Code de sortie** : 0

### Cas 3 : Fetch depuis distant nommé

**Condition** :
- Distant `<remote>` (autre que "origin") existe dans `remotes`

**Processus** :
1. Vérifier que `remotes[<remote>]` existe ; erreur sinon
2. Exécuter le même processus que Cas 1 ou 2, avec le distant `<remote>`
3. Mettre à jour `repo.refs.remotes[<remote>]` au lieu de `origin`
4. **Sortie** : analogue, mentionnant le nom du distant

### Cas 4 : Rien à récupérer ("Already up to date")

**Condition** :
- Distant existe, mais la branche distante pointe déjà un commit présent localement

**Processus** :
1. Déterminer le commit tip distant
2. Vérifier que ce commit existe déjà dans `repo.objectStore`
3. Aucune copie d'objet nécessaire
4. Mettre à jour la ref de suivi (elle pointe déjà le même hash, donc aucun changement visible)
5. **Sortie** :
   ```
   Already up to date.
   ```
   ou simplement aucune ligne (si branch inchangée)
6. **Code de sortie** : 0

### Cas 5 : Mise à jour de ref de suivi existante

**Condition** :
- La ref de suivi `origin/main` existe et pointe un commit ancien
- Le distant a avancé (fast-forward simple)

**Processus** :
1. Récupérer le nouveau commit distant
2. Copier les objets manquants (nouveaux commits entre l'ancien et le nouveau)
3. Mettre à jour la ref de suivi : `repo.refs.remotes.origin.main = newHash`
4. **Sortie** :
   ```
   From <url>
    <short_old>..<short_new>  main       -> origin/main
   ```
   (Phase 7 : simplifié)
5. **Code de sortie** : 0

### Cas 6 : Rewind (branche distante en retrait)

**Condition** :
- La ref de suivi locale pointe un commit *plus avancé* que la branche distante (le distant a été rebasé/reset)

**Processus** :
1. Récupérer le nouveau commit distant (moins avancé que la ref de suivi locale)
2. Aucune copie d'objet ; les commits "rewindés" restent dans le store local
3. Mettre à jour la ref de suivi vers le nouveau (moins avancé)
4. **Sortie** :
   ```
   From <url>
    + <short_old>...<short_new> main       -> origin/main (forced update)
   ```
   ou mention d'un rewind
5. **Code de sortie** : 0

### Cas 7 : Fetch divergent

**Condition** :
- La branche distante a avancé dans une direction différente de la ref de suivi locale (merge divergent)

**Processus** :
1. Copier les commits du distant (nouveaux)
2. Mettre à jour la ref de suivi vers le nouveau tip distant
3. Aucune résolution ; fetch ne fusionne pas
4. **Sortie** : mention des commits reçus
5. **Code de sortie** : 0

## Cas d'erreur

### Distant inexistant

**Condition** : `git fetch <remote>` où `<remote>` n'existe pas dans `remotes`.

**Message d'erreur** :
```
fatal: No remote named '<remote>'
```

**Code de sortie** : 128

**Comportement** : Aucune modification aux refs locales, objet store, ou working tree.

### Branche distante inexistante

**Condition** : `git fetch origin <branch>` où `<branch>` n'existe pas sur origin.

**Message d'erreur** :
```
fatal: Couldn't find remote ref <branch>
```

ou

```
fatal: No remote tracking branch for '<branch>'
```

**Code de sortie** : 128

**Comportement** : Aucune modification.

## Critères d'acceptation

### CA-fetch-01 : Fetch simple, toutes les branches

**Given**
- Repository local vierge (aucun commit)
- Distant `origin` avec branches main (C1) et develop (C2)

**When**
- Exécute `git fetch origin`

**Then**
- `exitCode === 0`
- `repo.refs.remotes.origin.main === hash(C1)`
- `repo.refs.remotes.origin.develop === hash(C2)`
- `repo.objectStore` contient C1, C2, et tous leurs ancestors
- Aucune branche locale créée
- HEAD inchangé

### CA-fetch-02 : Fetch branche spécifique

**Given**
- Repository local vierge
- Distant `origin` avec branches main (C1) et develop (C2)

**When**
- Exécute `git fetch origin main`

**Then**
- `exitCode === 0`
- `repo.refs.remotes.origin.main === hash(C1)`
- `repo.refs.remotes.origin.develop` n'existe pas (ou reste inchangé)
- `repo.objectStore` contient C1 et ses ancestors
- C2 n'est PAS en local

### CA-fetch-03 : Fetch par défaut (origin)

**Given**
- Repository local initialisé
- Distant `origin` configuré

**When**
- Exécute `git fetch` (sans arguments)

**Then**
- `exitCode === 0`
- Comportement identique à `git fetch origin`

### CA-fetch-04 : Fetch, rien à récupérer

**Given**
- Repository local avec branche main pointant C1
- Ref de suivi local `origin/main` pointant C1
- Distant `origin` avec main pointant C1

**When**
- Exécute `git fetch origin`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Already up to date."` ou est vide
- Aucune modification aux refs ou objets

### CA-fetch-05 : Fetch met à jour ref de suivi (fast-forward)

**Given**
- Repository local avec ref de suivi `origin/main === hash(C1)`
- Distant `origin` avec main === hash(C2), C2 est descendant de C1
- C2 et ses nouveaux commits ne sont pas en local

**When**
- Exécute `git fetch origin main`

**Then**
- `exitCode === 0`
- `repo.refs.remotes.origin.main === hash(C2)`
- `repo.objectStore` contient C2 et ses nouveaux commits
- Branche locale main inchangée (si elle existe et pointait C1)

### CA-fetch-06 : Fetch distant inexistant

**Given**
- Repository local initialisé

**When**
- Exécute `git fetch nonexistent`

**Then**
- `exitCode === 128`
- `errors[0]` contient `"No remote named"`
- Aucune modification

### CA-fetch-07 : Fetch branche distante inexistante

**Given**
- Distant `origin` avec main, pas de branch "nosuchbranch"

**When**
- Exécute `git fetch origin nosuchbranch`

**Then**
- `exitCode === 128`
- `errors[0]` contient `"Couldn't find remote ref"` ou `"No remote tracking branch"`
- Aucune modification

### CA-fetch-08 : Fetch rewind (branche distante rebasée)

**Given**
- Repository local avec ref de suivi `origin/main === hash(C2)`
- C1 ← C2 (old main) ; distant a rebasé à C0 ← C3 (new main)
- Distant `origin` avec main === hash(C3)

**When**
- Exécute `git fetch origin main`

**Then**
- `exitCode === 0`
- `repo.refs.remotes.origin.main === hash(C3)`
- `repo.objectStore` contient C3 et ses ancestors
- C2 reste dans le store (fetch n'efface pas)

### CA-fetch-09 : Fetch création nouvelle ref de suivi

**Given**
- Repository local avec main, aucune ref de suivi pour develop
- Distant `origin` crée une nouvelle branche develop (D1)

**When**
- Exécute `git fetch origin develop`

**Then**
- `exitCode === 0`
- `repo.refs.remotes.origin.develop === hash(D1)` (nouvelle ref de suivi créée)
- `output[0]` contient `"[new branch]"` ou mention de création

### CA-fetch-10 : Fetch multiple branches (toutes)

**Given**
- Repository local vierge
- Distant `origin` avec main (C1), develop (C2), feature (C3)

**When**
- Exécute `git fetch origin`

**Then**
- `exitCode === 0`
- `repo.refs.remotes.origin.main === hash(C1)`
- `repo.refs.remotes.origin.develop === hash(C2)`
- `repo.refs.remotes.origin.feature === hash(C3)`
- `repo.objectStore` contient tous les commits

### CA-fetch-11 : Fetch ne modifie pas HEAD ou branches locales

**Given**
- Repository local sur branche main pointant C1
- Distant `origin` avec main (C2)

**When**
- Exécute `git fetch origin`

**Then**
- `exitCode === 0`
- `HEAD` inchangé (toujours sur main)
- `refs.heads.main === hash(C1)` (inchangé)
- Seule `refs.remotes.origin.main` est mise à jour à C2

### CA-fetch-12 : Snapshot expose remote

**Given**
- Repository local après fetch depuis `origin`

**When**
- Inspecter `snapshot.remotes`

**Then**
- `snapshot.remotes.origin` existe
- `snapshot.remotes.origin.allCommits` contient tous les commits du distant (réutilisable par layout)
- `snapshot.remoteTrackingRefs` contient les décorateurs `origin/main`, etc.

## Décisions de conception (Phase 7)

| Aspect | Décision |
|--------|----------|
| **Objet store distant** | Bare repository en mémoire ; copie d'objets via `copyMissingObjects` |
| **Refs de suivi** | `refs.remotes[remote][branch]` ; ne bougent que via fetch/push/clone |
| **Branches locales** | Jamais modifiées par fetch |
| **Rewind/force** | Accepté sans option `--force` ; fetch n'a pas de protections |
| **Snapshot** | Expose `snapshot.remotes[name]` et `snapshot.remoteTrackingRefs` |
| **Erreur** | Code 128 pour distant/branche inexistante |

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/model.ts` | Ajouter `RemoteRepository`, `refs.remotes`, étendre `Snapshot` avec `remotes`, `remoteTrackingRefs` |
| `src/core/commands/fetch.ts` | Implémenter fetch avec copie d'objets et mise à jour des refs de suivi |
| `src/core/repository.ts` | Helpers : `copyMissingObjects(src, dst)`, `updateRemoteTrackingRef`, optionnel `computeAheadBehind` |
| Tests | Couvrir 36-fetch.md CA-* |
