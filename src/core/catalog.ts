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
    {
      name: 'config',
      description: 'Lire ou écrire la configuration (user.name, user.email…)',
      category: 'Initialisation & Configuration',
      flags: [
        {
          name: '--list',
          hasArgument: false,
          description: 'Affiche toutes les clés configurées',
          isCommon: true,
        },
        {
          name: '<key>',
          hasArgument: true,
          description: 'Clé à lire (ou à écrire avec une valeur)',
          isCommon: true,
        },
        {
          name: '<value>',
          hasArgument: true,
          description: 'Valeur à écrire pour la clé',
          isCommon: false,
        },
      ],
      synopsis: 'git config [--list] [<key>] [<value>]',
      longDescription:
        'Lit ou écrit les paramètres de configuration du dépôt. user.name et user.email ' +
        "personnalisent l'auteur des commits (et donc leur hash). Sans valeur, lit la clé ; " +
        "avec une valeur, l'écrit ; --list affiche toutes les clés.",
      examples: [
        'git config user.name "Alice"',
        'git config user.email "alice@example.com"',
        'git config --list',
      ],
    },
  ],

  'Fichiers & Index': [
    {
      name: 'add',
      description: "Ajouter des fichiers à l'index",
      category: 'Fichiers & Index',
      flags: [
        {
          name: '-A',
          hasArgument: false,
          description: 'Ajouter tous les fichiers modifiés ou non-suivis',
          isCommon: true,
        },
        { name: '--all', hasArgument: false, description: 'Alias de -A', isCommon: false },
        {
          name: '<pathspec>',
          hasArgument: true,
          description: 'Chemin(s) spécifique(s) à ajouter',
          isCommon: true,
        },
      ],
      synopsis: 'git add <pathspec>...\ngit add -A',
      longDescription:
        "Ajoute le contenu du fichier spécifié à l'index (staging area) pour le prochain commit. " +
        'Avec -A ou --all, ajoute tous les fichiers modifiés et non-suivis.',
      examples: ['git add README.md', 'git add src/main.ts', 'git add -A'],
    },
    {
      name: 'status',
      description: "Afficher l'état du dépôt",
      category: 'Fichiers & Index',
      flags: [
        { name: '-s', hasArgument: false, description: 'Format court (short)', isCommon: true },
        { name: '--short', hasArgument: false, description: 'Alias de -s', isCommon: false },
      ],
      synopsis: 'git status [-s | --short]',
      longDescription:
        "Affiche l'état du working tree : fichiers modifiés, stagés, non-suivis. " +
        'Avec -s, affiche un format compact (une ligne par fichier).',
      examples: ['git status', 'git status -s'],
    },
    {
      name: 'restore',
      description: "Restaurer fichiers dans l'index ou le working tree",
      category: 'Fichiers & Index',
      flags: [
        {
          name: '--staged',
          hasArgument: false,
          description: "Restaurer l'index (désindexer)",
          isCommon: true,
        },
        {
          name: '--source=<commit>',
          hasArgument: true,
          description: 'Source du contenu à restaurer',
          isCommon: false,
        },
        {
          name: '<pathspec>',
          hasArgument: true,
          description: 'Fichier(s) à restaurer',
          isCommon: true,
        },
      ],
      synopsis: 'git restore [--staged] [--source=<commit>] <pathspec>...',
      longDescription:
        "Restaure les fichiers du working tree depuis l'index, ou l'index depuis un commit. " +
        'Avec --staged, désindexe le fichier (annule git add). Avec --source, restaure depuis un commit spécifique.',
      examples: [
        'git restore README.md',
        'git restore --staged README.md',
        'git restore --source=HEAD~1 README.md',
      ],
    },
    {
      name: 'rm',
      description: "Supprimer des fichiers du working tree et de l'index",
      category: 'Fichiers & Index',
      flags: [
        {
          name: '--cached',
          hasArgument: false,
          description: "Retirer de l'index seulement (garde le fichier)",
          isCommon: true,
        },
        {
          name: '-r',
          hasArgument: false,
          description: 'Supprimer récursivement un répertoire',
          isCommon: true,
        },
        {
          name: '-f',
          hasArgument: false,
          description: 'Forcer même si le fichier est modifié',
          isCommon: false,
        },
        {
          name: '<pathspec>',
          hasArgument: true,
          description: 'Fichier(s) à supprimer',
          isCommon: true,
        },
      ],
      synopsis: 'git rm [--cached] [-r] [-f] <pathspec>...',
      longDescription:
        "Supprime des fichiers du working tree et de l'index. Avec --cached, retire de l'index " +
        'sans supprimer le fichier (il redevient untracked). Refuse un fichier modifié sauf avec -f.',
      examples: ['git rm file.txt', 'git rm --cached file.txt', 'git rm -r src/'],
    },
    {
      name: 'mv',
      description: 'Déplacer ou renommer un fichier',
      category: 'Fichiers & Index',
      flags: [
        {
          name: '-f',
          hasArgument: false,
          description: 'Écraser la destination si elle existe',
          isCommon: false,
        },
        { name: '<src>', hasArgument: true, description: 'Fichier source', isCommon: true },
        {
          name: '<dst>',
          hasArgument: true,
          description: 'Destination (fichier ou répertoire)',
          isCommon: true,
        },
      ],
      synopsis: 'git mv [-f] <src> <dst>',
      longDescription:
        "Renomme ou déplace un fichier dans le working tree et l'index (hash du blob conservé). " +
        "Si <dst> est un répertoire, le fichier y est déplacé sous son nom. Refuse d'écraser sauf avec -f.",
      examples: ['git mv old.txt new.txt', 'git mv file.txt dir/', 'git mv -f a.txt b.txt'],
    },
    {
      name: 'write',
      description: 'Écrire des fichiers dans le working tree virtuel',
      category: 'Fichiers & Index',
      flags: [
        {
          name: '<path>',
          hasArgument: true,
          description: 'Chemin du fichier à écrire',
          isCommon: true,
        },
        { name: '<content>', hasArgument: true, description: 'Contenu du fichier', isCommon: true },
      ],
      synopsis: 'write <path> "<content>"',
      longDescription:
        'Utilitaire (non-git) : écrit un fichier dans le working tree virtuel du moteur. ' +
        'Permet de préparer des fichiers avant git add / git commit.',
      examples: ['write README.md "# Mon projet"', 'write src/index.ts "export default {}"'],
    },
    {
      name: 'read',
      description: 'Lire des fichiers du working tree virtuel',
      category: 'Fichiers & Index',
      flags: [
        {
          name: '<path>',
          hasArgument: true,
          description: 'Chemin du fichier à lire',
          isCommon: true,
        },
      ],
      synopsis: 'read <path>',
      longDescription:
        "Utilitaire (non-git) : affiche le contenu d'un fichier présent dans le working tree virtuel.",
      examples: ['read README.md', 'read src/index.ts'],
    },
  ],

  Commits: [
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
        "Enregistre les changements actuels de l'index dans un nouveau commit. " +
        'Le message du commit est obligatoire (-m) ; en son absence, une erreur est retournée.',
      examples: [
        'git commit -m "Initial commit"',
        'git commit -m "Fix bug #123"',
        'git commit -m "Add feature X"',
      ],
    },
    {
      name: 'log',
      description: "Afficher l'historique des commits",
      category: 'Commits',
      flags: [
        {
          name: '--oneline',
          hasArgument: false,
          description: 'Format compact (une ligne par commit)',
          isCommon: true,
        },
        {
          name: '--graph',
          hasArgument: false,
          description: 'Graphe ASCII des branches/merges',
          isCommon: true,
        },
        {
          name: '[<ref>]',
          hasArgument: true,
          description: 'Ref ou commit de départ (optionnel)',
          isCommon: false,
        },
      ],
      synopsis: 'git log [--oneline] [--graph] [<ref>]',
      longDescription:
        "Affiche l'historique des commits depuis HEAD (ou depuis la ref spécifiée), du plus récent au plus ancien. " +
        'Avec --oneline, chaque commit est affiché sur une seule ligne. ' +
        "Avec --graph, l'historique est dessiné en ASCII (* | / \\) pour visualiser branches et merges.",
      examples: ['git log', 'git log --oneline', 'git log --graph --oneline', 'git log main'],
    },
    {
      name: 'diff',
      description: 'Afficher les différences entre états',
      category: 'Commits',
      flags: [
        {
          name: '--staged',
          hasArgument: false,
          description: 'Index vs HEAD (changements stagés)',
          isCommon: true,
        },
        { name: '--cached', hasArgument: false, description: 'Alias de --staged', isCommon: false },
        {
          name: '[<commit>]',
          hasArgument: true,
          description: 'Comparer avec un commit/branche',
          isCommon: false,
        },
        {
          name: '--',
          hasArgument: true,
          description: 'Limiter aux chemins spécifiés',
          isCommon: false,
        },
      ],
      synopsis: 'git diff [--staged|--cached] [<commit> [<commit>]] [-- <pathspec>...]',
      longDescription:
        'Affiche les différences ligne à ligne. Sans argument : working tree vs index. ' +
        'Avec --staged/--cached : index vs HEAD. Avec un ou deux commits : compare ces états. ' +
        "L'option -- limite la comparaison aux chemins indiqués.",
      examples: [
        'git diff',
        'git diff --staged',
        'git diff HEAD~1 HEAD',
        'git diff main feature',
        'git diff -- src/',
      ],
    },
    {
      name: 'show',
      description: 'Afficher un commit (métadonnées + diff)',
      category: 'Commits',
      flags: [
        {
          name: '[<commit>]',
          hasArgument: true,
          description: 'Commit à afficher (défaut : HEAD)',
          isCommon: false,
        },
      ],
      synopsis: 'git show [<commit>]',
      longDescription:
        "Affiche les métadonnées d'un commit (hash, auteur, date, message) suivies du diff " +
        "vs son premier parent (ou vs l'arbre vide pour le commit initial).",
      examples: ['git show', 'git show HEAD', 'git show <hash>'],
    },
  ],

  Branches: [
    {
      name: 'branch',
      description: 'Créer, lister ou supprimer des branches',
      category: 'Branches',
      flags: [
        {
          name: '-d',
          hasArgument: false,
          description: 'Supprimer une branche (seulement si fusionnée)',
          isCommon: true,
        },
        {
          name: '-D',
          hasArgument: false,
          description: "Forcer la suppression d'une branche",
          isCommon: false,
        },
        {
          name: '-v',
          hasArgument: false,
          description: 'Afficher le hash et le message de chaque branche',
          isCommon: false,
        },
        {
          name: '-vv',
          hasArgument: false,
          description: "Afficher aussi l'upstream et l'écart ahead/behind",
          isCommon: true,
        },
        {
          name: '-u',
          hasArgument: true,
          description: 'Configurer le suivi upstream : -u <remote>/<branch>',
          isCommon: true,
        },
        {
          name: '--set-upstream-to=<upstream>',
          hasArgument: true,
          description: "Configurer l'upstream (longue forme)",
          isCommon: false,
        },
        {
          name: '--unset-upstream',
          hasArgument: false,
          description: 'Retirer la configuration upstream',
          isCommon: false,
        },
        {
          name: '[<branchname>]',
          hasArgument: true,
          description: 'Nom de la branche à créer',
          isCommon: true,
        },
      ],
      synopsis:
        'git branch [<branchname>]\ngit branch -d <branchname>\ngit branch -D <branchname>\n' +
        'git branch -vv\ngit branch -u <remote>/<branch> [<branchname>]\ngit branch --unset-upstream [<branchname>]',
      longDescription:
        'Sans argument, liste les branches existantes. Avec un nom, crée une nouvelle branche à partir de HEAD. ' +
        'Avec -d/-D, supprime la branche spécifiée. ' +
        'Avec -vv, affiche le détail de chaque branche (hash, upstream, ahead/behind). ' +
        "Avec -u, configure l'upstream de la branche courante ou spécifiée.",
      examples: [
        'git branch',
        'git branch feature/login',
        'git branch -d feature/login',
        'git branch -vv',
        'git branch -u origin/main',
        'git branch --unset-upstream feature',
      ],
    },
    {
      name: 'checkout',
      description: 'Basculer de branche ou repositionner HEAD',
      category: 'Branches',
      flags: [
        {
          name: '-b',
          hasArgument: false,
          description: 'Créer et basculer vers la nouvelle branche',
          isCommon: true,
        },
        {
          name: '<branch>',
          hasArgument: true,
          description: 'Branche ou commit cible',
          isCommon: true,
        },
        {
          name: '-',
          hasArgument: false,
          description: 'Basculer vers la branche précédente',
          isCommon: false,
        },
      ],
      synopsis:
        'git checkout <branch>\ngit checkout -b <branch>\ngit checkout <commit>\ngit checkout -',
      longDescription:
        'Bascule vers une branche ou positionne HEAD sur un commit (HEAD détaché). ' +
        'Avec -b, crée la branche et bascule dessus en une seule opération.',
      examples: ['git checkout main', 'git checkout -b feature/auth', 'git checkout -'],
    },
    {
      name: 'switch',
      description: 'Basculer de branche (variante de checkout)',
      category: 'Branches',
      flags: [
        {
          name: '-c',
          hasArgument: false,
          description: 'Créer et basculer vers la nouvelle branche',
          isCommon: true,
        },
        {
          name: '--detach',
          hasArgument: false,
          description: 'Détacher HEAD sur un commit',
          isCommon: false,
        },
        { name: '<branch>', hasArgument: true, description: 'Branche cible', isCommon: true },
        {
          name: '-',
          hasArgument: false,
          description: 'Basculer vers la branche précédente',
          isCommon: false,
        },
      ],
      synopsis:
        'git switch <branch>\ngit switch -c <branch>\ngit switch --detach <commit>\ngit switch -',
      longDescription:
        'Bascule vers une branche existante. Variante moderne de git checkout limitée aux branches. ' +
        'Avec -c, crée la branche et bascule dessus. Avec --detach, détache HEAD sur un commit.',
      examples: ['git switch main', 'git switch -c feature/new', 'git switch -'],
    },
    {
      name: 'tag',
      description: 'Créer, lister ou supprimer des étiquettes',
      category: 'Branches',
      flags: [
        { name: '-d', hasArgument: false, description: 'Supprimer un tag', isCommon: false },
        { name: '<tagname>', hasArgument: true, description: 'Nom du tag à créer', isCommon: true },
        {
          name: '<commit>',
          hasArgument: true,
          description: 'Commit cible (défaut : HEAD)',
          isCommon: false,
        },
      ],
      synopsis: 'git tag [<tagname> [<commit>]]\ngit tag -d <tagname>',
      longDescription:
        'Sans argument, liste tous les tags. Avec un nom, crée un tag léger pointant sur HEAD (ou le commit spécifié). ' +
        'Avec -d, supprime le tag.',
      examples: ['git tag', 'git tag v1.0.0', 'git tag -d v1.0.0'],
    },
  ],

  'Fusion & Réécriture': [
    {
      name: 'merge',
      description: 'Fusionner une branche dans la branche courante',
      category: 'Fusion & Réécriture',
      flags: [
        {
          name: '--no-ff',
          hasArgument: false,
          description: 'Forcer un commit de fusion (pas de fast-forward)',
          isCommon: true,
        },
        {
          name: '-m',
          hasArgument: true,
          description: 'Message du commit de fusion',
          isCommon: false,
        },
        {
          name: '--abort',
          hasArgument: false,
          description: 'Annuler la fusion en cours',
          isCommon: true,
        },
        {
          name: '<branchname>',
          hasArgument: true,
          description: 'Branche à fusionner',
          isCommon: true,
        },
      ],
      synopsis: 'git merge <branch>\ngit merge --no-ff <branch>\ngit merge --abort',
      longDescription:
        'Fusionne la branche spécifiée dans la branche courante. Si possible, effectue un fast-forward. ' +
        'En cas de conflit, les marqueurs sont insérés dans les fichiers ; résoudre puis git add + git commit.',
      examples: ['git merge feature/login', 'git merge --no-ff feature/login', 'git merge --abort'],
    },
    {
      name: 'reset',
      description: "Réinitialiser HEAD et l'index",
      category: 'Fusion & Réécriture',
      flags: [
        {
          name: '--soft',
          hasArgument: false,
          description: "Déplacer HEAD seulement (garder l'index et le WT)",
          isCommon: true,
        },
        {
          name: '--mixed',
          hasArgument: false,
          description: "Déplacer HEAD + réinitialiser l'index (défaut)",
          isCommon: true,
        },
        {
          name: '--hard',
          hasArgument: false,
          description: "Déplacer HEAD + réinitialiser l'index et le WT",
          isCommon: true,
        },
        {
          name: '<ref>',
          hasArgument: true,
          description: 'Commit cible (défaut : HEAD)',
          isCommon: false,
        },
      ],
      synopsis: 'git reset [--soft | --mixed | --hard] [<ref>]',
      longDescription:
        'Déplace HEAD (et la branche courante) vers le commit spécifié. ' +
        "--soft conserve tout, --mixed réinitialise l'index, --hard réinitialise l'index et le working tree.",
      examples: ['git reset HEAD~1', 'git reset --soft HEAD~1', 'git reset --hard HEAD~2'],
    },
    {
      name: 'revert',
      description: "Créer un commit qui annule les changements d'un commit",
      category: 'Fusion & Réécriture',
      flags: [
        { name: '<commit>', hasArgument: true, description: 'Commit à annuler', isCommon: true },
      ],
      synopsis: 'git revert <commit>',
      longDescription:
        'Crée un nouveau commit qui annule les changements introduits par le commit spécifié. ' +
        "Contrairement à reset, revert préserve l'historique existant.",
      examples: ['git revert HEAD', 'git revert abc1234', 'git revert HEAD~2'],
    },
    {
      name: 'cherry-pick',
      description: "Appliquer les changements d'un commit sur la branche courante",
      category: 'Fusion & Réécriture',
      flags: [
        {
          name: '--continue',
          hasArgument: false,
          description: 'Continuer après résolution de conflit',
          isCommon: true,
        },
        {
          name: '--abort',
          hasArgument: false,
          description: 'Annuler le cherry-pick en cours',
          isCommon: true,
        },
        { name: '<commit>', hasArgument: true, description: 'Commit à appliquer', isCommon: true },
      ],
      synopsis: 'git cherry-pick <commit>\ngit cherry-pick --continue\ngit cherry-pick --abort',
      longDescription:
        "Rejoue les changements d'un commit sur la branche courante, créant un nouveau commit. " +
        'En cas de conflit, résoudre manuellement puis git add + git cherry-pick --continue.',
      examples: ['git cherry-pick abc1234', 'git cherry-pick HEAD~3', 'git cherry-pick --abort'],
    },
    {
      name: 'rebase',
      description: 'Rejouer les commits sur une nouvelle base',
      category: 'Fusion & Réécriture',
      flags: [
        {
          name: '-i',
          hasArgument: false,
          description: 'Mode interactif (éditer la todo list)',
          isCommon: true,
        },
        {
          name: '--continue',
          hasArgument: false,
          description: 'Continuer après résolution de conflit',
          isCommon: true,
        },
        {
          name: '--abort',
          hasArgument: false,
          description: 'Annuler le rebase en cours',
          isCommon: true,
        },
        {
          name: '<base>',
          hasArgument: true,
          description: 'Branche ou commit de base',
          isCommon: true,
        },
      ],
      synopsis:
        'git rebase <base>\ngit rebase -i <base>\ngit rebase --continue\ngit rebase --abort',
      longDescription:
        'Rejoue les commits de la branche courante au-dessus de la base spécifiée, créant de nouveaux commits. ' +
        'Avec -i (interactif), permet de réordonner, fusionner (squash) ou supprimer des commits.',
      examples: ['git rebase main', 'git rebase -i HEAD~3', 'git rebase --abort'],
    },
  ],

  'Outils avancés': [
    {
      name: 'stash',
      description: 'Mettre de côté temporairement des changements',
      category: 'Outils avancés',
      flags: [
        {
          name: 'push',
          hasArgument: false,
          description: 'Empiler les changements courants (défaut)',
          isCommon: true,
        },
        {
          name: 'list',
          hasArgument: false,
          description: 'Lister les entrées du stash',
          isCommon: true,
        },
        {
          name: 'pop',
          hasArgument: false,
          description: 'Dépiler et appliquer la dernière entrée',
          isCommon: true,
        },
        {
          name: 'apply',
          hasArgument: false,
          description: 'Appliquer sans supprimer du stash',
          isCommon: false,
        },
        {
          name: 'drop',
          hasArgument: false,
          description: 'Supprimer une entrée du stash',
          isCommon: false,
        },
        {
          name: '<index>',
          hasArgument: true,
          description: "Index de l'entrée (ex: stash@{0})",
          isCommon: false,
        },
      ],
      synopsis:
        'git stash [push]\ngit stash list\ngit stash pop [<index>]\ngit stash apply [<index>]\ngit stash drop [<index>]',
      longDescription:
        'Sauvegarde les modifications non commitées (index + working tree) dans une pile temporaire. ' +
        'Permet de changer de contexte rapidement et de réappliquer les changements plus tard.',
      examples: ['git stash', 'git stash list', 'git stash pop'],
    },
    {
      name: 'reflog',
      description: "Afficher l'historique des mouvements de HEAD",
      category: 'Outils avancés',
      flags: [
        {
          name: 'show',
          hasArgument: false,
          description: 'Afficher le reflog (défaut)',
          isCommon: false,
        },
        {
          name: '[<ref>]',
          hasArgument: true,
          description: 'Ref à afficher (défaut : HEAD)',
          isCommon: false,
        },
      ],
      synopsis: 'git reflog [show] [<ref>]',
      longDescription:
        "Affiche l'historique de toutes les positions de HEAD, y compris après reset et rebase. " +
        'Permet de récupérer des commits "perdus" via HEAD@{n}.',
      examples: ['git reflog', 'git reflog show HEAD', 'git reset --hard HEAD@{2}'],
    },
  ],

  Distant: [
    {
      name: 'remote',
      description: 'Gérer les dépôts distants',
      category: 'Distant',
      flags: [
        {
          name: '-v',
          hasArgument: false,
          description: 'Afficher les URLs des remotes',
          isCommon: true,
        },
        { name: 'add', hasArgument: false, description: 'Ajouter un remote', isCommon: true },
        { name: 'remove', hasArgument: false, description: 'Supprimer un remote', isCommon: true },
        { name: 'rm', hasArgument: false, description: 'Alias de remove', isCommon: false },
        { name: '<name>', hasArgument: true, description: 'Nom du remote', isCommon: true },
        { name: '<url>', hasArgument: true, description: 'URL du remote', isCommon: true },
      ],
      synopsis: 'git remote\ngit remote -v\ngit remote add <name> <url>\ngit remote remove <name>',
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
        {
          name: '<source>',
          hasArgument: true,
          description: 'Nom du dépôt source à cloner',
          isCommon: true,
        },
      ],
      synopsis: 'git clone <source>',
      longDescription:
        'Crée un nouveau dépôt local en copiant un dépôt distant prédéfini. ' +
        'Initialise le dépôt, copie tous les objets, pose les refs de suivi et checkout la branche par défaut.',
      examples: ['git clone public-repo', 'git clone collab-repo'],
    },
    {
      name: 'fetch',
      description: "Télécharger les commits d'un dépôt distant",
      category: 'Distant',
      flags: [
        {
          name: '<remote>',
          hasArgument: true,
          description: 'Nom du remote (défaut : origin)',
          isCommon: true,
        },
        {
          name: '<branch>',
          hasArgument: true,
          description: 'Branche spécifique à récupérer (optionnel)',
          isCommon: false,
        },
      ],
      synopsis: 'git fetch [<remote>] [<branch>]',
      longDescription:
        "Récupère les nouveaux commits d'un dépôt distant et met à jour les références de suivi. " +
        "Ne modifie jamais les branches locales, HEAD, l'index ou le working tree.",
      examples: ['git fetch', 'git fetch origin', 'git fetch origin main'],
    },
    {
      name: 'push',
      description: 'Envoyer les commits locaux vers un dépôt distant',
      category: 'Distant',
      flags: [
        {
          name: '<remote>',
          hasArgument: true,
          description: 'Nom du remote (défaut : upstream)',
          isCommon: true,
        },
        {
          name: '<branch>',
          hasArgument: true,
          description: 'Branche locale à pousser (défaut : branche courante)',
          isCommon: true,
        },
        {
          name: '-u',
          hasArgument: false,
          description: "Configurer l'upstream après le push",
          isCommon: true,
        },
        { name: '--set-upstream', hasArgument: false, description: 'Alias de -u', isCommon: false },
        {
          name: '--force',
          hasArgument: false,
          description: 'Forcer même si non-fast-forward',
          isCommon: false,
        },
        { name: '-f', hasArgument: false, description: 'Alias de --force', isCommon: false },
      ],
      synopsis: 'git push [<remote>] [<branch>] [-u] [--force]',
      longDescription:
        'Envoie les commits locaux vers le dépôt distant. ' +
        'Par défaut, protège contre les push non-fast-forward (utiliser --force pour contourner). ' +
        "Avec -u, configure l'upstream de la branche locale.",
      examples: [
        'git push',
        'git push origin main',
        'git push -u origin feature',
        'git push --force origin main',
      ],
    },
    {
      name: 'pull',
      description: "Récupérer et intégrer les commits d'un dépôt distant",
      category: 'Distant',
      flags: [
        {
          name: '<remote>',
          hasArgument: true,
          description: 'Nom du remote (défaut : upstream)',
          isCommon: true,
        },
        {
          name: '<branch>',
          hasArgument: true,
          description: 'Branche distante à intégrer',
          isCommon: true,
        },
        {
          name: '--rebase',
          hasArgument: false,
          description: 'Utiliser rebase au lieu de merge',
          isCommon: true,
        },
        {
          name: '--no-rebase',
          hasArgument: false,
          description: 'Forcer le merge (annule --rebase)',
          isCommon: false,
        },
      ],
      synopsis: 'git pull [<remote>] [<branch>] [--rebase]',
      longDescription:
        'Équivalent à git fetch suivi de git merge (ou git rebase avec --rebase). ' +
        "Sans argument, utilise l'upstream de la branche courante. " +
        'Gère les conflits identiquement à merge/rebase.',
      examples: ['git pull', 'git pull origin main', 'git pull --rebase'],
    },
    {
      name: 'rev-parse',
      description: 'Résoudre une révision en hash complet',
      category: 'Distant',
      flags: [
        {
          name: '<revision>',
          hasArgument: true,
          description: 'Révision à résoudre (ref, @{u}, etc.)',
          isCommon: true,
        },
      ],
      synopsis: 'git rev-parse <revision>',
      longDescription:
        'Résout une révision (branche, tag, hash court, @{upstream}, @{u}, etc.) en hash complet de 40 caractères. ' +
        'Utile pour inspecter les refs de suivi et les révisions avancées.',
      examples: ['git rev-parse HEAD', 'git rev-parse @{u}', 'git rev-parse feature@{upstream}'],
    },
  ],

  Aide: [
    {
      name: 'help',
      description: "Afficher l'aide des commandes disponibles",
      category: 'Aide',
      flags: [
        {
          name: '[<commande>]',
          hasArgument: true,
          description: "Commande dont afficher l'aide détaillée",
          isCommon: true,
        },
      ],
      synopsis: 'git help [<commande>]',
      longDescription:
        'Sans argument, affiche la liste de toutes les commandes disponibles, groupées par catégorie. ' +
        "Avec un nom de commande, affiche l'aide détaillée (synopsis, options, exemples).",
      examples: ['git help', 'git help commit', 'git help merge'],
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
