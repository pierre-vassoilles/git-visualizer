import { ref } from 'vue';

/**
 * Bus minimal entre l'UI (ex. bouton « Exécuter » d'un tutoriel) et le terminal
 * xterm. Permet d'injecter une commande DANS le terminal — elle est affichée
 * après le prompt puis exécutée par `TerminalPanel`, exactement comme si
 * l'utilisateur l'avait tapée (écho + sortie visibles).
 *
 * On NE passe PAS par `store.execute` directement depuis le bouton : sinon la
 * commande s'exécute silencieusement (rien dans le terminal). Le terminal reste
 * le seul à savoir écrire dans xterm ; le bus ne fait que lui transmettre une
 * demande.
 *
 * Implémentation : un `ref` partagé au niveau module (singleton). Chaque demande
 * porte un `id` incrémental pour que `watch` se déclenche même si la même
 * commande est rejouée.
 */
const request = ref<{ id: number; command: string } | null>(null);
let seq = 0;

export function useTerminalBus() {
  /** Demande au terminal d'exécuter `command` (écho + sortie visibles). */
  function runInTerminal(command: string): void {
    request.value = { id: ++seq, command };
  }

  return { request, runInTerminal };
}
