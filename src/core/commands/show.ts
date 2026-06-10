/**
 * git show [<commit>]
 *
 * Affiche les métadonnées d'un commit (hash, auteur, date, message) suivies du
 * diff vs son premier parent (ou vs l'arbre vide pour le commit initial).
 *
 * Spec : docs/specs/42-diff-show.md.
 */

import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { currentBranch, isInitialized, resolveCommitish } from '../repository';
import { getCommit } from '../objectStore';
import { diffSides } from '../diff';
import { treeSide } from './diff';
import { notARepo } from './init';

export function cmdShow(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  const positionals = args.filter((a) => !a.startsWith('-'));
  const ref = positionals[0] ?? 'HEAD';

  const commitHash = resolveCommitish(repo, ref);
  if (!commitHash) {
    // git show sans argument sur un dépôt vierge → message dédié.
    if (ref === 'HEAD') {
      const branch = currentBranch(repo) ?? 'HEAD';
      return fail([`fatal: your current branch '${branch}' does not have any commits yet`], 128);
    }
    return fail(
      [`fatal: ambiguous argument '${ref}': unknown revision or path not in working tree`],
      128,
    );
  }

  const commit = getCommit(repo, commitHash);
  if (!commit) {
    return fail(
      [`fatal: ambiguous argument '${ref}': unknown revision or path not in working tree`],
      128,
    );
  }

  const out: string[] = [];

  // Métadonnées
  out.push(`commit ${commitHash}`);
  if (commit.parents.length > 1) {
    out.push(`Merge: ${commit.parents.map((p) => p.slice(0, 7)).join(' ')}`);
  }
  out.push(`Author: ${commit.author}`);
  out.push(`Date:   ${commit.date}`);
  out.push('');
  for (const line of commit.message.split('\n')) {
    out.push(`    ${line}`);
  }
  out.push('');

  // Diff vs premier parent (ou arbre vide si commit initial).
  const parentHash = commit.parents[0];
  const oldSide = parentHash ? treeSide(repo, getCommit(repo, parentHash)!.tree) : {};
  const newSide = treeSide(repo, commit.tree);

  const diff = diffSides(oldSide, newSide);
  out.push(...diff.rawOutput);

  return ok(out);
}
