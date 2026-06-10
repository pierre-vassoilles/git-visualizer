/**
 * Tests : git log --graph (spec 54). Boîte noire via execute().
 */

import { describe, it, expect } from 'vitest';
import { replay, newEngine } from './helpers';

function linearRepo() {
  return replay([
    'git init',
    'write a.txt "1"',
    'git add a.txt',
    'git commit -m "First"',
    'write a.txt "2"',
    'git add a.txt',
    'git commit -m "Second"',
    'write a.txt "3"',
    'git add a.txt',
    'git commit -m "Third"',
  ]);
}

function mergeRepo() {
  return replay([
    'git init',
    'write a.txt "base"',
    'git add a.txt',
    'git commit -m "Ancestor"',
    'git checkout -b feature',
    'write b.txt "f"',
    'git add b.txt',
    'git commit -m "Feature"',
    'git checkout main',
    'write c.txt "m"',
    'git add c.txt',
    'git commit -m "Main"',
    'git merge feature -m "Merge feature"',
  ]);
}

describe('git log --graph', () => {
  it('CA-03 : historique linéaire → * alignés, pas de connecteurs', () => {
    const r = linearRepo().execute('git log --graph --oneline');
    expect(r.exitCode).toBe(0);
    // 3 commits, chacun préfixé par '*'.
    const starLines = r.output.filter((l) => l.startsWith('*'));
    expect(starLines.length).toBe(3);
    expect(r.output.join('\n')).toContain('Third');
    expect(r.output.join('\n')).toContain('First');
    // Pas de bifurcation/convergence en linéaire.
    expect(r.output.join('\n')).not.toContain('\\');
    expect(r.output.join('\n')).not.toContain('/');
  });

  it('CA-02 : --graph --oneline → format compact (shortHash + message)', () => {
    const r = linearRepo().execute('git log --graph --oneline');
    expect(r.exitCode).toBe(0);
    // La 1re ligne commence par '* ' suivi d'un hash court de 7 chars.
    expect(r.output[0]).toMatch(/^\* [0-9a-f]{7}/);
    expect(r.output[0]).toContain('Third');
  });

  it('CA-01/14 : --graph long → commit/Author/Date/message', () => {
    const r = linearRepo().execute('git log --graph');
    expect(r.exitCode).toBe(0);
    const joined = r.output.join('\n');
    expect(joined).toContain('commit ');
    expect(joined).toContain('Author:');
    expect(joined).toContain('Date:');
    expect(joined).toContain('Third');
  });

  it('CA-06 : décoration HEAD -> branche', () => {
    const r = linearRepo().execute('git log --graph --oneline');
    expect(r.output[0]).toContain('(HEAD -> main)');
  });

  it('CA-07 : décoration tag', () => {
    const e = linearRepo();
    e.execute('git tag v1');
    const r = e.execute('git log --graph --oneline');
    expect(r.output[0]).toContain('tag: v1');
  });

  it('CA-05 : merge à 2 parents → bifurcation \\ et convergence /', () => {
    const r = mergeRepo().execute('git log --graph --oneline');
    expect(r.exitCode).toBe(0);
    const joined = r.output.join('\n');
    expect(joined).toContain('Merge feature');
    // Le merge introduit une bifurcation '\' et la convergence vers l'ancêtre '/'.
    expect(joined).toContain('\\');
    expect(joined).toContain('/');
    // Au moins une ligne avec plusieurs colonnes (présence de '|').
    expect(joined).toContain('|');
  });

  it('CA-16 : caractères ASCII uniquement', () => {
    const r = mergeRepo().execute('git log --graph --oneline');
    for (const line of r.output) {
      expect(/^[\x20-\x7e]*$/.test(line.replace(/[éà'’ô]/g, 'x'))).toBe(true);
    }
  });

  it('CA-17 : pas de codes ANSI', () => {
    const r = linearRepo().execute('git log --graph');
    expect(r.output.join('').includes('\x1b')).toBe(false);
  });

  it('CA-12 : déterminisme — deux rendus identiques', () => {
    const a = mergeRepo().execute('git log --graph --oneline').output;
    const b = mergeRepo().execute('git log --graph --oneline').output;
    expect(a).toEqual(b);
  });

  it("CA-13 : git log sans --graph inchangé (pas d'ASCII art)", () => {
    const r = linearRepo().execute('git log --oneline');
    expect(r.output[0]).not.toContain('*');
    expect(r.output[0]).toMatch(/^[0-9a-f]{7} /);
  });

  it('CA-09 : dépôt non initialisé → 128', () => {
    const r = newEngine().execute('git log --graph');
    expect(r.exitCode).not.toBe(0);
    expect(r.errors[0]).toContain('not a git repository');
  });

  it('CA-08 : dépôt vierge → No commits yet', () => {
    const r = replay(['git init']).execute('git log --graph');
    expect(r.exitCode).not.toBe(0);
    expect(r.errors[0]).toContain('No commits yet');
  });
});
