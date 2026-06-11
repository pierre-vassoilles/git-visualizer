import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  addReflogEntryForHead,
  buildTreeFromIndex,
  createCommit,
  createCommitWithParents,
  currentBranch,
  hasConflictMarkers,
  headCommit,
  headCommitHash,
  isHeadDetached,
  isInitialized,
  storeBlob,
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

  // Cas spécial : --amend → réécrit le commit de tête (mêmes parents, nouvel
  // arbre/message), au lieu de créer un commit supplémentaire.
  if (args.includes('--amend')) {
    return amendCommit(repo, args);
  }

  // Parser les flags : -m/--message (avec sa valeur), -a/--all, et les formes
  // courtes combinées (-am, -ma). Les positionnels restants sont des pathspecs.
  let messageArg: string | undefined;
  let autoStage = false;
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '-m' || a === '--message') {
      messageArg = args[i + 1];
      i++;
    } else if (a === '-a' || a === '--all') {
      autoStage = true;
    } else if (/^-[am]+$/.test(a)) {
      // Flags courts combinés parmi a/m (ex: -am, -ma).
      if (a.includes('a')) autoStage = true;
      if (a.includes('m')) {
        messageArg = args[i + 1];
        i++;
      }
    } else if (a.startsWith('-')) {
      // Autre flag (ex: --amend déjà traité) : ignoré ici.
    } else {
      positionals.push(a);
    }
  }

  // BAS-10 : un positionnel restant est un pathspec (commit partiel non supporté) ;
  // git refuse plutôt que d'avaler le mot dans le message.
  if (positionals.length > 0) {
    return fail([`error: pathspec '${positionals[0]}' did not match any file(s) known to git`], 1);
  }

  // BAS-05 : `-a` stage automatiquement les modifications/suppressions des
  // fichiers SUIVIS (comme `git add -u`) avant de committer (pas les untracked).
  if (autoStage) {
    for (const path of Object.keys(repo.index)) {
      const wt = repo.workingTree[path];
      if (!wt) {
        delete repo.index[path];
      } else {
        const blobHash = storeBlob(repo, wt.content);
        repo.index[path] = { blobHash, content: wt.content, mode: wt.mode };
      }
    }
  }

  // En cas de revert en cours, le message peut être optionnel (message par défaut).
  let message: string;
  if (messageArg === undefined) {
    if (repo.reverting) {
      message = repo.reverting.defaultMessage;
    } else {
      return fail(["fatal: option '-m' is required"]);
    }
  } else if (messageArg === '') {
    return fail(['fatal: message cannot be empty']);
  } else {
    message = messageArg;
  }

  // Finalisation d'un revert en cours : ne jamais committer de marqueurs de
  // conflit non résolus (comme finalizeMergeCommit / finalizeCherryPickCommit).
  if (
    repo.reverting &&
    Object.values(repo.workingTree).some((e) => hasConflictMarkers(e.content))
  ) {
    return fail(
      [
        'error: Committing is not possible because you have unmerged files.',
        "hint: Fix them up in the work tree, and then use 'git add/rm <file>'",
        'fatal: Exiting because of an unresolved conflict.',
      ],
      1,
    );
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

  const headHashBeforeCommit = headCommitHash(repo) ?? '';
  const isRoot = headHashBeforeCommit === '';
  const commitHash = createCommit(repo, { message });

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

  return ok([commitHeadline(repo, commitHash, message, isRoot)]);
}

/**
 * Construit la ligne d'en-tête d'un commit (`[<label>[ (root-commit)] <short>] <msg>`).
 * En HEAD détaché, le label est `detached HEAD` (comme le vrai git) ; sinon le
 * nom de la branche courante.
 */
function commitHeadline(
  repo: Repository,
  commitHash: string,
  message: string,
  isRoot: boolean,
): string {
  const label = isHeadDetached(repo) ? 'detached HEAD' : (currentBranch(repo) ?? 'HEAD');
  const rootLabel = isRoot ? ' (root-commit)' : '';
  return `[${label}${rootLabel} ${shortHash(commitHash)}] ${message}`;
}

/**
 * git commit --amend [-m <msg>]
 *
 * Réécrit le commit de tête : nouveau commit avec les MÊMES parents que HEAD,
 * l'arbre de l'index courant, et le message `-m` (sinon le message d'origine).
 * Déplace la ref de branche (ou HEAD détaché) sur le nouveau commit ; l'ancien
 * devient inaccessible (mais reste dans les objets / le reflog).
 */
function amendCommit(repo: Repository, args: string[]): CommandResult {
  const head = headCommit(repo);
  const headHash = headCommitHash(repo);
  if (!head || !headHash) {
    return fail(['fatal: You have nothing to amend.']);
  }

  // Message : -m si fourni, sinon le message du commit réécrit.
  const mIndex = args.indexOf('-m');
  let message: string;
  if (mIndex === -1) {
    message = head.message;
  } else {
    const raw = args[mIndex + 1];
    if (raw === undefined || raw === '') {
      return fail(['fatal: message cannot be empty']);
    }
    message = raw;
  }

  // Ne jamais réécrire un commit contenant des marqueurs de conflit non résolus.
  if (Object.values(repo.workingTree).some((e) => hasConflictMarkers(e.content))) {
    return fail(
      [
        'error: Committing is not possible because you have unmerged files.',
        "hint: Fix them up in the work tree, and then use 'git add/rm <file>'",
        'fatal: Exiting because of an unresolved conflict.',
      ],
      1,
    );
  }

  const treeHash = buildTreeFromIndex(repo, repo.index);
  const newHash = createCommitWithParents(repo, {
    message,
    treeHash,
    parents: head.parents,
  });

  addReflogEntryForHead(repo, {
    oldHash: headHash,
    newHash,
    action: 'commit',
    description: `(amend) ${message.split('\n')[0] ?? message}`,
  });

  return ok([commitHeadline(repo, newHash, message, head.parents.length === 0)]);
}

/**
 * Finalise un merge en cours en créant un commit à 2 parents.
 */
function finalizeMergeCommit(repo: Repository, args: string[]): CommandResult {
  const mergingState = repo.merging!;

  // Refuser la finalisation tant qu'il reste des marqueurs de conflit non
  // résolus dans le working tree (comme le vrai git), pour ne jamais committer
  // de marqueurs <<<<<<< ======= >>>>>>>.
  if (Object.values(repo.workingTree).some((e) => hasConflictMarkers(e.content))) {
    return fail(
      [
        'error: Committing is not possible because you have unmerged files.',
        "hint: Fix them up in the work tree, and then use 'git add/rm <file>'",
        'fatal: Exiting because of an unresolved conflict.',
      ],
      1,
    );
  }

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

  // Idem merge : pas de finalisation avec des marqueurs de conflit résiduels.
  if (Object.values(repo.workingTree).some((e) => hasConflictMarkers(e.content))) {
    return fail(
      [
        'error: Committing is not possible because you have unmerged files.',
        "hint: Fix them up in the work tree, and then use 'git add/rm <file>'",
        'fatal: Exiting because of an unresolved conflict.',
      ],
      1,
    );
  }

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
