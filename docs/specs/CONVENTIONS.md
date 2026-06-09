# Phase 1 : Conventions et Standards de développement

Ce document définit les conventions de code, test, et communication pour la Phase 1.

---

## 🏗️ Architecture du Code

### Structure des fichiers recommandée

```typescript
src/core/
├── types.ts                 // Interfaces et types partagés
├── hash.ts                  // SHA-1 et utilitaires cryptographiques
├── parser.ts                // Parser de commandes brutes
├── repository.ts            // Classe Repository (état du dépôt)
├── engine.ts                // GitEngine (entry point, dispatcher)
└── commands/
    ├── index.ts             // Export de toutes les commandes
    ├── init.ts              // Logique git init
    ├── add.ts               // Logique git add
    ├── status.ts            // Logique git status
    ├── commit.ts            // Logique git commit
    └── log.ts               // Logique git log
```

### Modules utilitaires (optionnel mais recommandé)

```typescript
src/core/
└── utils/
    ├── path-validator.ts    // Validation de chemins
    ├── tree-builder.ts      // Construction récursive de trees
    ├── date-formatter.ts    // Formatage de dates
    └── string-utils.ts      // Utilitaires de strings
```

---

## 📝 Conventions de code TypeScript

### Nommage

| Type | Convention | Exemple |
|------|-----------|---------|
| Classes | PascalCase | `GitEngine`, `Repository` |
| Interfaces | PascalCase, préfixe `I` optionnel | `CommandResult`, `IRepository` |
| Fonctions | camelCase | `hashBlob()`, `parseCommand()` |
| Constantes | UPPER_SNAKE_CASE | `DEFAULT_AUTHOR`, `MAIN_BRANCH` |
| Variables privées | `_camelCase` ou `#privateField` | `_repository`, `#index` |
| Énums | PascalCase | `ExitCode`, `FileMode` |

### Types et interfaces

```typescript
// ✓ Bon : Types génériques explicites
type ObjectStore = Map<string, GitObject>;
interface Repository {
  objects: ObjectStore;
  refs: Refs;
  head: Head;
}

// ✗ Mauvais : any, omission de types
const objects: any = {};
function execute(input) { ... }

// ✓ Bon : Union types explicites
type GitObject = Blob | Tree | Commit;
type RefTarget = Ref | CommitHash;

// ✗ Mauvais : Trop génériques
type GitObject = any;
```

### Gestion d'erreurs

```typescript
// ✓ Bon : Erreurs explicites
if (!path.startsWith('/') && !path.includes('..')) {
  // Path valide
} else {
  return fail(['error: invalid path'], 1);
}

// ✗ Mauvais : Erreur silencieuse
try {
  // Quelque chose peut échouer
} catch (e) {
  // On ignore silencieusement
}

// ✓ Bon : Messages d'erreur informatifs
return fail([`fatal: pathspec '${pathspec}' did not match any files`], 1);

// ✗ Mauvais : Message vague
return fail(['Error'], 1);
```

### Immuabilité

```typescript
// ✓ Bon : Objets immuables (Commits, Blobs, Trees)
const commit = {
  type: 'commit' as const,
  tree: treeHash,
  parents: [...parentHashes],  // Shallow copy
  author: AUTHOR,
  date: timestamp,
  message
};
Object.freeze(commit);

// ✗ Mauvais : Mutation d'objet
commit.parents.push(newParent);  // Modifie le commit

// ✓ Bon : Refs mutables (refs, HEAD, index)
refs.heads.main = newCommitHash;  // OK

// ✗ Mauvais : Confusion entre immutable et mutable
repo.objects[hash].content = newContent;  // Blob ne doit pas changer
```

---

## 🧪 Conventions de test (Vitest)

### Structure de test

