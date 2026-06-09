# Phase 7 : Modèle distant et `git remote`

## Résumé

La commande `git remote` gère les dépôts distants. Un dépôt distant (remote) est une **version de référence** du projet, accessible via un nom symbolique (`origin` par défaut). Le modèle distant du moteur est immuable : seules les commandes `fetch`/`push`/`clone` le modifient, jamais les commits locaux.

Le moteur expose :
- **`remotes: Record<string, RemoteRepository>`** — chaque remote est un dépôt bare (object store + refs.heads + HEAD)
- **`refs.remotes: Record<remote, Record<branch, hash>>`** — références de suivi local (ex: `origin/main`)
- **`branchUpstream: Record<branchName, { remote, branch }>`** — upstream associée à chaque branche locale

**Variantes de `git remote`** :
- `git remote` : liste les remotes
- `git remote -v` : liste avec URLs symboliques
- `git remote add <nom> <url>` : ajoute un remote
- `git remote remove <nom>` (ou `rm`) : supprime un remote

## Syntaxe

```
git remote [list]
git remote -v
git remote add <name> <url>
git remote remove <name>
git remote rm <name>
```

### Options supportées en Phase 7

| Commande | Argument | Comportement |
|----------|----------|-------------|
| `remote` (ou `remote list`) | (aucun) | Affiche les noms des remotes |
| `remote -v` | (aucun) | Affiche les noms avec URLs |
| `remote add` | `<name> <url>` | Ajoute un remote |
| `remote remove` ou `remote rm` | `<name>` | Supprime un remote |

**Notes Phase 7** :
- L'`<url>` est **symbolique** (cosmétique, pas de réseau réel). Format suggéré : `https://github.com/user/repo.git`
- `git remote show <nom>`, `git remote rename`, `git remote set-url` : NON implémentés Phase 7
- Un remote supprimé entraîne la suppression de ses refs de suivi (`refs/remotes/<remote>/*`)

## Concept : Dépôt distant bare

Un dépôt distant (bare) n'a **ni index ni working tree** — uniquement :
- **Object store** : ensemble d'objets Git (blobs, trees, commits)
- **Refs heads** : branches distantes (`refs.heads`)
- **HEAD** : ref symbolique ou détachée pointant la branche par défaut

```typescript
interface RemoteRepository {
  objectStore: Map<string, GitObject>;
  refs: {
    heads: Record<string, string>;  // branchName → commitHash
  };
  head: Head;  // symbole ou détaché
}
```

Le dépôt local possède une **copie des références distantes** :
```typescript
refs.remotes: Record<remote, Record<branch, hash>>
// Ex: refs.remotes.origin.main = "abc1234hash"
```

## Modèle de données (extensions)

### Repository (extension)

```typescript
export interface Repository {
  // ... champs existants
  
  /** Dépôts distants : nom → RemoteRepository bare */
  remotes?: Record<string, RemoteRepository>;
  
  /** Références de suivi : remote → (branchName → hash) */
  refRemotes?: Record<string, Record<string, string>>;
  
  /** Upstream pour chaque branche locale : branchName → { remote, branch } */
  branchUpstream?: Record<string, { remote: string; branch: string }>;
}

export interface RemoteRepository {
  /** Object store du dépôt distant (bare) */
  objectStore: Map<string, GitObject>;
  
  /** Branches distantes : branchName → commitHash */
  refs: {
    heads: Record<string, string>;
  };
  
  /** HEAD du dépôt distant : symbolic ou detached */
  head: Head;
}
```

### RepoSnapshot (extension)

```typescript
export interface RepoSnapshot {
  // ... champs existants
  
  /** État des dépôts distants (pour le split-screen) */
  remotes?: Record<string, {
    allCommits: SnapshotCommit[];
    heads: Record<string, string>;
    head: Head;
  }>;
  
  /** Références de suivi décorées (pour affichage dans le graphe local) */
  remoteTrackingRefs?: {
    [remote: string]: Record<string, string>;  // branch → hash
  };
  
  /** Indicateurs de synchro par branche locale */
  tracking?: Record<string, {
    upstream?: { remote: string; branch: string };
    ahead?: number;
    behind?: number;
  }>;
}
```

