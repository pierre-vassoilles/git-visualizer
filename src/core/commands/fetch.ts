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

  // RMT-08 : flags (whitelist). --all boucle sur tous les remotes ; tout autre
  // flag inconnu est rejeté (plus de « No remote named '--all' »).
  const all = args.includes('--all');
  const KNOWN_FETCH_FLAGS = new Set(['--all']);
  const unknownFlag = args.find((a) => a.startsWith('-') && !KNOWN_FETCH_FLAGS.has(a));
  if (unknownFlag) {
    return fail([`error: unknown option '${unknownFlag.replace(/^-+/, '')}'`], 129);
  }
  const positional = args.filter((a) => !a.startsWith('-'));

  if (all) {
    const output: string[] = [];
    for (const name of Object.keys(repo.remotes)) {
      const res = fetchOne(repo, name, null);
      if (res.exitCode !== 0) return res;
      output.push(...res.output);
    }
    return ok(output);
  }

  const remoteName = positional[0] ?? 'origin';
  const branchFilter = positional[1] ?? null;
  return fetchOne(repo, remoteName, branchFilter);
}

/**
 * Récupère un seul remote (toutes ses branches, ou `branchFilter` si fourni).
 * RMT-07 : un fetch sans nouveauté n'affiche RIEN (pas « Already up to date. »).
 */
function fetchOne(
  repo: Repository,
  remoteName: string,
  branchFilter: string | null,
): CommandResult {
  const remote = repo.remotes![remoteName];
  if (!remote) {
    return fail([`fatal: No remote named '${remoteName}'`], 128);
  }

  if (branchFilter !== null && !remote.refs.heads[branchFilter]) {
    return fail([`fatal: Couldn't find remote ref ${branchFilter}`], 128);
  }

  if (!repo.refs.remotes![remoteName]) {
    repo.refs.remotes![remoteName] = {};
  }

  const trackingRefs = repo.refs.remotes![remoteName]!;
  const output: string[] = [];
  let anyUpdated = false;

  const branchesToFetch = branchFilter ? [branchFilter] : Object.keys(remote.refs.heads).sort();

  for (const branch of branchesToFetch) {
    const newHash = remote.refs.heads[branch];
    if (!newHash) continue;

    const oldHash = trackingRefs[branch] ?? null;
    copyMissingObjects(remote.objects, repo.objects, newHash);

    const isNew = !oldHash;
    const changed = oldHash !== newHash;
    trackingRefs[branch] = newHash;

    if (isNew) {
      output.push(` * [new branch]      ${branch.padEnd(16)} -> ${remoteName}/${branch}`);
      anyUpdated = true;
    } else if (changed) {
      output.push(
        ` ${shortHash(oldHash)}..${shortHash(newHash)}  ${branch.padEnd(16)} -> ${remoteName}/${branch}`,
      );
      anyUpdated = true;
    }
  }

  if (anyUpdated) {
    output.unshift(`From ${remote.url}`);
  }
  // RMT-07 : rien à dire si aucune mise à jour.
  return ok(output);
}
