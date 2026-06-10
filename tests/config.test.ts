/**
 * Tests de `git config` (spec 45). CA-config-01 à 13.
 */
import { describe, expect, it } from 'vitest';
import { newEngine, replay } from './helpers';

describe('git config (spec 45)', () => {
  it('CA-config-01 : lire user.name par défaut', () => {
    const r = newEngine().execute('git config user.name');
    expect(r.exitCode).toBe(0);
    expect(r.output.join('')).toBe('Author');
  });

  it('CA-config-02 : lire user.email par défaut', () => {
    const r = newEngine().execute('git config user.email');
    expect(r.exitCode).toBe(0);
    expect(r.output.join('')).toBe('author@example.com');
  });

  it('CA-config-03 : écrire puis relire', () => {
    const engine = newEngine();
    const w = engine.execute('git config user.name "Alice"');
    expect(w.exitCode).toBe(0);
    expect(w.output).toHaveLength(0);
    const r = engine.execute('git config user.name');
    expect(r.exitCode).toBe(0);
    expect(r.output.join('')).toBe('Alice');
  });

  it('CA-config-04 : changer l’auteur change le hash', () => {
    const engine = replay([
      'git init',
      'write test.txt "data"',
      'git add test.txt',
      'git commit -m "c1"',
      'git config user.name "Alice"',
      'write test2.txt "data2"',
      'git add test2.txt',
      'git commit -m "c2"',
    ]);
    const commits = engine.snapshot().commits; // récent → ancien
    expect(commits).toHaveLength(2);
    const [c2, c1] = commits;
    expect(c1!.author).toBe('Author <author@example.com>');
    expect(c2!.author).toBe('Alice <author@example.com>');
    expect(c1!.hash).not.toBe(c2!.hash);
  });

  it('CA-config-05 : --list affiche les clés triées', () => {
    const engine = replay([
      'git config user.name "Alice"',
      'git config user.email "alice@example.com"',
    ]);
    const r = engine.execute('git config --list');
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain('user.email=alice@example.com');
    expect(r.output).toContain('user.name=Alice');
  });

  it('CA-config-06 : clé inconnue en lecture → exit 1 silencieux', () => {
    const r = newEngine().execute('git config unknown.key');
    expect(r.exitCode).toBe(1);
    expect(r.output).toHaveLength(0);
    expect(r.errors).toHaveLength(0);
  });

  it('CA-config-07 : clé non reconnue acceptée à l’écriture', () => {
    const engine = newEngine();
    const w = engine.execute('git config custom.setting "value"');
    expect(w.exitCode).toBe(0);
    expect(engine.execute('git config --list').output).toContain('custom.setting=value');
  });

  it('CA-config-08 : aucun argument → exit 128', () => {
    const r = newEngine().execute('git config');
    expect(r.exitCode).toBe(128);
    expect(r.errors[0]).toMatch(/missing key|usage/);
  });

  it('CA-config-09 : email change le hash et l’auteur', () => {
    const engine = replay([
      'git init',
      'write f.txt "x"',
      'git add f.txt',
      'git commit -m "c1"',
      'git config user.email "new@example.com"',
      'write g.txt "y"',
      'git add g.txt',
      'git commit -m "c2"',
    ]);
    const commits = engine.snapshot().commits;
    const [c2, c1] = commits;
    expect(c1!.hash).not.toBe(c2!.hash);
    expect(c2!.author).toBe('Author <new@example.com>');
  });

  it('CA-config-10 : git init réinitialise la config', () => {
    const engine = newEngine();
    engine.execute('git config user.name "Bob"');
    engine.execute('git init');
    const r = engine.execute('git config user.name');
    expect(r.exitCode).toBe(0);
    expect(r.output.join('')).toBe('Author');
  });

  it('CA-config-11 : déterminisme du hash après rejeu', () => {
    const cmds = [
      'git init',
      'git config user.name "Alice"',
      'write file.txt "content"',
      'git add file.txt',
      'git commit -m "First"',
      'git config user.name "Bob"',
      'write file2.txt "content2"',
      'git add file2.txt',
      'git commit -m "Second"',
    ];
    const a = replay(cmds)
      .snapshot()
      .commits.map((c) => c.hash);
    const b = replay(cmds)
      .snapshot()
      .commits.map((c) => c.hash);
    expect(a).toEqual(b);
  });

  it('CA-config-13 : clés sensibles à la casse', () => {
    const engine = newEngine();
    engine.execute('git config user.name "Alice"');
    const r = engine.execute('git config user.NAME');
    expect(r.exitCode).toBe(1);
  });
});
