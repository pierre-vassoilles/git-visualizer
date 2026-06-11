/**
 * Tests composant : menu contextuel du graphe (spec 53).
 * Vérifie l'ouverture du menu et que les actions passent par store.execute.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import GraphView from '@/components/GraphView.vue';
import { useRepoStore } from '@/stores/repo';
import { useTerminalBus } from '@/composables/useTerminalBus';

/** Dernière commande émise vers le terminal (les actions du menu contextuel
 *  passent désormais par le bus terminal, pas par store.execute directement). */
function lastTerminalCommand(): string | null {
  const r = useTerminalBus().request.value;
  return r && r.kind === 'exec' ? r.command : null;
}

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useRepoStore();
  store.execute('git init');
  store.execute('write a.txt "1"');
  store.execute('git add a.txt');
  store.execute('git commit -m "C1"');
  store.execute('write a.txt "2"');
  store.execute('git add a.txt');
  store.execute('git commit -m "C2"');
  const wrapper = mount(GraphView, { global: { plugins: [pinia] } });
  return { wrapper, store };
}

function headHash(store: ReturnType<typeof useRepoStore>): string {
  const h = store.snapshot.head;
  return h.type === 'detached' ? h.hash : store.snapshot.branches[h.name]!;
}
function rootHash(store: ReturnType<typeof useRepoStore>): string {
  const commits = store.snapshot.allCommits ?? store.snapshot.commits;
  return commits.find((c) => c.parents.length === 0)!.hash;
}

async function rightClick(wrapper: ReturnType<typeof mount>, hash: string) {
  const circle = wrapper.find(`circle[data-hash="${hash}"]`);
  await circle.trigger('contextmenu');
}

describe('GraphView — menu contextuel (spec 53)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('CA-04 : clic droit sur un nœud → menu affiché', async () => {
    const { wrapper, store } = setup();
    await wrapper.vm.$nextTick();
    await rightClick(wrapper, rootHash(store));
    expect(wrapper.find('.ctx-menu').exists()).toBe(true);
    expect(wrapper.find('.ctx-item.danger').text()).toContain('Reset --hard');
  });

  it('CA-16 : clic outside ferme le menu', async () => {
    const { wrapper, store } = setup();
    await wrapper.vm.$nextTick();
    await rightClick(wrapper, rootHash(store));
    expect(wrapper.find('.ctx-menu').exists()).toBe(true);
    await wrapper.find('.ctx-overlay').trigger('click');
    expect(wrapper.find('.ctx-menu').exists()).toBe(false);
  });

  it('CA-05 : Checkout (détaché) → git checkout <short>', async () => {
    const { wrapper, store } = setup();
    await wrapper.vm.$nextTick();
    const root = rootHash(store);
    await rightClick(wrapper, root);
    const item = wrapper.findAll('.ctx-item').find((i) => i.text().includes('Checkout'))!;
    await item.trigger('click');
    // L'action émet la commande vers le terminal (exécutée par TerminalPanel).
    expect(lastTerminalCommand()).toBe(`git checkout ${root.slice(0, 7)}`);
  });

  it('CA-06 : Checkout absent si le nœud est HEAD', async () => {
    const { wrapper, store } = setup();
    await wrapper.vm.$nextTick();
    await rightClick(wrapper, headHash(store));
    const hasCheckout = wrapper.findAll('.ctx-item').some((i) => i.text().includes('Checkout'));
    expect(hasCheckout).toBe(false);
  });

  it('CA-10 : Revert absent sur la racine', async () => {
    const { wrapper, store } = setup();
    await wrapper.vm.$nextTick();
    await rightClick(wrapper, rootHash(store));
    const hasRevert = wrapper.findAll('.ctx-item').some((i) => i.text() === 'Revert');
    expect(hasRevert).toBe(false);
  });

  it("CA-08 : Reset --hard demande confirmation (déclin → pas d'exécution)", async () => {
    const { wrapper, store } = setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await wrapper.vm.$nextTick();
    // Émission précédente sur le bus (s'il y en a une) : on vérifie qu'aucune
    // nouvelle commande reset --hard n'est émise après le déclin.
    const before = lastTerminalCommand();
    await rightClick(wrapper, rootHash(store));
    const item = wrapper.find('.ctx-item.danger');
    await item.trigger('click');
    expect(window.confirm).toHaveBeenCalled();
    expect(lastTerminalCommand()).toBe(before);
  });

  it('CA-08 : Reset --hard confirmé → git reset --hard <short>', async () => {
    const { wrapper, store } = setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await wrapper.vm.$nextTick();
    const root = rootHash(store);
    await rightClick(wrapper, root);
    await wrapper.find('.ctx-item.danger').trigger('click');
    expect(lastTerminalCommand()).toBe(`git reset --hard ${root.slice(0, 7)}`);
  });

  it('CA-13 : Copier le hash → navigator.clipboard.writeText(hash complet)', async () => {
    const { wrapper, store } = setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    // @ts-expect-error : stub clipboard pour jsdom
    navigator.clipboard = { writeText };
    await wrapper.vm.$nextTick();
    const root = rootHash(store);
    await rightClick(wrapper, root);
    const item = wrapper.findAll('.ctx-item').find((i) => i.text().includes('Copier'))!;
    await item.trigger('click');
    expect(writeText).toHaveBeenCalledWith(root);
  });
});
