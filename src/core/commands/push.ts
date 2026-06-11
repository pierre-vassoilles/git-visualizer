/**
 * git push [<remote>] [<branch>] [-u | --set-upstream] [--force | -f]
 *
 * Pousse les commits locaux vers un dépôt distant.
 * - Vérifie le fast-forward (rejette sauf avec --force / -f)
 * - Met à jour remote.refs.heads et repo.refs.remotes
 * - Avec -u / --set-upstream : configure repo.branchUpstream
 */

import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  branchExists,
  copyMissingObjects,
  currentBranch,
  isAncestor,
  isInitialized,
} from '../repository';
import { shortHash } from '../sha1';
import { notARepo } from './init';

export function cmdPush(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // Initialiser les champs Phase 7 s'ils sont absents
  if (!repo.remotes) repo.remotes = {};
  if (!repo.refs.remotes) repo.refs.remotes = {};
  if (!repo.branchUpstream) repo.branchUpstream = {};

  const force = args.includes('--force') || args.includes('-f');
  const setUpstream = args.includes('-u') || args.includes('--set-upstream');

  // Whitelist des flags supportés : tout autre token en `-` est une erreur (ne
  // jamais avaler silencieusement un flag inconnu, ex. `--delete` inverserait
  // l'intention). git rejette les options inconnues (exit 129).
  const KNOWN_PUSH_FLAGS = new Set(['--force', '-f', '-u', '--set-upstream']);
  const unknownFlag = args.find((a) => a.startsWith('-') && !KNOWN_PUSH_FLAGS.has(a));
  if (unknownFlag) {
    return fail([`error: unknown option '${unknownFlag.replace(/^-+/, '')}'`], 129);
  }

  // Filtrer les args non-flags (remote et branch positionnels)
  const posArgs = args.filter((a) => !a.startsWith('-'));

  let remoteName: string;
  let localBranch: string;
  let remoteBranch: string;

  if (posArgs.length === 0) {
    // git push sans args → utiliser l'upstream de la branche courante
    const cur = currentBranch(repo);
    if (!cur) {
      return fail(['error: You cannot push a detached HEAD'], 128);
    }
    const upstream = repo.branchUpstream[cur];
    if (!upstream) {
      return fail(
        [
          `fatal: The current branch ${cur} has no upstream branch.`,
          'To push the current branch and set the remote as upstream, use',
          '',
          `    git push --set-upstream origin ${cur}`,
        ],
        128,
      );
    }
    remoteName = upstream.remote;
    localBranch = cur;
    remoteBranch = upstream.branch;
  } else if (posArgs.length === 1) {
    // git push <remote> → pousse la branche courante vers ce remote
    remoteName = posArgs[0]!;
    const cur = currentBranch(repo);
    if (!cur) {
      return fail(['error: You cannot push a detached HEAD'], 128);
    }
    localBranch = cur;
    remoteBranch = cur;
  } else {
    // git push <remote> <branch>
    remoteName = posArgs[0]!;
    localBranch = posArgs[1]!;
    remoteBranch = localBranch;
  }

  // Vérifier que le remote existe
  const remote = repo.remotes[remoteName];
  if (!remote) {
    return fail([`fatal: No remote named '${remoteName}'`], 128);
  }

  // Vérifier que la branche locale existe
  if (!branchExists(repo, localBranch)) {
    return fail([`fatal: '${localBranch}' - not something we can push`], 128);
  }

  const localHash = repo.refs.heads[localBranch] ?? '';
  if (!localHash) {
    return fail([`fatal: '${localBranch}' - not something we can push`], 128);
  }

  // Récupérer la ref de suivi existante (peut ne pas exister = nouvelle branche)
  const trackingHash = repo.refs.remotes![remoteName]?.[remoteBranch] ?? null;

  // Cas : tout déjà à jour
  if (trackingHash && localHash === trackingHash) {
    return ok(['Everything up-to-date.']);
  }

  // Vérification fast-forward
  if (!force && trackingHash) {
    if (!isAncestor(repo, trackingHash, localHash)) {
      return fail(
        [
          `To ${remote.url}`,
          ` ! [rejected]       ${localBranch} -> ${remoteBranch} (non-fast-forward)`,
          `error: failed to push some refs to '${remote.url}'`,
          `hint: Updates were rejected because the remote contains work that you do`,
          `hint: not have locally. This is usually caused by another repository pushing`,
          `hint: to the same ref. You may want to first integrate the remote changes`,
          `hint: (e.g., 'git pull ...') before pushing again.`,
          `hint: See the 'Notes on fast-forwards' in 'git push --help' for details.`,
        ],
        1,
      );
    }
  }

  // Succès : copier les objets manquants vers le distant
  copyMissingObjects(repo.objects, remote.objects, localHash);

  // Mettre à jour le distant
  remote.refs.heads[remoteBranch] = localHash;

  // Mettre à jour la ref de suivi locale
  if (!repo.refs.remotes![remoteName]) {
    repo.refs.remotes![remoteName] = {};
  }
  repo.refs.remotes![remoteName]![remoteBranch] = localHash;

  // Configurer l'upstream si demandé
  if (setUpstream) {
    repo.branchUpstream[localBranch] = { remote: remoteName, branch: remoteBranch };
  }

  // Construire la sortie
  const output: string[] = [];
  output.push(`To ${remote.url}`);

  if (!trackingHash) {
    // Nouvelle branche distante
    output.push(` * [new branch]      ${localBranch} -> ${remoteBranch}`);
  } else if (force && !isAncestor(repo, trackingHash, localHash)) {
    // Force push (non-fast-forward)
    output.push(
      ` + ${shortHash(trackingHash)}...${shortHash(localHash)}  ${localBranch} -> ${remoteBranch} (forced update)`,
    );
  } else {
    // Fast-forward normal
    output.push(
      `   ${shortHash(trackingHash)}..${shortHash(localHash)}  ${localBranch} -> ${remoteBranch}`,
    );
  }

  if (setUpstream) {
    output.push(`Branch '${localBranch}' set up to track '${remoteName}/${remoteBranch}'.`);
  }

  return ok(output);
}
