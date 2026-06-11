import { ref } from 'vue';
import type { CommandResult } from '@/core/types';

/**
 * Bus minimal entre l'UI (boutons du menu contextuel du graphe, sidebar,
 * palette de commandes, scénarios, tutoriels…) et le terminal xterm.
 *
 * Objectif pédagogique : TOUTE commande auto-exécutée doit apparaître dans le
 * terminal (écho + sortie git), exactement comme si l'utilisateur l'avait
 * tapée. On NE passe donc PAS par `store.execute` directement depuis l'UI :
 * sinon la commande s'exécute silencieusement (rien dans le terminal). Le
 * terminal reste le seul à savoir écrire dans xterm ; le bus ne fait que lui
 * transmettre une demande.
 *
 * Trois types de demande :
 * - `exec`   : écho + EXÉCUTION d'une commande (le terminal appelle store.execute).
 *              Pour les actions unitaires (checkout, push, reset depuis un menu…).
 * - `replay` : AFFICHAGE seul d'une séquence déjà exécutée (commande + sortie),
 *              sans ré-exécuter. Pour les scénarios (le moteur a déjà rejoué la
 *              séquence côté store ; le terminal ne fait que la rendre visible).
 * - `clear`  : efface l'écran (nouveau départ : reset, démarrage d'un tutoriel).
 *
 * Implémentation : un `ref` partagé au niveau module (singleton). Chaque demande
 * porte un `id` incrémental pour que `watch` se déclenche même si la même
 * demande est rejouée.
 */
export interface ReplayEntry {
  readonly command: string;
  readonly result: CommandResult;
}

export type TerminalRequest =
  | { id: number; kind: 'exec'; command: string }
  | { id: number; kind: 'replay'; clear: boolean; entries: readonly ReplayEntry[] }
  | { id: number; kind: 'clear' };

const request = ref<TerminalRequest | null>(null);
let seq = 0;

export function useTerminalBus() {
  /** Demande au terminal d'exécuter `command` (écho + sortie visibles). */
  function runInTerminal(command: string): void {
    request.value = { id: ++seq, kind: 'exec', command };
  }

  /**
   * Demande au terminal d'AFFICHER une séquence déjà exécutée (commande +
   * sortie), sans la ré-exécuter. `clear` efface l'écran au préalable.
   */
  function replayInTerminal(entries: readonly ReplayEntry[], clear = true): void {
    request.value = { id: ++seq, kind: 'replay', clear, entries };
  }

  /** Demande au terminal d'effacer l'écran (nouveau départ). */
  function clearTerminal(): void {
    request.value = { id: ++seq, kind: 'clear' };
  }

  return { request, runInTerminal, replayInTerminal, clearTerminal };
}
