/**
 * Tests Phase 4 : révisions HEAD~n, isAncestor, mergeBase observés via les commandes
 * + correction git branch -d (vérification merge)
 *
 * Specs :
 *   docs/specs/18-revisions-helpers.md
 *     CA-revisions-01 … CA-revisions-07
 *     CA-branch-d-01 … CA-branch-d-02
 *
 * Principe : boîte noire via execute() + snapshot().
 * Les helpers internes (resolveCommitish, isAncestor, mergeBase) sont observés
 * indirectement via les commandes qui les utilisent (reset, merge, branch -d).
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';

// ---------------------------------------------------------------------------
// Helpers de construction
// ---------------------------------------------------------------------------

/** Dépôt avec 3 commits linéaires : C0 ← C1 ← C2, HEAD sur main/C2. */
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
// CA-revisions-01 : HEAD~1 résolu via reset (observable indirect)
// ---------------------------------------------------------------------------

describe('CA-revisions-01 : HEAD~1 remonte une generation', () => {
  it('CA-revisions-01 : git reset --hard HEAD~1 atterrit sur C1 (le parent de C2)', () => {
    const engine = threeCommitRepo();
    const snapBefore = engine.snapshot();
    // C2 est le commit le plus récent (index 0)
    const c2Hash = snapBefore.commits[0]!.hash;
    const c1Hash = snapBefore.commits[1]!.hash;

    const result = engine.execute('git reset --hard HEAD~1');
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    // HEAD doit pointer C1
    expect(snap.branches['main']).toBe(c1Hash);
    expect(snap.branches['main']).not.toBe(c2Hash);
  });
});

// ---------------------------------------------------------------------------
// CA-revisions-02 : branche~n résolu (main~2 → C0)
// ---------------------------------------------------------------------------

describe('CA-revisions-02 : main~2 remonte deux générations', () => {
  it('CA-revisions-02 : git reset --hard main~2 atterrit sur C0', () => {
    const engine = threeCommitRepo();
    const snapBefore = engine.snapshot();
    const c0Hash = snapBefore.commits[2]!.hash; // plus ancien

    const result = engine.execute('git reset --hard main~2');
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    expect(snap.branches['main']).toBe(c0Hash);
  });
});

// ---------------------------------------------------------------------------
// CA-revisions-03 : n trop grand → erreur (HEAD~5 sur un dépôt de 3 commits)
// ---------------------------------------------------------------------------

describe('CA-revisions-03 : n trop grand → erreur "unknown revision"', () => {
  it('CA-revisions-03 : git reset HEAD~5 renvoie exitCode 128 et "unknown revision"', () => {
    const engine = threeCommitRepo();
    const snapBefore = engine.snapshot();
    const headBefore = snapBefore.branches['main'];

    const result = engine.execute('git reset HEAD~5');
    expect(result.exitCode).toBe(128);
    expect(result.errors.some((e) => e.includes('unknown revision'))).toBe(true);

    // HEAD inchangé
    expect(engine.snapshot().branches['main']).toBe(headBefore);
  });
});

// ---------------------------------------------------------------------------
// CA-revisions-04 : isAncestor(C0, C2) = true (observé via merge fast-forward)
// ---------------------------------------------------------------------------

