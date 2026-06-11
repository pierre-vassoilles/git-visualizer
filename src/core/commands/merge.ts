import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  addReflogEntryForHead,
  applyFilesToRepo,
  buildIndexFromFiles,
  buildWorkingTreeFromFiles,
  cloneIndex,
  cloneWorkingTree,
  createCommitWithParents,
  currentBranch,
  findMergeBases,
  getTreeFiles,
  headCommitHash,
  isAncestor,
  isInitialized,
  makeConflictMarkers,
  mergeBaseFiles,
  resolveCommitish,
  storeBlob,
} from '../repository';
import { getCommit } from '../objectStore';
import { buildTreeFromIndex } from '../repository';
import { notARepo } from './init';
import { cmdCommit } from './commit';
import { refuseIfDirty, refuseIfOperationInProgress } from './guards';

/**
 * git merge [--no-ff] [-m <message>] <branchname>
 * git merge --abort
 */
export function cmdMerge(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // git merge --abort
  if (args.includes('--abort')) {
    return mergeAbort(repo);
  }

  // git merge --continue : finalise le merge en cours (= git commit du merge).
  if (args.includes('--continue')) {
    if (!repo.merging) {
      return fail(['fatal: There is no merge in progress (MERGE_HEAD missing).'], 128);
    }
    return cmdCommit(repo, []);
  }

  // Vérifier qu'on n'est pas déjà en train de merger
  if (repo.merging) {
    return fail([
      'error: You have not concluded your merge (MERGE_HEAD exists).',
      'Please, commit your changes before you merge again.',
    ]);
  }

  // Refuser si une AUTRE opération de séquencement est en cours.
  const opGuard = refuseIfOperationInProgress(repo);
  if (opGuard) return opGuard;

  // Parser les options
  const noFf = args.includes('--no-ff');

  // Parser -m <message>
  let customMessage: string | null = null;
  const mIdx = args.indexOf('-m');
  if (mIdx !== -1 && args[mIdx + 1] !== undefined) {
    customMessage = args[mIdx + 1]!;
  }

  // Trouver le nom de la branche (dernier arg non-flag)
  const filteredArgs = args.filter((a, i) => {
    if (a.startsWith('-')) return false;
    if (i > 0 && args[i - 1] === '-m') return false;
    return true;
  });
  const branchName = filteredArgs[0];

  if (!branchName) {
    return fail(['fatal: No branch name given']);
  }

  // Résoudre le commitish de la branche à merger
  const branchTip = resolveCommitish(repo, branchName);
  if (branchTip === null) {
    return fail([`fatal: '${branchName}' - not something we can merge`], 128);
  }

  const headHash = headCommitHash(repo);
  if (!headHash) {
    return fail(['fatal: no commits yet; cannot merge']);
  }

  // Cas : Already up to date — soit le tip == HEAD, soit le tip est un ANCÊTRE
  // de HEAD (déjà fusionné). Dans les deux cas git ne crée rien, même --no-ff.
  if (branchTip === headHash || isAncestor(repo, branchTip, headHash)) {
    return ok(['Already up to date.']);
  }

  // Refuser si des changements non commités seraient écrasés (avant FF ou merge,
  // mais après « up to date » qui ne touche à rien). git merge : exit 2.
  const dirtyGuard = refuseIfDirty(repo, 'merge', 2);
  if (dirtyGuard) return dirtyGuard;

  // Fast-forward possible : HEAD est ancêtre de branchTip
  if (!noFf && isAncestor(repo, headHash, branchTip)) {
    return performFastForward(repo, branchTip, branchName);
  }

  // True merge (ou --no-ff forcé)
  return performTrueMerge(repo, headHash, branchTip, branchName, customMessage, noFf);
}

