/**
 * Catalogue de tutoriels guidés (spec 51 → 62/63) — DONNÉES PURES.
 *
 * Aucune dépendance Vue. Le contenu est bilingue (`LocalizedText`), résolu à
 * l'affichage par `localize()`. Les prédicats de validation viennent des helpers
 * purs de `src/core/tutorial-helpers.ts` (lecture seule du snapshot).
 */

import {
  type Tutorial,
  type TutorialLevel,
  type LocalizedText,
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

/** Sucre pour écrire un `LocalizedText` de façon compacte. */
function L(en: string, fr: string): LocalizedText {
  return { en, fr };
}

export const TUTORIALS: Tutorial[] = [
  // =========================================================================
  // BASIQUE
  // =========================================================================
  {
    id: 'first-commit',
    level: 'basic',
    title: L('First commit', 'Premier commit'),
    description: L(
      'Learn to create your first commit with Git.',
      'Apprenez à créer votre premier commit avec Git.',
    ),
    duration: 10,
    suggestedCommands: ['git init', 'write README.md', 'git add README.md', 'git commit -m'],
    steps: [
      {
        id: 'init',
        title: L('Initialise the repository', 'Initialiser le dépôt'),
        description: L(
          'Start by initialising a brand-new Git repository.',
          'Commencez par initialiser un nouveau dépôt Git vierge.',
        ),
        hint: L('Type exactly: git init', 'Tapez exactement : git init'),
        explanation: L(
          'A Git repository is a container that records the history of your files. `git init` creates the internal structure and the default branch `main`.',
          'Un dépôt Git est un conteneur qui enregistre l’historique de vos fichiers. `git init` crée la structure interne et la branche par défaut `main`.',
        ),
        graphEffect: L(
          'The graph goes from “no repository” to an empty repository ready to receive commits.',
          'Le graphe passe de « pas de dépôt » à un dépôt vide prêt à recevoir des commits.',
        ),
        command: 'git init',
        objectives: [
          {
            description: L('Repository initialised', 'Dépôt initialisé'),
            validate: isInitialized(),
          },
        ],
        successMessage: L('Great! Your repository is ready.', 'Excellent ! Votre dépôt est prêt.'),
      },
      {
        id: 'create-file',
        title: L('Create a file', 'Créer un fichier'),
        description: L(
          'Create a README.md file with some content via `write README.md "..."`.',
          'Créez un fichier README.md avec du contenu via `write README.md "..."`.',
        ),
        hint: L('Try: write README.md "# My project"', 'Essayez : write README.md "# Mon projet"'),
        explanation: L(
          'A commit saves the state of files. Before committing, you need a file in the working tree (`write` is the virtual-FS helper of this terminal).',
          'Un commit sauvegarde l’état des fichiers. Avant de committer, il faut un fichier dans le working tree (`write` est l’utilitaire de FS virtuel de ce terminal).',
        ),
        graphEffect: L(
          'No change yet: the file lives in the working tree, neither staged nor committed.',
          'Aucun changement : le fichier est dans le working tree, ni stagé ni commité.',
        ),
        command: 'write README.md "# My project"',
        objectives: [
          {
            description: L('README.md created', 'Fichier README.md créé'),
            validate: fileExists('README.md'),
          },
        ],
        successMessage: L(
          'File created! Now stage it.',
          'Fichier créé ! Il faut maintenant le stager.',
        ),
      },
      {
        id: 'stage-file',
        title: L('Stage the file', 'Stager le fichier'),
        description: L(
          'Stage the file with `git add` to prepare it for the commit.',
          'Mettez le fichier en staging avec `git add` pour le préparer au commit.',
        ),
        hint: L('Command: git add README.md', 'Commande : git add README.md'),
        explanation: L(
          'The index (“staging area”) is a preparation zone. `git add` copies the modified file into the index, marking it ready to commit.',
          'L’index (« staging area ») est une zone de préparation. `git add` copie le fichier modifié dans l’index, le marquant prêt à committer.',
        ),
        graphEffect: L(
          'No change in the graph (the index is not drawn — only the file status changes).',
          'Aucun changement dans le graphe (l’index n’est pas dessiné — seul le statut du fichier change).',
        ),
        command: 'git add README.md',
        objectives: [
          {
            description: L('README.md staged', 'README.md stagé'),
            validate: isStaged('README.md'),
          },
        ],
        successMessage: L('File staged! Just commit now.', 'Fichier stagé ! Plus qu’à committer.'),
      },
      {
        id: 'commit',
        title: L('Create the commit', 'Créer le commit'),
        description: L(
          'Create a commit with `git commit -m "message"`.',
          'Créez un commit avec `git commit -m "message"`.',
        ),
        hint: L('Try: git commit -m "Add README"', 'Essayez : git commit -m "Add README"'),
        explanation: L(
          '`git commit` takes a permanent snapshot of the index, with a message. The index becomes clean again (aligned with HEAD).',
          '`git commit` prend un instantané permanent de l’index, avec un message. L’index redevient propre (aligné sur HEAD).',
        ),
        graphEffect: L(
          'The graph shows one node: commit C1 labelled `(main, HEAD)`.',
          'Le graphe affiche un nœud : le commit C1 avec le label `(main, HEAD)`.',
        ),
        command: 'git commit -m "Add README"',
        objectives: [
          { description: L('1 commit created', '1 commit créé'), validate: commitCountEquals(1) },
          {
            description: L('Nothing to commit (clean index)', 'Rien à committer (index propre)'),
            validate: noStagedChanges(),
          },
        ],
        successMessage: L(
          'Well done! You created your first commit!',
          'Bravo ! Vous avez créé votre premier commit !',
        ),
      },
    ],
  },

  // =========================================================================
  // MOYEN
  // =========================================================================
  {
    id: 'branching',
    level: 'medium',
    title: L('Create and merge a branch', 'Créer et fusionner une branche'),
    description: L(
      'Create a branch, commit on it, then merge it back into main.',
      'Créez une branche, committez dessus, puis fusionnez-la dans main.',
    ),
    duration: 20,
    suggestedCommands: ['git branch', 'git checkout', 'git merge'],
    steps: [
      {
        id: 'setup',
        title: L('Prepare the repository', 'Préparer le dépôt'),
        description: L(
          'Initialise the repo and create an initial commit.',
          'Initialisez le dépôt et créez un commit initial.',
        ),
        hint: L(
          'git init · write file.txt "v1" · git add file.txt · git commit -m "Initial"',
          'git init · write file.txt "v1" · git add file.txt · git commit -m "Initial"',
        ),
        explanation: L(
          'Setup: we need a starting commit so the branch has something to diverge from.',
          'Préparation : il faut un commit de départ pour que la branche ait un point de divergence.',
        ),
        graphEffect: L('The graph shows C1 (main, HEAD).', 'Le graphe affiche C1 (main, HEAD).'),
        command: 'git init ; write file.txt "v1" ; git add file.txt ; git commit -m "Initial"',
        objectives: [
          {
            description: L(
              'Repository initialised with 1 commit',
              'Dépôt initialisé avec 1 commit',
            ),
            validate: all(commitCountEquals(1), hasBranch('main')),
          },
        ],
        successMessage: L('Setup complete!', 'Setup terminé !'),
      },
      {
        id: 'create-branch',
        title: L('Create a branch', 'Créer une branche'),
        description: L('Create a branch named `feature`.', 'Créez une branche nommée `feature`.'),
        hint: L('Command: git branch feature', 'Commande : git branch feature'),
        explanation: L(
          '`git branch <name>` creates a new branch pointing at the current commit (HEAD). HEAD does not move.',
          '`git branch <nom>` crée une nouvelle branche pointant sur le commit courant (HEAD). HEAD ne bouge pas.',
        ),
        graphEffect: L(
          'Two branch labels on C1: `main` (with HEAD) and `feature`.',
          'Deux labels de branche sur C1 : `main` (avec HEAD) et `feature`.',
        ),
        command: 'git branch feature',
        objectives: [
          {
            description: L("Branch 'feature' created", "Branche 'feature' créée"),
            validate: hasBranch('feature'),
          },
        ],
        successMessage: L('Branch created!', 'Branche créée !'),
      },
      {
        id: 'switch-branch',
        title: L('Switch to the branch', 'Basculer sur la branche'),
        description: L('Switch to `feature`.', 'Basculez sur `feature`.'),
        hint: L('Command: git checkout feature', 'Commande : git checkout feature'),
        explanation: L(
          '`git checkout <branch>` moves HEAD: you now work on `feature`. New commits will go there.',
          '`git checkout <branche>` déplace HEAD : vous travaillez maintenant sur `feature`. Les nouveaux commits iront dessus.',
        ),
        graphEffect: L(
          'HEAD moves onto feature (still on C1).',
          'HEAD se déplace sur feature (toujours sur C1).',
        ),
        command: 'git checkout feature',
        objectives: [
          {
            description: L("HEAD points to 'feature'", "HEAD pointe sur 'feature'"),
            validate: headPointsTo('feature'),
          },
        ],
        successMessage: L('You are on the feature branch!', 'Vous êtes sur la branche feature !'),
      },
      {
        id: 'commit-on-branch',
        title: L('Commit on the branch', 'Committer sur la branche'),
        description: L(
          'Modify a file and create a 2nd commit on this branch.',
          'Modifiez un fichier et créez un 2ᵉ commit sur cette branche.',
        ),
        hint: L(
          'write file.txt "v2" · git add file.txt · git commit -m "Feature work"',
          'write file.txt "v2" · git add file.txt · git commit -m "Feature work"',
        ),
        explanation: L(
          'Commits go to the current branch (feature). The graph diverges: main and feature split apart.',
          'Les commits vont sur la branche courante (feature). Le graphe diverge : main et feature se séparent.',
        ),
        graphEffect: L(
          'Graph shows C1 (main) ← C2 (feature, HEAD).',
          'Le graphe affiche C1 (main) ← C2 (feature, HEAD).',
        ),
        command: 'write file.txt "v2" ; git add file.txt ; git commit -m "Feature work"',
        objectives: [
          { description: L('2 commits in total', '2 commits au total'), validate: hasCommits(2) },
        ],
        successMessage: L(
          'You have changes on the branch!',
          'Vous avez des changements sur la branche !',
        ),
      },
      {
        id: 'switch-main',
        title: L('Go back to main', 'Retourner sur main'),
        description: L('Switch back to `main`.', 'Basculez sur `main`.'),
        hint: L('Command: git checkout main', 'Commande : git checkout main'),
        explanation: L(
          'You merge INTO the current branch, so switch back to main before merging feature.',
          'On fusionne DANS la branche courante : revenez sur main avant de fusionner feature.',
        ),
        graphEffect: L('HEAD moves back onto main (C1).', 'HEAD revient sur main (C1).'),
        command: 'git checkout main',
        objectives: [
          { description: L('HEAD on main', 'HEAD sur main'), validate: headPointsTo('main') },
        ],
        successMessage: L('Back on main!', 'De retour sur main !'),
      },
      {
        id: 'merge',
        title: L('Merge the branch', 'Fusionner la branche'),
        description: L('Merge `feature` into `main`.', 'Fusionnez `feature` dans `main`.'),
        hint: L('Command: git merge feature', 'Commande : git merge feature'),
        explanation: L(
          'Since main has not moved, `git merge feature` fast-forwards main to feature’s tip — no merge commit needed here.',
          'Comme main n’a pas bougé, `git merge feature` avance (fast-forward) main jusqu’au tip de feature — pas de commit de fusion nécessaire ici.',
        ),
        graphEffect: L(
          'main moves up to C2: main and feature now point to the same commit.',
          'main avance jusqu’à C2 : main et feature pointent désormais le même commit.',
        ),
        command: 'git merge feature',
        objectives: [
          {
            description: L('Feature merged, no conflict', 'Feature fusionnée, sans conflit'),
            validate: all(hasCommits(2), noOperationInProgress()),
          },
        ],
        successMessage: L(
          'Merge successful! Feature is integrated into main.',
          'Fusion réussie ! Feature est intégrée dans main.',
        ),
      },
    ],
  },

  // =========================================================================
  // AVANCÉ
  // =========================================================================
  {
    id: 'undo-reset',
    level: 'advanced',
    title: L('Undo with reset & reflog', 'Annuler avec reset & reflog'),
    description: L(
      'Accidentally drop a commit, then recover it via the reflog.',
      'Annulez accidentellement un commit, puis récupérez-le via le reflog.',
    ),
    duration: 15,
    suggestedCommands: ['git reset --hard', 'git reflog'],
    steps: [
      {
        id: 'setup',
        title: L('Create commits', 'Créer des commits'),
        description: L('Create a repository with 3 commits.', 'Créez un dépôt avec 3 commits.'),
        hint: L(
          'Repeat 3×: write fN.txt "..." · git add fN.txt · git commit -m "CN"',
          'Répétez 3× : write fN.txt "..." · git add fN.txt · git commit -m "CN"',
        ),
        explanation: L(
          'Setup: three commits so there is history to lose and recover.',
          'Préparation : trois commits pour avoir un historique à perdre puis récupérer.',
        ),
        graphEffect: L(
          'Graph shows C1 ← C2 ← C3 (main, HEAD).',
          'Le graphe affiche C1 ← C2 ← C3 (main, HEAD).',
        ),
        command:
          'git init ; write f1.txt "1" ; git add f1.txt ; git commit -m "C1" ; write f2.txt "2" ; git add f2.txt ; git commit -m "C2" ; write f3.txt "3" ; git add f3.txt ; git commit -m "C3"',
        objectives: [
          {
            description: L('3 commits created', '3 commits créés'),
            validate: commitCountEquals(3),
          },
        ],
        successMessage: L('Repository ready!', 'Dépôt prêt !'),
      },
      {
        id: 'bad-reset',
        title: L('Oops! Accidental reset', 'Oups ! Reset accidentel'),
        description: L(
          'Simulate a mistake: `git reset --hard HEAD~1`.',
          'Simulez une erreur : `git reset --hard HEAD~1`.',
        ),
        hint: L('Command: git reset --hard HEAD~1', 'Commande : git reset --hard HEAD~1'),
        explanation: L(
          '`git reset --hard HEAD~1` moves the branch back one commit and discards the working changes. The commit looks lost — but it still exists in the reflog.',
          '`git reset --hard HEAD~1` recule la branche d’un commit et jette les modifications. Le commit semble perdu — mais il existe encore dans le reflog.',
        ),
        graphEffect: L(
          'main and HEAD move back to C2; C3 is no longer reachable from HEAD.',
          'main et HEAD reculent sur C2 ; C3 n’est plus accessible depuis HEAD.',
        ),
        command: 'git reset --hard HEAD~1',
        objectives: [
          {
            description: L(
              'HEAD moved back (2 commits visible)',
              'HEAD reculé (2 commits visibles)',
            ),
            validate: commitCountEquals(2),
          },
        ],
        successMessage: L(
          'Oh no! The last commit seems gone… but it is in the reflog.',
          'Oh non ! Le dernier commit semble perdu… mais il est dans le reflog.',
        ),
      },
      {
        id: 'check-reflog',
        title: L('Check the reflog', 'Vérifier le reflog'),
        description: L(
          'Look at HEAD’s history with `git reflog`: you will see the state before the reset.',
          'Regardez l’historique de HEAD avec `git reflog` : vous verrez l’état d’avant le reset.',
        ),
        hint: L('Command: git reflog', 'Commande : git reflog'),
        explanation: L(
          'The reflog records every move of HEAD. `HEAD@{1}` is where HEAD was just before the reset — your safety net.',
          'Le reflog enregistre chaque déplacement de HEAD. `HEAD@{1}` est l’endroit où HEAD était juste avant le reset — votre filet de sécurité.',
        ),
        graphEffect: L(
          'No graph change (reflog is a textual log, not drawn).',
          'Aucun changement du graphe (le reflog est un journal textuel, non dessiné).',
        ),
        command: 'git reflog',
        objectives: [
          {
            description: L(
              'Still 2 commits (before recovery)',
              'Toujours 2 commits (avant récupération)',
            ),
            validate: commitCountEquals(2),
          },
        ],
        successMessage: L(
          'You can see the HEAD@{1} entry pointing to the old commit!',
          'Vous voyez l’entrée HEAD@{1} pointant sur l’ancien commit !',
        ),
      },
      {
        id: 'recover',
        title: L('Recover via the reflog', 'Restaurer via le reflog'),
        description: L(
          'Recover the previous state with `git reset --hard HEAD@{1}`.',
          'Récupérez l’état précédent avec `git reset --hard HEAD@{1}`.',
        ),
        hint: L('Command: git reset --hard HEAD@{1}', 'Commande : git reset --hard HEAD@{1}'),
        explanation: L(
          '`git reset --hard HEAD@{1}` moves the branch back to where HEAD was before the bad reset, recovering the “lost” commit.',
          '`git reset --hard HEAD@{1}` ramène la branche là où HEAD était avant le mauvais reset, récupérant le commit « perdu ».',
        ),
        graphEffect: L(
          'main and HEAD jump back to C3: the commit is restored.',
          'main et HEAD reviennent sur C3 : le commit est restauré.',
        ),
        command: 'git reset --hard HEAD@{1}',
        objectives: [
          {
            description: L('3 commits restored', '3 commits restaurés'),
            validate: commitCountEquals(3),
          },
        ],
        successMessage: L(
          'Success! You recovered the “lost” commit thanks to the reflog!',
          'Succès ! Vous avez récupéré le commit « perdu » grâce au reflog !',
        ),
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

/** Tutoriels d'un niveau donné (pour le catalogue groupé de l'UI). */
export function getTutorialsByLevel(level: TutorialLevel): Tutorial[] {
  return TUTORIALS.filter((t) => t.level === level);
}
