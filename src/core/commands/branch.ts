import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { branchExists, currentBranch, headCommitHash, isInitialized } from '../repository';
import { shortHash } from '../sha1';
import { notARepo } from './init';

/**
 * Valide un nom de branche.
 * Rejette : vide, commençant par '-', contenant '/', noms réservés.
 */
function isValidBranchName(name: string): boolean {
  if (!name || name.trim() === '') return false;
  if (name.startsWith('-')) return false;
  if (name.includes('/')) return false;
  const reserved = ['HEAD', 'FETCH_HEAD', 'ORIG_HEAD', 'MERGE_HEAD', 'CHERRY_PICK_HEAD'];
  if (reserved.includes(name)) return false;
  return true;
}

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
