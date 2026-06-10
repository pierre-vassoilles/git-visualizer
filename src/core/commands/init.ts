import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { defaultConfig, isInitialized, VIRTUAL_PATH } from '../repository';

/**
 * git init
 *
 * Initialise un dépôt vierge ou signale une réinitialisation.
 */
export function cmdInit(repo: Repository): CommandResult {
  if (isInitialized(repo)) {
    // Comme le vrai Git : succès (exit 0), message sur stdout, sans préfixe `fatal:`.
    return ok([`Reinitialized existing Git repository in ${VIRTUAL_PATH}`]);
  }

  // Initialiser : créer la branche main (sans commit)
  repo.refs.heads['main'] = '';
  repo.refs.tags = {};
  repo.head = { symbolic: true, target: 'refs/heads/main' };
  repo.index = {};
  repo.workingTree = {};
  repo.objects = {};
  repo.commitCount = 0;
  repo.prevBranch = null;
  repo.config = defaultConfig();

  return ok([`Initialized empty Git repository in ${VIRTUAL_PATH}`]);
}

/** Message d'erreur standard "dépôt non initialisé". */
export function notARepo(): CommandResult {
  return fail(['fatal: not a git repository (or any of the parent directories): .git'], 128);
}
