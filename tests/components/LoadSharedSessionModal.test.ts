/**
 * Tests composant : LoadSharedSessionModal.vue (spec 59).
 *
 * On pilote l'état via le store réel (pendingSharedSession) et on observe le DOM
 * + l'effet sur le store. Aucune logique git testée ici.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import LoadSharedSessionModal from '@/components/LoadSharedSessionModal.vue';
import { useRepoStore } from '@/stores/repo';
import { buildExportedSession } from '@/utils/export-import';

function mountModal() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useRepoStore();
  const wrapper = mount(LoadSharedSessionModal, { global: { plugins: [pinia] } });
  return { wrapper, store };
}

describe('LoadSharedSessionModal (spec 59)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('masqué quand aucune session partagée en attente', () => {
    const { wrapper } = mountModal();
    expect(wrapper.find('.shared-modal').exists()).toBe(false);
  });

  it('CA-share-03 : affiché avec le nombre de commandes quand une session est en attente', async () => {
    const { wrapper, store } = mountModal();
    store.pendingSharedSession = buildExportedSession(
      ['git init', 'git add f', 'git commit -m "x"'],
      1,
    );
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.shared-modal').exists()).toBe(true);
    expect(wrapper.text()).toContain('3');
  });

  it('CA-share-04 : Charger rejoue la session et ferme le modal', async () => {
    const { wrapper, store } = mountModal();
    const session = buildExportedSession(
      ['git init', 'write f.txt "x"', 'git add f.txt', 'git commit -m "c1"'],
      1,
    );
    store.pendingSharedSession = session;
    await wrapper.vm.$nextTick();

    await wrapper.find('.btn-load').trigger('click');

    expect(store.pendingSharedSession).toBeNull();
    expect(wrapper.find('.shared-modal').exists()).toBe(false);
    // Session rejouée : un commit présent.
    expect(store.snapshot.commits.length).toBe(1);
    // Persistée dans localStorage.
    expect(localStorage.getItem('git-visualizer:history')).not.toBeNull();
  });

  it('CA-share-05 : Annuler ignore la session partagée', async () => {
    const { wrapper, store } = mountModal();
    store.pendingSharedSession = buildExportedSession(['git init', 'git commit -m "x"'], 1);
    await wrapper.vm.$nextTick();

    await wrapper.find('.btn-cancel').trigger('click');

    expect(store.pendingSharedSession).toBeNull();
    expect(wrapper.find('.shared-modal').exists()).toBe(false);
  });
});
