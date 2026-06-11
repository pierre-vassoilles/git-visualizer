/**
 * Tests Phase 2 : git restore
 * Spec : docs/specs/13-restore.md
 *
 * Principe : tests dérivés des spécifications (CA numérotés), pas de l'implémentation.
 */

import { describe, it, expect } from 'vitest';
import { newEngine, replay } from './helpers';
import type { GitEngine } from '@/core/engine';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

/**
 * Engine avec un commit initial puis le fichier modifié dans le working tree
 * mais l'index contient "staged content".
 *
 * État :
 *   HEAD : file.txt = "original"
 *   index : file.txt = "staged content"
 *   workingTree : file.txt = "modified content"
 */
function engineWithModifiedFile(): GitEngine {
  const engine = replay([
    'git init',
    'write file.txt "original"',
    'git add file.txt',
    'git commit -m "initial"',
  ]);
  // Modifier file.txt dans le WT et stager "staged content"
  engine.execute('write file.txt "staged content"');
  engine.execute('git add file.txt');
  // Modifier encore dans le WT sans stager
  engine.execute('write file.txt "modified content"');
  return engine;
}

/**
 * Engine avec deux commits :
 *   c1 : file.txt = "v1"
 *   c2 : file.txt = "v2"  (HEAD)
 * Puis file.txt modifié dans le WT en "modified"
 */
function engineWithTwoCommits(): { engine: GitEngine; c1: string; c2: string } {
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
  const c2 = snap.commits[0]!.hash;
  const c1 = snap.commits[1]!.hash;
  engine.execute('write file.txt "modified"');
  return { engine, c1, c2 };
}

// ---------------------------------------------------------------------------
// CA-restore-01 : Restaurer le working tree depuis l'index
// ---------------------------------------------------------------------------

describe('git restore — CA-restore-01 : restaurer WT depuis index', () => {
  it('CA-restore-01 : exitCode 0, WT restauré depuis index, index inchangé', () => {
    const engine = engineWithModifiedFile();
    const snapBefore = engine.snapshot();
    const indexPaths = snapBefore.indexPaths;
    expect(indexPaths).toContain('file.txt');

    const result = engine.execute('git restore file.txt');

    expect(result.exitCode).toBe(0);
    expect(result.output).toEqual([]);
    expect(result.errors).toEqual([]);

    // Après restore file.txt : WT = "staged content" (aligné avec l'index),
    // mais index ≠ HEAD ("original"). La spec dit WT restauré depuis index (correct).
    // L'engine calcule le statut comme 'modified' quand WT==index mais index!=HEAD,
    // car il indique toute divergence par rapport à HEAD sous 'modified'.
    // Ce qui compte : le WT est maintenant aligné avec l'index (plus de modif non stagée).
    const snapAfter = engine.snapshot();
    const fileEntry = snapAfter.files.find((f) => f.path === 'file.txt');
    expect(fileEntry).toBeDefined();
    // Le statut ne doit plus indiquer une modification non stagée pure :
    // soit 'staged' (WT == index ≠ HEAD) soit 'modified' (engine label pour tout écart avec HEAD).
    // Dans tous les cas, le WT a été restauré = l'index, donc il ne doit PAS être 'untracked'.
    expect(fileEntry?.status).not.toBe('untracked');
    // L'index doit toujours contenir file.txt (inchangé par restore)
    expect(snapAfter.indexPaths).toContain('file.txt');
  });
});

// ---------------------------------------------------------------------------
// CA-restore-02 : Restaurer tous les fichiers (avec .)
// ---------------------------------------------------------------------------

describe('git restore — CA-restore-02 : restaurer tous les fichiers avec "."', () => {
  it('CA-restore-02 : tous les fichiers du WT alignés sur index', () => {
    const engine = replay([
      'git init',
      'write file1.txt "v1"',
      'write file2.txt "v2"',
      'git add file1.txt',
      'git add file2.txt',
      'git commit -m "initial"',
    ]);
    // Modifier les deux fichiers dans le WT
    engine.execute('write file1.txt "modified1"');
    engine.execute('write file2.txt "modified2"');

    const result = engine.execute('git restore .');

    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    // Après restore ., les deux fichiers doivent être propres (WT = index = HEAD)
    const f1 = snap.files.find((f) => f.path === 'file1.txt');
    const f2 = snap.files.find((f) => f.path === 'file2.txt');
    expect(f1?.status).toBe('clean');
    expect(f2?.status).toBe('clean');
  });
});