```typescript
describe('GitEngine : git add', () => {
  let engine: GitEngine;

  beforeEach(() => {
    engine = new GitEngine();
    engine.execute('git init');
  });

  it('CA-add-01 : Ajouter un fichier simple', () => {
    // Setup
    engine.execute('write hello.txt "hello world"');

    // Action
    const result = engine.execute('git add hello.txt');

    // Assertions
    expect(result.exitCode).toBe(0);
    expect(result.output).toEqual([]);  // Pas de sortie sur succès
    expect(result.errors).toEqual([]);
    // Assertions internes
    const index = engine.getRepository().index;
    expect(index['hello.txt']).toBeDefined();
    expect(index['hello.txt'].content).toBe('hello world');
  });

  it('CA-add-05 : Fichier non trouvé', () => {
    const result = engine.execute('git add nonexistent.txt');

    expect(result.exitCode).toBe(1);
    expect(result.errors[0]).toContain('did not match any files');
  });
});
```

### Naming conventions pour tests

```typescript
// ✓ Bon : Descriptif, structure Given/When/Then
it('CA-<cmd>-<num> : <description courte>', () => {
  // Given : Setup initial
  // When  : Action
  // Then  : Assertions
});

// ✗ Mauvais : Vague, pas de référence spec
it('test add', () => { ... });
it('should work', () => { ... });
```

### Utilisation de describe et it

```typescript
// ✓ Bon : Structure hiérarchique claire
describe('GitEngine', () => {
  describe('git init', () => {
    it('CA-init-01 : Init sur dépôt vierge', () => { ... });
    it('CA-init-02 : Init sur dépôt déjà initialisé', () => { ... });
  });

  describe('git add', () => {
    it('CA-add-01 : Ajouter un fichier simple', () => { ... });
    // ...
  });
});

// ✗ Mauvais : Tout dans un seul describe
describe('Tests', () => {
  it('test1', () => { ... });
  it('test2', () => { ... });
  // ...
});
```

### Assertions standards

```typescript
// ✓ Bon : Assertions explicites
expect(result.exitCode).toBe(0);
expect(result.errors).toEqual([]);
expect(result.output[0]).toContain('Initialized');
expect(index['file.txt']).toBeDefined();
expect(index['file.txt'].content).toBe('hello');

// ✗ Mauvais : Assertions vagues
expect(result).toBeTruthy();
expect(result.output).toHaveLength(1);  // Pas assez spécifique
```

### Tests d'isolation

```typescript
// ✓ Bon : Chaque test crée un engine frais
describe('git status', () => {
  let engine: GitEngine;

  beforeEach(() => {
    engine = new GitEngine();  // Engine frais pour chaque test
    engine.execute('git init');
  });

  it('CA-status-01', () => { ... });
  it('CA-status-02', () => { ... });  // Indépendant de CA-status-01
});

// ✗ Mauvais : Tests interdépendants
describe('git status', () => {
  let engine: GitEngine;  // Même engine pour tous les tests
  
  it('CA-status-01', () => {
    engine = new GitEngine();
    // ...
  });

  it('CA-status-02', () => {
    // Dépend de l'état de CA-status-01 !
    // ...
  });
});
```

### Coverage expectations

```typescript
// Viser ces seuils pour chaque nouvelle fonction/commande

// ✓ Couverture adequat
Lines       : ≥90%
Functions   : ≥90%
Branches    : ≥85%
Statements  : ≥90%

// ✗ Couverture insuffisant
Lines       : <80%  (risqué)
Functions   : <75%  (trop de code non-testé)
```

---

## 📋 Messages d'erreur

### Format standard

```typescript
// ✓ Bon : Calqué sur Git
return fail(['fatal: not a git repository (or any of the parent directories): .git'], 128);
return fail(['fatal: pathspec \'file.txt\' did not match any files'], 1);

// ✗ Mauvais : Format non-standard
return fail(['ERROR: invalid'], 1);
return fail(['something went wrong'], 1);
```

### Catégories de codes de sortie

| Code | Sens | Exemple |
|------|------|---------|
| 0 | Succès | `git init`, `git add` success |
| 1 | Erreur générale | `no changes added to commit` |
| 128 | Erreur fatale (repo non-init) | `not a git repository` |
| 127 | Commande non trouvée | `command not found` |

---

## 🔄 Cycle de développement

### Avant de commiter du code

1. **Linter** (si configuré) :
   ```bash
   npm run lint
   ```

2. **Tests locaux** :
   ```bash
   npm run test
   ```

