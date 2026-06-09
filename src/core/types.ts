/**
 * Types partagés du moteur Git.
 *
 * En phase 0 le moteur est un stub : il ne fait qu'écho. Les types ci-dessous
 * définissent le contrat entre le moteur (`core/`) et l'UI (store + composants)
 * et seront étoffés dès la phase 1 (objets, refs, index, working tree).
 */

/** Résultat de l'exécution d'une commande par le moteur. */
export interface CommandResult {
  /** Lignes à afficher dans le terminal (stdout). */
  readonly output: string[];
  /** Lignes d'erreur (stderr) — affichées en rouge dans le terminal. */
  readonly errors: string[];
  /** Code de sortie façon shell (0 = succès). */
  readonly exitCode: number;
}

/** Fabrique un résultat de succès. */
export function ok(output: string[] = []): CommandResult {
  return { output, errors: [], exitCode: 0 };
}

/** Fabrique un résultat d'erreur. */
export function fail(errors: string[], exitCode = 1): CommandResult {
  return { output: [], errors, exitCode };
}
