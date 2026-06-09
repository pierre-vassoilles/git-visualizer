/**
 * Tests Phase 2 : git checkout
 * Spec : docs/specs/11-checkout.md
 *
 * Principe : tests dérivés des spécifications (CA numérotés), pas de l'implémentation.
 * On vérifie le comportement attendu via execute() + snapshot() (boîte noire).
 */

import { describe, it, expect } from 'vitest';
import { newEngine, replay } from './helpers';
import type { GitEngine } from '@/core/engine';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

/**
 * Crée un engine avec deux branches (main et feature) ayant des arbres différents.
 * - main : file.txt = "on main"
 * - feature : file.txt = "on feature"
 */
function engineWithTwoBranches(): GitEngine {
  const engine = replay([
    'git init',
    'write file.txt "on main"',
    'git add file.txt',
    'git commit -m "main commit"',
  ]);
  engine.execute('git branch feature');
  // Modifier le fichier sur main pour que les deux branches diffèrent au prochain commit
  // Mais pour l'instant feature pointe sur le même commit que main.
  // On va créer une divergence en travaillant sur feature.
  engine.execute('git checkout feature');
  engine.execute('write file.txt "on feature"');
  engine.execute('git add file.txt');
  engine.execute('git commit -m "feature commit"');
  // Revenir sur main
  engine.execute('git checkout main');
  return engine;
}

/** Engine avec trois commits sur main, retourne aussi les hashes. */
function engineWithThreeCommits(): { engine: GitEngine; hashes: string[] } {
  const engine = replay(['git init']);
  const hashes: string[] = [];

  for (let i = 1; i <= 3; i++) {
    engine.execute(`write file.txt "version ${i}"`);
    engine.execute('git add file.txt');
    engine.execute(`git commit -m "commit ${i}"`);
  }
  // Récupérer les hashes du plus récent au plus ancien
  const snap = engine.snapshot();
  for (const c of snap.commits) {
    hashes.push(c.hash);
  }
  return { engine, hashes };
}

// ---------------------------------------------------------------------------
// CA-checkout-01 : Basculer vers une branche existante
// ---------------------------------------------------------------------------

describe('git checkout — CA-checkout-01 : basculer vers une branche existante', () => {
  it('CA-checkout-01 : HEAD sur feature, prevBranch=main, output "Switched to branch"', () => {
    const engine = engineWithTwoBranches();
    // HEAD est sur main, on bascule vers feature
    const result = engine.execute('git checkout feature');

    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes("Switched to branch 'feature'"))).toBe(true);

    const snap = engine.snapshot();
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') {
      expect(snap.head.name).toBe('feature');
    }
    // Les fichiers du working tree doivent correspondre à feature
    expect(snap.files.some((f) => f.path === 'file.txt' && f.status === 'clean')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-checkout-02 : Créer et basculer avec -b
// ---------------------------------------------------------------------------

describe('git checkout — CA-checkout-02 : créer et basculer avec -b', () => {
  it('CA-checkout-02 : exitCode 0, output "new branch", HEAD sur newbranch', () => {
    const engine = replay([
      'git init',
      'write file.txt "hello"',
      'git add file.txt',
      'git commit -m "initial"',
    ]);
    const snapBefore = engine.snapshot();
    const mainHash = snapBefore.branches['main'] ?? '';

    const result = engine.execute('git checkout -b newbranch');

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
// CA-checkout-03 : Détacher HEAD sur un commit
// ---------------------------------------------------------------------------

describe('git checkout — CA-checkout-03 : détacher HEAD sur un commit', () => {
  it('CA-checkout-03 : HEAD détaché, output "Note: switching", prevBranch=main', () => {
    const { engine, hashes } = engineWithThreeCommits();
    // hashes[0] = commit 3 (le plus récent), hashes[2] = commit 1 (le plus ancien)
    const targetHash = hashes[1]!; // commit 2

    const result = engine.execute(`git checkout ${targetHash}`);

    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes('Note: switching to'))).toBe(true);

    const snap = engine.snapshot();
    expect(snap.head.type).toBe('detached');
    if (snap.head.type === 'detached') {
      expect(snap.head.hash).toBe(targetHash);
    }
  });

  it('CA-checkout-03 : avec hash court (7 chars)', () => {
    const { engine, hashes } = engineWithThreeCommits();
    const shortH = hashes[1]!.slice(0, 7);

    const result = engine.execute(`git checkout ${shortH}`);
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    expect(snap.head.type).toBe('detached');
  });
});

// ---------------------------------------------------------------------------
// CA-checkout-04 : Revenir à la branche précédente
// ---------------------------------------------------------------------------

describe('git checkout — CA-checkout-04 : revenir à la branche précédente', () => {
  it('CA-checkout-04 : checkout - revient sur feature après détachement depuis feature', () => {
    const engine = engineWithTwoBranches();
    // Aller sur feature, puis détacher HEAD
    engine.execute('git checkout feature');
    const snap = engine.snapshot();
    const featureHash = snap.branches['feature'] ?? '';
    engine.execute(`git checkout ${featureHash}`);

    // HEAD est maintenant détaché, prevBranch devrait être "feature"
    const result = engine.execute('git checkout -');

    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes("Switched to branch 'feature'"))).toBe(true);

    const snapFinal = engine.snapshot();
    expect(snapFinal.head.type).toBe('branch');
    if (snapFinal.head.type === 'branch') {
      expect(snapFinal.head.name).toBe('feature');
    }
  });

  it('CA-checkout-04 : checkout - depuis une branche revient sur la précédente', () => {
    const engine = engineWithTwoBranches();
    // main → feature
    engine.execute('git checkout feature');
    // feature → main (checkout -)
    const result = engine.execute('git checkout -');
    expect(result.exitCode).toBe(0);
    const snap = engine.snapshot();
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') {
      expect(snap.head.name).toBe('main');
    }
  });
});

// ---------------------------------------------------------------------------
// CA-checkout-05 : Erreur : branche inexistante
// ---------------------------------------------------------------------------

describe('git checkout — CA-checkout-05 : erreur branche inexistante', () => {
  it('CA-checkout-05 : exitCode 1, message "did not match" ou "is not a tree"', () => {
    const engine = replay([
      'git init',
      'write f.txt "x"',
      'git add f.txt',
      'git commit -m "c"',
    ]);
    const snapBefore = engine.snapshot();

    const result = engine.execute('git checkout nosuchbranch');

    expect(result.exitCode).toBe(1);
    expect(
      result.errors.some(
        (e) => e.includes('did not match any file') || e.includes('is not a tree') || e.includes('reference'),
      ),
    ).toBe(true);

    // HEAD inchangé
    const snapAfter = engine.snapshot();
    expect(snapAfter.head).toEqual(snapBefore.head);
  });
});

// ---------------------------------------------------------------------------
// CA-checkout-06 : Erreur : changements locaux écrasés
// ---------------------------------------------------------------------------

describe('git checkout — CA-checkout-06 : erreur changements locaux écrasés', () => {
  it('CA-checkout-06 : exitCode 1, "Your local changes", HEAD inchangé', () => {
    const engine = engineWithTwoBranches();
    // HEAD est sur main. Modifier file.txt sans stager
    engine.execute('write file.txt "locally modified"');

    const snapBefore = engine.snapshot();
    const result = engine.execute('git checkout feature');

    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes('Your local changes'))).toBe(true);
    expect(result.errors.some((e) => e.includes('file.txt'))).toBe(true);

    // HEAD inchangé
    const snapAfter = engine.snapshot();
    expect(snapAfter.head).toEqual(snapBefore.head);
  });
});

