import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  addReflogEntryForHead,
  buildTreeFromIndex,
  createCommit,
  createCommitWithParents,
  currentBranch,
  headCommit,
  headCommitHash,
  isInitialized,
} from '../repository';
import { shortHash } from '../sha1';
import { notARepo } from './init';

/**
 * git commit -m <message>
 *
 * Si un merge ou cherry-pick est en cours, crée un commit avec les bons parents.
 */
export function cmdCommit(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // Cas spécial : merge en cours → finaliser le merge
  if (repo.merging) {
    return finalizeMergeCommit(repo, args);
  }

  // Cas spécial : cherry-pick en cours → créer le commit cherry-pick
  if (repo.cherryPicking) {
    return finalizeCherryPickCommit(repo, args);
  }

  // Chercher le flag -m
  const mIndex = args.indexOf('-m');

  // En cas de revert en cours, le message peut être optionnel (utiliser le message par défaut)
  let message: string;
  if (mIndex === -1) {
    if (repo.reverting) {
      message = repo.reverting.defaultMessage;
    } else {
      return fail(["fatal: option '-m' is required"]);
    }
  } else {
    const rawMessage = args[mIndex + 1];
    if (rawMessage === undefined || rawMessage === '') {
      return fail(['fatal: message cannot be empty']);
    }
    message = rawMessage;
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

  const headHashBeforeCommit = headCommitHash(repo) ?? '';
  const commitHash = createCommit(repo, { message });
  const short = shortHash(commitHash);

  // Reflog
  addReflogEntryForHead(repo, {
    oldHash: headHashBeforeCommit,
    newHash: commitHash,
    action: 'commit',
    description: message.split('\n')[0] ?? message,
  });

  // Nettoyer l'état de revert si présent
  if (repo.reverting) {
    delete repo.reverting;
  }

  const rootLabel = isRoot ? ` (root-commit)` : '';
  const headline = `[${branch}${rootLabel} ${short}] ${message}`;

  return ok([headline]);
}

/**
 * Finalise un merge en cours en créant un commit à 2 parents.
 */
function finalizeMergeCommit(repo: Repository, args: string[]): CommandResult {
  const mergingState = repo.merging!;

  // Chercher le flag -m (optionnel pour le merge commit)
  const mIndex = args.indexOf('-m');
  let message: string;
  if (mIndex !== -1 && args[mIndex + 1]) {
    message = args[mIndex + 1]!;
  } else {
    message = `Merge branch '${mergingState.branchName}'`;
  }

  const headHash = headCommitHash(repo);
  if (!headHash) {
    return fail(['fatal: no HEAD commit to merge from']);
  }

  // Construire le tree depuis l'index courant
  const treeHash = buildTreeFromIndex(repo, repo.index);

  // Créer le commit de fusion avec 2 parents
  const mergeCommitHash = createCommitWithParents(repo, {
    message,
    treeHash,
    parents: mergingState.mergeParents,
  });

  addReflogEntryForHead(repo, {
    oldHash: headHash,
    newHash: mergeCommitHash,
    action: 'merge',
    description: message,
  });

  // Nettoyer l'état de merge
  delete repo.merging;

  const branch = currentBranch(repo) ?? 'HEAD';
  const short = shortHash(mergeCommitHash);
  return ok([`[${branch} ${short}] ${message}`]);
}

/**
 * Finalise un cherry-pick en cours.
 */
function finalizeCherryPickCommit(repo: Repository, args: string[]): CommandResult {
  const pickState = repo.cherryPicking!;

  // Message : flag -m si donné, sinon message original du commit cherry-pické
  const mIndex = args.indexOf('-m');
  let message: string;
  if (mIndex !== -1 && args[mIndex + 1]) {
    message = args[mIndex + 1]!;
  } else {
    message = pickState.originalMessage;
  }

  const headHash = headCommitHash(repo);
  if (!headHash) {
    return fail(['fatal: no HEAD commit']);
  }

  const treeHash = buildTreeFromIndex(repo, repo.index);

  const commitHash = createCommitWithParents(repo, {
    message,
    treeHash,
    parents: [headHash],
  });

  addReflogEntryForHead(repo, {
    oldHash: headHash,
    newHash: commitHash,
    action: 'cherry-pick',
    description: message.split('\n')[0] ?? message,
  });

  delete repo.cherryPicking;

  const branch = currentBranch(repo) ?? 'HEAD';
  const short = shortHash(commitHash);
  return ok([`[${branch} ${short}] ${message}`]);
}
