import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  addReflogEntry,
  headCommitHash,
  isInitialized,
  isValidBranchName,
  resolveCommitish,
  tagExists,
} from '../repository';
import { shortHash } from '../sha1';
import { notARepo } from './init';

/**
 * Valide un nom de tag. git applique `check-ref-format` aux tags comme aux
 * branches (NAV-19) → on réutilise `isValidBranchName` (même sous-ensemble :
 * rejette `a..b`, `*.lock`, ` ~^:?*[`, etc.).
 */
function isValidTagName(name: string): boolean {
  return isValidBranchName(name);
}

/**
 * git tag                           — liste tous les tags
 * git tag <tagname>                 — crée un tag léger sur HEAD
 * git tag <tagname> <commit>        — crée un tag léger sur un commit spécifié
 * git tag -d <tagname>              — supprime un tag
 */
export function cmdTag(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // git tag -d <tagname>
  if (args.includes('-d')) {
    const dIdx = args.indexOf('-d');
    const tagName = args[dIdx + 1];
    if (!tagName) {
      return fail(['fatal: tag name required']);
    }
    return deleteTag(repo, tagName);
  }

  const nonFlagArgs = args.filter((a) => !a.startsWith('-'));

  if (nonFlagArgs.length === 0) {
    // Lister les tags
    return listTags(repo);
  }

  if (nonFlagArgs.length === 1) {
    // Créer un tag sur HEAD
    return createTagOnHead(repo, nonFlagArgs[0]!);
  }

  // Créer un tag sur un commit spécifié
  return createTagOnCommit(repo, nonFlagArgs[0]!, nonFlagArgs[1]!);
}

function listTags(repo: Repository): CommandResult {
  const names = Object.keys(repo.refs.tags).sort();
  return ok(names);
}

function createTagOnHead(repo: Repository, tagName: string): CommandResult {
  if (!isValidTagName(tagName)) {
    return fail([`fatal: invalid tag name '${tagName}'`]);
  }

  if (tagExists(repo, tagName)) {
    return fail([`fatal: tag '${tagName}' already exists`]);
  }

  const headHash = headCommitHash(repo);
  if (!headHash) {
    return fail([`fatal: Failed to resolve 'HEAD' as a valid ref.`]);
  }

  repo.refs.tags[tagName] = headHash;
  recordTagCreation(repo, tagName, headHash);
  return ok(); // succès muet
}

function createTagOnCommit(repo: Repository, tagName: string, commitRef: string): CommandResult {
  if (!isValidTagName(tagName)) {
    return fail([`fatal: invalid tag name '${tagName}'`]);
  }

  if (tagExists(repo, tagName)) {
    return fail([`fatal: tag '${tagName}' already exists`]);
  }

  const commitHash = resolveCommitish(repo, commitRef);
  if (!commitHash) {
    return fail([`fatal: object '${commitRef}' is not a commit`]);
  }

  repo.refs.tags[tagName] = commitHash;
  recordTagCreation(repo, tagName, commitHash);
  return ok(); // succès muet
}

function deleteTag(repo: Repository, tagName: string): CommandResult {
  if (!tagExists(repo, tagName)) {
    return fail([`error: tag '${tagName}' not found.`]);
  }

  const hash = repo.refs.tags[tagName]!;
  const short = shortHash(hash);

  // Reflog de suppression (symétrique de la création).
  addReflogEntry(repo, `refs/tags/${tagName}`, {
    oldHash: hash,
    newHash: '',
    action: 'tag',
    description: `Deleted ${tagName}`,
  });

  delete repo.refs.tags[tagName];

  return ok([`Deleted tag '${tagName}' (was ${short}).`]);
}

/** Enregistre une entrée reflog pour la création d'un tag. */
function recordTagCreation(repo: Repository, tagName: string, hash: string): void {
  addReflogEntry(repo, `refs/tags/${tagName}`, {
    oldHash: '',
    newHash: hash,
    action: 'tag',
    description: `Created from ${shortHash(hash)}`,
  });
}
