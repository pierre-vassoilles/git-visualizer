/**
 * Tests composant : TerminalPanel.vue — intégration Tab (item B4-1, spec 61 §1).
 *
 * xterm.js exige un rendu canvas indisponible sous jsdom : on mocke @xterm/xterm
 * pour capturer le callback `onData` et les écritures `write`. On teste alors
 * l'INTÉGRATION (Tab → autocomplete → écriture terminal), pas la logique Git.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// Harness partagé (hoisté pour être visible dans la factory de vi.mock).
const xterm = vi.hoisted(() => ({
  writes: [] as string[],
  cb: null as null | ((d: string) => void),
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    write(s: string): void {
      xterm.writes.push(s);
    }
    loadAddon(): void {}
    open(): void {}
    onData(c: (d: string) => void): void {
      xterm.cb = c;
    }
    dispose(): void {}
  },
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit(): void {}
  },
}));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

import TerminalPanel from '@/components/TerminalPanel.vue';
import { useRepoStore } from '@/stores/repo';

async function mountTerminal() {
  xterm.writes.length = 0;
  xterm.cb = null;
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useRepoStore();
  const wrapper = mount(TerminalPanel, { global: { plugins: [pinia] } });
  await wrapper.vm.$nextTick();
  return { wrapper, store };
}

/** Simule la saisie de `text` puis un appui sur Tab. */
function typeAndTab(text: string): void {
  xterm.cb!(text); // un seul "data" multi-caractères = collage de la ligne
  xterm.writes.length = 0; // ne garder que ce qui est écrit par le Tab
  xterm.cb!('\t');
}

describe('TerminalPanel — autocomplétion Tab (CA-tests-04/05)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('le callback onData est bien enregistré au montage', async () => {
    await mountTerminal();
    expect(typeof xterm.cb).toBe('function');
  });

  it('complétion unique : "git com" + Tab → ligne complétée en "git commit"', async () => {
    await mountTerminal();
    typeAndTab('git com');
    const out = xterm.writes.join('');
    expect(out).toContain('git commit');
  });

  it('candidats multiples : "git ch" + Tab → liste les candidats sans crash', async () => {
    await mountTerminal();
    typeAndTab('git ch');
    const out = xterm.writes.join('');
    expect(out).toContain('checkout');
    expect(out).toContain('cherry-pick');
  });

  it('aucun candidat : "git zzz" + Tab → aucune écriture, pas de crash', async () => {
    await mountTerminal();
    typeAndTab('git zzz');
    expect(xterm.writes.join('')).toBe('');
  });

  it('après un Tab sans candidat, la saisie continue (caractère écho)', async () => {
    await mountTerminal();
    typeAndTab('git zzz');
    // Un caractère imprimable saisi ensuite est bien renvoyé à l'écran.
    xterm.writes.length = 0;
    xterm.cb!('x');
    expect(xterm.writes.join('')).toContain('x');
  });
});
