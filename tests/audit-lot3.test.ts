/**
 * Tests de conformité — Lot 3 de l'audit git (pédagogie de l'historique).
 * Boîte noire via execute() + snapshot().
 *
 * IDs : BAS-02, BAS-11, BAS-12, BAS-13, RWR-08, TLS-09 (+ rebase -i HEAD~n).
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';

/** Dépôt avec un merge réel (main et feature divergent sans conflit). */
function repoWithMerge() {
  return replay([
    'git init',
    'write a.txt "1"',
    'git add a.txt',
    'git commit -m "c1"',
    'git branch feature',
    'write a.txt "2"',
    'git add a.txt',
    'git commit -m "c2-main"',
    'git checkout feature',
    'write b.txt "x"',
    'git add b.txt',
    'git commit -m "c3-feature"',
    'git checkout main',
    'git merge feature',
  ]);
}

describe('BAS-02 : git log traverse tous les parents', () => {
  it('après un merge, le commit fusionné apparaît dans le log', () => {
    const engine = repoWithMerge();
    const log = engine.execute('git log --oneline').output;
    expect(log.some((l) => l.includes('c3-feature'))).toBe(true);
    expect(log.some((l) => l.includes('c2-main'))).toBe(true);
    expect(log.some((l) => l.includes('c1'))).toBe(true);
  });
});

describe('BAS-11 : décorations dans git log (plain & oneline)', () => {
  it('git log --oneline montre (HEAD -> main)', () => {
    const engine = replay(['git init', 'write a.txt "1"', 'git add a.txt', 'git commit -m "c1"']);
    const log = engine.execute('git log --oneline').output;
    expect(log[0]).toContain('(HEAD -> main)');
  });
});

describe('BAS-12 : ligne Merge dans le log long', () => {
  it('un commit de fusion affiche Merge: <p1> <p2>', () => {
    const engine = repoWithMerge();
    const log = engine.execute('git log').output;
    expect(log.some((l) => /^Merge: [0-9a-f]{7} [0-9a-f]{7}$/.test(l))).toBe(true);
  });
});

describe('BAS-13 : ordre des décorations (tags avant les autres branches)', () => {
  it('(HEAD -> main, tag: v1, dev)', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch dev',
      'git tag v1',
    ]);
    const log = engine.execute('git log --oneline').output;
    expect(log[0]).toContain('(HEAD -> main, tag: v1, dev)');
  });
});

describe('RWR-08 : rebase sur un descendant fast-forward la branche', () => {
  it('feature en retard sur main → rebase main avance feature', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch feature',
      'write a.txt "2"',
      'git add a.txt',
      'git commit -m "c2"',
      'git checkout feature', // feature au c1, en retard
    ]);
    const r = engine.execute('git rebase main');
    expect(r.exitCode).toBe(0);
    expect(r.output.join(' ')).toContain('Successfully rebased');
    expect(engine.execute('read a.txt').output[0]).toBe('2'); // arbre de main
    const head = engine.snapshot().head;
    expect(head.type === 'branch' && head.name).toBe('feature');
  });

  it('git rebase -i HEAD~2 entre bien en mode interactif (plus capté par le raccourci)', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'write a.txt "2"',
      'git add a.txt',
      'git commit -m "c2"',
      'write a.txt "3"',
      'git add a.txt',
      'git commit -m "c3"',
    ]);
    const r = engine.execute('git rebase -i HEAD~2');
    expect(r.exitCode).toBe(0);
    expect(r.output.join(' ')).toContain('Interactive rebase in progress');
  });
});

describe('TLS-09 : checkout n’écrit que le reflog de HEAD', () => {
  it('le reflog d’une branche ne contient pas d’entrées « checkout »', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch other',
      'write a.txt "2"',
      'git add a.txt',
      'git commit -m "c2"',
      'git checkout other',
      'git checkout main',
    ]);
    const branchReflog = engine.execute('git reflog main').output;
    // main n'a bougé que par des commits ; aucun « checkout: » ne doit le polluer.
    expect(branchReflog.some((l) => l.includes('checkout'))).toBe(false);
    // Le reflog de HEAD, lui, contient les checkouts.
    const headReflog = engine.execute('git reflog').output;
    expect(headReflog.some((l) => l.includes('checkout'))).toBe(true);
  });
});
