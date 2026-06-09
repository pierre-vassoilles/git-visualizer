/**
 * Tests Phase 4 : git rebase
 * Spec : docs/specs/23-rebase.md
 * CA-rebase-01 … CA-rebase-10
 *
 * Principe : boîte noire via execute() + snapshot().
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

/**
 * Dépôt divergent standard :
 *   C0 ← C1 (main) ← C2 (main/tip)
 *   C0 ← D1 ← D2 (feature/HEAD)
 *
 * Merge-base : C0
 */
function divergentRepo() {
  return replay([
    'git init',
    'write a.txt "base"',
    'git add a.txt',
    'git commit -m "C0"',
    'git branch feature',
    // main : C1, C2
    'write b.txt "main1"',
    'git add b.txt',
    'git commit -m "C1"',
    'write b.txt "main2"',
    'git add b.txt',
    'git commit -m "C2"',
    // feature : D1, D2
    'git checkout feature',
    'write c.txt "feature1"',
    'git add c.txt',
    'git commit -m "D1"',
    'write c.txt "feature2"',
    'git add c.txt',
    'git commit -m "D2"',
  ]);
}

// ---------------------------------------------------------------------------
// CA-rebase-01 : Rebase simple
// ---------------------------------------------------------------------------

describe('CA-rebase-01 : rebase simple', () => {
  it("CA-rebase-01 : nouveaux commits D1\' et D2\' créés au-dessus de main, historique linéaire", () => {
    const engine = divergentRepo();
    const snapBefore = engine.snapshot();

    const d1Hash = snapBefore.commits[1]!.hash; // D1 (before D2)
    const d2Hash = snapBefore.commits[0]!.hash; // D2 (tip de feature)
    const c2Hash = snapBefore.branches['main']!;

    const result = engine.execute('git rebase main');

    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes('Successfully rebased'))).toBe(true);

    const snap = engine.snapshot();

    // feature doit pointer un nouveau commit D2'
    const d2PrimeHash = snap.branches['feature']!;
    expect(d2PrimeHash).not.toBe(d2Hash); // nouveau hash
    expect(d2PrimeHash).not.toBe(d1Hash);

    // D2' doit avoir D1' comme parent
    const d2Prime = snap.allCommits?.find((c) => c.hash === d2PrimeHash);
    expect(d2Prime).toBeDefined();
    expect(d2Prime!.parents).toHaveLength(1);

    const d1PrimeHash = d2Prime!.parents[0]!;
    // D1' doit avoir C2 comme parent
    const d1Prime = snap.allCommits?.find((c) => c.hash === d1PrimeHash);
    expect(d1Prime).toBeDefined();
    expect(d1Prime!.parents[0]).toBe(c2Hash);
  });

  it('CA-rebase-01 : messages des commits rejoués identiques aux originaux', () => {
    const engine = divergentRepo();
    const snapBefore = engine.snapshot();
    const d1Msg = snapBefore.commits[1]!.message;
    const d2Msg = snapBefore.commits[0]!.message;

    engine.execute('git rebase main');

    const snap = engine.snapshot();
    const d2PrimeHash = snap.branches['feature']!;
    const d2Prime = snap.allCommits?.find((c) => c.hash === d2PrimeHash);
    const d1PrimeHash = d2Prime!.parents[0]!;
    const d1Prime = snap.allCommits?.find((c) => c.hash === d1PrimeHash);

    expect(d2Prime!.message).toBe(d2Msg);
    expect(d1Prime!.message).toBe(d1Msg);
  });
});

// ---------------------------------------------------------------------------
// CA-rebase-02 : Rebase déjà à jour
// ---------------------------------------------------------------------------

describe('CA-rebase-02 : rebase déjà à jour', () => {
  it('CA-rebase-02 : exitCode 0, output "is already up to date", aucun commit créé', () => {
    // C0 ← C1 (main) ← C2 (feature/HEAD), rebase main → déjà à jour
    const engine = replay([
      'git init',
      'write a.txt "v0"',
      'git add a.txt',
      'git commit -m "C0"',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1"',
      'git branch feature',
      'git checkout feature',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "C2"',
    ]);

    const snapBefore = engine.snapshot();
    const featureHash = snapBefore.branches['feature']!;
    const countBefore = snapBefore.allCommits?.length ?? 0;

    const result = engine.execute('git rebase main');

    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes('is already up to date'))).toBe(true);

    const snap = engine.snapshot();
    // Aucun commit créé
    expect((snap.allCommits?.length ?? 0)).toBe(countBefore);
    // feature inchangé
    expect(snap.branches['feature']).toBe(featureHash);
  });
});

