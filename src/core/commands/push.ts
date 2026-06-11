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
      return fail(['fatal: You cannot push a detached HEAD'], 128);
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
    // RMT-04 : push.default=simple refuse si le nom de l'upstream diffère du nom
    // de la branche courante (au lieu de pousser silencieusement vers l'autre nom).
    if (upstream.branch !== cur) {
      return fail(
        [
          'fatal: The upstream branch of your current branch does not match',
          'the name of your current branch. To push to the upstream branch',
          'on the remote, use',
          '',
          `    git push ${upstream.remote} HEAD:${upstream.branch}`,
          '',
          'To push to the branch of the same name on the remote, use',
          '',
          `    git push ${upstream.remote} HEAD`,
        ],
        128,
      );
    }
    remoteName = upstream.remote;
    localBranch = cur;
    remoteBranch = upstream.branch;
  } else if (posArgs.length === 1) {
    // git push <remote> → nécessite un upstream configuré pour la branche
    // courante sur CE remote (push.default=simple). Sinon, git refuse et suggère
    // --set-upstream, au lieu de pousser une branche homonyme.
    remoteName = posArgs[0]!;
    const cur = currentBranch(repo);
    if (!cur) {
      return fail(['fatal: You cannot push a detached HEAD'], 128);
    }
    const upstream = repo.branchUpstream[cur];
    if (!upstream || upstream.remote !== remoteName) {
      return fail(
        [
          `fatal: The current branch ${cur} has no upstream branch.`,
          'To push the current branch and set the remote as upstream, use',
          '',
          `    git push --set-upstream ${remoteName} ${cur}`,
        ],
        128,
      );
    }
    localBranch = cur;
    remoteBranch = upstream.branch;
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

  // RMT-06 : la vérification fast-forward se fait contre la ref RÉELLE du distant
  // (`remote.refs.heads`), pas contre la ref de suivi locale (cache potentiellement
  // périmé). Évite un écrasement silencieux si le distant a bougé sans fetch.
  const remoteHash = remote.refs.heads[remoteBranch] ?? null;

  // Cas : tout déjà à jour
  if (remoteHash && localHash === remoteHash) {
    return ok(['Everything up-to-date.']);
  }

  // Vérification fast-forward
  if (!force && remoteHash) {
    if (!isAncestor(repo, remoteHash, localHash)) {
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

  if (!remoteHash) {
    // Nouvelle branche distante
    output.push(` * [new branch]      ${localBranch} -> ${remoteBranch}`);
  } else if (force && !isAncestor(repo, remoteHash, localHash)) {
    // Force push (non-fast-forward)
    output.push(
      ` + ${shortHash(remoteHash)}...${shortHash(localHash)}  ${localBranch} -> ${remoteBranch} (forced update)`,
    );
  } else {
    // Fast-forward normal
    output.push(
      `   ${shortHash(remoteHash)}..${shortHash(localHash)}  ${localBranch} -> ${remoteBranch}`,
    );
  }

  if (setUpstream) {
    output.push(`Branch '${localBranch}' set up to track '${remoteName}/${remoteBranch}'.`);
  }

  return ok(output);
}
