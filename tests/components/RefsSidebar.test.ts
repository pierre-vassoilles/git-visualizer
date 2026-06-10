/**
 * Tests composant : RefsSidebar.vue (item B4-1, spec 61 §1).
 *
 * Principe (CA-tests-07) : on ne teste PAS la logique Git (couverte par les
 * tests headless), uniquement le RENDU Vue réactif d'un snapshot. On pilote
 * l'état via le store réel (execute), puis on observe le DOM.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import RefsSidebar from '@/components/RefsSidebar.vue';
import { useRepoStore } from '@/stores/repo';

function mountSidebar() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useRepoStore();
  const wrapper = mount(RefsSidebar, { global: { plugins: [pinia] } });
  return { wrapper, store };
}

/** Nom de la branche par défaut créée par `git init` + premier commit. */
function defaultBranch(store: ReturnType<typeof useRepoStore>): string {
  const h = store.snapshot.head;
  return h.type === 'branch' ? h.name : 'main';
}

describe('RefsSidebar — montage et rendu de base (CA-tests-02)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('monte sans erreur', () => {
    const { wrapper } = mountSidebar();
    expect(wrapper.find('.refs-sidebar').exists()).toBe(true);
    expect(wrapper.find('h2').exists()).toBe(true);
  });

  it('rend la liste des branches du snapshot', async () => {
    const { wrapper, store } = mountSidebar();
    store.execute('git init');
    store.execute('write a.txt "x"');
    store.execute('git add a.txt');
    store.execute('git commit -m "C1"');
    store.execute('git branch feature');
    await wrapper.vm.$nextTick();

    const names = wrapper.findAll('.item-name').map((n) => n.text());
    expect(names).toContain('feature');
    expect(names).toContain(defaultBranch(store));
  });

  it('marque la branche courante (classe item-current + indicateur ●)', async () => {
    const { wrapper, store } = mountSidebar();
    store.execute('git init');
    store.execute('write a.txt "x"');
    store.execute('git add a.txt');
    store.execute('git commit -m "C1"');
    await wrapper.vm.$nextTick();

    const current = wrapper.find('.item-current');
    expect(current.exists()).toBe(true);
    expect(current.find('.indicator').text()).toBe('●');
  });
});

describe('RefsSidebar — cas limites (CA-tests-03)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('dépôt non initialisé → placeholder "aucune branche"', () => {
    const { wrapper } = mountSidebar();
    expect(wrapper.text()).toContain('aucune branche');
  });

  it('HEAD détaché → libellé "détaché" visible', async () => {
    const { wrapper, store } = mountSidebar();
    store.execute('git init');
    store.execute('write a.txt "1"');
    store.execute('git add a.txt');
    store.execute('git commit -m "C1"');
    store.execute('write a.txt "2"');
    store.execute('git add a.txt');
    store.execute('git commit -m "C2"');
    store.execute('git checkout HEAD~1');
    await wrapper.vm.$nextTick();

    expect(store.snapshot.head.type).toBe('detached');
    expect(wrapper.find('.head-detached').exists()).toBe(true);
    expect(wrapper.text()).toContain('détaché');
  });

  it('opération en cours (merge conflictuel) → boutons Continuer / Annuler', async () => {
    const { wrapper, store } = mountSidebar();
    store.execute('git init');
    store.execute('write f.txt "base"');
    store.execute('git add f.txt');
    store.execute('git commit -m "base"');
    const main = defaultBranch(store);
    store.execute('git checkout -b feature');
    store.execute('write f.txt "feature"');
    store.execute('git add f.txt');
    store.execute('git commit -m "feat"');
    store.execute(`git checkout ${main}`);
    store.execute('write f.txt "main"');
    store.execute('git add f.txt');
    store.execute('git commit -m "main"');
    store.execute('git merge feature');
    await wrapper.vm.$nextTick();

    expect(store.snapshot.operationState).not.toBeNull();
    expect(wrapper.find('.btn-continue').exists()).toBe(true);
    expect(wrapper.find('.btn-abort').exists()).toBe(true);
  });

  it('stash non vide → section Stash avec compteur', async () => {
    const { wrapper, store } = mountSidebar();
    store.execute('git init');
    store.execute('write f.txt "base"');
    store.execute('git add f.txt');
    store.execute('git commit -m "base"');
    store.execute('write f.txt "wip"');
    store.execute('git add f.txt');
    store.execute('git stash');
    await wrapper.vm.$nextTick();

    expect(store.snapshot.stashCount).toBeGreaterThan(0);
    expect(wrapper.find('.stash-count').exists()).toBe(true);
    expect(wrapper.find('.stash-count').text()).toContain('entrée');
  });
});