/** Fast-forward : avance simplement la branche courante vers branchTip. */
function performFastForward(
  repo: Repository,
  branchTip: string,
  _branchName: string,
): CommandResult {
  const headHash = headCommitHash(repo)!;

  // Mettre à jour HEAD vers branchTip
  const branch = currentBranch(repo);
  if (branch !== null) {
    repo.refs.heads[branch] = branchTip;
  } else {
    repo.head = { symbolic: false, target: branchTip };
  }

  // Aligner index et WT sur le nouveau commit
  const targetCommit = getCommit(repo, branchTip);
  if (targetCommit) {
    const files = getTreeFiles(repo, targetCommit.tree);
    applyFilesToRepo(repo, files);
  }

  addReflogEntryForHead(repo, {
    oldHash: headHash,
    newHash: branchTip,
    action: 'merge',
    description: `Fast-forward`,
  });

  // Message de sortie simplifié
  const shortBefore = headHash.slice(0, 7);
  const shortAfter = branchTip.slice(0, 7);
  return ok([`Updating ${shortBefore}..${shortAfter}`, 'Fast-forward']);
}

/**
 * True merge : fusionne les arbres de HEAD et branchTip via leur ancêtre commun.
 * Crée un commit de fusion à 2 parents si pas de conflit.
 */
