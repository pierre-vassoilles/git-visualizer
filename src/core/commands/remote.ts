/**
 * git remote — gestion des dépôts distants.
 *
 * Sous-commandes :
 *   git remote                       — lister les noms
 *   git remote -v                    — lister avec URLs
 *   git remote add <name> <url>      — ajouter un remote
 *   git remote remove <name>         — supprimer un remote
 *   git remote rm <name>             — alias de remove
 */

import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { isInitialized } from '../repository';
import { validateRemoteName } from '../repository';
import { notARepo } from './init';

export function cmdRemote(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) {
    return notARepo();
  }

  // Initialiser les champs Phase 7 s'ils sont absents (rétro-compat)
  if (!repo.remotes) repo.remotes = {};
  if (!repo.refs.remotes) repo.refs.remotes = {};
  if (!repo.branchUpstream) repo.branchUpstream = {};

  const sub = args[0];

  // git remote (sans argument) ou git remote list
  if (!sub || sub === 'list') {
    const names = Object.keys(repo.remotes).sort();
    return ok(names);
  }

  // git remote -v
  if (sub === '-v') {
    const names = Object.keys(repo.remotes).sort();
    if (names.length === 0) return ok([]);
    const lines: string[] = [];
    for (const name of names) {
      const remote = repo.remotes[name]!;
      lines.push(`${name}\t${remote.url} (fetch)`);
      lines.push(`${name}\t${remote.url} (push)`);
    }
    return ok(lines);
  }

  // git remote add <name> <url>
  if (sub === 'add') {
    const name = args[1];
    const url = args[2];

    if (!name) {
      return fail(['error: remote name is required'], 128);
    }
    if (!url) {
      return fail(['error: remote URL is required'], 128);
    }

    if (!validateRemoteName(name)) {
      return fail(
        [
          `fatal: '${name}' is not a valid remote name. Check the 'name' variable in config (does not match '[a-zA-Z0-9._/-]*').`,
        ],
        128,
      );
    }

    if (repo.remotes[name]) {
      return fail([`fatal: remote ${name} already exists.`], 128);
    }

    // Créer un RemoteRepository bare vide
    repo.remotes[name] = {
      url,
      objects: {},
      refs: { heads: {} },
      head: { symbolic: true, target: 'refs/heads/main' },
    };
    repo.refs.remotes![name] = {};

    return ok([]);
  }

  // git remote remove <name> ou git remote rm <name>
  if (sub === 'remove' || sub === 'rm') {
    const name = args[1];

    if (!name) {
      return fail(['error: remote name is required'], 128);
    }

    if (!repo.remotes[name]) {
      return fail([`fatal: No such remote: '${name}'`], 128);
    }

    // Supprimer le remote
    delete repo.remotes[name];

    // Supprimer les refs de suivi
    if (repo.refs.remotes) {
      delete repo.refs.remotes[name];
    }

    // Supprimer les upstreams pointant ce remote
    if (repo.branchUpstream) {
      for (const branch of Object.keys(repo.branchUpstream)) {
        if (repo.branchUpstream[branch]?.remote === name) {
          delete repo.branchUpstream[branch];
        }
      }
    }

    return ok([]);
  }

  return fail([`error: Unknown subcommand: ${sub}`], 1);
}
