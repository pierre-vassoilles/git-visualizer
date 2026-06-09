# Phase 6 : Scénarios préchargés

## Résumé

Un catalogue de petits scénarios pédagogiques prêts à charger : chaque scénario est une séquence prédéfinie de commandes Git qui démontre un concept clé (ex: créer une branche, fusionner avec `--no-ff`, résoudre un conflit). L'utilisateur clique sur un scénario → les commandes sont rejouées silencieusement, le graphe se construit pas à pas (ou d'un coup). Utile pour l'apprentissage et la démonstration.

**Cas d'usage** :
- Utilisateur nouveau : "Je veux voir comment fonctionne le merge no-ff"
- Enseignant : "Charge le scénario Conflit de merge, puis explique comment résoudre"
- Playground : utilisateur reset et test des variantes sans retaper tout

## Architecture

### Lieu de la donnée

**Option A (Choisie)** : Données pures en JSON, stockées dans `src/data/scenarios.json` ou `src/constants/scenarios.ts`

```typescript
// src/constants/scenarios.ts
export interface Scenario {
  /** ID unique (ex: "branch-merge") */
  id: string;
  /** Titre lisible (ex: "Branche & Merge") */
  title: string;
  /** Description courte (ex: "Créer une branche et la fusionner") */
  description: string;
  /** Catégorie (ex: "Branches", "Fusion") */
  category: string;
  /** Difficulté (ex: 1-3) */
  difficulty: 1 | 2 | 3;
  /** Commandes à exécuter dans l'ordre */
  commands: string[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: "branch-merge",
    title: "Branche & Merge",
    description: "Créer une branche, committer, et fusionner à main",
    category: "Branches",
    difficulty: 1,
    commands: [
      "init",
      "add README.md",
      "commit -m \"Initial commit\"",
      "branch feature",
      "checkout feature",
      "add feature.txt",
      "commit -m \"Add feature\"",
      "checkout main",
      "merge feature",
    ]
  },
  // ... autres scénarios
];

// Export pour lookup UI
export function getScenarioById(id: string): Scenario | null {
  return SCENARIOS.find(s => s.id === id) ?? null;
}

export function getScenariosByCategory(category: string): Scenario[] {
  return SCENARIOS.filter(s => s.category === category);
}

export function getAllScenarios(): Scenario[] {
  return SCENARIOS;
}
```

**Avantage** : Données pures, testables, pas d'API.

### Catalogue de scénarios (Phase 6)

5 scénarios concrets :

#### Scénario 1 : Branche & Merge (facile)

```typescript
{
  id: "branch-merge",
  title: "Branche & Merge Simple",
  description: "Créer une branche, ajouter des commits, fusionner de retour",
  category: "Branches",
  difficulty: 1,
  commands: [
    "init",
    "add main.txt",
    "commit -m \"Initial commit on main\"",
    "branch feature",
    "checkout feature",
    "add feature.txt",
    "commit -m \"Add feature\"",
    "checkout main",
    "merge feature",
  ]
}
```

**Concepts démontrés** : branches, checkout, commits, merge fast-forward

#### Scénario 2 : Merge No-FF (facile)

```typescript
{
  id: "merge-no-ff",
  title: "Merge --no-ff (créer un commit de fusion)",
  description: "Forcer la création d'un commit de merge même en fast-forward",
  category: "Fusion",
  difficulty: 1,
  commands: [
    "init",
    "add main.txt",
    "commit -m \"C1: main\"",
    "branch hotfix",
    "checkout hotfix",
    "add hotfix.txt",
    "commit -m \"C2: hotfix\"",
    "checkout main",
    "merge --no-ff hotfix -m \"Merge branch hotfix\"",
  ]
}
```

**Concepts** : merge fast-forward vs true merge, commit de fusion, -m

#### Scénario 3 : Conflit de Merge (moyen)

