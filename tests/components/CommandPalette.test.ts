/**
 * Tests composant : CommandPalette.vue (spec 57).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CommandPalette from '@/components/CommandPalette.vue';
import { useRepoStore } from '@/stores/repo';
import { useTerminalBus } from '@/composables/useTerminalBus';

/** Dernière commande émise vers le terminal (les commandes git de la palette
 *  passent désormais par le bus terminal, pas par store.execute directement). */
function lastTerminalCommand(): string | null {
  const r = useTerminalBus().request.value;
  return r && r.kind === 'exec' ? r.command : null;
}

function mountPalette() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useRepoStore();
  const wrapper = mount(CommandPalette, { global: { plugins: [pinia] } });
  return { wrapper, store };
}

function ctrlK() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
}

describe('CommandPalette', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fermée par défaut, Ctrl+K l’ouvre', async () => {
    const { wrapper } = mountPalette();
    expect(wrapper.find('.palette').exists()).toBe(false);
    ctrlK();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.palette').exists()).toBe(true);
  });

  it('Ctrl+K bascule (ouvre puis ferme)', async () => {
    const { wrapper } = mountPalette();
    ctrlK();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.palette').exists()).toBe(true);
    ctrlK();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.palette').exists()).toBe(false);
  });

  it('Escape ferme la palette', async () => {
    const { wrapper } = mountPalette();
    ctrlK();
    await wrapper.vm.$nextTick();
    await wrapper.find('.palette-input').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.palette').exists()).toBe(false);
  });

  it('la recherche filtre les items', async () => {
    const { wrapper } = mountPalette();
    ctrlK();
    await wrapper.vm.$nextTick();
    await wrapper.find('.palette-input').setValue('commit');
    const labels = wrapper.findAll('.palette-label').map((n) => n.text());
    expect(labels.some((l) => l === 'git commit')).toBe(true);
  });

  it('Entrée exécute l’item sélectionné (émis au terminal)', async () => {
    const { wrapper } = mountPalette();
    ctrlK();
    await wrapper.vm.$nextTick();
    await wrapper.find('.palette-input').setValue('git init');
    await wrapper.vm.$nextTick();
    await wrapper.find('.palette-input').trigger('keydown', { key: 'Enter' });
    expect(lastTerminalCommand()).toBe('git init');
    // La palette se ferme après exécution.
    expect(wrapper.find('.palette').exists()).toBe(false);
  });

  it('clic sur un item l’exécute (émis au terminal)', async () => {
    const { wrapper } = mountPalette();
    ctrlK();
    await wrapper.vm.$nextTick();
    await wrapper.find('.palette-input').setValue('git status');
    await wrapper.vm.$nextTick();
    const item = wrapper.findAll('.palette-item').find((i) => i.text().includes('git status'))!;
    await item.trigger('click');
    expect(lastTerminalCommand()).toBe('git status');
  });
});
