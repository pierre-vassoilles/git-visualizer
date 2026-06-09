/**
 * Tests Phase 5 : git reflog
 * Spec : docs/specs/27-reflog.md
 * CA-reflog-01 … CA-reflog-12
 *
 * Principe : boîte noire via execute() + snapshot().
 * Le reflog est consultable via "git reflog" et les révisions HEAD@{n}
 * sont utilisables dans les commandes (ex : git reset --hard HEAD@{1}).
 */

import { describe, it, expect } from 'vitest';
import { replay, newEngine } from './helpers';

// ---------------------------------------------------------------------------
// CA-reflog-01 : Afficher reflog HEAD
// ---------------------------------------------------------------------------

describe('CA-reflog-01 : Afficher reflog HEAD', () => {
  it('CA-reflog-01 : git reflog après plusieurs commits/checkout → lignes HEAD@{n} du plus récent au plus ancien', () => {
    const engine = replay([
      'git init',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1"',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "C2"',
      'git branch feature',
      'git checkout feature',
    ]);

    const result = engine.execute('git reflog');
    expect(result.exitCode).toBe(0);
    expect(result.output.length).toBeGreaterThan(0);

    // Chaque ligne doit contenir HEAD@{n}
    for (const line of result.output) {
      expect(line).toMatch(/HEAD@\{\d+\}/);
    }

    // Ordre : HEAD@{0} en tête (plus récent)
    expect(result.output[0]).toContain('HEAD@{0}');
    if (result.output.length > 1) {
      expect(result.output[1]).toContain('HEAD@{1}');
    }
  });
});

// ---------------------------------------------------------------------------
// CA-reflog-02 : Résoudre HEAD@{n}
// ---------------------------------------------------------------------------

describe('CA-reflog-02 : Résoudre HEAD@{n} via git reset', () => {
  it('CA-reflog-02 : HEAD@{1} après un commit → pointe le commit précédent', () => {
    const engine = replay([
      'git init',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1"',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "C2"',
    ]);

    // HEAD@{0} = C2 (dernier commit), HEAD@{1} = C1
    const snapBefore = engine.snapshot();
    const c1Hash = snapBefore.commits[1]!.hash;
    const c2Hash = snapBefore.commits[0]!.hash;

    // Utiliser HEAD@{1} dans git reset --hard
    const result = engine.execute('git reset --hard HEAD@{1}');
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    // HEAD doit pointer C1
    const currentHash = snap.branches['main']!;
    expect(currentHash).toBe(c1Hash);
    expect(currentHash).not.toBe(c2Hash);
  });
});

// ---------------------------------------------------------------------------
// CA-reflog-03 : Reflog après commit
// ---------------------------------------------------------------------------

describe('CA-reflog-03 : Reflog après commit', () => {
  it('CA-reflog-03 : après deux commits, reflog contient entrées avec action "commit"', () => {
    const engine = replay([
      'git init',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1"',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "C2"',
    ]);

    const result = engine.execute('git reflog');
    expect(result.exitCode).toBe(0);

    // Au moins une ligne doit contenir "commit"
    const commitLines = result.output.filter((l) => l.includes('commit'));
    expect(commitLines.length).toBeGreaterThanOrEqual(1);

    // HEAD@{0} doit référencer C2 (commit le plus récent)
    const snap = engine.snapshot();
    const c2Hash = snap.commits[0]!.hash;
    const shortC2 = c2Hash.slice(0, 7);
    expect(result.output[0]).toContain(shortC2);
  });
});

// ---------------------------------------------------------------------------
// CA-reflog-04 : Reflog après checkout
// ---------------------------------------------------------------------------

describe('CA-reflog-04 : Reflog après checkout', () => {
  it('CA-reflog-04 : git checkout feature → entrée reflog avec action "checkout"', () => {
    const engine = replay([
      'git init',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1"',
      'git branch feature',
      'git checkout feature',
    ]);

    const result = engine.execute('git reflog');
    expect(result.exitCode).toBe(0);

    // Au moins une ligne doit contenir "checkout"
    const checkoutLine = result.output.find((l) => l.includes('checkout'));
    expect(checkoutLine).toBeDefined();
    expect(checkoutLine).toContain('HEAD@{0}');
  });
});

// ---------------------------------------------------------------------------
// CA-reflog-05 : Reflog après reset
// ---------------------------------------------------------------------------

