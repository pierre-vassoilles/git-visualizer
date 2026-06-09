/**
 * Scénarios pédagogiques préchargés.
 *
 * Chaque scénario est une séquence de commandes déterministe.
 * Toutes les commandes git portent le préfixe "git " ;
 * les utilitaires "write" et "read" n'ont pas de préfixe.
 *
 * Règle : le scénario "Conflit de Merge" contient une étape de merge
 * conflictuelle (exitCode != 0) suivie de commandes de résolution —
 * executeScenario rejoue toute la séquence sans s'arrêter sur cette erreur.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Scenario {
  /** Identifiant unique (ex: "branch-merge"). */
  id: string;
  /** Titre lisible (affiché dans l'UI). */
  title: string;
  /** Description courte (1 phrase). */
  description: string;
  /** Catégorie (ex: "Branches", "Fusion", "Réécriture", "Réparation"). */
  category: string;
  /** Difficulté : 1 = facile, 2 = moyen, 3 = difficile. */
  difficulty: 1 | 2 | 3;
  /** Séquence de commandes à exécuter dans l'ordre. */
  commands: string[];
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const SCENARIOS: Scenario[] = [
  // -------------------------------------------------------------------
  // Scénario 1 : Branche & Merge simple (fast-forward)
  // -------------------------------------------------------------------
  {
    id: 'branch-merge',
    title: 'Branche & Merge Simple',
    description: 'Créer une branche, ajouter des commits, fusionner sur main (fast-forward).',
    category: 'Branches',
    difficulty: 1,
    commands: [
      'git init',
      'write main.txt "Contenu initial"',
      'git add main.txt',
      'git commit -m "C1: commit initial sur main"',
      'git branch feature',
      'git checkout feature',
      'write feature.txt "Nouvelle fonctionnalité"',
      'git add feature.txt',
      'git commit -m "C2: ajout de la fonctionnalité"',
      'git checkout main',
      'git merge feature',
    ],
  },

  // -------------------------------------------------------------------
  // Scénario 2 : Merge --no-ff (commit de fusion explicite)
  // -------------------------------------------------------------------
  {
    id: 'merge-no-ff',
    title: 'Merge --no-ff',
    description: 'Forcer la création d\'un commit de merge même en fast-forward.',
    category: 'Fusion',
    difficulty: 1,
    commands: [
      'git init',
      'write main.txt "Base"',
      'git add main.txt',
      'git commit -m "C1: main"',
      'git branch hotfix',
      'git checkout hotfix',
      'write hotfix.txt "Correctif urgent"',
      'git add hotfix.txt',
      'git commit -m "C2: correctif"',
      'git checkout main',
      'git merge --no-ff hotfix -m "Merge branch hotfix"',
    ],
  },

  // -------------------------------------------------------------------
  // Scénario 3 : Conflit de Merge & Résolution
  // -------------------------------------------------------------------
  {
    id: 'merge-conflict',
    title: 'Conflit de Merge & Résolution',
    description: 'Modifier le même fichier sur deux branches, créer un conflit, le résoudre.',
    category: 'Fusion',
    difficulty: 2,
    commands: [
      'git init',
      'write data.txt "ligne1"',
      'git add data.txt',
      'git commit -m "C1: données initiales"',
      'git branch feature',
      'git checkout feature',
      'write data.txt "ligne1\nmodification feature"',
      'git add data.txt',
      'git commit -m "C2: feature modifie data"',
      'git checkout main',
      'write data.txt "ligne1\nmodification main"',
      'git add data.txt',
      'git commit -m "C3: main modifie data"',
      // Cette commande génère un conflit (exitCode != 0) — rejeu continue
      'git merge feature -m "Merge feature (conflit)"',
      // Résolution du conflit
      'write data.txt "ligne1\nles deux modifications fusionnées"',
      'git add data.txt',
      'git commit -m "C4: résolution du conflit"',
    ],
  },

  // -------------------------------------------------------------------
  // Scénario 4 : Cherry-pick & Tag
  // -------------------------------------------------------------------
  {
    id: 'cherry-pick-tag',
    title: 'Cherry-pick & Tagging',
    description: 'Appliquer un commit spécifique sur une autre branche et créer un tag de release.',
    category: 'Réécriture',
    difficulty: 2,
    commands: [
      'git init',
      'write main.txt "Code principal"',
      'git add main.txt',
      'git commit -m "C1: commit initial sur main"',
      'git branch feature',
      'git checkout feature',
      'write feature.txt "Fonctionnalité importante"',
      'git add feature.txt',
      'git commit -m "C2: fonctionnalité importante"',
      'write extra.txt "Code supplémentaire"',
      'git add extra.txt',
      'git commit -m "C3: code supplémentaire"',
      'git checkout main',
      // Cherry-pick du commit C2 (feature~1 = avant-dernier commit de feature)
      'git cherry-pick feature~1',
      'git tag v1.0',
      'git checkout feature',
      'git tag feature-tip',
    ],
  },

  // -------------------------------------------------------------------
  // Scénario 5 : Reset & Undo via Reflog
  // -------------------------------------------------------------------
  {
    id: 'reset-undo',
    title: 'Reset & Undo via Reflog',
    description: 'Réinitialiser accidentellement un commit, puis le restaurer grâce au reflog.',
    category: 'Réparation',
    difficulty: 2,
    commands: [
      'git init',
      'write f1.txt "Premier fichier"',
      'git add f1.txt',
      'git commit -m "C1: bon état"',
      'write f2.txt "Deuxième fichier"',
      'git add f2.txt',
      'git commit -m "C2: encore bon"',
      // Reset accidentel : on "perd" C2
      'git reset --hard HEAD~1',
      // Récupération via reflog : HEAD@{1} pointe sur C2
      'git reset --hard HEAD@{1}',
    ],
  },

  // -------------------------------------------------------------------
  // Scénario 6 : Git Flow (main / dev / staging + branches de feature)
  // -------------------------------------------------------------------
  {
    id: 'git-flow',
    title: 'Git Flow (main / dev / staging)',
    description:
      'Arbre Git Flow complet : développement sur dev via branches de feature, recette sur staging, release taguée sur main, puis back-merge sur dev.',
    category: 'Git Flow',
    difficulty: 3,
    commands: [
      'git init',
      'write README.md "# Projet"',
      'git add README.md',
      'git commit -m "C1: init du dépôt (main)"',
      // Branche d'intégration dev
      'git checkout -b dev',
      'write app.js "app v1"',
      'git add app.js',
      'git commit -m "C2: socle applicatif (dev)"',
      // Feature 1 : login
      'git checkout -b feature/login',
      'write login.js "login()"',
      'git add login.js',
      'git commit -m "C3: écran de login (feature/login)"',
      'write login.js "login() + validate()"',
      'git add login.js',
      'git commit -m "C4: validation du login"',
      'git checkout dev',
      'git merge --no-ff feature/login -m "Merge feature/login dans dev"',
      // Feature 2 : dashboard
      'git checkout -b feature/dashboard',
      'write dashboard.js "dashboard()"',
      'git add dashboard.js',
      'git commit -m "C5: tableau de bord (feature/dashboard)"',
      'git checkout dev',
      'git merge --no-ff feature/dashboard -m "Merge feature/dashboard dans dev"',
      // Recette sur staging
      'git checkout -b staging',
      'write CHANGELOG.md "v1.0.0-rc"',
      'git add CHANGELOG.md',
      'git commit -m "C6: préparation de la release (staging)"',
      // Release sur main + tag
      'git checkout main',
      'git merge --no-ff staging -m "Release v1.0.0"',
      'git tag v1.0.0',
      // Back-merge de main vers dev, puis nouvelle itération
      'git checkout dev',
      'git merge --no-ff main -m "Back-merge main dans dev (post-release)"',
      'write app.js "app v1 + iteration 2"',
      'git add app.js',
      'git commit -m "C7: début de l\'itération 2 (dev)"',
    ],
  },

  // -------------------------------------------------------------------
  // Scénario 7 : Plusieurs branches divergentes (fan-out)
  // -------------------------------------------------------------------
  {
    id: 'multi-branch',
    title: 'Branches divergentes multiples',
    description:
      'Quatre branches issues d\'un même commit, à des états différents (1 à 3 commits chacune), sans fusion : illustre les lanes et couleurs du graphe.',
    category: 'Branches',
    difficulty: 2,
    commands: [
      'git init',
      'write base.txt "base commune"',
      'git add base.txt',
      'git commit -m "C1: base commune"',
      // feature-a : 3 commits
      'git checkout -b feature-a',
      'write a.txt "a1"',
      'git add a.txt',
      'git commit -m "A1: feature-a"',
      'write a.txt "a1 a2"',
      'git add a.txt',
      'git commit -m "A2: feature-a"',
      'write a.txt "a1 a2 a3"',
      'git add a.txt',
      'git commit -m "A3: feature-a"',
      // feature-b : 2 commits (depuis C1)
      'git checkout main',
      'git checkout -b feature-b',
      'write b.txt "b1"',
      'git add b.txt',
      'git commit -m "B1: feature-b"',
      'write b.txt "b1 b2"',
      'git add b.txt',
      'git commit -m "B2: feature-b"',
      // feature-c : 1 commit (depuis C1)
      'git checkout main',
      'git checkout -b feature-c',
      'write c.txt "c1"',
      'git add c.txt',
      'git commit -m "C-1: feature-c"',
      // main progresse de son côté
      'git checkout main',
      'write base.txt "base commune + main"',
      'git add base.txt',
      'git commit -m "C2: main progresse"',
    ],
  },

  // -------------------------------------------------------------------
  // Scénario 8 : Rebase d'une feature sur une branche dev mise à jour
  // -------------------------------------------------------------------
  {
    id: 'feature-rebase',
    title: 'Rebase d\'une feature sur dev',
    description:
      'Une feature est rebasée sur dev qui a avancé entre-temps (réécriture des hashes), puis fusionnée en fast-forward et taguée.',
    category: 'Réécriture',
    difficulty: 3,
    commands: [
      'git init',
      'write core.txt "noyau"',
      'git add core.txt',
      'git commit -m "C1: noyau (main)"',
      'git checkout -b dev',
      'write service.js "service v0"',
      'git add service.js',
      'git commit -m "C2: service (dev)"',
      // Démarrage de la feature
      'git checkout -b feature',
      'write feature.js "feature A"',
      'git add feature.js',
      'git commit -m "F1: feature partie 1"',
      'write feature.js "feature A + B"',
      'git add feature.js',
      'git commit -m "F2: feature partie 2"',
      // dev avance en parallèle (fichier différent → pas de conflit)
      'git checkout dev',
      'write service.js "service v0 + v1"',
      'git add service.js',
      'git commit -m "C3: dev avance pendant la feature"',
      // Rebase de la feature sur dev → nouveaux hashes pour F1/F2
      'git checkout feature',
      'git rebase dev',
      // Intégration en fast-forward + tag
      'git checkout dev',
      'git merge feature',
      'git tag v2.0',
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Retourne un scénario par son identifiant, ou null s'il est introuvable.
 */
export function getScenarioById(id: string): Scenario | null {
  return SCENARIOS.find(s => s.id === id) ?? null;
}

/**
 * Retourne tous les scénarios (dans l'ordre de définition).
 */
export function getAllScenarios(): Scenario[] {
  return SCENARIOS;
}

/**
 * Retourne les scénarios filtrés par catégorie.
 */
export function getScenariosByCategory(category: string): Scenario[] {
  return SCENARIOS.filter(s => s.category === category);
}
