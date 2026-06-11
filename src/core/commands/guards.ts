import { fail, type CommandResult } from '../types';
import type { Repository } from '../model';
import { getOperationInProgress, listUncommittedPaths } from '../repository';

/**
 * Gardes partagés par les opérations de séquencement (merge / rebase /
 * cherry-pick / revert) pour reproduire deux refus du vrai git :
 *  1. ne pas démarrer une opération tant qu'une autre est en cours ;
 *  2. ne pas écraser des changements non commités.
 * Chaque garde renvoie un `CommandResult` d'échec, ou `null` si la voie est libre.
 */

/** Refuse de démarrer si une autre opération de séquencement est déjà en cours. */
export function refuseIfOperationInProgress(repo: Repository): CommandResult | null {
  const op = getOperationInProgress(repo);
  if (!op) return null;
  return fail(
    [
      `error: ${op} in progress; cannot start another operation.`,
      `hint: finish it with "git ${op} --continue" or cancel with "git ${op} --abort".`,
    ],
    128,
  );
}

/**
 * Refuse une opération qui écraserait des changements non commités sur des
 * fichiers suivis. `verb` est le mot employé dans le message (« merge »,
 * « rebase », « cherry-pick », « revert »). `exitCode` reproduit le code de
 * sortie du vrai git (merge = 2, les autres = 1).
 */
export function refuseIfDirty(repo: Repository, verb: string, exitCode = 1): CommandResult | null {
  const dirty = listUncommittedPaths(repo);
  if (dirty.length === 0) return null;
  return fail(
    [
      `error: Your local changes to the following files would be overwritten by ${verb}:`,
      ...dirty.map((p) => `\t${p}`),
      `Please commit your changes or stash them before you ${verb}.`,
      'Aborting',
    ],
    exitCode,
  );
}