```typescript
{
  id: "merge-conflict",
  title: "Conflit de Merge & Résolution",
  description: "Modifier le même fichier sur deux branches, créer un conflit, le résoudre",
  category: "Fusion",
  difficulty: 2,
  commands: [
    "init",
    "add data.txt",
    "commit -m \"C1: Initial data\"",
    "branch feature",
    "checkout feature",
    "write data.txt \"line1\\nfeature edit\"",
    "add data.txt",
    "commit -m \"C2: feature modifies data\"",
    "checkout main",
    "write data.txt \"line1\\nmain edit\"",
    "add data.txt",
    "commit -m \"C3: main modifies data\"",
    "merge feature -m \"Merge feature (will conflict)\"",
    // À ce point, snapshot.operationState.merging === true
    // Conflit visible dans le file data.txt (marqueurs)
    "write data.txt \"line1\\nboth edits merged\"",
    "add data.txt",
    "commit -m \"C4: Resolve conflict\"",
  ]
}
```

**Concepts** : conflits, marqueurs `<<<<<`, merge en cours, résolution

#### Scénario 4 : Rebase Interactif & Squash (moyen)

```typescript
{
  id: "rebase-squash",
  title: "Rebase Interactif & Squash",
  description: "Squasher plusieurs commits en un seul",
  category: "Réécriture",
  difficulty: 2,
  commands: [
    "init",
    "add f1.txt",
    "commit -m \"C1: First\"",
    "add f2.txt",
    "commit -m \"C2: Second (typo)\"",
    "add f3.txt",
    "commit -m \"C3: Third\"",
    // Rebase interactif : squash C2 et C3 en C1
    // La syntaxe xterm ne supporte pas interactive modal,
    // donc Phase 6 simule avec un hack : rejeu des commits
    // (ou laisse la modal interactive s'ouvrir)
    "rebase -i main~2",
    // TODO: l'utilisateur interagit avec la modal pour modifier la todo list
    // Pour l'instant, cette ligne est un placeholder
  ]
}
```

**Problème** : `rebase -i` nécessite une interaction modale ; Phase 6 laisse cela comme TBD

**Alternative pour Phase 6** : omettre ce scénario ou proposer un scénario sans `-i`

#### Scénario 5 : Cherry-pick & Tag (moyen)

```typescript
{
  id: "cherry-pick-tag",
  title: "Cherry-pick & Tagging",
  description: "Appliquer un commit spécifique sur une autre branche et créer un tag",
  category: "Réécriture",
  difficulty: 2,
  commands: [
    "init",
    "add main.txt",
    "commit -m \"C1: main initial\"",
    "branch feature",
    "checkout feature",
    "add feature.txt",
    "commit -m \"C2: important feature\"",
    "add extra.txt",
    "commit -m \"C3: extra stuff\"",
    "checkout main",
    "cherry-pick feature~1",  // Applique C2 sur main
    "tag v1.0",  // Marquer ce point comme release
    "checkout feature",
    "tag feature-tip",
  ]
}
```

**Concepts** : cherry-pick, tags, navigation, graphe avec plusieurs branches

#### Scénario 6 (optionnel) : Reset & Reflog Undo (moyen)

```typescript
{
  id: "reset-undo",
  title: "Reset & Undo via Reflog",
  description: "Réinitialiser accidentellement, puis restaurer via reflog",
  category: "Réparation",
  difficulty: 2,
  commands: [
    "init",
    "add f1.txt",
    "commit -m \"C1: Good state\"",
    "add f2.txt",
    "commit -m \"C2: Still good\"",
    "reset --hard main~1",  // Oups ! On "perd" C2
    // Le graphe montre maintenant juste C1
    // Mais reflog contient HEAD@{1}: commit C2
    "reset --hard HEAD@{1}",  // Undo ! On restaure C2
  ]
}
```

**Concepts** : reset, reflog, recovery, HEAD@{n}

## Flux d'utilisation

### 1. Affichage du catalogue (UI)

Dans la **RefsSidebar** ou un nouveau **ScenarioPanel**, afficher :

