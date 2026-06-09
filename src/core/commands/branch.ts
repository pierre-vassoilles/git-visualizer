import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  branchExists,
  currentBranch,
  headCommitHash,
  isAncestor,
  isInitialized,
  isValidBranchName,
} from '../repository';
import { shortHash } from '../sha1';
import { notARepo } from './init';

/**
 * git branch [<branchname>]
 * git branch -d <branchname>
 * git branch -D <branchname>
 */
export function cmdBranch(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  const deleteFlag = args.includes('-d');
  const forceDeleteFlag = args.includes('-D');

  if (deleteFlag || forceDeleteFlag) {
    // Supprimer une branche
    const flagIndex = args.indexOf(deleteFlag ? '-d' : '-D');
    const branchName = args[flagIndex + 1];

    if (!branchName) {
      return fail(['fatal: branch name required']);
    }

    // Vérifier que la branche existe
    if (!branchExists(repo, branchName)) {
      return fail([`error: branch '${branchName}' not found.`]);
    }

    // Vérifier que ce n'est pas la branche courante
    const current = currentBranch(repo);
    if (current === branchName) {
      return fail([
        `fatal: Cannot delete the branch '${branchName}' which you are currently on.`,
      ]);
    }

    // Pour -d (soft delete), vérifier que la branche est mergée
    if (deleteFlag && !forceDeleteFlag) {
      const branchTip = repo.refs.heads[branchName] ?? '';
      if (branchTip !== '') {
        // Branche non vide : vérifier que son tip est ancêtre de HEAD
        const headHash = headCommitHash(repo);
        if (!headHash || !isAncestor(repo, branchTip, headHash)) {
          return fail([
            `error: The branch '${branchName}' is not fully merged.`,
            `If you are sure you want to delete it, run 'git branch -D ${branchName}'.`,
          ]);
        }
      }
      // Branche vide (branchTip === '') : autoriser la suppression
    }

    // Récupérer le hash avant suppression pour le message
    const hash = repo.refs.heads[branchName] ?? '';
    const short = hash ? shortHash(hash) : '(no commits)';

    // Supprimer
    delete repo.refs.heads[branchName];

    return ok([`Deleted branch '${branchName}' (was ${short}).`]);
  }

  // Pas de flag de suppression
  const nonFlagArgs = args.filter((a) => !a.startsWith('-'));

  if (nonFlagArgs.length === 0) {
    // Lister les branches
    return listBranches(repo);
  }

  // Créer une branche
  const branchName = nonFlagArgs[0]!;

  if (!isValidBranchName(branchName)) {
    return fail([`fatal: invalid branch name '${branchName}'`]);
  }

  if (branchExists(repo, branchName)) {
    return fail([`fatal: A branch named '${branchName}' already exists.`]);
  }

  // Récupérer le hash de HEAD (peut être "" si branche vide)
  const headHash = headCommitHash(repo) ?? '';
  repo.refs.heads[branchName] = headHash;

  return ok(); // succès muet
}

function listBranches(repo: Repository): CommandResult {
  const current = currentBranch(repo);
  const names = Object.keys(repo.refs.heads).sort();

  const lines = names.map((name) => {
    if (name === current) {
      return `* ${name}`;
    }
    return `  ${name}`;
  });

  return ok(lines);
}
