/**
 * Tests Phase 6 : Persistance localStorage
 * Spec : docs/specs/31-persistence.md
 *
 * Principe : tests dérivés des spécifications (CA numérotés), pas de l'implémentation.
 * jsdom fournit localStorage dans l'environnement Vitest.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadHistory, saveHistory, clearHistory } from '@/utils/storage';

// ---------------------------------------------------------------------------
// Setup : nettoyer localStorage entre les tests
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'git-visualizer:history';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// CA-persist-02 : Format versionné
// ---------------------------------------------------------------------------

describe('storage — CA-persist-02 : format versionné', () => {
  it('CA-persist-02 : saveHistory écrit version "1.0"', () => {
    saveHistory(['git init', 'git add file.txt', 'git commit -m "test"']);
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe('1.0');
  });

  it('CA-persist-02 : saveHistory écrit un champ commands tableau', () => {
    const cmds = ['git init', 'git commit -m "x"'];
    saveHistory(cmds);
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw!);
    expect(Array.isArray(parsed.commands)).toBe(true);
    expect(parsed.commands).toEqual(cmds);
  });

  it('CA-persist-02 : saveHistory écrit lastSaved (timestamp)', () => {
    const before = Date.now();
    saveHistory(['git init']);
    const after = Date.now();
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(parsed.lastSaved).toBeGreaterThanOrEqual(before);
    expect(parsed.lastSaved).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// CA-persist-03 : Corruption détectée → null + purge
// ---------------------------------------------------------------------------

describe('storage — CA-persist-03 : JSON corrompu', () => {
  it('CA-persist-03 : JSON invalide → loadHistory retourne null', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
    const result = loadHistory();
    expect(result).toBeNull();
  });

  it('CA-persist-03 : JSON invalide → clé purgée de localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
    loadHistory();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("CA-persist-03 : clé absente → loadHistory retourne null (pas d'erreur)", () => {
    // localStorage est vierge
    const result = loadHistory();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CA-persist-04 : Version incompatible → null + purge
// ---------------------------------------------------------------------------

describe('storage — CA-persist-04 : version incompatible', () => {
  it('CA-persist-04 : version "99.0" → loadHistory retourne null', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: '99.0',
        commands: ['git init'],
        lastSaved: Date.now(),
      }),
    );
    const result = loadHistory();
    expect(result).toBeNull();
  });

  it('CA-persist-04 : version "99.0" → clé purgée de localStorage', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: '99.0',
        commands: ['git init'],
        lastSaved: Date.now(),
      }),
    );
    loadHistory();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('CA-persist-04 : version "2.0" → loadHistory retourne null (major incompatible)', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: '2.0',
        commands: ['git init'],
        lastSaved: Date.now(),
      }),
    );
    const result = loadHistory();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CA-persist-10 : Champ checksum optionnel
// ---------------------------------------------------------------------------

describe('storage — CA-persist-10 : format JSON valide avec/sans checksum', () => {
  it('CA-persist-10 : loadHistory charge normalement sans checksum', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: '1.0',
        commands: ['git init', 'git commit -m "x"'],
        lastSaved: Date.now(),
      }),
    );
    const result = loadHistory();
    expect(result).toEqual(['git init', 'git commit -m "x"']);
  });

  it("CA-persist-10 : présence d'un checksum ne bloque pas le parsing", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: '1.0',
        commands: ['git init'],
        lastSaved: Date.now(),
        checksum: 'abc123',
      }),
    );
    const result = loadHistory();
    expect(result).toEqual(['git init']);
  });
});

// ---------------------------------------------------------------------------
// CA-persist-11 : Clé localStorage bien nommée
// ---------------------------------------------------------------------------

describe('storage — CA-persist-11 : clé localStorage correcte', () => {
  it('CA-persist-11 : saveHistory écrit sous la clé "git-visualizer:history"', () => {
    saveHistory(['git init']);
    const raw = localStorage.getItem('git-visualizer:history');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe('1.0');
  });

  it('CA-persist-11 : clearHistory supprime la clé "git-visualizer:history"', () => {
    saveHistory(['git init']);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    clearHistory();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cycle complet : save → load
// ---------------------------------------------------------------------------

describe('storage — cycle save/load', () => {
  it('loadHistory après saveHistory retourne les mêmes commandes', () => {
    const cmds = ['git init', 'write f.txt "x"', 'git add f.txt', 'git commit -m "c1"'];
    saveHistory(cmds);
    const loaded = loadHistory();
    expect(loaded).toEqual(cmds);
  });

  it('loadHistory après clearHistory retourne null', () => {
    saveHistory(['git init']);
    clearHistory();
    const loaded = loadHistory();
    expect(loaded).toBeNull();
  });

  it('saveHistory avec liste vide → loadHistory retourne []', () => {
    saveHistory([]);
    const loaded = loadHistory();
    expect(loaded).toEqual([]);
  });

  it('format sans champ commands → loadHistory retourne null + purge', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: '1.0',
        lastSaved: Date.now(),
        // pas de commands
      }),
    );
    const result = loadHistory();
    expect(result).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
