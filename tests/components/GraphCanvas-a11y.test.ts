/**
 * Tests composant : accessibilité du graphe (spec 56, CA-a11y-02).
 * Les nœuds sont focalisables et répondent au clavier (Entrée/Espace).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import GraphView from '@/components/GraphView.vue';
import { useRepoStore } from '@/stores/repo';

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useRepoStore();
  store.execute('git init');
  store.execute('write a.txt "1"');
  store.execute('git add a.txt');
  store.execute('git commit -m "C1"');
  const wrapper = mount(GraphView, { global: { plugins: [pinia] } });
  return { wrapper, store };
}

function rootHash(store: ReturnType<typeof useRepoStore>): string {
  const commits = store.snapshot.allCommits ?? store.snapshot.commits;
  return commits.find((c) => c.parents.length === 0)!.hash;
}

describe('GraphCanvas — accessibilité clavier (spec 56)', () => {
  beforeEach(() => localStorage.clear());

  it('les nœuds sont focalisables (tabindex) et ont un rôle/aria-label', async () => {
    const { wrapper, store } = setup();
    await wrapper.vm.$nextTick();
    const circle = wrapper.find(`circle[data-hash="${rootHash(store)}"]`);
    expect(circle.attributes('tabindex')).toBe('0');
    expect(circle.attributes('role')).toBe('button');
    expect(circle.attributes('aria-label')).toContain('Commit');
  });

  it('Entrée sur un nœud focalisé le sélectionne (node-selected)', async () => {
    const { wrapper, store } = setup();
    await wrapper.vm.$nextTick();
    const circle = wrapper.find(`circle[data-hash="${rootHash(store)}"]`);
    await circle.trigger('keydown', { key: 'Enter' });
    expect(circle.classes()).toContain('node-selected');
  });

  it('Espace sélectionne aussi (et bascule au second appui)', async () => {
    const { wrapper, store } = setup();
    await wrapper.vm.$nextTick();
    const circle = wrapper.find(`circle[data-hash="${rootHash(store)}"]`);
    await circle.trigger('keydown', { key: ' ' });
    expect(circle.classes()).toContain('node-selected');
    await circle.trigger('keydown', { key: ' ' });
    expect(circle.classes()).not.toContain('node-selected');
  });

  it('le graphe expose role="img" et un aria-label', () => {
    const { wrapper } = setup();
    const graph = wrapper.find('[role="img"]');
    expect(graph.exists()).toBe(true);
    expect(graph.attributes('aria-label')).toBeTruthy();
  });
});
