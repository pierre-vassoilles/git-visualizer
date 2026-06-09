# Phase 2 : Évolutions du Modèle de Données

## Vue d'ensemble

Cette phase introduit des concepts clés omis en Phase 1 :
- **HEAD détaché** : capacité de HEAD à pointer directement sur un commit au lieu de pointer sur une branche
- **Branches multiples** : création, suppression, listage de branches indépendantes
- **Tags** : étiquettes nommées attachées à des commits
- **Navigation entre branches** : switching HEAD entre branches et états détachés
- **Historique de branche précédente** : support de `checkout -` (revenir à la branche d'avant)

Toutes les évolutions respectent les invariants définis en Phase 1.

## Récapitulatif des changements au modèle de Repository

### 1. Extension de `refs`

En Phase 1, seul `refs.heads` existait. Phase 2 ajoute les tags et prépare la structure pour les phases futures.

```typescript
type Repository = {
  objects: { [hash: string]: Blob | Tree | Commit },
  refs: {
    heads: { [branchName: string]: string },  // hash du commit, ou "" si branche sans commit
    tags: { [tagName: string]: string }       // hash du commit (NOUVEAU Phase 2)
  },
  head: { symbolic: boolean, target: string },
  index: Index,
  workingTree: WorkingTree,
  commitCount: number,
  // NOUVEAU Phase 2 :
  prevBranch: string | null  // nom de la branche précédente (pour checkout -)
}
```

### 2. HEAD détaché

**En Phase 1** : `HEAD.symbolic` est toujours `true`, `HEAD.target` = `"refs/heads/main"`.

**En Phase 2** :
- `HEAD.symbolic === true` + `HEAD.target === "refs/heads/<nom>"` : mode symbolique normal (sur une branche)
- `HEAD.symbolic === false` + `HEAD.target === "<hash>"` : mode détaché (directement sur un commit)

Exemple :
```typescript
// Mode symbolique (branche main)
head: { symbolic: true, target: "refs/heads/main" }

// Mode détaché (commit abc123...)
head: { symbolic: false, target: "abc123def456..." }
```

**Invariants** :
- Si `HEAD.symbolic === false`, alors `HEAD.target` doit être un hash de commit valide dans `objects`
- Si `HEAD.symbolic === true`, alors `HEAD.target` doit être de la forme `"refs/heads/<nom>"` et exister dans `refs.heads`

### 3. Branches sans commits

En Phase 1, une branche est créée après le premier commit. En Phase 2, `git branch <nom>` crée une branche même sans commits.

```typescript
refs.heads = {
  main: "",           // branche vide (n'existe que si elle a été explicitement créée)
  feature: "abc123..."  // branche avec commits
}
```

Une branche "vide" (`ref.heads[name] === ""`) existe mais `headCommitHash()` retourne `null` pour elle.

### 4. Tags (Phase 2, scope minimal)

```typescript
refs.tags = {
  "v1.0": "abc123...",
  "release": "def456..."
}
```

En Phase 2, seuls les tags **légers** (pointeurs simples sur des commits) sont implémentés. Les tags annotés (objets avec métadonnées) viennent plus tard.

### 5. Historique de branche précédente (`prevBranch`)

Pour supporter `git checkout -` (revenir à la branche d'avant) :

```typescript
prevBranch: "main" | null
```

Après chaque changement de HEAD symbolique (via `git checkout <branche>`), sauvegarder le nom de l'ancienne branche :
- Si HEAD passait d'une branche à une autre, mettre à jour `prevBranch` vers l'ancien nom
- Si HEAD est détaché ou était détaché, `prevBranch` peut rester `null` ou être utilisé différemment (voir specs checkout)

## Changements au RepoSnapshot

Le snapshot doit être enrichi pour permettre au graphe (Phase 3) d'afficher branches, tags, et état de HEAD.

### Nouvelle structure (engine.ts)

```typescript
export interface RepoSnapshot {
  readonly initialized: boolean;
  readonly branches: Record<string, string>;  // branchName → hash (ou "")
  readonly head:
    | { readonly type: 'branch'; readonly name: string }
    | { readonly type: 'detached'; readonly hash: string };
  readonly commits: SnapshotCommit[];
  readonly tags: Record<string, string>;      // NOUVEAU : tagName → hash
  readonly indexPaths: string[];
  readonly files: SnapshotFile[];
}

export interface SnapshotCommit {
  readonly hash: string;
  readonly shortHash: string;
  readonly message: string;
  readonly parents: string[];
  readonly branches: string[];      // existait en Phase 1
  readonly tags: string[];          // NOUVEAU : tags pointant sur ce commit
}
```

### Calcul du snapshot

Adaptation de `engine.snapshot()` :
1. **Branches** : Parcourir `repo.refs.heads`, inclure même les branches vides
2. **HEAD** : Créer un objet avec `type: 'branch' | 'detached'` et les données correspondantes
3. **Tags** : Parcourir `repo.refs.tags` et construire une map `hash → tags[]` (comme pour les branches)
4. **SnapshotCommit.tags** : Pour chaque commit, lister les tags dont le target = ce commit

## Invariants mis à jour

| Invariant | Décision |
|-----------|----------|
| **Chaque objet type** | Idem Phase 1 : blobs, trees, commits immuables |
| **HEAD cohérent** | Si `symbolic = true`, `target` ∈ `refs/heads/` ; si `false`, `target` ∈ `objects` |
| **Branches sans commits** | `refs.heads[name]` peut être `""` (branche existe mais vide) |
| **Tags valides** | `refs.tags[name]` doit pointer vers un commit existant dans `objects` |
| **prevBranch** | Valeur `null` ou nom de branche existant dans `refs.heads` (ou absent si jamais changé) |
| **Immuabilité des refs** | Comme Phase 1 : seules les valeurs de refs mutent |
| **Pas de cycles** | Les commits restent un DAG ; branches et tags ne créent pas de cycles |

## Cas limites à gérer

### 1. Création d'une branche sur un dépôt vierge (pas encore de commits)

```bash
git init
git branch feature
# feature crée avec ""
```

Comportement : La branche existe dans `refs.heads` mais reste vide. Si l'utilisateur fait `git checkout feature`, la branche devient active (HEAD = `refs/heads/feature`).

### 2. Suppression de la branche courante

```bash
git branch -d main
# Erreur : cannot delete the branch 'main' which you are currently on
```

Invariant : Ne pas permettre de supprimer la branche pointée par HEAD (si HEAD est symbolique).

### 3. HEAD détaché → nouveau commit

En Phase 4, créer un commit sur un HEAD détaché créera une branche orpheline (détachée). Phase 2 spécifie juste l'état détaché ; Phase 4 gère l'implication.

### 4. Checkout d'une branche vide

```bash
git checkout feature  # feature = ""
# HEAD = refs/heads/feature
# Index et working tree : restaurés depuis HEAD (qui n'existe pas) → restent inchangés
# Possible erreur ou aucune action ? À spécifier dans checkout
```

## Impact sur le parsing et les commandes existantes

### `git status` (Phase 1)

En Phase 2, il faut mettre à jour `git status` pour afficher :
- Si HEAD est détaché : `HEAD detached at abc1234` au lieu de `On branch main`
- Les tags (optionnel en Phase 2, mais prévisible)

### `git log` (Phase 1)

Pas d'impact majeur : `git log` suit toujours HEAD. En Phase 2, si HEAD est détaché, `log` affiche l'historique depuis ce commit détaché.

### New helpers à exposer depuis `repository.ts`

```typescript
// Accesseurs pour les tags et branches
export function getTags(repo: Repository): Record<string, string> { ... }
export function getBranches(repo: Repository): Record<string, string> { ... }

// Vérifier si une branche existe
export function branchExists(repo: Repository, name: string): boolean { ... }

// Vérifier si un tag existe
export function tagExists(repo: Repository, name: string): boolean { ... }

// Vérifier si HEAD est détaché
export function isHeadDetached(repo: Repository): boolean { ... }

// Récupérer le nom de la branche précédente (pour checkout -)
export function getPrevBranch(repo: Repository): string | null { ... }

// Mettre à jour prevBranch après un changement
export function setPrevBranch(repo: Repository, branchName: string | null): void { ... }
```

## Résumé des fichiers impactés

| Fichier | Changement |
|---------|-----------|
| `src/core/model.ts` | Ajouter `prevBranch?: string \| null` à `Repository` ; ajouter `refs.tags` |
| `src/core/engine.ts` | Enrichir `RepoSnapshot` avec `tags` et `SnapshotCommit.tags` ; adapter `snapshot()` |
| `src/core/repository.ts` | Ajouter les helpers de Phase 2 ; adapter `createEmptyRepo()` |
| `src/core/commands/*.ts` | Nouvelles commandes : branch, checkout, switch, restore, tag |
| `src/core/parser.ts` | Dispatcher pour les nouvelles commandes (sans changer la structure) |

## Décisions de conception

| Aspect | Décision |
|--------|----------|
| **HEAD détaché** | `HEAD.symbolic = false` + `HEAD.target = <hash>` (simple, lisible) |
| **Branches vides** | Autorisées ; `refs.heads[name] = ""` |
| **Tags Phase 2** | Légers uniquement (simples refs, pas d'objets tag) |
| **prevBranch** | Stockée dans `Repository` pour support de `checkout -` |
| **Hashes de refs** | Inchangés : SHA-1 déterministe sur contenu (Phase 1) |
| **Immuabilité** | Seules les refs mutent ; objets (blobs/trees/commits) immuables |
| **Validation** | Lors de chaque changement : vérifier que HEAD, branches, tags sont cohérents |

