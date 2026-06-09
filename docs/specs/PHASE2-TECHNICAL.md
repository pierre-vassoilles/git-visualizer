# Phase 2 : Décisions Techniques pour le Développement

## Changes au modèle de Repository

### 1. Extension de `refs.tags`

**Avant** :
```typescript
refs: {
  heads: { [branchName: string]: string }
}
```

**Après** :
```typescript
refs: {
  heads: { [branchName: string]: string },
  tags: { [tagName: string]: string }
}
```

**Initialisation** (createEmptyRepo) :
```typescript
refs: { heads: { main: "" }, tags: {} }
```

### 2. Ajout de `prevBranch` à Repository

```typescript
type Repository = {
  // ... existing fields
  prevBranch: string | null
}
```

**Initialisation** :
```typescript
prevBranch: null
```

**Mise à jour** : Lors d'un `checkout` symbolique :
```typescript
export function updateHeadBranch(repo: Repository, newBranch: string): void {
  const oldBranch = currentBranch(repo)
  if (oldBranch) {
    repo.prevBranch = oldBranch
  }
  repo.head = { symbolic: true, target: `refs/heads/${newBranch}` }
}
```

## Helpers à implémenter dans repository.ts

### Accesseurs simples

```typescript
// Retourner toutes les branche (y compris vides)
export function getBranches(repo: Repository): Record<string, string> {
  return { ...repo.refs.heads }
}

// Retourner tous les tags
export function getTags(repo: Repository): Record<string, string> {
  return { ...repo.refs.tags }
}

// Vérifier si branche existe
export function branchExists(repo: Repository, name: string): boolean {
  return name in repo.refs.heads
}

// Vérifier si tag existe
export function tagExists(repo: Repository, name: string): boolean {
  return name in repo.refs.tags
}

// HEAD détaché ?
export function isHeadDetached(repo: Repository): boolean {
  return !repo.head.symbolic
}

// Branche précédente
export function getPrevBranch(repo: Repository): string | null {
  return repo.prevBranch ?? null
}

export function setPrevBranch(repo: Repository, name: string | null): void {
  repo.prevBranch = name
}
```

### Validation et sécurité

```typescript
// Vérifier que le working tree peut être changé sans perte de données
export function canCheckoutWithoutDataLoss(
  repo: Repository,
  newHeadHash: string
): { canCheckout: boolean; problematicFiles: string[] } {
  const newHeadCommit = getCommit(repo, newHeadHash)
  if (!newHeadCommit) {
    return { canCheckout: false, problematicFiles: [] }
  }

  const newHeadFiles = flattenTree(repo, newHeadCommit.tree)
  const currentHeadHash = headCommitHash(repo)
  const currentHeadFiles = currentHeadHash
    ? flattenTree(repo, getCommit(repo, currentHeadHash)!.tree)
    : {}

  const problematicFiles: string[] = []

  for (const [path, wtEntry] of Object.entries(repo.workingTree)) {
    const indexEntry = repo.index[path]
    const oldHeadHash = currentHeadFiles[path]
    const newHeadHash_ = newHeadFiles[path]

    // Si le fichier est modifié dans le WT (différent de l'index)
    const wtModified = indexEntry && wtEntry.content !== indexEntry.content

    // ET le nouveau commit aurait un contenu différent
    const willChange = newHeadHash_ !== oldHeadHash

    if (wtModified && willChange && newHeadHash_) {
      problematicFiles.push(path)
    }
  }

  return {
    canCheckout: problematicFiles.length === 0,
    problematicFiles
  }
}

// Résoudre un hash court ou complet
export function resolveCommitHash(
  repo: Repository,
  shortOrFull: string
): string | null {
  // Si complet (40 chars), vérifier directement
  if (shortOrFull.length === 40 && shortOrFull in repo.objects) {
    return shortOrFull
  }

  // Si court (7 chars), chercher tous les commits qui commencent par
  const matches = Object.keys(repo.objects).filter(
    (hash) =>
      repo.objects[hash].type === 'commit' &&
      hash.startsWith(shortOrFull)
  )

  if (matches.length === 1) {
    return matches[0]
  }

  return null // ambiguous or not found
}

// Vérifier si une branche est "mergée" (simplifiée Phase 2)
// Retourner true si le commit de la branche est un ancêtre de parentHash
export function isBranchMerged(
  repo: Repository,
  branchName: string,
  parentHash?: string
): boolean {
  const branchHash = repo.refs.heads[branchName]
  if (!branchHash) return false // branche vide = pas "mergée"

  const parentToCheck = parentHash ?? headCommitHash(repo)
  if (!parentToCheck) return false

  // Remontez l'historique de parentToCheck et vérifier si branchHash y apparaît
  let current = parentToCheck
  const visited = new Set<string>()

  while (current) {
    if (visited.has(current)) break
    visited.add(current)

    if (current === branchHash) {
      return true // branchHash est ancêtre de parentToCheck
    }

    const commit = getCommit(repo, current)
    if (!commit || commit.parents.length === 0) break
    current = commit.parents[0]
  }

  return false
}
```

