/**
 * Tests Phase 3 — allCommits (boîte noire via le moteur)
 *
 * Spec de référence : docs/specs/15-graph-model.md
 * Principe : tests dérivés des CA spec, pas de l'implémentation.
 *
 * Famille testée : engine.snapshot().allCommits
 *   - CA-model-01 : snapshot expose allCommits, non vide après commit
 *   - CA-model-02 : backward-compat (commits depuis HEAD inchangé)
 *   - CA-model-03 : décorations branches/tags correctes
 *   - CA-model-04 : tri topologique (parents avant enfants, tous présents)
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

/** Engine initialisé avec un seul commit sur main. */
function engineOneCommit() {
  return replay([
    'git init',
    'write file.txt "hello"',
    'git add file.txt',
    'git commit -m "initial"',
  ]);
}

/** Engine avec deux branches divergentes : main et feature. */
function engineDivergingBranches() {
  return replay([
    'git init',
    // Commit A partagé
    'write file.txt "base"',
    'git add file.txt',
    'git commit -m "base commit"',
    // Branche feature diverge depuis A
    'git branch feature',
    // Commit B sur main
    'write file.txt "main v2"',
    'git add file.txt',
    'git commit -m "main commit"',
    // Basculer sur feature et ajouter commit C
    'git checkout feature',
    'write other.txt "feature work"',
    'git add other.txt',
    'git commit -m "feature commit"',
  ]);
}

/** Engine avec un tag. */
function engineWithTag() {
  return replay([
    'git init',
    'write file.txt "v1"',
    'git add file.txt',
    'git commit -m "initial"',
    'git tag v1.0',
  ]);
}

// ---------------------------------------------------------------------------
// CA-model-01 : snapshot expose allCommits, non vide après commit
// ---------------------------------------------------------------------------