3. **Coverage** :
   ```bash
   npm run test:coverage
   # Vérifier que c'est ≥90%
   ```

4. **Pas d'erreurs TypeScript** :
   ```bash
   npx tsc --noEmit
   ```

### Format de commit (conventional commits)

```
feat(core): implement git add command

- Implement pathspec parsing
- Calculate blob hashes SHA-1
- Update index with staged files
- Handle error cases (file not found, etc.)

Implements: CA-add-01 to CA-add-10
Tests: All 10 CA passing
Coverage: 92%
```

### PR / Code Review checklist

- [ ] Tous les CA implémentés pour cette commande
- [ ] Tests Vitest écrits et passants
- [ ] Couverture ≥90%
- [ ] Messages d'erreur matchent Git
- [ ] Pas de dépendance au FS réel
- [ ] Types TypeScript corrects
- [ ] Code lisible (pas de long functions)
- [ ] Pas de regréssions (Phase 0 toujours OK)

---

## 📚 Patterns recommandés

### Repository pattern

```typescript
// ✓ Bon : Encapsulation du state
class Repository {
  private objects: Map<string, GitObject>;
  private refs: Refs;
  private head: Head;
  private index: Index;
  private workingTree: WorkingTree;

  public addObject(obj: GitObject): string {
    // Validation interne
    const hash = computeHash(obj);
    this.objects.set(hash, obj);
    return hash;
  }

  public getObject(hash: string): GitObject | undefined {
    return this.objects.get(hash);
  }
}

// ✗ Mauvais : State public exposé
const engine = new GitEngine();
engine.repository.objects[hash] = badObject;  // Mutation directe
```

### Command dispatcher

```typescript
// ✓ Bon : Dispatcher clair
execute(input: string): CommandResult {
  const [cmd, ...args] = this.parser.parse(input);

  switch (cmd) {
    case 'git':
      return this.executeGit(args);
    case 'write':
      return this.executeWrite(args);
    case 'read':
      return this.executeRead(args);
    default:
      return fail([`command not found: ${cmd}`], 127);
  }
}

// ✗ Mauvais : Dispatcher enchâssé
if (input.startsWith('git init')) {
  // ...
} else if (input.startsWith('git add')) {
  // ...
} else if (input.startsWith('git status')) {
  // ...
  // Explosion combinatoire
}
```

### Hash computation

```typescript
// ✓ Bon : SHA-1 déterministe
function hashBlob(content: string): string {
  const data = `blob ${content.length}\0${content}`;
  return sha1(data);  // Même hash pour même contenu, toujours
}

// ✗ Mauvais : Non-déterministe
function hashBlob(content: string): string {
  return sha1(content + Math.random());  // Hashes différents !
}
```

---

## 🚫 Anti-patterns à éviter

### 1. Mutation d'objets immuables

```typescript
// ✗ MAUVAIS
commit.parents.push(newParent);
blob.content = newContent;
tree.entries['file.txt'] = newEntry;

// ✓ BON
const newCommit = { ...commit, parents: [...commit.parents, newParent] };
// Ou : const newTree = { ...tree, entries: { ...tree.entries, 'file.txt': newEntry } };
```

### 2. Accès au FS réel

```typescript
// ✗ MAUVAIS
import * as fs from 'fs';
const content = fs.readFileSync(path, 'utf-8');

// ✓ BON
const content = this.repository.workingTree[path]?.content;
```

### 3. État global partagé

```typescript
// ✗ MAUVAIS
let globalRepository: Repository;  // Partagé entre tous les engines

class GitEngine {
  constructor() {
    globalRepository = new Repository();  // Mauvais !
  }
}

// ✓ BON
class GitEngine {
  private repository: Repository;

  constructor() {
    this.repository = new Repository();  // Instance locale
  }
}
```

### 4. Pas de validation

```typescript
// ✗ MAUVAIS
function addFile(path: string, content: string) {
  this.index[path] = { content };  // path peut être n'importe quoi
}

// ✓ BON
function addFile(path: string, content: string) {
  if (this.isValidPath(path)) {
    this.index[path] = { blobHash: this.hashBlob(content), content };
  } else {
    return fail(['error: invalid path'], 1);
  }
}
```

