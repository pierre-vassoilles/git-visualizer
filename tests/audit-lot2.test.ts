/**
 * Tests de conformité — Lot 2 de l'audit git (sémantique two-tree de
 * checkout/switch). Boîte noire via execute() + status -s + snapshot().
 *
 * IDs : NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-11, NAV-13, NAV-15.
 * (NAV-07 — carry d'une suppression non stagée — non testable en boîte noire :
 *  pas de primitive de suppression WT-only ; couvert par le même classifieur.)
 */

import { describe, it, expect } from 'vitest';
import { replay, newEngine } from './helpers';

/** Code court (XY) d'un chemin dans `git status -s`, ou null. */
function statusOf(engine: ReturnType<typeof newEngine>, path: string): string | null {
  const out = engine.execute('git status -s').output;
  const line = out.find((l) => l.slice(3) === path);
  return line ? line.slice(0, 2) : null;
}

describe('NAV-01 : la bascule conserve les changements indexés', () => {
  it('fichier identique dans les deux branches → modif stagée portée', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch feature',
      'write x.txt "x"',
      'git add x.txt',
      'git commit -m "c2 (main, a inchangé)"',
      'git checkout feature',
      'write a.txt "staged-change"',
      'git add a.txt', // a.txt stagé (diffère de HEAD), mais identique entre branches
    ]);
    const r = engine.execute('git checkout main');
    expect(r.exitCode).toBe(0);
    // La modif stagée de a.txt est portée (toujours indexée).
    expect(statusOf(engine, 'a.txt')).toBe('M ');
    expect(engine.execute('read a.txt').output[0]).toBe('staged-change');
  });

  it('fichier qui diffère entre branches + modif stagée → refus', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch feature',
      'write a.txt "main"',
      'git add a.txt',
      'git commit -m "c2"',
      'git checkout feature',
      'write a.txt "staged"',
      'git add a.txt',
    ]);
    const r = engine.execute('git checkout main');
    expect(r.exitCode).toBe(1);
    expect(r.errors.join(' ')).toContain('would be overwritten by checkout');
    // Rien n'a basculé : toujours sur feature.
    const head = engine.snapshot().head;
    expect(head.type === 'branch' && head.name).toBe('feature');
  });
});

describe('NAV-02 : modif non stagée d’un fichier identique entre branches → bascule OK', () => {
  it('ne bloque pas, la modif est portée', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch feature',
      'write x.txt "x"',
      'git add x.txt',
      'git commit -m "c2"',
      'git checkout feature',
      'write a.txt "unstaged"', // modif non stagée ; a identique entre branches
    ]);
    const r = engine.execute('git checkout main');
    expect(r.exitCode).toBe(0);
    expect(statusOf(engine, 'a.txt')).toBe(' M');
    expect(engine.execute('read a.txt').output[0]).toBe('unstaged');
  });
});

describe('NAV-03 : fichier non suivi en collision avec la cible → refus', () => {
  it('refuse au lieu d’écraser silencieusement', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch feature',
      'write secret.txt "main-version"',
      'git add secret.txt',
      'git commit -m "c2 (main a secret)"',
      'git checkout feature', // feature n'a pas secret.txt
      'write secret.txt "my-untracked"', // untracked qui entrerait en collision
    ]);
    const r = engine.execute('git checkout main');
    expect(r.exitCode).toBe(1);
    expect(r.errors.join(' ')).toContain('untracked working tree files would be overwritten');
    expect(engine.execute('read secret.txt').output[0]).toBe('my-untracked');
  });
});

describe('NAV-04 : git checkout <ref> -- <path> restaure dans index ET WT', () => {
  it('restaure a.txt depuis HEAD~1 (modif stagée)', () => {
    const engine = replay([
      'git init',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "c1"',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "c2"',
    ]);
    const r = engine.execute('git checkout HEAD~1 -- a.txt');
    expect(r.exitCode).toBe(0);
    // a.txt vaut v1 (version de c1), indexé (M ) car ≠ HEAD (c2).
    expect(engine.execute('read a.txt').output[0]).toBe('v1');
    expect(statusOf(engine, 'a.txt')).toBe('M ');
  });
});

describe('NAV-13 : git checkout <branch> <path> restaure sans basculer', () => {
  it('reste sur main, restaure a.txt depuis other', () => {
    const engine = replay([
      'git init',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch other',
      'write a.txt "v2"',
      'git add a.txt',
      'git commit -m "c2 (main)"',
    ]);
    const r = engine.execute('git checkout other a.txt');
    expect(r.exitCode).toBe(0);
    const head = engine.snapshot().head;
    expect(head.type === 'branch' && head.name).toBe('main'); // pas de bascule
    expect(engine.execute('read a.txt').output[0]).toBe('v1'); // version d'other
  });
});

describe('NAV-05 : checkout -b <name> <start-point>', () => {
  it('crée la branche au start-point et aligne l’arbre', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'write a.txt "2"',
      'git add a.txt',
      'git commit -m "c2"',
    ]);
    const r = engine.execute('git checkout -b feat HEAD~1');
    expect(r.exitCode).toBe(0);
    const head = engine.snapshot().head;
    expect(head.type === 'branch' && head.name).toBe('feat');
    expect(engine.execute('read a.txt').output[0]).toBe('1'); // arbre de c1
  });
});

describe('NAV-11 : --detach sans argument détache sur HEAD', () => {
  it('checkout --detach → HEAD détaché sur le commit courant', () => {
    const engine = replay(['git init', 'write a.txt "1"', 'git add a.txt', 'git commit -m "c1"']);
    const r = engine.execute('git checkout --detach');
    expect(r.exitCode).toBe(0);
    expect(engine.snapshot().head.type).toBe('detached');
  });
});

describe('NAV-15 : checkout -b / switch -c écrivent une entrée reflog', () => {
  it('checkout -b apparaît dans le reflog de HEAD', () => {
    const engine = replay(['git init', 'write a.txt "1"', 'git add a.txt', 'git commit -m "c1"']);
    engine.execute('git checkout -b feat');
    const reflog = engine.execute('git reflog').output;
    expect(reflog.some((l) => l.includes('HEAD@{0}') && l.includes('feat'))).toBe(true);
  });

  it('switch -c apparaît dans le reflog de HEAD', () => {
    const engine = replay(['git init', 'write a.txt "1"', 'git add a.txt', 'git commit -m "c1"']);
    engine.execute('git switch -c feat2');
    const reflog = engine.execute('git reflog').output;
    expect(reflog.some((l) => l.includes('HEAD@{0}') && l.includes('feat2'))).toBe(true);
  });
});