## Comportement nominal

### Cas 1 : Lister les remotes

**Condition** : `git remote` (ou `git remote list`, équivalent)

**Processus** :
1. Récupérer les clés de `repo.remotes`
2. Afficher chaque nom sur une ligne
3. Si aucun remote : aucune sortie, code 0

**Sortie** (exemple) :
```
origin
upstream
```

**Code de sortie** : 0

### Cas 2 : Lister avec URLs

**Condition** : `git remote -v`

**Processus** :
1. Récupérer les remotes
2. Pour chaque remote `name` : afficher `name <url> (fetch)` puis `name <url> (push)`
3. L'URL est stockée (cosmétique) ; défaut : `https://github.com/.../<name>.git`

**Sortie** (exemple) :
```
origin    https://github.com/user/project.git (fetch)
origin    https://github.com/user/project.git (push)
upstream  https://github.com/upstream/project.git (fetch)
upstream  https://github.com/upstream/project.git (push)
```

**Code de sortie** : 0

### Cas 3 : Ajouter un remote

**Condition** : `git remote add origin https://github.com/user/repo.git`

**Processus** :
1. Vérifier que le nom `origin` n'existe pas ; erreur sinon
2. Créer une nouvelle `RemoteRepository` bare (object store vide, refs.heads vide, HEAD par défaut)
3. Stocker l'URL (cosmétique)
4. Ajouter à `repo.remotes[origin]`

**États après** :
- `repo.remotes.origin` = nouvelle RemoteRepository bare
- `repo.refRemotes.origin` = `{}`
- `repo.branchUpstream` inchangé

**Sortie** : Vide

**Code de sortie** : 0

### Cas 4 : Supprimer un remote

**Condition** : `git remote remove origin` (ou `git remote rm origin`)

**Processus** :
1. Vérifier que `origin` existe ; erreur sinon
2. Supprimer `repo.remotes[origin]`
3. Supprimer `repo.refRemotes[origin]`
4. Supprimer les entrées de `repo.branchUpstream` associées à ce remote

**États après** :
- `origin` n'existe plus
- Les branches locales perdent leur upstream si elle pointait ce remote
- Les refs de suivi `origin/*` disparaissent

**Sortie** : Vide

**Code de sortie** : 0

## Cas d'erreur

### Remote déjà existant

**Condition** : `git remote add origin ...` quand `origin` existe déjà

**Message d'erreur** :
```
fatal: remote origin already exists.
```

**Code de sortie** : 128

### Remote inexistant (remove/show)

**Condition** : `git remote remove nosuchremote`

**Message d'erreur** :
```
fatal: No such remote: 'nosuchremote'
```

**Code de sortie** : 128

### Nom invalide

**Condition** : Nom contenant des caractères interdits (ex: `origin/local`, espaces)

**Message d'erreur** :
```
fatal: 'invalid name' is not a valid remote name. Check the 'name' variable in config (does not match '[a-zA-Z0-9._/-]*').
```

**Code de sortie** : 128

## Critères d'acceptation

### CA-remote-01 : Liste vide

**Given**
- Dépôt initialisé, aucun remote

**When**
- Exécute `git remote`

**Then**
- `exitCode === 0`
- `output.length === 0` (aucune ligne)

### CA-remote-02 : Lister un remote

**Given**
- Dépôt avec un remote `origin`

**When**
- Exécute `git remote`

**Then**
- `exitCode === 0`
- `output[0] === "origin"`

### CA-remote-03 : Lister avec -v

**Given**
- Dépôt avec un remote `origin` (URL : `https://github.com/user/repo.git`)

**When**
- Exécute `git remote -v`

**Then**
- `exitCode === 0`
- `output[0]` contient `"origin"` et `"https://github.com/user/repo.git"`
- `output[0]` contient `"(fetch)"`
- Deuxième ligne pour `(push)`

### CA-remote-04 : Ajouter un remote

**Given**
- Dépôt initialisé, aucun remote

**When**
- Exécute `git remote add origin https://github.com/user/repo.git`

