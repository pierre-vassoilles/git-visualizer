/**
 * Tests du dispatch général du GitEngine (Phase 1).
 *
 * Remplace l'ancien stub Phase 0.
 */

import { describe, expect, it } from 'vitest';
import { newEngine, replay } from './helpers';

describe('GitEngine — dispatch général', () => {
  it('renvoie un succès sur entrée vide', () => {
    const engine = newEngine();
    const result = engine.execute('   ');
    expect(result.exitCode).toBe(0);
    expect(result.output).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('renvoie un succès sur chaîne vide', () => {
    const engine = newEngine();
    const result = engine.execute('');
    expect(result.exitCode).toBe(0);
    expect(result.output).toEqual([]);
  });

  it('commande non-git → code 127 avec message "command not found"', () => {
    const engine = newEngine();
    const result = engine.execute('ls -la');
    expect(result.exitCode).toBe(127);
    expect(result.errors[0]).toContain('command not found');
  });

  it('commande non-git quelconque → code 127', () => {
    const engine = newEngine();
    const result = engine.execute('unknowncmd arg1');
    expect(result.exitCode).toBe(127);
  });

  it("git sans sous-commande → code 0 et message d'usage", () => {
    const engine = newEngine();
    const result = engine.execute('git');
    expect(result.exitCode).toBe(0);
    expect(result.output.join(' ')).toMatch(/usage/i);
  });

  it("sous-commande git inconnue → message d'erreur git", () => {
    const engine = newEngine();
    engine.execute('git init');
    const result = engine.execute('git unknownsub');
    expect(result.exitCode).not.toBe(0);
    expect(result.errors[0]).toMatch(/not a git command/i);
  });

  it('snapshot initial : dépôt non initialisé', () => {
    const engine = newEngine();
    const snap = engine.snapshot();
    expect(snap.initialized).toBe(false);
    expect(snap.commits).toHaveLength(0);
    expect(snap.indexPaths).toHaveLength(0);
  });

  it('commande avant git init → code 128 pour git add', () => {
    const engine = newEngine();
    const result = engine.execute('git add file.txt');
    expect(result.exitCode).toBe(128);
    expect(result.errors[0]).toContain('not a git repository');
  });

  it('commande avant git init → code 128 pour git status', () => {
    const engine = newEngine();
    const result = engine.execute('git status');
    expect(result.exitCode).toBe(128);
  });

  it('commande avant git init → code 128 pour git commit', () => {
    const engine = newEngine();
    const result = engine.execute('git commit -m "msg"');
    expect(result.exitCode).toBe(128);
  });

  it('commande avant git init → code 128 pour git log', () => {
    const engine = newEngine();
    const result = engine.execute('git log');
    expect(result.exitCode).toBe(128);
  });

  it('deux engines ayant rejoué la même séquence produisent le même snapshot (déterminisme)', () => {
    const commands = [
      'git init',
      'write file.txt "hello"',
      'git add file.txt',
      'git commit -m "Initial"',
    ];
    const engine1 = replay(commands);
    const engine2 = replay(commands);
    const snap1 = engine1.snapshot();
    const snap2 = engine2.snapshot();
    expect(snap1.commits[0]?.hash).toBe(snap2.commits[0]?.hash);
  });
});
