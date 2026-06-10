/**
 * Tests Phase B1 : git restore / checkout -- complets — solde dette Phase 2
 * Spec : docs/specs/46-restore-checkout-completion.md
 *
 * Principe : boîte noire via execute() + read pour le working tree.
 * Le contenu de l'index est lu indirectement (restore WT ← index puis read),
 * APRÈS avoir asserté l'état du WT (donc sans masquer une régression).
 * Les CA resolveCommitish sont au niveau fonction (fixture Repository directe),
 * car une branche vide n'est pas atteignable par les commandes publiques.
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';
import type { GitEngine } from '@/core/engine';
import { createEmptyRepo, resolveCommitish } from '@/core/repository';
import type { Commit } from '@/core/model';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Contenu du working tree pour un fichier (chaîne unique). */
function readWT(engine: GitEngine, path: string): string | null {
  const r = engine.execute(`read ${path}`);
  if (r.exitCode !== 0) return null;
  return r.output.join('\n');
}

/**
 * Contenu de l'index pour un fichier : restaure le WT depuis l'index (Cas 1)
 * puis lit. ⚠ mute le WT — n'appeler qu'après avoir asserté le WT.
 */
function readIndex(engine: GitEngine, path: string): string | null {
  engine.execute(`git restore ${path}`);
  return readWT(engine, path);
}

/**
 * HEAD = c1 (file.txt="v1"), c2 (file.txt="v2"). Renvoie l'engine + hashes c1/c2.
 * `headOn` indique sur quel commit positionner HEAD (défaut c2).
 */
function twoVersionRepo(headOn: 'c1' | 'c2' = 'c2'): {
  engine: GitEngine;
  c1: string;
  c2: string;
} {
  const engine = replay([
    'git init',
    'write file.txt "v1"',
    'git add file.txt',
    'git commit -m "c1"',
    'write file.txt "v2"',
    'git add file.txt',
    'git commit -m "c2"',
  ]);
  const snap = engine.snapshot();
  // commits[0] = c2 (plus récent), commits[1] = c1
  const c2 = snap.commits[0]!.hash;
  const c1 = snap.commits[1]!.hash;
  if (headOn === 'c1') {
    engine.execute(`git checkout ${c1}`);
  }
  return { engine, c1, c2 };
}

// ---------------------------------------------------------------------------
// Quadrant --staged × --source
// ---------------------------------------------------------------------------

describe('Quadrant --staged × --source (spec 46)', () => {
  it('CA-restore-quadrant-01 : Cas 1 — WT ← index', () => {
    const engine = replay([
      'git init',
      'write file.txt "original"',
      'git add file.txt',
      'git commit -m "c1"',
      'write file.txt "staged"',
      'git add file.txt',
      'write file.txt "modified"',
    ]);

    const result = engine.execute('git restore file.txt');

    expect(result.exitCode).toBe(0);
    expect(result.output).toEqual([]);
    expect(readWT(engine, 'file.txt')).toBe('staged');
    // index inchangé (toujours "staged")
    expect(readIndex(engine, 'file.txt')).toBe('staged');
  });

  it('CA-restore-quadrant-02 : Cas 2 — index ← HEAD (--staged)', () => {
    const engine = replay([
      'git init',
      'write file.txt "original"',
      'git add file.txt',
      'git commit -m "c1"',
      'write file.txt "staged"',
      'git add file.txt',
    ]);

    const result = engine.execute('git restore --staged file.txt');

    expect(result.exitCode).toBe(0);
    // WT inchangé (toujours "staged")
    expect(readWT(engine, 'file.txt')).toBe('staged');
    // index restauré depuis HEAD ("original")
    expect(readIndex(engine, 'file.txt')).toBe('original');
  });

  it('CA-restore-quadrant-03 : Cas 3 — WT ← commit (--source)', () => {
    const { engine, c1 } = twoVersionRepo('c2');
    engine.execute('write file.txt "modified"');

    const result = engine.execute(`git restore --source=${c1} file.txt`);

    expect(result.exitCode).toBe(0);
    expect(readWT(engine, 'file.txt')).toBe('v1'); // depuis c1
    expect(readIndex(engine, 'file.txt')).toBe('v2'); // index inchangé
  });

  it('CA-restore-quadrant-04 : Cas 4 — index ← commit (--staged --source) [NEW]', () => {
    // HEAD sur c1 (index = v1, WT = v1)
    const { engine, c2 } = twoVersionRepo('c1');

    const result = engine.execute(`git restore --staged --source=${c2} file.txt`);

    expect(result.exitCode).toBe(0);
    // WT inchangé ("v1") — c'était le bug Phase 2 (court-circuitait --staged)
    expect(readWT(engine, 'file.txt')).toBe('v1');
    // index restauré depuis c2 ("v2")
    expect(readIndex(engine, 'file.txt')).toBe('v2');
  });

  it('glob `.` avec --source : restaure tout le WT depuis le commit', () => {
    const { engine, c1 } = twoVersionRepo('c2');
    engine.execute('write file.txt "modified"');

    const result = engine.execute(`git restore --source=${c1} .`);

    expect(result.exitCode).toBe(0);
    expect(readWT(engine, 'file.txt')).toBe('v1'); // depuis c1, via glob
  });

  it('Cas 4 désindexation : fichier dans l index absent de la source → retiré', () => {
    // c1 (file.txt) puis on stage un nouveau fichier extra.txt absent de c1
    const { engine, c1 } = twoVersionRepo('c2');
    engine.execute('write extra.txt "new"');
    engine.execute('git add extra.txt');
    // extra.txt est dans l'index mais absent de c1
    const result = engine.execute(`git restore --staged --source=${c1} extra.txt`);

    expect(result.exitCode).toBe(0);
    // extra.txt retiré de l'index (absent de la source c1)
    expect(engine.snapshot().indexPaths).not.toContain('extra.txt');
    // WT inchangé
    expect(readWT(engine, 'extra.txt')).toBe('new');
  });
});

