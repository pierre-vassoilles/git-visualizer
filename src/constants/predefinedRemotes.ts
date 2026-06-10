/**
 * Catalogue de dépôts distants prédéfinis pour `git clone`.
 *
 * Les dépôts sont CONSTRUITS dynamiquement en rejouant des séquences de
 * commandes sur un dépôt jetable. Cela garantit que les hashes coïncident
 * exactement avec ceux produits par le moteur local (déterminisme SHA-1).
 *
 * Aucun hash n'est hardcodé. Aucun Date.now() ni Math.random().
 */

import type { RemoteRepository, GitObject } from '../core/model';
import { createEmptyRepo } from '../core/repository';
import { dispatch } from '../core/parser';

// ---------------------------------------------------------------------------
// Builder : matérialise un RemoteRepository depuis une séquence de commandes
// ---------------------------------------------------------------------------

interface BuildStep {
  cmd: string;
}

/**
 * Exécute une séquence de commandes sur un dépôt jetable et extrait
 * un RemoteRepository (bare : objects + refs.heads + head + url).
 * Le dépôt temporaire est créé, utilisé, puis jeté.
 */
function buildRemoteFromCommands(url: string, steps: BuildStep[]): RemoteRepository {
  const repo = createEmptyRepo();

  for (const step of steps) {
    dispatch(repo, step.cmd);
  }

  // Copier l'object store (tous les objets présents dans le dépôt jetable)
  const objects: Record<string, GitObject> = {};
  for (const [hash, obj] of Object.entries(repo.objects)) {
    objects[hash] = obj;
  }

  // Copier refs.heads (seulement les branches non vides)
  const heads: Record<string, string> = {};
  for (const [name, hash] of Object.entries(repo.refs.heads)) {
    if (hash) heads[name] = hash;
  }

  return {
    url,
    objects,
    refs: { heads },
    head: { ...repo.head },
  };
}

// ---------------------------------------------------------------------------
// Dépôts prédéfinis
// ---------------------------------------------------------------------------

/**
 * `public-repo` : dépôt simple avec 3 commits linéaires sur `main`.
 *
 *   C0 (Initial commit)
 *   ← C1 (Add file1.txt)
 *   ← C2 (Add file2.txt)    ← HEAD/main
 */
function buildPublicRepo(): RemoteRepository {
  return buildRemoteFromCommands('https://github.com/example/public-repo.git', [
    { cmd: 'git init' },
    { cmd: 'write file1.txt "Hello from public-repo"' },
    { cmd: 'git add file1.txt' },
    { cmd: 'git commit -m "Initial commit"' },
    { cmd: 'write file1.txt "Updated file1"' },
    { cmd: 'git add file1.txt' },
    { cmd: 'git commit -m "Add file1.txt"' },
    { cmd: 'write file2.txt "Content of file2"' },
    { cmd: 'git add file2.txt' },
    { cmd: 'git commit -m "Add file2.txt"' },
  ]);
}

/**
 * `collab-repo` : dépôt avec deux branches divergentes.
 *
 *   C0 (Initial commit)
 *   ← C1 (First commit) ← C2 (Second commit)    ← HEAD/main
 *   ← C3 (Dev start)    ← C4 (Dev feature)       ← develop
 */
function buildCollabRepo(): RemoteRepository {
  return buildRemoteFromCommands('https://github.com/example/collab-repo.git', [
    { cmd: 'git init' },
    { cmd: 'write README.md "# Collab Repo"' },
    { cmd: 'git add README.md' },
    { cmd: 'git commit -m "Initial commit"' },
    // main: C1
    { cmd: 'write main.ts "export const version = 1"' },
    { cmd: 'git add main.ts' },
    { cmd: 'git commit -m "First commit"' },
    // main: C2
    { cmd: 'write main.ts "export const version = 2"' },
    { cmd: 'git add main.ts' },
    { cmd: 'git commit -m "Second commit"' },
    // Créer develop à partir de C0 (HEAD~2)
    { cmd: 'git branch develop HEAD~2' },
    { cmd: 'git checkout develop' },
    // develop: C3
    { cmd: 'write dev.ts "export const dev = true"' },
    { cmd: 'git add dev.ts' },
    { cmd: 'git commit -m "Dev start"' },
    // develop: C4
    { cmd: 'write feature.ts "export const feature = 1"' },
    { cmd: 'git add feature.ts' },
    { cmd: 'git commit -m "Dev feature"' },
    // Revenir sur main
    { cmd: 'git checkout main' },
  ]);
}

/**
 * `feature-repo` : dépôt dont la branche par défaut n'est PAS `main` mais
 * `develop` (HEAD distant sur `refs/heads/develop`). Sert à valider le clone
 * d'un dépôt à branche par défaut non-`main`.
 *
 *   C0 (Initial commit)  ← main
 *   ← C1 (Develop work)   ← HEAD/develop
 */
function buildFeatureRepo(): RemoteRepository {
  return buildRemoteFromCommands('https://github.com/example/feature-repo.git', [
    { cmd: 'git init' },
    { cmd: 'write base.txt "base"' },
    { cmd: 'git add base.txt' },
    { cmd: 'git commit -m "Initial commit"' },
    { cmd: 'git checkout -b develop' },
    { cmd: 'write feature.txt "work in progress"' },
    { cmd: 'git add feature.txt' },
    { cmd: 'git commit -m "Develop work"' },
    // HEAD reste sur develop → branche par défaut du clone = develop
  ]);
}

// ---------------------------------------------------------------------------
// Catalogue lookup
// ---------------------------------------------------------------------------

/**
 * Map nom → factory (lazy : les dépôts sont construits à la première demande,
 * puis mis en cache pour éviter de recalculer à chaque clone).
 */
const REMOTE_FACTORIES: Record<string, () => RemoteRepository> = {
  'public-repo': buildPublicRepo,
  'collab-repo': buildCollabRepo,
  'feature-repo': buildFeatureRepo,
};

const REMOTE_CACHE: Record<string, RemoteRepository> = {};

/**
 * Retourne une copie du RemoteRepository prédéfini pour `name`, ou null
 * si le nom n'est pas reconnu.
 *
 * La copie est profonde (objects + refs) pour que chaque clone soit
 * indépendant : le dépôt local ne partage pas de références avec le cache.
 */
export function getPredefinedRemote(name: string): RemoteRepository | null {
  const factory = REMOTE_FACTORIES[name];
  if (!factory) return null;

  // Construire et mettre en cache au premier appel
  if (!REMOTE_CACHE[name]) {
    REMOTE_CACHE[name] = factory();
  }

  const cached = REMOTE_CACHE[name]!;

  // Retourner une copie profonde pour isolation
  const objectsCopy: Record<string, import('../core/model').GitObject> = {};
  for (const [hash, obj] of Object.entries(cached.objects)) {
    objectsCopy[hash] = obj;
  }

  const headsCopy: Record<string, string> = { ...cached.refs.heads };

  return {
    url: cached.url,
    objects: objectsCopy,
    refs: { heads: headsCopy },
    head: { ...cached.head },
  };
}

/**
 * Retourne les noms de tous les dépôts prédéfinis disponibles.
 */
export function getPredefinedRemoteNames(): string[] {
  return Object.keys(REMOTE_FACTORIES);
}