function performTrueMerge(
  repo: Repository,
  headHash: string,
  branchTip: string,
  branchName: string,
  customMessage: string | null,
  _noFf: boolean,
): CommandResult {
  const headCommitObj = getCommit(repo, headHash);
  const branchCommitObj = getCommit(repo, branchTip);
  if (!headCommitObj || !branchCommitObj) {
    return fail(['fatal: could not read commit objects']);
  }

  // Trouver les bases communes. En criss-cross (>1 base), `mergeBaseFiles` construit
  // une base synthétique (stratégie récursive, spec 47) ; sinon l'arbre de l'unique
  // base. `baseHash` (1ʳᵉ base ou '') ne sert qu'au record `repo.merging` / --abort.
  const bases = findMergeBases(repo, headHash, branchTip);
  const baseHash = bases[0] ?? null;

  // Obtenir les fichiers des trois arbres
  const headFiles = getTreeFiles(repo, headCommitObj.tree);
  const branchFiles = getTreeFiles(repo, branchCommitObj.tree);
  const baseFiles = mergeBaseFiles(repo, headHash, branchTip);

  // Fusionner les arbres (3-way merge)
  const mergedFiles: Record<string, string> = {};
  const conflictFiles: Record<string, string> = {}; // path → contenu avec marqueurs
  // Type de conflit par chemin → message git fidèle (content vs delete/modify).
  const conflictMessagesByPath: Record<string, string> = {};

  // Collecter tous les chemins
  const allPaths = new Set([
    ...Object.keys(headFiles),
    ...Object.keys(branchFiles),
    ...Object.keys(baseFiles),
  ]);

  for (const path of allPaths) {
    const base = baseFiles[path];
    const head = headFiles[path];
    const branch = branchFiles[path];

    if (head === branch) {
      // Même contenu des deux côtés → garder (peu importe ce que base dit)
      if (head !== undefined) {
        mergedFiles[path] = head;
      }
      // Si les deux sont undefined → fichier supprimé des deux côtés
    } else if (base === head) {
      // HEAD n'a pas changé, branchTip a changé → prendre branchTip
      if (branch !== undefined) {
        mergedFiles[path] = branch;
      }
      // Si branch est undefined → suppression côté branchTip → supprimer
    } else if (base === branch) {
      // branchTip n'a pas changé, HEAD a changé → prendre HEAD
      if (head !== undefined) {
        mergedFiles[path] = head;
      }
      // Si head est undefined → suppression côté HEAD → supprimer
    } else {
      // Les deux ont changé différemment → conflit
      if (head !== undefined && branch !== undefined) {
        // Conflit contenu/contenu
        conflictFiles[path] = makeConflictMarkers(head, branch, branchName);
        mergedFiles[path] = makeConflictMarkers(head, branch, branchName);
        conflictMessagesByPath[path] = `CONFLICT (content): Merge conflict in ${path}`;
      } else if (head !== undefined && branch === undefined) {
        // delete/modify : modifié chez nous (HEAD), supprimé chez eux (branchTip).
        conflictFiles[path] = makeConflictMarkers(
          head,
          '(deleted in ' + branchName + ')',
          branchName,
        );
        mergedFiles[path] = head; // garder la version HEAD par défaut
        conflictMessagesByPath[path] =
          `CONFLICT (delete/modify): ${path} modified by us, deleted by them.`;
      } else if (head === undefined && branch !== undefined) {
        // delete/modify : supprimé chez nous (HEAD), modifié chez eux (branchTip).
        conflictFiles[path] = makeConflictMarkers('(deleted in HEAD)', branch, branchName);
        mergedFiles[path] = branch; // garder la version branchTip par défaut
        conflictMessagesByPath[path] =
          `CONFLICT (delete/modify): ${path} deleted by us, modified by them.`;
      }
      // Si les deux sont undefined → pas de conflit
    }
  }

  const hasConflicts = Object.keys(conflictFiles).length > 0;

  if (hasConflicts) {
    // Sauvegarder l'état avant merge pour --abort
    repo.merging = {
      branchName,
      baseHash: baseHash ?? '',
      branchTipHash: branchTip,
      headHashBeforeMerge: headHash,
      indexBeforeMerge: cloneIndex(repo.index),
      workingTreeBeforeMerge: cloneWorkingTree(repo.workingTree),
      mergeParents: [headHash, branchTip],
    };

    // Écrire les marqueurs de conflit dans le WT et l'index
    // L'index reflète les fichiers fusionnés (avec marqueurs pour les conflits)
    for (const [path, content] of Object.entries(mergedFiles)) {
      const blobHash = storeBlob(repo, content);
      repo.index[path] = { blobHash, content, mode: '100644' };
      repo.workingTree[path] = { content, mode: '100644' };
    }
    // Supprimer les fichiers qui n'existent plus dans la fusion
    for (const path of Object.keys(repo.index)) {
      if (!(path in mergedFiles)) {
        delete repo.index[path];
      }
    }
    for (const path of Object.keys(repo.workingTree)) {
      if (!(path in mergedFiles)) {
        delete repo.workingTree[path];
      }
    }

    const conflictMessages = Object.keys(conflictFiles)
      .sort()
      .map(
        (path) => conflictMessagesByPath[path] ?? `CONFLICT (content): Merge conflict in ${path}`,
      );

    return { output: conflictMessages, errors: [], exitCode: 1 };
  }

  // Pas de conflits → créer le commit de fusion
  // Construire l'index et le WT à partir des fichiers fusionnés
  repo.index = buildIndexFromFiles(repo, mergedFiles);
  repo.workingTree = buildWorkingTreeFromFiles(repo, mergedFiles);

  // Construire le tree hash depuis l'index
  const treeHash = buildTreeFromIndex(repo, repo.index);

  const message = customMessage ?? `Merge branch '${branchName}'`;

  const mergeCommitHash = createCommitWithParents(repo, {
    message,
    treeHash,
    parents: [headHash, branchTip],
  });

  addReflogEntryForHead(repo, {
    oldHash: headHash,
    newHash: mergeCommitHash,
    action: 'merge',
    description: message,
  });

  // S'assurer que le merging state est nettoyé
  delete repo.merging;

  return ok([
    `Merge made by the '3-way' merge strategy.`,
    `  merge commit: ${mergeCommitHash.slice(0, 7)}`,
  ]);
}

/** Annule un merge en cours (git merge --abort). */
function mergeAbort(repo: Repository): CommandResult {
  if (!repo.merging) {
    return fail(['fatal: There is no merge in progress (MERGE_HEAD missing).']);
  }

  // Restaurer l'état avant le merge
  const { indexBeforeMerge, workingTreeBeforeMerge, headHashBeforeMerge } = repo.merging;

  // Restaurer HEAD (la branche)
  const branch = currentBranch(repo);
  if (branch !== null) {
    repo.refs.heads[branch] = headHashBeforeMerge;
  } else {
    repo.head = { symbolic: false, target: headHashBeforeMerge };
  }

  repo.index = indexBeforeMerge;
  repo.workingTree = workingTreeBeforeMerge;
  delete repo.merging;

  return ok();
}