describe('CA-reflog-05 : Reflog après reset', () => {
  it('CA-reflog-05 : git reset --hard C1 → entrée reflog action "reset", newHash = C1', () => {
    const engine = replay([
      'git init',
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

    const snapBefore = engine.snapshot();
    const c1Hash = snapBefore.commits[2]!.hash;

    engine.execute(`git reset --hard ${c1Hash}`);

    const result = engine.execute('git reflog');
    expect(result.exitCode).toBe(0);

    // La ligne HEAD@{0} doit contenir "reset"
    const resetLine = result.output.find((l) => l.includes('HEAD@{0}'));
    expect(resetLine).toBeDefined();
    expect(resetLine).toContain('reset');

    // Le hash affiché doit être celui de C1
    const shortC1 = c1Hash.slice(0, 7);
    expect(resetLine).toContain(shortC1);
  });
});

// ---------------------------------------------------------------------------
// CA-reflog-06 : Reflog après merge
// ---------------------------------------------------------------------------

describe('CA-reflog-06 : Reflog après merge', () => {
  it('CA-reflog-06 : git merge feature → entrée reflog avec action "merge"', () => {
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
      // feature : D1
      'git checkout feature',
      'write c.txt "feature"',
      'git add c.txt',
      'git commit -m "D1"',
      // Retour main et merge
      'git checkout main',
      'git merge feature',
    ]);

    const result = engine.execute('git reflog');
    expect(result.exitCode).toBe(0);

    // Une ligne doit contenir "merge"
    const mergeLine = result.output.find((l) => l.includes('merge'));
    expect(mergeLine).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CA-reflog-07 : Reflog après rebase
// ---------------------------------------------------------------------------

describe('CA-reflog-07 : Reflog après rebase', () => {
  it('CA-reflog-07 : git rebase main (succès) → entrée reflog avec action "rebase"', () => {
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
      // feature : D1
      'git checkout feature',
      'write c.txt "feat"',
      'git add c.txt',
      'git commit -m "D1"',
      // Rebase
      'git rebase main',
    ]);

    const result = engine.execute('git reflog');
    expect(result.exitCode).toBe(0);

    // Une ligne doit contenir "rebase"
    const rebaseLine = result.output.find((l) => l.includes('rebase'));
    expect(rebaseLine).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CA-reflog-08 : Reflog d'une branche
// ---------------------------------------------------------------------------

describe('CA-reflog-08 : Reflog d\'une branche', () => {
  it('CA-reflog-08 : git reflog show main → affiche le reflog de la branche main', () => {
    const engine = replay([
      'git init',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1"',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "C2"',
    ]);

    const result = engine.execute('git reflog show main');
    expect(result.exitCode).toBe(0);

    // Output non vide et contient des lignes avec main@{n}
    expect(result.output.length).toBeGreaterThan(0);
    const hasMainRef = result.output.some((l) => l.includes('main@{'));
    expect(hasMainRef).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-reflog-09 : Index hors limites
// ---------------------------------------------------------------------------

describe('CA-reflog-09 : Index hors limites', () => {
  it('CA-reflog-09 : HEAD@{10} avec seulement 3 entrées → commande échoue', () => {
    const engine = replay([
      'git init',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1"',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "C2"',
    ]);

    // git reset avec un index hors limites
    const result = engine.execute('git reset --hard HEAD@{10}');
    expect(result.exitCode).not.toBe(0);

    const allMessages = [...result.output, ...result.errors].join('\n');
    // Doit contenir une indication d'erreur (revision not found ou similaire)
    const hasError = allMessages.includes('not found') || allMessages.includes('unknown');
    expect(hasError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-reflog-10 : Reset --hard avec undo via reflog (scénario "time travel")
// ---------------------------------------------------------------------------

describe('CA-reflog-10 : Reset --hard undo via HEAD@{1}', () => {
  it('CA-reflog-10 : reset --hard C1, puis reset --hard HEAD@{1} → restaure C3', () => {
    const engine = replay([
      'git init',
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

    const snapBefore = engine.snapshot();
    const c3Hash = snapBefore.commits[0]!.hash;
    const c1Hash = snapBefore.commits[2]!.hash;

    // Reset vers C1 (HEAD perd C2 et C3)
    engine.execute(`git reset --hard ${c1Hash}`);

    const snapAfterReset = engine.snapshot();
    expect(snapAfterReset.branches['main']).toBe(c1Hash);

    // Undo : utiliser HEAD@{1} pour retrouver C3
    // HEAD@{0} = après le reset (= C1), HEAD@{1} = avant le reset (= C3)
    const resultUndo = engine.execute('git reset --hard HEAD@{1}');
    expect(resultUndo.exitCode).toBe(0);

    const snapAfterUndo = engine.snapshot();
    expect(snapAfterUndo.branches['main']).toBe(c3Hash);
  });
});

// ---------------------------------------------------------------------------
// CA-reflog-11 : Reflog après revert
// ---------------------------------------------------------------------------

describe('CA-reflog-11 : Reflog après revert', () => {
  it('CA-reflog-11 : git revert <commit> → entrée reflog avec action "revert"', () => {
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

    engine.execute(`git revert ${c2Hash}`);

    const result = engine.execute('git reflog');
    expect(result.exitCode).toBe(0);

    // Une ligne doit contenir "revert"
    const revertLine = result.output.find((l) => l.includes('revert'));
    expect(revertLine).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CA-reflog-12 : Reflog après cherry-pick
// ---------------------------------------------------------------------------

describe('CA-reflog-12 : Reflog après cherry-pick', () => {
  it('CA-reflog-12 : git cherry-pick C2 → entrée reflog avec action "cherry-pick"', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      // feature : D1
      'git checkout feature',
      'write b.txt "feature"',
      'git add b.txt',
      'git commit -m "D1"',
      // Retour main
      'git checkout main',
    ]);

    const featureSnap = engine.snapshot();
    // Trouver D1 sur feature
    const d1Hash = featureSnap.branches['feature']!;

    const result = engine.execute(`git cherry-pick ${d1Hash}`);
    expect(result.exitCode).toBe(0);

    const reflogResult = engine.execute('git reflog');
    expect(reflogResult.exitCode).toBe(0);

    // Une ligne doit contenir "cherry-pick"
    const cpLine = reflogResult.output.find((l) => l.includes('cherry-pick'));
    expect(cpLine).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Reflog : format de sortie standard
// ---------------------------------------------------------------------------

describe('Reflog : format de sortie', () => {
  it('Format : "<shortHash> HEAD@{n}: <action>: <description>"', () => {
    const engine = replay([
      'git init',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "First commit"',
    ]);

    const result = engine.execute('git reflog');
    expect(result.exitCode).toBe(0);
    expect(result.output.length).toBeGreaterThan(0);

    // Vérifier le format de la première ligne
    const firstLine = result.output[0]!;
    // Doit commencer par un short hash (7 chars hex)
    expect(firstLine).toMatch(/^[0-9a-f]{7}/);
    // Doit contenir HEAD@{0}
    expect(firstLine).toContain('HEAD@{0}');
    // Doit avoir le format "hash HEAD@{n}: action: description"
    expect(firstLine).toMatch(/^[0-9a-f]{7} HEAD@\{0\}: \w+: .+$/);
  });
});

// ---------------------------------------------------------------------------
// Reflog : reflog vide (aucune opération)
// ---------------------------------------------------------------------------

describe('Reflog vide', () => {
  it('git reflog sur repo juste initialisé (sans commits) → output vide ou exitCode 0', () => {
    const engine = newEngine();
    engine.execute('git init');

    const result = engine.execute('git reflog');
    // Soit vide, soit exitCode 0 avec output vide
    // (spec : optionnel si une entrée "init" est présente)
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reflog après rebase interactif
// ---------------------------------------------------------------------------

describe('Reflog après rebase interactif', () => {
  it('git rebase -i puis executeRebaseInteractive → entrée reflog "rebase" ajoutée', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C0"',
      'git branch feature',
      // main : avancer pour créer divergence
      'write b.txt "main"',
      'git add b.txt',
      'git commit -m "C1"',
      // feature : D1
      'git checkout feature',
      'write c.txt "d1"',
      'git add c.txt',
      'git commit -m "D1"',
    ]);

    engine.execute('git rebase -i main');
    const snapPending = engine.snapshot();
    const todoRaw = snapPending.rebasingInteractive!.todoList;

    engine.executeRebaseInteractive(
      todoRaw.map((item) => ({
        action: 'pick' as const,
        commitHash: item.commitHash,
        message: item.message,
      })),
    );

    const result = engine.execute('git reflog');
    expect(result.exitCode).toBe(0);

    const rebaseLine = result.output.find((l) => l.includes('rebase'));
    expect(rebaseLine).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Déterminisme reflog
// ---------------------------------------------------------------------------

describe('Déterminisme : reflog', () => {
  it('Deux moteurs rejouant la même séquence → même nombre d\'entrées reflog', () => {
    const commands = [
      'git init',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1"',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "C2"',
      'git branch feature',
      'git checkout feature',
      'write b.txt "d1"',
      'git add b.txt',
      'git commit -m "D1"',
      'git checkout main',
    ];

    const e1 = replay(commands);
    const e2 = replay(commands);

    const r1 = e1.execute('git reflog');
    const r2 = e2.execute('git reflog');

    expect(r1.output.length).toBe(r2.output.length);
    expect(r1.output).toEqual(r2.output);
  });
});
