/**
 * git fetch [<remote>] [<branch>]
 *
 * Récupère les commits et références d'un dépôt distant.
 * Met à jour refs.remotes mais NE modifie JAMAIS refs.heads, HEAD, index, ni working tree.
 */

import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { isInitialized, copyMissingObjects } from '../repository';
import { notARepo } from './init';
import { shortHash } from '../sha1';

export function cmdFetch(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) {
    return notARepo();
  }

  // Initialiser les champs Phase 7 s'ils sont absents (rétro-compat)
  if (!repo.remotes) repo.remotes = {};
  if (!repo.refs.remotes) repo.refs.remotes = {};

  // Déterminer le nom du remote (défaut : origin)
  const remoteName = args[0] ?? 'origin';
  const branchFilter = args[1] ?? null;

  const remote = repo.remotes[remoteName];
  if (!remote) {
    return fail([`fatal: No remote named '${remoteName}'`], 128);
  }

  // Si branche spécifique demandée, vérifier qu'elle existe
  if (branchFilter !== null) {
    if (!remote.refs.heads[branchFilter]) {
      return fail([`fatal: Couldn't find remote ref ${branchFilter}`], 128);
    }
  }

  // Initialiser la map de suivi pour ce remote si absente
  if (!repo.refs.remotes![remoteName]) {
    repo.refs.remotes![remoteName] = {};
  }

  const trackingRefs = repo.refs.remotes![remoteName]!;
  const output: string[] = [];
  let anyUpdated = false;
  let alreadyUpToDate = true;

  // Déterminer les branches à traiter
  const branchesToFetch = branchFilter ? [branchFilter] : Object.keys(remote.refs.heads).sort();

  for (const branch of branchesToFetch) {
    const newHash = remote.refs.heads[branch];
    if (!newHash) continue;

    const oldHash = trackingRefs[branch] ?? null;

    // Copier les objets manquants
    copyMissingObjects(remote.objects, repo.objects, newHash);

    // Mettre à jour la ref de suivi
    const isNew = !oldHash;
    const changed = oldHash !== newHash;

    trackingRefs[branch] = newHash;

    if (isNew) {
      output.push(` * [new branch]      ${branch.padEnd(16)} -> ${remoteName}/${branch}`);
      anyUpdated = true;
      alreadyUpToDate = false;
    } else if (changed) {
      output.push(
        ` ${shortHash(oldHash)}..${shortHash(newHash)}  ${branch.padEnd(16)} -> ${remoteName}/${branch}`,
      );
      anyUpdated = true;
      alreadyUpToDate = false;
    }
  }

  if (anyUpdated) {
    // Insérer la ligne "From <url>" en tête
    output.unshift(`From ${remote.url}`);
  } else if (alreadyUpToDate) {
    output.push('Already up to date.');
  }

  return ok(output);
}