### Helpers pour les branches vides

```typescript
// Vérifier si une branche est vide (aucun commit)
export function isBranchEmpty(repo: Repository, branchName: string): boolean {
  const hash = repo.refs.heads[branchName]
  return hash === ""
}

// Obtenir le commit d'une branche (ou null si vide)
export function getBranchCommit(
  repo: Repository,
  branchName: string
): Commit | null {
  const hash = repo.refs.heads[branchName]
  if (!hash) return null
  return getCommit(repo, hash) ?? null
}
```

## Validation de noms

```typescript
// Valider un nom de branche
export function isValidBranchName(name: string): boolean {
  if (!name || name.trim() === "") return false
  if (name.startsWith("-")) return false
  if (name === "HEAD" || name === "FETCH_HEAD") return false
  if (name.includes("/")) return false // réservé pour les remotes
  // Accepter alphanumériques, tirets, underscores
  return /^[a-zA-Z0-9_-]+$/.test(name)
}

// Valider un nom de tag
export function isValidTagName(name: string): boolean {
  if (!name || name.trim() === "") return false
  if (name.startsWith("-")) return false
  if (name === "HEAD") return false
  // Accepter alphanumériques, tirets, points, underscores
  return /^[a-zA-Z0-9_.-]+$/.test(name)
}
```

## Adaptation du snapshot (engine.ts)

### Nouvelle signature

```typescript
export function snapshot(): RepoSnapshot {
  const repo = this.repo
  const initialized = 'main' in repo.refs.heads

  // Branches (comme avant)
  const branches: Record<string, string> = {}
  for (const [name, hash] of Object.entries(repo.refs.heads)) {
    branches[name] = hash
  }

  // HEAD (peut être détaché)
  const headState: RepoSnapshot['head'] = repo.head.symbolic
    ? { type: 'branch', name: currentBranch(repo) ?? 'main' }
    : { type: 'detached', hash: repo.head.target }

  // Tags (NOUVEAU)
  const tags: Record<string, string> = {}
  for (const [name, hash] of Object.entries(repo.refs.tags)) {
    tags[name] = hash
  }

  // Commits (comme avant, mais avec tags ajoutés)
  const history = getCommitHistoryWithHashes(repo)

  // Map hash → branches
  const hashToBranches: Record<string, string[]> = {}
  for (const [name, hash] of Object.entries(repo.refs.heads)) {
    if (hash) (hashToBranches[hash] ??= []).push(name)
  }

  // Map hash → tags (NOUVEAU)
  const hashToTags: Record<string, string[]> = {}
  for (const [name, hash] of Object.entries(repo.refs.tags)) {
    (hashToTags[hash] ??= []).push(name)
  }

  const commits: SnapshotCommit[] = history.map(({ hash, commit }) => ({
    hash,
    shortHash: shortHash(hash),
    message: commit.message,
    parents: Object.freeze([...commit.parents]) as string[],
    branches: Object.freeze([...(hashToBranches[hash] ?? [])]) as string[],
    tags: Object.freeze([...(hashToTags[hash] ?? [])]) as string[] // NOUVEAU
  }))

  // Index, files (comme avant)
  const indexPaths = Object.keys(repo.index).sort()

  const headHash = headCommitHash(repo)
  const headFiles: Record<string, string> = {}
  if (headHash) {
    const commit = repo.objects[headHash]
    if (commit && commit.type === 'commit') {
      Object.assign(headFiles, flattenTree(repo, commit.tree))
    }
  }

  const allPaths = new Set([
    ...Object.keys(repo.workingTree),
    ...Object.keys(repo.index),
    ...Object.keys(headFiles)
  ])

  const files: SnapshotFile[] = []
  for (const path of [...allPaths].sort()) {
    // ... (calcul du status comme avant)
  }

  // Geler et retourner
  return Object.freeze({
    initialized,
    branches: Object.freeze(branches),
    head: Object.freeze(headState),
    commits: Object.freeze(commits.map((c) => Object.freeze(c))) as SnapshotCommit[],
    tags: Object.freeze(tags), // NOUVEAU
    indexPaths: Object.freeze(indexPaths) as string[],
    files: Object.freeze(files.map((f) => Object.freeze(f))) as SnapshotFile[]
  })
}
```

## Parsage des commandes (parser.ts)

### Dispatcher pour les 5 nouvelles commandes

