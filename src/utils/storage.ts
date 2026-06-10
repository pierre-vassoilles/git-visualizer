/**
 * Persistance localStorage pour l'historique de commandes.
 *
 * Module pur (pas d'import Vue) : stocke / lit / purge la liste des commandes
 * réussies pour permettre le rejeu déterministe au démarrage.
 *
 * Clé : "git-visualizer:history"
 * Version actuelle : "1.0"
 */

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export interface StoredHistory {
  /** Version du format (ex: "1.0"). */
  version: string;
  /** Liste des commandes réussies (chaînes brutes, avec préfixe "git "). */
  commands: string[];
  /** Timestamp de la dernière sauvegarde (Date.now()). */
  lastSaved: number;
  /**
   * PHASE B3 (spec 60) : position courante de l'undo/redo applicatif (nombre de
   * commandes appliquées). Optionnel (absent des sessions sauvegardées avant
   * l'undo/redo → traité comme « tout appliqué » au chargement).
   */
  currentIndex?: number;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'git-visualizer:history';
const SUPPORTED_MAJOR = '1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMajorVersion(version: string): string {
  return version.split('.')[0] ?? '';
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Charge l'historique depuis localStorage.
 *
 * Retourne `null` si :
 * - la clé est absente,
 * - le JSON est invalide (corrompu),
 * - la version majeure est incompatible,
 * - le format ne respecte pas le schéma attendu.
 *
 * En cas de corruption / incompatibilité, la clé est purgée automatiquement.
 */
export function loadHistory(): string[] | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // JSON invalide → purge
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }

  // Validation du schéma
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).version !== 'string' ||
    !Array.isArray((parsed as Record<string, unknown>).commands)
  ) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }

  const data = parsed as StoredHistory;

  // Validation de la version majeure
  if (getMajorVersion(data.version) !== SUPPORTED_MAJOR) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }

  // Validation du contenu du tableau
  if (!data.commands.every((c) => typeof c === 'string')) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }

  return data.commands;
}

/**
 * Sauvegarde l'historique dans localStorage.
 *
 * @param commands - Liste des commandes réussies à persister.
 */
export function saveHistory(commands: string[], currentIndex?: number): void {
  const data: StoredHistory = {
    version: '1.0',
    commands,
    lastSaved: Date.now(),
    ...(currentIndex !== undefined ? { currentIndex } : {}),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota dépassé ou accès refusé → ignore silencieusement
  }
}

/**
 * PHASE B3 (spec 60) : lit la position undo/redo persistée (`currentIndex`).
 * Retourne `null` si absente, invalide, ou si la clé/JSON n'est pas exploitable.
 * Ne purge pas (loadHistory gère déjà la corruption).
 */
export function loadCurrentIndex(): number | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).currentIndex === 'number'
    ) {
      return (parsed as StoredHistory).currentIndex!;
    }
  } catch {
    // JSON invalide → null (loadHistory purgera)
  }
  return null;
}

/**
 * Supprime l'entrée localStorage (reset).
 */
export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// PHASE B2 (spec 62, C4) : persistance de la progression d'un tutoriel
// ---------------------------------------------------------------------------

const TUTORIAL_KEY = 'git-visualizer:tutorial';

export interface StoredTutorialProgress {
  tutorialId: string;
  currentStepIndex: number;
}

/** Persiste la progression du tutoriel en cours. */
export function saveTutorialProgress(progress: StoredTutorialProgress): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, JSON.stringify(progress));
  } catch {
    // Quota / accès refusé → ignore
  }
}

/** Charge la progression persistée (ou null si absente/invalide). */
export function loadTutorialProgress(): StoredTutorialProgress | null {
  const raw = localStorage.getItem(TUTORIAL_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).tutorialId === 'string' &&
      typeof (parsed as Record<string, unknown>).currentStepIndex === 'number'
    ) {
      return parsed as StoredTutorialProgress;
    }
  } catch {
    // JSON invalide → null
  }
  localStorage.removeItem(TUTORIAL_KEY);
  return null;
}

/** Purge la progression de tutoriel. */
export function clearTutorialProgress(): void {
  localStorage.removeItem(TUTORIAL_KEY);
}
