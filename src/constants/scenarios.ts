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
