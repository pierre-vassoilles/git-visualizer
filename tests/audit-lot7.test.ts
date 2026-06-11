/**
 * Tests de conformité — Lot 7 de l'audit git (cosmétique / messages / exit codes).
 * Boîte noire via execute() + snapshot().
 *
 * IDs : BAS-09, BAS-14, BAS-16, NAV-16, NAV-19, RWR-11, TLS-12, CNT-10, CNT-13, CNT-14.
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';
import type { TodoItem } from '@/core/model';

const committed = () =>
  replay(['git init', 'write a.txt "1"', 'git add a.txt', 'git commit -m "c1"']);

describe('BAS-09 : status en HEAD détaché', () => {
  it('première ligne = « HEAD detached at … » (pas « On branch »)', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'write a.txt "2"',
      'git add a.txt',
      'git commit -m "c2"',
    ]);
    const c1 = engine.snapshot().commits.find((c) => c.message === 'c1')!.hash;
    engine.execute(`git checkout ${c1.slice(0, 7)}`);
    const out = engine.execute('git status').output;
    expect(out[0]).toMatch(/^HEAD detached at /);
    expect(out[0]).not.toContain('On branch');
  });
});

describe('BAS-16 : hint « git restore » dans status', () => {
  it('la section non-stagée mentionne git restore pour annuler', () => {
    const engine = committed();
    engine.execute('write a.txt "2"'); // modif non stagée
    const out = engine.execute('git status').output.join('\n');
    expect(out).toContain('git restore <file>...');
  });
});

describe('NAV-16 : git branch liste la ligne HEAD détaché', () => {
  it('affiche « * (HEAD detached at <short>) »', () => {
    const engine = committed();
    const c1 = engine.snapshot().commits[0]!.hash;
    engine.execute(`git checkout ${c1.slice(0, 7)}`);
    const out = engine.execute('git branch').output;
    expect(out[0]).toMatch(/^\* \(HEAD detached at [0-9a-f]{7}\)$/);
  });
});

describe('NAV-19 : noms de tag invalides rejetés', () => {
  it('git tag "a..b" → refus', () => {
    const engine = committed();
    const r = engine.execute('git tag a..b');
    expect(r.exitCode).not.toBe(0);
  });
});

describe('RWR-11 : message de revert (sujet 1re ligne + hash complet)', () => {
  it('sujet « Revert "c1" » et corps avec le hash 40 chars', () => {
    const engine = committed();
    const c1 = engine.snapshot().commits[0]!.hash;
    const r = engine.execute('git revert HEAD');
    expect(r.exitCode).toBe(0);
    const log = engine.execute('git log').output.join('\n');
    expect(log).toContain('Revert "c1"');
    expect(log).toContain(`This reverts commit ${c1}.`); // hash complet (40)
  });
});

describe('TLS-12 : action « edit » rejetée en rebase interactif', () => {
  it('executeRebaseInteractive avec edit → erreur', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch feature',
      'write m.txt "m"',
      'git add m.txt',
      'git commit -m "cm"',
      'git checkout feature',
      'write f.txt "f"',
      'git add f.txt',
      'git commit -m "cf"',
    ]);
    const cf = engine.snapshot().commits.find((c) => c.message === 'cf')!.hash;
    engine.execute('git rebase -i main');
    const todo: TodoItem[] = [{ action: 'edit', commitHash: cf, message: 'cf' }];
    const r = engine.executeRebaseInteractive(todo);
    expect(r.exitCode).not.toBe(0);
    expect(r.errors.join(' ')).toContain('unknown action');
  });
});

describe('CNT-10 : diff d’un fichier vide n’émet pas d’en-têtes ---/+++', () => {
  it('ajout d’un fichier vide → s’arrête après la ligne index', () => {
    const engine = committed();
    engine.execute('write empty.txt ""');
    engine.execute('git add empty.txt');
    const out = engine.execute('git diff --staged').output;
    const hasEmptyHeaders = out.some(
      (l) => l === '--- /dev/null' && out.includes('+++ b/empty.txt'),
    );
    expect(out.some((l) => l.includes('empty.txt'))).toBe(true);
    expect(hasEmptyHeaders).toBe(false);
  });
});

describe('CNT-13 : git config refuse une clé sans section', () => {
  it('écriture d’une clé sans point → exit 2', () => {
    const engine = committed();
    const r = engine.execute('git config foo bar');
    expect(r.exitCode).toBe(2);
    expect(r.errors.join(' ')).toContain('does not contain a section');
  });
});

describe('CNT-14 : git diff rejette les flags inconnus', () => {
  it('git diff --stat → exit 129', () => {
    const engine = committed();
    const r = engine.execute('git diff --stat');
    expect(r.exitCode).toBe(129);
    expect(r.errors.join(' ')).toContain('unknown option');
  });
});