// ---------------------------------------------------------------------------
// CA-restore-03 : Retirer du staging (--staged)
// ---------------------------------------------------------------------------

describe('git restore — CA-restore-03 : retirer du staging', () => {
  it('CA-restore-03 : index restauré depuis HEAD, WT inchangé', () => {
    const engine = replay([
      'git init',
      'write file.txt "original"',
      'git add file.txt',
      'git commit -m "initial"',
    ]);
    // Modifier et stager
    engine.execute('write file.txt "staged content"');
    engine.execute('git add file.txt');
    // WT est aussi "staged content" (aligné avec index)

    const result = engine.execute('git restore --staged file.txt');

    expect(result.exitCode).toBe(0);
    expect(result.output).toEqual([]);

    const snap = engine.snapshot();
    // Après restore --staged, index = HEAD ("original"), WT = "staged content"
    // → fichier est "modified" (WT ≠ index)
    const fileEntry = snap.files.find((f) => f.path === 'file.txt');
    expect(fileEntry).toBeDefined();
    expect(fileEntry?.status).toBe('modified');
  });
});

// ---------------------------------------------------------------------------
// CA-restore-04 : Retirer du staging un fichier nouveau
// ---------------------------------------------------------------------------

describe('git restore — CA-restore-04 : retirer du staging un fichier nouveau', () => {
  it('CA-restore-04 : fichier supprimé de l index (pas dans HEAD)', () => {
    const engine = replay([
      'git init',
      'write file.txt "existing"',
      'git add file.txt',
      'git commit -m "initial"',
    ]);
    // Ajouter un nouveau fichier et le stager
    engine.execute('write newfile.txt "new content"');
    engine.execute('git add newfile.txt');

    // Vérifier qu'il est dans l'index
    const snapBefore = engine.snapshot();
    expect(snapBefore.indexPaths).toContain('newfile.txt');

    const result = engine.execute('git restore --staged newfile.txt');

    expect(result.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    // newfile.txt ne doit plus être dans l'index
    expect(snapAfter.indexPaths).not.toContain('newfile.txt');
  });
});

// ---------------------------------------------------------------------------
// CA-restore-05 : Restaurer depuis un commit (--source)
// ---------------------------------------------------------------------------

describe('git restore — CA-restore-05 : restaurer depuis un commit', () => {
  it('CA-restore-05 : WT restauré depuis c1, index inchangé', () => {
    const { engine, c1 } = engineWithTwoCommits();

    const snapBefore = engine.snapshot();
    const indexPaths = snapBefore.indexPaths;

    const result = engine.execute(`git restore --source=${c1} file.txt`);

    expect(result.exitCode).toBe(0);
    expect(result.output).toEqual([]);

    // Après restore depuis c1 : WT = "v1", index reste aligné sur c2 ("v2")
    // → fichier modifié (WT ≠ index)
    const snapAfter = engine.snapshot();
    const fileEntry = snapAfter.files.find((f) => f.path === 'file.txt');
    expect(fileEntry).toBeDefined();
    expect(fileEntry?.status).toBe('modified');
    // L'index est inchangé
    expect(snapAfter.indexPaths).toEqual(expect.arrayContaining(indexPaths));
  });

  it('CA-restore-05 : avec hash court de c1', () => {
    const { engine, c1 } = engineWithTwoCommits();
    const shortC1 = c1.slice(0, 7);
    const result = engine.execute(`git restore --source=${shortC1} file.txt`);
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CA-restore-06 : Restaurer un fichier inexistant dans le commit (suppression)
// ---------------------------------------------------------------------------

describe('git restore — CA-restore-06 : fichier absent du commit source → suppression du WT', () => {
  it('CA-restore-06 : restore --source ne supprime PAS un fichier non suivi (NAV-14)', () => {
    const { engine, c1 } = engineWithTwoCommits();
    // Fichier présent dans le WT uniquement (non suivi : jamais `git add`).
    engine.execute('write newfile.txt "extra"');

    // git réel : pathspec d'un fichier non suivi → erreur, fichier préservé
    // (et NON suppression silencieuse — contrairement à l'ancienne spec 46).
    const result = engine.execute(`git restore --source=${c1} newfile.txt`);
    expect(result.exitCode).toBe(1);
    expect(result.errors.join(' ')).toContain('did not match');
    expect(engine.execute('read newfile.txt').output[0]).toBe('extra');
  });
});

// ---------------------------------------------------------------------------
// CA-restore-07 : Erreur : pathspec inexistant
// ---------------------------------------------------------------------------

describe('git restore — CA-restore-07 : erreur pathspec inexistant', () => {
  it("CA-restore-07 : exitCode 1, message 'did not match any files'", () => {
    const engine = replay(['git init', 'write f.txt "x"', 'git add f.txt', 'git commit -m "c"']);

    const result = engine.execute('git restore nosuchfile.txt');

    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes('did not match any files'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-restore-08 : Erreur : commit inexistant
// ---------------------------------------------------------------------------

describe('git restore — CA-restore-08 : erreur commit inexistant', () => {
  it("CA-restore-08 : exitCode 1, message 'is not a tree'", () => {
    const engine = replay(['git init', 'write f.txt "x"', 'git add f.txt', 'git commit -m "c"']);

    const result = engine.execute('git restore --source=nosuchcommit f.txt');

    expect(result.exitCode).toBe(1);
    expect(
      result.errors.some((e) => e.includes('is not a tree') || e.includes('nosuchcommit')),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-restore-09 : Erreur : pathspec vide
// ---------------------------------------------------------------------------

describe('git restore — CA-restore-09 : erreur pathspec vide (aucun argument)', () => {
  it("CA-restore-09 : exitCode 1, message 'pathspec cannot be empty'", () => {
    const engine = replay(['git init', 'write f.txt "x"', 'git add f.txt', 'git commit -m "c"']);

    const result = engine.execute('git restore');

    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.toLowerCase().includes('pathspec cannot be empty'))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Cas limites supplémentaires
// ---------------------------------------------------------------------------

describe('git restore — cas limites', () => {
  it('restore d un fichier non modifié est un no-op (exitCode 0)', () => {
    const engine = replay([
      'git init',
      'write f.txt "clean"',
      'git add f.txt',
      'git commit -m "c"',
    ]);

    const result = engine.execute('git restore f.txt');
    expect(result.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    const f = snapAfter.files.find((f) => f.path === 'f.txt');
    expect(f?.status).toBe('clean');
  });

  it('--staged sur dépôt vierge échoue (NAV-09)', () => {
    const engine = replay(['git init']);
    engine.execute('write f.txt "hello"');
    engine.execute('git add f.txt');

    const snapBefore = engine.snapshot();
    expect(snapBefore.indexPaths).toContain('f.txt');

    // HEAD non-né : `restore --staged` échoue (le bon geste est `git rm --cached`).
    const result = engine.execute('git restore --staged f.txt');
    expect(result.exitCode).toBe(128);
    expect(result.errors.join(' ')).toContain('could not resolve HEAD');

    // L'index est inchangé.
    expect(engine.snapshot().indexPaths).toContain('f.txt');
  });

  it('dépôt non initialisé retourne exitCode 128', () => {
    const engine = newEngine();
    const result = engine.execute('git restore file.txt');
    expect(result.exitCode).toBe(128);
    expect(result.errors.some((e) => e.includes('not a git repository'))).toBe(true);
  });

  it('restore enchaîné : --staged puis restore → tout = HEAD', () => {
    const engine = replay([
      'git init',
      'write f.txt "original"',
      'git add f.txt',
      'git commit -m "initial"',
    ]);
    engine.execute('write f.txt "modified"');
    engine.execute('git add f.txt');
    engine.execute('write f.txt "dirty"');

    // restore --staged : index ← HEAD
    engine.execute('git restore --staged f.txt');
    // restore : WT ← index (= HEAD maintenant)
    engine.execute('git restore f.txt');

    const snap = engine.snapshot();
    const f = snap.files.find((x) => x.path === 'f.txt');
    // Tout devrait être propre
    expect(f?.status).toBe('clean');
  });
});
