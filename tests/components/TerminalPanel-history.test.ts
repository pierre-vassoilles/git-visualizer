/**
 * Tests composant : TerminalPanel.vue — navigation historique ↑/↓ (item B4-1).
 * Spec 61 §1, CA-tests-06.
 *
 * Même approche que le test d'autocomplétion : xterm mocké, on capture le
 * callback `onData` et les écritures. On vérifie l'interaction clavier, pas la
 * logique Git.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

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

// Séquences ANSI émises par xterm pour les flèches (ESC + [A / [B).
const UP = '\x1b[A';
const DOWN = '\x1b[B';
const ENTER = '\r';

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

/** Tape une ligne (collage mono-data) puis Entrée. */
function runLine(line: string): void {
  xterm.cb!(line);
  xterm.cb!(ENTER);
}

describe('TerminalPanel — historique ↑/↓ (CA-tests-06)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('↑ rappelle la dernière commande tapée', async () => {
    const { store } = await mountTerminal();
    runLine('git init');
    expect(store.history).toContain('git init');

    xterm.writes.length = 0;
    xterm.cb!(UP);
    expect(xterm.writes.join('')).toContain('git init');
  });

  it('↑ ↑ navigue vers les commandes plus anciennes', async () => {
    await mountTerminal();
    runLine('git status');
    runLine('git log');

    xterm.writes.length = 0;
    xterm.cb!(UP); // plus récente : "git log"
    expect(xterm.writes.join('')).toContain('git log');

    xterm.writes.length = 0;
    xterm.cb!(UP); // plus ancienne : "git status"
    expect(xterm.writes.join('')).toContain('git status');
  });

  it("↑ puis ↓ jusqu'au bout → ligne vide", async () => {
    await mountTerminal();
    runLine('git init');

    xterm.cb!(UP); // "git init"
    xterm.writes.length = 0;
    xterm.cb!(DOWN); // au-delà → ligne vide
    const out = xterm.writes.join('');
    // La réécriture de ligne efface puis ré-affiche le prompt sans commande.
    expect(out).not.toContain('git init');
  });

  it('édition inline après rappel : ↑ ramène la commande, on peut compléter', async () => {
    const { store } = await mountTerminal();
    runLine('git init');

    xterm.cb!(UP); // current = "git init"
    xterm.cb!(' foo'); // édition inline
    xterm.writes.length = 0;
    xterm.cb!(ENTER);
    // La ligne éditée a été exécutée (observée via l'historique du store).
    expect(store.history).toContain('git init foo');
  });
});