// ---------------------------------------------------------------------------
// CA-checkout-07 : Erreur : -b avec branche existante
// ---------------------------------------------------------------------------

describe('git checkout — CA-checkout-07 : erreur -b avec branche existante', () => {
  it("CA-checkout-07 : exitCode 1, message 'already exists'", () => {
    const engine = replay([
      'git init',
      'write f.txt "x"',
      'git add f.txt',
      'git commit -m "c"',
    ]);
    const result = engine.execute('git checkout -b main');

    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes("A branch named 'main' already exists."))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-checkout-08 : Erreur : pas de branche précédente
// ---------------------------------------------------------------------------

describe('git checkout — CA-checkout-08 : erreur pas de branche précédente', () => {
  it('CA-checkout-08 : exitCode 1, message "no previous branch"', () => {
    const engine = replay([
      'git init',
      'write f.txt "x"',
      'git add f.txt',
      'git commit -m "c"',
    ]);
    // Aucun changement de branche → prevBranch = null
    const result = engine.execute('git checkout -');

    expect(result.exitCode).toBe(1);
    expect(
      result.errors.some(
        (e) =>
          e.toLowerCase().includes('no previous branch') ||
          e.toLowerCase().includes('not currently on a branch'),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-checkout-09 : Basculer vers la même branche (idempotent)
// ---------------------------------------------------------------------------

describe('git checkout — CA-checkout-09 : basculer vers la même branche (idempotent)', () => {
  it('CA-checkout-09 : exitCode 0, HEAD inchangé', () => {
    const engine = replay([
      'git init',
      'write f.txt "x"',
      'git add f.txt',
      'git commit -m "c"',
    ]);
    const snapBefore = engine.snapshot();

    const result = engine.execute('git checkout main');

    expect(result.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    expect(snapAfter.head).toEqual(snapBefore.head);
  });
});

// ---------------------------------------------------------------------------
// CA-checkout-10 : Détacher HEAD puis basculer vers une branche
// ---------------------------------------------------------------------------

describe('git checkout — CA-checkout-10 : HEAD détaché puis basculer vers une branche', () => {
  it('CA-checkout-10 : basculer de HEAD détaché vers feature réussit', () => {
    const engine = engineWithTwoBranches();
    const snap0 = engine.snapshot();
    const mainHash = snap0.branches['main'] ?? '';

    // Détacher HEAD sur main
    engine.execute(`git checkout ${mainHash}`);
    // Maintenant basculer vers feature
    const result = engine.execute('git checkout feature');

    expect(result.exitCode).toBe(0);
    const snap = engine.snapshot();
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') {
      expect(snap.head.name).toBe('feature');
    }
  });
});

// ---------------------------------------------------------------------------
// CA-checkout-11 : --detach explicite
// ---------------------------------------------------------------------------

describe('git checkout — CA-checkout-11 : --detach explicite', () => {
  it('CA-checkout-11 : HEAD détaché après --detach <commit>', () => {
    const { engine, hashes } = engineWithThreeCommits();
    const targetHash = hashes[1]!;

    const result = engine.execute(`git checkout --detach ${targetHash}`);

    expect(result.exitCode).toBe(0);
    const snap = engine.snapshot();
    expect(snap.head.type).toBe('detached');
    if (snap.head.type === 'detached') {
      expect(snap.head.hash).toBe(targetHash);
    }
  });
});

// ---------------------------------------------------------------------------
// Cas limites supplémentaires
// ---------------------------------------------------------------------------

describe('git checkout — cas limites', () => {
  it('working tree mis à jour après checkout (fichiers différents entre branches)', () => {
    const engine = engineWithTwoBranches();
    // Sur main : file.txt = "on main"
    engine.execute('git checkout feature');
    // Vérifier le contenu via snapshot files
    const snap = engine.snapshot();
    // Le fichier doit être clean (aligné sur feature)
    const fileEntry = snap.files.find((f) => f.path === 'file.txt');
    expect(fileEntry).toBeDefined();
    expect(fileEntry?.status).toBe('clean');
  });

  it('prevBranch est mis à jour correctement après checkout branch→branch', () => {
    const engine = engineWithTwoBranches();
    // Checkout feature depuis main
    engine.execute('git checkout feature');
    // Checkout - doit revenir sur main
    const result = engine.execute('git checkout -');
    expect(result.exitCode).toBe(0);
    const snap = engine.snapshot();
    expect(snap.head.type === 'branch' && snap.head.name === 'main').toBe(true);
  });

  it('checkout d un commit inexistant retourne exitCode 1', () => {
    const engine = replay([
      'git init',
      'write f.txt "x"',
      'git add f.txt',
      'git commit -m "c"',
    ]);
    const result = engine.execute('git checkout abcdef1234567890abcdef1234567890abcdef12');
    expect(result.exitCode).toBe(1);
  });

  it('dépôt non initialisé retourne exitCode 128', () => {
    const engine = newEngine();
    const result = engine.execute('git checkout main');
    expect(result.exitCode).toBe(128);
    expect(result.errors.some((e) => e.includes('not a git repository'))).toBe(true);
  });

  it('déterminisme : deux engines avec checkout produisent le même snapshot', () => {
    const cmds = [
      'git init',
      'write f.txt "v1"',
      'git add f.txt',
      'git commit -m "c1"',
      'git branch feat',
      'git checkout feat',
    ];
    const e1 = replay(cmds);
    const e2 = replay(cmds);
    const s1 = e1.snapshot();
    const s2 = e2.snapshot();
    expect(s1.head).toEqual(s2.head);
    expect(s1.branches).toEqual(s2.branches);
    expect(s1.commits[0]?.hash).toBe(s2.commits[0]?.hash);
  });
});

// ---------------------------------------------------------------------------
// Non-régression B1 (revue QA Phase 2) : préservation des fichiers untracked
// lors d'une bascule de HEAD. Un fichier non tracké ne doit pas être supprimé.
// ---------------------------------------------------------------------------

describe('checkout — préservation des fichiers non trackés (B1)', () => {
  it('un fichier untracked survit à un checkout de branche', () => {
    const engine = replay([
      'git init',
      'write tracked.txt "v1"',
      'git add tracked.txt',
      'git commit -m "base"',
      'git branch feature',
      // Fichier non tracké (jamais add) :
      'write notes.txt "brouillon"',
    ]);

    engine.execute('git checkout feature');

    // Le fichier non tracké doit toujours être présent et lisible.
    const read = engine.execute('read notes.txt');
    expect(read.exitCode).toBe(0);
    expect(read.output[0]).toBe('brouillon');

    const snap = engine.snapshot();
    const notes = snap.files.find((f) => f.path === 'notes.txt');
    expect(notes?.status).toBe('untracked');
  });

  it('un fichier untracked survit à un détachement puis retour sur la branche', () => {
    const engine = replay([
      'git init',
      'write a.txt "a"',
      'git add a.txt',
      'git commit -m "c1"',
      'write scratch.txt "tmp"',
    ]);
    const head = engine.snapshot().commits[0]!.hash;

    engine.execute(`git checkout ${head}`); // détaché
    engine.execute('git checkout -'); // retour

    const read = engine.execute('read scratch.txt');
    expect(read.exitCode).toBe(0);
    expect(read.output[0]).toBe('tmp');
  });
});