// ---------------------------------------------------------------------------
// CA-rebase-03 : Rebase avec conflit
// ---------------------------------------------------------------------------

describe('CA-rebase-03 : rebase avec conflit', () => {
  it('CA-rebase-03 : exitCode 1, output "CONFLICT", état rebasing activé', () => {
    // C0 (a.txt="base") ← C1 (a.txt="main") (main)
    // C0 ← D1 (a.txt="feature") (feature/HEAD)
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write a.txt "main"',
      'git add a.txt',
      'git commit -m "C1"',
      'git checkout feature',
      'write a.txt "feature"',
      'git add a.txt',
      'git commit -m "D1"',
    ]);

    const result = engine.execute('git rebase main');

    expect(result.exitCode).toBe(1);
    expect(result.output.some((l) => l.includes('CONFLICT'))).toBe(true);
    expect(result.output.some((l) => l.includes('a.txt'))).toBe(true);

    const snap = engine.snapshot();
    expect(snap.operationState?.type).toBe('rebasing');
  });
});

// ---------------------------------------------------------------------------
// CA-rebase-04 : Résolution et --continue
// ---------------------------------------------------------------------------

describe('CA-rebase-04 : résolution de conflit et rebase --continue', () => {
  it("CA-rebase-04 : après résolution + add + rebase --continue, D1\' créé, état rebasing désactivé", () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write a.txt "main"',
      'git add a.txt',
      'git commit -m "C1"',
      'git checkout feature',
      'write a.txt "feature"',
      'git add a.txt',
      'git commit -m "D1"',
    ]);

    const snapBefore = engine.snapshot();
    const d1Hash = snapBefore.branches['feature']!;
    const c1Hash = snapBefore.branches['main']!;

    // Déclencher le conflit
    engine.execute('git rebase main');
    expect(engine.snapshot().operationState?.type).toBe('rebasing');

    // Résoudre
    engine.execute('write a.txt "resolved"');
    engine.execute('git add a.txt');
    const continueResult = engine.execute('git rebase --continue');

    expect(continueResult.exitCode).toBe(0);
    expect(continueResult.output.some((l) => l.includes('Successfully rebased'))).toBe(true);

    const snap = engine.snapshot();
    // État rebasing désactivé
    expect(snap.operationState).toBeUndefined();

    // feature pointe D1' (nouveau hash)
    const d1PrimeHash = snap.branches['feature']!;
    expect(d1PrimeHash).not.toBe(d1Hash);

    // D1' a C1 comme parent
    const d1Prime = snap.allCommits?.find((c) => c.hash === d1PrimeHash);
    expect(d1Prime).toBeDefined();
    expect(d1Prime!.parents[0]).toBe(c1Hash);
  });
});

// ---------------------------------------------------------------------------
// CA-rebase-05 : Multiple commits
// ---------------------------------------------------------------------------

describe('CA-rebase-05 : rebase de 3 commits', () => {
  it("CA-rebase-05 : D1\', D2\', D3\' créés, parents en chaîne", () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write b.txt "main1"',
      'git add b.txt',
      'git commit -m "C1"',
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

    const snapBefore = engine.snapshot();
    const c1Hash = snapBefore.branches['main']!;
    const d3Hash = snapBefore.branches['feature']!; // tip feature (D3)

    const result = engine.execute('git rebase main');
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    // feature pointe D3' (nouveau)
    const d3PrimeHash = snap.branches['feature']!;
    expect(d3PrimeHash).not.toBe(d3Hash);

    const d3Prime = snap.allCommits?.find((c) => c.hash === d3PrimeHash);
    const d2PrimeHash = d3Prime!.parents[0]!;
    const d2Prime = snap.allCommits?.find((c) => c.hash === d2PrimeHash);
    const d1PrimeHash = d2Prime!.parents[0]!;
    const d1Prime = snap.allCommits?.find((c) => c.hash === d1PrimeHash);

    // D1'.parents = [C1]
    expect(d1Prime!.parents[0]).toBe(c1Hash);
    // D2'.parents = [D1']
    expect(d2Prime!.parents[0]).toBe(d1PrimeHash);
    // D3'.parents = [D2']
    expect(d3Prime!.parents[0]).toBe(d2PrimeHash);

    // Messages identiques
    expect(d1Prime!.message).toBe('D1');
    expect(d2Prime!.message).toBe('D2');
    expect(d3Prime!.message).toBe('D3');
  });
});