describe('CA-revisions-04 : isAncestor true (C0 est ancêtre de C2)', () => {
  it('CA-revisions-04 : merge fast-forward réussit quand HEAD est ancêtre du tip', () => {
    // Construire : C0 ← C1 ← C2 sur feature, main reste sur C0
    // Quand on merge feature sur main, c'est FF car main/C0 est ancêtre de feature/C2
    const engine = replay([
      'git init',
      'write a.txt "v0"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'git checkout feature',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1"',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "C2"',
      'git checkout main',
    ]);

    const result = engine.execute('git merge feature');
    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes('Fast-forward'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-revisions-05 : isAncestor false (branche divergente non ancêtre)
// ---------------------------------------------------------------------------

describe('CA-revisions-05 : isAncestor false → merge crée un commit à 2 parents', () => {
  it('CA-revisions-05 : branches divergentes → true merge, non fast-forward', () => {
    // C0 ← C1 (main), C0 ← C2 (feature) → divergent
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write b.txt "main-only"',
      'git add b.txt',
      'git commit -m "C1 on main"',
      'git checkout feature',
      'write c.txt "feature-only"',
      'git add c.txt',
      'git commit -m "C2 on feature"',
      'git checkout main',
    ]);

    const result = engine.execute('git merge feature');
    expect(result.exitCode).toBe(0);
    // Ce n'est pas un fast-forward
    expect(result.output.some((l) => l.includes('Fast-forward'))).toBe(false);

    const snap = engine.snapshot();
    // Le commit de tête doit avoir 2 parents (merge commit)
    const mergeCommit = snap.allCommits?.find(
      (c) => c.parents.length === 2,
    );
    expect(mergeCommit).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CA-revisions-06 : mergeBase deux commits linéaires (C0 ancêtre commun de C0 et C2)
// ---------------------------------------------------------------------------

describe('CA-revisions-06 : mergeBase commits linéaires → base commune', () => {
  it('CA-revisions-06 : merge de feature (C2) sur main (C0) avec base C0 → fast-forward', () => {
    // C0 ← C1 ← C2 (feature), main sur C0 → mergeBase(C0, C2) = C0
    // Puisque C0 === mergeBase, c'est un fast-forward (HEAD est ancêtre de C2)
    const engine = replay([
      'git init',
      'write a.txt "v0"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'git checkout feature',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1"',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "C2"',
      'git checkout main',
    ]);

    const result = engine.execute('git merge feature');
    expect(result.exitCode).toBe(0);
    // Pas de conflit, fast-forward (mergeBase = HEAD = C0)
    expect(result.output.some((l) => l.includes('Fast-forward'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-revisions-07 : mergeBase deux branches divergentes → ancêtre commun
// ---------------------------------------------------------------------------

describe('CA-revisions-07 : mergeBase branches divergentes → commit racine commun', () => {
  it('CA-revisions-07 : true merge sans conflit (fichiers distincts) → base C0 trouvée', () => {
    // C0 ← C1 (main, modifie b.txt), C0 ← C2 (feature, modifie c.txt)
    // mergeBase(C1, C2) doit trouver C0 → pas de conflit, merge commit
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write b.txt "main"',
      'git add b.txt',
      'git commit -m "C1"',
      'git checkout feature',
      'write c.txt "feature"',
      'git add c.txt',
      'git commit -m "C2"',
      'git checkout main',
    ]);

    const result = engine.execute('git merge feature');
    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes('Merge made by'))).toBe(true);

    const snap = engine.snapshot();
    const mergeCommit = snap.allCommits?.find((c) => c.parents.length === 2);
    expect(mergeCommit).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CA-branch-d-01 : Suppression branche mergée (Phase 4)
// ---------------------------------------------------------------------------

describe('CA-branch-d-01 : branch -d accepte une branche mergée', () => {
  it('CA-branch-d-01 : tip feature est ancêtre de HEAD main → suppression autorisée', () => {
    // Construire : C0 ← C1 ← C2 (main/HEAD), feature pointe C1 (ancêtre de main/C2)
    // feature/C1 est ancêtre de main/C2 → branche mergée, -d autorisé
    const engine = replay([
      'git init',
      'write a.txt "v0"',
      'git add a.txt',
      'git commit -m "C0"',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1"',
    ]);

    // Créer feature au tip actuel (C1), puis avancer main vers C2
    const snapMid = engine.snapshot();
    const c1Hash = snapMid.branches['main']!;

    engine.execute('git branch feature'); // feature pointe C1
    engine.execute('write a.txt "v2"');
    engine.execute('git add a.txt');
    engine.execute('git commit -m "C2"'); // main avance vers C2

    // main est sur C2, feature est sur C1, C1 est ancêtre de C2
    const snap = engine.snapshot();
    expect(snap.branches['feature']).toBe(c1Hash);
    expect(snap.branches['main']).not.toBe(c1Hash);

    const result = engine.execute('git branch -d feature');
    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes("Deleted branch"))).toBe(true);
    expect(result.output.some((l) => l.includes("feature"))).toBe(true);

    const snapAfter = engine.snapshot();
    expect('feature' in snapAfter.branches).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CA-branch-d-02 : Refus branche non mergée (Phase 4)
// ---------------------------------------------------------------------------

describe('CA-branch-d-02 : branch -d refuse une branche non mergée', () => {
  it('CA-branch-d-02 : branche divergente → exitCode 1, "not fully merged"', () => {
    // C0 ← C1 (main), C0 ← C2 (feature) → divergent, HEAD sur main
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write b.txt "main-side"',
      'git add b.txt',
      'git commit -m "C1 main"',
      'git checkout feature',
      'write c.txt "feature-side"',
      'git add c.txt',
      'git commit -m "C2 feature"',
      'git checkout main',
    ]);

    const snapBefore = engine.snapshot();
    const featureHashBefore = snapBefore.branches['feature'];

    const result = engine.execute('git branch -d feature');
    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes('not fully merged'))).toBe(true);

    // La branche n'est PAS supprimée
    const snap = engine.snapshot();
    expect('feature' in snap.branches).toBe(true);
    expect(snap.branches['feature']).toBe(featureHashBefore);
  });

  it('CA-branch-d-02 bis : -D force la suppression même non mergée', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write b.txt "main-side"',
      'git add b.txt',
      'git commit -m "C1 main"',
      'git checkout feature',
      'write c.txt "feature-side"',
      'git add c.txt',
      'git commit -m "C2 feature"',
      'git checkout main',
    ]);

    const result = engine.execute('git branch -D feature');
    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes("Deleted branch"))).toBe(true);

    const snap = engine.snapshot();
    expect('feature' in snap.branches).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Extra : HEAD~0 doit retourner HEAD lui-même
// ---------------------------------------------------------------------------

describe('HEAD~0 === HEAD', () => {
  it('git reset --hard HEAD~0 ne change pas HEAD', () => {
    const engine = threeCommitRepo();
    const snapBefore = engine.snapshot();
    const headBefore = snapBefore.branches['main'];

    const result = engine.execute('git reset --hard HEAD~0');
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    expect(snap.branches['main']).toBe(headBefore);
  });
});

// ---------------------------------------------------------------------------
// Extra : déterminisme — deux engines rejouant la même séquence → mêmes hashes
// ---------------------------------------------------------------------------

describe('Déterminisme des hashes avec merge', () => {
  it('deux engines identiques → mêmes hashes après merge', () => {
    const cmds = [
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write b.txt "main"',
      'git add b.txt',
      'git commit -m "C1"',
      'git checkout feature',
      'write c.txt "feature"',
      'git add c.txt',
      'git commit -m "C2"',
      'git checkout main',
      'git merge feature',
    ];

    const engine1 = replay(cmds);
    const engine2 = replay(cmds);

    const snap1 = engine1.snapshot();
    const snap2 = engine2.snapshot();

    expect(snap1.branches['main']).toBe(snap2.branches['main']);
    expect(snap1.allCommits?.map((c) => c.hash)).toEqual(snap2.allCommits?.map((c) => c.hash));
  });
});
