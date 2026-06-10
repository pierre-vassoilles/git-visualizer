/**
 * Tests : tutoriels guidés (spec 51).
 * Helpers purs + catalogue (headless) + progression via le store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { replay, newEngine } from './helpers';
import {
  hasCommits,
  commitCountEquals,
  hasBranch,
  headPointsTo,
  isHeadDetached,
  hasTag,
  fileExists,
  isStaged,
  noStagedChanges,
  noOperationInProgress,
  hasBranchCount,
  all,
} from '@/core/tutorial-helpers';
import { getAllTutorials, getTutorialById } from '@/constants/tutorials';
import { useRepoStore } from '@/stores/repo';

// ---------------------------------------------------------------------------
// Catalogue (CA-tutorials-01 / 14)
// ---------------------------------------------------------------------------

describe('catalogue de tutoriels (CA-01/14)', () => {
  it('CA-01 : au moins 3 tutoriels bien formés (modèle bilingue, spec 62)', () => {
    const tutos = getAllTutorials();
    expect(tutos.length).toBeGreaterThanOrEqual(3);
    for (const t of tutos) {
      expect(t.id).toBeTruthy();
      expect(t.title.en).toBeTruthy();
      expect(t.title.fr).toBeTruthy();
      expect(t.description.en).toBeTruthy();
      expect(t.description.fr).toBeTruthy();
      expect(typeof t.duration).toBe('number');
      expect(['basic', 'medium', 'advanced']).toContain(t.level);
      expect(t.steps.length).toBeGreaterThan(0);
      for (const s of t.steps) {
        expect(s.explanation.en).toBeTruthy();
        expect(s.graphEffect.en).toBeTruthy();
        expect(s.objectives.length).toBeGreaterThan(0);
        for (const o of s.objectives) expect(typeof o.validate).toBe('function');
      }
    }
  });

  it('getTutorialById', () => {
    expect(getTutorialById('first-commit')?.id).toBe('first-commit');
    expect(getTutorialById('nope')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helpers purs
// ---------------------------------------------------------------------------

describe('prédicats purs', () => {
  it('hasCommits / commitCountEquals', () => {
    const snap = replay([
      'git init',
      'write a.txt "x"',
      'git add a.txt',
      'git commit -m "C1"',
    ]).snapshot();
    expect(hasCommits(1)(snap)).toBe(true);
    expect(hasCommits(2)(snap)).toBe(false);
    expect(commitCountEquals(1)(snap)).toBe(true);
  });

  it('hasBranch / headPointsTo / hasBranchCount', () => {
    const snap = replay([
      'git init',
      'write a.txt "x"',
      'git add a.txt',
      'git commit -m "C1"',
      'git branch feature',
    ]).snapshot();
    expect(hasBranch('feature')(snap)).toBe(true);
    expect(hasBranch('nope')(snap)).toBe(false);
    expect(headPointsTo('main')(snap)).toBe(true);
    expect(hasBranchCount(2)(snap)).toBe(true);
  });

  it('isHeadDetached', () => {
    const e = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "C1"',
      'write a.txt "2"',
      'git add a.txt',
      'git commit -m "C2"',
      'git checkout HEAD~1',
    ]);
    expect(isHeadDetached()(e.snapshot())).toBe(true);
  });

  it('hasTag', () => {
    const snap = replay([
      'git init',
      'write a.txt "x"',
      'git add a.txt',
      'git commit -m "C1"',
      'git tag v1',
    ]).snapshot();
    expect(hasTag('v1')(snap)).toBe(true);
  });

  it('fileExists / isStaged / noStagedChanges', () => {
    const e = newEngine();
    e.execute('git init');
    e.execute('write a.txt "x"');
    expect(fileExists('a.txt')(e.snapshot())).toBe(true);
    expect(isStaged('a.txt')(e.snapshot())).toBe(false);
    e.execute('git add a.txt');
    expect(isStaged('a.txt')(e.snapshot())).toBe(true);
    expect(noStagedChanges()(e.snapshot())).toBe(false);
    e.execute('git commit -m "C1"');
    expect(noStagedChanges()(e.snapshot())).toBe(true);
  });

  it('noOperationInProgress / all', () => {
    const snap = replay(['git init']).snapshot();
    expect(noOperationInProgress()(snap)).toBe(true);
    expect(all(noOperationInProgress(), () => true)(snap)).toBe(true);
    expect(all(noOperationInProgress(), () => false)(snap)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Progression via le store
// ---------------------------------------------------------------------------

describe('progression de tutoriel (store)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("CA-02 : startTutorial réinitialise le dépôt et ouvre l'étape 1", () => {
    const store = useRepoStore();
    store.execute('git init');
    store.execute('write junk.txt "x"');
    store.startTutorial('first-commit');
    expect(store.tutorialProgress?.tutorialId).toBe('first-commit');
    expect(store.tutorialProgress?.currentStepIndex).toBe(0);
    expect(store.currentStep?.id).toBe('init');
    // Dépôt neuf (le junk a disparu).
    expect(store.snapshot.initialized).toBe(false);
  });

  it('CA-03 : objectif simple auto-validé après git init', () => {
    const store = useRepoStore();
    store.startTutorial('first-commit');
    expect(store.currentStepComplete).toBe(false);
    store.execute('git init');
    expect(store.tutorialObjectives[0]!.passed).toBe(true);
    expect(store.currentStepComplete).toBe(true);
  });

  it('CA-05 : objectif non atteint reste faux', () => {
    const store = useRepoStore();
    store.startTutorial('first-commit');
    store.nextStep(); // étape create-file
    store.execute('git init'); // ne crée pas README.md
    expect(store.currentStep?.id).toBe('create-file');
    expect(store.currentStepComplete).toBe(false);
  });

  it('CA-04 : étape commit multi-objectifs', () => {
    const store = useRepoStore();
    store.startTutorial('first-commit');
    store.execute('git init');
    store.nextStep();
    store.execute('write README.md "# Projet"');
    store.nextStep();
    store.execute('git add README.md');
    store.nextStep();
    expect(store.currentStep?.id).toBe('commit');
    expect(store.currentStepComplete).toBe(false);
    store.execute('git commit -m "Add README"');
    expect(store.tutorialObjectives.every((o) => o.passed)).toBe(true);
    expect(store.currentStepComplete).toBe(true);
  });

  it("CA-07/09 : navigation jusqu'à la complétion", () => {
    const store = useRepoStore();
    store.startTutorial('first-commit');
    store.execute('git init');
    store.nextStep();
    store.execute('write README.md "# Projet"');
    store.nextStep();
    store.execute('git add README.md');
    store.nextStep();
    store.execute('git commit -m "Add README"');
    store.nextStep(); // au-delà de la dernière étape
    expect(store.tutorialCompleted).toBe(true);
    expect(store.tutorialProgress?.completedSteps).toContain('commit');
  });

  it('CA-08 : quitTutorial ferme sans reset', () => {
    const store = useRepoStore();
    store.startTutorial('first-commit');
    store.execute('git init');
    store.quitTutorial();
    expect(store.tutorialProgress).toBeNull();
    // Le dépôt reste en l'état (toujours initialisé).
    expect(store.snapshot.initialized).toBe(true);
  });

  it("CA-11 : skipStep marque l'étape sautée", () => {
    const store = useRepoStore();
    store.startTutorial('first-commit');
    store.skipStep();
    expect(store.tutorialProgress?.skippedSteps).toContain('init');
    expect(store.currentStep?.id).toBe('create-file');
  });

  it("useHint incrémente le compteur d'indices", () => {
    const store = useRepoStore();
    store.startTutorial('first-commit');
    store.useHint();
    store.useHint(); // idempotent sur la même étape
    expect(store.tutorialProgress?.hintsUsedCount).toBe(1);
  });

  it('CA-12 : prédicat complexe (branche feature, mais HEAD sur feature ≠ main)', () => {
    const store = useRepoStore();
    store.startTutorial('branching');
    store.execute('git init');
    store.execute('write file.txt "v1"');
    store.execute('git add file.txt');
    store.execute('git commit -m "Initial"');
    store.nextStep(); // create-branch
    store.execute('git branch feature');
    store.nextStep(); // switch-branch
    store.execute('git checkout feature');
    store.nextStep(); // commit-on-branch
    store.execute('write file.txt "v2"');
    store.execute('git add file.txt');
    store.execute('git commit -m "Feature"');
    store.nextStep(); // switch-main : HEAD sur feature → objectif échoue
    expect(store.currentStep?.id).toBe('switch-main');
    expect(store.currentStepComplete).toBe(false);
    store.execute('git checkout main');
    expect(store.currentStepComplete).toBe(true);
  });
});
