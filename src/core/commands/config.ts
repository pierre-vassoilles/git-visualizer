import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { defaultConfig } from '../repository';

/**
 * git config [--list] [<key>] [<value>]  (spec 45)
 *
 * - `--list`            : affiche toutes les clés (ordre alphabétique).
 * - `<key>`             : lit la valeur (exit 1 si absente, sans message).
 * - `<key> <value>`     : écrit la valeur (exit 0, aucune sortie).
 *
 * Pas de validation des clés (toute clé est acceptée à l'écriture). Les clés
 * `user.name`/`user.email` impactent l'auteur des commits (donc le hash). La
 * config n'est jamais persistée telle quelle : le rejeu déterministe des
 * commandes `git config` reconstruit le même état (mêmes hashes).
 */
export function cmdConfig(repo: Repository, args: string[]): CommandResult {
  // `git config` fonctionne même sans `git init` (la config existe toujours).
  if (!repo.config) repo.config = defaultConfig();

  if (args.length === 0) {
    return fail(
      ['fatal: missing key for config set operation. usage: git config <key> [<value>]'],
      128,
    );
  }

  if (args[0] === '--list' || args[0] === '-l') {
    const lines = Object.keys(repo.config)
      .sort()
      .map((k) => `${k}=${repo.config![k]}`);
    return ok(lines);
  }

  const key = args[0]!;
  const value = args[1];

  // CNT-13 : une clé sans section (pas de `.`) est invalide (git : exit 1 en
  // lecture, exit 2 en écriture).
  if (!key.includes('.')) {
    return fail([`error: key does not contain a section: ${key}`], value === undefined ? 1 : 2);
  }

  if (value === undefined) {
    // Lecture
    const v = repo.config[key];
    if (v === undefined) {
      // Clé absente : exit 1, sans sortie ni erreur (simplification vs git réel).
      return { output: [], errors: [], exitCode: 1 };
    }
    return ok([v]);
  }

  // Écriture (toute clé acceptée)
  repo.config[key] = value;
  return ok();
}