```
Scénarios d'apprentissage

Branches
  [ Branche & Merge ] Créer une branche, ajouter des commits, fusionner
  
Fusion
  [ Merge --no-ff ] Créer un commit de fusion
  [ Conflit de Merge ] Modifier le même fichier, créer et résoudre un conflit
  
Réécriture
  [ Cherry-pick & Tag ] Appliquer un commit ailleurs, créer un tag
  [ Reset & Undo ] Réinitialiser accidentellement, puis restaurer
```

Chaque scénario est un bouton cliquable.

### 2. Charger un scénario

**Utilisateur clique sur "Branche & Merge"**

1. **Confirmation** (optionnel) : "Êtes-vous sûr ? Cela réinitialisera le dépôt."
2. **Réinitialisation** :
   ```typescript
   store.reset();  // Vide l'engine
   ```
3. **Rejeu** :
   ```typescript
   const scenario = getScenarioById("branch-merge");
   for (const cmd of scenario.commands) {
     await store.execute(cmd);
   }
   ```
4. **Affichage** : Le snapshot se met à jour, le graphe et la sidebar se rafraîchissent

### 3. Exploration et édition

Une fois chargé, l'utilisateur :
- Inspect le graphe (zoom, pan)
- Tape des commandes supplémentaires (`git log`, `git status`, etc.)
- Modifie le scénario (ex: crée une branche supplémentaire)
- Reset et recharge un autre scénario

## Critique

### Avantages

1. **Pédagogique** : Utilisateurs nouveaux voient des exemples prêts à l'emploi
2. **Reproductibilité** : Un scénario est toujours pareil (déterministe)
3. **Testabilité** : Les scénarios peuvent être testés comme des séquences de commandes

### Limitations

1. **Rebase interactif** : `-i` nécessite une modale interactive, non simulable en ligne de commande simple
   - **Décision Phase 6** : Omettre les scénarios `-i` ou proposer une modale en popup
2. **Interactions utilisateur** : Résoudre un conflit nécessite que l'utilisateur modifie un fichier
   - **Hack** : Utiliser `write` pour simuler l'édition (déjà dans le scénario 3)
3. **Taille** : 5-10 scénarios max (pour ne pas surcharger la UI)

## Critères d'acceptation

### CA-scenarios-01 : Catalogue accessible

**Given**
- L'app est chargée

**When**
- Inspectez `getScenariosByCategory("Branches")`

**Then**
- Retourne au moins 1 scénario de type "Branches"
- Chaque scénario a `id`, `title`, `description`, `commands`

### CA-scenarios-02 : Chargement d'un scénario

**Given**
- User clique sur "Branche & Merge"

**When**
- Appel `store.executeScenario("branch-merge")`

**Then**
- L'engine est réinitialisé
- Toutes les commandes du scénario sont exécutées
- `snapshot.branches` contient `"main"` et `"feature"`
- `snapshot.commits` contient au moins 2 commits

### CA-scenarios-03 : État après charge

**Given**
- Scénario "Branche & Merge" chargé

**When**
- Inspect le snapshot

**Then**
- `snapshot.operationState.merging === false` (merge réussi)
- HEAD pointe sur `main` (checkout final)
- Le graphe affiche 2 branches + 1 commit merge
- Aucun conflit

### CA-scenarios-04 : Scénario avec conflit

**Given**
- Scénario "Conflit de Merge" est exécuté jusqu'au merge

**When**
- Inspect le snapshot après le `merge feature` (avant résolution)

**Then**
- `snapshot.operationState.merging === true`
- Fichier `data.txt` contient les marqueurs `<<<<<<< ======= >>>>>>>`
- Un nouveau commit n'est pas créé (pending la résolution)

### CA-scenarios-05 : Résolution de conflit dans le scénario

**Given**
- Scénario "Conflit de Merge" jusqu'à la résolution

**When**
- Exécute `write data.txt "...merged..."` + commit

