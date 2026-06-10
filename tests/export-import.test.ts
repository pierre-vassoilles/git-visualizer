/**
 * Tests Phase B3 : export / import de session
 * Spec : docs/specs/58-export-import-session.md
 *
 * - Module pur (export-import.ts) : build / serialize / validate / parse.
 * - Store (repo.ts) : import = reset + rejeu déterministe + persistance localStorage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useRepoStore } from '@/stores/repo';
import {
  buildExportedSession,
  serializeExportedSession,
  exportFilename,
  validateExportedSession,
  parseExportedSession,
} from '@/utils/export-import';

// ---------------------------------------------------------------------------
// Module pur
// ---------------------------------------------------------------------------

describe('export-import (module pur, spec 58)', () => {
  it('CA-export-import-01 : build crée une session valide versionnée', () => {
    const s = buildExportedSession(
      ['git init', 'git add f1.txt', 'git commit -m "test"'],
      1718017200000,
    );
    expect(s.version).toBe('1.0');
    expect(s.commands.length).toBe(3);
    expect(s.metadata.commandCount).toBe(3);
    expect(s.metadata.exportDate).toBe(1718017200000);
  });

  it('exportFilename : git-visualizer-<timestamp>.json', () => {
    expect(exportFilename(1718017200000)).toBe('git-visualizer-1718017200000.json');
  });

  it('CA-export-import-02 : encode une commande complexe sans corruption', () => {
    const cmd = 'git commit -m "Message avec espaces et \\"quotes\\""';
    const s = buildExportedSession([cmd], 1);
    const json = serializeExportedSession(s);
    const back = parseExportedSession(json);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.session.commands[0]).toBe(cmd);
  });

  it('CA-export-import-09 : description optionnelle incluse', () => {
    const s = buildExportedSession(['git init'], 1, 'Mon rebase interactif');
    expect(s.metadata.description).toBe('Mon rebase interactif');
  });

  it('description vide → champ absent', () => {
    const s = buildExportedSession(['git init'], 1, '   ');
    expect(s.metadata.description).toBeUndefined();
  });

  it('CA-export-import-10 : export déterministe (hors exportDate)', () => {
    const cmds = ['git init', 'git add a', 'git commit -m "x"'];
    const a = buildExportedSession(cmds, 1000);
    const b = buildExportedSession(cmds, 2000);
    expect({ ...a, metadata: { ...a.metadata, exportDate: 0 } }).toEqual({
      ...b,
      metadata: { ...b.metadata, exportDate: 0 },
    });
  });

  it('CA-export-import-03 : JSON corrompu → message dédié', () => {
    const r = parseExportedSession('{ "version": "1.0", commands: ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Le fichier est corrompu (JSON invalide).');
  });

  it('CA-export-import-04 : version incompatible', () => {
    const r = validateExportedSession({
      version: '99.0',
      metadata: { exportDate: 1, exportUrl: 'x', commandCount: 0 },
      commands: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Version du fichier incompatible (99.0 non supportée)');
  });

  it('CA-export-import-05 : schéma invalide (champ commands manquant)', () => {
    const r = validateExportedSession({
      version: '1.0',
      metadata: { exportDate: 1, exportUrl: 'x', commandCount: 0 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("n'a pas le bon format");
  });

  it('CA-export-import-06 : commandCount incohérent', () => {
    const r = validateExportedSession({
      version: '1.0',
      metadata: { exportDate: 1, exportUrl: 'x', commandCount: 5 },
      commands: ['a', 'b', 'c', 'd'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.error).toBe('Intégrité du fichier compromise (nombre de commandes incohérent).');
  });

  it('valide une session bien formée', () => {
    const r = validateExportedSession({
      version: '1.0',
      metadata: { exportDate: 1, exportUrl: 'x', commandCount: 1 },
      commands: ['git init'],
    });
    expect(r.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Store : import / rejeu / persistance
// ---------------------------------------------------------------------------

describe('store export/import (spec 58)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  function buildSession() {
    const store = useRepoStore();
    store.execute('git init');
    store.execute('write f1.txt "hello"');
    store.execute('git add f1.txt');
    store.execute('git commit -m "initial"');
    store.execute('git branch feature');
    return store;
  }

  it('exportSession reflète les commandes réussies', () => {
    const store = buildSession();
    const s = store.exportSession('demo');
    expect(s.commands).toContain('git init');
    expect(s.commands).toContain('git branch feature');
    expect(s.metadata.commandCount).toBe(s.commands.length);
    expect(s.metadata.description).toBe('demo');
  });

  it('CA-export-import-07 : rejeu déterministe (snapshot identique)', () => {
    const store = buildSession();
    const before = store.snapshot;
    const exported = store.exportSession();

    // Reset à zéro puis import.
    store.reset();
    const result = store.importSession(exported);

    expect(result.partial).toBe(false);
    expect(result.replayed).toBe(exported.commands.length);
    // Mêmes commits, mêmes hashes, mêmes branches.
    expect(store.snapshot.allCommits ?? store.snapshot.commits).toEqual(
      before.allCommits ?? before.commits,
    );
    expect(store.snapshot.branches).toEqual(before.branches);
  });

  it('CA-export-import-11 : roundtrip export → import → export', () => {
    const store = buildSession();
    const a = store.exportSession();
    store.reset();
    store.importSession(a);
    const b = store.exportSession();
    expect(b.commands).toEqual(a.commands);
  });

  it('CA-export-import-08 : rejeu partiel sur commande invalide', () => {
    const store = useRepoStore();
    const session = buildExportedSession(
      ['git init', 'write f1.txt "x"', 'git nonexistentcmd', 'git add f1.txt'],
      1,
    );
    const result = store.importSession(session);

    expect(result.partial).toBe(true);
    expect(result.errorIndex).toBe(3); // 1-based : la 3e commande échoue
    expect(result.replayed).toBe(2);
    // L'état reflète l'avancement jusqu'avant l'échec (f1.txt présent).
    expect(store.snapshot.files.find((f) => f.path === 'f1.txt')).toBeDefined();
  });

  it('CA-export-import-12 : import met à jour localStorage', () => {
    const store = buildSession();
    const exported = store.exportSession();
    store.reset();
    store.importSession(exported);

    const raw = localStorage.getItem('git-visualizer:history');
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    expect(stored.commands).toEqual(exported.commands);
  });
});
