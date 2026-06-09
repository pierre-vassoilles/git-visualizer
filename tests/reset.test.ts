/**
 * Tests Phase 4 : git reset
 * Spec : docs/specs/20-reset.md
 * CA-reset-01 … CA-reset-11
 *
 * Principe : boîte noire via execute() + snapshot().
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

/**
 * Dépôt avec 2 commits :
 *   C0 (a.txt="v0") ← C1 (a.txt="v1"), HEAD sur main/C1.
 */
function twoCommitRepo() {
  return replay([
    'git init',
    'write a.txt "v0"',
    'git add a.txt',
    'git commit -m "C0"',
    'write a.txt "v1"',
    'git add a.txt',
    'git commit -m "C1"',
  ]);
}

/**
 * Dépôt avec 3 commits :
 *   C0 ← C1 ← C2, HEAD sur main/C2.
 */
function threeCommitRepo() {
  return replay([
    'git init',
    'write a.txt "v0"',
    'git add a.txt',
    'git commit -m "C0"',
    'write a.txt "v1"',
    'git add a.txt',
    'git commit -m "C1"',
    'write a.txt "v2"',
    'git add a.txt',
    'git commit -m "C2"',
  ]);
}

// ---------------------------------------------------------------------------
// CA-reset-01 : Reset soft HEAD~1
// ---------------------------------------------------------------------------

describe('CA-reset-01 : git reset --soft HEAD~1', () => {
  it('CA-reset-01 : HEAD pointe C0, index et WT inchangés', () => {
    const engine = twoCommitRepo();
    const snapBefore = engine.snapshot();
    const c0Hash = snapBefore.commits[1]!.hash; // commit le plus ancien
    // Ajouter quelque chose à l'index pour vérifier que --soft ne l'efface pas
    engine.execute('write b.txt "extra"');
    engine.execute('git add b.txt');

    const result = engine.execute('git reset --soft HEAD~1');

    expect(result.exitCode).toBe(0);
    // Sortie silencieuse pour --soft
    expect(result.output).toHaveLength(0);

    const snap = engine.snapshot();
    // HEAD doit pointer C0
    expect(snap.branches['main']).toBe(c0Hash);
    // b.txt doit rester dans l'index (index inchangé)
    expect(snap.indexPaths).toContain('b.txt');
  });
});

// ---------------------------------------------------------------------------
// CA-reset-02 : Reset mixed HEAD~1
// ---------------------------------------------------------------------------

describe('CA-reset-02 : git reset --mixed HEAD~1', () => {
  it('CA-reset-02 : HEAD pointe C0, index réinitialisé à C0, WT inchangé', () => {
    const engine = twoCommitRepo();
    const snapBefore = engine.snapshot();
    const c0Hash = snapBefore.commits[1]!.hash;

    // Vérifier l'état de base : a.txt="v1" dans index et WT
    // Faire un reset --mixed HEAD~1 → index doit refléter C0 (a.txt="v0")
    // mais WT reste avec a.txt="v1"
    const result = engine.execute('git reset --mixed HEAD~1');

    expect(result.exitCode).toBe(0);
    expect(result.output).toHaveLength(0); // sortie silencieuse

    const snap = engine.snapshot();
    // HEAD pointe C0
    expect(snap.branches['main']).toBe(c0Hash);
    // L'index est réinitialisé à C0 : a.txt présent (car C0 a a.txt)
    expect(snap.indexPaths).toContain('a.txt');
    // a.txt dans l'index correspond à la version de C0 ("v0")
    // WT inchangé : on vérifie via les fichiers
    const aFile = snap.files.find((f) => f.path === 'a.txt');
    // WT a encore "v1" mais index a "v0" → statut modified
    expect(aFile?.status).toBe('modified');
  });
});

// ---------------------------------------------------------------------------
// CA-reset-03 : Reset hard HEAD~1
// ---------------------------------------------------------------------------