**Then**
- `exitCode === 0`
- `repo.remotes['origin']` existe
- `repo.remotes['origin'].objectStore` est vide (bare)
- `repo.remotes['origin'].refs.heads` est vide
- `git remote` liste maintenant `origin`

### CA-remote-05 : Ajouter plusieurs remotes

**Given**
- Dépôt avec `origin`

**When**
- Exécute `git remote add upstream https://github.com/upstream/repo.git`

**Then**
- `exitCode === 0`
- `repo.remotes['upstream']` existe
- `git remote` liste `origin` et `upstream` (ordre indéfini, mais tous deux présents)

### CA-remote-06 : Erreur remote existant

**Given**
- Dépôt avec `origin`

**When**
- Exécute `git remote add origin https://other.git`

**Then**
- `exitCode === 128`
- `errors[0]` contient `"already exists"`
- Aucune modification à `repo.remotes`

### CA-remote-07 : Supprimer un remote

**Given**
- Dépôt avec `origin` et `upstream`

**When**
- Exécute `git remote remove origin`

**Then**
- `exitCode === 0`
- `repo.remotes['origin']` supprimé
- `repo.refRemotes['origin']` supprimé
- `git remote` liste uniquement `upstream`

### CA-remote-08 : Erreur suppression inexistant

**Given**
- Dépôt sans remote `nosuchremote`

**When**
- Exécute `git remote remove nosuchremote`

**Then**
- `exitCode === 128`
- `errors[0]` contient `"No such remote"`

### CA-remote-09 : Alias `rm`

**Given**
- Dépôt avec `origin`

**When**
- Exécute `git remote rm origin`

**Then**
- Comportement identique à `git remote remove origin`
- `exitCode === 0`
- `origin` supprimé

### CA-remote-10 : Snapshot expose remotes

**Given**
- Dépôt avec `origin` contenant des commits

**When**
- Appel `repo.snapshot()`

**Then**
- `snapshot.remotes` existe
- `snapshot.remotes.origin` expose `allCommits`, `heads`, `head`
- Les commits du remote sont accessibles via `snapshot.remotes.origin.allCommits`

### CA-remote-11 : Upstream posé par add + clone

**Given**
- Dépôt après `git clone` (Phase 8)

**When**
- Vérifie `repo.branchUpstream`

**Then**
- `repo.branchUpstream[localBranchName] === { remote: 'origin', branch: 'main' }` (ou branche par défaut)

### CA-remote-12 : Suppression d'upstream si remote supprimé

**Given**
- Dépôt avec branche `feature` upstream sur `origin/develop`

**When**
- Exécute `git remote remove origin`

**Then**
- `repo.branchUpstream['feature']` est supprimé
- Branche `feature` n'a plus d'upstream

## Décisions de conception (Phase 7)

| Aspect | Décision |
|--------|----------|
| **Nature du remote** | Bare repository (object store + refs.heads + HEAD) ; pas d'index ni working tree |
| **URL** | Stockée cosmétiquement ; pas de réseau réel, `fetch`/`push` = copie d'objets |
| **Copie d'objets** | Via helper `copyMissingObjects(src, dst)` — seuls les objets manquants copiés |
| **Refs de suivi** | `refs.remotes.<remote>.<branch>` stockées dans `refRemotes` ; mises à jour uniquement par fetch/push |
| **Noms de remotes** | Alphanumériques + `.` `/` `-` ; `origin` réservé conventionnellement (mais pas forcé) |
| **Suppression** | Entraîne suppression des refs de suivi et des upstreams dépendants |
| **Plusieurs remotes** | Supportés (ex: `origin` + `upstream`) |

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/model.ts` | Ajouter `RemoteRepository`, étendre `Repository` avec `remotes`, `refRemotes`, `branchUpstream` |
| `src/core/repository.ts` | Helpers : `copyMissingObjects(src, dst)`, `updateRemoteTrackingRef`, `validateRemoteName` |
| `src/core/commands/remote.ts` | **Nouveau fichier** : implémenter `cmdRemote` (list/add/remove) |
| `src/core/engine.ts` | Route `remote` vers les handlers |
| Tests | Couvrir `34-remote-model.md` CA-* |
