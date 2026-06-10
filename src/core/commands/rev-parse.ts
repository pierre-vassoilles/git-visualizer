/**
 * git rev-parse <revision>
 *
 * Résout une révision en hash de commit complet (40 chars).
 * Supporte toutes les formes prises en charge par resolveCommitish,
 * y compris @{upstream} / @{u} / <branch>@{u}.
 */

import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { currentBranch, isInitialized, resolveCommitish } from '../repository';
import { notARepo } from './init';

export function cmdRevParse(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  const ref = args[0];
  if (!ref) {
    return fail(['usage: git rev-parse <revision>'], 128);
  }

  // Cas spécial : @{u} ou @{upstream} sans préfixe de branche
  // → déterminer la branche courante et vérifier qu'elle a un upstream
  const upstreamRaw = /^(.*?)@\{(?:upstream|u)\}$/.exec(ref);
  if (upstreamRaw) {
    const branchPrefix = upstreamRaw[1]!;
    let targetBranch: string | null;
    if (branchPrefix === '' || branchPrefix === 'HEAD') {
      targetBranch = currentBranch(repo);
    } else {
      targetBranch = branchPrefix;
    }

    if (!targetBranch) {
      return fail([`fatal: No upstream branch found for HEAD`], 128);
    }

    const upstream = repo.branchUpstream?.[targetBranch];
    if (!upstream) {
      return fail([`fatal: No upstream branch found for '${targetBranch}'`], 128);
    }

    const hash = repo.refs.remotes?.[upstream.remote]?.[upstream.branch] ?? null;
    if (!hash) {
      return fail([
        `fatal: No upstream branch found for '${targetBranch}'`,
      ], 128);
    }

    return ok([hash]);
  }

  const hash = resolveCommitish(repo, ref);
  if (!hash) {
    return fail([`fatal: ambiguous argument '${ref}': unknown revision or path not in the working tree.`], 128);
  }

  return ok([hash]);
}
