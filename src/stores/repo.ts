import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { GitEngine } from '@/core/engine';
import type { CommandCatalog } from '@/core/catalog';
import type { CommandResult } from '@/core/types';
import type { RepoSnapshot } from '@/core/engine';
import type { TodoItem } from '@/core/model';
import { loadHistory, saveHistory, clearHistory } from '@/utils/storage';
import { buildExportedSession, type ExportedSession } from '@/utils/export-import';
import { getScenarioById } from '@/constants/scenarios';
import { parseConflictContent, buildResolvedContent } from '@/core/repository';
import { getTutorialById } from '@/constants/tutorials';
import type { Tutorial, TutorialStep } from '@/core/tutorial-helpers';

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
   * PHASE B3 (spec 58) : Construit l'objet session exportable depuis les commandes
   * réussies. La date est injectée ici (`Date.now()`) ; la sérialisation et le
   * téléchargement (Blob + ancre) sont du ressort de l'UI.
   */
  function exportSession(description?: string): ExportedSession {
    return buildExportedSession(savedCommands.value, Date.now(), description);
  }

  /** Résultat d'un import : nombre de commandes rejouées + rejeu partiel éventuel. */
  interface ImportResult {
    replayed: number;
    /** true si le rejeu s'est arrêté avant la fin (commande en échec réel). */
    partial: boolean;
    /** Position 1-based de la commande fautive (si partial). */
    errorIndex?: number;
  }

  /**
   * PHASE B3 (spec 58) : Restaure une session déjà validée (cf. parseExportedSession).
   *
   * Miroir de `loadFromStorage` : reset propre puis rejeu déterministe dans un
   * nouveau moteur, arrêt au premier échec RÉEL (exitCode != 0 SANS opération en
   * cours — un conflit merge/rebase légitime ne stoppe pas). La session rejouée est
   * persistée dans localStorage (un rechargement reproduit l'import).
   */
  function importSession(session: ExportedSession): ImportResult {
    const newEngine = new GitEngine();
    const replayed: string[] = [];
    let partial = false;
    let errorIndex: number | undefined;

    for (let i = 0; i < session.commands.length; i++) {
      const cmd = session.commands[i]!;
      const result = newEngine.execute(cmd);
      if (result.exitCode !== 0 && newEngine.snapshot().operationState == null) {
        partial = true;
        errorIndex = i + 1; // 1-based pour le message utilisateur
        break;
      }
      replayed.push(cmd);
    }

    // Reconstruire l'état réactif et persister la session importée.
    engine.value = newEngine;
    savedCommands.value = replayed;
    saveHistory(replayed);
    log.value = [];
    history.value = [];
    nextId = 0;
    snapshot.value = engine.value.snapshot();

    return {
      replayed: replayed.length,
      partial,
      ...(errorIndex !== undefined ? { errorIndex } : {}),
    };
  }

  /**
   * PHASE 6 : Retourne le catalogue de commandes depuis le moteur.
   * Utilisé par TerminalPanel pour l'autocomplétion Tab sans accéder au moteur directement.
   */
  function getCatalog(): CommandCatalog {
    return engine.value.getCatalog();
  }

  /** PHASE B2 : Lit le contenu brut d'un fichier (pour l'éditeur de conflits). */
  function readFile(path: string): string | null {
    return engine.value.readFile(path);
  }

  // -------------------------------------------------------------------------
  // PHASE B2 : Tutoriels guidés (spec 51)
  // -------------------------------------------------------------------------

  interface TutorialProgress {
    tutorialId: string;
    currentStepIndex: number; // peut valoir steps.length → tutoriel terminé
    completedSteps: string[];
    skippedSteps: string[];
    hintUsed: boolean;
    hintsUsedCount: number;
  }

  const tutorialProgress = ref<TutorialProgress | null>(null);

  const currentTutorial = computed<Tutorial | null>(() =>
    tutorialProgress.value ? getTutorialById(tutorialProgress.value.tutorialId) : null,
  );

  const currentStep = computed<TutorialStep | null>(() => {
    const t = currentTutorial.value;
    const p = tutorialProgress.value;
    if (!t || !p) return null;
    return t.steps[p.currentStepIndex] ?? null;
  });

  const tutorialCompleted = computed(
    () =>
      tutorialProgress.value !== null &&
      currentTutorial.value !== null &&
      tutorialProgress.value.currentStepIndex >= currentTutorial.value.steps.length,
  );

  /** Objectifs de l'étape courante évalués contre le snapshot (passed booléen). */
  const tutorialObjectives = computed(() => {
    const step = currentStep.value;
    if (!step) return [] as Array<{ description: string; passed: boolean }>;
    return step.objectives.map((o) => {
      let passed = false;
      try {
        passed = o.validate(snapshot.value);
      } catch {
        // Spec : un prédicat qui lance est traité comme non atteint.
        passed = false;
      }
      return { description: o.description, passed };
    });
  });

  const currentStepComplete = computed(
    () => tutorialObjectives.value.length > 0 && tutorialObjectives.value.every((o) => o.passed),
  );

  function startTutorial(id: string): void {
    const t = getTutorialById(id);
    if (!t) return;
    // Dépôt neuf + purge de la session précédente (comme executeScenario).
    clearHistory();
    reset();
    tutorialProgress.value = {
      tutorialId: id,
      currentStepIndex: 0,
      completedSteps: [],
      skippedSteps: [],
      hintUsed: false,
      hintsUsedCount: 0,
    };
  }

  function nextStep(): void {
    const p = tutorialProgress.value;
    const t = currentTutorial.value;
    if (!p || !t) return;
    // Marquer l'étape courante complétée si ses objectifs sont atteints.
    const step = currentStep.value;
    if (step && currentStepComplete.value && !p.completedSteps.includes(step.id)) {
      p.completedSteps.push(step.id);
    }
    p.currentStepIndex++;
    p.hintUsed = false;
  }

  function previousStep(): void {
    const p = tutorialProgress.value;
    if (!p || p.currentStepIndex <= 0) return;
    p.currentStepIndex--;
    p.hintUsed = false;
  }

  function skipStep(): void {
    const p = tutorialProgress.value;
    const step = currentStep.value;
    if (!p || !step) return;
    if (!p.skippedSteps.includes(step.id)) p.skippedSteps.push(step.id);
    p.currentStepIndex++;
    p.hintUsed = false;
  }

  function useHint(): void {
    const p = tutorialProgress.value;
    if (!p || p.hintUsed) return;
    p.hintUsed = true;
    p.hintsUsedCount++;
  }

  function quitTutorial(): void {
    tutorialProgress.value = null;
  }

  /**
   * PHASE B2 : Parse les sections de conflit d'un fichier (délègue au helper pur
   * du core). Permet à la modale de rester sans import de logique core.
   */
  function getConflictSections(path: string) {
    const content = engine.value.readFile(path);
    return content ? parseConflictContent(content) : [];
  }

  /**
   * PHASE B2 : Résout un conflit sur un fichier via l'éditeur 3-way.
   *
   * Logique git PURE déléguée au core (parseConflictContent/buildResolvedContent) :
   * le store ne fait que l'orchestration (lire → résoudre → écrire → stager).
   *
   * @param filePath - Fichier en conflit.
   * @param choice - 'ours' | 'theirs' | 'both' | 'manual'.
   * @param manualContent - Contenu pour le choix 'manual'.
   */
  function resolveConflict(
    filePath: string,
    choice: 'ours' | 'theirs' | 'both' | 'manual',
    manualContent?: string,
  ): CommandResult {
    const content = engine.value.readFile(filePath);
    if (content === null) {
      return { output: [], errors: [`fichier introuvable: ${filePath}`], exitCode: 1 };
    }

    let resolved: string;
    if (choice === 'manual') {
      resolved = manualContent ?? '';
    } else {
      const sections = parseConflictContent(content);
      if (sections.length === 0) {
        // Pas de conflit détecté : conserver le contenu tel quel.
        resolved = content;
      } else {
        // Modèle « conflit pleine-page » : la 1re section couvre tout le fichier.
        const { ours, theirs } = sections[0]!;
        resolved = buildResolvedContent(ours, theirs, choice);
      }
    }

    // Écrire le contenu résolu directement (writeFile gère tout caractère, sans
    // passer par le parsing fragile de la commande `write`), puis stager.
    const writeResult = engine.value.writeFile(filePath, resolved);
    if (writeResult.exitCode !== 0) {
      snapshot.value = engine.value.snapshot();
      return writeResult;
    }
    return execute(`git add ${filePath}`);
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
    exportSession,
    importSession,
    getCatalog,
    readFile,
    getConflictSections,
    resolveConflict,
    // Tutoriels guidés
    tutorialProgress,
    currentTutorial,
    currentStep,
    tutorialCompleted,
    tutorialObjectives,
    currentStepComplete,
    startTutorial,
    nextStep,
    previousStep,
    skipStep,
    useHint,
    quitTutorial,
  };
});
