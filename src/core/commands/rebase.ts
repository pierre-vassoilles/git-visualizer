import { fail, ok, type CommandResult } from '../types';
import type { Repository, TodoItem } from '../model';
import {
  addReflogEntryForHead,
  buildIndexFromFiles,
  buildTreeFromIndex,
  buildWorkingTreeFromFiles,
  cloneIndex,
  cloneWorkingTree,
  createCommitWithParents,
  currentBranch,
  getCommitsToReplay,
  getTreeFiles,
  headCommitHash,
  isAncestor,
  isInitialized,
  mergeBase,
  replayCommit,
  replayCommitContinue,
  resolveCommitish,
} from '../repository';
import { getCommit } from '../objectStore';
import { notARepo } from './init';

/**
 * git rebase [-i] [--abort | --continue] <base>
 *
 * Rejoue les commits de la branche courante au-dessus de <base>.
 * Avec -i : lance le rebase interactif (en attente d'édition de la todo list).
 */
export function cmdRebase(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // git rebase --abort
  if (args.includes('--abort')) {
    return rebaseAbort(repo);
  }

  // git rebase --continue
  if (args.includes('--continue')) {
    return rebaseContinue(repo);
  }

  // Vérifier qu'on n'est pas déjà en rebase
  if (repo.rebasing) {
    return fail([
      'error: It seems that there is already a rebase in progress.',
      'Please, commit your changes and try again.',
    ]);
  }

  // Détecter -i / --interactive
  const interactive = args.includes('-i') || args.includes('--interactive');

  // Trouver l'argument base
  const filteredArgs = args.filter((a) => !a.startsWith('-'));
  const baseRef = filteredArgs[0];

  if (!baseRef) {
    return fail(['fatal: no base branch given']);
  }

  // Résoudre la base
  const baseHash = resolveCommitish(repo, baseRef);
  if (!baseHash) {
    return fail(
      [
        `fatal: ambiguous argument '${baseRef}': unknown revision or path not in working tree`,
      ],
      128,
    );
  }

  const headHash = headCommitHash(repo);
  if (!headHash) {
    return fail(['fatal: no commits yet; cannot rebase']);
  }

  // Cas : déjà à jour (HEAD est ancêtre de base ou égal)
  if (headHash === baseHash || isAncestor(repo, headHash, baseHash)) {
    const branch = currentBranch(repo);
    const branchLabel = branch ?? 'HEAD';
    return ok([`Current branch ${branchLabel} is already up to date.`]);
  }

  // Cas fast-forward : base est ancêtre de HEAD
  if (isAncestor(repo, baseHash, headHash)) {
    const branch = currentBranch(repo);
    const branchLabel = branch ?? 'HEAD';
    return ok([`Current branch ${branchLabel} is already up to date.`]);
  }

  // Identifier les commits à rejouer
  const commitsToReplay = getCommitsToReplay(repo, headHash, baseHash);

  if (commitsToReplay.length === 0) {
    const branch = currentBranch(repo);
    const branchLabel = branch ?? 'HEAD';
    return ok([`Current branch ${branchLabel} is already up to date.`]);
  }

  // Refus explicite : rebaser une branche contenant un commit de merge
  if (commitsToReplay.some((c) => c.commit.parents.length > 1)) {
    return fail([
      'error: cannot rebase: the branch to rebase contains a merge commit (not supported)',
    ]);
  }

  // Sauvegarder l'état avant rebase
  const branchBeforeRebase = currentBranch(repo);
  const indexBeforeRebase = cloneIndex(repo.index);
  const workingTreeBeforeRebase = cloneWorkingTree(repo.workingTree);

  // Vérifier si c'est un cas de fast-forward rebase
  const commonAncestor = mergeBase(repo, headHash, baseHash);
  if (commonAncestor === headHash) {
    const branch = currentBranch(repo);
    if (branch !== null) {
      repo.refs.heads[branch] = baseHash;
    } else {
      repo.head = { symbolic: false, target: baseHash };
    }
    const baseCommit = getCommit(repo, baseHash);
    if (baseCommit) {
      const files = getTreeFiles(repo, baseCommit.tree);
      repo.index = buildIndexFromFiles(repo, files);
      repo.workingTree = buildWorkingTreeFromFiles(repo, files);
    }
    addReflogEntryForHead(repo, {
      oldHash: headHash,
      newHash: baseHash,
      action: 'rebase',
      description: `finish ${baseRef}`,
    });
    return ok(['Fast-forward']);
  }

  // Mode interactif : initialiser la todo list et attendre l'utilisateur
  if (interactive) {
    const todoList: TodoItem[] = commitsToReplay.map((c) => ({
      action: 'pick',
      commitHash: c.hash,
      message: c.commit.message,
    }));

    repo.rebasing = {
      base: baseHash,
      toReplay: commitsToReplay.map((c) => c.hash),
      replayed: [],
      headHashBeforeRebase: headHash,
      branchBeforeRebase,
      indexBeforeRebase,
      workingTreeBeforeRebase,
      currentCommitMessage: '',
      interactive: {
        awaitingTodoEdit: true,
        todoList,
        currentIndex: -1,
      },
    };

    return ok(['Interactive rebase in progress; waiting for todo list edit.']);
  }

  // Rejouer les commits un par un (non-interactif)
  let currentNewParent = baseHash;
  const replayed: string[] = [];

  for (let i = 0; i < commitsToReplay.length; i++) {
    const { hash: origHash, commit: origCommit } = commitsToReplay[i]!;

    const result = replayCommit(repo, {
      origCommit,
      origHash,
      newParentHash: currentNewParent,
      label: origHash.slice(0, 7),
    });

    if (!result.newHash) {
      repo.rebasing = {
        base: baseHash,
        toReplay: commitsToReplay.slice(i).map((c) => c.hash),
        replayed,
        headHashBeforeRebase: headHash,
        branchBeforeRebase,
        indexBeforeRebase,
        workingTreeBeforeRebase,
        currentCommitMessage: result.resumeState?.commitMessage ?? origCommit.message,
      };

      const currentRef = replayed.length > 0 ? replayed[replayed.length - 1]! : headHash;
      const branch = currentBranch(repo);
      if (branch !== null) {
        repo.refs.heads[branch] = currentRef;
      } else {
        repo.head = { symbolic: false, target: currentRef };
      }

      const conflictMessages = Object.keys(result.conflicts)
        .sort()
        .map((path) => `CONFLICT (content): Conflict in ${path}`);

      return { output: conflictMessages, errors: [], exitCode: 1 };
    }

    replayed.push(result.newHash);
    currentNewParent = result.newHash;
  }

  addReflogEntryForHead(repo, {
    oldHash: headHash,
    newHash: currentNewParent,
    action: 'rebase',
    description: `finish ${baseRef}`,
  });

  const branch = currentBranch(repo);
  const branchLabel = branch ?? 'HEAD';
  return ok([`Successfully rebased and updated ${branchLabel}.`]);
}

