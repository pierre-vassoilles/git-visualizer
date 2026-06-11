import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  addReflogEntryForHead,
  buildIndexFromTree,
  buildWorkingTreeFromTree,
  currentBranch,
  flattenTree,
  headCommitHash,
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

  // Séparer un éventuel <commit> des pathspecs. Forme chemin :
  //   git reset [<commit>] [--] <pathspec>...  → désindexe les chemins (RWR-13),
  // sans déplacer HEAD. Désambiguïsation : un `--` sépare ; sinon le 1er token est
  // un commit s'il se résout, et le reste sont des chemins.
  let commitRef = 'HEAD';
  let pathspecs: string[] = [];
  const dd = filteredArgs.indexOf('--');
  if (dd !== -1) {
    const before = filteredArgs.slice(0, dd);
    if (before[0]) commitRef = before[0];
    pathspecs = filteredArgs.slice(dd + 1);
  } else if (filteredArgs.length > 0) {
    if (resolveCommitish(repo, filteredArgs[0]!) !== null) {
      commitRef = filteredArgs[0]!;
      pathspecs = filteredArgs.slice(1);
    } else if (isKnownResetPath(repo, filteredArgs[0]!)) {
      pathspecs = filteredArgs; // le 1er n'est pas une révision mais un chemin connu
    } else {
      // Ni révision ni chemin connu → erreur (comme git).
      return fail(
        [
          `fatal: ambiguous argument '${filteredArgs[0]}': unknown revision or path not in working tree`,
        ],
        128,
      );
    }
  }

  // Résoudre le commit cible.
  const targetHash = resolveCommitish(repo, commitRef);
  if (!targetHash) {
    return fail(
      [`fatal: ambiguous argument '${commitRef}': unknown revision or path not in working tree`],
      128,
    );
  }

  // Forme chemin : désindexer (index ← arbre du commit cible) sans toucher HEAD ni WT.
  if (pathspecs.length > 0) {
    return resetPaths(repo, targetHash, pathspecs);
  }

  const targetCommit = getCommit(repo, targetHash);
  if (!targetCommit) {
    return fail(
      [`fatal: ambiguous argument '${commitRef}': unknown revision or path not in working tree`],
      128,
    );
  }

  const oldHashReset = headCommitHash(repo) ?? '';

  // Déplacer HEAD (et la branche si symbolique)
  const branch = currentBranch(repo);
  if (branch !== null) {
    repo.refs.heads[branch] = targetHash;
  } else {
    // HEAD détaché
    repo.head = { symbolic: false, target: targetHash };
  }

  addReflogEntryForHead(repo, {
    oldHash: oldHashReset,
    newHash: targetHash,
    action: 'reset',
    description: `${mode} ${commitRef}`,
  });

  // Comme le vrai git, `git reset` (tous modes) abandonne une opération en
  // cours : il supprime MERGE_HEAD / CHERRY_PICK_HEAD / REVERT_HEAD. Sans ça,
  // un `git commit` ultérieur depuis un état propre finaliserait à tort un merge
  // (commit à 2 parents fantôme).
  delete repo.merging;
  delete repo.cherryPicking;
  delete repo.reverting;

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

/** Un chemin est-il connu pour `git reset` (index ou arbre de HEAD), exact ou répertoire ? */
function isKnownResetPath(repo: Repository, spec: string): boolean {
  const prefix = spec.endsWith('/') ? spec : `${spec}/`;
  const known = new Set<string>(Object.keys(repo.index));
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

/**
 * RWR-13 : `git reset [<commit>] -- <pathspec>...` — réinitialise les entrées
 * d'index des chemins depuis l'arbre du commit cible (désindexation), SANS
 * déplacer HEAD ni toucher le working tree. Un chemin absent du commit est retiré
 * de l'index.
 */
function resetPaths(repo: Repository, targetHash: string, pathspecs: string[]): CommandResult {
  const targetCommit = getCommit(repo, targetHash);
  if (!targetCommit) {
    return fail([`fatal: could not read commit ${shortHash(targetHash)}`], 128);
  }
  const targetFiles = flattenTree(repo, targetCommit.tree); // path → blobHash
  const candidates = new Set([...Object.keys(repo.index), ...Object.keys(targetFiles)]);

  for (const spec of pathspecs) {
    const prefix = spec.endsWith('/') ? spec : `${spec}/`;
    for (const p of candidates) {
      if (p !== spec && !p.startsWith(prefix)) continue;
      const blob = targetFiles[p];
      if (blob === undefined) {
        delete repo.index[p];
      } else {
        const obj = repo.objects[blob];
        if (obj && obj.type === 'blob') {
          repo.index[p] = { blobHash: blob, content: obj.content, mode: '100644' };
        }
      }
    }
  }
  return ok();
}
