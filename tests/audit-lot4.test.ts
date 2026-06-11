/**
 * Tests de conformité — Lot 4 de l'audit git (refonte stash diff-based).
 * Boîte noire via execute() + status -s + snapshot().
 *
 * IDs : TLS-01, TLS-02, TLS-03, TLS-04, TLS-05.
 */

import { describe, it, expect } from 'vitest';
import { replay, newEngine } from './helpers';

function statusOf(engine: ReturnType<typeof newEngine>, path: string): string | null {
  const out = engine.execute('git status -s').output;
  const line = out.find((l) => l.slice(3) === path);
  return line ? line.slice(0, 2) : null;
}

describe('TLS-01 : git stash ne touche pas aux fichiers non suivis', () => {
  it('untracked seul → « No local changes to save » (rien stashé)', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'write untracked.txt "u"', // non suivi uniquement
    ]);
    const r = engine.execute('git stash');
    expect(r.output.join(' ')).toContain('No local changes to save');
    expect(engine.snapshot().stashCount ?? 0).toBe(0);
    expect(engine.execute('read untracked.txt').output[0]).toBe('u'); // préservé
  });

  it('modif suivie + untracked → stashe la suivie, préserve l’untracked', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'write a.txt "2"', // modif suivie
      'write u.txt "u"', // non suivi
    ]);
    const r = engine.execute('git stash');
    expect(r.exitCode).toBe(0);
    expect(engine.execute('read a.txt').output[0]).toBe('1'); // modif suivie remisée
    expect(engine.execute('read u.txt').output[0]).toBe('u'); // untracked préservé
  });
});

describe('TLS-02 : pop n’écrase pas une modif locale sur un fichier non concerné', () => {
  it('le diff du stash n’affecte que ses fichiers (pas de faux conflit)', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'write b.txt "1"',
      'git add a.txt',
      'git add b.txt',
      'git commit -m "c1"',
      'write a.txt "stash-change"', // modif sur a → stash
      'git stash',
      'write b.txt "local-change"', // modif locale sur b (non touché par le stash)
    ]);
    const r = engine.execute('git stash pop');
    expect(r.exitCode).toBe(0);
    expect(engine.execute('read a.txt').output[0]).toBe('stash-change');
    expect(engine.execute('read b.txt').output[0]).toBe('local-change'); // préservé
  });
});

describe('TLS-03 : pop restaure les changements en NON stagé', () => {
  it('une modif stagée puis stashée revient non stagée après pop', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'write a.txt "v2"',
      'git add a.txt', // stagé
      'git stash',
    ]);
    const r = engine.execute('git stash pop');
    expect(r.exitCode).toBe(0);
    expect(statusOf(engine, 'a.txt')).toBe(' M'); // non stagé, pas « M »
  });
});

describe('TLS-04 : une suppression stashée est rejouée au pop', () => {
  it('git rm puis stash puis pop → le fichier est de nouveau supprimé', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'write keep.txt "k"',
      'git add a.txt',
      'git add keep.txt',
      'git commit -m "c1"',
      'git rm a.txt', // suppression suivie
      'git stash',
    ]);
    // Après stash, a.txt est restauré.
    expect(engine.execute('read a.txt').output[0]).toBe('1');
    const r = engine.execute('git stash pop');
    expect(r.exitCode).toBe(0);
    expect(engine.execute('read a.txt').exitCode).not.toBe(0); // de nouveau supprimé
    expect(engine.execute('read keep.txt').output[0]).toBe('k');
  });
});

describe('TLS-05 : stash sur un HEAD non-né échoue', () => {
  it('aucun commit initial → erreur exit 1', () => {
    const engine = replay(['git init', 'write a.txt "1"', 'git add a.txt']);
    const r = engine.execute('git stash');
    expect(r.exitCode).toBe(1);
    expect(r.errors.join(' ')).toContain('initial commit');
  });
});
