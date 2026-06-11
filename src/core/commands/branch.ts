import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import {
  addReflogEntry,
  branchExists,
  computeAheadBehind,
  currentBranch,
  headCommitHash,
  isAncestor,
  isHeadDetached,
  isInitialized,
  isValidBranchName,
  resolveCommitish,
} from '../repository';
import { getCommit } from '../objectStore';
import { shortHash } from '../sha1';
import { notARepo } from './init';

/**
 * git branch [<branchname>]
 * git branch -d <branchname>
 * git branch -D <branchname>
 * git branch -v
 * git branch -vv
 * git branch -u <remote>/<branch> [<branchname>]
 * git branch --set-upstream-to=<remote>/<branch> [<branchname>]
 * git branch --unset-upstream [<branchname>]
 */
export function cmdBranch(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // Initialiser les champs Phase 7 s'ils sont absents
  if (!repo.branchUpstream) repo.branchUpstream = {};
  if (!repo.refs.remotes) repo.refs.remotes = {};

  // --unset-upstream [<branchname>]
  if (args.includes('--unset-upstream')) {
    const nonFlagArgs = args.filter((a) => !a.startsWith('-'));
    const targetBranch = nonFlagArgs[0] ?? currentBranch(repo);
    if (!targetBranch) {
      return fail(['fatal: HEAD is detached; specify a branch name'], 128);
    }
    if (!branchExists(repo, targetBranch)) {
      return fail([`error: No such branch '${targetBranch}'`], 128);
    }
    // Idempotent : supprimer si présent
    delete repo.branchUpstream[targetBranch];
    return ok();
  }

  // --set-upstream-to=<remote>/<branch> [<branchname>]
  const setUpstreamTo = args.find((a) => a.startsWith('--set-upstream-to='));
  if (setUpstreamTo) {
    const upstreamValue = setUpstreamTo.slice('--set-upstream-to='.length);
    return setUpstream(repo, args, upstreamValue);
  }

  // -u <remote>/<branch> [<branchname>]
  const uIdx = args.indexOf('-u');
  if (uIdx !== -1) {
    const upstreamValue = args[uIdx + 1];
    if (!upstreamValue) {
      return fail(['fatal: --set-upstream-to requires a tracking branch argument'], 128);
    }
    const remainingArgs = args.filter((_, i) => i !== uIdx && i !== uIdx + 1);
    return setUpstream(repo, remainingArgs, upstreamValue);
  }

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
      return fail([`fatal: Cannot delete the branch '${branchName}' which you are currently on.`]);
    }

    // Pour -d (soft delete), vérifier que la branche est mergée
    if (deleteFlag && !forceDeleteFlag) {
      const branchTip = repo.refs.heads[branchName] ?? '';
      if (branchTip !== '') {
        // Branche non vide : vérifier que son tip est ancêtre de HEAD
        const headHash = headCommitHash(repo);
        if (!headHash || !isAncestor(repo, branchTip, headHash)) {
          return fail([
            `error: The branch '${branchName}' is not fully merged.`,
            `If you are sure you want to delete it, run 'git branch -D ${branchName}'.`,
          ]);
        }
      }
      // Branche vide (branchTip === '') : autoriser la suppression
    }

    // Récupérer le hash avant suppression pour le message
    const hash = repo.refs.heads[branchName] ?? '';
    const short = hash ? shortHash(hash) : '(no commits)';

    // Reflog de suppression (survit à la disparition de la ref, comme git).
    if (hash !== '') {
      addReflogEntry(repo, `refs/heads/${branchName}`, {
        oldHash: hash,
        newHash: '',
        action: 'branch',
        description: `Deleted ${branchName}`,
      });
    }

    // Supprimer
    delete repo.refs.heads[branchName];
    // Nettoyer l'upstream si présent
    delete repo.branchUpstream[branchName];

    return ok([`Deleted branch '${branchName}' (was ${short}).`]);
  }

  // -vv : liste détaillée avec upstream et ahead/behind
  if (args.includes('-vv')) {
    return listBranchesVerbose(repo, true);
  }

  // -v : liste avec hash + message
  if (args.includes('-v')) {
    return listBranchesVerbose(repo, false);
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

  // Point de départ optionnel : `git branch <name> <start-point>`. Sinon HEAD
  // (peut être "" si branche vide / pas encore de commit).
  const startPoint = nonFlagArgs[1];
  let targetHash: string;
  if (startPoint !== undefined) {
    const resolved = resolveCommitish(repo, startPoint);
    if (!resolved) {
      return fail([`fatal: Not a valid object name: '${startPoint}'.`]);
    }
    targetHash = resolved;
  } else {
    const headHash = headCommitHash(repo);
    // NAV-08 : sur un HEAD non-né, git refuse (pas d'objet valide à pointer).
    if (!headHash) {
      return fail([`fatal: Not a valid object name: '${currentBranch(repo) ?? 'HEAD'}'.`], 128);
    }
    targetHash = headHash;
  }
  repo.refs.heads[branchName] = targetHash;

  // Reflog de création (uniquement si la branche pointe sur un commit réel).
  if (targetHash !== '') {
    addReflogEntry(repo, `refs/heads/${branchName}`, {
      oldHash: '',
      newHash: targetHash,
      action: 'branch',
      description: `Created from ${shortHash(targetHash)}`,
    });
  }

  return ok(); // succès muet
}