```typescript
// Dans dispatch(repo, input)

const args = tokenize(input) // Résultat : ["git", "branch", "-d", "feature"]
if (args.length < 2) return fail(["invalid command"])

const [git, cmd, ...rest] = args

// Dispatcher existant (Phase 1)
if (cmd === "init") { /* ... */ }
if (cmd === "add") { /* ... */ }
// ...

// Nouvelles commandes Phase 2
if (cmd === "branch") {
  return handleBranch(repo, rest)
}
if (cmd === "checkout") {
  return handleCheckout(repo, rest)
}
if (cmd === "switch") {
  return handleSwitch(repo, rest)
}
if (cmd === "restore") {
  return handleRestore(repo, rest)
}
if (cmd === "tag") {
  return handleTag(repo, rest)
}

return fail([`git: '${cmd}' is not a git command`])
```

## Modules de commandes (commands/*.ts)

### Template pour chaque commande

```typescript
// commands/branch.ts
import { fail, ok, type CommandResult } from '../types'
import type { Repository } from '../model'
import {
  branchExists,
  currentBranch,
  headCommitHash,
  isValidBranchName,
  shortHash
} from '../repository'
import { getCommit } from '../objectStore'

export function handleBranch(repo: Repository, args: string[]): CommandResult {
  const [flag, ...rest] = args

  // Cas : git branch (lister)
  if (args.length === 0) {
    const branches = Object.entries(repo.refs.heads).sort()
    const current = currentBranch(repo)
    const lines = branches.map(([name]) => {
      const prefix = name === current ? "* " : "  "
      return `${prefix}${name}`
    })
    return ok(lines)
  }

  // Cas : git branch -d / -D
  if (flag === "-d" || flag === "-D") {
    const [branchName] = rest
    // ... implémentation suppression
  }

  // Cas : git branch <name> (créer)
  const branchName = flag
  // ... implémentation création
}
```

## Fichiers à créer

```
src/core/commands/
  ├── branch.ts      (280 lignes estimées)
  ├── checkout.ts    (450 lignes estimées)
  ├── switch.ts      (150 lignes estimées, wrapper de checkout)
  ├── restore.ts     (350 lignes estimées)
  └── tag.ts         (280 lignes estimées)

tests/commands/
  ├── branch.test.ts  (~200 lignes, 12 tests)
  ├── checkout.test.ts (~300 lignes, 11 tests)
  ├── switch.test.ts  (~150 lignes, 8 tests)
  ├── restore.test.ts (~250 lignes, 9 tests)
  └── tag.test.ts    (~200 lignes, 11 tests)
```

## Tests d'intégration (tests/integration/)

```typescript
// tests/integration/phase2.test.ts
describe("Phase 2 Integration", () => {
  test("workflow: create branch, commit, switch, back", () => {
    const engine = new GitEngine()
    engine.execute("git init")
    engine.execute("git add file.txt")
    engine.execute("git commit -m 'init'")
    engine.execute("git branch feature")
    engine.execute("git checkout feature")
    // ... assertions
    engine.execute("git checkout main")
    engine.execute("git checkout -")
    // ... assertions (doit être sur feature)
  })

  test("detached head workflow", () => {
    // ... setup commits
    engine.execute("git checkout <commit>")
    // ... verify detached
    engine.execute("git tag release")
    engine.execute("git checkout main")
    // ... assertions
  })

  test("restore with staged changes", () => {
    // ... setup
    engine.execute("git restore --staged file.txt")
    engine.execute("git restore file.txt")
    // ... assertions : tout restauré
  })
})
```

## Stratégie de test

### Unitaires (commands/*.test.ts)

- Un test par critère d'acceptation (CA)
- Mocker le repository si besoin, ou utiliser un vrai engine pour intégration

### Intégration (integration/*.test.ts)

- Workflows multi-commandes
- Vérifier l'invariant du modèle après chaque opération

### Régression (regression.test.ts)

- Tous les tests Phase 1 doivent passer
- Vérifier que `git status`, `git log` affichent correctement en présence de branche/tags

## Checklist de développement

### Modèle et helpers

- [ ] Ajouter `refs.tags` et `prevBranch` à Repository
- [ ] Implémenter tous les helpers (accesseurs, validation, sécurité)
- [ ] Adapter `createEmptyRepo()`
- [ ] Tests des helpers

### Engine et snapshot

- [ ] Adapter `snapshot()` pour tags
- [ ] Tester que le snapshot reflète correctement les tags et branches

### Commandes (ordre recommandé)

- [ ] `branch` (la plus simple, base pour les autres)
- [ ] `checkout` (utilise branch)
- [ ] `restore` (indépendant)
- [ ] `tag` (indépendant)
- [ ] `switch` (wrapper de checkout)

### Parser

- [ ] Ajouter dispatchers pour les 5 commandes
- [ ] Tests unitaires du parsing

### Tests

- [ ] Tous les CA testés
- [ ] Tests d'intégration
- [ ] Tests de régression Phase 1 ✓

### QA

- [ ] Comparaison des messages avec Git réel
- [ ] Vérification des invariants
- [ ] Tester les pièges (branche vide, suppression courante, etc.)