/**
 * Exécute la todo list éditée par l'utilisateur dans le rebase interactif.
 * Point d'entrée appelé par le store (via GitEngine.executeRebaseInteractive)
 * après que l'UI ait soumis la todo list.
 *
 * @param repo  - Repository mutable
 * @param todoList - Todo list éditée par l'utilisateur
 * @returns CommandResult (succès, conflit ou erreur)
 */
export function executeRebaseInteractive(
  repo: Repository,
  todoList: TodoItem[],
): CommandResult {
  if (!repo.rebasing || !repo.rebasing.interactive) {
    return fail(['fatal: No interactive rebase in progress.']);
  }

  if (todoList.length === 0) {
    return fail(['fatal: No commits found to rebase.']);
  }

  // Vérifier la première action (pas de squash/fixup en tête)
  const firstAction = todoList[0]!.action;
  if (firstAction === 'squash' || firstAction === 'fixup') {
    return fail(['fatal: cannot squash the first commit']);
  }

  // Vérifier les actions valides
  const validActions = new Set<string>(['pick', 'reword', 'squash', 'fixup', 'drop', 'edit']);
  for (const item of todoList) {
    if (!validActions.has(item.action)) {
      return fail([`fatal: unknown action: '${item.action}'`]);
    }
  }

  // Vérifier que tous les commits non-drop existent
  for (const item of todoList) {
    if (item.action === 'drop') continue;
    const commit = getCommit(repo, item.commitHash);
    if (!commit) {
      return fail([`fatal: commit ${item.commitHash} not found`], 128);
    }
  }

  const {
    base,
    headHashBeforeRebase,
    branchBeforeRebase,
    indexBeforeRebase,
    workingTreeBeforeRebase,
  } = repo.rebasing;

  return runInteractiveTodoList(repo, todoList, {
    base,
    headHash: headHashBeforeRebase,
    branchBeforeRebase,
    indexBeforeRebase,
    workingTreeBeforeRebase,
    startIndex: 0,
    initialParent: base,
    initialLastHash: null,
    initialLastMessage: '',
  });
}

