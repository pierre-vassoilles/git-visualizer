/**
 * git clone <source>
 *
 * Clone un dépôt prédéfini dans le dépôt local courant (qui doit être vide).
 *
 * Processus :
 * 1. Vérifier que le dépôt local n'est pas déjà initialisé
 * 2. Chercher la source dans le catalogue des dépôts prédéfinis
 * 3. Initialiser le dépôt local (comme git init)
 * 4. Créer remotes.origin = copie de la source
 * 5. Copier tous les objets de la source vers repo.objects
 * 6. Poser refs.remotes.origin[b] = hash pour chaque branche de la source
 * 7. Déterminer la branche par défaut (getDefaultBranch)
 * 8. Créer la branche locale + upstream (si branche par défaut existe)
 * 9. Positionner HEAD
 * 10. Remplir index + working tree (via applyTreeToRepo)
 */

import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';
import { isInitialized, copyMissingObjects, getDefaultBranch, headCommitHash } from '../repository';
import { applyTreeToRepo } from '../repository';
import { getPredefinedRemote } from '../../constants/predefinedRemotes';
import { VIRTUAL_PATH } from '../repository';

export function cmdClone(repo: Repository, args: string[]): CommandResult {
  const source = args[0];

  if (!source) {
    return fail(['error: you must specify a repository to clone.'], 128);
  }

  // Refuser si le dépôt est déjà initialisé
  if (isInitialized(repo)) {
    return fail([`fatal: destination path '.' already exists and is not an empty directory.`], 128);
  }

  // Chercher la source dans le catalogue
  const remote = getPredefinedRemote(source);
  if (!remote) {
    return fail([`fatal: repository '${source}' not found`], 128);
  }

  // 1. Initialiser le dépôt local (sans créer main d'emblée — on va poser HEAD dessus)
  repo.objects = {};
  repo.refs.heads = {};
  repo.refs.tags = {};
  repo.refs.remotes = {};
  repo.index = {};
  repo.workingTree = {};
  repo.commitCount = 0;
  repo.prevBranch = null;
  repo.remotes = {};
  repo.branchUpstream = {};

  const output: string[] = [`Cloning into '${source}'...`];

  // 2. Stocker la copie du remote sous origin
  repo.remotes['origin'] = remote;
  repo.refs.remotes['origin'] = {};

  // 3. Copier tous les objets de la source vers repo.objects
  // On parcourt toutes les branches pour s'assurer de tout copier
  for (const branchHash of Object.values(remote.refs.heads)) {
    if (branchHash) {
      copyMissingObjects(remote.objects, repo.objects, branchHash);
    }
  }
  // Si HEAD détaché, copier depuis le commit pointé
  if (!remote.head.symbolic && remote.head.target) {
    copyMissingObjects(remote.objects, repo.objects, remote.head.target);
  }

  // 4. Poser refs.remotes.origin pour chaque branche distante
  for (const [branch, hash] of Object.entries(remote.refs.heads)) {
    if (hash) {
      repo.refs.remotes['origin']![branch] = hash;
    }
  }

  // 5. Déterminer la branche par défaut
  const defaultBranch = getDefaultBranch(remote);

  if (defaultBranch && remote.refs.heads[defaultBranch]) {
    const tipHash = remote.refs.heads[defaultBranch]!;

    // Créer la branche locale
    repo.refs.heads[defaultBranch] = tipHash;

    // Poser l'upstream
    repo.branchUpstream![defaultBranch] = { remote: 'origin', branch: defaultBranch };

    // Positionner HEAD symbolique
    repo.head = { symbolic: true, target: `refs/heads/${defaultBranch}` };

    // Remplir index + working tree depuis l'arbre du tip
    applyTreeToRepo(repo, tipHash);

    output.push(`Done.`);
  } else if (!remote.head.symbolic && remote.head.target) {
    // HEAD détachée côté source → clone détaché
    repo.head = { symbolic: false, target: remote.head.target };
    applyTreeToRepo(repo, remote.head.target);

    output.push(`Note: you are in 'detached HEAD' state.`);
    output.push(`Done.`);
  } else {
    // Aucune branche — dépôt vide
    repo.head = { symbolic: true, target: 'refs/heads/main' };
    output.push(`warning: You appear to have cloned an empty repository.`);
    output.push(`Done.`);
  }

  // Marquer comme initialisé : si refs.heads est vide et HEAD symbolique,
  // on marque la branche par défaut comme vide (comme git init)
  const currentTarget = repo.head.symbolic ? repo.head.target : null;
  if (currentTarget) {
    const branchName = currentTarget.replace('refs/heads/', '');
    if (!(branchName in repo.refs.heads)) {
      repo.refs.heads[branchName] = headCommitHash(repo) ?? '';
    }
  }

  output.push(`Initialized in ${VIRTUAL_PATH}`);

  return ok(output);
}