describe('RefsSidebar — commandes récentes & scénarios', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('liste vide → "aucune commande", scénarios toujours présents', () => {
    const { wrapper } = mountSidebar();
    expect(wrapper.text()).toContain('aucune commande');
    // Au moins un bouton "Charger" de scénario rendu.
    expect(wrapper.findAll('.btn-scenario').length).toBeGreaterThan(0);
  });

  it('affiche les dernières commandes tapées', async () => {
    const { wrapper, store } = mountSidebar();
    store.execute('git init');
    await wrapper.vm.$nextTick();
    const history = wrapper.findAll('.history-item').map((n) => n.text());
    expect(history).toContain('git init');
  });
});

describe('RefsSidebar — refs cliquables (spec 53)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function repoWithBranchAndTag() {
    const { wrapper, store } = mountSidebar();
    store.execute('git init');
    store.execute('write a.txt "x"');
    store.execute('git add a.txt');
    store.execute('git commit -m "C1"');
    store.execute('git branch feature');
    store.execute('git tag v1');
    return { wrapper, store };
  }

  it('CA-clickable-01 : clic sur une branche → checkout', async () => {
    const { wrapper, store } = repoWithBranchAndTag();
    await wrapper.vm.$nextTick();
    const featureLi = wrapper.findAll('.item-row').find((li) => li.text().includes('feature'))!;
    await featureLi.trigger('click');
    expect(store.snapshot.head.type).toBe('branch');
    expect(store.snapshot.head.type === 'branch' && store.snapshot.head.name).toBe('feature');
  });

  it('CA-clickable-02 : clic sur la branche courante → no-op', async () => {
    const { wrapper, store } = repoWithBranchAndTag();
    const before = store.snapshot.head;
    await wrapper.vm.$nextTick();
    const current = wrapper.find('.item-current');
    await current.trigger('click');
    expect(store.snapshot.head).toEqual(before);
  });

  it('CA-clickable-03 : clic sur un tag → HEAD détaché', async () => {
    const { wrapper, store } = repoWithBranchAndTag();
    await wrapper.vm.$nextTick();
    // Le tag v1 est dans la section Tags (item-row clickable avec l'icône ⬡).
    const tagLi = wrapper
      .findAll('.item-row.clickable')
      .find((li) => li.text().includes('v1') && li.text().includes('⬡'))!;
    await tagLi.trigger('click');
    expect(store.snapshot.head.type).toBe('detached');
  });
});

describe('RefsSidebar — export/import de session (spec 58)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('CA-export-import-15 : bouton Exporter désactivé sans commande', () => {
    const { wrapper } = mountSidebar();
    const exportBtn = wrapper.find('.btn-export');
    expect(exportBtn.exists()).toBe(true);
    expect(exportBtn.attributes('disabled')).toBeDefined();
  });

  it('CA-export-import-15 : bouton Exporter actif après une commande', async () => {
    const { wrapper, store } = mountSidebar();
    store.execute('git init');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.btn-export').attributes('disabled')).toBeUndefined();
  });

  it('CA-export-import-14 : file input filtre .json', () => {
    const { wrapper } = mountSidebar();
    const input = wrapper.find('input[type="file"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes('accept')).toBe('.json');
  });

  it('CA-share-02 : bouton Partager présent, désactivé sans commande', async () => {
    const { wrapper, store } = mountSidebar();
    const shareBtn = wrapper.find('.btn-share');
    expect(shareBtn.exists()).toBe(true);
    expect(shareBtn.attributes('disabled')).toBeDefined();
    store.execute('git init');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.btn-share').attributes('disabled')).toBeUndefined();
  });
});