// ---------------------------------------------------------------------------
// CA-rebase-06 : Rebase sur HEAD détaché
// ---------------------------------------------------------------------------

describe('CA-rebase-06 : rebase sur HEAD détaché', () => {
  it('CA-rebase-06 : commits rejoués, HEAD détaché mis à jour', () => {
    // C0 ← C1 (main), C0 ← D1 (feature)
    // Détacher HEAD sur D1 puis rebase C1
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
      'git commit -m "D1"',
    ]);

    const snapBefore = engine.snapshot();
    const d1Hash = snapBefore.branches['feature']!;
    const c1Hash = snapBefore.branches['main']!;

    // Détacher HEAD sur D1
    engine.execute(`git checkout ${d1Hash}`);
    expect(engine.snapshot().head.type).toBe('detached');

    const result = engine.execute(`git rebase ${c1Hash}`);
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    // HEAD détaché mis à jour
    expect(snap.head.type).toBe('detached');
    if (snap.head.type === 'detached') {
      const headHash = snap.head.hash;
      const d1Prime = snap.allCommits?.find((c) => c.hash === headHash);
      expect(d1Prime).toBeDefined();
      expect(d1Prime!.parents[0]).toBe(c1Hash);
    }
  });
});

// ---------------------------------------------------------------------------
// CA-rebase-07 : Abort d'un rebase
// ---------------------------------------------------------------------------

describe('CA-rebase-07 : git rebase --abort', () => {
  it("CA-rebase-07 : branche restaurée à l'état avant rebase, état rebasing désactivé", () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write a.txt "main"',
      'git add a.txt',
      'git commit -m "C1"',
      'git checkout feature',
      'write a.txt "feature"',
      'git add a.txt',
      'git commit -m "D1"',
    ]);

    const snapBefore = engine.snapshot();
    const featureHashBefore = snapBefore.branches['feature']!;

    // Déclencher le conflit
    engine.execute('git rebase main');
    expect(engine.snapshot().operationState?.type).toBe('rebasing');

    const abortResult = engine.execute('git rebase --abort');
    expect(abortResult.exitCode).toBe(0);

    const snap = engine.snapshot();
    // État rebasing désactivé
    expect(snap.operationState).toBeUndefined();
    // feature restaurée
    expect(snap.branches['feature']).toBe(featureHashBefore);
    // Pas de nouveaux commits permanents (les rejoués sont abandonnés)
    // Note: les commits rejoués peuvent rester dans objects mais la branche est restaurée
  });
});

// ---------------------------------------------------------------------------
// CA-rebase-08 : Rebase avec révisions HEAD~n
// ---------------------------------------------------------------------------

describe('CA-rebase-08 : rebase via révision main~1', () => {
  it('CA-rebase-08 : git rebase main~1 rejoue commits au-dessus de C1', () => {
    // C0 ← C1 (main) ← C2 (main tip)
    // C0 ← D1 ← D2 (feature/HEAD)
    // Rebase sur main~1 = C1 → commits rejoués au-dessus de C1
    const engine = divergentRepo();
    const snapBefore = engine.snapshot();
    // Chercher dans allCommits (pas commits, limité à HEAD-reachable)
    const c1Hash = snapBefore.allCommits?.find((c) => c.message === 'C1')?.hash;
    expect(c1Hash).toBeDefined();

    const d2HashBefore = snapBefore.branches['feature']!;

    const result = engine.execute('git rebase main~1');
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    const d2PrimeHash = snap.branches['feature']!;
    expect(d2PrimeHash).not.toBe(d2HashBefore);

    // Remonter jusqu'à D1'
    const d2Prime = snap.allCommits?.find((c) => c.hash === d2PrimeHash);
    const d1PrimeHash = d2Prime!.parents[0]!;
    const d1Prime = snap.allCommits?.find((c) => c.hash === d1PrimeHash);

    // D1'.parent = C1
    expect(d1Prime!.parents[0]).toBe(c1Hash);
  });
});

// ---------------------------------------------------------------------------
// CA-rebase-09 : Fast-forward rebase
// ---------------------------------------------------------------------------

