/**
 * Tests de `git init` — Phase 1.
 * Couvre : CA-init-01, CA-init-02, CA-init-03.
 */

import { describe, expect, it } from 'vitest';
import { newEngine, replay } from './helpers';

describe('git init', () => {
  // -------------------------------------------------------------------------
  // CA-init-01 : Init sur dépôt vierge
  // -------------------------------------------------------------------------
  describe('CA-init-01 : init sur dépôt vierge', () => {
    it('CA-init-01 : exitCode === 0', () => {
      const engine = newEngine();
      const result = engine.execute('git init');
      expect(result.exitCode).toBe(0);
    });

    it('CA-init-01 : output[0] contient "Initialized empty Git repository"', () => {
      const engine = newEngine();
      const result = engine.execute('git init');
      expect(result.output[0]).toContain('Initialized empty Git repository');
    });

    it('CA-init-01 : snapshot HEAD est symbolique vers refs/heads/main', () => {
      const engine = newEngine();
      engine.execute('git init');
      const snap = engine.snapshot();
      expect(snap.head.type).toBe('branch');
      if (snap.head.type === 'branch') {
        expect(snap.head.name).toBe('main');
      }
    });

    it('CA-init-01 : branche main existe dans les refs', () => {
      const engine = newEngine();
      engine.execute('git init');
      const snap = engine.snapshot();
      expect('main' in snap.branches).toBe(true);
    });

    it('CA-init-01 : index vide après init', () => {
      const engine = newEngine();
      engine.execute('git init');
      const snap = engine.snapshot();
      expect(snap.indexPaths).toHaveLength(0);
    });

    it('CA-init-01 : aucun commit après init', () => {
      const engine = newEngine();
      engine.execute('git init');
      const snap = engine.snapshot();
      expect(snap.commits).toHaveLength(0);
    });

    it('CA-init-01 : snapshot.initialized === true', () => {
      const engine = newEngine();
      engine.execute('git init');
      const snap = engine.snapshot();
      expect(snap.initialized).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // CA-init-02 : Init sur dépôt déjà initialisé
  // -------------------------------------------------------------------------
  describe('CA-init-02 : reinit sur dépôt existant', () => {
    it('CA-init-02 : exitCode === 0 (réinitialisation)', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git init');
      expect(result.exitCode).toBe(0);
    });

    it('CA-init-02 : output[0] contient "Reinitialized existing Git repository" (stdout, succès)', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git init');
      expect(result.output[0]).toContain('Reinitialized existing Git repository');
      expect(result.errors).toEqual([]);
    });

    it("CA-init-02 : l'état du dépôt reste inchangé (branche main conservée)", () => {
      const engine = replay([
        'git init',
        'write file.txt "hello"',
        'git add file.txt',
        'git commit -m "First"',
      ]);
      const snapBefore = engine.snapshot();
      engine.execute('git init');
      const snapAfter = engine.snapshot();
      // Le commit doit être le même
      expect(snapAfter.commits[0]?.hash).toBe(snapBefore.commits[0]?.hash);
    });
  });

  // -------------------------------------------------------------------------
  // CA-init-03 : git status après init affiche la branche main, aucun fichier
  // -------------------------------------------------------------------------
  describe('CA-init-03 : git status après init', () => {
    it('CA-init-03 : git status affiche "On branch main"', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git status');
      expect(result.output.join('\n')).toContain('On branch main');
    });

    it("CA-init-03 : git status n'affiche aucun fichier", () => {
      const engine = replay(['git init']);
      const result = engine.execute('git status');
      // Aucune section "Untracked files:" car working tree vide
      expect(result.output.join('\n')).not.toContain('Untracked files:');
    });
  });

  // -------------------------------------------------------------------------
  // Cas limites supplémentaires
  // -------------------------------------------------------------------------
  it('CAS LIMITE : commande git add avant init → code 128', () => {
    const engine = newEngine();
    const result = engine.execute('git add file.txt');
    expect(result.exitCode).toBe(128);
    expect(result.errors[0]).toContain('not a git repository');
  });

  it('CAS LIMITE : commande git status avant init → code 128', () => {
    const engine = newEngine();
    const result = engine.execute('git status');
    expect(result.exitCode).toBe(128);
  });

  it('CAS LIMITE : commande git log avant init → code 128', () => {
    const engine = newEngine();
    const result = engine.execute('git log');
    expect(result.exitCode).toBe(128);
  });
});