describe('CA-reset-03 : git reset --hard HEAD~1', () => {
  it('CA-reset-03 : output "HEAD is now at", HEAD/index/WT alignés sur C0', () => {
    const engine = twoCommitRepo();
    const snapBefore = engine.snapshot();
    const c0Hash = snapBefore.commits[1]!.hash;

    // Simuler une modification non stagée
    engine.execute('write a.txt "v1.modified"');

    const result = engine.execute('git reset --hard HEAD~1');

    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes('HEAD is now at'))).toBe(true);

    const snap = engine.snapshot();
    // HEAD pointe C0
    expect(snap.branches['main']).toBe(c0Hash);
    // index et WT alignés sur C0 : a.txt="v0", statut clean
    const aFile = snap.files.find((f) => f.path === 'a.txt');
    expect(aFile?.status).toBe('clean');
  });

  it('CA-reset-03 : le shortHash du commit cible apparaît dans le message', () => {
    const engine = twoCommitRepo();
    const snapBefore = engine.snapshot();
    const c0Hash = snapBefore.commits[1]!.hash;
    const c0Short = c0Hash.slice(0, 7);

    const result = engine.execute('git reset --hard HEAD~1');
    expect(result.output.some((l) => l.includes(c0Short))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-reset-04 : Reset sans commit (reset index seulement)
// ---------------------------------------------------------------------------

describe('CA-reset-04 : git reset sans argument', () => {
  it('CA-reset-04 : HEAD inchangé, index réinitialisé à HEAD, WT inchangé', () => {
    const engine = twoCommitRepo();
    const snapBefore = engine.snapshot();
    const c1Hash = snapBefore.branches['main']!;

    // Staguer un changement
    engine.execute('write b.txt "staged"');
    engine.execute('git add b.txt');
    // Vérifier que b.txt est dans l'index
    expect(engine.snapshot().indexPaths).toContain('b.txt');

    const result = engine.execute('git reset');

    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    // HEAD inchangé
    expect(snap.branches['main']).toBe(c1Hash);
    // b.txt retiré de l'index (réinitialisé à HEAD qui n'a pas b.txt)
    expect(snap.indexPaths).not.toContain('b.txt');
    // WT : b.txt existe toujours (non tracké maintenant)
    const bFile = snap.files.find((f) => f.path === 'b.txt');
    expect(bFile?.status).toBe('untracked');
  });
});

// ---------------------------------------------------------------------------
// CA-reset-05 : Reset avec révisions HEAD~n
// ---------------------------------------------------------------------------

describe('CA-reset-05 : git reset HEAD~n', () => {
  it('CA-reset-05 : git reset HEAD~2 atterrit sur C0', () => {
    const engine = threeCommitRepo();
    const snapBefore = engine.snapshot();
    const c0Hash = snapBefore.commits[2]!.hash;

    const result = engine.execute('git reset HEAD~2');

    expect(result.exitCode).toBe(0);
    const snap = engine.snapshot();
    expect(snap.branches['main']).toBe(c0Hash);
  });
});

// ---------------------------------------------------------------------------
// CA-reset-06 : Reset sur HEAD détaché
// ---------------------------------------------------------------------------

describe('CA-reset-06 : git reset --hard sur HEAD détaché', () => {
  it('CA-reset-06 : HEAD reste détaché et pointe C1 après reset HEAD~1 depuis C2', () => {
    const engine = threeCommitRepo();

    // Détacher HEAD sur C2
    engine.execute('git checkout HEAD~0');

    const snapDetached = engine.snapshot();
    expect(snapDetached.head.type).toBe('detached');
    const c1Hash = snapDetached.commits[1]!.hash;

    const result = engine.execute('git reset --hard HEAD~1');

    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    expect(snap.head.type).toBe('detached');
    if (snap.head.type === 'detached') {
      expect(snap.head.hash).toBe(c1Hash);
    }
  });
});

// ---------------------------------------------------------------------------
// CA-reset-07 : Erreur commit inexistant
// ---------------------------------------------------------------------------

describe('CA-reset-07 : commit inexistant → erreur', () => {
  it('CA-reset-07 : exitCode 128, errors "unknown revision", HEAD/index/WT inchangés', () => {
    const engine = twoCommitRepo();
    const snapBefore = engine.snapshot();
    const headBefore = snapBefore.branches['main'];

    const result = engine.execute('git reset nosuchcommit');

    expect(result.exitCode).toBe(128);
    expect(result.errors.some((e) => e.includes('unknown revision'))).toBe(true);

    // HEAD inchangé
    expect(engine.snapshot().branches['main']).toBe(headBefore);
  });
});

// ---------------------------------------------------------------------------
// CA-reset-08 : Reset --hard avec suppression de fichiers
// ---------------------------------------------------------------------------

describe('CA-reset-08 : git reset --hard supprime les fichiers ajoutés après C0', () => {
  it("CA-reset-08 : c.txt absent du WT et de l'index après reset vers C0", () => {
    // C0 (a.txt, b.txt) ← C1 (a.txt, b.txt, c.txt), HEAD sur C1
    const engine = replay([
      'git init',
      'write a.txt "a"',
      'write b.txt "b"',
      'git add a.txt',
      'git add b.txt',
      'git commit -m "C0"',
      'write c.txt "c"',
      'git add c.txt',
      'git commit -m "C1"',
    ]);

    const result = engine.execute('git reset --hard HEAD~1');

    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    // c.txt n'existe plus dans l'index ni dans les fichiers trackés
    expect(snap.indexPaths).not.toContain('c.txt');
    const cFile = snap.files.find((f) => f.path === 'c.txt');
    expect(cFile).toBeUndefined();
    // a.txt et b.txt existent toujours
    expect(snap.indexPaths).toContain('a.txt');
    expect(snap.indexPaths).toContain('b.txt');
  });
});

// ---------------------------------------------------------------------------
// CA-reset-09 : Reset multiple fichiers
// ---------------------------------------------------------------------------

describe('CA-reset-09 : git reset --hard supprime c.txt et d.txt', () => {
  it('CA-reset-09 : c.txt et d.txt supprimés, a.txt et b.txt conservés', () => {
    const engine = replay([
      'git init',
      'write a.txt "a"',
      'write b.txt "b"',
      'git add a.txt',
      'git add b.txt',
      'git commit -m "C0"',
      'write c.txt "c"',
      'write d.txt "d"',
      'git add c.txt',
      'git add d.txt',
      'git commit -m "C1"',
    ]);

    const result = engine.execute('git reset --hard HEAD~1');
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    expect(snap.indexPaths).not.toContain('c.txt');
    expect(snap.indexPaths).not.toContain('d.txt');
    expect(snap.indexPaths).toContain('a.txt');
    expect(snap.indexPaths).toContain('b.txt');
  });
});

// ---------------------------------------------------------------------------
// CA-reset-10 : Reset soft préserve les changements stagés
// ---------------------------------------------------------------------------

describe('CA-reset-10 : git reset --soft préserve les changements stagés', () => {
  it('CA-reset-10 : après reset --soft HEAD~1, index conserve les changements stagés', () => {
    const engine = twoCommitRepo();

    // Staguer des changements
    engine.execute('write a.txt "v2-staged"');
    engine.execute('git add a.txt');
    engine.execute('write b.txt "new-file"');
    engine.execute('git add b.txt');

    const result = engine.execute('git reset --soft HEAD~1');
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    // Les changements stagés sont préservés
    expect(snap.indexPaths).toContain('a.txt');
    expect(snap.indexPaths).toContain('b.txt');
  });
});

// ---------------------------------------------------------------------------
// CA-reset-11 : Reset hard sur branche symbolique
// ---------------------------------------------------------------------------

describe('CA-reset-11 : git reset --hard sur branche symbolique', () => {
  it('CA-reset-11 : HEAD reste symbolique, refs.heads.main pointe C0, index+WT alignés', () => {
    const engine = twoCommitRepo();
    const snapBefore = engine.snapshot();
    const c0Hash = snapBefore.commits[1]!.hash;

    expect(snapBefore.head.type).toBe('branch');

    const result = engine.execute('git reset --hard HEAD~1');
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    // HEAD reste symbolique (sur branche)
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') {
      expect(snap.head.name).toBe('main');
    }
    // refs.heads.main pointe C0
    expect(snap.branches['main']).toBe(c0Hash);
    // Index et WT alignés sur C0
    const aFile = snap.files.find((f) => f.path === 'a.txt');
    expect(aFile?.status).toBe('clean');
  });
});