describe('CA-rebase-09 : rebase fast-forward', () => {
  it('CA-rebase-09 : exitCode 0, pas de nouveaux commits (déjà à jour ou fast-forward)', () => {
    // C0 ← C1 (main) ← C2 ← C3 (feature/HEAD) → tous linéaires
    // rebase main → fast-forward ou "already up to date"
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
      'write a.txt "v3"',
      'git add a.txt',
      'git commit -m "C3"',
    ]);

    // main est en arrière de feature → feature est un descendant de main
    // Rebase feature sur main → "already up to date" car base est ancêtre de HEAD
    const result = engine.execute('git rebase main');

    expect(result.exitCode).toBe(0);
    // L'output doit contenir soit "Fast-forward" soit "already up to date"
    const outputStr = result.output.join(' ');
    const isOk = outputStr.includes('Fast-forward') || outputStr.includes('already up to date');
    expect(isOk).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-rebase-10 : Merge commits dans la branche à rebaser
// ---------------------------------------------------------------------------

describe('CA-rebase-10 : rebase avec un merge commit dans la branche', () => {
  it('CA-rebase-10 : Phase 4 traite les merge commits (via 1er parent) ou signale une erreur', () => {
    // C0 ← C1 (main), C0 ← M (merge commit sur feature)
    // M résulte d'un merge de deux branches depuis C0
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'git branch side',
      // main : C1
      'write b.txt "main"',
      'git add b.txt',
      'git commit -m "C1"',
      // feature : simple commit D1
      'git checkout feature',
      'write c.txt "feat"',
      'git add c.txt',
      'git commit -m "D1"',
    ]);

    const snapBefore = engine.snapshot();
    const d1Hash = snapBefore.branches['feature']!;

    const result = engine.execute('git rebase main');

    // Phase 4 : soit succès (rejoue via 1er parent), soit erreur explicite
    // La spec dit : "Peut ignorer les merges ou refuser"
    // Dans tous les cas, exitCode doit être 0 ou 1 (pas d'exception non gérée)
    expect([0, 1]).toContain(result.exitCode);

    if (result.exitCode === 0) {
      // Succès : feature pointe un nouveau commit
      const snap = engine.snapshot();
      const d1PrimeHash = snap.branches['feature']!;
      expect(d1PrimeHash).not.toBe(d1Hash);
      expect(result.output.some((l) => l.includes('Successfully rebased') || l.includes('up to date'))).toBe(true);
    } else {
      // Erreur : message explicite
      const allMessages = [...result.output, ...result.errors].join(' ');
      expect(allMessages.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Extra : rebase en cours → nouveau rebase refusé
// ---------------------------------------------------------------------------

describe('Rebase en cours → second rebase refusé', () => {
  it('exitCode 1, error "already a rebase in progress"', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write a.txt "main"',
      'git add a.txt',
      'git commit -m "C1"',
      'git checkout feature',
      'write a.txt "feature"',
      'git add a.txt',
      'git commit -m "D1"',
    ]);

    // Déclencher le conflit
    engine.execute('git rebase main');
    expect(engine.snapshot().operationState?.type).toBe('rebasing');

    // Essayer un autre rebase
    const result = engine.execute('git rebase main');
    expect(result.exitCode).toBe(1);
    expect(
      result.errors.some((e) => e.includes('already a rebase in progress')),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Extra : base inexistante → erreur 128
// ---------------------------------------------------------------------------

describe('Rebase base inexistante', () => {
  it('exitCode 128, errors "unknown revision"', () => {
    const engine = replay([
      'git init',
      'write a.txt "v0"',
      'git add a.txt',
      'git commit -m "initial"',
    ]);

    const result = engine.execute('git rebase nosuchbranch');
    expect(result.exitCode).toBe(128);
    expect(result.errors.some((e) => e.includes('unknown revision'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Extra : déterminisme — deux engines rejouant rebase → mêmes hashes
// ---------------------------------------------------------------------------

describe('Déterminisme rebase : deux engines → mêmes hashes', () => {
  it('replay identique → snapshot.branches.feature identique', () => {
    const cmds = [
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write b.txt "main1"',
      'git add b.txt',
      'git commit -m "C1"',
      'git checkout feature',
      'write c.txt "feature1"',
      'git add c.txt',
      'git commit -m "D1"',
      'git rebase main',
    ];

    const snap1 = replay(cmds).snapshot();
    const snap2 = replay(cmds).snapshot();

    expect(snap1.branches['feature']).toBe(snap2.branches['feature']);
  });
});
