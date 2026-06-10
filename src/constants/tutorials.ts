/**
 * Catalogue de tutoriels guidés (spec 51) — DONNÉES PURES.
 *
 * Aucune dépendance Vue. Les prédicats de validation viennent des helpers purs
 * de `src/core/tutorial-helpers.ts` et consomment le snapshot en lecture seule.
 */

import {
  type Tutorial,
  hasBranch,
  headPointsTo,
  isInitialized,
  isStaged,
  fileExists,
  commitCountEquals,
  hasCommits,
  noStagedChanges,
  noOperationInProgress,
  all,
} from '@/core/tutorial-helpers';

export const TUTORIALS: Tutorial[] = [
  {
    id: 'first-commit',
    title: 'Premier commit',
    description: 'Apprenez à créer votre premier commit avec Git.',
    duration: 10,
    difficulty: 1,
    suggestedCommands: ['git init', 'write README.md', 'git add README.md', 'git commit -m'],
    steps: [
      {
        id: 'init',
        title: 'Initialiser le dépôt',
        description: 'Commencez par initialiser un nouveau dépôt Git vierge.',
        hint: 'Tapez exactement : git init',
        objectives: [{ description: 'Dépôt initialisé', validate: isInitialized() }],
        successMessage: 'Excellent ! Votre dépôt est prêt.',
      },
      {
        id: 'create-file',
        title: 'Créer un fichier',
        description: 'Créez un fichier README.md avec du contenu via `write README.md "..."`.',
        hint: 'Essayez : write README.md "# Mon projet"',
        objectives: [{ description: 'Fichier README.md créé', validate: fileExists('README.md') }],
        successMessage: 'Fichier créé ! Il faut maintenant le stager.',
      },
      {
        id: 'stage-file',
        title: 'Stager le fichier',
        description: 'Mettez le fichier en staging avec `git add` pour le préparer au commit.',
        hint: 'Commande : git add README.md',
        objectives: [{ description: 'README.md stagé', validate: isStaged('README.md') }],
        successMessage: 'Fichier stagé ! Plus qu’à committer.',
      },
      {
        id: 'commit',
        title: 'Créer le commit',
        description: 'Créez un commit avec `git commit -m "message"`.',
        hint: 'Essayez : git commit -m "Add README"',
        objectives: [
          { description: '1 commit créé', validate: commitCountEquals(1) },
          { description: 'Rien à committer (index propre)', validate: noStagedChanges() },
        ],
        successMessage: 'Bravo ! Vous avez créé votre premier commit !',
      },
    ],
  },
  {
    id: 'branching',
    title: 'Créer et fusionner une branche',
    description: 'Créez une branche, committez dessus, puis fusionnez-la dans main.',
    duration: 20,
    difficulty: 2,
    suggestedCommands: ['git branch', 'git checkout', 'git merge'],
    steps: [
      {
        id: 'setup',
        title: 'Préparer le dépôt',
        description:
          'Initialisez le dépôt et créez un commit initial (write, git add, git commit).',
        hint: 'git init · write file.txt "v1" · git add file.txt · git commit -m "Initial"',
        objectives: [
          {
            description: 'Dépôt initialisé avec 1 commit',
            validate: all(commitCountEquals(1), hasBranch('main')),
          },
        ],
        successMessage: 'Setup terminé !',
      },
      {
        id: 'create-branch',
        title: 'Créer une branche',
        description: 'Créez une branche nommée `feature`.',
        hint: 'Commande : git branch feature',
        objectives: [{ description: "Branche 'feature' créée", validate: hasBranch('feature') }],
        successMessage: 'Branche créée !',
      },
      {
        id: 'switch-branch',
        title: 'Basculer sur la branche',
        description: 'Basculez sur `feature`.',
        hint: 'Commande : git checkout feature',
        objectives: [
          { description: "HEAD pointe sur 'feature'", validate: headPointsTo('feature') },
        ],
        successMessage: 'Vous êtes sur la branche feature !',
      },
      {
        id: 'commit-on-branch',
        title: 'Committer sur la branche',
        description: 'Modifiez un fichier et créez un 2ᵉ commit sur cette branche.',
        hint: 'write file.txt "v2" · git add file.txt · git commit -m "Feature work"',
        objectives: [{ description: '2 commits au total', validate: hasCommits(2) }],
        successMessage: 'Vous avez des changements sur la branche !',
      },
      {
        id: 'switch-main',
        title: 'Retourner sur main',
        description: 'Basculez sur `main`.',
        hint: 'Commande : git checkout main',
        objectives: [{ description: 'HEAD sur main', validate: headPointsTo('main') }],
        successMessage: 'De retour sur main !',
      },
      {
        id: 'merge',
        title: 'Fusionner la branche',
        description: 'Fusionnez `feature` dans `main`.',
        hint: 'Commande : git merge feature',
        objectives: [
          {
            description: 'Feature fusionnée, sans conflit',
            validate: all(hasCommits(2), noOperationInProgress()),
          },
        ],
        successMessage: 'Fusion réussie ! Feature est intégrée dans main.',
      },
    ],
  },
  {
    id: 'undo-reset',
    title: 'Annuler avec reset & reflog',
    description: 'Annulez accidentellement un commit, puis récupérez-le via le reflog.',
    duration: 15,
    difficulty: 2,
    suggestedCommands: ['git reset --hard', 'git reflog'],
    steps: [
      {
        id: 'setup',
        title: 'Créer des commits',
        description: 'Créez un dépôt avec 3 commits.',
        hint: 'Répétez 3× : write fN.txt "..." · git add fN.txt · git commit -m "CN"',
        objectives: [{ description: '3 commits créés', validate: commitCountEquals(3) }],
        successMessage: 'Dépôt prêt !',
      },
      {
        id: 'bad-reset',
        title: 'Oups ! Reset accidentel',
        description: 'Simulez une erreur : `git reset --hard HEAD~1`.',
        hint: 'Commande : git reset --hard HEAD~1',
        objectives: [
          { description: 'HEAD reculé (2 commits visibles)', validate: commitCountEquals(2) },
        ],
        successMessage: 'Oh non ! Le dernier commit semble perdu… mais il est dans le reflog.',
      },
      {
        id: 'check-reflog',
        title: 'Vérifier le reflog',
        description:
          'Regardez l’historique de HEAD avec `git reflog` : vous verrez l’état d’avant le reset.',
        hint: 'Commande : git reflog',
        objectives: [
          // Étape informative : on reste à 2 commits, l'utilisateur observe le reflog.
          {
            description: 'Toujours 2 commits (avant récupération)',
            validate: commitCountEquals(2),
          },
        ],
        successMessage: 'Vous voyez l’entrée HEAD@{1} pointant sur l’ancien commit !',
      },
      {
        id: 'recover',
        title: 'Restaurer via le reflog',
        description: 'Récupérez l’état précédent avec `git reset --hard HEAD@{1}`.',
        hint: 'Commande : git reset --hard HEAD@{1}',
        objectives: [{ description: '3 commits restaurés', validate: commitCountEquals(3) }],
        successMessage: 'Succès ! Vous avez récupéré le commit « perdu » grâce au reflog !',
      },
    ],
  },
];

export function getAllTutorials(): Tutorial[] {
  return TUTORIALS;
}

export function getTutorialById(id: string): Tutorial | null {
  return TUTORIALS.find((t) => t.id === id) ?? null;
}
