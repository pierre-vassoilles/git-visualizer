# Phase 2 : Résumé Exécutif pour l'Orchestrateur

## Vue d'ensemble

La Phase 2 implémente les branche et la navigation (checkout/switch), ainsi que la tagging. Le périmètre est volontairement limité à branches et refs ; les opérations de fusion et réécriture d'historique viennent en Phase 4+.

**Commandes implémentées** :
1. `git branch` : lister, créer, supprimer branches
2. `git checkout` : basculer vers branche ou commit détaché, créer + basculer, revenir à la branche d'avant
3. `git switch` : variante moderne de checkout (branches/détachement)
4. `git restore` : restaurer fichiers depuis l'index ou un commit
5. `git tag` : lister, créer (tags légers), supprimer tags

## Décisions structurantes critiques

### 1. HEAD détaché : Représentation interne

**Décision** :
```typescript
// Mode symbolique (sur une branche)
head: { symbolic: true, target: "refs/heads/main" }

// Mode détaché (sur un commit)
head: { symbolic: false, target: "abc123def456..." }
```

**Implications** :
- `headCommitHash(repo)` :
  - Si `symbolic = true` : récupérer le hash via `currentBranch()` et `refs.heads[branch]`
  - Si `symbolic = false` : retourner directement `HEAD.target`
- `currentBranch(repo)` : retourner `null` si HEAD est détaché
- Snapshots : exposer `head: { type: 'branch', name: '...' } | { type: 'detached', hash: '...' }`

**Tests clés** :
- Vérifier que `symbolic = false` + hash détaché est stockable et récupérable
- Vérifier que les commandes gérant HEAD gèrent les deux modes (symbolique et détaché)

### 2. Historique de branche précédente (`prevBranch`)

**Décision** : Ajouter un champ `prevBranch?: string | null` à `Repository`.

**Règles** :
- À chaque basculement symbolique (checkout/switch vers une branche) :
  - Si HEAD était sur une branche, sauvegarder le nom de cette branche dans `prevBranch`
  - Mettre à jour HEAD vers la nouvelle branche
  - `prevBranch` permet `git checkout -` / `git switch -`
- Si HEAD est détaché : `prevBranch` conserve la dernière branche symbolique connue (Option A du spec)
- Si jamais eu de branche précédente (ex. dépôt tout nouveau), `prevBranch = null`

**Implications** :
- Helper : `getPrevBranch(repo): string | null`
- Helper : `setPrevBranch(repo, name: string | null): void`
- Lors d'un changement de HEAD, invoquer `setPrevBranch()` pour mettre à jour

**Tests clés** :
- `checkout main` → `checkout feature` → `checkout -` revient à `main`
- `checkout main` → `checkout abc123 (detached)` → `checkout -` revient à `main` (prevBranch conservé)

### 3. Index lors d'un changement de HEAD

**Décision** : L'index est **remplacé intégralement** avec l'arbre du nouveau commit.

**Comportement** :
```
git checkout feature
// Ancien index → supprimé
// Nouvel index = snapshot complet de l'arbre de feature
```

**Invariant** : Après un `checkout`, `index` et `workingTree` reflètent tous deux l'arbre du nouveau commit (sauf si des changements locaux sont refusés).

**Sécurité** :
- Avant de changer HEAD, vérifier que le working tree ne contient pas de modifications non stagées qui seraient écrasées
- Message exact Git : `"error: Your local changes to the following files would be overwritten by checkout:"`
- Si refus : aucune modification à HEAD, index, ou working tree

**Implications** :
- Fonction helper : `canCheckoutWithoutDataLoss(repo, newHeadHash): boolean`
- Lors du checkout, appeler cette fonction avant de changer HEAD
- En cas d'erreur, retourner `fail([message])` sans modifier l'état

**Tests clés** :
- Checkout avec working tree propre → réussit
- Checkout avec fichier modifié mais pas dans l'arbre cible → réussit (pas d'écrasement)
- Checkout avec fichier modifié ET dans l'arbre cible avec contenu différent → échoue

### 4. Branche vide (sans commits)

**Décision** : Une branche peut exister avec `refs.heads[name] = ""` (vide).

**Cas** :
```
git init                  // HEAD → refs/heads/main, main = ""
git branch feature        // feature = ""
# Les deux branches existent mais sont vides

git add file.txt && git commit -m "..."
# main = "abc123...", feature still ""

git checkout feature      // HEAD → refs/heads/feature, index/working tree inchangés (rester comme avant)
```

