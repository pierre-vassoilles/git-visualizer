import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { GitEngine } from '@/core/engine';
import type { CommandResult } from '@/core/types';
import type { RepoSnapshot } from '@/core/engine';

/** Une entrée du journal du terminal (commande tapée + résultat). */
export interface LogEntry {
  readonly id: number;
  readonly command: string;
  readonly result: CommandResult;
}

/**
 * Store central : possède l'instance du moteur Git, expose l'historique des
 * commandes et l'action `execute`. Les composants (terminal, graphe, sidebar)
 * lisent ici l'état réactif.
 */
export const useRepoStore = defineStore('repo', () => {
  // Le moteur n'est pas réactif en lui-même (objet mutable lourd) :
  // shallowRef + snapshots réactifs explicites.
  const engine = shallowRef(new GitEngine());

  const log = ref<LogEntry[]>([]);
  const history = ref<string[]>([]);
  let nextId = 0;

  /** Snapshot réactif de l'état du dépôt, recalculé après chaque execute(). */
  const snapshot = ref<RepoSnapshot>(engine.value.snapshot());

  /** Exécute une commande, l'enregistre dans le journal et renvoie le résultat. */
  function execute(command: string): CommandResult {
    const result = engine.value.execute(command);
    log.value.push({ id: nextId++, command, result });
    if (command.trim() !== '') {
      history.value.push(command);
    }
    // Recalculer le snapshot après chaque commande
    snapshot.value = engine.value.snapshot();
    return result;
  }

  /** Réinitialise le dépôt (nouveau moteur). */
  function reset(): void {
    engine.value = new GitEngine();
    log.value = [];
    history.value = [];
    snapshot.value = engine.value.snapshot();
  }

  // `engine` reste privé au store : les composants passent par execute()/snapshot()
  // pour que journal et snapshot restent cohérents.
  return { log, history, snapshot, execute, reset };
});
