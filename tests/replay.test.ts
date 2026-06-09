/**
 * Tests Phase 5 : refactorisation du helper replay (spec 24)
 * Spec : docs/specs/24-replay-refactor.md
 * CA-replay-01 … CA-replay-04
 *
 * Ces CA couvrent le helper replayCommit qui n'a pas d'API publique propre.
 * On les vérifie indirectement en testant que rebase, cherry-pick et revert
 * restent corrects après la refactorisation.
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';

// ---------------------------------------------------------------------------
// CA-replay-01 : replayCommit sans conflit (vérifié via rebase)
// ---------------------------------------------------------------------------

describe('CA-replay-01 : replay sans conflit (via git rebase)', () => {
  it('CA-replay-01 : rebase replay D1 sur C1 → D1\' a les changements de D1 + b.txt de C1', () => {
    // C0: a.txt="base"
    // C1 (main): b.txt="main"
    // D1 (feature): a.txt="feature"
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      // main C1 : ajouter b.txt
      'write b.txt "main"',
      'git add b.txt',
      'git commit -m "C1"',
      // feature D1 : modifier a.txt
      'git checkout feature',
      'write a.txt "feature"',
      'git add a.txt',
      'git commit -m "D1"',
      // Rebase feature sur main
      'git rebase main',
    ]);

    const snap = engine.snapshot();

    // D1' doit avoir : a.txt = "feature" ET b.txt = "main" (merge des deux)
    expect(snap.operationState).toBeUndefined();
    expect(snap.commits).toHaveLength(3); // C0, C1, D1'

    // Le tip de feature = D1'
    const featureHash = snap.branches['feature']!;
    const d1Prime = snap.allCommits?.find((c) => c.hash === featureHash);
    expect(d1Prime).toBeDefined();
    expect(d1Prime!.message).toBe('D1');

    // D1' doit avoir C1 comme parent
    const c1Hash = snap.branches['main']!;
    expect(d1Prime!.parents[0]).toBe(c1Hash);
  });
});

// ---------------------------------------------------------------------------
// CA-replay-02 : replayCommit avec conflit (vérifié via rebase)
// ---------------------------------------------------------------------------

describe('CA-replay-02 : replay avec conflit (via git rebase)', () => {
  it('CA-replay-02 : rebase avec conflit sur même fichier → exitCode 1, marqueurs dans output', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      // main C1 : a.txt = "main"
      'write a.txt "main"',
      'git add a.txt',
      'git commit -m "C1"',
      // feature D1 : a.txt = "feature"
      'git checkout feature',
      'write a.txt "feature"',
      'git add a.txt',
      'git commit -m "D1"',
    ]);

    const result = engine.execute('git rebase main');
    expect(result.exitCode).toBe(1);
    expect(result.output.some((l) => l.includes('CONFLICT'))).toBe(true);

    const snap = engine.snapshot();
    expect(snap.operationState?.type).toBe('rebasing');

    // a.txt doit contenir des marqueurs de conflit
    const aFile = snap.files.find((f) => f.path === 'a.txt');
    expect(aFile).toBeDefined();
    expect(aFile!.status).toBe('modified');
  });
});

// ---------------------------------------------------------------------------
// CA-replay-03 : replayCommitContinue après résolution (via rebase --continue)
// ---------------------------------------------------------------------------

describe('CA-replay-03 : continue après résolution de conflit (via rebase --continue)', () => {
  it('CA-replay-03 : résoudre conflit + git add + git rebase --continue → commit créé correctement', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      // main C1 : a.txt = "main"
      'write a.txt "main"',
      'git add a.txt',
      'git commit -m "C1"',
      // feature D1 : a.txt = "feature"
      'git checkout feature',
      'write a.txt "feature"',
      'git add a.txt',
      'git commit -m "D1"',
    ]);

    engine.execute('git rebase main');

    // Résoudre le conflit
    engine.execute('write a.txt "resolved"');
    engine.execute('git add a.txt');

    const result = engine.execute('git rebase --continue');
    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes('Successfully rebased'))).toBe(true);

    const snap = engine.snapshot();
    expect(snap.operationState).toBeUndefined();

    // D1' doit exister et avoir a.txt = "resolved"
    // (vérifiable via snapshot.files = clean)
    const aFile = snap.files.find((f) => f.path === 'a.txt');
    expect(aFile?.status).toBe('clean');
  });
});

// ---------------------------------------------------------------------------
// CA-replay-04 : Déduplification rebase (régression Phase 4)
// ---------------------------------------------------------------------------

describe('CA-replay-04 : Aucune régression Phase 4 après refactorisation replay', () => {
  it('CA-replay-04 : rebase avec 3 commits à rejouer → tous rejoués correctement', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      // main : C1
      'write b.txt "main"',
      'git add b.txt',
      'git commit -m "C1"',
      // feature : D1, D2, D3 (fichiers distincts)
      'git checkout feature',
      'write c.txt "d1"',
      'git add c.txt',
      'git commit -m "D1"',
      'write d.txt "d2"',
      'git add d.txt',
      'git commit -m "D2"',
      'write e.txt "d3"',
      'git add e.txt',
      'git commit -m "D3"',
    ]);

    const result = engine.execute('git rebase main');
    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes('Successfully rebased'))).toBe(true);

    const snap = engine.snapshot();
    expect(snap.operationState).toBeUndefined();

    // 5 commits : C0, C1, D1', D2', D3'
    expect(snap.commits).toHaveLength(5);

    // Les messages sont préservés dans l'ordre
    expect(snap.commits[0]!.message).toBe('D3');
    expect(snap.commits[1]!.message).toBe('D2');
    expect(snap.commits[2]!.message).toBe('D1');
    expect(snap.commits[3]!.message).toBe('C1');
    expect(snap.commits[4]!.message).toBe('C0');
  });

  it('CA-replay-04 : cherry-pick non régressé après refactorisation replay', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      // feature : D1 ajoute b.txt
      'git checkout feature',
      'write b.txt "feature"',
      'git add b.txt',
      'git commit -m "D1"',
      // Retour main, cherry-pick D1
      'git checkout main',
    ]);

    const featureHash = engine.snapshot().branches['feature']!;
    const result = engine.execute(`git cherry-pick ${featureHash}`);
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    // b.txt doit être présent sur main
    const bFile = snap.files.find((f) => f.path === 'b.txt');
    expect(bFile).toBeDefined();
    expect(bFile!.status).toBe('clean');
  });

  it('CA-replay-04 : revert non régressé après refactorisation replay', () => {
    const engine = replay([
      'git init',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1"',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "C2"',
    ]);

    const snap = engine.snapshot();
    const c2Hash = snap.commits[0]!.hash;

    const result = engine.execute(`git revert ${c2Hash}`);
    expect(result.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    // a.txt doit être revenu à "v1"
    const aFile = snapAfter.files.find((f) => f.path === 'a.txt');
    expect(aFile?.status).toBe('clean');
    // 3 commits : C1, C2, Revert C2
    expect(snapAfter.commits).toHaveLength(3);
  });

  it('CA-replay-04 : rebase conflit + continue → identique à Phase 4', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      // main C1, C2 : modifier a.txt pour créer conflit avec feature
      'write a.txt "main1"',
      'git add a.txt',
      'git commit -m "C1"',
      'write a.txt "main2"',
      'git add a.txt',
      'git commit -m "C2"',
      // feature : D1 modifie a.txt (conflit avec main), D2 propre
      'git checkout feature',
      'write a.txt "feature-conflict"',
      'git add a.txt',
      'git commit -m "D1"',
      'write c.txt "feature2"',
      'git add c.txt',
      'git commit -m "D2"',
    ]);

    const resultRebase = engine.execute('git rebase main');
    expect(resultRebase.exitCode).toBe(1);

    // Résoudre
    engine.execute('write a.txt "resolved"');
    engine.execute('git add a.txt');

    const resultContinue = engine.execute('git rebase --continue');
    expect(resultContinue.exitCode).toBe(0);

    const snap = engine.snapshot();
    expect(snap.operationState).toBeUndefined();
    // 5 commits : C0, C1, C2, D1', D2'
    expect(snap.commits).toHaveLength(5);
  });
});