/** Options pour exécuter la todo list interactive. */
interface RunTodoOptions {
  base: string;
  headHash: string;
  branchBeforeRebase: string | null;
  indexBeforeRebase: import('../model').Index;
  workingTreeBeforeRebase: import('../model').WorkingTree;
  startIndex: number;
  initialParent: string;
  initialLastHash: string | null;
  initialLastMessage: string;
}

/**
 * Exécute la todo list à partir de startIndex.
 * Factorisation partagée par executeRebaseInteractive et la continuation interactive.
 */
function runInteractiveTodoList(
  repo: Repository,
  todoList: TodoItem[],
  opts: RunTodoOptions,
): CommandResult {
  const {
    base,
    headHash,
    branchBeforeRebase,
    indexBeforeRebase,
    workingTreeBeforeRebase,
    startIndex,
    initialParent,
  } = opts;

  let currentNewParent = initialParent;
  let lastCommitHash: string | null = opts.initialLastHash;
  let lastCommitMessage: string = opts.initialLastMessage;

  for (let i = startIndex; i < todoList.length; i++) {
    const item = todoList[i]!;

    if (item.action === 'drop') {
      continue;
    }

    const origCommit = getCommit(repo, item.commitHash);
    if (!origCommit) {
      return fail([`fatal: commit ${item.commitHash} not found`], 128);
    }

    if (item.action === 'squash' || item.action === 'fixup') {
      if (lastCommitHash === null) {
        return fail(['fatal: cannot squash the first commit']);
      }

      const result = replayCommit(repo, {
        origCommit,
        origHash: item.commitHash,
        newParentHash: currentNewParent,
        label: item.commitHash.slice(0, 7),
      });

      const combinedMessage = item.action === 'squash'
        ? `${lastCommitMessage}\n\n${item.message}`
        : lastCommitMessage;

      if (!result.newHash) {
        // Conflit lors du squash
        const parentOfLast = getCommit(repo, lastCommitHash)?.parents[0] ?? base;
        repo.rebasing = {
          base,
          toReplay: todoList.slice(i).map((t) => t.commitHash),
          replayed: lastCommitHash ? [lastCommitHash] : [],
          headHashBeforeRebase: headHash,
          branchBeforeRebase,
          indexBeforeRebase,
          workingTreeBeforeRebase,
          currentCommitMessage: combinedMessage,
          interactive: {
            awaitingTodoEdit: false,
            todoList,
            currentIndex: i,
            pendingSquashMessage: combinedMessage,
          },
        };

        const branch = currentBranch(repo);
        if (branch !== null) {
          repo.refs.heads[branch] = parentOfLast;
        } else {
          repo.head = { symbolic: false, target: parentOfLast };
        }

        const conflictMessages = Object.keys(result.conflicts)
          .sort()
          .map((path) => `CONFLICT (content): Conflict in ${path}`);
        return { output: conflictMessages, errors: [], exitCode: 1 };
      }

      // Squash réussi : fusionner dans le commit précédent
      const squashedTree = buildTreeFromIndex(repo, repo.index);
      const parentOfLast = getCommit(repo, lastCommitHash)?.parents[0] ?? base;

      const squashedHash = createCommitWithParents(repo, {
        message: combinedMessage,
        treeHash: squashedTree,
        parents: [parentOfLast],
      });

      // Mettre à jour la branche vers le commit squashé
      const squashBranch = currentBranch(repo);
      if (squashBranch !== null) {
        repo.refs.heads[squashBranch] = squashedHash;
      } else {
        repo.head = { symbolic: false, target: squashedHash };
      }

      // Mettre à jour index/WT avec les fichiers du commit squashé
      const squashedCommit = getCommit(repo, squashedHash);
      if (squashedCommit) {
        const files = getTreeFiles(repo, squashedCommit.tree);
        repo.index = buildIndexFromFiles(repo, files);
        repo.workingTree = buildWorkingTreeFromFiles(repo, files);
      }

      lastCommitHash = squashedHash;
      lastCommitMessage = combinedMessage;
      currentNewParent = squashedHash;
      continue;
    }

    // pick / reword / edit : rejouer normalement
    const messageToUse = item.action === 'reword' ? item.message : origCommit.message;
    const commitToReplay = item.action === 'reword'
      ? { ...origCommit, message: messageToUse }
      : origCommit;

    const result = replayCommit(repo, {
      origCommit: commitToReplay,
      origHash: item.commitHash,
      newParentHash: currentNewParent,
      label: item.commitHash.slice(0, 7),
    });

    if (!result.newHash) {
      repo.rebasing = {
        base,
        toReplay: todoList.slice(i).map((t) => t.commitHash),
        replayed: lastCommitHash ? [lastCommitHash] : [],
        headHashBeforeRebase: headHash,
        branchBeforeRebase,
        indexBeforeRebase,
        workingTreeBeforeRebase,
        currentCommitMessage: result.resumeState?.commitMessage ?? origCommit.message,
        interactive: {
          awaitingTodoEdit: false,
          todoList,
          currentIndex: i,
        },
      };

      const branch = currentBranch(repo);
      if (branch !== null) {
        repo.refs.heads[branch] = currentNewParent;
      } else {
        repo.head = { symbolic: false, target: currentNewParent };
      }

      const conflictMessages = Object.keys(result.conflicts)
        .sort()
        .map((path) => `CONFLICT (content): Conflict in ${path}`);
      return { output: conflictMessages, errors: [], exitCode: 1 };
    }

    lastCommitHash = result.newHash;
    lastCommitMessage = commitToReplay.message;
    currentNewParent = result.newHash;
  }

  // Tout traité avec succès
  delete repo.rebasing;

  addReflogEntryForHead(repo, {
    oldHash: headHash,
    newHash: currentNewParent,
    action: 'rebase',
    description: 'finish (interactive)',
  });

  const branch = currentBranch(repo);
  const branchLabel = branch ?? 'HEAD';
  return ok([`Successfully rebased and updated ${branchLabel}.`]);
}

