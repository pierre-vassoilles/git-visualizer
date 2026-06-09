/**
 * Tests Phase 2 : git switch
 * Spec : docs/specs/12-switch.md
 *
 * Principe : tests dérivés des spécifications (CA numérotés), pas de l'implémentation.
 */

import { describe, it, expect } from 'vitest';
import { newEngine, replay } from './helpers';
import type { GitEngine } from '@/core/engine';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

function engineWithTwoBranches(): GitEngine {
  const engine = replay([
    'git init',
    'write file.txt "on main"',
    'git add file.txt',
    'git commit -m "main commit"',
  ]);
  engine.execute('git branch feature');
  engine.execute('git checkout feature');
  engine.execute('write file.txt "on feature"');
  engine.execute('git add file.txt');
  engine.execute('git commit -m "feature commit"');
  engine.execute('git checkout main');
  return engine;
}

function engineWithCommit(): GitEngine {
  return replay([
    'git init',
    'write file.txt "hello"',
    'git add file.txt',
    'git commit -m "initial"',
  ]);
}

// ---------------------------------------------------------------------------
// CA-switch-01 : Basculer vers une branche existante
// ---------------------------------------------------------------------------

describe('git switch — CA-switch-01 : basculer vers une branche existante', () => {
  it('CA-switch-01 : exitCode 0, "Switched to branch", HEAD sur feature', () => {
    const engine = engineWithTwoBranches();

    const result = engine.execute('git switch feature');

    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes("Switched to branch 'feature'"))).toBe(true);

    const snap = engine.snapshot();
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') {
      expect(snap.head.name).toBe('feature');
    }
  });

  it('CA-switch-01 : prevBranch = "main" après switch main→feature', () => {
    const engine = engineWithTwoBranches();
    engine.execute('git switch feature');
    // On peut vérifier indirectement : switch - doit revenir sur main
    const result = engine.execute('git switch -');
    expect(result.exitCode).toBe(0);
    const snap = engine.snapshot();
    if (snap.head.type === 'branch') {
      expect(snap.head.name).toBe('main');
    }
  });
});

// ---------------------------------------------------------------------------
// CA-switch-02 : Créer et basculer avec -c
// ---------------------------------------------------------------------------

describe('git switch — CA-switch-02 : créer et basculer avec -c', () => {
  it('CA-switch-02 : exitCode 0, "Switched to a new branch", refs mis à jour', () => {
    const engine = engineWithCommit();
    const snapBefore = engine.snapshot();
    const mainHash = snapBefore.branches['main'] ?? '';

    const result = engine.execute('git switch -c newbranch');

    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes("Switched to a new branch 'newbranch'"))).toBe(true);

    const snap = engine.snapshot();
    expect('newbranch' in snap.branches).toBe(true);
    expect(snap.branches['newbranch']).toBe(mainHash);
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') {
      expect(snap.head.name).toBe('newbranch');
    }
  });
});

// ---------------------------------------------------------------------------
// CA-switch-03 : Détacher HEAD avec --detach
// ---------------------------------------------------------------------------

describe('git switch — CA-switch-03 : détacher HEAD avec --detach', () => {
  it('CA-switch-03 : HEAD détaché, output "detached HEAD", exitCode 0', () => {
    const engine = engineWithCommit();
    const snap0 = engine.snapshot();
    const commitHash = snap0.commits[0]?.hash ?? '';

    const result = engine.execute(`git switch --detach ${commitHash}`);

    expect(result.exitCode).toBe(0);
    expect(
      result.output.some(
        (l) =>
          l.toLowerCase().includes('detached head') ||
          l.toLowerCase().includes('switched to detached'),
      ),
    ).toBe(true);

    const snap = engine.snapshot();
    expect(snap.head.type).toBe('detached');
    if (snap.head.type === 'detached') {
      expect(snap.head.hash).toBe(commitHash);
    }
  });

  it('CA-switch-03 : avec hash court', () => {
    const engine = engineWithCommit();
    const snap0 = engine.snapshot();
    const shortH = snap0.commits[0]!.hash.slice(0, 7);

    const result = engine.execute(`git switch --detach ${shortH}`);
    expect(result.exitCode).toBe(0);
    const snap = engine.snapshot();
    expect(snap.head.type).toBe('detached');
  });
});

// ---------------------------------------------------------------------------
// CA-switch-04 : Revenir à la branche précédente
// ---------------------------------------------------------------------------

