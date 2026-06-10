/**
 * Tests Phase B2 : parité bilingue du contenu des tutoriels (spec 62, CA-tut62-14).
 *
 * Chaque LocalizedText des tutoriels doit avoir `en` ET `fr` non vides, et les
 * clés i18n du chrome tutoriel doivent exister en FR et EN.
 */

import { describe, it, expect } from 'vitest';
import { getAllTutorials } from '@/constants/tutorials';
import type { LocalizedText } from '@/core/tutorial-helpers';
import { MESSAGE_KEYS } from '@/i18n/messages';
import frMessages from '@/i18n/locales/fr.json';
import enMessages from '@/i18n/locales/en.json';

function expectBilingual(text: LocalizedText, where: string): void {
  expect(text.en, `${where}.en`).toBeTruthy();
  expect(text.fr, `${where}.fr`).toBeTruthy();
}

describe('parité bilingue des tutoriels (spec 62)', () => {
  it('CA-tut62-14 : chaque LocalizedText a en ET fr non vides', () => {
    for (const tutorial of getAllTutorials()) {
      const tid = tutorial.id;
      expectBilingual(tutorial.title, `${tid}.title`);
      expectBilingual(tutorial.description, `${tid}.description`);
      for (const step of tutorial.steps) {
        const sid = `${tid}.${step.id}`;
        expectBilingual(step.title, `${sid}.title`);
        expectBilingual(step.description, `${sid}.description`);
        expectBilingual(step.explanation, `${sid}.explanation`);
        expectBilingual(step.graphEffect, `${sid}.graphEffect`);
        expectBilingual(step.successMessage, `${sid}.successMessage`);
        if (step.hint) expectBilingual(step.hint, `${sid}.hint`);
        for (const o of step.objectives) expectBilingual(o.description, `${sid}.objective`);
      }
    }
  });

  it('CA-tut62-14 : clés i18n du chrome tutoriel présentes en FR/EN', () => {
    const chromeKeys = [
      'sidebar.tutorialLevel.basic',
      'sidebar.tutorialLevel.medium',
      'sidebar.tutorialLevel.advanced',
      'sidebar.openTutorials',
      'tutorial.why',
      'tutorial.graphEffect',
      'tutorial.executeButton',
    ];
    const fr = frMessages as Record<string, string>;
    const en = enMessages as Record<string, string>;
    for (const key of chromeKeys) {
      expect(MESSAGE_KEYS).toContain(key);
      expect(fr[key], `fr ${key}`).toBeTruthy();
      expect(en[key], `en ${key}`).toBeTruthy();
    }
  });

  it('command (si présent) ne contient pas de hash littéral, et level est valide', () => {
    for (const tutorial of getAllTutorials()) {
      expect(['basic', 'medium', 'advanced']).toContain(tutorial.level);
      for (const step of tutorial.steps) {
        if (step.command) {
          // Pas de hash hexadécimal long en dur (A2 : révisions relatives).
          expect(step.command).not.toMatch(/\b[0-9a-f]{7,}\b/);
        }
      }
    }
  });
});
