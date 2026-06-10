/**
 * Tests : éditeur de résolution de conflits (spec 50).
 * Helpers purs (parseConflictContent / buildResolvedContent) en headless +
 * intégration store (resolveConflict, snapshot.filesInConflict).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { parseConflictContent, buildResolvedContent, hasConflictMarkers } from '@/core/repository';
import { useRepoStore } from '@/stores/repo';

// ---------------------------------------------------------------------------
// Helpers purs
// ---------------------------------------------------------------------------

describe('parseConflictContent (CA-conflict-editor-02/12/13)', () => {
  it('CA-02 : parse un conflit simple (délimiteurs exclus)', () => {
    const content = [
      'line 1',
      '<<<<<<< HEAD',
      'ours edit',
      '=======',
      'theirs edit',
      '>>>>>>>',
      'line 2',
    ].join('\n');
    expect(parseConflictContent(content)).toEqual([{ ours: 'ours edit', theirs: 'theirs edit' }]);
  });

  it('CA-12 : contenu sans marqueur → []', () => {
    expect(parseConflictContent('just\nsome\ntext')).toEqual([]);
  });

  it('CA-13 : plusieurs sections de conflit', () => {
    const content = [
      '<<<<<<< HEAD',
      'a-ours',
      '=======',
      'a-theirs',
      '>>>>>>>',
      'middle',
      '<<<<<<< HEAD',
      'b-ours',
      '=======',
      'b-theirs',
      '>>>>>>>',
    ].join('\n');
    expect(parseConflictContent(content)).toEqual([
      { ours: 'a-ours', theirs: 'a-theirs' },
      { ours: 'b-ours', theirs: 'b-theirs' },
    ]);
  });

  it('conflit vide → sections vides', () => {
    const content = ['<<<<<<< HEAD', '=======', '>>>>>>>'].join('\n');
    expect(parseConflictContent(content)).toEqual([{ ours: '', theirs: '' }]);
  });

  it('sections multi-lignes', () => {
    const content = ['<<<<<<< HEAD', 'l1', 'l2', '=======', 'r1', '>>>>>>>'].join('\n');
    expect(parseConflictContent(content)).toEqual([{ ours: 'l1\nl2', theirs: 'r1' }]);
  });
});

describe('buildResolvedContent (CA-conflict-editor-04/05/06)', () => {
  it('CA-04 : ours', () => {
    expect(buildResolvedContent('local', 'remote', 'ours')).toBe('local');
  });
  it('CA-05 : theirs', () => {
    expect(buildResolvedContent('local', 'remote', 'theirs')).toBe('remote');
  });
  it('CA-06 : both → ours\\ntheirs', () => {
    expect(buildResolvedContent('A', 'B', 'both')).toBe('A\nB');
  });
  it('manual → contenu fourni', () => {
    expect(buildResolvedContent('A', 'B', 'manual', 'custom')).toBe('custom');
    expect(buildResolvedContent('A', 'B', 'manual')).toBe('');
  });
});

describe('hasConflictMarkers', () => {
  it('détecte les marqueurs', () => {
    expect(hasConflictMarkers('a\n<<<<<<< HEAD\n')).toBe(true);
    expect(hasConflictMarkers('no conflict here')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Intégration store : conflit réel de merge
// ---------------------------------------------------------------------------

describe('store.resolveConflict + snapshot.filesInConflict', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  function setupMergeConflict() {
    const store = useRepoStore();
    store.execute('git init');
    store.execute('write data.txt "base"');
    store.execute('git add data.txt');
    store.execute('git commit -m "base"');
    const main = store.snapshot.head.type === 'branch' ? store.snapshot.head.name : 'main';
    store.execute('git checkout -b feature');
    store.execute('write data.txt "feature edit"');
    store.execute('git add data.txt');
    store.execute('git commit -m "feat"');
    store.execute(`git checkout ${main}`);
    store.execute('write data.txt "main edit"');
    store.execute('git add data.txt');
    store.execute('git commit -m "main"');
    store.execute('git merge feature');
    return store;
  }

  it('un merge conflictuel expose le fichier dans filesInConflict', () => {
    const store = setupMergeConflict();
    expect(store.snapshot.operationState?.type).toBe('merging');
    expect(store.snapshot.operationState?.filesInConflict).toContain('data.txt');
  });

  it('getConflictSections renvoie ours/theirs du fichier', () => {
    const store = setupMergeConflict();
    const sections = store.getConflictSections('data.txt');
    expect(sections.length).toBeGreaterThan(0);
    expect(sections[0]!.ours).toContain('main edit');
    expect(sections[0]!.theirs).toContain('feature edit');
  });

  it('resolveConflict("ours") retire les marqueurs, stage, et permet --continue', () => {
    const store = setupMergeConflict();
    store.resolveConflict('data.txt', 'ours');
    // Plus de marqueurs ⇒ le fichier quitte filesInConflict.
    expect(store.snapshot.operationState?.filesInConflict ?? []).not.toContain('data.txt');
    expect(store.readFile('data.txt')).toBe('main edit');
    // Le merge peut être finalisé.
    const cont = store.execute('git merge --continue');
    expect(cont.exitCode).toBe(0);
    expect(store.snapshot.operationState).toBeUndefined();
  });

  it('M1 : git merge --continue refuse de committer des marqueurs non résolus', () => {
    const store = setupMergeConflict();
    // Sans résoudre : le fichier contient encore des marqueurs.
    const r = store.execute('git merge --continue');
    expect(r.exitCode).toBe(1);
    expect(r.errors.join(' ')).toContain('unmerged files');
    expect(store.snapshot.operationState?.type).toBe('merging');
  });

  it('M1 : git commit refuse aussi de finaliser un merge avec marqueurs', () => {
    const store = setupMergeConflict();
    const r = store.execute('git commit -m "x"');
    expect(r.exitCode).toBe(1);
    expect(r.errors.join(' ')).toContain('unmerged files');
  });

  it('resolveConflict("both") combine ours et theirs', () => {
    const store = setupMergeConflict();
    store.resolveConflict('data.txt', 'both');
    expect(store.readFile('data.txt')).toBe('main edit\nfeature edit');
  });

  it('resolveConflict("manual") écrit le contenu fourni', () => {
    const store = setupMergeConflict();
    store.resolveConflict('data.txt', 'manual', 'résolution custom');
    expect(store.readFile('data.txt')).toBe('résolution custom');
    expect(store.snapshot.operationState?.filesInConflict ?? []).not.toContain('data.txt');
  });
});
