/**
 * Support des `/` dans les noms de branches (style git-flow `feature/login`),
 * avec validation structurelle façon `git check-ref-format`.
 */
import { describe, it, expect } from 'vitest';
import { replay } from './helpers';
import { isValidBranchName } from '@/core/repository';

describe('noms de branches avec /', () => {
  it('git branch feature/login crée la branche', () => {
    const engine = replay(['git init', 'write a.txt "x"', 'git add a.txt', 'git commit -m C1']);
    const r = engine.execute('git branch feature/login');
    expect(r.exitCode).toBe(0);
    expect(Object.keys(engine.snapshot().branches)).toContain('feature/login');
  });

  it('git checkout -b release/1.0 crée et bascule', () => {
    const engine = replay(['git init', 'write a.txt "x"', 'git add a.txt', 'git commit -m C1']);
    const r = engine.execute('git checkout -b release/1.0');
    expect(r.exitCode).toBe(0);
    const head = engine.snapshot().head;
    expect(head.type === 'branch' && head.name).toBe('release/1.0');
  });

  it('git switch -c feat/api crée et bascule', () => {
    const engine = replay(['git init', 'write a.txt "x"', 'git add a.txt', 'git commit -m C1']);
    const r = engine.execute('git switch -c feat/api');
    expect(r.exitCode).toBe(0);
    expect(Object.keys(engine.snapshot().branches)).toContain('feat/api');
  });

  it('révision <branche-avec-slash>~1 se résout correctement', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m C1',
      'git checkout -b feature/x',
      'write a.txt "2"',
      'git add a.txt',
      'git commit -m C2',
    ]);
    // feature/x~1 = parent du tip = C1
    const r = engine.execute('git checkout feature/x~1');
    expect(r.exitCode).toBe(0);
    expect(engine.snapshot().head.type).toBe('detached');
  });

  it('fusion d\'une branche avec slash fonctionne', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m C1',
      'git checkout -b feature/login',
      'write login.js "login"',
      'git add login.js',
      'git commit -m C2',
      'git checkout main',
      'git merge feature/login',
    ]);
    const snap = engine.snapshot();
    expect(snap.operationState).toBeFalsy();
    // main a avancé en fast-forward jusqu'au commit de feature/login
    expect(snap.branches['main']).toBe(snap.branches['feature/login']);
  });
});

describe('isValidBranchName — règles structurelles', () => {
  it('accepte les noms valides (avec ou sans slash)', () => {
    for (const n of ['main', 'feature', 'feature/login', 'a/b/c', 'release-1.0', 'feat_x']) {
      expect(isValidBranchName(n), n).toBe(true);
    }
  });

  it('rejette les noms structurellement invalides', () => {
    for (const n of [
      '',
      ' ',
      '-bad',
      '/leading',
      'trailing/',
      'a//b',
      'a..b',
      'ends.',
      'a/.hidden',
      'a.lock',
      'feature/x.lock',
      'has space',
      'has~tilde',
      'has^caret',
      'has:colon',
      'has?q',
      'star*',
      'br@{0}',
      '@',
      'HEAD',
    ]) {
      expect(isValidBranchName(n), n).toBe(false);
    }
  });
});

describe('création de branche invalide → erreur', () => {
  it('git branch a..b est rejeté', () => {
    const engine = replay(['git init', 'write a.txt "x"', 'git add a.txt', 'git commit -m C1']);
    const r = engine.execute('git branch a..b');
    expect(r.exitCode).not.toBe(0);
    expect(r.errors.join(' ')).toMatch(/invalid branch name/i);
  });

  it('git checkout -b trailing/ est rejeté', () => {
    const engine = replay(['git init', 'write a.txt "x"', 'git add a.txt', 'git commit -m C1']);
    const r = engine.execute('git checkout -b trailing/');
    expect(r.exitCode).not.toBe(0);
    expect(r.errors.join(' ')).toMatch(/not a valid branch name/i);
  });
});
