/**
 * Tests Phase 5 : git rebase -i (rebase interactif)
 * Spec : docs/specs/25-rebase-interactive.md
 * CA-rebasei-01 … CA-rebasei-12
 *
 * Principe : boîte noire via execute() + snapshot() pour git rebase -i,
 * et appel direct à engine.executeRebaseInteractive(todoList) pour l'exécution.
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';
import type { TodoItem } from '@/core/model';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

/**
 * Dépôt divergent pour les tests de rebase interactif :
 *   C0 ← C1 (main/HEAD avant checkout)
 *   C0 ← D1 ← D2 (feature/HEAD)
 *
 * C0 : a.txt = "base"
 * C1 : b.txt = "main1"  (sur main, pour créer une divergence réelle)
 * D1 : c.txt = "d1"
 * D2 : d.txt = "d2"
 */
function featureRepo() {
  return replay([
    'git init',
    'write a.txt "base"',
    'git add a.txt',
    'git commit -m "C0"',
    'git branch feature',
    // main : C1 pour diverger
    'write b.txt "main1"',
    'git add b.txt',
    'git commit -m "C1"',
    // feature : D1, D2
    'git checkout feature',
    'write c.txt "d1"',
    'git add c.txt',
    'git commit -m "D1"',
    'write d.txt "d2"',
    'git add d.txt',
    'git commit -m "D2"',
  ]);
}

/**
 * Dépôt divergent avec 3 commits sur feature :
 *   C0 ← C1 (main)
 *   C0 ← D1 ← D2 ← D3 (feature/HEAD)
 */
