import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { GitEngine } from '@/core/engine';
import type { CommandCatalog } from '@/core/catalog';
import type { CommandResult } from '@/core/types';
import type { RepoSnapshot } from '@/core/engine';
import type { TodoItem } from '@/core/model';
import { loadHistory, saveHistory, clearHistory } from '@/utils/storage';
import { getScenarioById } from '@/constants/scenarios';

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

  /**
   * Commandes RÉUSSIES uniquement (exitCode === 0), utilisées pour la persistance.
   * Distinctes de `history` (qui contient toutes les commandes tapées, pour ↑/↓).
   */
  const savedCommands = ref<string[]>([]);

  /** Exécute une commande, l'enregistre dans le journal et renvoie le résultat. */
  function execute(command: string): CommandResult {
    const result = engine.value.execute(command);
    const snap = engine.value.snapshot();
    log.value.push({ id: nextId++, command, result });
    if (command.trim() !== '') {
      history.value.push(command);
    }
    // Persiste une commande si elle réussit OU si elle laisse une opération en
    // cours (ex: merge/rebase/cherry-pick conflictuel → exitCode != 0 mais état
    // légitime à reconstruire au rechargement). Une vraie erreur utilisateur
    // (exitCode != 0 sans opération en cours) n'est pas persistée.
    if (command.trim() !== '' && (result.exitCode === 0 || snap.operationState != null)) {
      savedCommands.value.push(command);
      saveHistory(savedCommands.value);
    }
    // Recalculer le snapshot après chaque commande
    snapshot.value = snap;
    return result;
  }

  /**
   * PHASE 5 : Exécute la todo list éditée par l'utilisateur depuis InteractiveRebaseModal.
   * Appelle directement la méthode moteur (sans passer par le parseur de commandes),
   * journalise le résultat et recalcule le snapshot réactif.
   */
  function executeRebaseTodo(todoList: TodoItem[]): CommandResult {
    const result = engine.value.executeRebaseInteractive(todoList);
    log.value.push({ id: nextId++, command: '(interactive rebase todo submitted)', result });
    snapshot.value = engine.value.snapshot();
    return result;
  }

  /** Réinitialise le dépôt (nouveau moteur). Vide aussi savedCommands. */
  function reset(): void {
    engine.value = new GitEngine();
    log.value = [];
    history.value = [];
    savedCommands.value = [];
    snapshot.value = engine.value.snapshot();
  }

  /**
   * PHASE 6 : Charge et rejoue l'historique depuis localStorage.
   *
   * - Lit l'historique persisté via loadHistory().
   * - Rejoue chaque commande via engine.execute() (silencieux : pas d'echo terminal).
   * - S'arrête au premier échec réel (exitCode !== 0 SANS opération en cours) ;
   *   un état conflictuel légitime (merge/rebase en cours) ne stoppe pas le rejeu.
   * - Alimente savedCommands avec les commandes rejouées.
   * - Recalcule le snapshot après le rejeu.
   */
  function loadFromStorage(): void {
    const commands = loadHistory();
    if (commands === null) return;

    const newEngine = new GitEngine();
    const replayed: string[] = [];

    for (const cmd of commands) {
      const result = newEngine.execute(cmd);
      if (result.exitCode !== 0 && newEngine.snapshot().operationState == null) {
        // Échec réel (pas un conflit en cours) → arrêt du rejeu
        break;
      }
      replayed.push(cmd);
    }

    // Remplacer le moteur et reconstruire l'état réactif
    engine.value = newEngine;
    savedCommands.value = replayed;
    log.value = [];
    history.value = [];
    nextId = 0;
    snapshot.value = engine.value.snapshot();
  }

  /**
   * PHASE 6 : Purge localStorage + réinitialise le moteur.
   */
  function resetStorage(): void {
    clearHistory();
    reset();
  }

  /**
   * PHASE 6 : Exécute un scénario pédagogique.
   *
   * Réinitialise le moteur (et purge le storage de la session précédente), puis
   * rejoue toutes les commandes du scénario dans l'ordre. Ne s'arrête pas sur un
   * exitCode != 0 (les séquences de scénarios sont curées et certaines étapes
   * provoquent volontairement un état non-zéro, ex: merge conflictuel avant
   * résolution). La séquence rejouée est persistée pour qu'un rechargement de page
   * reproduise le scénario (et non l'ancienne session).
   */
  function executeScenario(id: string): void {
    const scenario = getScenarioById(id);
    if (!scenario) {
      console.error(`executeScenario: scénario introuvable — id="${id}"`);
      return;
    }

    // reset() vide savedCommands ; on purge aussi le storage pour éviter qu'une
    // ancienne session ne réapparaisse au prochain rechargement.
    clearHistory();
    reset();

    const replayed: string[] = [];
    for (const cmd of scenario.commands) {
      const result = engine.value.execute(cmd);
      const op = engine.value.snapshot().operationState;
      if (result.exitCode !== 0 && op == null) {
        console.warn(`executeScenario [${id}]: commande échouée — "${cmd}"`, result.errors);
      } else {
        // Persistable : réussite ou opération en cours (conflit volontaire)
        replayed.push(cmd);
      }
      // On journalise dans le log (pas dans history)
      log.value.push({ id: nextId++, command: cmd, result });
    }

    savedCommands.value = replayed;
    saveHistory(replayed);
    snapshot.value = engine.value.snapshot();
  }

  /**
   * PHASE 6 : Retourne le catalogue de commandes depuis le moteur.
   * Utilisé par TerminalPanel pour l'autocomplétion Tab sans accéder au moteur directement.
   */
  function getCatalog(): CommandCatalog {
    return engine.value.getCatalog();
  }

  // `engine` reste privé au store : les composants passent par execute()/snapshot()
  // pour que journal et snapshot restent cohérents.
  return {
    log,
    history,
    snapshot,
    savedCommands,
    execute,
    executeRebaseTodo,
    reset,
    loadFromStorage,
    resetStorage,
    executeScenario,
    getCatalog,
  };
});
