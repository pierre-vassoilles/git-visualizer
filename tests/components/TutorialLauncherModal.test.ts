/**
 * Tests composant : TutorialLauncherModal.vue (spec 62, CA-tut62-07).
 * Catalogue groupé par niveau + démarrage d'un tutoriel via le store réel.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import TutorialLauncherModal from '@/components/TutorialLauncherModal.vue';
import { useRepoStore } from '@/stores/repo';
import { useTutorialLauncher } from '@/composables/useTutorialLauncher';

function mountLauncher() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useRepoStore();
  const wrapper = mount(TutorialLauncherModal, { global: { plugins: [pinia] } });
  return { wrapper, store };
}

describe('TutorialLauncherModal (spec 62)', () => {
  beforeEach(() => {
    localStorage.clear();
    useTutorialLauncher().closeTutorialLauncher();
  });

  it('masqué tant que le lanceur n est pas ouvert', () => {
    const { wrapper } = mountLauncher();
    expect(wrapper.text()).not.toContain('Basique');
  });

  it('CA-tut62-07 : ouvert, affiche les 3 niveaux et des tutoriels', async () => {
    const { wrapper } = mountLauncher();
    useTutorialLauncher().openTutorialLauncher();
    await wrapper.vm.$nextTick();
    const txt = wrapper.text();
    expect(txt).toContain('Basique');
    expect(txt).toContain('Moyen');
    expect(txt).toContain('Avancé');
    // Au moins le tuto migré "Premier commit" (basique) est listé.
    expect(txt).toContain('Premier commit');
  });

  it('démarre un tutoriel au clic et ferme le lanceur', async () => {
    const { wrapper, store } = mountLauncher();
    useTutorialLauncher().openTutorialLauncher();
    await wrapper.vm.$nextTick();
    // Bouton/élément démarrant le tutoriel first-commit.
    const starter = wrapper
      .findAll('[data-tutorial-id]')
      .find((el) => el.attributes('data-tutorial-id') === 'first-commit');
    expect(starter, 'élément data-tutorial-id="first-commit" présent').toBeTruthy();
    await starter!.trigger('click');
    expect(store.tutorialProgress?.tutorialId).toBe('first-commit');
    expect(useTutorialLauncher().isOpen.value).toBe(false);
  });
});
