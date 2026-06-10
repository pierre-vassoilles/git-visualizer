/**
 * Export / import de session (spec 58).
 *
 * Module PUR (pas d'import Vue) : sérialise une session (liste de commandes
 * réussies + métadonnées) en JSON téléchargeable, et valide/parse un JSON importé.
 * Le rejeu reste déterministe (assuré par le moteur) ; ce module ne fait que le
 * transport. Format versionné, cohérent avec `storage.ts` (1.0).
 */

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export interface ExportedSessionMetadata {
  /** Date d'export (Date.now()). */
  exportDate: number;
  /** Chaîne fixe pour le debug / la provenance. */
  exportUrl: string;
  /** Longueur de `commands` (redondant, pour contrôle d'intégrité). */
  commandCount: number;
  /** Description optionnelle saisie par l'utilisateur. */
  description?: string;
}

export interface ExportedSession {
  /** Version du format (ex: "1.0"). */
  version: string;
  metadata: ExportedSessionMetadata;
  /** Liste des commandes réussies (chaînes brutes, telles que tapées). */
  commands: string[];
}

/** Résultat de validation : succès (session) ou échec (message utilisateur). */
export type ValidationResult =
  | { ok: true; session: ExportedSession }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const EXPORT_VERSION = '1.0';
const SUPPORTED_MAJOR = '1';
const EXPORT_URL = 'git-visualizer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMajorVersion(version: string): string {
  return version.split('.')[0] ?? '';
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Construit l'objet session à exporter. `exportDate` est injecté par l'appelant
 * (pas de `Date.now()` ici → testable et déterministe à date fixée).
 */
export function buildExportedSession(
  commands: string[],
  exportDate: number,
  description?: string,
): ExportedSession {
  const metadata: ExportedSessionMetadata = {
    exportDate,
    exportUrl: EXPORT_URL,
    commandCount: commands.length,
  };
  if (description !== undefined && description.trim() !== '') {
    metadata.description = description;
  }
  return { version: EXPORT_VERSION, metadata, commands: [...commands] };
}

/** Sérialise une session en JSON lisible (indenté). */
export function serializeExportedSession(session: ExportedSession): string {
  return JSON.stringify(session, null, 2);
}

/** Nom de fichier d'export : `git-visualizer-<timestamp>.json`. */
export function exportFilename(exportDate: number): string {
  return `git-visualizer-${exportDate}.json`;
}

// ---------------------------------------------------------------------------
// Import / validation
// ---------------------------------------------------------------------------

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/**
 * Valide une donnée déjà parsée comme `ExportedSession`. Renvoie un message
 * d'erreur utilisateur (façon spec 58) en cas d'échec.
 */
export function validateExportedSession(data: unknown): ValidationResult {
  if (typeof data !== 'object' || data === null) {
    return {
      ok: false,
      error:
        "Le fichier n'a pas le bon format. Assurez-vous qu'il a été exporté par Git Visualizer.",
    };
  }
  const obj = data as Record<string, unknown>;

  // Schéma de base : version (string), metadata (objet), commands (string[]).
  if (
    typeof obj.version !== 'string' ||
    typeof obj.metadata !== 'object' ||
    obj.metadata === null ||
    !isStringArray(obj.commands)
  ) {
    return {
      ok: false,
      error:
        "Le fichier n'a pas le bon format. Assurez-vous qu'il a été exporté par Git Visualizer.",
    };
  }

  const meta = obj.metadata as Record<string, unknown>;
  if (
    typeof meta.exportDate !== 'number' ||
    typeof meta.exportUrl !== 'string' ||
    typeof meta.commandCount !== 'number'
  ) {
    return {
      ok: false,
      error:
        "Le fichier n'a pas le bon format. Assurez-vous qu'il a été exporté par Git Visualizer.",
    };
  }

  // Version majeure incompatible (vérifiée après le schéma de base pour que
  // version soit bien une string).
  if (getMajorVersion(obj.version) !== SUPPORTED_MAJOR) {
    return {
      ok: false,
      error: `Version du fichier incompatible (${obj.version} non supportée). Veuillez mettre à jour l'application.`,
    };
  }

  // Intégrité : le compteur doit correspondre au nombre réel de commandes.
  if (meta.commandCount !== (obj.commands as string[]).length) {
    return {
      ok: false,
      error: 'Intégrité du fichier compromise (nombre de commandes incohérent).',
    };
  }

  const description = typeof meta.description === 'string' ? meta.description : undefined;
  const session: ExportedSession = {
    version: obj.version,
    metadata: {
      exportDate: meta.exportDate,
      exportUrl: meta.exportUrl,
      commandCount: meta.commandCount,
      ...(description !== undefined ? { description } : {}),
    },
    commands: obj.commands as string[],
  };
  return { ok: true, session };
}

/**
 * Parse + valide un texte JSON. Le JSON mal formé est rejeté avec un message
 * dédié (≠ schéma invalide), conformément à la spec.
 */
export function parseExportedSession(text: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Le fichier est corrompu (JSON invalide).' };
  }
  return validateExportedSession(parsed);
}