// ---------------------------------------------------------------------------
// Pathspecs multiples — atomicité
// ---------------------------------------------------------------------------

describe('Pathspecs multiples (spec 46)', () => {
  function twoFilesRepo(): GitEngine {
    return replay([
      'git init',
      'write file1.txt "a"',
      'write file2.txt "b"',
      'git add file1.txt file2.txt',
      'git commit -m "c1"',
      'write file1.txt "modified"',
      'write file2.txt "modified"',
    ]);
  }

  it('CA-restore-pathspec-multi-01 : tout valide → restaure', () => {
    const engine = twoFilesRepo();

    const result = engine.execute('git restore file1.txt file2.txt');

    expect(result.exitCode).toBe(0);
    expect(readWT(engine, 'file1.txt')).toBe('a');
    expect(readWT(engine, 'file2.txt')).toBe('b');
  });

  it('CA-restore-pathspec-multi-02 : un manquant → erreur atomique', () => {
    const engine = twoFilesRepo();

    const result = engine.execute('git restore file1.txt nosuchfile.txt');

    expect(result.exitCode).toBe(1);
    expect(result.errors.join('\n')).toContain('did not match any files');
    expect(result.errors.join('\n')).toContain('nosuchfile.txt');
    // file1.txt NON restauré (atomicité)
    expect(readWT(engine, 'file1.txt')).toBe('modified');
  });

  it('CA-restore-pathspec-multi-03 : plusieurs manquants → tous listés', () => {
    const engine = twoFilesRepo();

    const result = engine.execute('git restore file1.txt file2bad.txt file3bad.txt');

    expect(result.exitCode).toBe(1);
    const joined = result.errors.join('\n');
    expect(joined).toContain('file2bad.txt');
    expect(joined).toContain('file3bad.txt');
    // aucune restauration
    expect(readWT(engine, 'file1.txt')).toBe('modified');
  });
});

// ---------------------------------------------------------------------------
// git checkout -- <pathspec>
// ---------------------------------------------------------------------------

describe('git checkout -- <pathspec> (spec 46)', () => {
  it('CA-checkout-dash-dash-01 : équivalent restore Cas 1', () => {
    const engine = replay([
      'git init',
      'write file.txt "original"',
      'git add file.txt',
      'git commit -m "c1"',
      'write file.txt "staged"',
      'git add file.txt',
      'write file.txt "modified"',
    ]);

    const result = engine.execute('git checkout -- file.txt');

    expect(result.exitCode).toBe(0);
    expect(readWT(engine, 'file.txt')).toBe('staged'); // depuis l'index
  });

  it('CA-checkout-dash-dash-02 : pathspec manquant → erreur', () => {
    const engine = replay([
      'git init',
      'write file.txt "x"',
      'git add file.txt',
      'git commit -m "c1"',
    ]);

    const result = engine.execute('git checkout -- nosuchfile.txt');

    expect(result.exitCode).toBe(1);
    expect(result.errors.join('\n')).toContain('did not match any files');
  });
});

// ---------------------------------------------------------------------------
// resolveCommitish — levée d'ambiguïté branche vide (niveau fonction)
// ---------------------------------------------------------------------------

describe('resolveCommitish — branche vide ignorée (spec 46)', () => {
  const fakeCommit: Commit = {
    type: 'commit',
    tree: 'tree0',
    parents: [],
    author: 'Author <author@example.com>',
    date: 0,
    message: 'm',
  };

  it('CA-resolveCommitish-ambiguity-01 : branche vide ignorée → tag', () => {
    const repo = createEmptyRepo();
    const hash1 = 'abc1234aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    repo.objects[hash1] = fakeCommit;
    repo.refs.heads.abc = ''; // branche vide
    repo.refs.tags.abc = hash1; // tag homonyme

    expect(resolveCommitish(repo, 'abc')).toBe(hash1);
  });

  it('CA-resolveCommitish-ambiguity-02 : branche vide ignorée → hash court', () => {
    const repo = createEmptyRepo();
    const full = 'abc1234aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    repo.objects[full] = fakeCommit;
    repo.refs.heads.abc = ''; // branche vide, pas de tag homonyme

    expect(resolveCommitish(repo, 'abc1234')).toBe(full);
  });

  it('CA-resolveCommitish-ambiguity-03 : branche vide seule source → null', () => {
    const repo = createEmptyRepo();
    repo.refs.heads.abc = ''; // branche vide, aucune autre source

    expect(resolveCommitish(repo, 'abc')).toBeNull();
  });
});
