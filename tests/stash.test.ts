/**
 * Tests Phase 5 : git stash
 * Spec : docs/specs/26-stash.md
 * CA-stash-01 … CA-stash-12
 *
 * Principe : boîte noire via execute() + snapshot().
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

/**
 * Dépôt simple avec un commit C1 et des modifications non commitées.
 * C1 : a.txt = "v1"
 * WT : a.txt = "v2", b.txt = "new"
 */
function repoWithChanges() {
  const engine = replay([
    'git init',
    'write a.txt "v1"',
    'git add a.txt',
    'git commit -m "C1"',
    // Modifier a.txt et ajouter b.txt
    'write a.txt "v2"',
    'write b.txt "new"',
  ]);
  return engine;
}

/**
 * Dépôt propre (aucune modification non commitée).
 */
function repoClean() {
  return replay(['git init', 'write a.txt "v1"', 'git add a.txt', 'git commit -m "C1"']);
}

// ---------------------------------------------------------------------------
// CA-stash-01 : Stash simple
// ---------------------------------------------------------------------------

describe('CA-stash-01 : Stash simple', () => {
  it('CA-stash-01 : git stash → exitCode 0, working tree nettoyé, stashCount augmente', () => {
    const engine = repoWithChanges();

    const result = engine.execute('git stash');
    expect(result.exitCode).toBe(0);
    expect(result.output[0]).toContain('Saved working directory');

    const snap = engine.snapshot();

    // stashCount = 1
    expect(snap.stashCount).toBe(1);

    // Working tree restauré : a.txt = "v1" (la modif suivie a été stashée).
    const aTxt = snap.files.find((f) => f.path === 'a.txt');
    expect(aTxt?.status).toBe('clean');

    // b.txt (non suivi) est PRÉSERVÉ : `git stash` (sans -u) ne stashe pas les
    // fichiers non suivis et ne les retire pas du working tree (TLS-01).
    const bTxt = snap.files.find((f) => f.path === 'b.txt');
    expect(bTxt?.status).toBe('untracked');
  });
});

// ---------------------------------------------------------------------------
// CA-stash-02 : Stash avec message
// ---------------------------------------------------------------------------

describe('CA-stash-02 : Stash avec message', () => {
  it('CA-stash-02 : git stash push -m "Save feature work" → message sauvegardé dans output', () => {
    const engine = repoWithChanges();

    const result = engine.execute('git stash push -m "Save feature work"');
    expect(result.exitCode).toBe(0);
    expect(result.output[0]).toContain('Save feature work');

    const snap = engine.snapshot();
    expect(snap.stashCount).toBe(1);

    // Working tree nettoyé
    const aFile = snap.files.find((f) => f.path === 'a.txt');
    expect(aFile?.status).toBe('clean');
  });
});

// ---------------------------------------------------------------------------
// CA-stash-03 : Pas de changements
// ---------------------------------------------------------------------------

describe('CA-stash-03 : Pas de changements à sauvegarder', () => {
  it('CA-stash-03 : git stash sur repo propre → exitCode 0, "No local changes", stashCount inchangé', () => {
    const engine = repoClean();

    const snapBefore = engine.snapshot();
    const stashCountBefore = snapBefore.stashCount ?? 0;

    const result = engine.execute('git stash');
    expect(result.exitCode).toBe(0);
    expect(result.output[0]).toContain('No local changes');

    const snap = engine.snapshot();
    expect(snap.stashCount ?? 0).toBe(stashCountBefore);
  });
});

// ---------------------------------------------------------------------------
// CA-stash-04 : Stash list
// ---------------------------------------------------------------------------

describe('CA-stash-04 : Stash list', () => {
  it('CA-stash-04 : deux stash → stash list affiche stash@{0} et stash@{1} avec messages', () => {
    const engine = repoWithChanges();

    // Premier stash : "Save work"
    engine.execute('git stash push -m "Save work"');

    // Faire de nouvelles modifications pour un 2e stash
    engine.execute('write a.txt "v3"');
    engine.execute('git stash push -m "Fix bug"');

    const result = engine.execute('git stash list');
    expect(result.exitCode).toBe(0);
    expect(result.output).toHaveLength(2);

    // stash@{0} = plus récent ("Fix bug"), stash@{1} = "Save work"
    expect(result.output[0]).toContain('stash@{0}');
    expect(result.output[0]).toContain('Fix bug');
    expect(result.output[1]).toContain('stash@{1}');
    expect(result.output[1]).toContain('Save work');
  });

  it('CA-stash-04 : format standard sans message → "WIP on <branch>:"', () => {
    const engine = repoWithChanges();
    engine.execute('git stash');

    const result = engine.execute('git stash list');
    expect(result.exitCode).toBe(0);
    expect(result.output[0]).toContain('stash@{0}');
    // Doit contenir le nom de branche
    expect(result.output[0]).toContain('main');
  });
});

// ---------------------------------------------------------------------------
// CA-stash-05 : Stash pop simple
// ---------------------------------------------------------------------------

