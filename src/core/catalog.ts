/**
 * Catalogue de commandes Git — source de vérité programmatique.
 *
 * Contient les métadonnées de toutes les commandes implémentées :
 * description courte, catégorie, flags, synopsis, description longue, exemples.
 *
 * Ce module est TS pur (zéro import Vue) et testable headless.
 * L'UI consomme uniquement via les helpers exportés ou via GitEngine.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Flag {
  /** Nom du flag (ex: "-m", "--soft", "<pathspec>") */
  name: string;
  /** True si le flag accepte un argument (ex: -m <message>) */
  hasArgument: boolean;
  /** Description courte du flag (en français) */
  description: string;
  /** True si le flag est couramment utilisé / recommandé */
  isCommon: boolean;
}

export interface CommandMetadata {
  /** Nom de la commande (ex: "commit", "branch") */
  name: string;
  /** Description courte (1 ligne, en français) */
  description: string;
  /** Catégorie (ex: "Commits", "Branches") */
  category: string;
  /** Flags et options supportées */
  flags: Flag[];
  /** Syntaxe résumée (ex: "git commit [options]") */
  synopsis: string;
  /** Description longue (1-2 phrases) */
  longDescription: string;
  /** Exemples concrets (2-3 lignes) */
  examples: string[];
}

export interface CommandCatalog {
  /** Version du catalogue (pour versionning de compatibilité) */
  version: string;
  /** Commandes groupées par catégorie */
  commands: Record<string, CommandMetadata[]>;
  /** Map plate : nom → CommandMetadata (pour lookup O(1)) */
  lookup: Record<string, CommandMetadata>;
}

// ---------------------------------------------------------------------------
// Données du catalogue
// ---------------------------------------------------------------------------

