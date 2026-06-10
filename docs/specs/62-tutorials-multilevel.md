# Phase B2 : Tutoriels multi-niveaux et bilingues

## Résumé

Extension du **système de tutoriels guidés (spec 51)** avec trois innovations clés :

1. **Multi-niveaux** : Curriculum structuré en 3 niveaux (Basique, Moyen, Avancé) avec 5 tutoriels par niveau = 15 tutoriels au total. Les utilisateurs progressent linéairement : maîtriser le basique avant le moyen, etc.

2. **Bilingue (FR/EN)** : Tous les contenus pédagogiques (titre, description, énoncés d'étapes, indices, messages de réussite) sont traduits FR ↔ EN. La langue est résolue à l'affichage via `useI18n().getLocale()`.

3. **Interaction améliorée** : Chaque étape affiche maintenant :
   - **« Pourquoi & Comment »** : explication pédagogique du concept
   - **« Effet sur le graphe »** : description du résultat attendu
   - **Bouton « Exécuter »** : lance la commande attendue de l'étape (interaction passive optionnelle)

**Architecture stricte** :

- Données pures dans `src/constants/tutorials.ts` (contenu + métadonnées)
- Prédicats purs dans `src/core/tutorial-helpers.ts` (validation)
- Type-safe bilingue : `LocalizedText = { en: string; fr: string }` pour le contenu volumineux
- Chrome UI traduit via `messages.ts` / `MESSAGE_KEYS` (listes de tutoriels, labels)
- Moteur Git jamais traduit (messages d'erreur EN, déterminisme préservé)

## Architecture

### Modèle de données (core)

**Fichier** : `src/core/tutorial-helpers.ts`

Extension de l'interface existante `Tutorial`, `TutorialStep` avec bilingue et niveau :

```typescript
/**
 * Texte localisé (FR + EN). Exposé dans les données des tutoriels.
 * Résolu à l'affichage selon la locale courante.
 */
export interface LocalizedText {
  en: string;
  fr: string;
}

/** Niveau de difficulté du tutoriel (regroupe les 3 sections de l'UI). */
export type TutorialLevel = 'basic' | 'medium' | 'advanced';

/**
 * Amélioration Phase B2 : ajout de champs pédagogiques et niveau.
 */
export interface TutorialStep {
  id: string;
  /** Titre court de l'étape (bilingue). */
  title: LocalizedText;
  /** Énoncé explicatif : ce qu'il faut faire (bilingue). */
  description: LocalizedText;
  /** Optionnel : indice textuel (bilingue). */
  hint?: LocalizedText;
  /** Optionnel : explication du POURQUOI/COMMENT (pédagogique, bilingue). */
  explanation?: LocalizedText;
  /** Optionnel : description de l'effet sur le graphe (bilingue). */
  graphEffect?: LocalizedText;
  /** Optionnel : commande(s) lancée(s) par le bouton « Exécuter ». */
  command?: string;
  /** Objectifs : prédicats purs sur le snapshot (inchangés). */
  objectives: StepObjective[];
  /** Message affiché quand l'étape est réussie (bilingue). */
  successMessage: LocalizedText;
}

/**
 * Amélioration Phase B2 : ajout de niveau et contenu bilingue.
 */
export interface Tutorial {
  id: string;
  /** Titre du tutoriel (bilingue). */
  title: LocalizedText;
  /** Description courte (bilingue). */
  description: LocalizedText;
  /** Niveau (détermine la section du catalogue de l'UI). */
  level: TutorialLevel;
  /** Difficulté : 1 (facile) à 3 (difficile). Conservé pour rétro-compat. */
  difficulty: 1 | 2 | 3;
  /** Durée estimée en minutes. */
  duration: number;
  /** Étapes ordonnées. */
  steps: TutorialStep[];
  /** Commandes suggérées pour autocomplete (optionnel). */
  suggestedCommands?: string[];
}

/**
 * Amélioration : objectifs avec description bilingue.
 */
export interface StepObjective {
  /** Description courte du critère (bilingue). */
  description: LocalizedText;
  /** Prédicat pur sur le snapshot. */
  validate: (snapshot: RepoSnapshot) => boolean;
}

/** Helper de résolution bilingue (utilisé par l'UI). */
export function localize(text: LocalizedText, locale: 'en' | 'fr'): string {
  return text[locale] || text.en || text.fr || '';
}
```

**Décision de modèle** :

- Les **contenus volumineux** (étapes, objectifs, messages) utilisent `LocalizedText` (struct locale-agnostique persistable)
- Le **chrome UI** (labels « Basique », « Moyen », « Avancé », libellés « Exécuter », etc.) reste dans `messages.ts` (pour éviter de dupliquer/tester des clés figées)
- Raison : `messages.ts` est un `MessageKey` union + `MESSAGE_KEYS` array figé ; les ajouter à 15 tutos × 4 sections = ~60 clés perds la maintenabilité ; `LocalizedText` inline dans les données évite ce cycle
- **Test de parité** : chaque `LocalizedText` doit avoir `en` ET `fr` non-vides (test lors du build)

### Catalogue de tutoriels (données)

**Fichier** : `src/constants/tutorials.ts`

Migration des 3 tutoriels existants + 12 nouveaux ; structure par niveau, chacun enrichi de `level`, `explanation`, `graphEffect`, `command` optionnel.

```typescript
export const TUTORIALS: Tutorial[] = [
  // Niveau: basic (5 tutoriels)
  { id: 'first-commit', level: 'basic', ... },
  { id: 'staging-area', level: 'basic', ... },
  { id: 'branches-basics', level: 'basic', ... },
  { id: 'tags-detached', level: 'basic', ... },
  { id: 'undo-basics', level: 'basic', ... },

  // Niveau: medium (5 tutoriels)
  { id: 'merge-ff-vs-noff', level: 'medium', ... },
  { id: 'merge-conflicts', level: 'medium', ... },
  { id: 'rebase-basics', level: 'medium', ... },
  { id: 'remote-clone-push', level: 'medium', ... },
  { id: 'remote-fetch-pull', level: 'medium', ... },

  // Niveau: advanced (5 tutoriels)
  { id: 'interactive-rebase', level: 'advanced', ... },
  { id: 'reset-reflog', level: 'advanced', ... },
  { id: 'cherry-pick-revert', level: 'advanced', ... },
  { id: 'stash-workflow', level: 'advanced', ... },
  { id: 'pull-rebase-collab', level: 'advanced', ... },
];

export function getTutorialsByLevel(level: TutorialLevel): Tutorial[] {
  return TUTORIALS.filter(t => t.level === level);
}

export function getAllTutorials(): Tutorial[] {
  return TUTORIALS;
}

export function getTutorialById(id: string): Tutorial | null {
  return TUTORIALS.find(t => t.id === id) ?? null;
}
```

### Prédicats validateurs

**Fichier** : `src/core/tutorial-helpers.ts` (inchangé)

Les prédicats existants (`hasCommits`, `hasBranch`, `headPointsTo`, `isStaged`, `fileExists`, `noStagedChanges`, `noOperationInProgress`, `hasBranchCount`, `all`) restent tels quels. Nouveaux prédicats suggérés si nécessaire (voir Notes d'implémentation).

### Intégration i18n

**Frontière stricte** :

- **Moteur Git** : JAMAIS traduit (messages d'erreur EN, hashes immuables)
- **Contenu pédagogique** (tutoriels) : `LocalizedText` inline, résolu par `localize(text, locale)` à l'affichage
- **Chrome UI** (labels génériques) : traduit via `messages.ts`/`t(key)`

**New message keys** à ajouter dans `src/i18n/messages.ts` :

```typescript
export type MessageKey =
  // ... existant ...
  // Tutoriels (spec 62)
  | 'sidebar.tutorialLevel.basic'
  | 'sidebar.tutorialLevel.medium'
  | 'sidebar.tutorialLevel.advanced'
  | 'tutorial.why'
  | 'tutorial.graphEffect'
  | 'tutorial.execute'
  | 'tutorial.executeButton';
```

**Dictionnaires** : Ajouter aux `locales/fr.json` et `en.json` :

```json
{
  "sidebar.tutorialLevel.basic": "Basique",
  "sidebar.tutorialLevel.medium": "Moyen",
  "sidebar.tutorialLevel.advanced": "Avancé",
  "tutorial.why": "Pourquoi & Comment",
  "tutorial.graphEffect": "Effet sur le graphe",
  "tutorial.execute": "Exécuter",
  "tutorial.executeButton": "Exécuter la commande"
}
```

## UI : Modale et catalogue

### Catalogue groupé par niveau

**Dans RefsSidebar** : Nouvelle section « Tutoriels » (remplace l'énumération plate de spec 51) :

```
╔═══════════════════════════════════════╗
║  Tutoriels guidés                     ║
├───────────────────────────────────────┤
║  Basique                              ║
│  ▸ Premier commit (10 min)            ║
│  ▸ Staging area (15 min)              ║
│  ▸ Branches basics (12 min)           ║
│  ▸ Tags & détaché (8 min)             ║
│  ▸ Undo basics (10 min)               ║
║                                       ║
║  Moyen                                ║
│  ▸ Merge fast-forward vs --no-ff      ║
│  ▸ Merge conflits                     ║
│  ▸ Rebase basics                      ║
│  ▸ Remote clone/push                  ║
│  ▸ Remote fetch/pull                  ║
║                                       ║
║  Avancé                               ║
│  ▸ Interactive rebase                 ║
│  ▸ Reset & reflog                     ║
│  ▸ Cherry-pick & revert               ║
│  ▸ Stash workflow                     ║
│  ▸ Pull rebase collab                 ║
└───────────────────────────────────────┘
```

Clic sur un tutoriel → modale « Démarrer ce tutoriel ? » (confirmé par Store `startTutorial(id)`).

### Modale de tutoriel enrichie

**Composant** : `GuidedTutorialModal.vue` (extension de spec 51)

Ajoute deux panneaux à l'étape courante :

```
╔════════════════════════════════════════════╗
║ Premier commit · Étape 1 / 4               ║
├────────────────────────────────────────────┤
║ Titre : Initialiser le dépôt               ║
║ Description : Commencez par…               ║
║                                            ║
║ 💡 Indice                                  ║
║   Tapez exactement : git init              ║
║                                            ║
║ ▼ Pourquoi & Comment                       ║
║   Chaque projet Git commence par…          ║
║                                            ║
║ ▼ Effet sur le graphe                      ║
║   Le graphe passe de « vide » à…           ║
║                                            ║
║ Objectifs :                                ║
║   ○ Dépôt initialisé                       ║
║                                            ║
║ Succès ! (message affiché une fois OK)    ║
│                                            │
│ [Exécuter] [Quitter] [Revenir] [Suivant]  │
└────────────────────────────────────────────┘
```

**Bouton « Exécuter »** :

- Visible si `step.command` défini
- Clique → `store.execute(step.command)` (même que taper dans le terminal)
- Permet une mode d'apprentissage plus passif (découverte sans saisie)
- Objectifs auto-validés après exécution (comportement inchangé)

**Sections dépliantes** (« Pourquoi & Comment » / « Effet sur le graphe ») :

- Optionnelles : affichées seulement si `explanation` / `graphEffect` définis
- Collapsed par défaut (l'utilisateur scroll/clique pour lire)
- Encouragent la curiosité pédagogique

## Flux d'utilisation

### Découverte de tutoriels

1. Utilisateur ouvre la sidebar
2. Section « Tutoriels guidés » groupée par niveau (collapsible par niveau)
3. Clique sur « Premier commit »
4. Modal de confirmation : « Démarrer ce tutoriel ? »
5. Confirmé → `store.startTutorial('first-commit')` → reset + modale d'étape

### Progression dans une étape

1. Modale affiche étape 1
2. Utilisateur peut :
   - **Taper dans le terminal** : saisie libre (apprentissage actif)
   - **Cliquer « Exécuter »** : commande lancée automatiquement (apprentissage passif)
3. Les objectifs se valident automatiquement à chaque command exécutée
4. Quand tous les objectifs ✓ : message de réussite + « Suivant » se déverrouille
5. Clic « Suivant » → étape 2 (titre, description, indice, objectifs frais)

### Fin du tutoriel

Écran de récapitulatif (inchangé de spec 51, mais enrichi bilingue) :

- Checklist des étapes (✓ réussies, ⤼ sautées)
- Temps écoulé
- Indices utilisés
- Boutons : « Recommencer », « Voir d'autres tutoriels », « Fermer »

## Critères d'acceptation

### CA-tut62-01 : Modèle bilingue

**Given**

- Type `LocalizedText` défini

**When**

- Inspectez un tutoriel (ex: `TUTORIALS[0]`)

**Then**

- Chaque texte volumineux (title, description, hint, explanation, graphEffect, successMessage) est une `LocalizedText`
- Chaque `LocalizedText` a des clés `en` et `fr` non-vides
- Build TS strict passe : `LocalizedText` est compilé, pas une chaîne
- Test de parité : toutes les `LocalizedText` des 15 tutoriels ont `en` et `fr`

### CA-tut62-02 : Niveau de tutoriel

**Given**

- Tutoriel chargé

**When**

- Vérifiez `tutorial.level`

**Then**

- Retourne l'une des 3 valeurs : `'basic'`, `'medium'`, `'advanced'`
- Les 15 tutoriels sont distribués : 5 basic, 5 medium, 5 advanced
- `getTutorialsByLevel('basic')` retourne exactement 5 tutoriels

### CA-tut62-03 : Résolution bilingue

**Given**

- Composant affiche un tutoriel en locale FR

**When**

- Appelez `localize(step.title, 'fr')`

**Then**

- Retourne la chaîne en français (non vide)
- À locale EN : retourne l'anglais

### CA-tut62-04 : Modale enrichie — sections explanation/graphEffect

**Given**

- Modale affiche étape avec `explanation` et `graphEffect` définis

**When**

- Inspectez la structure HTML

**Then**

- Deux sections dépliantes visibles (collapsed par défaut)
- Clic sur en-tête → toggle affichage du contenu
- Contenu résolu à la locale courante via `localize(explanation, locale)`

### CA-tut62-05 : Bouton Exécuter

**Given**

- Étape avec `command: "git init"` défini

**When**

- Modale affichée

**Then**

- Bouton « Exécuter » visible
- Clique → appelle `store.execute('git init')`
- Les objectifs se re-valident après exécution (automatique, inchangé)

### CA-tut62-06 : Pas de commande = pas de bouton

**Given**

- Étape sans `command`

**When**

- Modale affichée

**Then**

- Bouton « Exécuter » absent ou désactivé

### CA-tut62-07 : Catalogue groupé par niveau (UI)

**Given**

- Sidebar affiche section « Tutoriels guidés »

**When**

- Inspectez la structure

**Then**

- 3 sous-sections visibles : « Basique », « Moyen », « Avancé » (labels traduits via `t()`)
- Chaque sous-section énumère les 5 tutoriels du niveau
- Clic sur un tutoriel ouvre modal de confirmation

### CA-tut62-08 : Migration des 3 tutoriels existants

**Given**

- `TUTORIALS` contient les 3 tutoriels de spec 51 (first-commit, branching, undo-reset)

**When**

- Comparez avec spec 51

**Then**

- `first-commit` → `id`, `title`, `description`, `level: 'basic'`, `difficulty: 1`, `duration: 10`, `steps[]` inchangés (données convertis en `LocalizedText`)
- `branching` → `level: 'medium'`, `difficulty: 2`, `duration: 20`
- `undo-reset` → `level: 'medium'`, `difficulty: 2`, `duration: 15`
- Tous ont `explanation` et `graphEffect` dans chaque étape
- Tests existants reste verts (prédicats inchangés)

### CA-tut62-09 : Nouveau catalogue (12 tutoriels ajoutés)

**Given**

- `TUTORIALS` complété

**When**

- Appelez `getTutorialsByLevel('basic')` / `getTutorialsByLevel('medium')` / `getTutorialsByLevel('advanced')`

**Then**

- Retourne respectivement 5, 5, 5 tutoriels
- Chacun a `id`, `title`, `description`, `level`, `difficulty`, `steps[]`, `duration`
- Les 15 ids sont uniques

### CA-tut62-10 : Messages i18n du chrome

**Given**

- Sidebar affiche section Tutoriels

**When**

- Changez la locale de FR à EN

**Then**

- Les labels « Basique », « Moyen », « Avancé » se traduisent
- Les labels « Exécuter », « Pourquoi & Comment » se traduisent

### CA-tut62-11 : Moteur Git non traduit

**Given**

- Tutoriel exécuté, une commande échoue

**When**

- Inspectez le message d'erreur dans le terminal

**Then**

- Reste en anglais (ex: "fatal: not a git repository")
- Indépendant de la locale

### CA-tut62-12 : Persistance / undo-redo

**Given**

- Utilisateur démarre tutoriel, fait étape 1, recharge la page

**When**

- Page rechargée

**Then**

- Tutoriel est **perdu** (progression non persistée — spec 51 / B2-tutorials / non bloquante)
- Dépôt rejoint depuis l'historique de commandes (pas du tutoriel)
- Utilisateur doit redémarrer le tutoriel

### CA-tut62-13 : Déterminisme

**Given**

- Deux exécutions du même tutoriel avec mêmes commandes

**When**

- Comparez les snapshots

**Then**

- Identiques (prédicats purs, pas de Date.now(), pas d'aléatoire)

### CA-tut62-14 : Test de parité bilingue (test auto)

**Given**

- Test unitaire : `tests/i18n-tutorial-parity.test.ts`

**When**

- Test s'exécute

**Then**

- Chaque `LocalizedText` dans `TUTORIALS` a `en` non-vide ET `fr` non-vide
- Test échoue si une clé i18n du chrome (messages.ts) est manquante en FR ou EN

### CA-tut62-15 : Description d'objectifs bilingue

**Given**

- Objectif dans une étape

**When**

- Modale affichée en locale courante

**Then**

- Description de l'objectif est en FR (si locale='fr') ou EN (locale='en')
- Résolu via `localize(objective.description, locale)`

## Notes d'implémentation

### Structure des données

1. **Migration spec 51** : Convertir le contenu des 3 tutoriels existants (chaînes simples) en `LocalizedText`
   - Titre → { en: "First Commit", fr: "Premier commit" }
   - Description → { en: "Learn to create your first commit…", fr: "Apprenez à créer votre premier commit…" }
   - Idem pour hint, objectives[].description, successMessage

2. **Nouveaux 12 tutoriels** : Spec 63 liste l'ID, niveau, étapes. Implémentation rédige le contenu pédagogique complet (explanation, graphEffect) bilingue.

3. **Prédicats** : Aucun nouveau prédicat requis pour les 5 tutoriels basiques + moyen. Advanced (interactive-rebase, reflog, cherry-pick, stash) peuvent réutiliser les existants.

### Composant GuidedTutorialModal

1. Ajouter deux sections dépliantes optionnelles (collapsible)
   - Section 1 : `t('tutorial.why')` + contenu via `localize(step.explanation, locale)`
   - Section 2 : `t('tutorial.graphEffect')` + contenu via `localize(step.graphEffect, locale)`

2. Ajouter bouton « Exécuter »
   - Condition : `step.command` défini
   - Clique : `store.execute(step.command)`
   - Étiquette : `t('tutorial.executeButton')`

3. Réactivité bilingue : usez `useI18n().locale` (computed) pour forcer re-render à changement de langue

### Test de parité

Ajouter test automatisé `tests/i18n-tutorial-parity.test.ts` :

```typescript
it('CA-tut62-14: chaque LocalizedText a en ET fr', () => {
  for (const tutorial of TUTORIALS) {
    expect(tutorial.title.en).toBeTruthy();
    expect(tutorial.title.fr).toBeTruthy();
    for (const step of tutorial.steps) {
      expect(step.title.en).toBeTruthy();
      expect(step.title.fr).toBeTruthy();
      // … idem pour description, hint, explanation, graphEffect, successMessage
      for (const obj of step.objectives) {
        expect(obj.description.en).toBeTruthy();
        expect(obj.description.fr).toBeTruthy();
      }
    }
  }
});

it('CA-tut62-14: MESSAGE_KEYS de tutoriels présentes en FR/EN', () => {
  const tutorialKeys = [
    'sidebar.tutorialLevel.basic',
    'sidebar.tutorialLevel.medium',
    'sidebar.tutorialLevel.advanced',
    'tutorial.why',
    'tutorial.graphEffect',
    'tutorial.executeButton',
  ];
  for (const key of tutorialKeys) {
    expect(MESSAGE_KEYS).toContain(key);
    expect(frMessages[key]).toBeTruthy();
    expect(enMessages[key]).toBeTruthy();
  }
});
```

### Dépendances

- Dépend de **spec 51** : types `Tutorial`, `TutorialStep`, prédicats, store `tutorialProgress`
- Dépend de **spec 55** : i18n (`useI18n()`, `locale`, `MESSAGE_KEYS`)
- Dépend de **spec 52** : animations du graphe (les effets décrits dans `graphEffect` s'appuient sur la transition du layout)
- Dépend de **spec 50** : éditeur de conflits (tutoriel « merge-conflicts » utilise merge avec résolution)

### Tests

Ajouter tests pour :

- `tests/tutorials-multilevel.test.ts` : structure des 15 tutoriels, niveau, bilingue
- Parité i18n : `tests/i18n-tutorial-parity.test.ts`
- Ensemble existant (tests/tutorials.test.ts) : vérifier que les 3 tutoriels migrés conservent la même sémantique

## Dépendances inter-phases

- **Phase B2** : spec 51 (tutoriels existants) → spec 62 (extension multilevel + bilingue) → spec 63 (curriculum complet)
- **Phase B2** : spec 55 (i18n) → spec 62 (contenu traduit)
- **Phase B2** : spec 52 (animations) → spec 62 (descriptions des effets sur le graphe)
- **Phase B2** : spec 50 (éditeur de conflits) → spec 62 (tutoriel merge-conflicts)

## Dette acceptée (non bloquante)

1. **Progression non persistée** : À rechargement, le tutoriel est perdu (comportement spec 51 non changé). Persistance optionnelle pour Phase B3+.

2. **Pas de tests composants** : Les interactions UI du modal (collapse, bouton Exécuter) ne sont pas couvertes par Vitest (pas `@vue/test-utils` dédié à ce layer). Relus en revue.

3. **Contenu pédagogique non optimisé** : Les textes d'explanation et graphEffect sont écrits à titre d'exemple ; une vrai appli pédagogique affinerait la prose selon le feedback utilisateur.

4. **Reflog tutoriel** : Le tutoriel undo-reset (spec 51) a une étape « check-reflog » informative (l'objectif ne change pas de l'avant vers l'après) — non bloquant pour spec 62.

5. **Ordre de niveau** : Les tutoriels d'un même niveau ne sont pas triés pédagogiquement (apprentissage des concepts de base avant les applications) — le tri est laissé à la phase 63.