/** Annule un rebase en cours. */
function rebaseAbort(repo: Repository): CommandResult {
  if (!repo.rebasing) {
    return fail(['fatal: There is no rebase in progress.']);
  }

  const {
    headHashBeforeRebase,
    branchBeforeRebase,
    indexBeforeRebase,
    workingTreeBeforeRebase,
  } = repo.rebasing;

  if (branchBeforeRebase !== null) {
    repo.refs.heads[branchBeforeRebase] = headHashBeforeRebase;
    repo.head = { symbolic: true, target: `refs/heads/${branchBeforeRebase}` };
  } else {
    repo.head = { symbolic: false, target: headHashBeforeRebase };
  }

  repo.index = indexBeforeRebase;
  repo.workingTree = workingTreeBeforeRebase;
  delete repo.rebasing;

  return ok();
}

/** Continue un rebase après résolution de conflits. */
function rebaseContinue(repo: Repository): CommandResult {
  if (!repo.rebasing) {
    return fail(['fatal: There is no rebase in progress.']);
  }

  const rebasing = repo.rebasing;

  // Si en mode interactif en attente d'édition, cannot continue
  if (rebasing.interactive?.awaitingTodoEdit) {
    return fail(['fatal: Interactive rebase in progress; cannot continue without submitting todo list.']);
  }

  const { toReplay, replayed, currentCommitMessage } = rebasing;

  // Cas spécial : conflit résolu sur une marche squash/fixup (pendingSquashMessage est posé).
  // Au lieu de créer un nouveau commit empilé sur D1', on fusionne dans D1' en le remplaçant
  // par le commit squashé, exactement comme le chemin squash sans conflit.
  if (rebasing.interactive?.pendingSquashMessage !== undefined) {
    const squashMessage = rebasing.interactive.pendingSquashMessage;
    // replayed[last] = D1' (le commit précédent à remplacer)
    const prevCommitHash = replayed.length > 0
      ? replayed[replayed.length - 1]!
      : rebasing.base;
    const prevCommit = getCommit(repo, prevCommitHash);
    // Le parent du commit squashé est le parent de D1' (= la base / C1)
    const parentOfPrev = (prevCommit?.parents[0]) ?? rebasing.base;

    const squashedTree = buildTreeFromIndex(repo, repo.index);
    const squashedHash = createCommitWithParents(repo, {
      message: squashMessage,
      treeHash: squashedTree,
      parents: [parentOfPrev],
    });

    // Mettre à jour index/WT avec les fichiers du commit squashé
    const squashedCommit = getCommit(repo, squashedHash);
    if (squashedCommit) {
      const files = getTreeFiles(repo, squashedCommit.tree);
      repo.index = buildIndexFromFiles(repo, files);
      repo.workingTree = buildWorkingTreeFromFiles(repo, files);
    }

    // Remplacer D1' par le commit squashé dans replayed
    const newReplayed = replayed.length > 0
      ? [...replayed.slice(0, replayed.length - 1), squashedHash]
      : [squashedHash];

    const { todoList, currentIndex } = rebasing.interactive;
    const nextIndex = currentIndex + 1;
    let currentNewParent = squashedHash;
    let lastCommitHash: string = squashedHash;
    let lastCommitMessage: string = squashMessage;

    for (let i = nextIndex; i < todoList.length; i++) {
      const item = todoList[i]!;

      if (item.action === 'drop') continue;

      const origCommit = getCommit(repo, item.commitHash);
      if (!origCommit) continue;

      if (item.action === 'squash' || item.action === 'fixup') {
        const result = replayCommit(repo, {
          origCommit,
          origHash: item.commitHash,
          newParentHash: currentNewParent,
          label: item.commitHash.slice(0, 7),
        });

        const combinedMessage = item.action === 'squash'
          ? `${lastCommitMessage}\n\n${item.message}`
          : lastCommitMessage;

        if (!result.newHash) {
          const parentOfLast = getCommit(repo, lastCommitHash)?.parents[0] ?? rebasing.base;
          repo.rebasing = {
            ...rebasing,
            toReplay: todoList.slice(i).map((t) => t.commitHash),
            replayed: newReplayed,
            currentCommitMessage: combinedMessage,
            interactive: {
              awaitingTodoEdit: false,
              todoList,
              currentIndex: i,
              pendingSquashMessage: combinedMessage,
            },
          };

          const branch = currentBranch(repo);
          if (branch !== null) {
            repo.refs.heads[branch] = parentOfLast;
          } else {
            repo.head = { symbolic: false, target: parentOfLast };
          }

          const conflictMessages = Object.keys(result.conflicts)
            .sort()
            .map((path) => `CONFLICT (content): Conflict in ${path}`);
          return { output: conflictMessages, errors: [], exitCode: 1 };
        }

        const sqTree = buildTreeFromIndex(repo, repo.index);
        const parentOfLast = getCommit(repo, lastCommitHash)?.parents[0] ?? rebasing.base;

        const sqHash = createCommitWithParents(repo, {
          message: combinedMessage,
          treeHash: sqTree,
          parents: [parentOfLast],
        });

        const sqBranch = currentBranch(repo);
        if (sqBranch !== null) {
          repo.refs.heads[sqBranch] = sqHash;
        } else {
          repo.head = { symbolic: false, target: sqHash };
        }

        const sqCommit = getCommit(repo, sqHash);
        if (sqCommit) {
          const files = getTreeFiles(repo, sqCommit.tree);
          repo.index = buildIndexFromFiles(repo, files);
          repo.workingTree = buildWorkingTreeFromFiles(repo, files);
        }

        lastCommitHash = sqHash;
        lastCommitMessage = combinedMessage;
        currentNewParent = sqHash;
        if (newReplayed.length > 0) {
          newReplayed[newReplayed.length - 1] = sqHash;
        }
        continue;
      }

      const messageToUse = item.action === 'reword' ? item.message : origCommit.message;
      const commitToReplay = item.action === 'reword'
        ? { ...origCommit, message: messageToUse }
        : origCommit;

      const result = replayCommit(repo, {
        origCommit: commitToReplay,
        origHash: item.commitHash,
        newParentHash: currentNewParent,
        label: item.commitHash.slice(0, 7),
      });

      if (!result.newHash) {
        repo.rebasing = {
          ...rebasing,
          toReplay: todoList.slice(i).map((t) => t.commitHash),
          replayed: newReplayed,
          currentCommitMessage: result.resumeState?.commitMessage ?? origCommit.message,
          interactive: {
            awaitingTodoEdit: false,
            todoList,
            currentIndex: i,
          },
        };

        const branch = currentBranch(repo);
        if (branch !== null) {
          repo.refs.heads[branch] = currentNewParent;
        } else {
          repo.head = { symbolic: false, target: currentNewParent };
        }

        const conflictMessages = Object.keys(result.conflicts)
          .sort()
          .map((path) => `CONFLICT (content): Conflict in ${path}`);
        return { output: conflictMessages, errors: [], exitCode: 1 };
      }

      lastCommitHash = result.newHash;
      lastCommitMessage = commitToReplay.message;
      currentNewParent = result.newHash;
      newReplayed.push(result.newHash);
    }

    delete repo.rebasing;

    addReflogEntryForHead(repo, {
      oldHash: rebasing.headHashBeforeRebase,
      newHash: currentNewParent,
      action: 'rebase',
      description: 'finish (interactive)',
    });

    const branchSq = currentBranch(repo);
    const branchLabelSq = branchSq ?? 'HEAD';
    return ok([`Successfully rebased and updated ${branchLabelSq}.`]);
  }

  // Créer le commit du step courant avec l'index actuel (pick/reword/edit normal)
  const parentHash = replayed.length > 0
    ? replayed[replayed.length - 1]!
    : rebasing.base;

  const newCommitHash = replayCommitContinue(repo, {
    commitMessage: currentCommitMessage,
    newParentHash: parentHash,
  });

  const newReplayed = [...replayed, newCommitHash];
  let currentNewParent = newCommitHash;

  // Mode interactif avec exécution en cours
  if (rebasing.interactive) {
    const { todoList, currentIndex } = rebasing.interactive;
    const nextIndex = currentIndex + 1;

    let lastCommitHash: string = newCommitHash;
    let lastCommitMessage: string = currentCommitMessage;

    for (let i = nextIndex; i < todoList.length; i++) {
      const item = todoList[i]!;

      if (item.action === 'drop') continue;

      const origCommit = getCommit(repo, item.commitHash);
      if (!origCommit) continue;

      if (item.action === 'squash' || item.action === 'fixup') {
        const result = replayCommit(repo, {
          origCommit,
          origHash: item.commitHash,
          newParentHash: currentNewParent,
          label: item.commitHash.slice(0, 7),
        });

        const combinedMessage = item.action === 'squash'
          ? `${lastCommitMessage}\n\n${item.message}`
          : lastCommitMessage;

        if (!result.newHash) {
          const parentOfLast = getCommit(repo, lastCommitHash)?.parents[0] ?? rebasing.base;
          repo.rebasing = {
            ...rebasing,
            toReplay: todoList.slice(i).map((t) => t.commitHash),
            replayed: newReplayed,
            currentCommitMessage: combinedMessage,
            interactive: {
              awaitingTodoEdit: false,
              todoList,
              currentIndex: i,
              pendingSquashMessage: combinedMessage,
            },
          };

          const branch = currentBranch(repo);
          if (branch !== null) {
            repo.refs.heads[branch] = parentOfLast;
          } else {
            repo.head = { symbolic: false, target: parentOfLast };
          }

          const conflictMessages = Object.keys(result.conflicts)
            .sort()
            .map((path) => `CONFLICT (content): Conflict in ${path}`);
          return { output: conflictMessages, errors: [], exitCode: 1 };
        }

        const squashedTree = buildTreeFromIndex(repo, repo.index);
        const parentOfLast = getCommit(repo, lastCommitHash)?.parents[0] ?? rebasing.base;

        const squashedHash = createCommitWithParents(repo, {
          message: combinedMessage,
          treeHash: squashedTree,
          parents: [parentOfLast],
        });

        const squashBranch = currentBranch(repo);
        if (squashBranch !== null) {
          repo.refs.heads[squashBranch] = squashedHash;
        } else {
          repo.head = { symbolic: false, target: squashedHash };
        }

        const squashedCommit = getCommit(repo, squashedHash);
        if (squashedCommit) {
          const files = getTreeFiles(repo, squashedCommit.tree);
          repo.index = buildIndexFromFiles(repo, files);
          repo.workingTree = buildWorkingTreeFromFiles(repo, files);
        }

        lastCommitHash = squashedHash;
        lastCommitMessage = combinedMessage;
        currentNewParent = squashedHash;
        if (newReplayed.length > 0) {
          newReplayed[newReplayed.length - 1] = squashedHash;
        }
        continue;
      }

      const messageToUse = item.action === 'reword' ? item.message : origCommit.message;
      const commitToReplay = item.action === 'reword'
        ? { ...origCommit, message: messageToUse }
        : origCommit;

      const result = replayCommit(repo, {
        origCommit: commitToReplay,
        origHash: item.commitHash,
        newParentHash: currentNewParent,
        label: item.commitHash.slice(0, 7),
      });

      if (!result.newHash) {
        repo.rebasing = {
          ...rebasing,
          toReplay: todoList.slice(i).map((t) => t.commitHash),
          replayed: newReplayed,
          currentCommitMessage: result.resumeState?.commitMessage ?? origCommit.message,
          interactive: {
            awaitingTodoEdit: false,
            todoList,
            currentIndex: i,
          },
        };

        const branch = currentBranch(repo);
        if (branch !== null) {
          repo.refs.heads[branch] = currentNewParent;
        } else {
          repo.head = { symbolic: false, target: currentNewParent };
        }

        const conflictMessages = Object.keys(result.conflicts)
          .sort()
          .map((path) => `CONFLICT (content): Conflict in ${path}`);
        return { output: conflictMessages, errors: [], exitCode: 1 };
      }

      lastCommitHash = result.newHash;
      lastCommitMessage = commitToReplay.message;
      currentNewParent = result.newHash;
      newReplayed.push(result.newHash);
    }

    delete repo.rebasing;

    addReflogEntryForHead(repo, {
      oldHash: rebasing.headHashBeforeRebase,
      newHash: currentNewParent,
      action: 'rebase',
      description: 'finish (interactive)',
    });

    const branch = currentBranch(repo);
    const branchLabel = branch ?? 'HEAD';
    return ok([`Successfully rebased and updated ${branchLabel}.`]);
  }

  // Mode non-interactif : continuer avec les commits restants
  const remainingToReplay = toReplay.slice(1);

  for (let i = 0; i < remainingToReplay.length; i++) {
    const origHash = remainingToReplay[i]!;
    const origCommit = getCommit(repo, origHash);
    if (!origCommit) continue;

    const result = replayCommit(repo, {
      origCommit,
      origHash,
      newParentHash: currentNewParent,
      label: origHash.slice(0, 7),
    });

    if (!result.newHash) {
      repo.rebasing = {
        ...rebasing,
        toReplay: remainingToReplay.slice(i),
        replayed: newReplayed,
        currentCommitMessage: result.resumeState?.commitMessage ?? origCommit.message,
      };

      const branch = currentBranch(repo);
      if (branch !== null) {
        repo.refs.heads[branch] = currentNewParent;
      } else {
        repo.head = { symbolic: false, target: currentNewParent };
      }

      const conflictMessages = Object.keys(result.conflicts)
        .sort()
        .map((path) => `CONFLICT (content): Conflict in ${path}`);

      return { output: conflictMessages, errors: [], exitCode: 1 };
    }

    newReplayed.push(result.newHash);
    currentNewParent = result.newHash;
  }

  delete repo.rebasing;

  addReflogEntryForHead(repo, {
    oldHash: rebasing.headHashBeforeRebase,
    newHash: currentNewParent,
    action: 'rebase',
    description: 'continue',
  });

  const branch = currentBranch(repo);
  const branchLabel = branch ?? 'HEAD';
  return ok([`Successfully rebased and updated ${branchLabel}.`]);
}
