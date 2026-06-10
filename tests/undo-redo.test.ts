/**
 * Tests Phase B3 : undo / redo applicatif
 * Spec : docs/specs/60-undo-redo.md
 *
 * Niveau store (logique). Les raccourcis clavier (CA-09/10) et les boutons
 * (CA-14) sont testés en composant. Modèle : rejeu déterministe jusqu'à
 * `currentIndex` ; `commandHistory` = timeline complète.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useRepoStore } from '@/stores/repo';
import { buildExportedSession } from '@/utils/export-import';

function store3() {
  const store = useRepoStore();
  store.execute('git init');
  store.execute('write f1.txt "x"');
  store.execute('git add f1.txt');
  store.execute('git commit -m "C1"');
  return store;
}

describe('undo/redo applicatif (spec 60)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('CA-undo-01 : undo après une commande rétrograde d un cran', () => {
    const store = store3();
    const idxBefore = store.currentIndex;
    expect(store.snapshot.commits.length).toBe(1); // 1 commit après C1

    store.undo(); // annule "git commit"

    expect(store.currentIndex).toBe(idxBefore - 1);
    expect(store.snapshot.commits.length).toBe(0); // commit annulé
    expect(store.canRedo).toBe(true);
  });

  it('CA-undo-02 : undo multiple jusqu au boot', () => {
    const store = store3(); // 4 commandes
    store.undo();
    store.undo();
    store.undo();
    store.undo();
    expect(store.currentIndex).toBe(0);
    expect(store.snapshot.initialized).toBe(false); // dépôt vierge
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(true);
  });

  it('CA-undo-03 : undo impossible au boot (no-op)', () => {
    const store = useRepoStore();
    const before = store.snapshot;
    store.undo();
    expect(store.currentIndex).toBe(0);
    expect(store.snapshot).toEqual(before);
  });

  it('CA-undo-04 : redo après undo', () => {
    const store = store3();
    store.undo();
    expect(store.snapshot.commits.length).toBe(0);

    store.redo();

    expect(store.currentIndex).toBe(4);
    expect(store.snapshot.commits.length).toBe(1);
    expect(store.canRedo).toBe(false);
  });

  it('CA-undo-05 : redo multiple', () => {
    const store = store3();
    store.undo();
    store.undo();
    store.undo();
    expect(store.currentIndex).toBe(1);
    store.redo();
    store.redo();
    store.redo();
    expect(store.currentIndex).toBe(4);
    expect(store.snapshot.commits.length).toBe(1);
  });

  it('CA-undo-06 : redo impossible si rien à refaire (no-op)', () => {
    const store = store3();
    const before = store.snapshot;
    store.redo();
    expect(store.currentIndex).toBe(4);
    expect(store.snapshot).toEqual(before);
  });

  it('CA-undo-07 : nouvelle commande après undo tronque le futur (redo)', () => {
    const store = store3(); // currentIndex = 4
    store.undo();
    store.undo(); // currentIndex = 2 (après "write f1.txt")
    expect(store.canRedo).toBe(true);

    store.execute('git branch fix'); // commande réussie → tronque le futur

    // currentIndex avance, redo tronqué
    expect(store.canRedo).toBe(false);
    // la timeline ne contient plus "git add"/"git commit" d'origine après l'index 2
    expect(store.savedCommands).not.toContain('git commit -m "C1"');
    expect(store.savedCommands).toContain('git branch fix');
  });

  it('CA-undo-08 : rejeu déterministe (snapshot identique avant undo / après redo)', () => {
    const store = store3();
    const before = store.snapshot.commits;
    store.undo();
    store.redo();
    expect(store.snapshot.commits).toEqual(before);
  });

  it('CA-undo-13 : currentIndex persisté + restauré au reload', () => {
    const store = store3(); // 4 commandes
    store.undo();
    store.undo(); // currentIndex = 2
    expect(store.currentIndex).toBe(2);

    // localStorage contient bien currentIndex.
    const raw = JSON.parse(localStorage.getItem('git-visualizer:history')!);
    expect(raw.currentIndex).toBe(2);
    expect(raw.commands.length).toBe(4); // timeline complète persistée

    // Simuler un reload : nouvelle instance + loadFromStorage.
    setActivePinia(createPinia());
    const reloaded = useRepoStore();
    reloaded.loadFromStorage();

    expect(reloaded.currentIndex).toBe(2);
    expect(reloaded.snapshot.commits.length).toBe(0); // état après 2 commandes (avant commit)
    expect(reloaded.canRedo).toBe(true); // redo possible après reload (timeline conservée)
  });

  it('CA-undo-15 : undo annule une opération en cours (merge conflictuel)', () => {
    const store = useRepoStore();
    [
      'git init',
      'write f.txt "base"',
      'git add f.txt',
      'git commit -m "C0"',
      'git branch feature',
      'write f.txt "main"',
      'git add f.txt',
      'git commit -m "main"',
      'git checkout feature',
      'write f.txt "feature"',
      'git add f.txt',
      'git commit -m "feature"',
      'git checkout main',
    ].forEach((c) => store.execute(c));
    store.execute('git merge feature'); // conflit → operationState merging
    expect(store.snapshot.operationState?.type).toBe('merging');

    store.undo(); // annule le merge

    expect(store.snapshot.operationState ?? null).toBeNull();
  });

  it('CA-undo-11 : undo/redo n affecte pas le reflog Git', () => {
    const store = store3();
    const reflogBefore = store.execute('git reflog').output;
    store.undo();
    store.redo();
    // Rejeu déterministe → le reflog reconstruit est identique (undo/redo invisible au Git).
    const reflogAfter = store.execute('git reflog').output;
    expect(reflogAfter).toEqual(reflogBefore);
  });

  it('CA-undo-12 : undo/redo n affecte pas l historique ↑/↓ du terminal', () => {
    const store = store3();
    const typedBefore = [...store.history];
    expect(typedBefore.length).toBe(4);
    store.undo();
    store.undo();
    // history (commandes tapées, axe ↑/↓) reste intact malgré l'undo.
    expect(store.history).toEqual(typedBefore);
  });

  it('CA-undo-18 : undo fonctionne sur une session importée', () => {
    const store = useRepoStore();
    const session = buildExportedSession(
      ['git init', 'write f.txt "x"', 'git add f.txt', 'git commit -m "imported"'],
      1,
    );
    store.importSession(session);
    expect(store.currentIndex).toBe(4);
    expect(store.snapshot.commits.length).toBe(1);

    store.undo();
    expect(store.currentIndex).toBe(3);
    expect(store.snapshot.commits.length).toBe(0);
  });
});