function listBranches(repo: Repository): CommandResult {
  const current = currentBranch(repo);
  const names = Object.keys(repo.refs.heads).sort();

  const lines: string[] = [];
  // NAV-16 : en HEAD détaché, git affiche d'abord `* (HEAD detached at <short>)`.
  if (isHeadDetached(repo)) {
    lines.push(`* (HEAD detached at ${shortHash(repo.head.target)})`);
  }
  for (const name of names) {
    lines.push(name === current ? `* ${name}` : `  ${name}`);
  }

  return ok(lines);
}

function listBranchesVerbose(repo: Repository, showUpstream: boolean): CommandResult {
  const current = currentBranch(repo);
  const names = Object.keys(repo.refs.heads).sort();

  const lines: string[] = [];
  for (const name of names) {
    const hash = repo.refs.heads[name] ?? '';
    const short = hash ? shortHash(hash) : '(no commits)';

    // Sujet du commit
    let subject = '';
    if (hash) {
      const commit = getCommit(repo, hash);
      if (commit) {
        subject = commit.message.split('\n')[0] ?? '';
      }
    }

    const marker = name === current ? '*' : ' ';

    if (showUpstream) {
      const upstreamInfo = buildUpstreamInfo(repo, name);
      lines.push(`${marker} ${name.padEnd(20)} ${short} ${upstreamInfo}${subject}`);
    } else {
      lines.push(`${marker} ${name.padEnd(20)} ${short} ${subject}`);
    }
  }

  return ok(lines);
}

/**
 * Construit la chaîne d'info upstream pour -vv.
 * Retourne une chaîne du type "[origin/main] " ou "[origin/main: ahead 2, behind 1] " ou "".
 */
function buildUpstreamInfo(repo: Repository, branchName: string): string {
  const upstream = repo.branchUpstream?.[branchName];
  if (!upstream) return '';

  const upstreamLabel = `${upstream.remote}/${upstream.branch}`;
  const remoteHash = repo.refs.remotes?.[upstream.remote]?.[upstream.branch];

  if (!remoteHash) {
    // Gone : la ref distante a disparu
    return `[${upstreamLabel}: gone] `;
  }

  const localHash = repo.refs.heads[branchName] ?? '';
  if (!localHash) {
    return `[${upstreamLabel}] `;
  }

  const { ahead, behind } = computeAheadBehind(repo, localHash, remoteHash);

  if (ahead === 0 && behind === 0) {
    return `[${upstreamLabel}] `;
  }

  const parts: string[] = [];
  if (ahead > 0) parts.push(`ahead ${ahead}`);
  if (behind > 0) parts.push(`behind ${behind}`);

  return `[${upstreamLabel}: ${parts.join(', ')}] `;
}

/**
 * Traite la configuration d'upstream (-u / --set-upstream-to).
 */
function setUpstream(
  repo: Repository,
  remainingArgs: string[],
  upstreamValue: string,
): CommandResult {
  // upstreamValue doit être de la forme <remote>/<branch>
  const slashIdx = upstreamValue.indexOf('/');
  if (slashIdx === -1) {
    return fail([`fatal: upstream branch '${upstreamValue}' does not exist`], 128);
  }
  const remoteName = upstreamValue.slice(0, slashIdx);
  const remoteBranchName = upstreamValue.slice(slashIdx + 1);

  // Vérifier que la ref de suivi distante existe
  const remoteHash = repo.refs.remotes?.[remoteName]?.[remoteBranchName];
  if (!remoteHash) {
    return fail([`fatal: upstream branch '${upstreamValue}' does not exist`], 128);
  }

  // Déterminer la branche locale cible
  const nonFlagArgs = remainingArgs.filter((a) => !a.startsWith('-'));
  const targetBranch = nonFlagArgs[0] ?? currentBranch(repo);
  if (!targetBranch) {
    return fail(['fatal: HEAD is detached; specify a branch name'], 128);
  }

  if (!branchExists(repo, targetBranch)) {
    return fail([`error: No such branch '${targetBranch}'`], 128);
  }

  (repo.branchUpstream ??= {})[targetBranch] = { remote: remoteName, branch: remoteBranchName };

  return ok([`Branch '${targetBranch}' set up to track '${upstreamValue}'.`]);
}
