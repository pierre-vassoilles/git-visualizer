/**
 * Tests Phase B2 : système de tutoriels multi-niveaux (spec 62).
 * Niveaux + helpers, executeChain (A1), persistance de progression (C4).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useRepoStore } from '@/stores/repo';
import { getTutorialsByLevel, getAllTutorials } from '@/constants/tutorials';
import {
  levelToDifficulty,
  localize,
  hasStashCount,
  branchHasUpstream,
  hasRemote,
} from '@/core/tutorial-helpers';
import { replay } from './helpers';

describe('niveaux & helpers (spec 62)', () => {
  it('CA-tut62-02 : getTutorialsByLevel regroupe par niveau', () => {
    const all = getAllTutorials();
    const basic = getTutorialsByLevel('basic');
    const medium = getTutorialsByLevel('medium');
    const advanced = getTutorialsByLevel('advanced');
    expect(basic.length + medium.length + advanced.length).toBe(all.length);
    expect(basic.every((t) => t.level === 'basic')).toBe(true);
  });

  it('levelToDifficulty : basic→1, medium→2, advanced→3', () => {
    expect(levelToDifficulty('basic')).toBe(1);
    expect(levelToDifficulty('medium')).toBe(2);
    expect(levelToDifficulty('advanced')).toBe(3);
  });

  it('CA-tut62-03 : localize résout selon la locale (fallback en)', () => {
    expect(localize({ en: 'Hello', fr: 'Bonjour' }, 'fr')).toBe('Bonjour');
    expect(localize({ en: 'Hello', fr: 'Bonjour' }, 'en')).toBe('Hello');
    expect(localize({ en: 'Only EN', fr: '' }, 'fr')).toBe('Only EN'); // fallback
  });

  it('nouveaux prédicats : hasStashCount / branchHasUpstream / hasRemote', () => {
    const empty = replay(['git init']).snapshot();
    expect(hasStashCount(1)(empty)).toBe(false);
    expect(branchHasUpstream('main')(empty)).toBe(false);
    expect(hasRemote('origin')(empty)).toBe(false);
  });
});

describe('executeChain (spec 62, A1)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('exécute une ligne chaînée par ; (toutes les commandes)', () => {
    const store = useRepoStore();
    store.executeChain('git init ; write f.txt "x" ; git add f.txt ; git commit -m "C1"');
    expect(store.snapshot.commits.length).toBe(1);
  });

  it('court-circuite après un échec avec && ', () => {
    const store = useRepoStore();
    const results = store.executeChain('git init && git boguscommand && git tag should-not-exist');
    // git init OK, git boguscommand échoue, le tag est sauté → 2 segments exécutés.
    expect(results.length).toBe(2);
    expect(store.snapshot.tags['should-not-exist']).toBeUndefined();
  });
});

describe('persistance de progression (spec 62, C4)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('CA-tut62-12 : startTutorial + nextStep persistent, restoreTutorialProgress restaure', () => {
    const store = useRepoStore();
    store.startTutorial('first-commit');
    store.execute('git init');
    store.nextStep(); // → étape 1 (create-file)

    const raw = JSON.parse(localStorage.getItem('git-visualizer:tutorial')!);
    expect(raw.tutorialId).toBe('first-commit');
    expect(raw.currentStepIndex).toBe(1);

    // Reload simulé.
    setActivePinia(createPinia());
    const reloaded = useRepoStore();
    expect(reloaded.tutorialProgress).toBeNull();
    reloaded.restoreTutorialProgress();
    expect(reloaded.tutorialProgress?.tutorialId).toBe('first-commit');
    expect(reloaded.tutorialProgress?.currentStepIndex).toBe(1);
  });

  it('quitTutorial purge la progression persistée', () => {
    const store = useRepoStore();
    store.startTutorial('first-commit');
    expect(localStorage.getItem('git-visualizer:tutorial')).not.toBeNull();
    store.quitTutorial();
    expect(localStorage.getItem('git-visualizer:tutorial')).toBeNull();
  });
});
