/**
 * git diff [options] [<commit> [<commit>]] [-- <pathspec>...]
 *
 * Compare :
 *  - (défaut)            working tree vs index
 *  - --staged / --cached index vs HEAD
 *  - <commit>            working tree vs <commit>
 *  - <commit1> <commit2> <commit1> vs <commit2>
 *
 * Spec : docs/specs/42-diff-show.md.
 */

import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { flattenTree, headCommitHash, isInitialized, resolveCommitish } from '../repository';
import { getCommit } from '../objectStore';
import { hashBlob } from '../objectStore';
import { diffSides, formatFiles, type DiffSide } from '../diff';
import { notARepo } from './init';

// ---------------------------------------------------------------------------
// Construction des « côtés »
// ---------------------------------------------------------------------------

export function workingTreeSide(repo: Repository): DiffSide {
  const side: DiffSide = {};
  for (const [path, entry] of Object.entries(repo.workingTree)) {
    side[path] = { content: entry.content, hash: hashBlob(entry.content), mode: entry.mode };
  }
  return side;
}

export function indexSide(repo: Repository): DiffSide {
  const side: DiffSide = {};
  for (const [path, entry] of Object.entries(repo.index)) {
    side[path] = { content: entry.content, hash: entry.blobHash, mode: entry.mode };
  }
  return side;
}

export function treeSide(repo: Repository, treeHash: string): DiffSide {
  const side: DiffSide = {};
  const files = flattenTree(repo, treeHash); // path → blobHash
  for (const [path, blobHash] of Object.entries(files)) {
    const obj = repo.objects[blobHash];
    const content = obj && obj.type === 'blob' ? obj.content : '';
    side[path] = { content, hash: blobHash, mode: '100644' };
  }
  return side;
}

/** Côté correspondant à l'arbre d'un commit donné (par son hash). */
function commitSide(repo: Repository, commitHash: string): DiffSide {
  const commit = getCommit(repo, commitHash);
  if (!commit) return {};
  return treeSide(repo, commit.tree);
}

// ---------------------------------------------------------------------------
// Filtrage par pathspec
// ---------------------------------------------------------------------------

/** Un chemin est-il connu (working tree, index, ou arbre de HEAD), exact ou répertoire ? */
function isKnownPath(repo: Repository, spec: string): boolean {
  const prefix = spec.endsWith('/') ? spec : `${spec}/`;
  const known = new Set<string>([...Object.keys(repo.workingTree), ...Object.keys(repo.index)]);
  const headHash = headCommitHash(repo);
  if (headHash) {
    const commit = getCommit(repo, headHash);
    if (commit) for (const p of Object.keys(flattenTree(repo, commit.tree))) known.add(p);
  }
  for (const p of known) {
    if (p === spec || p.startsWith(prefix)) return true;
  }
  return false;
}

function matchesPathspec(path: string, specs: string[]): boolean {
  if (specs.length === 0) return true;
  return specs.some((spec) => {
    if (path === spec) return true;
    const prefix = spec.endsWith('/') ? spec : `${spec}/`;
    return path.startsWith(prefix);
  });
}

// ---------------------------------------------------------------------------
// Commande
// ---------------------------------------------------------------------------

const unknownRevision = (ref: string): CommandResult =>
  fail([`fatal: ambiguous argument '${ref}': unknown revision or path not in working tree`], 128);

export function cmdDiff(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // Séparer les pathspecs (après `--`) des autres arguments.
  const dashDash = args.indexOf('--');
  let pathspecs = dashDash === -1 ? [] : args.slice(dashDash + 1);
  const head = dashDash === -1 ? args : args.slice(0, dashDash);

  const staged = head.includes('--staged') || head.includes('--cached');
  const positionals = head.filter((a) => !a.startsWith('-'));

  let oldSide: DiffSide;
  let newSide: DiffSide;

  if (staged) {
    // index vs <commit> (défaut HEAD). CNT-06 : `--staged <commit>` compare le
    // commit donné à l'index, au lieu d'ignorer le positionnel.
    if (positionals.length >= 1) {
      const r = resolveCommitish(repo, positionals[0]!);
      if (!r) return unknownRevision(positionals[0]!);
      oldSide = commitSide(repo, r);
    } else {
      const headHash = headCommitHash(repo);
      oldSide = headHash ? commitSide(repo, headHash) : {};
    }
    newSide = indexSide(repo);
  } else if (positionals.length === 0) {
    // working tree vs index
    oldSide = indexSide(repo);
    newSide = workingTreeSide(repo);
  } else {
    const r1 = resolveCommitish(repo, positionals[0]!);
    if (r1 === null) {
      // CNT-05 : le 1er positionnel n'est pas une révision → repli pathspec
      // (diff working tree vs index restreint à ces chemins), si ce sont bien
      // des chemins connus.
      if (!positionals.every((p) => isKnownPath(repo, p))) {
        return unknownRevision(positionals[0]!);
      }
      oldSide = indexSide(repo);
      newSide = workingTreeSide(repo);
      pathspecs = [...pathspecs, ...positionals];
    } else if (positionals.length === 1) {
      // working tree vs <commit>
      oldSide = commitSide(repo, r1);
      newSide = workingTreeSide(repo);
    } else {
      // <commit1> vs <commit2>
      const r2 = resolveCommitish(repo, positionals[1]!);
      if (!r2) return unknownRevision(positionals[1]!);
      oldSide = commitSide(repo, r1);
      newSide = commitSide(repo, r2);
    }
  }

  const result = diffSides(oldSide, newSide);

  // Filtrer par pathspec si fourni, puis reformater le sous-ensemble retenu.
  if (pathspecs.length > 0) {
    const files = result.files.filter((f) => matchesPathspec(f.path, pathspecs));
    return ok(formatFiles(files));
  }

  return ok(result.rawOutput);
}