describe('CA-stash-05 : Stash pop simple', () => {
  it('CA-stash-05 : git stash pop → working tree restauré, stashCount = 0, output "Dropped"', () => {
    const engine = repoWithChanges();
    engine.execute('git stash');

    const snapStashed = engine.snapshot();
    expect(snapStashed.stashCount).toBe(1);

    const result = engine.execute('git stash pop');
    expect(result.exitCode).toBe(0);
    expect(result.output[0]).toContain('Dropped');

    const snap = engine.snapshot();
    expect(snap.stashCount).toBe(0);

    // a.txt doit être restauré à "v2" (modification sauvegardée)
    const aFile = snap.files.find((f) => f.path === 'a.txt');
    expect(aFile).toBeDefined();
    expect(aFile!.status).toBe('modified');
  });
});

// ---------------------------------------------------------------------------
// CA-stash-06 : Stash apply simple
// ---------------------------------------------------------------------------

describe('CA-stash-06 : Stash apply simple', () => {
  it('CA-stash-06 : git stash apply → working tree restauré, stashCount inchangé (stash conservé)', () => {
    const engine = repoWithChanges();
    engine.execute('git stash');

    const result = engine.execute('git stash apply');
    expect(result.exitCode).toBe(0);

    // stash conservé
    const snap = engine.snapshot();
    expect(snap.stashCount).toBe(1);

    // Output ne doit pas contenir "Dropped"
    const hasDropped = result.output.some((l) => l.includes('Dropped'));
    expect(hasDropped).toBe(false);

    // Working tree restauré
    const aFile = snap.files.find((f) => f.path === 'a.txt');
    expect(aFile).toBeDefined();
    expect(aFile!.status).toBe('modified');
  });
});

// ---------------------------------------------------------------------------
// CA-stash-07 : Pop sur pile vide
// ---------------------------------------------------------------------------