function featureRepo3() {
  return replay([
    'git init',
    'write a.txt "base"',
    'git add a.txt',
    'git commit -m "C0"',
    'git branch feature',
    // main : C1 pour diverger
    'write b.txt "main1"',
    'git add b.txt',
    'git commit -m "C1"',
    // feature : D1, D2, D3
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
}

// ---------------------------------------------------------------------------
// CA-rebasei-01 : Initiation rebase interactif
// ---------------------------------------------------------------------------

describe('CA-rebasei-01 : Initiation rebase interactif', () => {
  it('CA-rebasei-01 : git rebase -i main → exitCode 0, awaitingTodoEdit true, todoList = [D1 pick, D2 pick]', () => {
    const engine = featureRepo();
    const snapBefore = engine.snapshot();

    // Identifier D1 et D2
    const d2Hash = snapBefore.commits[0]!.hash;
    const d1Hash = snapBefore.commits[1]!.hash;

    const result = engine.execute('git rebase -i main');

    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();

    expect(snap.operationState?.type).toBe('rebasing');
    expect(snap.rebasingInteractive).toBeDefined();
    expect(snap.rebasingInteractive!.awaitingTodoEdit).toBe(true);

    const todo = snap.rebasingInteractive!.todoList;
    expect(todo).toHaveLength(2);

    // Ordre : du plus ancien (D1) au plus récent (D2)
    expect(todo[0]!.action).toBe('pick');
    expect(todo[0]!.commitHash).toBe(d1Hash);
    expect(todo[0]!.message).toBe('D1');

    expect(todo[1]!.action).toBe('pick');
    expect(todo[1]!.commitHash).toBe(d2Hash);
    expect(todo[1]!.message).toBe('D2');
  });
});

// ---------------------------------------------------------------------------
// CA-rebasei-02 : UI modale (état snapshot)
// ---------------------------------------------------------------------------

describe('CA-rebasei-02 : État snapshot pour la modale UI', () => {
  it('CA-rebasei-02 : snapshot expose rebasingInteractive.awaitingTodoEdit après git rebase -i', () => {
    const engine = featureRepo();
    engine.execute('git rebase -i main');
    const snap = engine.snapshot();

    // Ce que l'UI détecte pour afficher la modale
    expect(snap.operationState?.type).toBe('rebasing');
    expect(snap.rebasingInteractive?.awaitingTodoEdit).toBe(true);
    expect(Array.isArray(snap.rebasingInteractive?.todoList)).toBe(true);
    expect(snap.rebasingInteractive!.todoList.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// CA-rebasei-03 : Simple pick (tous pick = rebase normal)
// ---------------------------------------------------------------------------

describe("CA-rebasei-03 : Simple pick (pas d'édition)", () => {
  it('CA-rebasei-03 : tous pick → deux nouveaux commits, branch pointe le dernier, rebasing désactivé', () => {
    const engine = featureRepo();
    const snapBefore = engine.snapshot();

    // featureRepo: C0 ← C1 (main), C0 ← D1 ← D2 (feature)
    // feature commits from newest: D2, D1, C0 (main commits visible: C1 not on feature path)
    // D2 is at index 0, D1 at index 1
    const d2Hash = snapBefore.commits[0]!.hash;
    const d1Hash = snapBefore.commits[1]!.hash;

    engine.execute('git rebase -i main');
    const snapPending = engine.snapshot();
    const todo = [...snapPending.rebasingInteractive!.todoList] as TodoItem[];

    const result = engine.executeRebaseInteractive(todo);

    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes('Successfully rebased'))).toBe(true);

    const snap = engine.snapshot();

    // Rebase terminé : pas d'état rebasing
    expect(snap.operationState).toBeUndefined();
    expect(snap.rebasingInteractive).toBeUndefined();

    // feature doit pointer un nouveau commit (D2')
    const featureHash = snap.branches['feature']!;
    expect(featureHash).not.toBe(d2Hash);
    expect(featureHash).not.toBe(d1Hash);

    // Historique linéaire : D2' → D1' → C1 → C0
    const commits = snap.commits;
    expect(commits).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// CA-rebasei-04 : Reword (édition de message)
// ---------------------------------------------------------------------------

describe('CA-rebasei-04 : Reword (édition de message)', () => {
  it("CA-rebasei-04 : reword D1 → \"Modified D1\", D1' a le nouveau message, D2' a D1' comme parent", () => {
    const engine = featureRepo();
    const snapBefore = engine.snapshot();

    const d1Hash = snapBefore.commits[1]!.hash;
    const d2Hash = snapBefore.commits[0]!.hash;

    engine.execute('git rebase -i main');
    const snapPending = engine.snapshot();
    const todoRaw = snapPending.rebasingInteractive!.todoList;

    const todoList: TodoItem[] = [
      { action: 'reword', commitHash: todoRaw[0]!.commitHash, message: 'Modified D1' },
      { action: 'pick', commitHash: todoRaw[1]!.commitHash, message: todoRaw[1]!.message },
    ];

    const result = engine.executeRebaseInteractive(todoList);
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();

    // Trouver D1' par son message
    const d1Prime = snap.allCommits?.find((c) => c.message === 'Modified D1');
    expect(d1Prime).toBeDefined();
    expect(d1Prime!.hash).not.toBe(d1Hash); // nouveau hash

    // D2' doit exister et avoir D1' comme parent
    const featureHash = snap.branches['feature']!;
    expect(featureHash).not.toBe(d2Hash);
    const d2Prime = snap.allCommits?.find((c) => c.hash === featureHash);
    expect(d2Prime).toBeDefined();
    expect(d2Prime!.parents[0]).toBe(d1Prime!.hash);
  });
});

// ---------------------------------------------------------------------------
// CA-rebasei-05 : Squash
// ---------------------------------------------------------------------------

describe('CA-rebasei-05 : Squash', () => {
  it('CA-rebasei-05 : pick D1, squash D2, pick D3 → 2 commits, message combiné "D1\\n\\nD2"', () => {
    const engine = featureRepo3();
    engine.execute('git rebase -i main');
    const snapPending = engine.snapshot();
    const todoRaw = snapPending.rebasingInteractive!.todoList;

    // D1 pick, D2 squash, D3 pick
    const todoList: TodoItem[] = [
      { action: 'pick', commitHash: todoRaw[0]!.commitHash, message: todoRaw[0]!.message },
      { action: 'squash', commitHash: todoRaw[1]!.commitHash, message: todoRaw[1]!.message },
      { action: 'pick', commitHash: todoRaw[2]!.commitHash, message: todoRaw[2]!.message },
    ];

    const result = engine.executeRebaseInteractive(todoList);
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();

    // Commits finaux : C0, C1 (main), D1_squashed, D3' = 4 commits
    expect(snap.commits).toHaveLength(4);

    // Le commit squashé doit avoir le message combiné
    const squashed = snap.commits.find((c) => c.message === 'D1\n\nD2');
    expect(squashed).toBeDefined();

    // D3' doit avoir le commit squashé comme parent
    const featureHash = snap.branches['feature']!;
    const d3Prime = snap.allCommits?.find((c) => c.hash === featureHash);
    expect(d3Prime).toBeDefined();
    expect(d3Prime!.message).toBe('D3');
    expect(d3Prime!.parents[0]).toBe(squashed!.hash);
  });
});

// ---------------------------------------------------------------------------
// CA-rebasei-06 : Fixup (squash + discard message)
// ---------------------------------------------------------------------------

describe('CA-rebasei-06 : Fixup (squash + message jeté)', () => {
  it('CA-rebasei-06 : pick D1, fixup D2 → message = "D1" (D2 jeté)', () => {
    const engine = featureRepo();
    engine.execute('git rebase -i main');
    const snapPending = engine.snapshot();
    const todoRaw = snapPending.rebasingInteractive!.todoList;

    const todoList: TodoItem[] = [
      { action: 'pick', commitHash: todoRaw[0]!.commitHash, message: 'D1' },
      { action: 'fixup', commitHash: todoRaw[1]!.commitHash, message: 'D2' },
    ];

    const result = engine.executeRebaseInteractive(todoList);
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();

    // Commits finaux : C0, C1 (main), D1_fixuped = 3 commits
    expect(snap.commits).toHaveLength(3);

    // Message = "D1" (message D2 jeté)
    const featureHash = snap.branches['feature']!;
    const fixedCommit = snap.allCommits?.find((c) => c.hash === featureHash);
    expect(fixedCommit).toBeDefined();
    expect(fixedCommit!.message).toBe('D1');
    expect(fixedCommit!.message).not.toContain('D2');
  });
});

// ---------------------------------------------------------------------------
// CA-rebasei-07 : Drop (suppression de commit)
// ---------------------------------------------------------------------------

describe('CA-rebasei-07 : Drop (suppression)', () => {
  it('CA-rebasei-07 : pick D1, drop D2, pick D3 → 2 commits finaux, D2 absent', () => {
    const engine = featureRepo3();
    engine.execute('git rebase -i main');
    const snapPending = engine.snapshot();
    const todoRaw = snapPending.rebasingInteractive!.todoList;

    const todoList: TodoItem[] = [
      { action: 'pick', commitHash: todoRaw[0]!.commitHash, message: todoRaw[0]!.message },
      { action: 'drop', commitHash: todoRaw[1]!.commitHash, message: todoRaw[1]!.message },
      { action: 'pick', commitHash: todoRaw[2]!.commitHash, message: todoRaw[2]!.message },
    ];

    const result = engine.executeRebaseInteractive(todoList);
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();

    // Commits finaux : C0, C1 (main), D1', D3' = 4 commits
    expect(snap.commits).toHaveLength(4);

    // D2 doit être absent de la branche feature
    const hasD2 = snap.commits.some((c) => c.message === 'D2');
    expect(hasD2).toBe(false);

    // D3' doit avoir D1' comme parent
    const featureHash = snap.branches['feature']!;
    const d3Prime = snap.allCommits?.find((c) => c.hash === featureHash);
    expect(d3Prime).toBeDefined();
    expect(d3Prime!.message).toBe('D3');

    const d1Prime = snap.allCommits?.find((c) => c.hash === d3Prime!.parents[0]);
    expect(d1Prime).toBeDefined();
    expect(d1Prime!.message).toBe('D1');
  });
});

// ---------------------------------------------------------------------------
// CA-rebasei-08 : Réordonnancement
// ---------------------------------------------------------------------------

describe('CA-rebasei-08 : Réordonnancement', () => {
  it("CA-rebasei-08 : todoList [D2, D1, D3] → ordre D2' → D1' → D3' dans l'historique", () => {
    const engine = featureRepo3();
    engine.execute('git rebase -i main');
    const snapPending = engine.snapshot();
    const todoRaw = snapPending.rebasingInteractive!.todoList;
    // todoRaw = [D1, D2, D3]

    // Réordonner : D2, D1, D3
    const todoList: TodoItem[] = [
      { action: 'pick', commitHash: todoRaw[1]!.commitHash, message: todoRaw[1]!.message },
      { action: 'pick', commitHash: todoRaw[0]!.commitHash, message: todoRaw[0]!.message },
      { action: 'pick', commitHash: todoRaw[2]!.commitHash, message: todoRaw[2]!.message },
    ];

    const result = engine.executeRebaseInteractive(todoList);
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();

    // L'ordre de commits suit la todo (du plus récent au plus ancien dans snap.commits)
    // featureRepo3 a C0 ← C1 (main) ← D1' ← D2' ← D3' après rebase sur main
    // Avec réordonnancement [D2, D1, D3] : C0 ← C1 ← D2' ← D1' ← D3'
    const featureCommits = snap.commits; // [D3', D1', D2', C1, C0]
    expect(featureCommits).toHaveLength(5);

    // Le plus récent = D3 (il était dernier dans la todo)
    expect(featureCommits[0]!.message).toBe('D3');
    // Puis D1 (2e dans la todo réordonnée)
    expect(featureCommits[1]!.message).toBe('D1');
    // Puis D2 (1er dans la todo réordonnée)
    expect(featureCommits[2]!.message).toBe('D2');
    // main tip C1
    expect(featureCommits[3]!.message).toBe('C1');
    // Racine C0
    expect(featureCommits[4]!.message).toBe('C0');
  });
});

// ---------------------------------------------------------------------------
// CA-rebasei-09 : Conflit en cours de squash
// ---------------------------------------------------------------------------

describe("CA-rebasei-09 : Conflit lors d'un squash", () => {
  it('CA-rebasei-09 : conflit pick D1 (conflict avec main), squash D2 → exitCode 1, rebasing actif', () => {
    // Scénario :
    // C0: a.txt="base"
    // main: C1 → a.txt="main"   (conflit avec D1)
    // feature: D1 → a.txt="d1", D2 → b.txt="d2" (squash)
    // Lors du rebase -i sur main : D1 conflit avec C1 (tous deux modifient a.txt depuis "base")
    // En mode interactif pick D1 / squash D2, le conflit se produit lors du pick D1 (index 0)
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      // main : modifie a.txt
      'write a.txt "main"',
      'git add a.txt',
      'git commit -m "C1"',
      // feature : D1 modifie a.txt, D2 ajoute b.txt
      'git checkout feature',
      'write a.txt "d1"',
      'git add a.txt',
      'git commit -m "D1"',
      'write b.txt "d2"',
      'git add b.txt',
      'git commit -m "D2"',
    ]);

    engine.execute('git rebase -i main');
    const snapPending = engine.snapshot();
    const todoRaw = snapPending.rebasingInteractive!.todoList;

    // pick D1, squash D2
    const todoList: TodoItem[] = [
      { action: 'pick', commitHash: todoRaw[0]!.commitHash, message: 'D1' },
      { action: 'squash', commitHash: todoRaw[1]!.commitHash, message: 'D2' },
    ];

    const result = engine.executeRebaseInteractive(todoList);

    // D1 conflicte avec C1 (tous deux modifient a.txt depuis "base")
    expect(result.exitCode).toBe(1);
    expect(result.output.some((l) => l.includes('CONFLICT'))).toBe(true);

    const snap = engine.snapshot();
    expect(snap.operationState?.type).toBe('rebasing');
    // Le conflit est sur D1 (index 0) ou D2 (index 1) selon l'implémentation
    expect(snap.rebasingInteractive?.awaitingTodoEdit).toBe(false);
    expect(snap.rebasingInteractive?.currentIndex).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// CA-rebasei-10 : Continue après conflit
// ---------------------------------------------------------------------------

describe('CA-rebasei-10 : Continue après conflit de squash', () => {
  it('CA-rebasei-10 : résoudre conflit puis git rebase --continue → rebase terminé', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      // main : modifie a.txt
      'write a.txt "main"',
      'git add a.txt',
      'git commit -m "C1"',
      // feature : D1 modifie a.txt
      'git checkout feature',
      'write a.txt "d1"',
      'git add a.txt',
      'git commit -m "D1"',
    ]);

    engine.execute('git rebase -i main');
    const snapPending = engine.snapshot();
    const todoRaw = snapPending.rebasingInteractive!.todoList;

    const todoList: TodoItem[] = [
      { action: 'pick', commitHash: todoRaw[0]!.commitHash, message: 'D1' },
    ];

    const resultConflict = engine.executeRebaseInteractive(todoList);
    expect(resultConflict.exitCode).toBe(1);

    // Résoudre le conflit : écrire la résolution et git add
    engine.execute('write a.txt "resolved"');
    engine.execute('git add a.txt');

    const resultContinue = engine.execute('git rebase --continue');
    expect(resultContinue.exitCode).toBe(0);
    expect(resultContinue.output.some((l) => l.includes('Successfully rebased'))).toBe(true);

    const snap = engine.snapshot();
    expect(snap.operationState).toBeUndefined();
    expect(snap.rebasingInteractive).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CA-rebasei-11 : Premier commit squashé (erreur)
// ---------------------------------------------------------------------------

describe('CA-rebasei-11 : Premier commit squashé (erreur)', () => {
  it('CA-rebasei-11 : first action squash → exitCode 1, erreur "cannot squash the first commit"', () => {
    const engine = featureRepo();
    engine.execute('git rebase -i main');
    const snapPending = engine.snapshot();
    const todoRaw = snapPending.rebasingInteractive!.todoList;

    const todoList: TodoItem[] = [
      { action: 'squash', commitHash: todoRaw[0]!.commitHash, message: 'D1' },
      { action: 'pick', commitHash: todoRaw[1]!.commitHash, message: 'D2' },
    ];

    const result = engine.executeRebaseInteractive(todoList);
    expect(result.exitCode).toBe(1);
    expect(result.errors.length + result.output.length).toBeGreaterThan(0);

    const allMessages = [...result.output, ...result.errors].join('\n');
    expect(allMessages).toContain('cannot squash the first commit');
  });

  it('CA-rebasei-11 : first action fixup → même erreur', () => {
    const engine = featureRepo();
    engine.execute('git rebase -i main');
    const snapPending = engine.snapshot();
    const todoRaw = snapPending.rebasingInteractive!.todoList;

    const todoList: TodoItem[] = [
      { action: 'fixup', commitHash: todoRaw[0]!.commitHash, message: 'D1' },
      { action: 'pick', commitHash: todoRaw[1]!.commitHash, message: 'D2' },
    ];

    const result = engine.executeRebaseInteractive(todoList);
    expect(result.exitCode).toBe(1);
    const allMessages = [...result.output, ...result.errors].join('\n');
    expect(allMessages).toContain('cannot squash the first commit');
  });
});

// ---------------------------------------------------------------------------
// CA-rebasei-12 : Abort rebase interactif
// ---------------------------------------------------------------------------

describe('CA-rebasei-12 : Abort rebase interactif', () => {
  it('CA-rebasei-12 (en attente) : git rebase --abort après git rebase -i → état restauré', () => {
    const engine = featureRepo();
    const snapBefore = engine.snapshot();
    const featureHashBefore = snapBefore.branches['feature']!;

    engine.execute('git rebase -i main');

    const resultAbort = engine.execute('git rebase --abort');
    expect(resultAbort.exitCode).toBe(0);

    const snap = engine.snapshot();
    expect(snap.operationState).toBeUndefined();
    expect(snap.rebasingInteractive).toBeUndefined();
    expect(snap.branches['feature']).toBe(featureHashBefore);
  });

  it('CA-rebasei-12 (en conflit) : git rebase --abort après conflit → branche restaurée', () => {
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
      'write a.txt "d1"',
      'git add a.txt',
      'git commit -m "D1"',
    ]);

    const featureHashBefore = engine.snapshot().branches['feature']!;

    engine.execute('git rebase -i main');
    const snapPending = engine.snapshot();
    const todoRaw = snapPending.rebasingInteractive!.todoList;

    const todoList: TodoItem[] = [
      { action: 'pick', commitHash: todoRaw[0]!.commitHash, message: 'D1' },
    ];

    engine.executeRebaseInteractive(todoList); // → conflit

    const resultAbort = engine.execute('git rebase --abort');
    expect(resultAbort.exitCode).toBe(0);

    const snap = engine.snapshot();
    expect(snap.operationState).toBeUndefined();
    expect(snap.branches['feature']).toBe(featureHashBefore);
  });
});

// ---------------------------------------------------------------------------
// Déterminisme : deux engines rejouant la même séquence → mêmes hash
// ---------------------------------------------------------------------------

describe('Déterminisme du rebase interactif', () => {
  it('Deux moteurs rejouant la même séquence avec rebase -i → mêmes hash finaux', () => {
    function buildRebasedEngine() {
      const engine = featureRepo3();
      engine.execute('git rebase -i main');
      const snapPending = engine.snapshot();
      const todoRaw = snapPending.rebasingInteractive!.todoList;

      const todoList: TodoItem[] = todoRaw.map((item) => ({
        action: 'pick' as const,
        commitHash: item.commitHash,
        message: item.message,
      }));

      engine.executeRebaseInteractive(todoList);
      return engine;
    }

    const engine1 = buildRebasedEngine();
    const engine2 = buildRebasedEngine();

    const snap1 = engine1.snapshot();
    const snap2 = engine2.snapshot();

    expect(snap1.branches['feature']).toBe(snap2.branches['feature']);
    expect(snap1.commits.map((c) => c.hash)).toEqual(snap2.commits.map((c) => c.hash));
  });
});

// ---------------------------------------------------------------------------
// Erreurs : commit introuvable
// ---------------------------------------------------------------------------

describe('Erreur commit introuvable dans todo list', () => {
  it('CA-rebasei commit introuvable → exitCode 128, erreur "not found"', () => {
    const engine = featureRepo();
    engine.execute('git rebase -i main');

    const todoList: TodoItem[] = [
      {
        action: 'pick',
        commitHash: 'aabbccddee1122334455667788990011aabbccdd',
        message: 'Phantom',
      },
    ];

    const result = engine.executeRebaseInteractive(todoList);
    expect(result.exitCode).toBe(128);
    const allMessages = [...result.output, ...result.errors].join('\n');
    expect(allMessages).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// B1 — Régression : squash/fixup en conflit + git rebase --continue
// ne doit PAS dupliquer le commit ni chaîner un parent erroné.
// ---------------------------------------------------------------------------

describe('B1 : squash avec conflit sur la marche squash + --continue', () => {
  it('B1 : pick D1 / squash D2, conflit sur squash, résolution + --continue → 1 commit squashé, parent = base, message combiné', () => {
    // Scénario :
    // C0 : a.txt = "base"
    // main / C1 : a.txt = "main"   (pas de conflit avec D1 qui touche b.txt)
    // feature :
    //   D1 : b.txt = "d1"           (pick sans conflit)
    //   D2 : a.txt = "d2"           (squash → conflicte avec C1 sur a.txt)
    //
    // Après rebase -i avec [pick D1, squash D2] :
    //   - D1 rejoué sans conflit → D1' (b.txt="d1", parent=C1)
    //   - D2 squashé → conflit sur a.txt (C1 a "main", D2 veut "d2")
    //   - Résolution : a.txt = "resolved"
    //   - git add a.txt
    //   - git rebase --continue
    //
    // Résultat attendu :
    //   C0 ← C1 ← D1_squashed(message="D1\n\nD2", parent=C1)
    //   UN seul commit squashé (PAS de D1' résiduel), parent = C1 (base du rebase).

    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      // main : modifie a.txt
      'write a.txt "main"',
      'git add a.txt',
      'git commit -m "C1"',
      // feature : D1 ajoute b.txt (sans conflit), D2 modifie a.txt (conflit avec C1)
      'git checkout feature',
      'write b.txt "d1"',
      'git add b.txt',
      'git commit -m "D1"',
      'write a.txt "d2"',
      'git add a.txt',
      'git commit -m "D2"',
    ]);

    // Lancer le rebase interactif
    engine.execute('git rebase -i main');
    const snapPending = engine.snapshot();
    const todoRaw = snapPending.rebasingInteractive!.todoList;
    // todoRaw[0] = D1 (le plus ancien), todoRaw[1] = D2

    const d1CommitHash = todoRaw[0]!.commitHash;
    const d2CommitHash = todoRaw[1]!.commitHash;

    const todoList: TodoItem[] = [
      { action: 'pick', commitHash: d1CommitHash, message: 'D1' },
      { action: 'squash', commitHash: d2CommitHash, message: 'D2' },
    ];

    // Exécuter la todo list : D1 passe, squash D2 → conflit sur a.txt
    const resultConflict = engine.executeRebaseInteractive(todoList);
    expect(resultConflict.exitCode).toBe(1);
    expect(resultConflict.output.some((l) => l.includes('CONFLICT'))).toBe(true);

    const snapConflict = engine.snapshot();
    expect(snapConflict.operationState?.type).toBe('rebasing');
    // Le conflit doit être sur la marche squash (index 1)
    expect(snapConflict.rebasingInteractive?.currentIndex).toBe(1);

    // Résoudre le conflit et continuer
    engine.execute('write a.txt "resolved"');
    engine.execute('git add a.txt');
    const resultContinue = engine.execute('git rebase --continue');

    expect(resultContinue.exitCode).toBe(0);
    expect(resultContinue.output.some((l) => l.includes('Successfully rebased'))).toBe(true);

    const snap = engine.snapshot();

    // (a) Rebase terminé
    expect(snap.operationState).toBeUndefined();
    expect(snap.rebasingInteractive).toBeUndefined();

    // (a) Exactement 1 commit squashé en plus de C0 et C1 (= 3 commits sur feature)
    // snap.commits = commits accessibles depuis feature (du plus récent au plus ancien)
    expect(snap.commits).toHaveLength(3); // D1_squashed, C1, C0

    // (b) Le commit squashé est le HEAD de feature
    const featureHeadHash = snap.branches['feature']!;
    const squashedCommit = snap.allCommits?.find((c) => c.hash === featureHeadHash);
    expect(squashedCommit).toBeDefined();

    // (b) Son parent est C1 (la base du rebase, PAS D1')
    const c1Hash = snap.allCommits?.find((c) => c.message === 'C1')?.hash;
    expect(c1Hash).toBeDefined();
    expect(squashedCommit!.parents[0]).toBe(c1Hash);

    // (c) Message combiné "D1\n\nD2"
    expect(squashedCommit!.message).toBe('D1\n\nD2');

    // Vérification supplémentaire : pas de commit résiduel D1' orphelin dans les commits de feature
    const d1PrimeOrphan = snap.commits.find((c) => c.message === 'D1' && c.hash !== d1CommitHash);
    expect(d1PrimeOrphan).toBeUndefined();
  });
});