/** Commandes définies par catégorie (ordre d'affichage). */
const COMMANDS_BY_CATEGORY: Record<string, CommandMetadata[]> = {
  'Initialisation & Configuration': [
    {
      name: 'init',
      description: 'Initialiser un dépôt Git vierge',
      category: 'Initialisation & Configuration',
      flags: [],
      synopsis: 'git init',
      longDescription:
        'Crée un nouveau dépôt Git vide dans le répertoire courant. ' +
        'Initialise les structures internes (HEAD, refs, index, working tree virtuel).',
      examples: ['git init'],
    },
  ],

  'Fichiers & Index': [
    {
      name: 'add',
      description: 'Ajouter des fichiers à l\'index',
      category: 'Fichiers & Index',
      flags: [
        { name: '-A', hasArgument: false, description: 'Ajouter tous les fichiers modifiés ou non-suivis', isCommon: true },
        { name: '--all', hasArgument: false, description: 'Alias de -A', isCommon: false },
        { name: '<pathspec>', hasArgument: true, description: 'Chemin(s) spécifique(s) à ajouter', isCommon: true },
      ],
      synopsis: 'git add <pathspec>...\ngit add -A',
      longDescription:
        'Ajoute le contenu du fichier spécifié à l\'index (staging area) pour le prochain commit. ' +
        'Avec -A ou --all, ajoute tous les fichiers modifiés et non-suivis.',
      examples: [
        'git add README.md',
        'git add src/main.ts',
        'git add -A',
      ],
    },
    {
      name: 'status',
      description: 'Afficher l\'état du dépôt',
      category: 'Fichiers & Index',
      flags: [
        { name: '-s', hasArgument: false, description: 'Format court (short)', isCommon: true },
        { name: '--short', hasArgument: false, description: 'Alias de -s', isCommon: false },
      ],
      synopsis: 'git status [-s | --short]',
      longDescription:
        'Affiche l\'état du working tree : fichiers modifiés, stagés, non-suivis. ' +
        'Avec -s, affiche un format compact (une ligne par fichier).',
      examples: [
        'git status',
        'git status -s',
      ],
    },
    {
      name: 'restore',
      description: 'Restaurer fichiers dans l\'index ou le working tree',
      category: 'Fichiers & Index',
      flags: [
        { name: '--staged', hasArgument: false, description: 'Restaurer l\'index (désindexer)', isCommon: true },
        { name: '--source=<commit>', hasArgument: true, description: 'Source du contenu à restaurer', isCommon: false },
        { name: '<pathspec>', hasArgument: true, description: 'Fichier(s) à restaurer', isCommon: true },
      ],
      synopsis: 'git restore [--staged] [--source=<commit>] <pathspec>...',
      longDescription:
        'Restaure les fichiers du working tree depuis l\'index, ou l\'index depuis un commit. ' +
        'Avec --staged, désindexe le fichier (annule git add). Avec --source, restaure depuis un commit spécifique.',
      examples: [
        'git restore README.md',
        'git restore --staged README.md',
        'git restore --source=HEAD~1 README.md',
      ],
    },
    {
      name: 'write',
      description: 'Écrire des fichiers dans le working tree virtuel',
      category: 'Fichiers & Index',
      flags: [
        { name: '<path>', hasArgument: true, description: 'Chemin du fichier à écrire', isCommon: true },
        { name: '<content>', hasArgument: true, description: 'Contenu du fichier', isCommon: true },
      ],
      synopsis: 'write <path> "<content>"',
      longDescription:
        'Utilitaire (non-git) : écrit un fichier dans le working tree virtuel du moteur. ' +
        'Permet de préparer des fichiers avant git add / git commit.',
      examples: [
        'write README.md "# Mon projet"',
        'write src/index.ts "export default {}"',
      ],
    },
    {
      name: 'read',
      description: 'Lire des fichiers du working tree virtuel',
      category: 'Fichiers & Index',
      flags: [
        { name: '<path>', hasArgument: true, description: 'Chemin du fichier à lire', isCommon: true },
      ],
      synopsis: 'read <path>',
      longDescription:
        'Utilitaire (non-git) : affiche le contenu d\'un fichier présent dans le working tree virtuel.',
      examples: [
        'read README.md',
        'read src/index.ts',
      ],
    },
  ],

  'Commits': [
    {
      name: 'commit',
      description: 'Créer un commit avec les fichiers stagés',
      category: 'Commits',
      flags: [
        { name: '-m', hasArgument: true, description: 'Message du commit', isCommon: true },
        { name: '--message', hasArgument: true, description: 'Alias de -m', isCommon: false },
      ],
      synopsis: 'git commit -m "<message>"',
      longDescription:
        'Enregistre les changements actuels de l\'index dans un nouveau commit. ' +
        'Le message du commit est obligatoire (-m) ; en son absence, une erreur est retournée.',
      examples: [
        'git commit -m "Initial commit"',
        'git commit -m "Fix bug #123"',
        'git commit -m "Add feature X"',
      ],
    },
    {
      name: 'log',
      description: 'Afficher l\'historique des commits',
      category: 'Commits',
      flags: [
        { name: '--oneline', hasArgument: false, description: 'Format compact (une ligne par commit)', isCommon: true },
        { name: '[<ref>]', hasArgument: true, description: 'Ref ou commit de départ (optionnel)', isCommon: false },
      ],
      synopsis: 'git log [--oneline] [<ref>]',
      longDescription:
        'Affiche l\'historique des commits depuis HEAD (ou depuis la ref spécifiée), du plus récent au plus ancien. ' +
        'Avec --oneline, chaque commit est affiché sur une seule ligne.',
      examples: [
        'git log',
        'git log --oneline',
        'git log main',
      ],
    },
  ],

  'Branches': [
    {
      name: 'branch',
      description: 'Créer, lister ou supprimer des branches',
      category: 'Branches',
      flags: [
        { name: '-d', hasArgument: false, description: 'Supprimer une branche (seulement si fusionnée)', isCommon: true },
        { name: '-D', hasArgument: false, description: 'Forcer la suppression d\'une branche', isCommon: false },
        { name: '[<branchname>]', hasArgument: true, description: 'Nom de la branche à créer', isCommon: true },
      ],
      synopsis: 'git branch [<branchname>]\ngit branch -d <branchname>\ngit branch -D <branchname>',
      longDescription:
        'Sans argument, liste les branches existantes. Avec un nom, crée une nouvelle branche à partir de HEAD. ' +
        'Avec -d/-D, supprime la branche spécifiée.',
      examples: [
        'git branch',
        'git branch feature/login',
        'git branch -d feature/login',
      ],
    },
    {
      name: 'checkout',
      description: 'Basculer de branche ou repositionner HEAD',
      category: 'Branches',
      flags: [
        { name: '-b', hasArgument: false, description: 'Créer et basculer vers la nouvelle branche', isCommon: true },
        { name: '<branch>', hasArgument: true, description: 'Branche ou commit cible', isCommon: true },
        { name: '-', hasArgument: false, description: 'Basculer vers la branche précédente', isCommon: false },
      ],
      synopsis: 'git checkout <branch>\ngit checkout -b <branch>\ngit checkout <commit>\ngit checkout -',
      longDescription:
        'Bascule vers une branche ou positionne HEAD sur un commit (HEAD détaché). ' +
        'Avec -b, crée la branche et bascule dessus en une seule opération.',
      examples: [
        'git checkout main',
        'git checkout -b feature/auth',
        'git checkout -',
      ],
    },
    {
      name: 'switch',
      description: 'Basculer de branche (variante de checkout)',
      category: 'Branches',
      flags: [
        { name: '-c', hasArgument: false, description: 'Créer et basculer vers la nouvelle branche', isCommon: true },
        { name: '--detach', hasArgument: false, description: 'Détacher HEAD sur un commit', isCommon: false },
        { name: '<branch>', hasArgument: true, description: 'Branche cible', isCommon: true },
        { name: '-', hasArgument: false, description: 'Basculer vers la branche précédente', isCommon: false },
      ],
      synopsis: 'git switch <branch>\ngit switch -c <branch>\ngit switch --detach <commit>\ngit switch -',
      longDescription:
        'Bascule vers une branche existante. Variante moderne de git checkout limitée aux branches. ' +
        'Avec -c, crée la branche et bascule dessus. Avec --detach, détache HEAD sur un commit.',
      examples: [
        'git switch main',
        'git switch -c feature/new',
        'git switch -',
      ],
    },
    {
      name: 'tag',
      description: 'Créer, lister ou supprimer des étiquettes',
      category: 'Branches',
      flags: [
        { name: '-d', hasArgument: false, description: 'Supprimer un tag', isCommon: false },
        { name: '<tagname>', hasArgument: true, description: 'Nom du tag à créer', isCommon: true },
        { name: '<commit>', hasArgument: true, description: 'Commit cible (défaut : HEAD)', isCommon: false },
      ],
      synopsis: 'git tag [<tagname> [<commit>]]\ngit tag -d <tagname>',
      longDescription:
        'Sans argument, liste tous les tags. Avec un nom, crée un tag léger pointant sur HEAD (ou le commit spécifié). ' +
        'Avec -d, supprime le tag.',
      examples: [
        'git tag',
        'git tag v1.0.0',
        'git tag -d v1.0.0',
      ],
    },
  ],

  'Fusion & Réécriture': [
    {
      name: 'merge',
      description: 'Fusionner une branche dans la branche courante',
      category: 'Fusion & Réécriture',
      flags: [
        { name: '--no-ff', hasArgument: false, description: 'Forcer un commit de fusion (pas de fast-forward)', isCommon: true },
        { name: '-m', hasArgument: true, description: 'Message du commit de fusion', isCommon: false },
        { name: '--abort', hasArgument: false, description: 'Annuler la fusion en cours', isCommon: true },
        { name: '<branchname>', hasArgument: true, description: 'Branche à fusionner', isCommon: true },
      ],
      synopsis: 'git merge <branch>\ngit merge --no-ff <branch>\ngit merge --abort',
      longDescription:
        'Fusionne la branche spécifiée dans la branche courante. Si possible, effectue un fast-forward. ' +
        'En cas de conflit, les marqueurs sont insérés dans les fichiers ; résoudre puis git add + git commit.',
      examples: [
        'git merge feature/login',
        'git merge --no-ff feature/login',
        'git merge --abort',
      ],
    },
    {
      name: 'reset',
      description: 'Réinitialiser HEAD et l\'index',
      category: 'Fusion & Réécriture',
      flags: [
        { name: '--soft', hasArgument: false, description: 'Déplacer HEAD seulement (garder l\'index et le WT)', isCommon: true },
        { name: '--mixed', hasArgument: false, description: 'Déplacer HEAD + réinitialiser l\'index (défaut)', isCommon: true },
        { name: '--hard', hasArgument: false, description: 'Déplacer HEAD + réinitialiser l\'index et le WT', isCommon: true },
        { name: '<ref>', hasArgument: true, description: 'Commit cible (défaut : HEAD)', isCommon: false },
      ],
      synopsis: 'git reset [--soft | --mixed | --hard] [<ref>]',
      longDescription:
        'Déplace HEAD (et la branche courante) vers le commit spécifié. ' +
        '--soft conserve tout, --mixed réinitialise l\'index, --hard réinitialise l\'index et le working tree.',
      examples: [
        'git reset HEAD~1',
        'git reset --soft HEAD~1',
        'git reset --hard HEAD~2',
      ],
    },
    {
      name: 'revert',
      description: 'Créer un commit qui annule les changements d\'un commit',
      category: 'Fusion & Réécriture',
      flags: [
        { name: '<commit>', hasArgument: true, description: 'Commit à annuler', isCommon: true },
      ],
      synopsis: 'git revert <commit>',
      longDescription:
        'Crée un nouveau commit qui annule les changements introduits par le commit spécifié. ' +
        'Contrairement à reset, revert préserve l\'historique existant.',
      examples: [
        'git revert HEAD',
        'git revert abc1234',
        'git revert HEAD~2',
      ],
    },
    {
      name: 'cherry-pick',
      description: 'Appliquer les changements d\'un commit sur la branche courante',
      category: 'Fusion & Réécriture',
      flags: [
        { name: '--continue', hasArgument: false, description: 'Continuer après résolution de conflit', isCommon: true },
        { name: '--abort', hasArgument: false, description: 'Annuler le cherry-pick en cours', isCommon: true },
        { name: '<commit>', hasArgument: true, description: 'Commit à appliquer', isCommon: true },
      ],
      synopsis: 'git cherry-pick <commit>\ngit cherry-pick --continue\ngit cherry-pick --abort',
      longDescription:
        'Rejoue les changements d\'un commit sur la branche courante, créant un nouveau commit. ' +
        'En cas de conflit, résoudre manuellement puis git add + git cherry-pick --continue.',
      examples: [
        'git cherry-pick abc1234',
        'git cherry-pick HEAD~3',
        'git cherry-pick --abort',
      ],
    },
    {
      name: 'rebase',
      description: 'Rejouer les commits sur une nouvelle base',
      category: 'Fusion & Réécriture',
      flags: [
        { name: '-i', hasArgument: false, description: 'Mode interactif (éditer la todo list)', isCommon: true },
        { name: '--continue', hasArgument: false, description: 'Continuer après résolution de conflit', isCommon: true },
        { name: '--abort', hasArgument: false, description: 'Annuler le rebase en cours', isCommon: true },
        { name: '<base>', hasArgument: true, description: 'Branche ou commit de base', isCommon: true },
      ],
      synopsis: 'git rebase <base>\ngit rebase -i <base>\ngit rebase --continue\ngit rebase --abort',
      longDescription:
        'Rejoue les commits de la branche courante au-dessus de la base spécifiée, créant de nouveaux commits. ' +
        'Avec -i (interactif), permet de réordonner, fusionner (squash) ou supprimer des commits.',
      examples: [
        'git rebase main',
        'git rebase -i HEAD~3',
        'git rebase --abort',
      ],
    },
  ],

  'Outils avancés': [
    {
      name: 'stash',
      description: 'Mettre de côté temporairement des changements',
      category: 'Outils avancés',
      flags: [
        { name: 'push', hasArgument: false, description: 'Empiler les changements courants (défaut)', isCommon: true },
        { name: 'list', hasArgument: false, description: 'Lister les entrées du stash', isCommon: true },
        { name: 'pop', hasArgument: false, description: 'Dépiler et appliquer la dernière entrée', isCommon: true },
        { name: 'apply', hasArgument: false, description: 'Appliquer sans supprimer du stash', isCommon: false },
        { name: 'drop', hasArgument: false, description: 'Supprimer une entrée du stash', isCommon: false },
        { name: '<index>', hasArgument: true, description: 'Index de l\'entrée (ex: stash@{0})', isCommon: false },
      ],
      synopsis: 'git stash [push]\ngit stash list\ngit stash pop [<index>]\ngit stash apply [<index>]\ngit stash drop [<index>]',
      longDescription:
        'Sauvegarde les modifications non commitées (index + working tree) dans une pile temporaire. ' +
        'Permet de changer de contexte rapidement et de réappliquer les changements plus tard.',
      examples: [
        'git stash',
        'git stash list',
        'git stash pop',
      ],
    },
    {
      name: 'reflog',
      description: 'Afficher l\'historique des mouvements de HEAD',
      category: 'Outils avancés',
      flags: [
        { name: 'show', hasArgument: false, description: 'Afficher le reflog (défaut)', isCommon: false },
        { name: '[<ref>]', hasArgument: true, description: 'Ref à afficher (défaut : HEAD)', isCommon: false },
      ],
      synopsis: 'git reflog [show] [<ref>]',
      longDescription:
        'Affiche l\'historique de toutes les positions de HEAD, y compris après reset et rebase. ' +
        'Permet de récupérer des commits "perdus" via HEAD@{n}.',
      examples: [
        'git reflog',
        'git reflog show HEAD',
        'git reset --hard HEAD@{2}',
      ],
    },
  ],

  'Distant': [
    {
      name: 'remote',
      description: 'Gérer les dépôts distants',
      category: 'Distant',
      flags: [
        { name: '-v', hasArgument: false, description: 'Afficher les URLs des remotes', isCommon: true },
        { name: 'add', hasArgument: false, description: 'Ajouter un remote', isCommon: true },
        { name: 'remove', hasArgument: false, description: 'Supprimer un remote', isCommon: true },
        { name: 'rm', hasArgument: false, description: 'Alias de remove', isCommon: false },
        { name: '<name>', hasArgument: true, description: 'Nom du remote', isCommon: true },
        { name: '<url>', hasArgument: true, description: 'URL du remote', isCommon: true },
      ],
      synopsis:
        'git remote\ngit remote -v\ngit remote add <name> <url>\ngit remote remove <name>',
      longDescription:
        'Gère les connexions vers des dépôts distants. ' +
        'Sans argument, liste les remotes. Avec add/remove, ajoute ou supprime un remote.',
      examples: [
        'git remote',
        'git remote -v',
        'git remote add origin https://github.com/user/repo.git',
        'git remote remove origin',
      ],
    },
    {
      name: 'clone',
      description: 'Cloner un dépôt distant prédéfini',
      category: 'Distant',
      flags: [
        { name: '<source>', hasArgument: true, description: 'Nom du dépôt source à cloner', isCommon: true },
      ],
      synopsis: 'git clone <source>',
      longDescription:
        'Crée un nouveau dépôt local en copiant un dépôt distant prédéfini. ' +
        'Initialise le dépôt, copie tous les objets, pose les refs de suivi et checkout la branche par défaut.',
      examples: [
        'git clone public-repo',
        'git clone collab-repo',
      ],
    },
    {
      name: 'fetch',
      description: 'Télécharger les commits d\'un dépôt distant',
      category: 'Distant',
      flags: [
        { name: '<remote>', hasArgument: true, description: 'Nom du remote (défaut : origin)', isCommon: true },
        { name: '<branch>', hasArgument: true, description: 'Branche spécifique à récupérer (optionnel)', isCommon: false },
      ],
      synopsis: 'git fetch [<remote>] [<branch>]',
      longDescription:
        'Récupère les nouveaux commits d\'un dépôt distant et met à jour les références de suivi. ' +
        'Ne modifie jamais les branches locales, HEAD, l\'index ou le working tree.',
      examples: [
        'git fetch',
        'git fetch origin',
        'git fetch origin main',
      ],
    },
  ],

  'Aide': [
    {
      name: 'help',
      description: 'Afficher l\'aide des commandes disponibles',
      category: 'Aide',
      flags: [
        { name: '[<commande>]', hasArgument: true, description: 'Commande dont afficher l\'aide détaillée', isCommon: true },
      ],
      synopsis: 'git help [<commande>]',
      longDescription:
        'Sans argument, affiche la liste de toutes les commandes disponibles, groupées par catégorie. ' +
        'Avec un nom de commande, affiche l\'aide détaillée (synopsis, options, exemples).',
      examples: [
        'git help',
        'git help commit',
        'git help merge',
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Construction du catalogue (lookup dérivé des données, pas de double saisie)
// ---------------------------------------------------------------------------

function buildCatalog(): CommandCatalog {
  const lookup: Record<string, CommandMetadata> = {};
  for (const commands of Object.values(COMMANDS_BY_CATEGORY)) {
    for (const cmd of commands) {
      lookup[cmd.name] = cmd;
    }
  }
  return {
    version: '1.0',
    commands: COMMANDS_BY_CATEGORY,
    lookup,
  };
}

/** Le catalogue de commandes complet. */
export const COMMAND_CATALOG: CommandCatalog = buildCatalog();

// ---------------------------------------------------------------------------
// Helpers exportés
// ---------------------------------------------------------------------------

/**
 * Retourne la liste triée alphabétiquement des noms de commandes (sans doublon).
 * Conforme à CA-catalog-01.
 */
export function getCommandNames(): string[] {
  return Object.keys(COMMAND_CATALOG.lookup).sort();
}

/**
 * Retourne les flags d'une commande, ou [] si la commande est inconnue.
 * Conforme à CA-catalog-07.
 */
export function getCommandFlags(name: string): Flag[] {
  return COMMAND_CATALOG.lookup[name]?.flags ?? [];
}

/**
 * Retourne le catalogue complet.
 */
export function getCatalog(): CommandCatalog {
  return COMMAND_CATALOG;
}