describe('CA-stash-07 : Pop sur pile vide', () => {
  it('CA-stash-07 : git stash pop avec pile vide → exitCode 128, "No stash entries found"', () => {
    const engine = repoClean();

    const result = engine.execute('git stash pop');
    expect(result.exitCode).toBe(128);

    const allMessages = [...result.output, ...result.errors].join('\n');
    expect(allMessages).toContain('No stash entries found');

    // Aucune modification
    const snap = engine.snapshot();
    expect(snap.stashCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CA-stash-08 : Pop avec index spécifié
// ---------------------------------------------------------------------------

describe('CA-stash-08 : Pop avec index spécifié', () => {
  it('CA-stash-08 : git stash pop stash@{1} → stash@{1} appliqué et supprimé, réindexation', () => {
    const engine = repoClean();

    // Créer 3 stash : S0, S1, S2
    engine.execute('write a.txt "s0"');
    engine.execute('git stash push -m "S0"');
    engine.execute('write a.txt "s1"');
    engine.execute('git stash push -m "S1"');
    engine.execute('write a.txt "s2"');
    engine.execute('git stash push -m "S2"');

    // Pile actuelle : @{0}=S2, @{1}=S1, @{2}=S0
    expect(engine.snapshot().stashCount).toBe(3);

    const result = engine.execute('git stash pop stash@{1}');
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    expect(snap.stashCount).toBe(2);

    // Vérifier la liste après pop : @{0}=S2, @{1}=S0
    const listResult = engine.execute('git stash list');
    expect(listResult.output[0]).toContain('S2');
    expect(listResult.output[1]).toContain('S0');
  });
});

// ---------------------------------------------------------------------------
// CA-stash-09 : Drop stash
// ---------------------------------------------------------------------------

describe('CA-stash-09 : Drop stash', () => {
  it('CA-stash-09 : git stash drop stash@{0} → stash supprimé, réindexation, output "Dropped"', () => {
    const engine = repoClean();

    engine.execute('write a.txt "s0"');
    engine.execute('git stash push -m "First"');
    engine.execute('write a.txt "s1"');
    engine.execute('git stash push -m "Second"');

    // @{0} = Second, @{1} = First
    const result = engine.execute('git stash drop stash@{0}');
    expect(result.exitCode).toBe(0);
    expect(result.output[0]).toContain('Dropped');

    const snap = engine.snapshot();
    expect(snap.stashCount).toBe(1);

    // @{1} (First) est réindexé en @{0}
    const listResult = engine.execute('git stash list');
    expect(listResult.output[0]).toContain('stash@{0}');
    expect(listResult.output[0]).toContain('First');
  });
});

// ---------------------------------------------------------------------------
// CA-stash-10 : Pop avec conflit
// ---------------------------------------------------------------------------

describe('CA-stash-10 : Pop avec conflit', () => {
  it('CA-stash-10 : pop avec conflit → exitCode 1, marqueurs de conflit, stash conservé', () => {
    // État initial : a.txt = "base"
    // Stash : a.txt = "saved"
    // Puis on modifie a.txt = "current" sur le WT courant
    // → conflit lors du pop

    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "C1"',
      // Sauvegarder "saved" dans le stash
      'write a.txt "saved"',
      'git stash',
    ]);

    // Maintenant modifier a.txt → "current" (sans commiter)
    engine.execute('write a.txt "current"');

    const snapBeforePop = engine.snapshot();
    expect(snapBeforePop.stashCount).toBe(1);

    const result = engine.execute('git stash pop');
    expect(result.exitCode).toBe(1);
    expect(result.output.some((l) => l.includes('CONFLICT'))).toBe(true);

    const snap = engine.snapshot();
    // Stash conservé (pas supprimé en cas de conflit)
    expect(snap.stashCount).toBe(1);

    // a.txt doit contenir des marqueurs de conflit
    const aFile = snap.files.find((f) => f.path === 'a.txt');
    expect(aFile).toBeDefined();
    expect(aFile!.status).toBe('modified');
  });
});

// ---------------------------------------------------------------------------
// CA-stash-11 : Stash HEAD détaché
// ---------------------------------------------------------------------------

describe('CA-stash-11 : Stash sur HEAD détaché', () => {
  it('CA-stash-11 : git stash en HEAD détaché → exitCode 0, output contient "WIP on HEAD" ou hash', () => {
    const engine = replay(['git init', 'write a.txt "v1"', 'git add a.txt', 'git commit -m "C1"']);

    // Détacher HEAD
    const snap0 = engine.snapshot();
    const c1Hash = snap0.commits[0]!.hash;
    engine.execute(`git checkout ${c1Hash}`);

    // Faire une modification
    engine.execute('write a.txt "modified"');

    const result = engine.execute('git stash');
    expect(result.exitCode).toBe(0);

    // Output doit indiquer HEAD détaché
    const outputLine = result.output[0] ?? '';
    const mentionsHead = outputLine.includes('HEAD') || outputLine.includes(c1Hash.slice(0, 7));
    expect(mentionsHead).toBe(true);

    const snap = engine.snapshot();
    expect(snap.stashCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CA-stash-12 : Pop stash d'une autre branche
// ---------------------------------------------------------------------------

describe("CA-stash-12 : Pop stash d'une autre branche", () => {
  it('CA-stash-12 : stash créé sur main, pop sur feature → appliqué sans erreur de branche', () => {
    const engine = replay([
      'git init',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "C1"',
      'git branch feature',
      // Modification SUIVIE sur main (b.txt stagé) → stash
      'write b.txt "stashed"',
      'git add b.txt',
      'git stash push -m "Stashed on main"',
      // Passer sur feature
      'git checkout feature',
    ]);

    expect(engine.snapshot().head).toMatchObject({ type: 'branch', name: 'feature' });
    expect(engine.snapshot().stashCount).toBe(1);

    const result = engine.execute('git stash pop stash@{0}');
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    expect(snap.stashCount).toBe(0);

    // b.txt appliqué sur feature
    const bFile = snap.files.find((f) => f.path === 'b.txt');
    expect(bFile).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Stash multiple empilements (test supplémentaire)
// ---------------------------------------------------------------------------

describe('Stash : empilements multiples', () => {
  it('Deux stash empilés → stashCount = 2, order LIFO respecté', () => {
    const engine = repoClean();

    engine.execute('write a.txt "change1"');
    engine.execute('git stash push -m "First"');

    engine.execute('write a.txt "change2"');
    engine.execute('git stash push -m "Second"');

    const snap = engine.snapshot();
    expect(snap.stashCount).toBe(2);

    const listResult = engine.execute('git stash list');
    // @{0} = Second (plus récent), @{1} = First
    expect(listResult.output[0]).toContain('Second');
    expect(listResult.output[1]).toContain('First');
  });
});

// ---------------------------------------------------------------------------
// Stash drop avec index invalide
// ---------------------------------------------------------------------------

describe('Stash drop : index invalide', () => {
  it('git stash drop stash@{5} avec pile de 2 → exitCode 128, "no such stash"', () => {
    const engine = repoClean();

    engine.execute('write a.txt "x"');
    engine.execute('git stash');
    engine.execute('write a.txt "y"');
    engine.execute('git stash');

    const result = engine.execute('git stash drop stash@{5}');
    expect(result.exitCode).toBe(128);

    const allMessages = [...result.output, ...result.errors].join('\n');
    expect(allMessages).toContain('no such stash');
  });
});

// ---------------------------------------------------------------------------
// Déterminisme stash
// ---------------------------------------------------------------------------

describe('Déterminisme : stash', () => {
  it('Deux moteurs rejouant la même séquence avec stash → mêmes hash', () => {
    function buildEngineWithStash() {
      const engine = replay([
        'git init',
        'write a.txt "base"',
        'git add a.txt',
        'git commit -m "C1"',
        'write a.txt "modified"',
        'git stash',
        'write b.txt "new"',
        'git add b.txt',
        'git commit -m "C2"',
        'git stash pop',
      ]);
      return engine;
    }

    const e1 = buildEngineWithStash();
    const e2 = buildEngineWithStash();

    const s1 = e1.snapshot();
    const s2 = e2.snapshot();

    expect(s1.commits.map((c) => c.hash)).toEqual(s2.commits.map((c) => c.hash));
  });
});
