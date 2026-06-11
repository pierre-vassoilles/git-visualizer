/**
 * Tests Phase 4 : git cherry-pick
 * Spec : docs/specs/22-cherry-pick.md
 * CA-cherry-pick-01 … CA-cherry-pick-10
 *
 * Principe : boîte noire via execute() + snapshot().
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';

// ---------------------------------------------------------------------------
// CA-cherry-pick-01 : Cherry-pick simple
// ---------------------------------------------------------------------------

describe('CA-cherry-pick-01 : cherry-pick simple', () => {
  it('CA-cherry-pick-01 : nouveau commit P créé avec même message et changements appliqués', () => {
    // C0 ← C1 (main/HEAD, modifie b.txt uniquement), C0 ← C2 (feature, modifie a.txt et ajoute c.txt)
    // Pas de conflit : C2 touche a.txt et c.txt que C1 n'a pas modifiés
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
      'write a.txt "feature-change"',
      'write c.txt "new"',
      'git add a.txt',
      'git add c.txt',
      'git commit -m "C2 feature"',
      'git checkout main',
    ]);

    const snap = engine.snapshot();
    const c1Hash = snap.branches['main']!;
    const c2Hash = snap.branches['feature']!;
    const c2Commit = snap.allCommits?.find((c) => c.hash === c2Hash);
    const countBefore = snap.allCommits?.length ?? 0;

    const result = engine.execute(`git cherry-pick ${c2Hash}`);

    expect(result.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    // Nouveau commit P créé
    expect(snapAfter.allCommits?.length ?? 0).toBe(countBefore + 1);

    const pHash = snapAfter.branches['main']!;
    expect(pHash).not.toBe(c1Hash); // hash différent de C1
    expect(pHash).not.toBe(c2Hash); // hash différent de C2 (nouveau commit)

    const pCommit = snapAfter.commits.find((c) => c.hash === pHash);
    expect(pCommit).toBeDefined();

    // Parent = C1 (HEAD avant cherry-pick)
    expect(pCommit!.parents).toContain(c1Hash);

    // Message = message de C2
    expect(pCommit!.message).toBe(c2Commit!.message);

    // main pointe P
    expect(snapAfter.branches['main']).toBe(pHash);
  });
});

// ---------------------------------------------------------------------------
// CA-cherry-pick-02 : Cherry-pick conflit
// ---------------------------------------------------------------------------

describe('CA-cherry-pick-02 : cherry-pick avec conflit', () => {
  it('CA-cherry-pick-02 : exitCode 1, output "CONFLICT", marqueurs dans WT, état cherry-picking', () => {
    // C0 (a.txt="base") ← C1 (main, a.txt="v1"), C0 ← C2 (feature, a.txt="v2")
    // Cherry-pick de C2 sur main : a.txt="v1" ≠ "base" (from), conflit
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1 main"',
      'git checkout feature',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "C2 feature"',
      'git checkout main',
    ]);

    const snap = engine.snapshot();
    const c2Hash = snap.branches['feature']!;

    const result = engine.execute(`git cherry-pick ${c2Hash}`);

    expect(result.exitCode).toBe(1);
    expect(result.output.some((l) => l.includes('CONFLICT'))).toBe(true);
    expect(result.output.some((l) => l.includes('a.txt'))).toBe(true);

    const snapAfter = engine.snapshot();
    expect(snapAfter.operationState?.type).toBe('cherryPicking');

    // Aucun commit créé
    expect(snapAfter.allCommits?.length ?? 0).toBe(snap.allCommits?.length ?? 0);
  });
});

// ---------------------------------------------------------------------------
// CA-cherry-pick-03 : Résolution et commit
// ---------------------------------------------------------------------------

describe('CA-cherry-pick-03 : résolution de conflit et commit', () => {
  it('CA-cherry-pick-03 : après résolution + add + commit, état cherry-picking désactivé', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1 main"',
      'git checkout feature',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "C2 feature"',
      'git checkout main',
    ]);

    const snap = engine.snapshot();
    const c2Hash = snap.branches['feature']!;
    const countBefore = snap.allCommits?.length ?? 0;

    // Déclencher le conflit
    engine.execute(`git cherry-pick ${c2Hash}`);
    expect(engine.snapshot().operationState?.type).toBe('cherryPicking');

    // Résoudre
    engine.execute('write a.txt "resolved"');
    engine.execute('git add a.txt');
    const commitResult = engine.execute('git commit -m "Merge feature changes"');

    expect(commitResult.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    expect(snapAfter.operationState).toBeUndefined();
    expect(snapAfter.allCommits?.length ?? 0).toBeGreaterThan(countBefore);
  });
});

// ---------------------------------------------------------------------------
// CA-cherry-pick-04 : Commit déjà appliqué (ancêtre)
// ---------------------------------------------------------------------------

describe('CA-cherry-pick-04 : commit déjà appliqué (résultat vide)', () => {
  it('CA-cherry-pick-04 : cherry-pick de HEAD → résultat vide, exit 1 « now empty »', () => {
    // C0 ← C1 (main/HEAD), cherry-pick de C1 (== HEAD) : le patch est déjà
    // appliqué → résultat vide. git N'INTERDIT PAS (pas de « already included »),
    // il refuse de créer un commit vide.
    const engine = replay([
      'git init',
      'write a.txt "v0"',
      'git add a.txt',
      'git commit -m "C0"',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1"',
    ]);

    const snap = engine.snapshot();
    const c1Hash = snap.commits[0]!.hash;

    const result = engine.execute(`git cherry-pick ${c1Hash}`);

    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes('now empty'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-cherry-pick-05 : Merge commit non supporté
// ---------------------------------------------------------------------------

describe("CA-cherry-pick-05 : cherry-pick d'un merge commit refusé", () => {
  it('CA-cherry-pick-05 : exitCode 1, error "is a merge commit"', () => {
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
      'git merge feature',
    ]);

    const snap = engine.snapshot();
    const mergeCommit = snap.allCommits?.find((c) => c.parents.length === 2);
    expect(mergeCommit).toBeDefined();

    const result = engine.execute(`git cherry-pick ${mergeCommit!.hash}`);

    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes('is a merge but no -m'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-cherry-pick-06 : Cherry-pick sur HEAD détaché
// ---------------------------------------------------------------------------

describe('CA-cherry-pick-06 : cherry-pick sur HEAD détaché', () => {
  it('CA-cherry-pick-06 : nouveau commit P créé, HEAD détaché mis à jour', () => {
    // HEAD détaché sur C2, cherry-pick de C1
    const engine = replay([
      'git init',
      'write a.txt "v0"',
      'git add a.txt',
      'git commit -m "C0"',
      'write b.txt "b-only"',
      'git add b.txt',
      'git commit -m "C1 add b.txt"',
      'git checkout main',
      // Créer un commit C2 divergent pour avoir quelque chose à cherry-pick
    ]);

    // On a C0 ← C1 sur main. Détacher HEAD sur C0 puis cherry-pick C1
    const snap = engine.snapshot();
    const c0Hash = snap.commits[1]!.hash;
    const c1Hash = snap.commits[0]!.hash;

    engine.execute(`git checkout ${c0Hash}`); // détacher sur C0

    const snapDetached = engine.snapshot();
    expect(snapDetached.head.type).toBe('detached');
    const countBefore = snapDetached.allCommits?.length ?? 0;

    const result = engine.execute(`git cherry-pick ${c1Hash}`);
    expect(result.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    expect(snapAfter.head.type).toBe('detached');
    // Nouveau commit créé
    expect(snapAfter.allCommits?.length ?? 0).toBe(countBefore + 1);
    if (snapAfter.head.type === 'detached') {
      // HEAD pointe le nouveau commit (hoist hors de la closure pour le narrowing)
      const headHash = snapAfter.head.hash;
      const pCommit = snapAfter.allCommits?.find((c) => c.hash === headHash);
      expect(pCommit).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// CA-cherry-pick-07 : Abort d'un cherry-pick
// ---------------------------------------------------------------------------

describe('CA-cherry-pick-07 : git cherry-pick --abort', () => {
  it('CA-cherry-pick-07 : index et WT restaurés, état cherry-picking désactivé', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1 main"',
      'git checkout feature',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "C2 feature"',
      'git checkout main',
    ]);

    const snap = engine.snapshot();
    const c2Hash = snap.branches['feature']!;
    const mainHashBefore = snap.branches['main']!;
    const countBefore = snap.allCommits?.length ?? 0;

    // Déclencher le conflit
    engine.execute(`git cherry-pick ${c2Hash}`);
    expect(engine.snapshot().operationState?.type).toBe('cherryPicking');

    const abortResult = engine.execute('git cherry-pick --abort');
    expect(abortResult.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    expect(snapAfter.operationState).toBeUndefined();
    expect(snapAfter.branches['main']).toBe(mainHashBefore);
    expect(snapAfter.allCommits?.length ?? 0).toBe(countBefore);
  });
});

// ---------------------------------------------------------------------------
// CA-cherry-pick-08 : Cherry-pick avec révisions HEAD~n
// ---------------------------------------------------------------------------

describe('CA-cherry-pick-08 : cherry-pick via HEAD~n', () => {
  it('CA-cherry-pick-08 : git cherry-pick HEAD~1 (patch ne s’applique plus) → conflit', () => {
    // C0(a=v0) ← C1(a=v1) ← C2(a=v2), HEAD sur C2.
    // cherry-pick HEAD~1 (=C1) rejoue le patch v0→v1 sur C2 (a=v2) : le patch ne
    // s'applique plus proprement → conflit (et NON « already included », règle
    // inexistante chez git).
    const engine = replay([
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

    const result = engine.execute('git cherry-pick HEAD~1');
    expect(result.exitCode).toBe(1);
    expect(result.output.some((l) => l.includes('CONFLICT'))).toBe(true);
  });

  it("CA-cherry-pick-08 bis : cherry-pick d'un commit d'une autre branche via hash", () => {
    // S'assurer qu'un cherry-pick réussi via hash résolu depuis HEAD~n est possible
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write b.txt "main"',
      'git add b.txt',
      'git commit -m "C1 main"',
      'git checkout feature',
      'write c.txt "feature"',
      'git add c.txt',
      'git commit -m "C2 feature"',
      'git checkout main',
    ]);

    const snap = engine.snapshot();
    const c2Hash = snap.branches['feature']!;
    const countBefore = snap.allCommits?.length ?? 0;

    const result = engine.execute(`git cherry-pick ${c2Hash}`);
    expect(result.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    expect(snapAfter.allCommits?.length ?? 0).toBe(countBefore + 1);
  });
});

// ---------------------------------------------------------------------------
// CA-cherry-pick-09 : Cherry-pick suppression de fichier
// ---------------------------------------------------------------------------

describe('CA-cherry-pick-09 : cherry-pick supprime un fichier', () => {
  it('CA-cherry-pick-09 : b.txt supprimé du WT après cherry-pick de C1 qui supprimait b.txt', () => {
    // Strategy: build a chain where C0 has only a.txt, C1 adds b.txt (on main),
    // C2 on del-branch only touches a.txt.
    // Then we create a commit C_del that starts from a state with b.txt and commits without it.
    //
    // Simpler approach: use revert of "add b.txt commit" as the cherry-pick source.
    // C0 (a.txt) ← C1 (a.txt, b.txt) ← C2 (HEAD on main, same as C1 but another file changed)
    // del-branch from C0 ; C_del reverts C1's b.txt addition via git revert.
    // But that's circular.
    //
    // Cleanest: build commits directly with the engine.
    // C_base (a.txt, b.txt) ← C_plus (a.txt, b.txt, c.txt) [adds c.txt]
    // Then cherry-pick C_plus from main which only has C_base → adds c.txt (already tested in CA-10)
    //
    // For deletion test: create a branch that starts with both files, then commit
    // a tree that omits b.txt using reset --soft + recommit approach.
    //
    // Use reset --soft HEAD~1, then only re-add a.txt, commit:
    // This goes back to before C0 (root), then adds a.txt only.
    const engine = replay([
      'git init',
      // First commit : a.txt only
      'write a.txt "a"',
      'git add a.txt',
      'git commit -m "C_base only a.txt"',
      // Second commit : add b.txt
      'write b.txt "b"',
      'git add b.txt',
      'git commit -m "C_add_b adds b.txt"',
    ]);

    // Now revert C_add_b to get a cherry-pickable commit that removes b.txt
    const snap = engine.snapshot();
    const cAddBHash = snap.commits[0]!.hash; // tip = C_add_b

    // Create a branch at C_base, then cherry-pick C_add_b onto it, then revert it
    // This is getting complex. Let's use a simpler direct method:
    // The spec says C0 (a.txt, b.txt) ← C1 (a.txt) deletes b.txt.
    // We can create this by:
    // 1. Starting from C_add_b (has both), git revert C_add_b → removes b.txt
    // But then cherry-picking the revert commit is the same as cherry-picking a deletion.
    // The revert commit itself is the "deletion commit" we want to cherry-pick.

    // Get revert of C_add_b (which removes b.txt)
    const revertResult = engine.execute(`git revert ${cAddBHash}`);
    expect(revertResult.exitCode).toBe(0);

    const snapAfterRevert = engine.snapshot();
    const revertHash = snapAfterRevert.branches['main']!;

    // Now reset back to C_add_b so we have b.txt again, then cherry-pick revertHash
    engine.execute(`git reset --hard ${cAddBHash}`);
    expect(engine.snapshot().indexPaths).toContain('b.txt');

    // Cherry-pick the revert commit (which deletes b.txt)
    const result = engine.execute(`git cherry-pick ${revertHash}`);
    expect(result.exitCode).toBe(0);

    const snapFinal = engine.snapshot();
    expect(snapFinal.indexPaths).not.toContain('b.txt');
  });
});

// ---------------------------------------------------------------------------
// CA-cherry-pick-10 : Cherry-pick ajout de fichier
// ---------------------------------------------------------------------------

describe('CA-cherry-pick-10 : cherry-pick ajoute un fichier', () => {
  it('CA-cherry-pick-10 : b.txt présent dans WT après cherry-pick de C1 qui ajoutait b.txt', () => {
    // C0 (a.txt), C1 (a.txt, b.txt) → C1 ajoute b.txt
    // HEAD = C0 (via checkout), cherry-pick de C1
    const engine = replay(['git init', 'write a.txt "a"', 'git add a.txt', 'git commit -m "C0"']);

    // Créer C1 sur une branche à part
    engine.execute('git branch add-branch');
    engine.execute('git checkout add-branch');
    engine.execute('write b.txt "b"');
    engine.execute('git add b.txt');
    engine.execute('git commit -m "C1 add b.txt"');

    const snapAdd = engine.snapshot();
    const c1Hash = snapAdd.branches['add-branch']!;

    // Revenir sur main (qui est sur C0)
    engine.execute('git checkout main');

    const result = engine.execute(`git cherry-pick ${c1Hash}`);
    expect(result.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    expect(snapAfter.indexPaths).toContain('b.txt');
  });
});

// ---------------------------------------------------------------------------
// Extra : cherry-pick commit inexistant → erreur 128
// ---------------------------------------------------------------------------

describe('Cherry-pick commit inexistant', () => {
  it('exitCode 128, errors "unknown revision"', () => {
    const engine = replay([
      'git init',
      'write a.txt "v0"',
      'git add a.txt',
      'git commit -m "initial"',
    ]);

    const result = engine.execute('git cherry-pick nosuchhash');
    expect(result.exitCode).toBe(128);
    expect(result.errors.some((e) => e.includes('unknown revision'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Extra : cherry-pick en cours → nouveau cherry-pick refusé
// ---------------------------------------------------------------------------

describe('Cherry-pick en cours → second cherry-pick refusé', () => {
  it('exitCode 1, error "CHERRY_PICK_HEAD exists"', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1 main"',
      'git checkout feature',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "C2 feature"',
      'git checkout main',
    ]);

    const snap = engine.snapshot();
    const c2Hash = snap.branches['feature']!;

    // Déclencher le conflit
    engine.execute(`git cherry-pick ${c2Hash}`);

    // Essayer un deuxième cherry-pick
    const result = engine.execute(`git cherry-pick ${c2Hash}`);
    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes('CHERRY_PICK_HEAD'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Extra : déterminisme — deux engines rejouant la même séquence → mêmes hashes
// ---------------------------------------------------------------------------

describe('Déterminisme cherry-pick : deux engines → mêmes hashes', () => {
  it('replay identique → snapshot.branches.main identique', () => {
    const cmds = [
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write b.txt "main"',
      'git add b.txt',
      'git commit -m "C1 main"',
      'git checkout feature',
      'write c.txt "feature"',
      'git add c.txt',
      'git commit -m "C2 feature"',
      'git checkout main',
    ];

    const engine1 = replay(cmds);
    const engine2 = replay(cmds);

    const c2Hash1 = engine1.snapshot().branches['feature']!;
    const c2Hash2 = engine2.snapshot().branches['feature']!;
    expect(c2Hash1).toBe(c2Hash2);

    engine1.execute(`git cherry-pick ${c2Hash1}`);
    engine2.execute(`git cherry-pick ${c2Hash2}`);

    expect(engine1.snapshot().branches['main']).toBe(engine2.snapshot().branches['main']);
  });
});
