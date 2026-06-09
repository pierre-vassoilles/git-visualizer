import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  buildIndexFromTree,
  buildWorkingTreeFromTree,
  currentBranch,
  isInitialized,
  resolveCommitish,
} from '../repository';
import { getCommit } from '../objectStore';
import { shortHash } from '../sha1';
import { notARepo } from './init';

/**
 * git reset [--soft | --mixed | --hard] [<commit>]
 *
 * Modes :
 *   --soft  : déplace HEAD uniquement (index et WT inchangés)
 *   --mixed : déplace HEAD + réinitialise l'index (WT inchangé) [défaut]
 *   --hard  : déplace HEAD + réinitialise index et WT
 */
export function cmdReset(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // Parser les options
  let mode: 'soft' | 'mixed' | 'hard' = 'mixed';
  const filteredArgs: string[] = [];

  for (const arg of args) {
    if (arg === '--soft') {
      mode = 'soft';
    } else if (arg === '--mixed') {
      mode = 'mixed';
    } else if (arg === '--hard') {
      mode = 'hard';
    } else {
      filteredArgs.push(arg);
    }
  }

  // L'argument commit (par défaut HEAD)
  const commitRef = filteredArgs[0] ?? 'HEAD';

  // Résoudre le commit
  const targetHash = resolveCommitish(repo, commitRef);
  if (!targetHash) {
    return fail(
      [
        `fatal: ambiguous argument '${commitRef}': unknown revision or path not in working tree`,
      ],
      128,
    );
  }

  const targetCommit = getCommit(repo, targetHash);
  if (!targetCommit) {
    return fail(
      [
        `fatal: ambiguous argument '${commitRef}': unknown revision or path not in working tree`,
      ],
      128,
    );
  }

  // Déplacer HEAD (et la branche si symbolique)
  const branch = currentBranch(repo);
  if (branch !== null) {
    repo.refs.heads[branch] = targetHash;
  } else {
    // HEAD détaché
    repo.head = { symbolic: false, target: targetHash };
  }

  // Mode --mixed ou --hard : réinitialiser l'index
  if (mode === 'mixed' || mode === 'hard') {
    repo.index = buildIndexFromTree(repo, targetCommit.tree);
  }

  // Mode --hard : réinitialiser aussi le working tree
  if (mode === 'hard') {
    repo.workingTree = buildWorkingTreeFromTree(repo, targetCommit.tree);
    const short = shortHash(targetHash);
    const firstLine = targetCommit.message.split('\n')[0] ?? targetCommit.message;
    return ok([`HEAD is now at ${short} ${firstLine}`]);
  }

  return ok();
}
