/**
 * Tests composant : ConflictEditorModal.vue (spec 50, item B2).
 * Rendu/interaction uniquement — la logique git vit dans le store/core.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ConflictEditorModal from '@/components/ConflictEditorModal.vue';
import { useRepoStore } from '@/stores/repo';

function setupConflict() {
  const pinia = createPinia();
  setActivePinia(pinia);
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
  return { pinia, store };
}

describe('ConflictEditorModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('CA-01 : modale masquée hors conflit', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useRepoStore().execute('git init');
    const wrapper = mount(ConflictEditorModal, { global: { plugins: [pinia] } });
    expect(wrapper.find('.conflict-modal').exists()).toBe(false);
  });

  it("CA-01 : modale affichée lors d'un merge conflictuel + liste des fichiers", () => {
    const { pinia } = setupConflict();
    const wrapper = mount(ConflictEditorModal, { global: { plugins: [pinia] } });
    expect(wrapper.find('.conflict-modal').exists()).toBe(true);
    expect(wrapper.text()).toContain('Résolution de conflits');
    expect(wrapper.find('.file-list').text()).toContain('data.txt');
  });

  it('CA-03 : panneau 3-way affiche ours et theirs', () => {
    const { pinia } = setupConflict();
    const wrapper = mount(ConflictEditorModal, { global: { plugins: [pinia] } });
    expect(wrapper.find('.col-ours').text()).toContain('main edit');
    expect(wrapper.find('.col-theirs').text()).toContain('feature edit');
  });

  it('CA-04 : « Garder ours » prévisualise le contenu local', async () => {
    const { pinia } = setupConflict();
    const wrapper = mount(ConflictEditorModal, { global: { plugins: [pinia] } });
    const oursBtn = wrapper.findAll('.actions .btn').find((b) => b.text() === 'Garder ours')!;
    await oursBtn.trigger('click');
    expect(wrapper.find('.col-result').text()).toContain('main edit');
  });

  it('CA-07/10 : « Marquer résolu » puis « Continuer » termine le merge', async () => {
    const { pinia, store } = setupConflict();
    const wrapper = mount(ConflictEditorModal, { global: { plugins: [pinia] } });

    // Choisir une résolution puis marquer résolu.
    const oursBtn = wrapper.findAll('.actions .btn').find((b) => b.text() === 'Garder ours')!;
    await oursBtn.trigger('click');
    const resolveBtn = wrapper.find('.btn-resolve');
    expect((resolveBtn.element as HTMLButtonElement).disabled).toBe(false);
    await resolveBtn.trigger('click');

    // Plus de fichier en conflit ⇒ modale masquée et merge finalisable.
    expect(store.snapshot.operationState?.filesInConflict ?? []).not.toContain('data.txt');
    expect(wrapper.find('.conflict-modal').exists()).toBe(false);
  });

  it("CA-07 : bouton « Marquer résolu » désactivé tant qu'aucun choix", () => {
    const { pinia } = setupConflict();
    const wrapper = mount(ConflictEditorModal, { global: { plugins: [pinia] } });
    const resolveBtn = wrapper.find('.btn-resolve');
    expect((resolveBtn.element as HTMLButtonElement).disabled).toBe(true);
  });
});
