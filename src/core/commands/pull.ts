/**
 * git pull [<remote>] [<branch>] [--rebase] [--no-rebase]
 *
 * Combine git fetch + git merge (défaut) ou git rebase (avec --rebase).
 * Réutilise cmdFetch, cmdMerge, cmdRebase.
 */

import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { currentBranch, isInitialized } from '../repository';
import { notARepo } from './init';
import { cmdFetch } from './fetch';
import { cmdMerge } from './merge';
import { cmdRebase } from './rebase';

export function cmdPull(repo: Repository, args: string[]): CommandResult {
  if (!isInitialized(repo)) return notARepo();

  // Initialiser les champs Phase 7 s'ils sont absents
  if (!repo.remotes) repo.remotes = {};
  if (!repo.refs.remotes) repo.refs.remotes = {};
  if (!repo.branchUpstream) repo.branchUpstream = {};

  const rebaseFlag = args.includes('--rebase');
  // --no-rebase force le merge (annule un éventuel flag --rebase, mais on ne gère pas la config)

  // Whitelist des flags supportés : tout autre token en `-` est une erreur (ne
  // jamais avaler un flag inconnu, ex. `--ff-only` qui changerait la sémantique).
  const KNOWN_PULL_FLAGS = new Set(['--rebase', '--no-rebase']);
  const unknownFlag = args.find((a) => a.startsWith('-') && !KNOWN_PULL_FLAGS.has(a));
  if (unknownFlag) {
    return fail([`error: unknown option '${unknownFlag.replace(/^-+/, '')}'`], 129);
  }

  // Filtrer les positionnels (remote / branche)
  const posArgs = args.filter((a) => !a.startsWith('-'));

  let remoteName: string;
  let remoteBranch: string;

  if (posArgs.length >= 2) {
    remoteName = posArgs[0]!;
    remoteBranch = posArgs[1]!;
  } else if (posArgs.length === 1) {
    // git pull <remote> → utilise la branche courante comme cible
    remoteName = posArgs[0]!;
    const cur = currentBranch(repo);
    if (!cur) {
      return fail(['fatal: Cannot pull with a detached HEAD without specifying a branch.'], 1);
    }
    remoteBranch = cur;
  } else {
    // git pull sans args → utiliser l'upstream de la branche courante
    const cur = currentBranch(repo);
    const upstream = cur ? repo.branchUpstream[cur] : null;
    if (!upstream) {
      return fail(
        [
          'fatal: There is no tracking information for the current branch.',
          'Please specify which branch you want to merge with.',
          'See git-pull(1) for details.',
          '',
          '    git pull <remote> <branch>',
        ],
        1,
      );
    }
    remoteName = upstream.remote;
    remoteBranch = upstream.branch;
  }

  // Vérifier que le remote existe AVANT le fetch : message propre à pull, sans
  // dépendre du texte d'erreur de fetch (couplage fragile évité).
  if (!repo.remotes || !repo.remotes[remoteName]) {
    return fail([`fatal: '${remoteName}' does not appear to be a git repository`], 128);
  }

  // Étape 1 : fetch
  const fetchResult = cmdFetch(repo, [remoteName, remoteBranch]);

  // Si le fetch échoue (ex. branche distante inexistante) → propager tel quel.
  if (fetchResult.exitCode !== 0) {
    return fail(fetchResult.errors, fetchResult.exitCode);
  }

  // Référence de suivi distante mise à jour par le fetch
  const integrationRef = `${remoteName}/${remoteBranch}`;

  // Étape 2 : intégration (merge ou rebase)
  let integrationResult: CommandResult;
  if (rebaseFlag) {
    integrationResult = cmdRebase(repo, [integrationRef]);
  } else {
    integrationResult = cmdMerge(repo, [integrationRef]);
  }

  // Combiner les sorties fetch + intégration
  const combinedOutput: string[] = [];

  // Ajouter la sortie du fetch (si non vide / non déjà à jour)
  for (const line of fetchResult.output) {
    if (line !== 'Already up to date.') {
      combinedOutput.push(line);
    }
  }

  // Ajouter la sortie de l'intégration
  for (const line of integrationResult.output) {
    combinedOutput.push(line);
  }

  if (integrationResult.exitCode !== 0) {
    return {
      output: combinedOutput,
      errors: integrationResult.errors,
      exitCode: integrationResult.exitCode,
    };
  }

  return ok(combinedOutput);
}
