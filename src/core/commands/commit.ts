import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  buildTreeFromIndex,
  createCommit,
  currentBranch,
  headCommit,
  isInitialized,
} from '../repository';
import { shortHash } from '../sha1';
import { notARepo } from './init';

/**
 * git commit -m <message>
 */
export function cmdCommit(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // Chercher le flag -m
  const mIndex = args.indexOf('-m');
  if (mIndex === -1) {
    return fail(["fatal: option '-m' is required"]);
  }

  const message = args[mIndex + 1];
  if (message === undefined || message === '') {
    return fail(['fatal: message cannot be empty']);
  }

  // Vérifier qu'il y a bien quelque chose à committer : l'index (snapshot
  // complet) doit différer de l'arbre de HEAD. Sans HEAD (premier commit),
  // il suffit que l'index soit non vide.
  const head = headCommit(repo);
  const hasStagedChanges = head
    ? buildTreeFromIndex(repo, repo.index) !== head.tree
    : Object.keys(repo.index).length > 0;
  if (!hasStagedChanges) {
    return fail(['fatal: no changes added to commit']);
  }

  const branch = currentBranch(repo) ?? 'HEAD';
  const isRoot = !repo.refs.heads[branch];

  const commitHash = createCommit(repo, { message });
  const short = shortHash(commitHash);

  const rootLabel = isRoot ? ` (root-commit)` : '';
  const headline = `[${branch}${rootLabel} ${short}] ${message}`;

  return ok([headline]);
}
