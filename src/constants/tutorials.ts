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
  operationInProgress,
  all,
  isHeadDetached,
  hasTag,
  hasStashCount,
  branchHasUpstream,
  hasRemote,
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
  // BASIQUE (continued)
  // =========================================================================
  {
    id: 'staging-area',
    level: 'basic',
    title: L('Staging area', 'Zone de staging'),
    description: L(
      'Understand the index (staging area): working tree vs index vs HEAD. Learn to stage partially, view differences, and restore.',
      "Comprenez le rôle de l'index (staging area) : working tree vs index vs HEAD. Apprenez à stager partiellement, visualiser les différences et restaurer.",
    ),
    duration: 15,
    suggestedCommands: ['git add', 'git diff --staged', 'git restore --staged'],
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
          'Setup: we need a starting commit so we can demonstrate staging workflows.',
          'Préparation : il faut un commit de départ pour démontrer les workflows de staging.',
        ),
        graphEffect: L('The graph shows C1 (main, HEAD).', 'Le graphe affiche C1 (main, HEAD).'),
        command: 'git init ; write file.txt "v1" ; git add file.txt ; git commit -m "Initial"',
        objectives: [
          { description: L('Repository ready', 'Dépôt prêt'), validate: commitCountEquals(1) },
        ],
        successMessage: L('Setup complete!', 'Setup terminé !'),
      },
      {
        id: 'modify-file',
        title: L('Modify a file', 'Modifier un fichier'),
        description: L(
          'Change the file in the working tree.',
          'Modifiez le fichier dans le working tree.',
        ),
        hint: L('Command: write file.txt "v2"', 'Commande : write file.txt "v2"'),
        explanation: L(
          'A modification first lives only in the working tree. It does not affect the index or HEAD.',
          "Une modification existe d'abord seulement dans le working tree. Elle n'affecte pas l'index ni HEAD.",
        ),
        graphEffect: L('No change in the graph.', 'Aucun changement dans le graphe.'),
        command: 'write file.txt "v2"',
        objectives: [
          { description: L('File modified', 'Fichier modifié'), validate: fileExists('file.txt') },
        ],
        successMessage: L('File changed!', 'Fichier changé !'),
      },
      {
        id: 'stage-file',
        title: L('Stage a new file', 'Stager un nouveau fichier'),
        description: L(
          'Create a new file and stage it with `git add` to observe the "staged" status.',
          'Créez un nouveau fichier et stagez-le avec `git add` pour observer le statut "staged".',
        ),
        hint: L(
          'write draft.txt "draft content" · git add draft.txt',
          'write draft.txt "draft content" · git add draft.txt',
        ),
        explanation: L(
          'The index is a preparation zone. `git add` marks a new file as "staged" (ready to commit). Note: modifying an already-tracked file and staging it does not appear as "staged" in the status; only new files do.',
          'L\'index est une zone de préparation. `git add` marque un nouveau fichier comme "staged" (prêt à committer). Note : modifier un fichier déjà suivi et le stager n\'apparaît pas comme "staged" dans le statut ; seuls les nouveaux fichiers le font.',
        ),
        graphEffect: L('No change in the graph.', 'Aucun changement dans le graphe.'),
        command: 'write draft.txt "draft content" ; git add draft.txt',
        objectives: [
          {
            description: L('New file staged', 'Nouveau fichier stagé'),
            validate: isStaged('draft.txt'),
          },
        ],
        successMessage: L('File staged!', 'Fichier stagé !'),
      },
      {
        id: 'view-staged-diff',
        title: L('View staged changes', 'Voir les changements stagés'),
        description: L(
          'View the diff of staged changes with `git diff --staged`.',
          'Affichez le diff des changements stagés avec `git diff --staged`.',
        ),
        hint: L('Command: git diff --staged', 'Commande : git diff --staged'),
        explanation: L(
          '`git diff --staged` shows changes in the index compared to HEAD. This is what will be committed. Useful for reviewing before commit.',
          "`git diff --staged` affiche les changements dans l'index comparés à HEAD. C'est ce qui sera commité. Utile pour relire avant le commit.",
        ),
        graphEffect: L('No change in the graph.', 'Aucun changement dans le graphe.'),
        command: 'git diff --staged',
        objectives: [
          {
            description: L('Staged file visible', 'Fichier stagé visible'),
            validate: isStaged('draft.txt'),
          },
        ],
        successMessage: L('Diff reviewed!', 'Diff relu !'),
      },
      {
        id: 'restore-staged',
        title: L('Restore from staging', 'Restaurer le staging'),
        description: L(
          'Remove the file from staging with `git restore --staged`.',
          'Retirez le fichier du staging avec `git restore --staged`.',
        ),
        hint: L(
          'Command: git restore --staged draft.txt',
          'Commande : git restore --staged draft.txt',
        ),
        explanation: L(
          '`git restore --staged` unstages a file: the index is cleaned, while the working tree keeps the modification. Useful for fixing accidental adds.',
          "`git restore --staged` désindex un fichier : l'index est nettoyé, tandis que le working tree garde la modification. Utile pour corriger une add accidentelle.",
        ),
        graphEffect: L('No change in the graph.', 'Aucun changement dans le graphe.'),
        command: 'git restore --staged draft.txt',
        objectives: [
          {
            description: L('Index clean', 'Index propre'),
            validate: noStagedChanges(),
          },
        ],
        successMessage: L(
          'Unstaged! The index is now clean, but your modification remains in the working tree.',
          "Déstagé ! L'index est maintenant propre, mais votre modification reste dans le working tree.",
        ),
      },
    ],
  },

  {
    id: 'branches-basics',
    level: 'basic',
    title: L('Branches basics', 'Bases des branches'),
    description: L(
      'Learn to create, list, and navigate between branches. Understand the role of HEAD.',
      'Apprenez à créer, lister et naviguer entre les branches. Comprenez le rôle de HEAD.',
    ),
    duration: 12,
    suggestedCommands: ['git branch', 'git checkout'],
    steps: [
      {
        id: 'setup',
        title: L('Prepare the repository', 'Préparer le dépôt'),
        description: L(
          'Initialise the repo and create an initial commit.',
          'Initialisez le dépôt et créez un commit initial.',
        ),
        hint: L(
          'git init · write f.txt "x" · git add f.txt · git commit -m "C1"',
          'git init · write f.txt "x" · git add f.txt · git commit -m "C1"',
        ),
        explanation: L(
          'Setup: create a starting point for branches to diverge from.',
          'Préparation : créer un point de départ pour que les branches divergent.',
        ),
        graphEffect: L(
          'Graph shows C1 with HEAD → main.',
          'Le graphe affiche C1 avec HEAD → main.',
        ),
        command: 'git init ; write f.txt "x" ; git add f.txt ; git commit -m "C1"',
        objectives: [
          {
            description: L('Repository initialized', 'Dépôt initialisé'),
            validate: all(commitCountEquals(1), headPointsTo('main')),
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
          '`git branch <name>` creates a new branch pointing at the current commit (HEAD). HEAD remains unchanged — it still points main.',
          '`git branch <nom>` crée une nouvelle branche pointant sur le commit courant (HEAD). HEAD ne change pas — il pointe toujours main.',
        ),
        graphEffect: L(
          'Two branches on C1: `main` (with HEAD) and `feature`.',
          'Deux branches sur C1 : `main` (avec HEAD) et `feature`.',
        ),
        command: 'git branch feature',
        objectives: [
          {
            description: L('Branch created', 'Branche créée'),
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
          '`git checkout <branch>` moves HEAD to point that branch. You now work on `feature`. New commits will be created on this branch.',
          '`git checkout <branche>` déplace HEAD pour pointer cette branche. Vous travaillez maintenant sur `feature`. Les nouveaux commits seront créés sur cette branche.',
        ),
        graphEffect: L(
          'HEAD moves onto feature (still on C1).',
          'HEAD se déplace sur feature (toujours sur C1).',
        ),
        command: 'git checkout feature',
        objectives: [
          {
            description: L('HEAD on feature', 'HEAD sur feature'),
            validate: headPointsTo('feature'),
          },
        ],
        successMessage: L('You are now on feature!', 'Vous êtes maintenant sur feature !'),
      },
      {
        id: 'commit-on-branch',
        title: L('Commit on the branch', 'Committer sur la branche'),
        description: L(
          'Create a second commit on feature.',
          'Créez un deuxième commit sur feature.',
        ),
        hint: L(
          'write f.txt "y" · git add f.txt · git commit -m "C2"',
          'write f.txt "y" · git add f.txt · git commit -m "C2"',
        ),
        explanation: L(
          'Commits go to the current branch. The graph diverges: main and feature now split apart.',
          'Les commits vont sur la branche courante. Le graphe diverge : main et feature se séparent maintenant.',
        ),
        graphEffect: L(
          'Graph shows C1 ← C2 (feature, HEAD) and C1 (main).',
          'Le graphe affiche C1 ← C2 (feature, HEAD) et C1 (main).',
        ),
        command: 'write f.txt "y" ; git add f.txt ; git commit -m "C2"',
        objectives: [
          { description: L('2 commits total', '2 commits au total'), validate: hasCommits(2) },
        ],
        successMessage: L('Changes on feature branch!', 'Changements sur la branche feature !'),
      },
      {
        id: 'return-to-main',
        title: L('Return to main', 'Retourner sur main'),
        description: L('Switch back to `main`.', 'Retournez sur `main`.'),
        hint: L('Command: git checkout main', 'Commande : git checkout main'),
        explanation: L(
          'Before merging, switch back to the target branch (main). Merges happen in the current branch.',
          'Avant de fusionner, revenez sur la branche cible (main). Les fusions se font dans la branche courante.',
        ),
        graphEffect: L('HEAD moves back onto main (C1).', 'HEAD revient sur main (C1).'),
        command: 'git checkout main',
        objectives: [
          { description: L('HEAD on main', 'HEAD sur main'), validate: headPointsTo('main') },
        ],
        successMessage: L('Back on main!', 'De retour sur main !'),
      },
    ],
  },

  {
    id: 'tags-detached',
    level: 'basic',
    title: L('Tags & detached HEAD', 'Tags et HEAD détaché'),
    description: L(
      'Learn about tags (immutable references) and detached HEAD (pointing directly at a commit).',
      'Apprenez les tags (références immuables) et le HEAD détaché (pointant directement un commit).',
    ),
    duration: 8,
    suggestedCommands: ['git tag', 'git checkout'],
    steps: [
      {
        id: 'setup',
        title: L('Create commits', 'Créer des commits'),
        description: L('Create a repo with 2 commits.', 'Créez un dépôt avec 2 commits.'),
        hint: L(
          'git init · write f.txt "1" · git add f.txt · git commit -m "C1" · write f.txt "2" · git add f.txt · git commit -m "C2"',
          'git init · write f.txt "1" · git add f.txt · git commit -m "C1" · write f.txt "2" · git add f.txt · git commit -m "C2"',
        ),
        explanation: L(
          'Setup: create history to tag.',
          'Préparation : créer un historique à tagger.',
        ),
        graphEffect: L(
          'Graph shows C1 ← C2 (main, HEAD).',
          'Le graphe affiche C1 ← C2 (main, HEAD).',
        ),
        command:
          'git init ; write f.txt "1" ; git add f.txt ; git commit -m "C1" ; write f.txt "2" ; git add f.txt ; git commit -m "C2"',
        objectives: [
          {
            description: L('2 commits created', '2 commits créés'),
            validate: commitCountEquals(2),
          },
        ],
        successMessage: L('Ready!', 'Prêt !'),
      },
      {
        id: 'create-tag',
        title: L('Create a tag', 'Créer un tag'),
        description: L(
          'Tag the current commit as `v1.0`.',
          'Taguez le commit courant comme `v1.0`.',
        ),
        hint: L('Command: git tag v1.0', 'Commande : git tag v1.0'),
        explanation: L(
          'A tag is an immutable reference to a commit, often used to mark releases. Unlike branches, tags do not move when new commits are created.',
          'Un tag est une référence immuable à un commit, souvent utilisée pour marquer les releases. Contrairement aux branches, les tags ne se déplacent pas quand de nouveaux commits sont créés.',
        ),
        graphEffect: L('Badge `v1.0` appears on C2.', 'Le badge `v1.0` apparaît sur C2.'),
        command: 'git tag v1.0',
        objectives: [
          {
            description: L('Tag created', 'Tag créé'),
            validate: hasTag('v1.0'),
          },
        ],
        successMessage: L('Tag created!', 'Tag créé !'),
      },
      {
        id: 'detached-head',
        title: L('Checkout a commit (detached HEAD)', 'Checkout un commit (HEAD détaché)'),
        description: L(
          'Checkout the parent commit: `git checkout main~1`.',
          'Faites un checkout du commit parent : `git checkout main~1`.',
        ),
        hint: L('Command: git checkout main~1', 'Commande : git checkout main~1'),
        explanation: L(
          'Normally HEAD points to a branch (symbolic mode). `git checkout <commit>` detaches HEAD: it points directly at that commit. We use `main~1` (relative notation) instead of a hash for clarity.',
          "Normalement HEAD pointe une branche (mode symbolique). `git checkout <commit>` détache HEAD : il pointe directement ce commit. On utilise `main~1` (notation relative) au lieu d'un hash pour plus de clarté.",
        ),
        graphEffect: L(
          'HEAD badge moves to C1 without a branch name.',
          'Le badge HEAD se déplace vers C1 sans nom de branche.',
        ),
        command: 'git checkout main~1',
        objectives: [
          {
            description: L('HEAD detached', 'HEAD détaché'),
            validate: isHeadDetached(),
          },
        ],
        successMessage: L('HEAD is now detached!', 'HEAD est maintenant détaché !'),
      },
      {
        id: 'back-to-branch',
        title: L('Return to a branch', 'Retourner à une branche'),
        description: L('Switch back to `main`.', 'Retournez sur `main`.'),
        hint: L('Command: git checkout main', 'Commande : git checkout main'),
        explanation: L(
          'Exit detached HEAD mode by checking out a branch. HEAD will be symbolic again.',
          'Quittez le mode HEAD détaché en checkout une branche. HEAD sera de nouveau symbolique.',
        ),
        graphEffect: L('HEAD badge returns to main (C2).', 'Le badge HEAD revient sur main (C2).'),
        command: 'git checkout main',
        objectives: [
          {
            description: L('HEAD on branch', 'HEAD sur une branche'),
            validate: headPointsTo('main'),
          },
        ],
        successMessage: L('Back to main!', 'De retour sur main !'),
      },
    ],
  },

  {
    id: 'undo-basics',
    level: 'basic',
    title: L('Undo basics', "Bases de l'annulation"),
    description: L(
      'Learn ways to undo: `git restore` (before commit), `git reset` (undo commits).',
      "Apprenez les façons d'annuler : `git restore` (avant commit), `git reset` (annuler des commits).",
    ),
    duration: 10,
    suggestedCommands: ['git restore', 'git reset'],
    steps: [
      {
        id: 'setup',
        title: L('Create initial commit', 'Créer un commit initial'),
        description: L(
          'Initialise and create an initial commit.',
          'Initialisez et créez un commit initial.',
        ),
        hint: L(
          'git init · write f.txt "initial" · git add f.txt · git commit -m "C1"',
          'git init · write f.txt "initial" · git add f.txt · git commit -m "C1"',
        ),
        explanation: L(
          'Setup: create a baseline to demonstrate undo operations.',
          "Préparation : créer une base de référence pour démontrer les opérations d'annulation.",
        ),
        graphEffect: L('Graph shows C1 (main, HEAD).', 'Le graphe affiche C1 (main, HEAD).'),
        command: 'git init ; write f.txt "initial" ; git add f.txt ; git commit -m "C1"',
        objectives: [
          { description: L('Repository ready', 'Dépôt prêt'), validate: commitCountEquals(1) },
        ],
        successMessage: L('Setup done!', 'Setup terminé !'),
      },
      {
        id: 'modify-and-restore',
        title: L('Modify and restore', 'Modifier et restaurer'),
        description: L(
          'Modify a file, then undo with `git restore`.',
          'Modifiez un fichier, puis annulez avec `git restore`.',
        ),
        hint: L('write f.txt "oops" · git restore f.txt', 'write f.txt "oops" · git restore f.txt'),
        explanation: L(
          '`git restore` undoes modifications in the working tree by copying from the index (or HEAD if --staged). Useful for fixing typos without staging them.',
          "`git restore` annule les modifications du working tree en copiant depuis l'index (ou HEAD si --staged). Utile pour corriger les erreurs de saisie sans les stager.",
        ),
        graphEffect: L('No change in the graph.', 'Aucun changement dans le graphe.'),
        command: 'write f.txt "oops" ; git restore f.txt',
        objectives: [
          {
            description: L('File restored', 'Fichier restauré'),
            validate: fileExists('f.txt'),
          },
        ],
        successMessage: L('Mistake undone!', 'Erreur annulée !'),
      },
      {
        id: 'stage-and-unstage',
        title: L('Stage then unstage', 'Stager puis désindexer'),
        description: L(
          'Stage a change, then unstage it.',
          'Stagez une modification, puis désindexez-la.',
        ),
        hint: L(
          'write f.txt "changed" · git add f.txt · git restore --staged f.txt',
          'write f.txt "changed" · git add f.txt · git restore --staged f.txt',
        ),
        explanation: L(
          '`git restore --staged` undoes staging: the index realigns with HEAD, while the working tree keeps the modification. Useful for fixing accidental adds.',
          "`git restore --staged` annule le staging : l'index se réaligne sur HEAD, tandis que le working tree garde la modification. Utile pour corriger les add accidentelles.",
        ),
        graphEffect: L('No change in the graph.', 'Aucun changement dans le graphe.'),
        command: 'write f.txt "changed" ; git add f.txt ; git restore --staged f.txt',
        objectives: [
          {
            description: L('Index clean', 'Index propre'),
            validate: noStagedChanges(),
          },
        ],
        successMessage: L('Unstaged!', 'Déstagé !'),
      },
      {
        id: 'commit-and-reset',
        title: L('Commit then reset', 'Committer puis reset'),
        description: L(
          'Create a commit, then undo it with `git reset --mixed HEAD~1`.',
          'Créez un commit, puis annulez-le avec `git reset --mixed HEAD~1`.',
        ),
        hint: L(
          'git commit -m "mistake" · git reset --mixed HEAD~1',
          'git commit -m "mistake" · git reset --mixed HEAD~1',
        ),
        explanation: L(
          '`git reset --mixed` undoes the last commit and puts its changes back in the working tree (index and HEAD realign on the parent). Useful for correcting a bad commit.',
          '`git reset --mixed` annule le dernier commit et remet ses changements dans le working tree (index et HEAD se réalignent sur le parent). Utile pour corriger un mauvais commit.',
        ),
        graphEffect: L(
          'The mistake commit disappears. HEAD returns to C1.',
          "Le commit d'erreur disparaît. HEAD revient à C1.",
        ),
        command: 'git commit -m "mistake" ; git reset --mixed HEAD~1',
        objectives: [
          { description: L('Reset complete', 'Reset terminé'), validate: commitCountEquals(1) },
        ],
        successMessage: L(
          'Commit undone! Changes are in the working tree.',
          'Commit annulé ! Les changements sont dans le working tree.',
        ),
      },
    ],
  },

  // =========================================================================
  // MOYEN
  // =========================================================================
  {
    id: 'merge-ff-vs-noff',
    level: 'medium',
    title: L('Merge: fast-forward vs --no-ff', 'Fusion : fast-forward vs --no-ff'),
    description: L(
      'Understand the difference between fast-forward merge and true merge (with --no-ff).',
      'Comprenez la différence entre une fusion rapide et une vraie fusion (avec --no-ff).',
    ),
    duration: 18,
    suggestedCommands: ['git merge', 'git merge --no-ff'],
    steps: [
      {
        id: 'setup-feature',
        title: L('Setup feature branch', 'Préparer la branche feature'),
        description: L(
          'Create a feature branch with one commit ahead of main.',
          'Créez une branche feature avec un commit en avance sur main.',
        ),
        hint: L(
          'git init · write f.txt "v1" · git add f.txt · git commit -m "C1" · git branch feature · git checkout feature · write f.txt "v2" · git add f.txt · git commit -m "C2"',
          'git init · write f.txt "v1" · git add f.txt · git commit -m "C1" · git branch feature · git checkout feature · write f.txt "v2" · git add f.txt · git commit -m "C2"',
        ),
        explanation: L(
          'Setup: create a feature branch with 1 commit.',
          'Préparation : créer une branche feature avec 1 commit.',
        ),
        graphEffect: L(
          'Graph shows C1 ← C2 (feature, HEAD).',
          'Le graphe affiche C1 ← C2 (feature, HEAD).',
        ),
        command:
          'git init ; write f.txt "v1" ; git add f.txt ; git commit -m "C1" ; git branch feature ; git checkout feature ; write f.txt "v2" ; git add f.txt ; git commit -m "C2"',
        objectives: [
          {
            description: L('Feature ready', 'Feature prêt'),
            validate: all(commitCountEquals(2), headPointsTo('feature')),
          },
        ],
        successMessage: L('Feature branch created!', 'Branche feature créée !'),
      },
      {
        id: 'back-to-main',
        title: L('Return to main', 'Retourner sur main'),
        description: L('Switch back to main.', 'Retournez sur main.'),
        hint: L('Command: git checkout main', 'Commande : git checkout main'),
        explanation: L(
          'Before merging, switch to the target branch.',
          'Avant de fusionner, allez sur la branche cible.',
        ),
        graphEffect: L('HEAD moves to main (C1).', 'HEAD se déplace sur main (C1).'),
        command: 'git checkout main',
        objectives: [{ description: L('On main', 'Sur main'), validate: headPointsTo('main') }],
        successMessage: L('Ready to merge!', 'Prêt à fusionner !'),
      },
      {
        id: 'fast-forward-merge',
        title: L('Fast-forward merge', 'Fusion rapide'),
        description: L(
          'Merge feature into main (default: fast-forward).',
          'Fusionnez feature dans main (par défaut : fast-forward).',
        ),
        hint: L('Command: git merge feature', 'Commande : git merge feature'),
        explanation: L(
          'When main has not changed, Git can fast-forward: it simply moves main to C2 (no new commit). Efficient and linear history.',
          "Quand main n'a pas changé, Git peut faire un fast-forward : il déplace simplement main vers C2 (pas de nouveau commit). Historique efficace et linéaire.",
        ),
        graphEffect: L(
          'main moves from C1 to C2. No merge commit; history is linear.',
          'main se déplace de C1 à C2. Aucun commit de fusion ; historique linéaire.',
        ),
        command: 'git merge feature',
        objectives: [
          {
            description: L('Merged, no conflicts', 'Fusionné, sans conflits'),
            validate: all(commitCountEquals(2), noOperationInProgress()),
          },
        ],
        successMessage: L('Fast-forward merge complete!', 'Fusion rapide terminée !'),
      },
      {
        id: 'create-feature2',
        title: L('Create new feature', 'Créer une nouvelle feature'),
        description: L(
          'Create a new branch feature2 with one commit.',
          'Créez une nouvelle branche feature2 avec un commit.',
        ),
        hint: L(
          'git branch feature2 · git checkout feature2 · write g.txt "feature2" · git add g.txt · git commit -m "C3"',
          'git branch feature2 · git checkout feature2 · write g.txt "feature2" · git add g.txt · git commit -m "C3"',
        ),
        explanation: L(
          'Setup: create another feature branch to demonstrate non-FF merge. Uses a different file to avoid conflicts.',
          'Préparation : créer une autre branche feature pour démontrer la fusion non-FF. Utilise un fichier différent pour éviter les conflits.',
        ),
        graphEffect: L(
          'Graph shows C1 ← C2 (main) ← C3 (feature2, HEAD).',
          'Le graphe affiche C1 ← C2 (main) ← C3 (feature2, HEAD).',
        ),
        command:
          'git branch feature2 ; git checkout feature2 ; write g.txt "feature2" ; git add g.txt ; git commit -m "C3"',
        objectives: [
          {
            description: L('Feature2 ready', 'Feature2 prêt'),
            validate: all(commitCountEquals(3), headPointsTo('feature2')),
          },
        ],
        successMessage: L('Feature2 created!', 'Feature2 créé !'),
      },
      {
        id: 'diverge-main',
        title: L('Create divergence', 'Créer une divergence'),
        description: L(
          'Switch to main and create a competing commit.',
          'Allez sur main et créez un commit rival.',
        ),
        hint: L(
          'git checkout main ; write h.txt "main-only" ; git add h.txt ; git commit -m "C4"',
          'git checkout main ; write h.txt "main-only" ; git add h.txt ; git commit -m "C4"',
        ),
        explanation: L(
          'Simulate a real divergence: main and feature2 now have different histories. Fast-forward is no longer possible.',
          "Simulez une vraie divergence : main et feature2 ont maintenant des historiques différents. Le fast-forward n'est plus possible.",
        ),
        graphEffect: L(
          'Fork visible: C1 ← C2 ← C4 (main, HEAD). C3 on feature2.',
          'Fork visible : C1 ← C2 ← C4 (main, HEAD). C3 sur feature2.',
        ),
        command: 'git checkout main ; write h.txt "main-only" ; git add h.txt ; git commit -m "C4"',
        objectives: [
          {
            description: L('Divergence created', 'Divergence créée'),
            validate: all(commitCountEquals(3), headPointsTo('main')),
          },
        ],
        successMessage: L(
          'Now main has diverged from feature2!',
          'Main a maintenant divergé de feature2 !',
        ),
      },
      {
        id: 'no-ff-merge',
        title: L('Merge with --no-ff', 'Fusionner avec --no-ff'),
        description: L(
          'Merge feature2 with --no-ff to force a merge commit.',
          'Fusionnez feature2 avec --no-ff pour forcer un commit de fusion.',
        ),
        hint: L(
          'Command: git merge feature2 --no-ff -m "Merge feature2"',
          'Commande : git merge feature2 --no-ff -m "Merge feature2"',
        ),
        explanation: L(
          '`--no-ff` creates a merge commit even if fast-forward was possible. The graph preserves the history of the merge, with a commit having 2 parents.',
          "`--no-ff` crée un commit de fusion même si fast-forward était possible. Le graphe préserve l'historique de la fusion, avec un commit ayant 2 parents.",
        ),
        graphEffect: L(
          'Merge commit C5 with 2 parents: C4 and C3. Graph shows the fork and its resolution.',
          'Commit de fusion C5 avec 2 parents : C4 et C3. Le graphe affiche le fork et sa résolution.',
        ),
        command: 'git merge feature2 --no-ff -m "Merge feature2"',
        objectives: [
          {
            description: L('Merge commit created', 'Commit de fusion créé'),
            validate: all(commitCountEquals(4), noOperationInProgress()),
          },
        ],
        successMessage: L(
          'Merge commit created! History preserves the fork.',
          "Commit de fusion créé ! L'historique préserve le fork.",
        ),
      },
    ],
  },

  {
    id: 'merge-conflicts',
    level: 'medium',
    title: L('Merge conflicts', 'Conflits de fusion'),
    description: L(
      'Understand merge conflicts: when they appear, how to resolve them, and finalize the merge.',
      'Comprenez les conflits de fusion : comment ils apparaissent, comment les résoudre et finaliser la fusion.',
    ),
    duration: 20,
    suggestedCommands: ['git merge', 'git merge --continue'],
    steps: [
      {
        id: 'setup-conflict',
        title: L('Setup conflicting branches', 'Préparer les branches conflictuelles'),
        description: L(
          'Create two branches that modify the same file.',
          'Créez deux branches modifiant le même fichier.',
        ),
        hint: L(
          'git init · write f.txt "line1\\nline2" · git add f.txt · git commit -m "C1" · git branch feature · git checkout feature · write f.txt "line1\\nCHANGED-BY-FEATURE" · git add f.txt · git commit -m "C2-feature"',
          'git init · write f.txt "line1\\nline2" · git add f.txt · git commit -m "C1" · git branch feature · git checkout feature · write f.txt "line1\\nCHANGED-BY-FEATURE" · git add f.txt · git commit -m "C2-feature"',
        ),
        explanation: L(
          'Setup: create a feature branch that modifies the same file as main will.',
          'Préparation : créer une branche feature modifiant le même fichier que main modifiera.',
        ),
        graphEffect: L(
          'Graph shows C1 ← C2-feature (feature, HEAD).',
          'Le graphe affiche C1 ← C2-feature (feature, HEAD).',
        ),
        command:
          'git init ; write f.txt "line1\\nline2" ; git add f.txt ; git commit -m "C1" ; git branch feature ; git checkout feature ; write f.txt "line1\\nCHANGED-BY-FEATURE" ; git add f.txt ; git commit -m "C2-feature"',
        objectives: [
          {
            description: L('Feature ready', 'Feature prêt'),
            validate: all(commitCountEquals(2), headPointsTo('feature')),
          },
        ],
        successMessage: L('Feature branch ready!', 'Branche feature prêt !'),
      },
      {
        id: 'modify-main',
        title: L('Modify main', 'Modifier main'),
        description: L(
          'Switch to main and modify the same file differently.',
          'Allez sur main et modifiez le même fichier différemment.',
        ),
        hint: L(
          'git checkout main ; write f.txt "line1\\nCHANGED-BY-MAIN" ; git add f.txt · git commit -m "C2-main"',
          'git checkout main ; write f.txt "line1\\nCHANGED-BY-MAIN" ; git add f.txt · git commit -m "C2-main"',
        ),
        explanation: L(
          'Create a real conflicting divergence.',
          'Créez une vraie divergence conflictuelle.',
        ),
        graphEffect: L(
          'Fork: C1 ← C2-feature (feature), C1 ← C2-main (main, HEAD).',
          'Fork : C1 ← C2-feature (feature), C1 ← C2-main (main, HEAD).',
        ),
        command:
          'git checkout main ; write f.txt "line1\\nCHANGED-BY-MAIN" ; git add f.txt ; git commit -m "C2-main"',
        objectives: [
          {
            description: L('Main diverged', 'Main divergé'),
            validate: all(commitCountEquals(2), headPointsTo('main')),
          },
        ],
        successMessage: L(
          'Main now conflicts with feature!',
          'Main est maintenant en conflit avec feature !',
        ),
      },
      {
        id: 'attempt-merge',
        title: L('Attempt merge (conflict)', 'Tentez la fusion (conflit)'),
        description: L(
          'Try to merge feature into main.',
          'Essayez de fusionner feature dans main.',
        ),
        hint: L('Command: git merge feature', 'Commande : git merge feature'),
        explanation: L(
          'The merge halts with conflict. The file is marked with `<<<<<<<`, `=======`, `>>>>>>>`. Git has combined both versions and asks you to choose.',
          "La fusion s'arrête avec conflit. Le fichier est marqué avec `<<<<<<<`, `=======`, `>>>>>>>`. Git a combiné les deux versions et vous demande de choisir.",
        ),
        graphEffect: L(
          'Merge state indicated by "Merging" badge in sidebar.',
          'État de fusion indiqué par le badge "Merging" dans la barre latérale.',
        ),
        command: 'git merge feature',
        objectives: [
          {
            description: L('Merge in progress (conflict)', 'Fusion en cours (conflit)'),
            validate: operationInProgress(),
          },
        ],
        successMessage: L(
          'Merge halted: conflict detected. Open the conflict editor to resolve.',
          "Fusion arrêtée : conflit détecté. Ouvrez l'éditeur de conflits pour résoudre.",
        ),
      },
      {
        id: 'resolve-conflict',
        title: L('Resolve conflict', 'Résoudre le conflit'),
        description: L(
          'Write a resolved version of the conflicted file and stage it.',
          'Écrivez une version résolue du fichier en conflit et stagez-la.',
        ),
        hint: L(
          'write f.txt "line1\\nRESOLVED" · git add f.txt',
          'write f.txt "line1\\nRESOLVED" · git add f.txt',
        ),
        explanation: L(
          'To resolve the conflict, overwrite the file with the chosen content (no conflict markers), then `git add` to mark it resolved. The conflict editor in the UI does this automatically.',
          "Pour résoudre le conflit, écrasez le fichier avec le contenu choisi (sans marqueurs de conflit), puis `git add` pour le marquer résolu. L'éditeur de conflits dans l'UI fait cela automatiquement.",
        ),
        graphEffect: L(
          'No visible change yet (merge still in progress).',
          "Pas de changement visible pour l'instant (fusion toujours en cours).",
        ),
        command: 'write f.txt "line1\\nRESOLVED" ; git add f.txt',
        objectives: [
          {
            description: L('Conflict resolved', 'Conflit résolu'),
            validate: fileExists('f.txt'),
          },
        ],
        successMessage: L('Conflict resolved!', 'Conflit résolu !'),
      },
      {
        id: 'finalize-merge',
        title: L('Finalize merge', 'Finaliser la fusion'),
        description: L(
          'Complete the merge with `git merge --continue`.',
          'Complétez la fusion avec `git merge --continue`.',
        ),
        hint: L('Command: git merge --continue', 'Commande : git merge --continue'),
        explanation: L(
          'After staging the resolved file, `git merge --continue` creates the merge commit. The conflict marker badge disappears.',
          'Après avoir stagé le fichier résolu, `git merge --continue` crée le commit de fusion. Le badge de marqueur de conflit disparaît.',
        ),
        graphEffect: L(
          'Merge commit with 2 parents created. Graph shows the resolved fork.',
          'Commit de fusion avec 2 parents créé. Le graphe affiche le fork résolu.',
        ),
        command: 'git merge --continue',
        objectives: [
          {
            description: L('Merge complete', 'Fusion complète'),
            validate: all(commitCountEquals(3), noOperationInProgress()),
          },
        ],
        successMessage: L(
          'Merge successful! Conflict resolved and integrated.',
          'Fusion réussie ! Conflit résolu et intégré.',
        ),
      },
    ],
  },

  {
    id: 'rebase-basics',
    level: 'medium',
    title: L('Rebase basics', 'Bases du rebase'),
    description: L(
      'Understand rebase: replay commits on a different base to linearize history.',
      "Comprenez le rebase : rejouer les commits sur une base différente pour linéariser l'historique.",
    ),
    duration: 15,
    suggestedCommands: ['git rebase', 'git merge'],
    steps: [
      {
        id: 'setup-divergence',
        title: L('Setup divergence', 'Préparer la divergence'),
        description: L(
          'Create a feature branch and modify main.',
          'Créez une branche feature et modifiez main.',
        ),
        hint: L(
          'git init · write f.txt "v1" · git add f.txt · git commit -m "C1" · git branch feature · git checkout feature · write feature.txt "feature work" · git add feature.txt · git commit -m "C2-feature"',
          'git init · write f.txt "v1" · git add f.txt · git commit -m "C1" · git branch feature · git checkout feature · write feature.txt "feature work" · git add feature.txt · git commit -m "C2-feature"',
        ),
        explanation: L(
          'Setup: create a feature branch. The feature branch modifies a different file than main to avoid conflicts during rebase.',
          'Préparation : créer une branche feature. La branche feature modifie un fichier différent de main pour éviter les conflits lors du rebase.',
        ),
        graphEffect: L(
          'Graph shows C1 ← C2-feature (feature, HEAD).',
          'Le graphe affiche C1 ← C2-feature (feature, HEAD).',
        ),
        command:
          'git init ; write f.txt "v1" ; git add f.txt ; git commit -m "C1" ; git branch feature ; git checkout feature ; write feature.txt "feature work" ; git add feature.txt ; git commit -m "C2-feature"',
        objectives: [
          {
            description: L('Feature ready', 'Feature prêt'),
            validate: all(commitCountEquals(2), headPointsTo('feature')),
          },
        ],
        successMessage: L('Feature branch created!', 'Branche feature créée !'),
      },
      {
        id: 'move-to-main',
        title: L('Advance main', 'Avancer main'),
        description: L(
          'Switch to main and create a new commit.',
          'Allez sur main et créez un nouveau commit.',
        ),
        hint: L(
          'git checkout main ; write f.txt "v1b" ; git add f.txt ; git commit -m "C2-main"',
          'git checkout main ; write f.txt "v1b" ; git add f.txt ; git commit -m "C2-main"',
        ),
        explanation: L(
          'Simulate main advancing while feature was being developed.',
          "Simulez l'avancement de main pendant que feature se développait.",
        ),
        graphEffect: L(
          'Divergence: C1 ← C2-feature (feature), C1 ← C2-main (main, HEAD).',
          'Divergence : C1 ← C2-feature (feature), C1 ← C2-main (main, HEAD).',
        ),
        command: 'git checkout main ; write f.txt "v1b" ; git add f.txt ; git commit -m "C2-main"',
        objectives: [
          {
            description: L('Main advanced', 'Main avancé'),
            validate: all(commitCountEquals(2), headPointsTo('main')),
          },
        ],
        successMessage: L('Main now has a new commit!', 'Main a maintenant un nouveau commit !'),
      },
      {
        id: 'switch-feature',
        title: L('Return to feature', 'Retourner sur feature'),
        description: L('Switch back to feature.', 'Retournez sur feature.'),
        hint: L('Command: git checkout feature', 'Commande : git checkout feature'),
        explanation: L(
          'Before rebasing, go back to the feature branch.',
          'Avant de rebaser, retournez sur la branche feature.',
        ),
        graphEffect: L(
          'HEAD moves to feature (C2-feature).',
          'HEAD se déplace sur feature (C2-feature).',
        ),
        command: 'git checkout feature',
        objectives: [
          { description: L('On feature', 'Sur feature'), validate: headPointsTo('feature') },
        ],
        successMessage: L('Ready to rebase!', 'Prêt à rebaser !'),
      },
      {
        id: 'rebase-onto-main',
        title: L('Rebase onto main', 'Rebaser sur main'),
        description: L(
          'Rebase feature commits onto main.',
          'Basez les commits de feature sur main.',
        ),
        hint: L('Command: git rebase main', 'Commande : git rebase main'),
        explanation: L(
          '`git rebase main` replays the commits of feature (relative to the old base C1) onto the new base (C2-main). Hashes change due to replay. History becomes linear.',
          "`git rebase main` rejoue les commits de feature (relatifs à l'ancienne base C1) sur la nouvelle base (C2-main). Les hashes changent suite au replay. L'historique devient linéaire.",
        ),
        graphEffect: L(
          "Linear: C1 ← C2-main ← C2-feature' (feature, HEAD). Old C2-feature unreachable.",
          "Linéaire : C1 ← C2-main ← C2-feature' (feature, HEAD). L'ancien C2-feature inaccessible.",
        ),
        command: 'git rebase main',
        objectives: [
          {
            description: L('Rebase complete', 'Rebase complet'),
            validate: all(commitCountEquals(3), noOperationInProgress()),
          },
        ],
        successMessage: L(
          'Rebase successful! History is linear.',
          "Rebase réussi ! L'historique est linéaire.",
        ),
      },
      {
        id: 'fast-forward-merge',
        title: L('Fast-forward merge', 'Fusion rapide'),
        description: L(
          'Now merge feature into main (will be fast-forward).',
          'Fusionnez maintenant feature dans main (sera fast-forward).',
        ),
        hint: L('git checkout main · git merge feature', 'git checkout main · git merge feature'),
        explanation: L(
          'After rebase, main is now an ancestor of feature, so the merge is a fast-forward.',
          'Après le rebase, main est maintenant un ancêtre de feature, la fusion est donc un fast-forward.',
        ),
        graphEffect: L(
          'main moves to the tip of feature.',
          'main se déplace vers le tip de feature.',
        ),
        command: 'git checkout main ; git merge feature',
        objectives: [
          {
            description: L('Integrated', 'Intégré'),
            validate: all(commitCountEquals(3), headPointsTo('main')),
          },
        ],
        successMessage: L('Rebase workflow complete!', 'Workflow de rebase terminé !'),
      },
    ],
  },

  {
    id: 'remote-clone-push',
    level: 'medium',
    title: L('Remote: clone & push', 'Distant : clone & push'),
    description: L(
      'Learn the basics of remote work: cloning a repository and pushing changes.',
      'Apprenez les bases du travail distant : cloner un dépôt et pousser les changements.',
    ),
    duration: 20,
    suggestedCommands: ['git clone', 'git remote', 'git push'],
    steps: [
      {
        id: 'clone-repo',
        title: L('Clone a repository', 'Cloner un dépôt'),
        description: L(
          'Clone the public-repo remote repository.',
          'Clonez le dépôt distant public-repo.',
        ),
        hint: L('Command: git clone public-repo', 'Commande : git clone public-repo'),
        explanation: L(
          '`git clone` creates a local copy of a remote repository, with all history and branches. It automatically configures `origin` as the remote and sets the upstream.',
          "`git clone` crée une copie locale d'un dépôt distant, avec tout l'historique et les branches. Il configure automatiquement `origin` comme distant et définit l'upstream.",
        ),
        graphEffect: L(
          'Graph transitions from empty to showing the remote history.',
          "Le graphe passe du vide à l'affichage de l'historique distant.",
        ),
        command: 'git clone public-repo',
        objectives: [
          {
            description: L('Repository cloned', 'Dépôt cloné'),
            validate: all(isInitialized(), commitCountEquals(3), hasBranch('main')),
          },
        ],
        successMessage: L('Repository cloned!', 'Dépôt cloné !'),
      },
      {
        id: 'local-commit',
        title: L('Create local commit', 'Créer un commit local'),
        description: L(
          'Make a local change and commit it.',
          'Faites une modification locale et committez-la.',
        ),
        hint: L(
          'write readme.txt "local change" · git add readme.txt · git commit -m "Local work"',
          'write readme.txt "local change" · git add readme.txt · git commit -m "Local work"',
        ),
        explanation: L(
          'Local work: create a new commit on your local clone.',
          'Travail local : créez un nouveau commit sur votre clone local.',
        ),
        graphEffect: L(
          'New commit ahead of the main branch.',
          'Nouveau commit en avance sur la branche main.',
        ),
        command:
          'write readme.txt "local change" ; git add readme.txt ; git commit -m "Local work"',
        objectives: [
          {
            description: L('Local commit created', 'Commit local créé'),
            validate: all(commitCountEquals(4), headPointsTo('main')),
          },
        ],
        successMessage: L('Local commit created!', 'Commit local créé !'),
      },
      {
        id: 'check-remotes',
        title: L('Check remotes', 'Vérifier les distants'),
        description: L(
          'List remote repositories with `git remote -v`.',
          'Listez les dépôts distants avec `git remote -v`.',
        ),
        hint: L('Command: git remote -v', 'Commande : git remote -v'),
        explanation: L(
          '`git remote -v` shows all configured remote repositories (name and URL). By default, `clone` sets up `origin`.',
          '`git remote -v` affiche tous les dépôts distants configurés (nom et URL). Par défaut, `clone` configure `origin`.',
        ),
        graphEffect: L('No change in the graph.', 'Aucun changement dans le graphe.'),
        command: 'git remote -v',
        objectives: [
          {
            description: L('Remotes listed', 'Distants listés'),
            validate: all(commitCountEquals(4), hasRemote('origin')),
          },
        ],
        successMessage: L('Remotes configured!', 'Distants configurés !'),
      },
      {
        id: 'push',
        title: L('Push to remote', 'Pousser vers le distant'),
        description: L(
          'Push local commits to the remote with `git push`.',
          'Poussez les commits locaux vers le distant avec `git push`.',
        ),
        hint: L('Command: git push', 'Commande : git push'),
        explanation: L(
          '`git push` uploads local commits to the remote and updates the remote branch (origin/main). The upstream is already set by clone.',
          "`git push` télécharge les commits locaux vers le distant et met à jour la branche distante (origin/main). L'upstream est déjà défini par clone.",
        ),
        graphEffect: L(
          'In split-screen mode, the remote graph updates to show the new commit.',
          'En mode split-screen, le graphe distant se met à jour pour afficher le nouveau commit.',
        ),
        command: 'git push',
        objectives: [
          {
            description: L('Push successful', 'Push réussi'),
            validate: all(commitCountEquals(4), branchHasUpstream('main')),
          },
        ],
        successMessage: L('Changes pushed to remote!', 'Changements poussés vers le distant !'),
      },
    ],
  },

  {
    id: 'remote-fetch-pull',
    level: 'medium',
    title: L('Remote: fetch & pull', 'Distant : fetch & pull'),
    description: L(
      'Learn to fetch remote changes and integrate them with pull.',
      'Apprenez à récupérer les changements distants et les intégrer avec pull.',
    ),
    duration: 18,
    suggestedCommands: ['git fetch', 'git pull', 'git branch -vv'],
    steps: [
      {
        id: 'setup-behind',
        title: L('Setup (simulate behind)', 'Préparer (simuler retard)'),
        description: L(
          'Clone, then reset to simulate the remote being ahead.',
          'Clonez, puis faites un reset pour simuler que le distant est en avance.',
        ),
        hint: L(
          'git clone collab-repo · git reset --hard HEAD~1',
          'git clone collab-repo · git reset --hard HEAD~1',
        ),
        explanation: L(
          "Technique (A3): clone sets up the repo, then `reset --hard HEAD~1` recedes the local branch. Now origin/main is ahead of main (simulates a coworker's push).",
          "Technique (A3) : clone configure le dépôt, puis `reset --hard HEAD~1` recule la branche locale. Maintenant origin/main est en avance sur main (simule un push d'un coéquipier).",
        ),
        graphEffect: L(
          'Local main recedes; origin/main (remote branch) stays ahead.',
          'main local recule ; origin/main (branche distante) reste en avance.',
        ),
        command: 'git clone collab-repo ; git reset --hard HEAD~1',
        objectives: [
          {
            description: L('Setup complete', 'Setup complet'),
            validate: branchHasUpstream('main'),
          },
        ],
        successMessage: L('Behind remote!', 'En retard sur le distant !'),
      },
      {
        id: 'check-status',
        title: L('Check status', 'Vérifier le statut'),
        description: L(
          'Run `git status` to see the tracking info.',
          "Exécutez `git status` pour voir l'info de suivi.",
        ),
        hint: L('Command: git status', 'Commande : git status'),
        explanation: L(
          '`git status` now shows "Your branch is behind origin/main by 1 commit". The tracking information lets you know the state relative to upstream.',
          "`git status` affiche maintenant \"Your branch is behind origin/main by 1 commit\". L'info de suivi vous indique l'état par rapport à l'upstream.",
        ),
        graphEffect: L('No change in the graph.', 'Aucun changement dans le graphe.'),
        command: 'git status',
        objectives: [
          {
            description: L('Tracking visible', 'Suivi visible'),
            validate: branchHasUpstream('main'),
          },
        ],
        successMessage: L('Status shows behind!', 'Le statut montre le retard !'),
      },
      {
        id: 'local-diverge',
        title: L('Create local commit', 'Créer un commit local'),
        description: L(
          'Commit locally to create a divergence.',
          'Committez localement pour créer une divergence.',
        ),
        hint: L(
          'write local.txt "my change" · git add local.txt · git commit -m "Local"',
          'write local.txt "my change" · git add local.txt · git commit -m "Local"',
        ),
        explanation: L(
          'Now the branch is diverged: ahead 1 (local commit), behind 1 (remote commit). Both sides have unique history.',
          'La branche est maintenant divergée : en avance de 1 (commit local), en retard de 1 (commit distant). Les deux côtés ont un historique unique.',
        ),
        graphEffect: L(
          'Local and origin/main branches diverge from common ancestor.',
          "Les branches locale et origin/main divergent depuis l'ancêtre commun.",
        ),
        command: 'write local.txt "my change" ; git add local.txt ; git commit -m "Local"',
        objectives: [
          {
            description: L('Divergence created', 'Divergence créée'),
            validate: fileExists('local.txt'),
          },
        ],
        successMessage: L('Now ahead and behind!', 'Maintenant en avance et en retard !'),
      },
      {
        id: 'check-tracking',
        title: L('Check tracking status', 'Vérifier le suivi'),
        description: L(
          'Run `git branch -vv` to see the detailed tracking state.',
          "Exécutez `git branch -vv` pour voir l'état de suivi détaillé.",
        ),
        hint: L('Command: git branch -vv', 'Commande : git branch -vv'),
        explanation: L(
          '`git branch -vv` (very verbose) shows upstream and the ahead/behind count. Diagnostics before integrating.',
          "`git branch -vv` (très verbeux) affiche l'upstream et le compte en-avance/en-retard. Diagnostic avant intégration.",
        ),
        graphEffect: L('No change in the graph.', 'Aucun changement dans le graphe.'),
        command: 'git branch -vv',
        objectives: [
          {
            description: L('Tracking info shown', 'Info de suivi affichée'),
            validate: branchHasUpstream('main'),
          },
        ],
        successMessage: L('Tracking state shown!', 'État de suivi affiché !'),
      },
      {
        id: 'pull',
        title: L('Pull (fetch + merge)', 'Pull (fetch + merge)'),
        description: L(
          'Run `git pull` to fetch and merge the remote changes.',
          'Exécutez `git pull` pour récupérer et fusionner les changements distants.',
        ),
        hint: L('Command: git pull', 'Commande : git pull'),
        explanation: L(
          '`git pull` = `fetch` (download remote commits) + `merge` (integrate). Here, files are different → a merge commit will be created.',
          '`git pull` = `fetch` (télécharger les commits distants) + `merge` (intégrer). Ici, les fichiers sont différents → un commit de fusion sera créé.',
        ),
        graphEffect: L(
          'Merge commit unites the local and remote commits. History shows both sides.',
          "Commit de fusion unit les commits locaux et distants. L'historique montre les deux côtés.",
        ),
        command: 'git pull',
        objectives: [
          {
            description: L('Integrated', 'Intégré'),
            validate: noOperationInProgress(),
          },
        ],
        successMessage: L(
          'Pull complete! Local and remote are integrated.',
          'Pull terminé ! Local et distant sont intégrés.',
        ),
      },
    ],
  },

  // =========================================================================
  // AVANCÉ
  // =========================================================================
  {
    id: 'interactive-rebase',
    level: 'advanced',
    title: L('Interactive rebase', 'Rebase interactif'),
    description: L(
      'Learn interactive rebase: reorder, squash, or drop commits to clean up history before push.',
      "Apprenez le rebase interactif : réordonnancer, squasher ou supprimer des commits pour nettoyer l'historique avant un push.",
    ),
    duration: 25,
    suggestedCommands: ['git rebase -i'],
    steps: [
      {
        id: 'setup-multiple',
        title: L('Create multiple commits', 'Créer plusieurs commits'),
        description: L('Create 3 commits to clean up.', 'Créez 3 commits à nettoyer.'),
        hint: L(
          'git init · write a.txt "1" · git add a.txt · git commit -m "A" · write b.txt "2" · git add b.txt · git commit -m "B" · write c.txt "3" · git add c.txt · git commit -m "C"',
          'git init · write a.txt "1" · git add a.txt · git commit -m "A" · write b.txt "2" · git add b.txt · git commit -m "B" · write c.txt "3" · git add c.txt · git commit -m "C"',
        ),
        explanation: L(
          'Setup: 3 commits to practice interactive rebase.',
          'Préparation : 3 commits pour pratiquer le rebase interactif.',
        ),
        graphEffect: L(
          'Linear: C1 ← C2 ← C3 (main, HEAD).',
          'Linéaire : C1 ← C2 ← C3 (main, HEAD).',
        ),
        command:
          'git init ; write a.txt "1" ; git add a.txt ; git commit -m "A" ; write b.txt "2" ; git add b.txt ; git commit -m "B" ; write c.txt "3" ; git add c.txt ; git commit -m "C"',
        objectives: [{ description: L('Ready', 'Prêt'), validate: commitCountEquals(3) }],
        successMessage: L('3 commits created!', '3 commits créés !'),
      },
      {
        id: 'start-rebase-i',
        title: L('Start interactive rebase', 'Démarrer rebase interactif'),
        description: L(
          'Launch interactive rebase for the last 2 commits.',
          'Lancez le rebase interactif pour les 2 derniers commits.',
        ),
        hint: L('Command: git rebase -i HEAD~2', 'Commande : git rebase -i HEAD~2'),
        explanation: L(
          '`git rebase -i HEAD~2` opens the interactive rebase mode for the 2 most recent commits. A modal appears with the todo list.',
          "`git rebase -i HEAD~2` ouvre le mode rebase interactif pour les 2 commits les plus récents. Une modale s'affiche avec la todo list.",
        ),
        graphEffect: L(
          'No visible change (interactive mode, awaiting edits).',
          "Pas de changement visible (mode interactif, en attente d'édits).",
        ),
        command: 'git rebase -i HEAD~2',
        objectives: [
          {
            description: L('Rebase started', 'Rebase démarré'),
            validate: commitCountEquals(3),
          },
        ],
        successMessage: L(
          'Modal opened! Edit the todo list.',
          'Modale ouverte ! Éditez la todo list.',
        ),
      },
      {
        id: 'edit-todo',
        title: L('Edit todo list (squash)', 'Éditez todo list (squash)'),
        description: L(
          'In the modal, change the action for commit B from "pick" to "squash".',
          'Dans la modale, changez l\'action du commit B de "pick" à "squash".',
        ),
        hint: L(
          'Select commit B, click "squash" button (or type in action field).',
          'Sélectionnez commit B, cliquez le bouton "squash" (ou tapez dans le champ action).',
        ),
        explanation: L(
          'Squash means "merge this commit into the previous one". B will be combined with A, condensing the history.',
          'Squash signifie "fusionner ce commit dans le précédent". B sera combiné avec A, condensant l\'historique.',
        ),
        graphEffect: L(
          'No change yet (edits are pending application).',
          "Pas de changement encore (les édits sont en attente d'application).",
        ),
        command: 'git rebase -i HEAD~2',
        objectives: [
          {
            description: L('Todo edited', 'Todo édité'),
            validate: commitCountEquals(3),
          },
        ],
        successMessage: L(
          'Todo edited! Now apply the changes.',
          'Todo édité ! Appliquez maintenant les changements.',
        ),
      },
      {
        id: 'apply-rebase',
        title: L('Apply rebase', 'Appliquez rebase'),
        description: L(
          'Click "Continue" in the modal to apply the squash.',
          'Cliquez "Continuer" dans la modale pour appliquer le squash.',
        ),
        hint: L(
          'Click the "Continue" button in the InteractiveRebaseModal.',
          'Cliquez le bouton "Continuer" dans la InteractiveRebaseModal.',
        ),
        explanation: L(
          'Rebase applies the todo list: A and B are squashed into 1 commit, C is replayed. New hashes are generated.',
          'Rebase applique la todo list : A et B sont squashés en 1 commit, C est rejoué. De nouveaux hashes sont générés.',
        ),
        graphEffect: L(
          'Graph now shows 2 commits instead of 3 (A+B merged, C separate).',
          'Le graphe affiche maintenant 2 commits au lieu de 3 (A+B fusionnés, C séparé).',
        ),
        command: 'git rebase -i HEAD~2',
        objectives: [
          {
            description: L(
              'Rebase applied (history condensed, ≥2 commits)',
              'Rebase appliqué (historique condensé, ≥2 commits)',
            ),
            validate: hasCommits(2),
          },
        ],
        successMessage: L(
          'Modal opened! Apply in the UI.',
          "Modale ouverte ! Appliquez dans l'UI.",
        ),
      },
      {
        id: 'verify',
        title: L('Verify history', "Vérifier l'historique"),
        description: L(
          'Run `git log --oneline` to confirm.',
          'Exécutez `git log --oneline` pour confirmer.',
        ),
        hint: L('Command: git log --oneline', 'Commande : git log --oneline'),
        explanation: L(
          'Confirm the history is cleaned: 2 commits instead of 3.',
          "Confirmez que l'historique est nettoyé : 2 commits au lieu de 3.",
        ),
        graphEffect: L('Graph shows 2 commits.', 'Le graphe affiche 2 commits.'),
        command: 'git log --oneline',
        objectives: [
          {
            description: L('History cleaned (≥2 commits)', 'Historique nettoyé (≥2 commits)'),
            validate: hasCommits(2),
          },
        ],
        successMessage: L(
          'History cleaned! Ready to push.',
          'Historique nettoyé ! Prêt à pousser.',
        ),
      },
    ],
  },

  {
    id: 'reset-reflog',
    level: 'advanced',
    title: L('Reset & reflog', 'Reset & reflog'),
    description: L(
      'Learn the reflog (HEAD history): accidentally drop a commit, then recover it.',
      'Apprenez le reflog (historique de HEAD) : annulez accidentellement un commit, puis récupérez-le.',
    ),
    duration: 20,
    suggestedCommands: ['git reset', 'git reflog'],
    steps: [
      {
        id: 'setup-commits',
        title: L('Create commits', 'Créer des commits'),
        description: L('Create 3 commits.', 'Créez 3 commits.'),
        hint: L(
          'git init · write f.txt "1" · git add f.txt · git commit -m "C1" · write f.txt "2" · git add f.txt · git commit -m "C2" · write f.txt "3" · git add f.txt · git commit -m "C3"',
          'git init · write f.txt "1" · git add f.txt · git commit -m "C1" · write f.txt "2" · git add f.txt · git commit -m "C2" · write f.txt "3" · git add f.txt · git commit -m "C3"',
        ),
        explanation: L(
          'Setup: history to accidentally lose.',
          'Préparation : un historique à perdre accidentellement.',
        ),
        graphEffect: L(
          'Linear: C1 ← C2 ← C3 (main, HEAD).',
          'Linéaire : C1 ← C2 ← C3 (main, HEAD).',
        ),
        command:
          'git init ; write f.txt "1" ; git add f.txt ; git commit -m "C1" ; write f.txt "2" ; git add f.txt ; git commit -m "C2" ; write f.txt "3" ; git add f.txt ; git commit -m "C3"',
        objectives: [{ description: L('Ready', 'Prêt'), validate: commitCountEquals(3) }],
        successMessage: L('3 commits ready!', '3 commits prêts !'),
      },
      {
        id: 'bad-reset',
        title: L('Accidental reset', 'Reset accidentel'),
        description: L(
          'Simulate losing C3 with `git reset --hard HEAD~1`.',
          'Simulez la perte de C3 avec `git reset --hard HEAD~1`.',
        ),
        hint: L('Command: git reset --hard HEAD~1', 'Commande : git reset --hard HEAD~1'),
        explanation: L(
          '`git reset --hard HEAD~1` moves the branch back 1 commit and discards changes. C3 appears lost.',
          "`git reset --hard HEAD~1` recule la branche d'1 commit et jette les changements. C3 semble perdu.",
        ),
        graphEffect: L(
          'main and HEAD move back to C2. C3 unreachable from HEAD.',
          'main et HEAD reculent sur C2. C3 inaccessible depuis HEAD.',
        ),
        command: 'git reset --hard HEAD~1',
        objectives: [
          {
            description: L('Reset applied', 'Reset appliqué'),
            validate: commitCountEquals(2),
          },
        ],
        successMessage: L('Oops! Commit lost!', 'Oups ! Commit perdu !'),
      },
      {
        id: 'check-reflog',
        title: L('Check reflog', 'Vérifier le reflog'),
        description: L(
          "Run `git reflog` to see HEAD's history.",
          "Exécutez `git reflog` pour voir l'historique de HEAD.",
        ),
        hint: L('Command: git reflog', 'Commande : git reflog'),
        explanation: L(
          "The reflog records every move of HEAD. You'll see `HEAD@{1}: reset --hard HEAD~1` and before it, the commit you lost.",
          'Le reflog enregistre chaque déplacement de HEAD. Vous verrez `HEAD@{1}: reset --hard HEAD~1` et avant, le commit que vous avez perdu.',
        ),
        graphEffect: L(
          'No change (reflog is a log, not drawn).',
          'Aucun changement (le reflog est un journal, pas dessiné).',
        ),
        command: 'git reflog',
        objectives: [
          {
            description: L('Reflog shown', 'Reflog affiché'),
            validate: commitCountEquals(2),
          },
        ],
        successMessage: L(
          'Reflog shows HEAD@{1}! Your lost commit is there.',
          'Reflog affiche HEAD@{1} ! Votre commit perdu est là.',
        ),
      },
      {
        id: 'recover',
        title: L('Recover the commit', 'Récupérer le commit'),
        description: L(
          'Reset to `HEAD@{1}` to recover C3.',
          'Basculez sur `HEAD@{1}` pour récupérer C3.',
        ),
        hint: L('Command: git reset --hard HEAD@{1}', 'Commande : git reset --hard HEAD@{1}'),
        explanation: L(
          '`git reset --hard HEAD@{1}` moves the branch to where HEAD was before the bad reset. C3 is restored.',
          "`git reset --hard HEAD@{1}` ramène la branche à l'endroit où HEAD était avant le mauvais reset. C3 est restauré.",
        ),
        graphEffect: L(
          'main and HEAD jump back to C3. Commit restored.',
          'main et HEAD reviennent à C3. Commit restauré.',
        ),
        command: 'git reset --hard HEAD@{1}',
        objectives: [
          {
            description: L('Recovered', 'Récupéré'),
            validate: commitCountEquals(3),
          },
        ],
        successMessage: L(
          'Success! Lost commit recovered thanks to reflog!',
          'Succès ! Commit perdu récupéré grâce au reflog !',
        ),
      },
    ],
  },

  {
    id: 'cherry-pick-revert',
    level: 'advanced',
    title: L('Cherry-pick & revert', 'Cherry-pick & revert'),
    description: L(
      'Learn to copy commits (cherry-pick) or invert them (revert).',
      'Apprenez à copier des commits (cherry-pick) ou à les inverser (revert).',
    ),
    duration: 22,
    suggestedCommands: ['git cherry-pick', 'git revert'],
    steps: [
      {
        id: 'setup-branches',
        title: L('Setup branches', 'Préparer les branches'),
        description: L(
          'Create two branches with different commits.',
          'Créez deux branches avec des commits différents.',
        ),
        hint: L(
          'git init · write f.txt "base" · git add f.txt · git commit -m "C1" · git branch feature · git checkout feature · write f.txt "feature change" · git add f.txt · git commit -m "C2-feature" · git checkout main',
          'git init · write f.txt "base" · git add f.txt · git commit -m "C1" · git branch feature · git checkout feature · write f.txt "feature change" · git add f.txt · git commit -m "C2-feature" · git checkout main',
        ),
        explanation: L(
          'Setup: feature branch with a commit, then switch back to main.',
          'Préparation : branche feature avec un commit, puis revenir sur main.',
        ),
        graphEffect: L(
          'C1 ← C2-feature (feature), HEAD on main (C1).',
          'C1 ← C2-feature (feature), HEAD sur main (C1).',
        ),
        command:
          'git init ; write f.txt "base" ; git add f.txt ; git commit -m "C1" ; git branch feature ; git checkout feature ; write f.txt "feature change" ; git add f.txt ; git commit -m "C2-feature" ; git checkout main',
        objectives: [
          {
            description: L('Ready', 'Prêt'),
            validate: all(hasBranch('feature'), headPointsTo('main')),
          },
        ],
        successMessage: L('Branches ready!', 'Branches prêtes !'),
      },
      {
        id: 'cherry-pick-commit',
        title: L('Cherry-pick a commit', "Faire cherry-pick d'un commit"),
        description: L(
          'Copy the feature commit onto main.',
          'Copiez le commit de feature sur main.',
        ),
        hint: L('Command: git cherry-pick feature', 'Commande : git cherry-pick feature'),
        explanation: L(
          '`git cherry-pick <commit>` replays that commit on the current branch with a new hash. Useful to apply a specific commit from another branch.',
          "`git cherry-pick <commit>` rejoue ce commit sur la branche courante avec un nouveau hash. Utile pour appliquer un commit spécifique d'une autre branche.",
        ),
        graphEffect: L(
          "C1 ← C2' (main, HEAD, new hash), C1 ← C2-feature (feature).",
          "C1 ← C2' (main, HEAD, nouveau hash), C1 ← C2-feature (feature).",
        ),
        command: 'git cherry-pick feature',
        objectives: [
          {
            description: L('Copied', 'Copié'),
            validate: all(commitCountEquals(2), headPointsTo('main')),
          },
        ],
        successMessage: L('Commit copied to main!', 'Commit copié sur main !'),
      },
      {
        id: 'create-bad',
        title: L('Create a bad commit', 'Créer un mauvais commit'),
        description: L(
          "Commit something we'll revert.",
          "Committez quelque chose qu'on va revert.",
        ),
        hint: L(
          'write f.txt "oops" · git add f.txt · git commit -m "Bad commit"',
          'write f.txt "oops" · git add f.txt · git commit -m "Bad commit"',
        ),
        explanation: L(
          'Create a commit to practice revert.',
          'Créez un commit pour pratiquer le revert.',
        ),
        graphEffect: L(
          'New commit C4 (Bad commit) on main.',
          'Nouveau commit C4 (Bad commit) sur main.',
        ),
        command: 'write f.txt "oops" ; git add f.txt ; git commit -m "Bad commit"',
        objectives: [
          {
            description: L('Bad commit created', 'Mauvais commit créé'),
            validate: commitCountEquals(3),
          },
        ],
        successMessage: L('Bad commit ready for revert!', 'Mauvais commit prêt pour revert !'),
      },
      {
        id: 'revert-commit',
        title: L('Revert the bad commit', 'Revert le mauvais commit'),
        description: L(
          'Create a revert commit with `git revert HEAD`.',
          'Créez un commit de revert avec `git revert HEAD`.',
        ),
        hint: L('Command: git revert HEAD', 'Commande : git revert HEAD'),
        explanation: L(
          '`git revert` creates a new commit that inverts the changes of the specified commit. Commits remain in history (safer than reset for public work).',
          "`git revert` crée un nouveau commit qui inverse les changements du commit spécifié. Les commits restent dans l'historique (plus sûr que reset pour le travail public).",
        ),
        graphEffect: L(
          'New commit C5 (Revert "Bad commit") with inverted diff.',
          'Nouveau commit C5 (Revert "Bad commit") avec diff inversé.',
        ),
        command: 'git revert HEAD',
        objectives: [
          {
            description: L('Reverted', 'Reverté'),
            validate: commitCountEquals(4),
          },
        ],
        successMessage: L(
          'Revert complete! Changes undone, history preserved.',
          'Revert terminé ! Changements annulés, historique préservé.',
        ),
      },
    ],
  },

  {
    id: 'stash-workflow',
    level: 'advanced',
    title: L('Stash workflow', 'Workflow de stash'),
    description: L(
      'Learn to stash: temporarily save modifications without committing.',
      'Apprenez le stash : sauvegardez temporairement des modifications sans committer.',
    ),
    duration: 18,
    suggestedCommands: ['git stash', 'git stash push', 'git stash pop'],
    steps: [
      {
        id: 'setup-initial',
        title: L('Create initial commit', 'Créer un commit initial'),
        description: L('Setup: one initial commit.', 'Préparation : un commit initial.'),
        hint: L(
          'git init · write f.txt "initial" · git add f.txt · git commit -m "C1"',
          'git init · write f.txt "initial" · git add f.txt · git commit -m "C1"',
        ),
        explanation: L(
          'Setup: a baseline to demonstrate stash.',
          'Préparation : une base de référence pour démontrer le stash.',
        ),
        graphEffect: L('C1 (main, HEAD).', 'C1 (main, HEAD).'),
        command: 'git init ; write f.txt "initial" ; git add f.txt ; git commit -m "C1"',
        objectives: [{ description: L('Ready', 'Prêt'), validate: commitCountEquals(1) }],
        successMessage: L('Ready!', 'Prêt !'),
      },
      {
        id: 'modify-stash',
        title: L('Modify and stash', 'Modifier et stasher'),
        description: L(
          'Modify a file and save it with stash.',
          'Modifiez un fichier et sauvegardez-le avec stash.',
        ),
        hint: L(
          'write f.txt "work in progress" · git stash push -m "temp"',
          'write f.txt "work in progress" · git stash push -m "temp"',
        ),
        explanation: L(
          '`git stash push` saves modifications to a temporary stack. The working tree becomes clean (reverted to HEAD).',
          '`git stash push` sauvegarde les modifications sur une pile temporaire. Le working tree devient propre (revert sur HEAD).',
        ),
        graphEffect: L(
          'Graph reverts to clean state (C1).',
          "Le graphe revient à l'état propre (C1).",
        ),
        command: 'write f.txt "work in progress" ; git stash push -m "temp"',
        objectives: [
          {
            description: L('1 stash entry created', '1 entrée de stash créée'),
            validate: all(hasStashCount(1), noStagedChanges()),
          },
        ],
        successMessage: L('Work saved to stash!', 'Travail sauvegardé en stash !'),
      },
      {
        id: 'switch-branch',
        title: L('Work on another branch', 'Travailler sur une autre branche'),
        description: L(
          'Create and work on a hotfix branch.',
          'Créez et travaillez sur une branche hotfix.',
        ),
        hint: L(
          'git checkout -b hotfix · write f.txt "hotfix" · git add f.txt · git commit -m "C2-hotfix"',
          'git checkout -b hotfix · write f.txt "hotfix" · git add f.txt · git commit -m "C2-hotfix"',
        ),
        explanation: L(
          'While work is stashed, switch to another branch to handle urgent tasks.',
          'Pendant que le travail est stashé, basculez sur une autre branche pour gérer des tâches urgentes.',
        ),
        graphEffect: L('C1 ← C2-hotfix (hotfix, HEAD).', 'C1 ← C2-hotfix (hotfix, HEAD).'),
        command:
          'git checkout -b hotfix ; write f.txt "hotfix" ; git add f.txt ; git commit -m "C2-hotfix"',
        objectives: [
          {
            description: L('Hotfix done', 'Hotfix terminé'),
            validate: all(commitCountEquals(2), headPointsTo('hotfix')),
          },
        ],
        successMessage: L('Hotfix complete!', 'Hotfix terminé !'),
      },
      {
        id: 'return-main',
        title: L('Return and list stash', 'Retourner et lister stash'),
        description: L(
          'Go back to main and check stash.',
          'Retournez sur main et vérifiez le stash.',
        ),
        hint: L('git checkout main · git stash list', 'git checkout main · git stash list'),
        explanation: L(
          'Return to main and verify your stashed work is still there.',
          'Retournez sur main et vérifiez que votre travail stashé est toujours là.',
        ),
        graphEffect: L('HEAD on main (C1).', 'HEAD sur main (C1).'),
        command: 'git checkout main ; git stash list',
        objectives: [
          {
            description: L('On main, stash still present', 'Sur main, stash toujours présent'),
            validate: all(headPointsTo('main'), hasStashCount(1)),
          },
        ],
        successMessage: L('Stash entry listed!', 'Entrée stash listée !'),
      },
      {
        id: 'pop-stash',
        title: L('Pop the stash', 'Appliquer le stash'),
        description: L(
          'Restore the stashed modifications with `git stash pop`.',
          'Restaurez les modifications stashées avec `git stash pop`.',
        ),
        hint: L('Command: git stash pop', 'Commande : git stash pop'),
        explanation: L(
          '`git stash pop` removes an entry from the stash and reapplies it to the working tree. Useful for resuming interrupted work.',
          '`git stash pop` retire une entrée du stash et la réapplique au working tree. Utile pour reprendre le travail interrompu.',
        ),
        graphEffect: L(
          'Working tree has modifications again (no new commits).',
          'Le working tree a de nouveau les modifications (aucun nouveau commit).',
        ),
        command: 'git stash pop',
        objectives: [
          {
            description: L('Restored', 'Restauré'),
            validate: all(headPointsTo('main'), fileExists('f.txt')),
          },
        ],
        successMessage: L(
          'Work restored! Ready to continue.',
          'Travail restauré ! Prêt à continuer.',
        ),
      },
    ],
  },

  {
    id: 'pull-rebase-collab',
    level: 'advanced',
    title: L('Pull --rebase (collaborative)', 'Pull --rebase (collaboratif)'),
    description: L(
      'Handle rejected pushes in collaboration: linearize history with `pull --rebase` before re-pushing.',
      "Gérez les pushs rejetés en collaboration : linéarisez l'historique avec `pull --rebase` avant de re-pousser.",
    ),
    duration: 20,
    suggestedCommands: ['git push', 'git pull --rebase'],
    steps: [
      {
        id: 'setup-collab',
        title: L('Setup (simulating collab)', 'Préparer (simuler collab)'),
        description: L(
          'Clone, reset to create divergence (A3).',
          'Clonez, faites reset pour créer divergence (A3).',
        ),
        hint: L(
          'git clone feature-repo · git reset --hard HEAD~1 · write local.txt "my work" · git add local.txt · git commit -m "Local"',
          'git clone feature-repo · git reset --hard HEAD~1 · write local.txt "my work" · git add local.txt · git commit -m "Local"',
        ),
        explanation: L(
          "Technique A3: clone sets up upstream, reset --hard HEAD~1 makes origin ahead. Local commit creates divergence (simulates coworker's push).",
          "Technique A3 : clone configure l'upstream, reset --hard HEAD~1 met origin en avance. Commit local crée divergence (simule le push d'un coéquipier).",
        ),
        graphEffect: L(
          'Divergence: local and origin/develop split from common ancestor.',
          "Divergence : local et origin/develop se séparent depuis l'ancêtre commun.",
        ),
        command:
          'git clone feature-repo ; git reset --hard HEAD~1 ; write local.txt "my work" ; git add local.txt ; git commit -m "Local"',
        objectives: [
          {
            description: L('Ready', 'Prêt'),
            validate: fileExists('local.txt'),
          },
        ],
        successMessage: L('Divergence simulated!', 'Divergence simulée !'),
      },
      {
        id: 'attempt-push',
        title: L('Attempt push (rejected)', 'Tentez push (rejeté)'),
        description: L(
          'Try to push: it will be rejected (non-fast-forward).',
          'Essayez de pousser : ce sera rejeté (non-fast-forward).',
        ),
        hint: L('Command: git push', 'Commande : git push'),
        explanation: L(
          '`git push` is rejected: "Updates were rejected because the remote contains work that you do not have locally". You cannot overwrite others\' work.',
          '`git push` est rejeté : "Updates were rejected because the remote contains work that you do not have locally". Vous ne pouvez pas écraser le travail d\'autrui.',
        ),
        graphEffect: L('No change (push refused).', 'Aucun changement (push refusé).'),
        command: 'git push',
        objectives: [
          {
            description: L('Push rejected', 'Push rejeté'),
            validate: branchHasUpstream('develop'),
          },
        ],
        successMessage: L(
          "Push rejected as expected. Now we'll resolve it.",
          'Push rejeté comme prévu. Nous allons maintenant le résoudre.',
        ),
      },
      {
        id: 'fetch-updates',
        title: L('Fetch remote updates', 'Récupérer les mises à jour distantes'),
        description: L(
          'Download remote changes with `git fetch`.',
          'Téléchargez les changements distants avec `git fetch`.',
        ),
        hint: L('Command: git fetch', 'Commande : git fetch'),
        explanation: L(
          "`git fetch` downloads remote commits without merging. Updates origin/develop locally so we can see what we're integrating.",
          "`git fetch` télécharge les commits distants sans fusionner. Met à jour origin/develop localement pour voir ce qu'on intègre.",
        ),
        graphEffect: L(
          'origin/develop is now available locally in split-screen view.',
          'origin/develop est maintenant disponible localement en vue split-screen.',
        ),
        command: 'git fetch',
        objectives: [
          {
            description: L('Fetched', 'Récupéré'),
            validate: branchHasUpstream('develop'),
          },
        ],
        successMessage: L('Remote changes fetched!', 'Changements distants récupérés !'),
      },
      {
        id: 'rebase-pull',
        title: L('Pull --rebase (linearize)', 'Pull --rebase (linéariser)'),
        description: L(
          'Integrate with `git pull --rebase` instead of merge.',
          'Intégrez avec `git pull --rebase` au lieu de merge.',
        ),
        hint: L('Command: git pull --rebase', 'Commande : git pull --rebase'),
        explanation: L(
          '`git pull --rebase` = fetch + rebase. Instead of a merge commit, local commits are replayed on top of remote. History stays linear (preferred in collaborative workflows).',
          "`git pull --rebase` = fetch + rebase. Au lieu d'un commit de fusion, les commits locaux sont rejoués sur le distant. L'historique reste linéaire (préféré dans les workflows collaboratifs).",
        ),
        graphEffect: L(
          'Local commit replayed on top of origin/develop. No merge commit; linear history.',
          'Commit local rejoué au-dessus de origin/develop. Aucun commit de fusion ; historique linéaire.',
        ),
        command: 'git pull --rebase',
        objectives: [
          {
            description: L('Rebased', 'Rebasé'),
            validate: noOperationInProgress(),
          },
        ],
        successMessage: L(
          'Pull --rebase complete! History is linear.',
          "Pull --rebase terminé ! L'historique est linéaire.",
        ),
      },
      {
        id: 'push-success',
        title: L('Push now succeeds', 'Push réussit maintenant'),
        description: L(
          'Now `git push` will succeed (fast-forward).',
          'Maintenant `git push` réussira (fast-forward).',
        ),
        hint: L('Command: git push', 'Commande : git push'),
        explanation: L(
          'After the rebase, the local branch is ahead of origin on a linear path → the fast-forward push is accepted.',
          'Après le rebase, la branche locale est en avance sur origin sur un chemin linéaire → le push fast-forward est accepté.',
        ),
        graphEffect: L(
          'In split-screen, origin/develop catches up to the local branch.',
          'En vue split-screen, origin/develop rattrape la branche locale.',
        ),
        command: 'git push',
        objectives: [
          {
            description: L('Push successful', 'Push réussi'),
            validate: branchHasUpstream('develop'),
          },
        ],
        successMessage: L(
          'Push successful! Collaborative workflow complete.',
          'Push réussi ! Workflow collaboratif terminé.',
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
