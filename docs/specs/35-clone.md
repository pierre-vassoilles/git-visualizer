# Phase 7 : git clone

## Résumé

La commande `git clone` crée un nouveau dépôt local en copiant un dépôt distant prédéfini. Sans réseau réel, `clone` :
1. Initialise un nouveau dépôt local
2. Crée un remote `origin` pointant vers le dépôt source
3. Copie tous les objets du distant
4. Pose les refs de suivi `origin/*` depuis les branches distantes
5. Crée une branche locale par défaut (typiquement `main` ou `master`) et l'upstream
6. Positionne HEAD et checkout le working tree

**Variantes** :
- `git clone <source>` : clone standard (branche par défaut)

## Syntaxe

```
git clone <source>
```

### Arguments supportés en Phase 7

| Argument | Valeur | Comportement | Exemple |
|----------|--------|-----------|---------|
| `<source>` | Nom de dépôt prédéfini | Clone ce dépôt distant préexistant | `git clone public-repo` |

**Notes Phase 7** :
- `<source>` est un **nom symbolique** de dépôt prédéfini (pas d'URL ni de chemin filesystem). Voir section « Dépôts source prédéfinis » ci-dessous
- `git clone <url> <directory>`, `--depth`, `--branch`, `--single-branch`, etc. : NON implémentés Phase 7

## Concept : Dépôts source prédéfinis

Clone ne réseau pas réel. À la place, le moteur expose un **catalogue de dépôts distants pédagogiques** prédéfinis en mémoire. Chaque dépôt prédéfini est une `RemoteRepository` complète (object store + branches + HEAD).

Les dépôts source sont **réutilisables** : le même source peut être cloné plusieurs fois, chaque clone crée un dépôt local indépendant.

### Catalogue Phase 7 (exemples suggérés)

**`public-repo`** (dépôt public simple) :
- Branche par défaut : `main`
- Commits : C0 (initial) ← C1 (add file1) ← C2 (add file2)
- HEAD : `refs/heads/main` → C2

**`collab-repo`** (dépôt avec branches)
- Branche par défaut : `main`
- Commits : C0 ← C1 ← C2 (main) ; C0 ← C3 ← C4 (develop)
- HEAD : `refs/heads/main` → C2
- Branches : `main`, `develop`, `feature/x` (optionnel)

Le catalogue peut s'étendre en Phase 8+ (collaboration simulée, etc.).

### Implémentation du catalogue

Stocker dans `src/constants/` (ou une structure similaire) :

```typescript
export const PREDEFINED_REMOTES: Record<string, RemoteRepository> = {
  'public-repo': {
    objectStore: [...],
    refs: { heads: { main: hash(C2), ... } },
    head: { symbolic: true, target: 'refs/heads/main' }
  },
  'collab-repo': {
    // ...
  }
};
```

Quand l'utilisateur exécute `git clone public-repo`, le moteur **copie** ce remote dans le nouveau dépôt local.

## Comportement nominal

### Cas 1 : Clone simple (dépôt à une branche)

**Condition** : 
- Utilisateur exécute `git clone public-repo` dans un dépôt vide (pas d'init préalable)
- `public-repo` existe et contient : branche `main` → C2 (HEAD par défaut)

**Processus** :
1. Initialiser un nouveau `Repository` (comme `git init`)
2. Créer un remote `origin` pointant vers `public-repo`
3. Copier **tous les objets** de `public-repo` vers `repo.objectStore` (via `copyMissingObjects`)
4. Copier toutes les branches distantes :
   - Pour chaque branche X dans `origin.refs.heads` : poser `repo.refRemotes.origin[X] = hash(X)`
5. Déterminer la **branche par défaut** : récupérer `origin.head`
   - Si symbolique : utiliser le nom de la branche (ex: `main`)
   - Si détachée : utiliser la première branche alphabétiquement (fallback)
6. **Créer une branche locale** avec le même nom que la branche par défaut
   - `repo.refs.heads[branchName] = hash(branchTip)`
   - Poser l'upstream : `repo.branchUpstream[branchName] = { remote: 'origin', branch: branchName }`
7. **Positionner HEAD** sur la nouvelle branche :
   - `repo.head = { symbolic: true, target: 'refs/heads/' + branchName }`
8. **Remplir l'index** depuis l'arbre de la branche (comme `git checkout`)
9. **Remplir le working tree** depuis l'index

**État après** :
- `repo.remotes.origin` = copie de `public-repo`
- `repo.refRemotes.origin[main]` = hash(C2)
- `repo.refs.heads[main]` = hash(C2)
- `repo.branchUpstream[main]` = `{ remote: 'origin', branch: 'main' }`
- `repo.head.symbolic === true`, `repo.head.target === 'refs/heads/main'`
- Index et working tree alignés sur C2

**Sortie** (exemple) :
```
Cloning into 'local-copy'...
remote: Enumerating objects: 3, done.
remote: Counting objects: 100% (3/3), done.
remote: Compressing objects: 100% (1/1), done.
Receiving objects: 100% (3/3), 1.2 KB | 1.2 MB/s, done.
```

(Phase 7 : format simplifié acceptable, ex: juste `"Cloning into '...'\nDone."`)

**Code de sortie** : 0

### Cas 2 : Clone d'un dépôt avec plusieurs branches

**Condition** :
- `git clone collab-repo`
- `collab-repo` contient : branche `main` (C2), branche `develop` (C4)
- HEAD par défaut : `main`

**Processus** :
1. Initialiser le dépôt local
2. Copier tous les objets
3. Poser les refs de suivi :
   - `repo.refRemotes.origin[main] = hash(C2)`
   - `repo.refRemotes.origin[develop] = hash(C4)`
4. Créer la branche locale `main` (par défaut)
5. Poser l'upstream pour `main` : `{ remote: 'origin', branch: 'main' }`
6. HEAD sur `main`, checkout en C2

**État après** :
- Branche `main` locale pointe C2 (tracked par `origin/main`)
- Branche `develop` distante accessible via `repo.refRemotes.origin['develop']`
- Utilisateur peut plus tard : `git checkout develop` (crée branche locale avec upstream)
- Index/WT alignés sur C2

**Sortie** : Similaire au cas 1

**Code de sortie** : 0

### Cas 3 : Clone avec HEAD détachée (dépôt orphelin)

**Condition** :
- `git clone weird-repo`
- `weird-repo.head.symbolic === false` (HEAD détachée), `weird-repo.head.target = "abc123hash"`

**Processus** :
1. Copier les objets et refs
2. HEAD reste détachée : `repo.head = { symbolic: false, target: 'abc123hash' }`
3. Pas de branche locale créée
4. Index/WT alignés sur le commit de HEAD détachée

**État après** :
- Aucune branche locale
- HEAD détachée sur le hash
- Avertissement optionnel : `"Note: you are in 'detached HEAD' state."`

**Code de sortie** : 0

### Cas 4 : Clone dans un dépôt déjà existant

**Condition** :
- Exécuter `git clone public-repo` alors qu'un dépôt est déjà initialisé

**Processus** : Refuser l'opération (le dépôt courant doit être vide)

**Message d'erreur** :
```
fatal: destination path '.' already exists and is not an empty directory.
```

**Code de sortie** : 128

**Comportement** : Aucune modification au dépôt existant

## Cas d'erreur

### Source inexistante

**Condition** : `git clone nosuchrepo`

**Message d'erreur** :
```
fatal: repository 'nosuchrepo' not found
```

**Code de sortie** : 128

### Dépôt courant non vide

**Condition** : Dépôt initialisé, puis tentative de clone

**Message d'erreur** :
```
fatal: destination path '.' already exists and is not an empty directory.
```

**Code de sortie** : 128

### Source avec zéro branches

**Condition** : (Cas extrême) `clone` d'un dépôt bare sans aucune branche

**Comportement** :
- Copier les objets
- Aucune branche locale créée
- HEAD détachée (fallback)
- Avertissement : `"warning: You appear to have cloned an empty repository."`

**Code de sortie** : 0

## Critères d'acceptation

### CA-clone-01 : Clone simple

**Given**
- Dépôt source `public-repo` : branche `main` → C2 (HEAD), 3 commits

**When**
- Exécute `git clone public-repo`

**Then**
- `exitCode === 0`
- Nouveau dépôt local initialisé
- `repo.remotes['origin']` existe et contient copie de `public-repo`
- `repo.refRemotes.origin['main'] === hash(C2)`
- Branche locale `main` créée, `repo.refs.heads['main'] === hash(C2)`
- `repo.branchUpstream['main'] === { remote: 'origin', branch: 'main' }`
- `repo.head === { symbolic: true, target: 'refs/heads/main' }`
- Index et working tree alignés sur C2
- Tous les 3 commits accessibles

### CA-clone-02 : Clone avec plusieurs branches

**Given**
- Source `collab-repo` : branches `main` (C2) et `develop` (C4)

**When**
- Exécute `git clone collab-repo`

**Then**
- `exitCode === 0`
- `repo.refRemotes.origin['main'] === hash(C2)`
- `repo.refRemotes.origin['develop'] === hash(C4)`
- Branche locale `main` créée (branche par défaut)
- Branche locale `develop` PAS créée (distante uniquement, utilisateur peut `checkout develop` plus tard)
- `repo.branchUpstream['main'] === { remote: 'origin', branch: 'main' }`
- HEAD sur `main`, WT aligné sur C2

### CA-clone-03 : Objets copiés correctement

**Given**
- Source avec commits C0, C1, C2 (6 fichiers, 3 blobs, 3 trees)

**When**
- Exécute `git clone <source>`

**Then**
- `repo.objectStore` contient exactement les 6 objets (blobs/trees/commits)
- Les hashes des objets sont identiques entre source et local (copie bit-exact du contenu canonique)

### CA-clone-04 : Upstream posé correctement

**Given**
- Clone de `public-repo` (branche par défaut `main`)

**When**
- Appel `git branch -vv` (affiche upstream)

**Then**
- Branche `main` affiche upstream : `[origin/main]`

### CA-clone-05 : HEAD détachée dans source

**Given**
- Source `weird-repo` avec HEAD détachée sur `abc123`

**When**
- Exécute `git clone weird-repo`

**Then**
- `exitCode === 0`
- `repo.head.symbolic === false`, `repo.head.target === 'abc123'`
- Aucune branche locale créée
- Avertissement optionnel sur HEAD détachée

### CA-clone-06 : Erreur source inexistante

**Given**
- Aucune source `nosuchrepo`

**When**
- Exécute `git clone nosuchrepo`

**Then**
- `exitCode === 128`
- `errors[0]` contient `"not found"`
- Aucun dépôt créé

### CA-clone-07 : Erreur dépôt non vide

**Given**
- Dépôt déjà initialisé (avec commits)

**When**
- Exécute `git clone public-repo`

**Then**
- `exitCode === 128`
- `errors[0]` contient `"already exists"`
- Aucune modification au dépôt courant

### CA-clone-08 : Snapshot expose origin

**Given**
- Dépôt cloné de `public-repo`

**When**
- Appel `repo.snapshot()`

**Then**
- `snapshot.remotes['origin']` expose commits du distant
- `snapshot.remoteTrackingRefs.origin['main'] === hash(C2)`

### CA-clone-09 : Commits accessibles via `git log`

**Given**
- Dépôt cloné

**When**
- Exécute `git log --oneline`

**Then**
- `exitCode === 0`
- Affiche tous les commits depuis HEAD de la branche (C2, C1, C0 pour `public-repo`)
- Hashes courts identiques entre local et distant

### CA-clone-10 : Graphe complet visible

**Given**
- Dépôt cloné de `collab-repo` (2 branches divergentes)

**When**
- Appel `snapshot.allCommits` (tous les commits accessibles)

**Then**
- Liste contient C0, C1, C2, C3, C4 (5 commits)
- Deux branches visibles dans le graphe
- Arête entre C0 et C1, C0 et C3, etc.

### CA-clone-11 : Branche par défaut respectée

**Given**
- Source avec HEAD : `refs/heads/develop`

**When**
- Exécute `git clone <source>`

**Then**
- Branche locale créée : `develop`
- HEAD sur `develop`
- Branche `main` accessible en tant que `origin/main` (ref de suivi) mais pas branche locale

### CA-clone-12 : Index et WT synchronisés

**Given**
- Dépôt cloné de `public-repo` (C2 = main avec fichiers file1, file2)

**When**
- Appel `repo.index` et `repo.workingTree`

**Then**
- `repo.index` contient les deux fichiers (alignés sur C2)
- `repo.workingTree` contient les deux fichiers avec même contenu
- `git status` retourne `"nothing to commit, working tree clean"`

## Dépôts source prédéfinis (implémentation)

### Structure de stockage

```typescript
// src/constants/predefinedRemotes.ts

export interface PredefinedRemote {
  name: string;
  title: string;
  description: string;
  remote: RemoteRepository;
}

export const PREDEFINED_REMOTES: PredefinedRemote[] = [
  {
    name: 'public-repo',
    title: 'Dépôt Public Simple',
    description: 'Dépôt avec une branche main et 3 commits linéaires.',
    remote: { /* RemoteRepository complète */ }
  },
  {
    name: 'collab-repo',
    title: 'Dépôt avec Branches',
    description: 'Dépôt avec branches main et develop divergentes.',
    remote: { /* RemoteRepository complète */ }
  }
];
```

### Lookup dans clone

```typescript
function cmdClone(repo: Repository, args: string[]): CommandResult {
  const source = args[0];
  const predefined = PREDEFINED_REMOTES.find(p => p.name === source);
  
  if (!predefined) {
    return fail([`fatal: repository '${source}' not found`]);
  }
  
  // Initialiser, copier, poser refs, etc.
}
```

## Décisions de conception (Phase 7)

| Aspect | Décision |
|--------|----------|
| **Source** | Nom symbolique de dépôt prédéfini (pas d'URL) |
| **Copie d'objets** | Complète (tous les objets du distant) |
| **Branche par défaut** | Depuis `origin.head.symbolic` et `target` ; fallback alphabétique |
| **Branche locale** | Une seule branche créée (branche par défaut) ; autres accessibles en tant que refs distantes |
| **Upstream** | Automatiquement posé pour la branche locale vers `origin/<same-name>` |
| **Dépôt courant** | Clone refuse si dépôt non vide (pas de sous-répertoire) |
| **Index/WT** | Initialisés et checkoutés à la branche par défaut |

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/constants/predefinedRemotes.ts` | **Nouveau fichier** : catalogue des dépôts source prédéfinis |
| `src/core/commands/clone.ts` | **Nouveau fichier** : implémenter `cmdClone` |
| `src/core/engine.ts` | Route `clone` vers le handler |
| `src/core/repository.ts` | Helpers : `copyMissingObjects`, `getBranchDefault` (détermine branche par défaut) |
| Tests | Couvrir `35-clone.md` CA-* |

## Notes d'implémentation

### Copie d'objets

```typescript
function copyMissingObjects(
  source: RemoteRepository,
  destination: Repository
): void {
  for (const [hash, obj] of source.objectStore) {
    if (!destination.objectStore.has(hash)) {
      destination.objectStore.set(hash, obj);
    }
  }
}
```

### Branche par défaut

```typescript
function getBranchDefault(remote: RemoteRepository): string | null {
  if (remote.head.symbolic) {
    // Extraire le nom de branche de "refs/heads/main"
    const match = remote.head.target.match(/refs\/heads\/(.+)/);
    return match ? match[1] : null;
  }
  // HEAD détachée : fallback à première branche alphabétiquement
  const branches = Object.keys(remote.refs.heads);
  return branches.length > 0 ? branches.sort()[0] : null;
}
```

## Impact sur Phase 8+

- **`git fetch`** : reçoit les branches distantes, met à jour `refRemotes` et `remotes[origin].refs`
- **`git push`** : envoie vers le distant, met à jour `remotes[origin]` et `refRemotes`
- **`git pull`** : combinaison de fetch + merge/rebase
- **Split-screen** : affiche le graphe du distant côté droit (consomme `snapshot.remotes.origin.allCommits`)
