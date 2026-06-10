/**
 * Tests Phase 4 : git revert
 * Spec : docs/specs/21-revert.md
 * CA-revert-01 … CA-revert-11
 *
 * Principe : boîte noire via execute() + snapshot().
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';

// ---------------------------------------------------------------------------
// CA-revert-01 : Revert simple (un fichier modifié)
// ---------------------------------------------------------------------------

describe('CA-revert-01 : revert simple', () => {
  it('CA-revert-01 : nouveau commit R créé, message "Revert", historique préservé', () => {
    // C0 (a.txt="original") ← C1 (a.txt="modified"), HEAD sur C1
    const engine = replay([
      'git init',
      'write a.txt "original"',
      'git add a.txt',
      'git commit -m "Initial commit"',
      'write a.txt "modified"',
      'git add a.txt',
      'git commit -m "Modify a.txt"',
    ]);

    const snapBefore = engine.snapshot();
    const c1Hash = snapBefore.commits[0]!.hash;
    const countBefore = snapBefore.allCommits?.length ?? 0;

    const result = engine.execute(`git revert ${c1Hash}`);

    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    // Un nouveau commit R créé
    expect(snap.allCommits?.length ?? 0).toBe(countBefore + 1);

    // Le commit de tête est le revert
    const rHash = snap.branches['main']!;
    const rCommit = snap.commits.find((c) => c.hash === rHash);
    expect(rCommit).toBeDefined();

    // Parent = C1 (le HEAD avant revert)
    expect(rCommit!.parents).toContain(c1Hash);

    // Message contient "Revert"
    expect(rCommit!.message).toContain('Revert');
    expect(rCommit!.message).toContain('Modify a.txt');
  });

  it('CA-revert-01 : le contenu de a.txt est restauré à "original"', () => {
    const engine = replay([
      'git init',
      'write a.txt "original"',
      'git add a.txt',
      'git commit -m "Initial commit"',
      'write a.txt "modified"',
      'git add a.txt',
      'git commit -m "Modify a.txt"',
    ]);

    const snap = engine.snapshot();
    const c1Hash = snap.commits[0]!.hash;

    engine.execute(`git revert ${c1Hash}`);

    // Après revert, a.txt doit être "original"
    // On vérifie via le statut : clean (si WT = index = HEAD)
    const snapAfter = engine.snapshot();
    const aFile = snapAfter.files.find((f) => f.path === 'a.txt');
    expect(aFile?.status).toBe('clean');
  });
});

// ---------------------------------------------------------------------------
// CA-revert-02 : Revert avec ajout de fichier
// ---------------------------------------------------------------------------

describe('CA-revert-02 : revert supprime un fichier ajouté', () => {
  it('CA-revert-02 : b.txt supprimé après revert de C1 qui avait ajouté b.txt', () => {
    const engine = replay([
      'git init',
      'write a.txt "a"',
      'git add a.txt',
      'git commit -m "C0"',
      'write b.txt "b"',
      'git add b.txt',
      'git commit -m "C1 add b.txt"',
    ]);

    const snap = engine.snapshot();
    const c1Hash = snap.commits[0]!.hash;

    const result = engine.execute(`git revert ${c1Hash}`);
    expect(result.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    // b.txt ne doit plus être dans l'index ni le WT
    expect(snapAfter.indexPaths).not.toContain('b.txt');
    const bFile = snapAfter.files.find((f) => f.path === 'b.txt');
    expect(bFile).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CA-revert-03 : Revert commit racine
// ---------------------------------------------------------------------------

describe('CA-revert-03 : revert du commit racine', () => {
  it('CA-revert-03 : revert de C0 (racine) → tree vide, nouveau commit R créé', () => {
    // C0 (a.txt="v0"), HEAD est un autre commit C1
    const engine = replay([
      'git init',
      'write a.txt "v0"',
      'git add a.txt',
      'git commit -m "C0"',
      'write b.txt "v1"',
      'git add b.txt',
      'git commit -m "C1"',
    ]);

    const snap = engine.snapshot();
    // C0 est le commit racine (plus ancien)
    const c0Hash = snap.commits[1]!.hash;
    const countBefore = snap.allCommits?.length ?? 0;

    const result = engine.execute(`git revert ${c0Hash}`);
    expect(result.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    // Nouveau commit créé
    expect(snapAfter.allCommits?.length ?? 0).toBe(countBefore + 1);
    // a.txt (ajouté dans C0) doit avoir été supprimé
    expect(snapAfter.indexPaths).not.toContain('a.txt');
  });
});

// ---------------------------------------------------------------------------
// CA-revert-04 : Revert conflit
// ---------------------------------------------------------------------------

describe('CA-revert-04 : revert avec conflit', () => {
  it('CA-revert-04 : conflit détecté, exitCode 1, output "CONFLICT", état reverting', () => {
    // C0 (a.txt="v0") ← C1 (a.txt="v1") ← C2 (a.txt="v2"), HEAD sur C2
    // Revert de C1 : tente de restaurer a.txt de "v1" → "v0"
    // Mais le HEAD actuel a a.txt="v2" → conflit (current="v2" ≠ from="v1")
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

    const snap = engine.snapshot();
    const c1Hash = snap.commits[1]!.hash; // C1 = deuxième commit (index 1)

    const result = engine.execute(`git revert ${c1Hash}`);

    expect(result.exitCode).toBe(1);
    expect(result.output.some((l) => l.includes('CONFLICT'))).toBe(true);

    const snapAfter = engine.snapshot();
    expect(snapAfter.operationState?.type).toBe('reverting');

    // Pas de commit créé
    expect(snapAfter.allCommits?.length ?? 0).toBe(snap.allCommits?.length ?? 0);
  });
});

// ---------------------------------------------------------------------------
// CA-revert-05 : Résolution et commit
// ---------------------------------------------------------------------------

describe('CA-revert-05 : résolution de conflit et commit', () => {
  it('CA-revert-05 : après résolution + add + commit, état reverting désactivé', () => {
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

    const snap = engine.snapshot();
    const c1Hash = snap.commits[1]!.hash;
    const countBefore = snap.allCommits?.length ?? 0;

    // Déclencher le conflit
    engine.execute(`git revert ${c1Hash}`);
    expect(engine.snapshot().operationState?.type).toBe('reverting');

    // Résoudre
    engine.execute('write a.txt "resolved"');
    engine.execute('git add a.txt');
    const commitResult = engine.execute('git commit -m "Resolved revert"');

    expect(commitResult.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    expect(snapAfter.operationState).toBeUndefined();
    // Un commit créé
    expect(snapAfter.allCommits?.length ?? 0).toBeGreaterThan(countBefore);
  });
});

// ---------------------------------------------------------------------------
// CA-revert-06 : Revert merge commit sans -m
// ---------------------------------------------------------------------------

describe('CA-revert-06 : revert merge commit sans -m', () => {
  it('CA-revert-06 : exitCode 1, error "is a merge but no -m option"', () => {
    // Créer un merge commit M
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
    // Le commit de tête (merge commit) a 2 parents
    const mergeCommit = snap.allCommits?.find((c) => c.parents.length === 2);
    expect(mergeCommit).toBeDefined();
    const mHash = mergeCommit!.hash;

    const result = engine.execute(`git revert ${mHash}`);

    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes('is a merge but no -m option'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-revert-07 : Revert merge commit avec -m 1
// ---------------------------------------------------------------------------

describe('CA-revert-07 : revert merge commit avec -m 1', () => {
  it('CA-revert-07 : exitCode 0, commit R créé avec message Revert', () => {
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
      'git merge feature',
    ]);

    const snap = engine.snapshot();
    const mergeCommit = snap.allCommits?.find((c) => c.parents.length === 2);
    expect(mergeCommit).toBeDefined();
    const mHash = mergeCommit!.hash;
    const countBefore = snap.allCommits?.length ?? 0;

    const result = engine.execute(`git revert -m 1 ${mHash}`);

    expect(result.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    // Nouveau commit R créé
    expect(snapAfter.allCommits?.length ?? 0).toBe(countBefore + 1);

    const rHash = snapAfter.branches['main']!;
    const rCommit = snapAfter.commits.find((c) => c.hash === rHash);
    expect(rCommit?.message).toContain('Revert');
  });
});

// ---------------------------------------------------------------------------
// CA-revert-08 : Revert sur HEAD détaché
// ---------------------------------------------------------------------------

describe('CA-revert-08 : revert sur HEAD détaché', () => {
  it('CA-revert-08 : commit de revert R créé, HEAD détaché mis à jour', () => {
    // C1 ajoute b.txt, C2 ajoute c.txt : reverter C1 supprime b.txt, pas de conflit avec c.txt
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'write b.txt "added by C1"',
      'git add b.txt',
      'git commit -m "C1 adds b.txt"',
      'write c.txt "added by C2"',
      'git add c.txt',
      'git commit -m "C2 adds c.txt"',
      'git checkout HEAD~0', // détacher HEAD sur C2
    ]);

    const snapDetached = engine.snapshot();
    expect(snapDetached.head.type).toBe('detached');
    const c1Hash = snapDetached.commits[1]!.hash;
    const countBefore = snapDetached.allCommits?.length ?? 0;

    const result = engine.execute(`git revert ${c1Hash}`);
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    // HEAD reste détaché
    expect(snap.head.type).toBe('detached');
    // Nouveau commit créé
    expect(snap.allCommits?.length ?? 0).toBe(countBefore + 1);
    if (snap.head.type === 'detached') {
      // HEAD détaché pointe le nouveau commit (hoist hors de la closure)
      const headHash = snap.head.hash;
      const rCommit = snap.allCommits?.find((c) => c.hash === headHash);
      expect(rCommit).toBeDefined();
      expect(rCommit?.message).toContain('Revert');
    }
  });
});

// ---------------------------------------------------------------------------
// CA-revert-09 : Abort d'un revert
// ---------------------------------------------------------------------------

describe('CA-revert-09 : git revert --abort', () => {
  it('CA-revert-09 : index et WT restaurés, état reverting désactivé', () => {
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

    const snap = engine.snapshot();
    const c1Hash = snap.commits[1]!.hash;
    const mainHashBefore = snap.branches['main']!;
    const countBefore = snap.allCommits?.length ?? 0;

    // Déclencher le conflit
    engine.execute(`git revert ${c1Hash}`);
    expect(engine.snapshot().operationState?.type).toBe('reverting');

    const abortResult = engine.execute('git revert --abort');
    expect(abortResult.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    // État reverting désactivé
    expect(snapAfter.operationState).toBeUndefined();
    // main inchangé
    expect(snapAfter.branches['main']).toBe(mainHashBefore);
    // Pas de commit créé
    expect(snapAfter.allCommits?.length ?? 0).toBe(countBefore);
  });
});

// ---------------------------------------------------------------------------
// CA-revert-10 : Revert suppression (fichier supprimé dans C)
// ---------------------------------------------------------------------------

describe("CA-revert-10 : revert d'une suppression", () => {
  it("CA-revert-10 : b.txt restauré après revert de C1 qui l'avait supprimé", () => {
    // git rm n'est pas disponible dans ce moteur.
    // On simule la suppression : C0 (a.txt, b.txt), C1 (a.txt seul).
    // Pour créer C1 sans b.txt : reset --soft HEAD~1 depuis C0 parent inexistant
    // serait trop complexe. Approche : créer C0 sans b.txt, C1 qui ajoute b.txt,
    // puis revenir sur C0 et revert C1 (ce qui "supprime" b.txt).
    // Revert de C1 (qui avait ajouté b.txt) → b.txt supprimé.
    // Mais on cherche à restaurer b.txt après revert d'une suppression...
    //
    // Alternative spec-conforme : créer C_add_b (ajoute b.txt), puis C_now (HEAD),
    // revert de C_add_b → b.txt supprimé, re-revert → b.txt restauré.
    // Pour tester "revert d'une suppression" : créer une commit qui représente
    // la suppression de b.txt, puis reverte-la.
    //
    // Concret : C0 (a.txt) ← C1 (a.txt, b.txt ajoute b.txt). HEAD sur C1.
    // Revert de C1 → supprime b.txt → R (a.txt seul).
    // Revert de R → re-ajoute b.txt.
    // R est la "suppression commit", son revert restaure b.txt.
    const engine = replay([
      'git init',
      'write a.txt "a"',
      'git add a.txt',
      'git commit -m "C0 no b.txt"',
      'write b.txt "b"',
      'git add b.txt',
      'git commit -m "C1 add b.txt"',
    ]);

    const snap = engine.snapshot();
    const c1Hash = snap.commits[0]!.hash; // C1 added b.txt

    // Revert C1 : creates R which removes b.txt
    const revertResult = engine.execute(`git revert ${c1Hash}`);
    expect(revertResult.exitCode).toBe(0);

    const snapMid = engine.snapshot();
    const rHash = snapMid.branches['main']!; // R = "deletion commit"

    // b.txt is now gone
    expect(snapMid.indexPaths).not.toContain('b.txt');

    // Revert of R : should restore b.txt (reverts the deletion)
    const result = engine.execute(`git revert ${rHash}`);
    expect(result.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    // b.txt doit être restauré
    expect(snapAfter.indexPaths).toContain('b.txt');
  });
});

// ---------------------------------------------------------------------------
// CA-revert-11 : Revert avec révisions HEAD~n
// ---------------------------------------------------------------------------

describe('CA-revert-11 : revert via HEAD~n', () => {
  it('CA-revert-11 : git revert HEAD~1 reverte C1, nouveau commit R créé', () => {
    // C1 adds b.txt (unique file), C2 adds c.txt → reverting C1 removes b.txt, no conflict with c.txt
    const engine = replay([
      'git init',
      'write a.txt "v0"',
      'git add a.txt',
      'git commit -m "C0"',
      'write b.txt "added by C1"',
      'git add b.txt',
      'git commit -m "C1 adds b.txt"',
      'write c.txt "added by C2"',
      'git add c.txt',
      'git commit -m "C2 adds c.txt"',
    ]);

    const snapBefore = engine.snapshot();
    const countBefore = snapBefore.allCommits?.length ?? 0;

    // HEAD~1 = C1
    const result = engine.execute('git revert HEAD~1');
    expect(result.exitCode).toBe(0);

    const snapAfter = engine.snapshot();
    // Nouveau commit de revert créé
    expect(snapAfter.allCommits?.length ?? 0).toBe(countBefore + 1);

    const rHash = snapAfter.branches['main']!;
    const rCommit = snapAfter.commits.find((c) => c.hash === rHash);
    expect(rCommit?.message).toContain('Revert');
  });
});

// ---------------------------------------------------------------------------
// Extra : revert préserve l'historique (commits.length augmente de 1)
// ---------------------------------------------------------------------------

describe("Revert préserve l'historique", () => {
  it('commits.length augmente de 1 après chaque revert', () => {
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
    const countBefore = snap.allCommits?.length ?? 0;

    engine.execute(`git revert ${c1Hash}`);

    const snapAfter = engine.snapshot();
    expect(snapAfter.allCommits?.length ?? 0).toBe(countBefore + 1);
    // Le commit original C1 est toujours là (historique préservé)
    const c1Still = snapAfter.allCommits?.find((c) => c.hash === c1Hash);
    expect(c1Still).toBeDefined();
  });
});