describe('allCommits — CA-model-01 : champ présent et non vide', () => {
  it('CA-model-01 : allCommits est défini après git init + commit', () => {
    const engine = engineOneCommit();
    const snap = engine.snapshot();
    expect(snap.allCommits).toBeDefined();
  });

  it('CA-model-01 : allCommits contient au moins 1 élément après commit', () => {
    const engine = engineOneCommit();
    const snap = engine.snapshot();
    expect(snap.allCommits!.length).toBeGreaterThanOrEqual(1);
  });

  it('CA-model-01 : allCommits est vide (ou absent) avant tout commit', () => {
    const engine = replay(['git init']);
    const snap = engine.snapshot();
    // Spec : allCommits optionnel ; s'il est présent il doit être vide
    if (snap.allCommits !== undefined) {
      expect(snap.allCommits).toHaveLength(0);
    }
  });

  it('CA-model-01 : allCommits contient un SnapshotCommit valide (hash, shortHash, message, parents, branches, tags)', () => {
    const engine = engineOneCommit();
    const snap = engine.snapshot();
    const commit = snap.allCommits![0]!;
    expect(typeof commit.hash).toBe('string');
    expect(commit.hash.length).toBeGreaterThan(0);
    expect(typeof commit.shortHash).toBe('string');
    expect(typeof commit.message).toBe('string');
    expect(Array.isArray(commit.parents)).toBe(true);
    expect(Array.isArray(commit.branches)).toBe(true);
    expect(Array.isArray(commit.tags)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-model-02 : backward-compat — snapshot.commits inchangé
// ---------------------------------------------------------------------------

describe('allCommits — CA-model-02 : backward-compat, commits depuis HEAD inchangé', () => {
  it('CA-model-02 : snapshot.commits reste non vide et représente HEAD', () => {
    const engine = engineOneCommit();
    const snap = engine.snapshot();
    expect(snap.commits.length).toBeGreaterThanOrEqual(1);
  });

  it('CA-model-02 : après divergence, snapshot.commits ne contient que les commits depuis HEAD', () => {
    const engine = engineDivergingBranches();
    // HEAD est sur feature après checkout
    const snap = engine.snapshot();
    // commits (depuis HEAD = feature) ne doit PAS inclure le commit "main commit"
    const commitMessages = snap.commits.map((c) => c.message);
    expect(commitMessages).not.toContain('main commit');
    // mais doit contenir "feature commit" et "base commit"
    expect(commitMessages).toContain('feature commit');
    expect(commitMessages).toContain('base commit');
  });

  it('CA-model-02 : allCommits contient PLUS de commits que commits quand branches divergentes', () => {
    const engine = engineDivergingBranches();
    const snap = engine.snapshot();
    // allCommits doit inclure commits de main et de feature
    expect(snap.allCommits!.length).toBeGreaterThan(snap.commits.length);
  });

  it('CA-model-02 : allCommits contient le commit "main commit" inaccessible depuis HEAD=feature', () => {
    const engine = engineDivergingBranches();
    const snap = engine.snapshot();
    const allMessages = snap.allCommits!.map((c) => c.message);
    expect(allMessages).toContain('main commit');
  });

  it('CA-model-02 : allCommits contient aussi le commit "feature commit"', () => {
    const engine = engineDivergingBranches();
    const snap = engine.snapshot();
    const allMessages = snap.allCommits!.map((c) => c.message);
    expect(allMessages).toContain('feature commit');
  });

  it('CA-model-02 : GraphView peut utiliser allCommits ?? commits sans erreur', () => {
    const engine = engineOneCommit();
    const snap = engine.snapshot();
    const graphCommits = snap.allCommits ?? snap.commits;
    expect(Array.isArray(graphCommits)).toBe(true);
    expect(graphCommits.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// CA-model-03 : décorations branches/tags correctes
// ---------------------------------------------------------------------------

describe('allCommits — CA-model-03 : décorations branches et tags', () => {
  it('CA-model-03 : le commit tip de main porte la décoration "main"', () => {
    const engine = engineOneCommit();
    const snap = engine.snapshot();
    const mainTipHash = snap.branches['main'];
    const mainTipCommit = snap.allCommits!.find((c) => c.hash === mainTipHash);
    expect(mainTipCommit).toBeDefined();
    expect(mainTipCommit!.branches).toContain('main');
  });

  it('CA-model-03 : le commit tip de feature porte la décoration "feature"', () => {
    const engine = engineDivergingBranches();
    const snap = engine.snapshot();
    const featureTipHash = snap.branches['feature'];
    const featureTipCommit = snap.allCommits!.find((c) => c.hash === featureTipHash);
    expect(featureTipCommit).toBeDefined();
    expect(featureTipCommit!.branches).toContain('feature');
  });

  it('CA-model-03 : le commit partagé (base) ne porte PAS de décoration de branche', () => {
    // Base commit est un ancêtre commun, ses deux branches ont divergé
    const engine = engineDivergingBranches();
    const snap = engine.snapshot();
    const baseCommit = snap.allCommits!.find((c) => c.message === 'base commit');
    expect(baseCommit).toBeDefined();
    // Le commit base n'est pas le tip d'une branche
    expect(baseCommit!.branches).not.toContain('main');
    expect(baseCommit!.branches).not.toContain('feature');
  });

  it('CA-model-03 : un commit taggué porte le tag dans son champ tags', () => {
    const engine = engineWithTag();
    const snap = engine.snapshot();
    const taggedHash = snap.tags['v1.0'];
    const taggedCommit = snap.allCommits!.find((c) => c.hash === taggedHash);
    expect(taggedCommit).toBeDefined();
    expect(taggedCommit!.tags).toContain('v1.0');
  });

  it('CA-model-03 : si deux branches pointent le même commit, branches[] liste les deux', () => {
    // Créer deux branches sur le même commit tip
    const engine = replay([
      'git init',
      'write file.txt "hello"',
      'git add file.txt',
      'git commit -m "shared"',
      'git branch aliased', // aliased pointe sur le même commit que main
    ]);
    const snap = engine.snapshot();
    const mainTipHash = snap.branches['main'];
    const aliasedTipHash = snap.branches['aliased'];
    // Les deux branches pointent sur le même commit
    expect(mainTipHash).toBe(aliasedTipHash);
    const sharedCommit = snap.allCommits!.find((c) => c.hash === mainTipHash);
    expect(sharedCommit).toBeDefined();
    expect(sharedCommit!.branches).toContain('main');
    expect(sharedCommit!.branches).toContain('aliased');
  });

  it('CA-model-03 : les commits non-tip n\'ont pas de décoration de branche', () => {
    const engine = replay([
      'git init',
      'write file.txt "v1"',
      'git add file.txt',
      'git commit -m "first"',
      'write file.txt "v2"',
      'git add file.txt',
      'git commit -m "second"',
    ]);
    const snap = engine.snapshot();
    // "first" est un ancêtre de main, pas son tip
    const firstCommit = snap.allCommits!.find((c) => c.message === 'first');
    expect(firstCommit).toBeDefined();
    expect(firstCommit!.branches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CA-model-04 : tri topologique correct
// ---------------------------------------------------------------------------

describe('allCommits — CA-model-04 : tri topologique', () => {
  it('CA-model-04 : dans une chaîne linéaire, un enfant apparaît AVANT son parent (feuilles en tête)', () => {
    // La spec 16 indique : DFS post-ordre → enfants avant parents dans topSorted
    // allCommits suit la même convention : profondeur 0 en tête (commits récents d'abord)
    const engine = replay([
      'git init',
      'write file.txt "v1"',
      'git add file.txt',
      'git commit -m "commit A"',
      'write file.txt "v2"',
      'git add file.txt',
      'git commit -m "commit B"',
    ]);
    const snap = engine.snapshot();
    const all = snap.allCommits!;
    const idxA = all.findIndex((c) => c.message === 'commit A');
    const idxB = all.findIndex((c) => c.message === 'commit B');
    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(-1);
    // B est enfant de A → B doit apparaître avant A (index plus petit)
    expect(idxB).toBeLessThan(idxA);
  });

  it('CA-model-04 : tous les commits du dépôt sont présents dans allCommits (branches divergentes)', () => {
    const engine = engineDivergingBranches();
    const snap = engine.snapshot();
    const allMessages = snap.allCommits!.map((c) => c.message);
    expect(allMessages).toContain('base commit');
    expect(allMessages).toContain('main commit');
    expect(allMessages).toContain('feature commit');
    expect(snap.allCommits!).toHaveLength(3);
  });

  it('CA-model-04 : pas de commit en double dans allCommits', () => {
    const engine = engineDivergingBranches();
    const snap = engine.snapshot();
    const hashes = snap.allCommits!.map((c) => c.hash);
    const unique = new Set(hashes);
    expect(unique.size).toBe(hashes.length);
  });

  it('CA-model-04 : pour tout commit, ses parents apparaissent APRÈS lui dans allCommits', () => {
    const engine = engineDivergingBranches();
    const snap = engine.snapshot();
    const all = snap.allCommits!;
    const indexMap = new Map(all.map((c, i) => [c.hash, i]));
    for (const commit of all) {
      for (const parentHash of commit.parents) {
        const commitIdx = indexMap.get(commit.hash)!;
        const parentIdx = indexMap.get(parentHash);
        if (parentIdx !== undefined) {
          // Enfant avant parent = index enfant < index parent
          expect(commitIdx).toBeLessThan(parentIdx);
        }
      }
    }
  });

  it('CA-model-04 : déterminisme — deux engines rejouant la même séquence produisent le même allCommits', () => {
    const commands = [
      'git init',
      'write file.txt "base"',
      'git add file.txt',
      'git commit -m "base commit"',
      'git branch feature',
      'write file.txt "main v2"',
      'git add file.txt',
      'git commit -m "main commit"',
      'git checkout feature',
      'write other.txt "feature work"',
      'git add other.txt',
      'git commit -m "feature commit"',
    ];
    const snap1 = replay(commands).snapshot();
    const snap2 = replay(commands).snapshot();
    const hashes1 = snap1.allCommits!.map((c) => c.hash);
    const hashes2 = snap2.allCommits!.map((c) => c.hash);
    expect(hashes1).toEqual(hashes2);
  });
});
