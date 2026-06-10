/**
 * Tests Phase B2 : validation du curriculum (spec 63).
 *
 * Pour chaque tutoriel, on rejoue la commande de chaque étape (via executeChain,
 * comme le bouton « Exécuter ») et on vérifie que les objectifs de l'étape sont
 * atteints juste après. C'est la preuve que commandes + prédicats s'alignent.
 *
 * Les étapes SANS `command` (saisie libre attendue de l'utilisateur) sont
 * ignorées pour l'exécution mais leurs objectifs sont quand même vérifiés sur
 * l'état courant (ils doivent être atteints par les étapes précédentes ou être
 * des objectifs « informatifs » déjà vrais).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useRepoStore } from '@/stores/repo';
import { getAllTutorials } from '@/constants/tutorials';

describe('curriculum : rejeu déterministe de chaque tutoriel (spec 63)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  for (const tutorial of getAllTutorials()) {
    it(`tutoriel "${tutorial.id}" : chaque étape atteint ses objectifs`, () => {
      const store = useRepoStore();
      tutorial.steps.forEach((step, idx) => {
        if (step.command) {
          store.executeChain(step.command);
        }
        const snap = store.snapshot;
        const failed = step.objectives.filter((o) => {
          try {
            return !o.validate(snap);
          } catch {
            return true;
          }
        });
        expect(
          failed.length,
          `[${tutorial.id}] étape ${idx + 1} "${step.id}" : objectif(s) non atteint(s) → ${failed
            .map((o) => o.description.en)
            .join(' | ')}`,
        ).toBe(0);
      });
    });
  }
});