**Invariants** :
- Une branche vide n'a pas de commit associé
- `headCommitHash(repo)` retourne `null` pour une branche vide
- `checkout` vers une branche vide est autorisé
- Un commit sur une branche vide n'entraîne pas d'erreur ; il crée le premier commit

**Tests clés** :
- Créer une branche sur dépôt vierge
- Checkout vers une branche vide
- Ajouter et committer sur une branche vide

### 5. Tags et réfs.tags

**Décision** : Tags légers uniquement en Phase 2. Structure :
```typescript
refs.tags = {
  "v1.0": "abc123...",
  "release": "def456..."
}
```

**Pas de limitation** :
- Un commit peut avoir plusieurs tags
- Un tag pointe toujours vers un commit (pas de tags cycliques ou invalides)
- Tags et branches sont indépendants

**Implications** :
- Snapshot inclut `tags: Record<string, string>` et `SnapshotCommit.tags: string[]`
- Graphe (Phase 3) peut afficher les tags aux côtés des branches

**Tests clés** :
- Créer et lister des tags
- Supprimer des tags
- Créer un tag sur un commit spécifique

### 6. Sécurité : Refus de changement destructif

**Règle générale** : Les opérations qui pourraient perdre des changements locaux sont refusées avec un message clair.

**Cas couverts en Phase 2** :
- `checkout <branche>` si working tree contient des changements non stagés écrasables
- `switch <branche>` : idem

**Cas couverts mais hors Phase 2** :
- `git reset --hard` (Phase 4+)
- `git rebase` (Phase 5+)

**Détection** :
- Comparer `workingTree[path]` vs `index[path]` pour chaque fichier
- Si différents et le nouveau HEAD aurait un contenu différent pour ce fichier → refus

## Changements au modèle de données

### Repository (src/core/model.ts)

**Avant (Phase 1)** :
```typescript
type Repository = {
  objects: { [hash: string]: Blob | Tree | Commit },
  refs: {
    heads: { [branchName: string]: string }
  },
  head: { symbolic: boolean, target: string },
  index: Index,
  workingTree: WorkingTree,
  commitCount: number
}
```

**Après (Phase 2)** :
```typescript
type Repository = {
  objects: { [hash: string]: Blob | Tree | Commit },
  refs: {
    heads: { [branchName: string]: string },     // valeur = hash ou ""
    tags: { [tagName: string]: string }          // NOUVEAU
  },
  head: { symbolic: boolean, target: string },   // inchangé en structure
  index: Index,
  workingTree: WorkingTree,
  commitCount: number,
  prevBranch: string | null                      // NOUVEAU
}
```

### RepoSnapshot (src/core/engine.ts)

**Avant** :
```typescript
export interface RepoSnapshot {
  initialized: boolean,
  branches: Record<string, string>,
  head: { type: 'branch'; name: string } | { type: 'detached'; hash: string },
  commits: SnapshotCommit[],
  indexPaths: string[],
  files: SnapshotFile[]
}

export interface SnapshotCommit {
  hash: string,
  shortHash: string,
  message: string,
  parents: string[],
  branches: string[]
}
```

**Après** :
```typescript
export interface RepoSnapshot {
  initialized: boolean,
  branches: Record<string, string>,
  head: { type: 'branch'; name: string } | { type: 'detached'; hash: string },
  commits: SnapshotCommit[],
  tags: Record<string, string>,                  // NOUVEAU
  indexPaths: string[],
  files: SnapshotFile[]
}

export interface SnapshotCommit {
  hash: string,
  shortHash: string,
  message: string,
  parents: string[],
  branches: string[],
  tags: string[]                                 // NOUVEAU
}
```

### Helpers à ajouter dans repository.ts

```typescript
export function getTags(repo: Repository): Record<string, string>
export function getBranches(repo: Repository): Record<string, string>
export function branchExists(repo: Repository, name: string): boolean
export function tagExists(repo: Repository, name: string): boolean
export function isHeadDetached(repo: Repository): boolean
export function getPrevBranch(repo: Repository): string | null
export function setPrevBranch(repo: Repository, name: string | null): void

// Détection de conflits avec working tree
export function canCheckoutWithoutDataLoss(repo: Repository, newHeadHash: string): boolean

// Résolution de hash (court → long)
export function resolveCommitHash(repo: Repository, shortOrFull: string): string | null

// Déterminer si une branche a changé depuis un commit (pour delete -d)
export function isBranchMerged(repo: Repository, branchName: string, parentHash?: string): boolean
```

