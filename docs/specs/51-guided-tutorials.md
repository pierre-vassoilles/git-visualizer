# Phase 7 : Tutoriels guidés pas-à-pas

## Résumé

Au-dessus des **scénarios prédéfinis** (Phase 6), un **système de tutoriels interactifs** guide l'utilisateur à travers une progression d'étapes. Chaque étape a :
- Un **énoncé** explicatif (ce qu'il faut apprendre)
- Des **objectifs** (état du snapshot attendu)
- Un **indice optionnel** (suggestion sans donner la solution)
- Une **validation automatique** (prédicat pur sur le snapshot, pas de logique Git dans l'UI)
- Un **message de réussite**

Progression linéaire : « Suivant » débloqué quand l'objectif est atteint. Optionnel : « Revenir » pour refaire une étape, « Passer » pour skip (avec penalty).

**Cas d'usage** :
- Utilisateur novice : parcours "Premier commit"
- Parcours "Branching" : créer branche, modifier, fusionner
- Parcours "Undo" : reset, reflog, recovery
- Chaque parcours accumule les concepts (30-45 min pour un parcours complet)

**Différence avec scénarios** :
- Scénario = "voici l'état final" (chargé d'un coup, aucune guidance)
- Tutoriel = "fais ça étape par étape, je valide au fur et à mesure"

## Architecture

### Frontière core ↔ UI

**Core (`src/core/`)**

Structures pures dans `src/core/model.ts` :

```typescript
export interface TutorialStep {
  /** ID unique (ex: "commit-01") */
  id: string;
  /** Titre court de l'étape (ex: "Créer votre premier commit") */
  title: string;
  /** Énoncé : explique ce qu'il faut faire (markdown optionnel) */
  description: string;
  /** Optionnel : indice textuel pour aider l'utilisateur */
  hint?: string;
  /** Objectifs : prédicats sur le snapshot à vérifier */
  objectives: StepObjective[];
  /** Message affiché quand l'étape est réussie */
  successMessage: string;
}

export interface StepObjective {
  /** Description courte du critère (ex: "1 commit créé") */
  description: string;
  /** Prédicat pur : (snapshot) => boolean */
  validate: (snapshot: RepoSnapshot) => boolean;
}

export interface Tutorial {
  /** ID unique (ex: "first-commit") */
  id: string;
  /** Titre (ex: "Premier Commit") */
  title: string;
  /** Description (ex: "Apprenez à créer votre premier commit") */
  description: string;
  /** Durée estimée en minutes */
  duration: number;
  /** Difficulté : 1 (très facile) à 3 (difficile) */
  difficulty: 1 | 2 | 3;
  /** Étapes ordonnées */
  steps: TutorialStep[];
  /** Commandes suggérées (optionnel, pour autocomplete) */
  suggestedCommands?: string[];
}
```

Catalogue de tutoriels dans `src/constants/tutorials.ts` :

```typescript
export const TUTORIALS: Tutorial[] = [ ... ];
export function getTutorialById(id: string): Tutorial | null { ... }
export function getAllTutorials(): Tutorial[] { ... }
```

**Helpers de validation** dans `src/core/validation.ts` (ou `tutorial-helpers.ts`) :

Fonctions pures utilitaires pour les prédicats courants :

```typescript
export function hasCommits(n: number): (snap: RepoSnapshot) => boolean {
  return (snap) => snap.commits.length >= n;
}

export function hasBranch(name: string): (snap: RepoSnapshot) => boolean {
  return (snap) => snap.branches.includes(name);
}

export function headPointsTo(ref: string): (snap: RepoSnapshot) => boolean {
  return (snap) => snap.head.symbolic && snap.head.target === `refs/heads/${ref}`;
}

export function hasTag(name: string): (snap: RepoSnapshot) => boolean {
  return (snap) => !!snap.tags?.[name];
}

export function fileExists(path: string): (snap: RepoSnapshot) => boolean {
  return (snap) => {
    const currentCommit = snap.commits[snap.commits.length - 1];
    if (!currentCommit) return false;
    // Vérifier si le fichier est présent dans l'arbre (headless)
    // Implémentation : parcourir snapshot.tree ou ajouter un helper dans le moteur
  };
}

export function fileModified(path: string): (snap: RepoSnapshot) => boolean {
  return (snap) => {
    // Vérifier si le fichier est marqué modifié dans le status
    const status = computeStatus(snap);
    return status.modified.includes(path) || status.staged.includes(path);
  };
}

export function noOperationInProgress(): (snap: RepoSnapshot) => boolean {
  return (snap) => !snap.operationState;
}

export function isHeadDetached(): (snap: RepoSnapshot) => boolean {
  return (snap) => !snap.head.symbolic;
}
```

**UI (`src/components/`)**

Composant **`GuidedTutorialModal.vue`** :
- Affiche quand utilisateur clique « Commencer » sur un tutoriel
- Affiche étape courante : titre, description, indice (optionnel)
- Objectifs affichés comme checklist (auto-validée)
- Boutons : « Indice », « Suivant » (débloqué si tous les objectifs ✓), « Revenir » (optionnel), « Passer » (optionnel avec penalty), « Quitter »
- **Polling** ou **event** pour vérifier validation automatiquement après chaque commande

### Snapshot de progression (store)

```typescript
// Dans stores/repo.ts
interface TutorialProgress {
  tutorialId: string;
  currentStepIndex: number; // 0-based
  completedSteps: Set<string>; // IDs des étapes réussies
  hintUsed: boolean; // Flag pour l'étape courante
  skipped: boolean; // Flag si utilisateur a passé
}

export interface RepoStore {
  // ... existant
  tutorialProgress?: TutorialProgress;
  startTutorial(tutorialId: string): void;
  validateStep(stepId: string): { passed: boolean; message: string };
  nextStep(): void;
  previousStep(): void;
  skipStep(): void;
  quitTutorial(): void;
}
```

### Validation (key design)

**Impératif** : tout prédicat doit être pur (pas de mutation de l'engine) et déterministe.

Après chaque `store.execute(cmd)` :
1. Snapshot mis à jour
2. `validateStep(currentStep.id)` appelé automatiquement
3. Si `objectives.every(obj => obj.validate(snapshot))` → succès
4. Bouton « Suivant » débloqué, message affiché
5. Utilisateur clique « Suivant » → passe à l'étape suivante

**Pour les fichiers** : ajouter un helper optionnel `readFile(path)` au moteur pour que les prédicats qui vérifient le contenu puissent y accéder.

## Tutoriels d'exemple

### Tutoriel 1 : Premier Commit (facile)

```typescript
{
  id: "first-commit",
  title: "Premier Commit",
  description: "Apprenez à créer votre premier commit avec Git",
  duration: 10,
  difficulty: 1,
  steps: [
    {
      id: "init",
      title: "Initialiser le dépôt",
      description: "Commencez par initialiser un nouveau dépôt Git vierge avec la commande `git init`.",
      hint: "Tapez exactement : git init",
      objectives: [
        {
          description: "Dépôt initialisé",
          validate: (snap) => snap.branches.includes("main")
        }
      ],
      successMessage: "Excellent ! Votre dépôt est prêt."
    },
    {
      id: "create-file",
      title: "Créer un fichier",
      description: "Créez un fichier README.md avec du contenu. Utilisez la commande `write README.md \"...\"` pour l'écrire.",
      hint: "Essayez : write README.md \"# My Project\"",
      objectives: [
        {
          description: "Fichier README.md créé",
          validate: (snap) => fileExists("README.md")(snap)
        }
      ],
      successMessage: "Fichier créé ! Maintenant il faut le stage."
    },
    {
      id: "stage-file",
      title: "Stager le fichier",
      description: "Mettez le fichier en staging avec `git add`. Cela prépare le fichier pour le commit.",
      hint: "Commande : git add README.md",
      objectives: [
        {
          description: "README.md stagé",
          validate: (snap) => {
            const status = computeStatus(snap);
            return status.staged.includes("README.md");
          }
        }
      ],
      successMessage: "Fichier stagé ! Maintenant committer-le."
    },
    {
      id: "commit",
      title: "Créer le commit",
      description: "Créez un commit avec la commande `git commit -m \"message\"`. Ce message décrit ce que vous avez fait.",
      hint: "Essayez : git commit -m \"Add README\"",
      objectives: [
        {
          description: "1 commit créé",
          validate: (snap) => snap.commits.length === 1
        },
        {
          description: "Index propre (rien à committer)",
          validate: (snap) => {
            const status = computeStatus(snap);
            return status.staged.length === 0;
          }
        }
      ],
      successMessage: "Bravo ! Vous avez créé votre premier commit !"
    }
  ],
  suggestedCommands: ["init", "write README.md", "add README.md", "commit -m"]
}
```

### Tutoriel 2 : Branching & Fusion (moyen)

```typescript
{
  id: "branching",
  title: "Créer et Fusionner une Branche",
  description: "Apprenez à créer une branche, y committer, et la fusionner à main",
  duration: 20,
  difficulty: 2,
  steps: [
    {
      id: "setup",
      title: "Préparer le dépôt",
      description: "Initialisez le dépôt et créez un commit initial sur main.",
      hint: "Commandes : git init, write file.txt \"content\", git add file.txt, git commit -m \"Initial\"",
      objectives: [
        {
          description: "Dépôt initialisé avec 1 commit",
          validate: (snap) => snap.commits.length === 1 && snap.branches.includes("main")
        }
      ],
      successMessage: "Setup terminé !"
    },
    {
      id: "create-branch",
      title: "Créer une branche",
      description: "Créez une branche nommée `feature` avec `git branch feature`.",
      hint: "Commande : git branch feature",
      objectives: [
        {
          description: "Branche 'feature' créée",
          validate: (snap) => snap.branches.includes("feature")
        }
      ],
      successMessage: "Branche créée !"
    },
    {
      id: "switch-branch",
      title: "Basculer sur la branche",
      description: "Basculez sur `feature` avec `git checkout feature`.",
      hint: "Commande : git checkout feature",
      objectives: [
        {
          description: "HEAD pointe sur 'feature'",
          validate: (snap) => snap.head.symbolic && snap.head.target === "refs/heads/feature"
        }
      ],
      successMessage: "Vous êtes sur la branche feature !"
    },
    {
      id: "commit-on-branch",
      title: "Committer sur la branche",
      description: "Créez un commit sur cette branche (modifiez un fichier et committer).",
      hint: "Commandes : write file.txt \"new content\", git add file.txt, git commit -m \"Feature work\"",
      objectives: [
        {
          description: "2 commits total",
          validate: (snap) => snap.commits.length === 2
        },
        {
          description: "Feature branch en avance",
          validate: (snap) => {
            const featureCommit = snap.commits[snap.commits.length - 1];
            return featureCommit.branches.includes("feature");
          }
        }
      ],
      successMessage: "Vous avez des changements sur la branche !"
    },
    {
      id: "switch-main",
      title: "Retourner sur main",
      description: "Basculez sur `main` avec `git checkout main`.",
      hint: "Commande : git checkout main",
      objectives: [
        {
          description: "HEAD sur main",
          validate: (snap) => snap.head.symbolic && snap.head.target === "refs/heads/main"
        }
      ],
      successMessage: "De retour sur main !"
    },
    {
      id: "merge",
      title: "Fusionner la branche",
      description: "Fusionnez `feature` dans `main` avec `git merge feature`.",
      hint: "Commande : git merge feature",
      objectives: [
        {
          description: "Feature fusionnée (fast-forward ou merge commit)",
          validate: (snap) => {
            // Vérifier qu'il n'y a pas d'opération en cours et que main est en avance
            return !snap.operationState && snap.commits.length >= 2;
          }
        },
        {
          description: "Pas de conflit",
          validate: (snap) => !snap.operationState
        }
      ],
      successMessage: "Fusion réussie ! Feature est intégrée dans main."
    }
  ],
  suggestedCommands: ["init", "branch", "checkout", "write", "add", "commit", "merge"]
}
```

### Tutoriel 3 : Annuler avec Reset & Reflog (moyen)

```typescript
{
  id: "undo-reset",
  title: "Annuler avec Reset & Reflog",
  description: "Apprenez à annuler accidentellement avec reset, puis à restaurer",
  duration: 15,
  difficulty: 2,
  steps: [
    {
      id: "setup",
      title: "Setup : créer des commits",
      description: "Créez un dépôt avec 3 commits.",
      hint: "Commandes : git init, write f1.txt ..., git add f1.txt, git commit -m ..., write f2.txt ..., git add f2.txt, git commit -m ..., write f3.txt ..., git add f3.txt, git commit -m ...",
      objectives: [
        {
          description: "3 commits créés",
          validate: (snap) => snap.commits.length === 3
        }
      ],
      successMessage: "Dépôt setup !"
    },
    {
      id: "bad-reset",
      title: "Oups ! Reset accidentel",
      description: "Vous avez accidentellement exécuté `git reset --hard HEAD~1`. Simulez cela.",
      hint: "Commande : git reset --hard HEAD~1",
      objectives: [
        {
          description: "HEAD déplacé (2 commits visibles)",
          validate: (snap) => snap.commits.length === 2
        }
      ],
      successMessage: "Oh non ! Vous avez « perdu » le dernier commit. Mais ne vous inquiétez pas, il est dans le reflog."
    },
    {
      id: "check-reflog",
      title: "Vérifier le reflog",
      description: "Regardez l'historique avec `git reflog`. Vous devriez voir l'état avant le reset.",
      hint: "Commande : git reflog",
      objectives: [
        {
          description: "Reflog affiche l'historique",
          validate: (snap) => {
            // Vérifier que le moteur expose reflog (optionnel en Phase 7)
            return true; // Placeholder
          }
        }
      ],
      successMessage: "Vous voyez qu'il y a un entrée HEAD@{1} avec l'ancien commit !"
    },
    {
      id: "recover",
      title: "Restaurer via reflog",
      description: "Utilisez `git reset --hard HEAD@{1}` pour restaurer l'état précédent.",
      hint: "Commande : git reset --hard HEAD@{1}",
      objectives: [
        {
          description: "3 commits restaurés",
          validate: (snap) => snap.commits.length === 3
        }
      ],
      successMessage: "Succès ! Vous avez récupéré le commit « perdu » grâce au reflog !"
    }
  ]
}
```

## Flux d'utilisation

### Démarrage d'un tutoriel

**Dans la RefsSidebar ou un panel dédié** :

```
Tutoriels guidés

[Facile] Premier Commit (10 min)
         Apprenez à créer votre premier commit

[Moyen] Branching & Fusion (20 min)
        Créer et fusionner une branche

[Moyen] Undo avec Reset (15 min)
        Annuler accidentellement et récupérer
```

Utilisateur clique « Premier Commit » :
1. Reset du dépôt (new engine instance)
2. Modale `GuidedTutorialModal` affichée
3. Affiche étape 1 : titre, description, objectifs, indice (caché)

### Progression dans l'étape

**Utilisateur tape commande** dans le terminal :
- Snapshot mis à jour
- UI détecte validation automatiquement
- Pour chaque objective : `validate(snapshot)` appelé
- Affiche ✓ ou ✗ dynamiquement
- Quand tous les objectifs ✓ : message de réussite, bouton « Suivant » se déverrouille

### Navigation

**Boutons disponibles** :
- « Indice » : affiche le `hint`
- « Suivant » : passe à l'étape suivante (désactivé si objectifs non atteints)
- « Revenir » (optionnel) : retour à l'étape précédente (recharge l'état pré-étape)
- « Passer » (optionnel) : skip l'étape (avec message « étape sautée »)
- « Quitter » : abandonne le tutoriel, retour au dépôt

### Fin du tutoriel

Après la dernière étape :
```
Tutoriel complété !
Vous avez appris :
  ✓ Initialiser un dépôt
  ✓ Créer des commits
  ✓ Gérer les branches
  ✓ Fusionner

Temps : 10 min 42 sec
Indices utilisés : 1/4

[Recommencer] [Voir d'autres tutoriels] [Fermer]
```

## Modèle de données

### Tutorial & TutorialStep (core)

```typescript
// src/core/model.ts

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  hint?: string;
  objectives: StepObjective[];
  successMessage: string;
}

export interface StepObjective {
  description: string;
  validate: (snapshot: RepoSnapshot) => boolean;
}

export interface Tutorial {
  id: string;
  title: string;
  description: string;
  duration: number;
  difficulty: 1 | 2 | 3;
  steps: TutorialStep[];
  suggestedCommands?: string[];
}
```

### TutorialProgress (store)

```typescript
// src/stores/repo.ts

interface TutorialProgress {
  tutorialId: string;
  currentStepIndex: number;
  completedSteps: string[]; // IDs
  hintUsed: boolean;
  startedAt: number; // timestamp
}

export interface RepoStore {
  // ... existant
  tutorialProgress?: TutorialProgress;
  startTutorial(tutorialId: string): void;
  skipStep(): void;
  quitTutorial(): void;
}
```

## Cas d'erreur

### Validateur retourne undefined/erreur

**Condition** : Prédicat `validate(snap)` lance une exception

**Comportement** : Ignorer l'erreur (log en console), traiter comme `false` (objectif non atteint)

### Tutoriel non trouvé

**Condition** : `startTutorial("nosuchid")`

**Comportement** : Afficher message d'erreur « Tutoriel non trouvé »

### Snapshot corrompu pendant le tutoriel

**Condition** : Utilisateur exécute une commande qui met l'engine en état incohérent

**Comportement** : Les validateurs passent simplement (`false` si la snapshot est corrompue et le prédicat plante). Pas de différentiel par rapport au fonctionnement normal.

### Utilisateur exécute des commandes non suggérées

**Condition** : Tutoriel suggère `git add`, utilisateur tapées `git reset --hard`

**Comportement** : Les validateurs s'exécutent quand même. Si les objectifs sont atteint par le chemin « bizarroïde », l'étape passe. Optionnel : afficher un warning « Vous avez emprunté un chemin inusuel ».

## Critères d'acceptation

### CA-tutorials-01 : Catalogue de tutoriels

**Given**
- L'app est chargée

**When**
- Accédez à `getAllTutorials()`

**Then**
- Retourne au moins 3 tutoriels
- Chacun a `id`, `title`, `description`, `duration`, `difficulty`, `steps`
- Étapes contiennent `objectives` avec validateurs

### CA-tutorials-02 : Démarrer un tutoriel

**Given**
- Utilisateur clique sur « Premier Commit »

**When**
- `store.startTutorial("first-commit")`

**Then**
- Dépôt réinitialisé (moteur neuf)
- `GuidedTutorialModal` affichée
- Étape 1 affichée (titre, description)
- Objectifs listées (non cochées)

### CA-tutorials-03 : Validation d'étape simple

**Given**
- Étape : "Initialiser le dépôt"
- Objectif : `hasCommit(0)`

**When**
- Utilisateur exécute `git init`

**Then**
- Snapshot mis à jour
- Objectif auto-validée (✓)
- Bouton « Suivant » se déverrouille

### CA-tutorials-04 : Validation multi-objectifs

**Given**
- Étape avec 2 objectifs : "1 commit", "index propre"

**When**
- Utilisateur exécute `commit` avec un fichier stagé

**Then**
- Les 2 objectifs se valident (✓)
- Message de réussite affiché
- « Suivant » accessible

### CA-tutorials-05 : Objectif non atteint reste ✗

**Given**
- Étape : "Créer fichier README.md"

**When**
- Utilisateur tape `git init` (ne crée pas le fichier)

**Then**
- Objectif « fichier créé » reste ✗
- Bouton « Suivant » désactivé
- Aucun message de réussite

### CA-tutorials-06 : Affichage indice

**Given**
- Étape avec `hint: "Essayez : git init"`

**When**
- Utilisateur clique « Indice »

**Then**
- Indice affiché dans la modale
- Flag `hintUsed` marqué `true`

### CA-tutorials-07 : Navigation Suivant/Revenir

**Given**
- Étape 1 réussie, utilisateur clique « Suivant »

**When**
- Modale affiche étape 2

**Then**
- Étape 1 marquée complétée
- Étape 2 affichée (nouvel énoncé)
- Bouton « Revenir » (si implémenté) retourne à étape 1

### CA-tutorials-08 : Quitter tutoriel

**Given**
- Utilisateur dans tutoriel, étape 2/4

**When**
- Clique « Quitter »

**Then**
- Modale fermée
- Dépôt reste en état courant (pas de reset)
- `store.tutorialProgress` effacé

### CA-tutorials-09 : Fin du tutoriel

**Given**
- Utilisateur termine la dernière étape

**When**
- Validation de la dernière étape

**Then**
- Message « Tutoriel complété ! »
- Affiche récap (temps, indices utilisés)
- Boutons « Recommencer », « Voir d'autres tutoriels »

### CA-tutorials-10 : Déterminisme des prédicats

**Given**
- Deux exécutions du tutoriel "Premier Commit" avec les mêmes commandes

**When**
- Comparez les snapshots à chaque étape

**Then**
- Identiques (pas de Date.now(), pas de hasard)
- Prédicats retournent toujours le même résultat

### CA-tutorials-11 : Passer une étape (optionnel)

**Given**
- Utilisateur clique « Passer » sur étape 1

**When**
- Modale affiche étape 2

**Then**
- Étape 1 marquée « sautée »
- Message « Vous avez sauté cette étape »
- Récap final mentionne les étapes sautées

### CA-tutorials-12 : Prédicat complexe

**Given**
- Étape avec prédicat : « 2 branches créées ET HEAD sur main »

**When**
- Utilisateur crée 2 branches mais reste sur feature

**Then**
- Objectif « HEAD sur main » échoue (✗)
- Objectif « 2 branches créées » passe (✓)
- Bouton « Suivant » désactivé

### CA-tutorials-13 : Aucun dépôt avant tutoriel

**Given**
- Utilisateur démarre tutoriel sans avoir exécuté `git init`

**When**
- Tutoriel commence

**Then**
- Dépôt réinitialisé (propre)
- Première étape peut demander `git init`

### CA-tutorials-14 : Contenu tutoriel en données pures

**Given**
- `TUTORIALS` dans `src/constants/tutorials.ts`

**When**
- Inspectez la structure

**Then**
- Aucune dépendance Vue
- Aucun import de composants
- Prédicats sont des fonctions pures (testables isolement)

### CA-tutorials-15 : Affichage progressif (optionnel)

**Given**
- Modale affiche étape courante

**When**
- Utilisateur scrolle ou inspect

**Then**
- Étape suivante peut être prévisionnée (optionnel)
- Ou modale reste sur l'étape courante seule

## Implémentation : Points clés

1. **Données pures** : `TUTORIALS` dans `src/constants/` (pas de logique côté UI)
2. **Prédicats simples** : helpers réutilisables (`hasCommits`, `hasBranch`, `headPointsTo`, etc.)
3. **Validation automatique** : après chaque `store.execute()`, vérifier les prédicats
4. **Pas de logique Git** : tous les prédicats consomment le snapshot, pas le moteur
5. **Determinism** : aucune dépendance au temps ou au hasard
6. **Réinitialisation** : `store.startTutorial()` reset le dépôt

## Dépendances inter-commandes

- Dépend de **Phase 5** : toutes les commandes Git (tutoriels les utilisent)
- Dépend de **Phase 6** : `snapshot` bien structuré, `store.execute()` fiable
- Compatible avec **scénarios** : les deux coexistent (scénario = "voici l'état", tutoriel = "construis-le")
- Utilisée optionnellement par **RefsSidebar** ou panel dédié

## Notes pour Phase 8+

- **Persistence** : sauvegarder la progression du tutoriel dans localStorage
- **Analytics** : tracker quel tutoriels sont commencés/terminés
- **Variations** : permettre des chemins alternatifs (ex. `git checkout` OU `git switch`)
- **Scoring** : système de points selon le nombre d'indices utilisés
- **Tutoriels créés par l'utilisateur** : permettre de composer ses propres tutoriels
- **Internationalisation** : traduire les énoncés, indices, messages en anglais
- **Video/GIF** : optionnel : capturer GIF pour chaque étape (dans la modale)