### 5. Pas de messages d'erreur

```typescript
// ✗ MAUVAIS
if (!repo.objects[hash]) {
  return fail(['Error'], 1);
}

// ✓ BON
if (!repo.objects[hash]) {
  return fail([`fatal: invalid object hash: ${hash}`], 1);
}
```

---

## 📖 Documentation dans le code

### JSDoc standards

```typescript
/**
 * Compute the SHA-1 hash of a blob's content.
 * 
 * The hash is computed using Git's format: "blob " + length + "\0" + content
 * 
 * @param content - The file content (string)
 * @returns The SHA-1 hash (40 hex characters)
 * 
 * @example
 * hashBlob("hello world") // => "95d09f2b..."
 */
export function hashBlob(content: string): string {
  const data = `blob ${content.length}\0${content}`;
  return sha1(data);
}

/**
 * Add a file from the working tree to the staging area (index).
 * 
 * @param pathspec - Relative path to the file (e.g., "src/main.ts")
 * @throws Does not throw; returns CommandResult with exitCode/errors
 * 
 * @invariant If successful, the file is added to the index with its blob hash
 * @invariant The working tree is never modified by this function
 */
export function add(pathspec: string): CommandResult {
  // ...
}
```

### Commentaires pour la logique complexe

```typescript
// ✓ Bon : Explique le "pourquoi"
// Build a tree from the index by grouping files by directory.
// This is necessary because Git's tree structure is hierarchical,
// but the index is a flat dictionary.
function buildTreeFromIndex(index: Index): Tree {
  // ...
}

// ✗ Mauvais : Explique le "quoi" (déjà lisible)
for (const [path, entry] of Object.entries(index)) {
  // Itérer sur chaque entrée de l'index
  // ...
}
```

---

## 🔍 Checklist avant livraison

### Code quality
- [ ] Tous les types TypeScript explicites (pas de `any`)
- [ ] Pas d'erreurs de linter (ou exceptions documentées)
- [ ] Pas d'accès au vrai FS (`grep -r "require.*fs"`)
- [ ] Fonctions <50 lignes (sauf cas justifiés)
- [ ] Noms de variables explicites

### Tests
- [ ] Tous les CA du document spec implémentés
- [ ] Tests Vitest écrits pour chaque CA
- [ ] Tous les tests passants (`npm run test`)
- [ ] Couverture ≥90% (`npm run test:coverage`)
- [ ] Tests isolés (pas de dépendances croisées)

### Documentation
- [ ] JSDoc sur les fonctions publiques
- [ ] Commentaires sur la logique complexe
- [ ] README.md à jour (si changements)
- [ ] Fichiers spec consultés et correctement implémentés

### Déterminisme
- [ ] Hashes identiques pour contenu identique
- [ ] Aucun `Math.random()`, `Date.now()` (sauf timestamp contrôlé)
- [ ] Tests reproductibles à 100%

---

## 📞 Questions fréquentes (FAQ)

### Q: Comment gérer les caractères spéciaux dans les messages de commit ?

**R**: Les messages de commit doivent être des strings brutes. Si un utilisateur passe `git commit -m "line1\nline2"`, cela crée un message multi-ligne. Pas d'interprétation spéciale.

### Q: Et si deux fichiers ont le même contenu ?

**R**: Ils généreront le même blob hash, ce qui est bon (déduplication). C'est le comportement Git réel.

### Q: Comment tester le déterminisme ?

**R**: Créer deux engines indépendants, les initialiser avec les mêmes commandes, vérifier que les hashes finaux sont identiques.

### Q: Peut-on utiliser async/await ?

**R**: Non. Le moteur doit être synchrone en Phase 1 (pas de I/O). Tout se fait en mémoire, pas besoin d'async.

### Q: Comment maintenir l'immuabilité des objets Git ?

**R**: Utiliser `Object.freeze()` après création, ou utiliser TypeScript `as const` pour les strings. Préférer les structures immutables.

---

**Fin des conventions. À respecter pour la Phase 1 !** ✅