**Then**
- Conflit résolu
- `snapshot.operationState.merging === false`
- Un commit de merge créé

### CA-scenarios-06 : Rejeu déterministe

**Given**
- Scénario "Cherry-pick & Tag" exécuté deux fois

**When**
- Compares les deux snapshots finaux

**Then**
- Identiques : mêmes commits, mêmes branches, mêmes tags, mêmes hashes

### CA-scenarios-07 : Réinitialisation avant charge

**Given**
- User a exécuté des commandes manuellement

**When**
- Clique sur un scénario

**Then**
- L'historique manuel est perdu (reset)
- Seules les commandes du scénario existent

### CA-scenarios-08 : Catégories du catalogue

**Given**
- `getAllScenarios()` retourne la liste

**When**
- Groupe par catégorie

**Then**
- Catégories présentes : "Branches", "Fusion", "Réécriture", etc.
- Au minimum 3 catégories

### CA-scenarios-09 : Difficulté des scénarios

**Given**
- Chaque scénario

**When**
- Inspect le champ `difficulty`

**Then**
- Valeur : 1 (facile), 2 (moyen), ou 3 (difficile)
- Scénarios simples (merge, branch) = 1
- Scénarios avec conflits = 2

### CA-scenarios-10 : Affichage UI

**Given**
- ScenarioPanel / RefsSidebar affiche les scénarios

**When**
- User scrolle la liste

**Then**
- Titre, description, difficultés visibles
- Bouton de chargement clair par scénario

### CA-scenarios-11 : Scénario avec tags

**Given**
- Scénario "Cherry-pick & Tag" chargé

**When**
- Inspect snapshot.tags

**Then**
- `snapshot.tags` contient au minimum "v1.0" et "feature-tip"
- Chaque tag pointe sur le bon commit

### CA-scenarios-12 : Erreur lors du rejeu

**Given**
- Scénario contient une commande invalide (bug dans les données)

**When**
- L'app essaie de charger

**Then**
- Arrête le rejeu à la première erreur
- Affiche un message d'erreur (ex: "Failed to load scenario: invalid command")
- L'engine reste en état cohérent (après la dernière commande valide)

## Implémentation : Points clés

1. **Données** : `src/constants/scenarios.ts` avec `Scenario` interface et `SCENARIOS` array

2. **Store action** : `src/stores/repo.ts` ajouter `executeScenario(id: string)` :
   ```typescript
   async executeScenario(scenarioId: string) {
     const scenario = getScenarioById(scenarioId);
     if (!scenario) throw new Error("Scenario not found");
     
     this.reset();  // Réinitialiser
     
     for (const cmd of scenario.commands) {
       const result = await this.execute(cmd);
       if (!result.success) {
         console.error(`Failed to execute: ${cmd}`);
         break;
       }
     }
   }
   ```

3. **UI** : Component `ScenarioPanel.vue` (ou integration dans RefsSidebar) :
   - Affiche `getAllScenarios()` groupé par catégorie
   - Boutons pour charger
   - Confirmation avant réinitialisation

4. **Tests** : Pour chaque scénario, écrire un test qui charge et vérifie le snapshot final

5. **Pas de hardcodage UI** : Les scénarios viennent de `src/constants/`, pas de données en dur dans les composants

## Dépendances inter-commandes

- Dépend de **toutes les commandes Phase 5** : les scénarios utilisent git init, commit, branch, merge, etc.
- Utilisée par **ScenarioPanel UI** et **RefsSidebar**
- Compatible avec **persistance** : charger un scénario reset l'historique localStorage (ou on peut le persister après)

## Notes pour Phase 6+

- **Phase 6** : 5 scénarios de base (Branches, Fusion, Réécriture)
- **Phase 7** : Ajouter `rebase -i` interactif (scénarios Squash, Reword)
- **Phase 8** : Scénarios créés par l'utilisateur (sauvegarder des séquences)
- **Phase 9** : Scénarios partagés (lien, QR code, ou import JSON)
