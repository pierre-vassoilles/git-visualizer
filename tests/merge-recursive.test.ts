/**
 * Tests Phase B1 : merge récursif (bases multiples / criss-cross) + conflits delete/modify
 * Spec : docs/specs/47-merge-recursive.md
 *
 * - findMergeBases : niveau fonction (DAG construit à la main, ne walke que les parents).
 * - Base synthétique : boîte noire via le merge command (un cas qui conflituerait avec
 *   une base simple réussit avec la base récursive).
 * - delete/modify : boîte noire (git rm fournit la suppression — spec 43).
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';
import { createEmptyRepo, findMergeBases } from '@/core/repository';
import type { Commit, Repository } from '@/core/model';

// ---------------------------------------------------------------------------
// findMergeBases — niveau fonction
// ---------------------------------------------------------------------------

function commit(parents: string[]): Commit {
  return { type: 'commit', tree: 't', parents, author: 'a', date: 0, message: 'm' };
}

/** Insère un commit factice (parents only) et renvoie le repo. */
function dag(edges: Record<string, string[]>): Repository {
  const repo = createEmptyRepo();
  for (const [hash, parents] of Object.entries(edges)) {
    repo.objects[hash] = commit(parents);
  }
  return repo;
}

describe('findMergeBases (spec 47)', () => {
  it('historique linéaire → une seule base', () => {
    // c0 ← c1 ← c2 (main) ; c1 ← d1 (feature)
    const repo = dag({
      c0: [],
      c1: ['c0'],
      c2: ['c1'],
      d1: ['c1'],
    });
    expect(findMergeBases(repo, 'c2', 'd1')).toEqual(['c1']);
  });

  it('criss-cross → deux bases maximales', () => {
    // C0 ← A1, C0 ← B1 ; Ma = merge(A1,B1), Mb = merge(B1,A1)
    const repo = dag({
      C0: [],
      A1: ['C0'],
      B1: ['C0'],
      Ma: ['A1', 'B1'],
      Mb: ['B1', 'A1'],
    });
    const bases = findMergeBases(repo, 'Ma', 'Mb');
    expect(bases.sort()).toEqual(['A1', 'B1']);
    // C0 est dominé (ancêtre de A1 et B1) → exclu
    expect(bases).not.toContain('C0');
  });

  it('pas d ancêtre commun → tableau vide', () => {
    const repo = dag({ x0: [], y0: [] });
    expect(findMergeBases(repo, 'x0', 'y0')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Base synthétique récursive — bénéfice observable
// ---------------------------------------------------------------------------

describe('Merge récursif — base synthétique (spec 47)', () => {
  it('CA-merge-recursive-01 : LCA simple → merge 3-way normal réussit', () => {
    const engine = replay([
      'git init',
      'write base.txt "0"',
      'git add base.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write a.txt "a"',
      'git add a.txt',
      'git commit -m "C1 main"',
      'git checkout feature',
      'write b.txt "b"',
      'git add b.txt',
      'git commit -m "C2 feature"',
      'git checkout main',
    ]);
    const result = engine.execute('git merge feature');
    expect(result.exitCode).toBe(0);
    // commit de fusion à 2 parents
    expect(engine.snapshot().commits[0]!.parents.length).toBe(2);
  });

  it('criss-cross : un merge qui conflituerait sur base simple réussit avec la base récursive', () => {
    // Construit un criss-cross (bases {A1,B1}) puis fait diverger shared.txt.
    // Avec la base simple C0 (shared="0") le merge final conflituerait ;
    // avec la base synthétique (shared="1") il se résout proprement.
    const engine = replay([
      'git init',
      'write shared.txt "0"',
      'git add shared.txt',
      'git commit -m "C0"',
      'git branch feature',
      // main : A1 modifie shared → "1"
      'write shared.txt "1"',
      'git add shared.txt',
      'git commit -m "A1"',
    ]);
    const a1 = engine.snapshot().commits[0]!.hash;

    engine.execute('git checkout feature');
    engine.execute('write fb.txt "x"');
    engine.execute('git add fb.txt');
    engine.execute('git commit -m "B1"'); // feature @ B1 (shared encore "0")

    // M_a = merge B1 dans A1 (sur main) ; M_b = merge A1 dans B1 (sur feature)
    engine.execute('git checkout main');
    let r = engine.execute('git merge feature --no-ff -m "M_a"');
    expect(r.exitCode).toBe(0); // base C0=="0"==B1 → prend A1 "1", pas de conflit

    engine.execute('git checkout feature');
    r = engine.execute(`git merge ${a1} --no-ff -m "M_b"`);
    expect(r.exitCode).toBe(0);

    // feature diverge : shared → "2"
    engine.execute('write shared.txt "2"');
    engine.execute('git add shared.txt');
    engine.execute('git commit -m "M_b2"');

    // merge final : criss-cross (bases A1/B1). Base synthétique shared="1" == M_a
    // → prend la version feature "2" sans conflit.
    engine.execute('git checkout main');
    const result = engine.execute('git merge feature');
    expect(result.exitCode).toBe(0);
    expect(engine.execute('read shared.txt').output.join('\n')).toBe('2');
  });
});

// ---------------------------------------------------------------------------
// Conflits delete/modify
// ---------------------------------------------------------------------------

describe('Conflits delete/modify (spec 47)', () => {
  it('CA-merge-delete-modify-01 : modifié chez nous, supprimé chez eux → conflit', () => {
    const engine = replay([
      'git init',
      'write file.txt "original"',
      'git add file.txt',
      'git commit -m "C0"',
      'git branch feature',
      // main : modifie
      'write file.txt "modified"',
      'git add file.txt',
      'git commit -m "C1 main modifie"',
      // feature : supprime
      'git checkout feature',
      'git rm file.txt',
      'git commit -m "C2 feature supprime"',
      'git checkout main',
    ]);

    const result = engine.execute('git merge feature');

    expect(result.exitCode).toBe(1);
    expect(result.output.join('\n')).toContain('CONFLICT (delete/modify): file.txt');
    // merge en cours
    expect(engine.snapshot().operationState?.type).toBe('merging');
  });

  it('CA-merge-delete-modify-02 : les deux suppriment → pas de conflit', () => {
    const engine = replay([
      'git init',
      'write file.txt "original"',
      'write keep.txt "k"',
      'git add file.txt keep.txt',
      'git commit -m "C0"',
      'git branch feature',
      'git rm file.txt',
      'git commit -m "C1 main supprime"',
      'git checkout feature',
      'git rm file.txt',
      'write other.txt "o"',
      'git add other.txt',
      'git commit -m "C2 feature supprime aussi"',
      'git checkout main',
    ]);

    const result = engine.execute('git merge feature');

    expect(result.exitCode).toBe(0);
    expect(engine.snapshot().files.find((f) => f.path === 'file.txt')).toBeUndefined();
  });

  it('CA-merge-delete-modify-03 : les deux modifient identiquement → pas de conflit', () => {
    const engine = replay([
      'git init',
      'write file.txt "original"',
      'git add file.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write file.txt "modified v1"',
      'git add file.txt',
      'git commit -m "C1 main"',
      'git checkout feature',
      'write file.txt "modified v1"',
      'git add file.txt',
      'git commit -m "C2 feature identique"',
      'git checkout main',
    ]);

    const result = engine.execute('git merge feature');

    expect(result.exitCode).toBe(0);
    expect(engine.execute('read file.txt').output.join('\n')).toBe('modified v1');
  });

  it('CA-merge-delete-modify-04 : les deux modifient différemment → conflit de contenu', () => {
    const engine = replay([
      'git init',
      'write file.txt "original"',
      'git add file.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write file.txt "modified a"',
      'git add file.txt',
      'git commit -m "C1 main"',
      'git checkout feature',
      'write file.txt "modified b"',
      'git add file.txt',
      'git commit -m "C2 feature"',
      'git checkout main',
    ]);

    const result = engine.execute('git merge feature');

    expect(result.exitCode).toBe(1);
    // format git réel : « Merge conflict in <path> » (≠ delete/modify)
    expect(result.output.join('\n')).toContain('CONFLICT (content): Merge conflict in file.txt');
    // marqueurs dans le WT (pas un delete/modify)
    expect(engine.execute('read file.txt').output.join('\n')).toContain('<<<<<<<');
  });
});