describe('git switch — CA-switch-04 : revenir à la branche précédente', () => {
  it('CA-switch-04 : switch - revient sur main après main→feature', () => {
    const engine = engineWithTwoBranches();
    engine.execute('git switch feature');

    const result = engine.execute('git switch -');

    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes("Switched to branch 'main'"))).toBe(true);

    const snap = engine.snapshot();
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') {
      expect(snap.head.name).toBe('main');
    }
  });
});

// ---------------------------------------------------------------------------
// CA-switch-05 : Erreur : branche inexistante
// ---------------------------------------------------------------------------

describe('git switch — CA-switch-05 : erreur branche inexistante', () => {
  it('CA-switch-05 : exitCode 1, message "invalid choice" ou "is not a tree"', () => {
    const engine = engineWithCommit();
    const snapBefore = engine.snapshot();

    const result = engine.execute('git switch nosuchbranch');

    expect(result.exitCode).toBe(1);
    expect(
      result.errors.some(
        (e) =>
          e.includes('invalid choice') ||
          e.includes('is not a tree') ||
          e.includes('nosuchbranch'),
      ),
    ).toBe(true);

    // HEAD inchangé
    const snapAfter = engine.snapshot();
    expect(snapAfter.head).toEqual(snapBefore.head);
  });
});

// ---------------------------------------------------------------------------
// CA-switch-06 : Erreur : changements locaux écrasés
// ---------------------------------------------------------------------------

describe('git switch — CA-switch-06 : erreur changements locaux écrasés', () => {
  it('CA-switch-06 : exitCode 1, "Your local changes", HEAD inchangé', () => {
    const engine = engineWithTwoBranches();
    // Modifier file.txt sans stager (modification non stagée)
    engine.execute('write file.txt "locally modified"');

    const snapBefore = engine.snapshot();
    const result = engine.execute('git switch feature');

    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes('Your local changes'))).toBe(true);

    const snapAfter = engine.snapshot();
    expect(snapAfter.head).toEqual(snapBefore.head);
  });
});

// ---------------------------------------------------------------------------
// CA-switch-07 : Erreur : -c avec branche existante
// ---------------------------------------------------------------------------

describe('git switch — CA-switch-07 : erreur -c avec branche existante', () => {
  it("CA-switch-07 : exitCode 1, 'already exists'", () => {
    const engine = engineWithCommit();
    const result = engine.execute('git switch -c main');

    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes("A branch named 'main' already exists."))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-switch-08 : Erreur : pas de branche précédente
// ---------------------------------------------------------------------------

describe('git switch — CA-switch-08 : erreur pas de branche précédente', () => {
  it('CA-switch-08 : exitCode 1, message "no previous branch"', () => {
    const engine = engineWithCommit();
    // Aucun switch → prevBranch null
    const result = engine.execute('git switch -');

    expect(result.exitCode).toBe(1);
    expect(
      result.errors.some((e) =>
        e.toLowerCase().includes('no previous branch'),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cas limites supplémentaires
// ---------------------------------------------------------------------------

describe('git switch — cas limites', () => {
  it('switch vers la même branche est idempotent (exitCode 0)', () => {
    const engine = engineWithCommit();
    const snapBefore = engine.snapshot();

    const result = engine.execute('git switch main');
    expect(result.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    expect(snapAfter.head).toEqual(snapBefore.head);
  });

  it('switch --detach vers commit inexistant retourne exitCode 1', () => {
    const engine = engineWithCommit();
    const result = engine.execute('git switch --detach abcdef1234567890abcdef1234567890abcdef12');
    expect(result.exitCode).toBe(1);
  });

  it('dépôt non initialisé retourne exitCode 128', () => {
    const engine = newEngine();
    const result = engine.execute('git switch main');
    expect(result.exitCode).toBe(128);
    expect(result.errors.some((e) => e.includes('not a git repository'))).toBe(true);
  });

  it('le working tree est mis à jour après switch', () => {
    const engine = engineWithTwoBranches();
    engine.execute('git switch feature');
    const snap = engine.snapshot();
    const fileEntry = snap.files.find((f) => f.path === 'file.txt');
    expect(fileEntry?.status).toBe('clean');
  });

  it('déterminisme : deux engines rejouant les mêmes commandes switch', () => {
    const cmds = [
      'git init',
      'write f.txt "v1"',
      'git add f.txt',
      'git commit -m "c1"',
      'git branch feat',
      'git switch feat',
    ];
    const e1 = replay(cmds);
    const e2 = replay(cmds);
    expect(e1.snapshot().head).toEqual(e2.snapshot().head);
    expect(e1.snapshot().branches).toEqual(e2.snapshot().branches);
  });
});