## Fichiers à créer/modifier

### Création

| Fichier | Type | Contenu |
|---------|------|---------|
| `src/core/commands/branch.ts` | Commande | `git branch` |
| `src/core/commands/checkout.ts` | Commande | `git checkout` |
| `src/core/commands/switch.ts` | Commande | `git switch` |
| `src/core/commands/restore.ts` | Commande | `git restore` |
| `src/core/commands/tag.ts` | Commande | `git tag` |

### Modification

| Fichier | Changements |
|---------|------------|
| `src/core/model.ts` | Ajouter `prevBranch` et `refs.tags` |
| `src/core/repository.ts` | Ajouter helpers Phase 2 |
| `src/core/engine.ts` | Adapter `snapshot()` pour tags et branche détachée |
| `src/core/parser.ts` | Dispatcher pour les 5 nouvelles commandes |
| `src/core/repository.ts` (createEmptyRepo) | Initialiser `prevBranch = null`, `refs.tags = {}` |

## Ordre de développement recommandé

1. **Modèle de données** (model.ts, repository.ts helpers)
2. **Engine snapshot** : adapter pour HEAD détaché et tags
3. **`git branch`** : fondations, lister, créer, supprimer
4. **`git checkout`** : dépend de branch, gère HEAD et index
5. **`git switch`** : wrapper/variant de checkout
6. **`git restore`** : restauration de fichiers (indépendant des autres)
7. **`git tag`** : gestion des tags (indépendant des autres)
8. **Tests** : depuis les critères d'acceptation de chaque spec

## Points d'attention pour QA

### Invariants critiques à vérifier

1. **Cohérence de HEAD** : `HEAD.symbolic=true` implique `HEAD.target` en `refs/heads/`, et vice versa
2. **Branches et commits** : `refs.heads[name]` ne contient que des hashes valides ou `""`
3. **Tags et commits** : `refs.tags[name]` contient toujours un hash de commit existant
4. **prevBranch valide** : `prevBranch = null` ou nom d'une branche existante (optionnel : peut être invalide si branche supprimée après)
5. **Index et working tree alignés** : Après un checkout sans erreur, les deux reflètent l'arbre du nouveau commit

### Tests de régression Phase 1

- `git init`, `git add`, `git status`, `git commit`, `git log` : doivent continuer de fonctionner
- Les hashes de commits doivent rester déterministes et inchangés

### Tests d'intégration Phase 2

- Workflows complets :
  - Créer branche, ajouter fichiers, committer, checkout vers autre branche → revenir
  - Créer tag sur un commit, checkout sur un autre commit, puis basculer d'une branche à une autre
  - HEAD détaché → créer un tag → basculer vers une branche
  - Fichier modifié → refus de checkout

### Performance

- Pas d'attente spéciale en Phase 2 : les données tiennent en mémoire
- Snapshot doit être rapide même avec beaucoup de commits (trier alphabétiquement pour tags/branches, pas de scan répété)

## Livrables Phase 2

### Specs (docs/specs/)

- `09-model-phase2.md` : Évolutions du modèle
- `10-branch.md` : `git branch`
- `11-checkout.md` : `git checkout`
- `12-switch.md` : `git switch`
- `13-restore.md` : `git restore`
- `14-tag.md` : `git tag`

### Code (src/core/)

- Modèle et helpers mis à jour
- 5 modules de commandes
- Parser mis à jour
- Engine snapshot mis à jour
- Tests Vitest complets (5 fichiers, ~150 tests estimés)

### Documentation utilisateur (docs/)

- `USAGE.md` : sections branch, checkout, switch, restore, tag
- `CLAUDE.md` : update si nécessaire

## Critères d'acceptation Phase 2

- **Build** : `npm run build` succès
- **Tests** : `npm test` 100% vert, couvrant tous les critères d'acceptation des specs
- **Regression** : Tous les tests Phase 1 continuent de passer
- **Specs conformité** : Chaque commande implémente tous les cas nominaux et erreurs de sa spec
- **Invariants** : Vérifier que les invariants du modèle sont maintenus après chaque opération

