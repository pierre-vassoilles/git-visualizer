/**
 * Tests composant : GuidedTutorialModal.vue (spec 51).
 * Rendu/interaction — la validation des objectifs vit dans le store/core.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import GuidedTutorialModal from '@/components/GuidedTutorialModal.vue';
import { useRepoStore } from '@/stores/repo';

function mountModal() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useRepoStore();
  const wrapper = mount(GuidedTutorialModal, { global: { plugins: [pinia] } });
  return { wrapper, store };
}

describe('GuidedTutorialModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('masquée hors tutoriel', () => {
    const { wrapper } = mountModal();
    expect(wrapper.find('.tuto-modal').exists()).toBe(false);
  });

  it('CA-02 : affichée au démarrage avec étape 1', async () => {
    const { wrapper, store } = mountModal();
    store.startTutorial('first-commit');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.tuto-modal').exists()).toBe(true);
    expect(wrapper.find('.step-title').text()).toContain('Initialiser');
    expect(wrapper.find('.objectives').exists()).toBe(true);
  });

  it("CA-03 : « Suivant » désactivé puis activé quand l'objectif est atteint", async () => {
    const { wrapper, store } = mountModal();
    store.startTutorial('first-commit');
    await wrapper.vm.$nextTick();
    const nextBtn = () => wrapper.findAll('.btn').find((b) => b.text() === 'Suivant')!;
    expect((nextBtn().element as HTMLButtonElement).disabled).toBe(true);
    store.execute('git init');
    await wrapper.vm.$nextTick();
    expect((nextBtn().element as HTMLButtonElement).disabled).toBe(false);
    // L'objectif est coché.
    expect(wrapper.find('.objectives li.ok').exists()).toBe(true);
  });

  it('CA-06 : « Indice » affiche le hint et incrémente le compteur', async () => {
    const { wrapper, store } = mountModal();
    store.startTutorial('first-commit');
    await wrapper.vm.$nextTick();
    const hintBtn = wrapper.findAll('.btn').find((b) => b.text().includes('Indice'))!;
    await hintBtn.trigger('click');
    expect(wrapper.find('.hint-text').exists()).toBe(true);
    expect(store.tutorialProgress?.hintsUsedCount).toBe(1);
  });

  it('CA-08 : « Quitter » ferme la modale', async () => {
    const { wrapper, store } = mountModal();
    store.startTutorial('first-commit');
    await wrapper.vm.$nextTick();
    const quitBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Quitter')!;
    await quitBtn.trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.tuto-modal').exists()).toBe(false);
    expect(store.tutorialProgress).toBeNull();
  });

  it('CA-09 : écran de complétion après la dernière étape', async () => {
    const { wrapper, store } = mountModal();
    store.startTutorial('first-commit');
    store.execute('git init');
    store.nextStep();
    store.execute('write README.md "# P"');
    store.nextStep();
    store.execute('git add README.md');
    store.nextStep();
    store.execute('git commit -m "Add README"');
    store.nextStep(); // complétion
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Tutoriel complété');
    expect(wrapper.findAll('.btn').some((b) => b.text() === 'Recommencer')).toBe(true);
  });
});
