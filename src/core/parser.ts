/**
 * Parser de la ligne de commande.
 *
 * Gère :
 * - La tokenisation avec support des guillemets doubles
 *   (ex. `git commit -m "mon message"` → ["git", "commit", "-m", "mon message"])
 * - Le dispatch vers les handlers de commandes
 */

import { fail, ok, type CommandResult } from './types';
import type { Repository } from './model';
import { cmdInit } from './commands/init';
import { cmdAdd } from './commands/add';
import { cmdStatus } from './commands/status';
import { cmdCommit } from './commands/commit';
import { cmdLog } from './commands/log';
import { cmdWrite, cmdRead } from './commands/write';
import { cmdBranch } from './commands/branch';
import { cmdCheckout } from './commands/checkout';
import { cmdSwitch } from './commands/switch';
import { cmdRestore } from './commands/restore';
import { cmdTag } from './commands/tag';

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

/**
 * Tokenise une ligne de commande en respectant les guillemets doubles.
 *
 * Exemples :
 *   'git commit -m "hello world"' → ["git", "commit", "-m", "hello world"]
 *   'write README.md "# Title"'   → ["write", "README.md", "# Title"]
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  // Un token entre guillemets explicites doit être émis même s'il est vide
  // (ex. `git branch ""` → [..., ""] pour que la commande rejette le nom vide,
  // comme le vrai Git). On distingue donc "token vide quoté" de "pas de token".
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;

    if (ch === '"') {
      inQuotes = !inQuotes;
      quoted = true;
      // Les guillemets eux-mêmes ne sont pas inclus dans le token
      continue;
    }

    if (ch === ' ' && !inQuotes) {
      if (current.length > 0 || quoted) {
        tokens.push(current);
        current = '';
        quoted = false;
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0 || quoted) {
    tokens.push(current);
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function dispatch(repo: Repository, input: string): CommandResult {
  const line = input.trim();
  if (line === '') return ok();

  const tokens = tokenize(line);
  if (tokens.length === 0) return ok();

  const cmd = tokens[0]!;

  // Commandes utilitaires (non-git)
  if (cmd === 'write') {
    const filepath = tokens[1];
    if (!filepath) {
      return fail(['error: write requires a filepath']);
    }
    const content = tokens[2] ?? '';
    return cmdWrite(repo, filepath, content);
  }

  if (cmd === 'read') {
    const filepath = tokens[1];
    if (!filepath) {
      return fail(['error: read requires a filepath']);
    }
    return cmdRead(repo, filepath);
  }

  // Commandes git
  if (cmd !== 'git') {
    return fail([`command not found: ${cmd}`], 127);
  }

  const subcommand = tokens[1];
  if (!subcommand) {
    return ok(['usage: git <command> [<args>]']);
  }

  const rest = tokens.slice(2);

  switch (subcommand) {
    case 'init':
      return cmdInit(repo);

    case 'add':
      return cmdAdd(repo, rest);

    case 'status':
      return cmdStatus(repo, rest);

    case 'commit':
      return cmdCommit(repo, rest);

    case 'log':
      return cmdLog(repo, rest);

    case 'branch':
      return cmdBranch(repo, rest);

    case 'checkout':
      return cmdCheckout(repo, rest);

    case 'switch':
      return cmdSwitch(repo, rest);

    case 'restore':
      return cmdRestore(repo, rest);

    case 'tag':
      return cmdTag(repo, rest);

    default:
      return fail([`git: '${subcommand}' is not a git command. See 'git --help'.`]);
  }
}
