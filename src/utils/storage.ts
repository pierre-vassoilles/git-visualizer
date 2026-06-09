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
  if (!data.commands.every(c => typeof c === 'string')) {
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
export function saveHistory(commands: string[]): void {
  const data: StoredHistory = {
    version: '1.0',
    commands,
    lastSaved: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota dépassé ou accès refusé → ignore silencieusement
  }
}

/**
 * Supprime l'entrée localStorage (reset).
 */
export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
