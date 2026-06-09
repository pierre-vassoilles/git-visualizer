/**
 * git help [<commande>]
 *
 * Affiche l'aide générale (liste des commandes par catégorie)
 * ou l'aide détaillée d'une commande spécifique.
 *
 * Fonctionne même si le dépôt n'est pas initialisé.
 */

import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { COMMAND_CATALOG } from '../catalog';

// ---------------------------------------------------------------------------
// Aide générale
// ---------------------------------------------------------------------------

/**
 * Construit la sortie de l'aide générale (groupée par catégorie).
 * Conforme au format exact de la spec 28 §Cas 1.
 */
function buildGeneralHelp(): string[] {
  const lines: string[] = [];

  lines.push('usage: git [--help] [<commande>]');
  lines.push('');

  for (const [category, commands] of Object.entries(COMMAND_CATALOG.commands)) {
    lines.push(category);
    for (const cmd of commands) {
      // Aligner les descriptions sur la colonne 16 (nom max = "cherry-pick" = 11 + 2 espaces)
      const namePadded = ('  ' + cmd.name).padEnd(16);
      lines.push(`${namePadded}${cmd.description}`);
    }
    lines.push('');
  }

  // Supprimer la dernière ligne vide avant le pied
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  lines.push('');
  lines.push("Use 'git help <command>' for more information.");

  return lines;
}

// ---------------------------------------------------------------------------
// Aide détaillée
// ---------------------------------------------------------------------------

/**
 * Construit la sortie de l'aide détaillée pour une commande connue.
 * Conforme au format de la spec 28 §Cas 2.
 */
function buildDetailedHelp(name: string): string[] {
  const meta = COMMAND_CATALOG.lookup[name];
  if (!meta) return [];

  const lines: string[] = [];

  // NAME
  lines.push('NAME');
  lines.push(`  git ${meta.name} - ${meta.description}`);
  lines.push('');

  // SYNOPSIS
  lines.push('SYNOPSIS');
  for (const synLine of meta.synopsis.split('\n')) {
    lines.push(`  ${synLine}`);
  }
  lines.push('');

  // DESCRIPTION
  lines.push('DESCRIPTION');
  lines.push(`  ${meta.longDescription}`);
  lines.push('');

  // OPTIONS
  lines.push('OPTIONS');
  if (meta.flags.length === 0) {
    lines.push('  (aucune option)');
  } else {
    for (const flag of meta.flags) {
      const hasArg = flag.hasArgument ? ' <valeur>' : '';
      const namePadded = (`  ${flag.name}${hasArg}`).padEnd(26);
      lines.push(`${namePadded}${flag.description}`);
    }
  }
  lines.push('');

  // EXAMPLES
  lines.push('EXAMPLES');
  for (const ex of meta.examples) {
    lines.push(`  ${ex}`);
  }
  lines.push('');

  // EXIT CODES
  lines.push('EXIT CODES');
  lines.push('  0  Succès');
  lines.push('  1  Erreur (argument invalide, état inattendu)');
  lines.push('  128  Dépôt non initialisé (si applicable)');

  return lines;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

/**
 * Implémente `git help [<commande>]`.
 *
 * - Aucun argument → aide générale (exitCode 0).
 * - Un argument connu → aide détaillée (exitCode 0).
 * - Un argument inconnu → fail (exitCode 1, message "is not a git command").
 *
 * Fonctionne sans dépôt initialisé.
 */
export function cmdHelp(_repo: Repository, args: string[]): CommandResult {
  // Filtrer les flags vides ou "--help" résiduels
  const filtered = args.filter((a) => a !== '--help' && a.trim() !== '');

  if (filtered.length === 0) {
    return ok(buildGeneralHelp());
  }

  const commandName = filtered[0]!;
  if (!(commandName in COMMAND_CATALOG.lookup)) {
    return fail([`git: '${commandName}' is not a git command. See 'git --help'.`], 1);
  }

  return ok(buildDetailedHelp(commandName));
}
