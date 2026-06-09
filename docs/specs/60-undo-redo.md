# Phase 7 : Undo / redo applicatif

## Résumé

L'utilisateur peut annuler (Ctrl+Z / Cmd+Z) et refaire (Ctrl+Y / Cmd+Y) des actions au niveau APPLICATION, indépendamment du reflog Git. Undo/redo navigue l'historique des états du dépôt (snapshots) : chaque étape de l'historique des commandes peut être revisitée sans supprimer la session ou les futures commandes.

**Principes** :
- Modèle : **rejeu déterministe jusqu'à l'index N** plutôt que stockage de snapshots
- Distinction claire : undo/redo applicatif ≠ reflog Git (distinct)
- Déterministe : rejouer `savedCommands[0..N]` produit toujours le même état
- Frontière core↔UI : le store orchestre le rejeu ; aucune logique git dans l'UI
- Interaction avec nouvelles commandes : tronque la pile de redo (modèle classique)

## Modèle de state

### Pile d'historique

```typescript
export interface UndoRedoState {
  /** Index courant dans savedCommands (0 = boot, N = position actuelle) */
  currentIndex: number;
  
  /** Liste complète des commandes réussies (issue de savedCommands) */
  commandHistory: string[];
  
  /** Stack d'index pour redo (pile LIFO des positions undo) */
  redoStack: number[];
}

// Exemple :
// commandHistory = ["init", "add f1", "commit -m A", "branch feat", "checkout feat", "add f2", "commit -m B"]
// currentIndex = 4  (on est après "checkout feat", avant "add f2")
// redoStack = [6]   (on peut refaire jusqu'à l'index 6)
```

### États possibles

**Boot** :
```
currentIndex: 0
commandHistory: []
redoStack: []
Snapshot : repo vierge
```

**Après 3 commandes** :
```
currentIndex: 3
commandHistory: ["init", "add f", "commit"]
redoStack: []
Snapshot : état après "commit"
```

**Après undo (1 fois)** :
```
currentIndex: 2
commandHistory: ["init", "add f", "commit"]
redoStack: [3]  (on peut refaire jusqu'à 3)
Snapshot : état après "add f"
```

**Après redo (1 fois)** :
```
currentIndex: 3
commandHistory: ["init", "add f", "commit"]
redoStack: []
Snapshot : état après "commit"
```

**Nouvelle commande après undo** :
```
currentIndex: 3 (exécuter la nouvelle)
commandHistory: ["init", "add f", "commit", "branch feat"]  (ancienne "commit" remplacée)
redoStack: []  (pile redo tronquée)
Snapshot : état après "branch feat"
```

## Mécanisme de rejeu

### Undo : rétrograder à currentIndex - 1

```typescript
function undo() {
  if (currentIndex === 0) {
    // Aucun undo possible (déjà au boot)
    return;
  }
  
  // Sauvegarder la position courante dans la pile redo
  redoStack.push(currentIndex);
  
  // Rétrograder
  currentIndex -= 1;
  
  // Rejouer jusqu'à la nouvelle position
  rebuildState(currentIndex);
}

function rebuildState(targetIndex: number) {
  const engine = new GitEngine();
  const replayed: string[] = [];
  
  for (let i = 0; i < targetIndex; i++) {
    const cmd = commandHistory[i];
    const result = engine.execute(cmd);
    if (result.exitCode !== 0 && engine.snapshot().operationState == null) {
      // Erreur réelle (ne devrait jamais arriver ici : l'historique est valide)
      break;
    }
    replayed.push(cmd);
  }
  
  // Mise à jour réactive
  store.engine = engine;
  store.snapshot = engine.snapshot();
  store.savedCommands = replayed;
}
```

### Redo : progresser au prochain index de la pile

```typescript
function redo() {
  if (redoStack.length === 0) {
    // Aucun redo possible
    return;
  }
  
  // Récupérer le prochain index à refaire
  const nextIndex = redoStack.pop();
  currentIndex = nextIndex;
  
  // Rejouer jusqu'à la nouvelle position
  rebuildState(currentIndex);
}
```

### Nouvelle commande après undo : tronquer la pile redo

```typescript
function execute(command: string): CommandResult {
  // Exécuter la commande normalement
  const result = store.execute(command);
  
  if (result.exitCode === 0 || snap.operationState != null) {
    // Commande réussie (ou opération en cours)
    currentIndex = commandHistory.length;  // Nouvelle position = fin
    redoStack = [];  // Tronquer la pile redo
  }
  
  return result;
}
```

**Exemple** :
```
Après 5 commandes : currentIndex = 5, redoStack = []
Undo, undo : currentIndex = 3, redoStack = [4, 5]
Nouvelle commande "branch fix" : 
  → currentIndex = 6 (fin de la nouvelle liste)
  → redoStack = [] (vidée)
  → commandHistory = ["init", ..., "commit C", "branch fix"]
    (ancienne 4e et 5e commandes perdues)
```

## Raccourcis clavier

| Raccourci | Action | Plateforme |
|-----------|--------|-----------|
| `Ctrl+Z` / `Cmd+Z` | Undo | Windows/Linux / macOS |
| `Ctrl+Y` / `Cmd+Shift+Z` | Redo | Windows/Linux / macOS |

**Implémentation** :
- Capturer `keydown` dans `App.vue` ou `TerminalPanel.vue`
- Éviter les conflits avec le navigateur (ex: `Ctrl+Z` ne doit pas trigger le undo navigateur)
- Utiliser `event.preventDefault()` si l'app a le focus

**Considération** : Dans xterm, `Ctrl+Z` peut signifier `SIGSTOP` (unix shell). La décision Phase 7 est de **capturer dans l'app et prévenir le default** pour undo/redo à la place.

## UI : Boutons et feedback

### Boutons dans la sidebar

```
[Réinitialiser] [Exporter] [Importer] [Partager]

[↶ Undo] [↷ Redo]  ← nouveaux boutons
```

- **Undo** : disabled si `currentIndex === 0`
- **Redo** : disabled si `redoStack.length === 0`
- Icônes de flèche ou symboles classiques

### Feedback utilisateur

**Undo réussi** :
```
Snapshot mis à jour ; historique visible dans la sidebar
Pas de toast (discrétion) ; juste le changement visuel
```

**Undo impossible** :
```
Bouton disabled ; pas de bip ni message (UX standard)
```

**Redo impossible** :
```
Bouton disabled
```

**Après nouvelle commande** :
```
Bouton [Redo] devient disabled (redoStack vide)
Historique affiche la nouvelle commande
```

### Historique terminal

**Comportement xterm** : L'historique ↑/↓ du terminal reste séparé de undo/redo applicatif.
- Undo/redo **n'affecte pas** l'historique `↑` du terminal
- L'utilisateur peut faire undo, puis ↑ pour voir les anciennes commandes tapées

**Justification** : Deux axes indépendants :
- Terminal history = revenir à une commande tapée (pour la ré-exécuter, l'éditer)
- Undo/redo applicatif = revenir à un état de dépôt

## Interaction avec la persistance

### localStorage et undo/redo

**Décision Phase 7** : **Ne persister que `currentIndex`** (pas la pile complète), plutôt que tout l'historique détaillé.

```typescript
export interface PersistedUndoRedo {
  currentIndex: number;
  // commandHistory est retrouvée via savedCommands (déjà persisté)
  // redoStack est vide au reload (acceptable UX)
}
```

**Comportement au reload** :
1. Charger `savedCommands` depuis localStorage (spec 31)
2. Charger `currentIndex` (nouveau)
3. Si `currentIndex < savedCommands.length` → rejeu jusqu'à cet index
4. `redoStack = []` (redo history perdue, acceptable)

**Exemple** :
```
Session : 10 commandes, utilisateur a fait undo×2 (currentIndex = 8)
Reload → currentIndex restauré = 8 → rejeu jusqu'à la 8e commande
Snapshot reflète l'état après 8 commandes
redoStack vide (mais utilisateur peut continuer avec undo si besoin)
```

**Alternative considérée** : Persister toute la pile redo. Rejetée car complexe et rarement utile après reload.

### Interaction avec les scénarios

**Charger un scénario** : réinitialise undo/redo à l'état initial du scénario.

```typescript
function executeScenario(id: string) {
  clearHistory();
  reset();
  
  // Rejeu du scénario
  for (const cmd of scenario.commands) {
    engine.execute(cmd);
  }
  
  // Undo/redo réinitialisés
  currentIndex = scenario.commands.length;
  redoStack = [];
  commandHistory = scenario.commands;
}
```

### Interaction avec import/export

**Export** : Sauvegarde uniquement `commandHistory` (pas `currentIndex`). L'import restaure à la fin de l'historique.

```typescript
function exportSession() {
  // Exporte savedCommands (= commandHistory jusqu'à currentIndex)
  const session = {
    commands: commandHistory.slice(0, currentIndex),
    ...
  };
}

function importSession(session) {
  // Importe et rejoue
  commandHistory = session.commands;
  currentIndex = commandHistory.length;
  redoStack = [];
}
```

**Justification** : Un export capture un état ; l'import le restaure à ce point, sans "futures" commandes.

## Performance et optimisation

### Rejeu complet à chaque undo/redo

**Approche** : Rejouer depuis zéro (`new GitEngine()` + exécuter `commandHistory[0..N]`)

**Coût** :
- 10 commandes : < 10 ms (acceptable)
- 100 commandes : 100-200 ms (acceptable)
- 1000 commandes : 1-2 secondes (perceptible, mais rare)

**Optimisation future** : Cache des snapshots (optionnel Phase 8+)
```typescript
// Stockage de snapshots à intervalles (ex: tous les 10 commits)
snapshotCache: Map<number, RepoSnapshot>
```

Pour Phase 7, rejeu simple suffisant (moteur rapide, historique typique < 100 commandes).

### Limite de profondeur undo

**Décision** : Pas de limite. Le navigateur gère la mémoire (localStorage limite ~5-10 MB).

**Monitoring** : Optionnel (phase 8+) : avertir si `commandHistory.length > 1000`.

## Cas d'usage et exemples

### Cas 1 : Exploration sans crainte

```
Utilisateur fait 5 commits, puis dit "attends, et si j'avais une branche ?"
→ Undo×3 → état après 2e commit
→ branch feature
→ Continue de là
```

### Cas 2 : Tester une autre approche

```
Rebase interactif complexe → squash 5 commits
→ Undo (le rebase n'a pas marché comme prévu)
→ Réessaye différemment
```

### Cas 3 : Oops, fausse manipulation

```
git reset --hard HEAD~5 (oups !)
→ Undo immédiatement
→ Snapshot restauré avant le reset
```

## Critique et limites

### Pas de "selective undo"

L'undo/redo applicatif navigue par **index**, pas par commit individuel. Impossible d'annuler le 3e commit en gardant le 5e.

**Limitation acceptée** : Git lui-même ne le permet pas simplement (nécessite rebase interactif). L'outil suit une UI classique (piles undo/redo linéaires).

### Pas d'historique entre les commandes

Si l'utilisateur tape 3 commandes, puis clique dans la sidebar, puis tape une 4e commande : les trois premières et la quatrième sont dans `commandHistory` mais il n'y a pas d'état "intermédiaire" pour les naviguer individuellement.

**Clarification** : Undo/redo va par **commande saisie**, pas par keystroke ou clic. Une commande = une étape undo.

### Conflit merge/rebase non sauvegardable via undo

Si un undo laisse le dépôt dans un état conflictuel (opération en cours), puis l'utilisateur ferme l'onglet : au reload, l'opération en cours est reconstruite (localStorage persiste `operationState`), mais `redoStack` est perdu (acceptable).

## Critères d'acceptation

### CA-undo-01 : Undo après une commande

**Given**
- Utilisateur a exécuté : `git init`, `git add f1`, `git commit -m "test"`
- currentIndex = 3

**When**
- Clique bouton [Undo] ou Ctrl+Z

**Then**
- currentIndex = 2
- Snapshot reflète l'état après "add f1" uniquement
- Graphe affiche 0 commits (add avant commit)
- Bouton [Redo] devient enabled

### CA-undo-02 : Undo multiple

**Given**
- currentIndex = 3 (3 commandes)

**When**
- Clique [Undo] 3 fois (ou Ctrl+Z ×3)

**Then**
- currentIndex = 0
- Snapshot = boot vierge
- Graphe vide
- Bouton [Undo] disabled
- Bouton [Redo] enabled (redoStack = [1, 2, 3])

### CA-undo-03 : Undo impossible au boot

**Given**
- currentIndex = 0

**When**
- Clique bouton [Undo]

**Then**
- Aucun changement
- Bouton disabled (ou aucune action)
- Snapshot inchangé

### CA-undo-04 : Redo après undo

**Given**
- Après 3 commandes, utilisateur fait undo (currentIndex = 2, redoStack = [3])

**When**
- Clique bouton [Redo] ou Ctrl+Y

**Then**
- currentIndex = 3
- Snapshot restauré (3e commande rejouée)
- redoStack = [] (vide)
- Bouton [Redo] disabled

### CA-undo-05 : Redo multiple

**Given**
- currentIndex = 1, redoStack = [2, 3, 4]

**When**
- Clique [Redo] 3 fois

**Then**
- currentIndex = 4
- Snapshot = après 4 commandes
- redoStack = []

### CA-undo-06 : Redo impossible si pile vide

**Given**
- currentIndex = 3, redoStack = [] (pas eu d'undo)

**When**
- Clique [Redo]

**Then**
- Aucun changement
- Bouton disabled

### CA-undo-07 : Nouvelle commande tronque redo

**Given**
- currentIndex = 2, redoStack = [3, 4, 5] (après 2 undo depuis 5 commandes)

**When**
- Exécute une nouvelle commande : `git branch fix`

**Then**
- commandHistory = [cmd0, cmd1, cmd2, "branch fix"]
- currentIndex = 3 (fin)
- redoStack = [] (vidée)
- Les anciennes commandes 3, 4, 5 sont perdues

### CA-undo-08 : Rejeu déterministe

**Given**
- 5 commandes dans commandHistory
- currentIndex = 3, puis undo, puis redo

**When**
- Comparer snapshots avant undo et après redo

**Then**
- Snapshot identique (même commits, mêmes hashes)

### CA-undo-09 : Raccourci clavier Ctrl+Z

**Given**
- App en focus
- currentIndex > 0

**When**
- Utilisateur tape Ctrl+Z (ou Cmd+Z sur macOS)

**Then**
- Undo exécuté (pas de réponse du navigateur au Ctrl+Z)
- Snapshot mis à jour

### CA-undo-10 : Raccourci clavier Ctrl+Y / Cmd+Shift+Z

**Given**
- App en focus
- redoStack non vide

**When**
- Utilisateur tape Ctrl+Y (ou Cmd+Shift+Z)

**Then**
- Redo exécuté
- Snapshot mis à jour

### CA-undo-11 : Undo/redo indépendant du reflog

**Given**
- Utilisateur a rebased (reflog enregistre HEAD@{0}, HEAD@{1}, ...)
- Utilisateur fait undo (état applicatif avant rebase)

**When**
- Exécute `git reflog`

**Then**
- Reflog n'est PAS modifié par undo/redo applicatif
- Reflog reflète les vraies opérations executées (Git)
- Undo/redo applicatif est un wrapper UI (invisible au Git)

### CA-undo-12 : Historique terminal indépendant

**Given**
- Utilisateur a tapé 5 commandes (historique terminal = 5 entrées ↑/↓)
- Fait undo×2 (currentIndex = 3)

**When**
- Tape ↑ pour récupérer une ancienne commande

**Then**
- Historique terminal propose la 5e commande tapée (pas l'index undo)
- Undo/redo n'affecte pas l'historique du terminal

### CA-undo-13 : Persistance du currentIndex

**Given**
- Utilisateur exécute 5 commandes, puis undo×2 (currentIndex = 3)
- Reload la page

**When**
- App boot

**Then**
- localStorage restaure savedCommands (5 commandes)
- localStorage restaure currentIndex = 3
- Snapshot = état après 3 commandes
- redoStack = [] (pile vide acceptée)
- Utilisateur peut continuer undo ou redo

### CA-undo-14 : Bouton undo/redo dans sidebar

**Given**
- RefsSidebar montée
- currentIndex > 0

**When**
- Vérifie l'affichage

**Then**
- Bouton [Undo] visible et enabled
- Bouton [Redo] visible mais disabled (redoStack vide par défaut)
- Icônes claires (↶ ↷ ou équivalent)

### CA-undo-15 : Undo d'une opération en cours

**Given**
- Merge en cours (conflit non résolu, operationState != null)
- currentIndex = 5 (index du merge)

**When**
- Clique [Undo]

**Then**
- currentIndex = 4 (avant le merge)
- operationState = null (opération annulée via rejeu)
- Snapshot = avant merge
- Utilisateur peut continuer à partir d'avant le merge

### CA-undo-16 : État cohérent après undo/redo

**Given**
- Diverses opérations : init, commit, branch, merge, rebase

**When**
- Fait plusieurs undo/redo

**Then**
- Snapshot toujours cohérent (HEAD, branches, tags, index = états possibles)
- Aucun état corrompu ou incohérent
- Graphe affiche correctement chaque snapshot revisité

### CA-undo-17 : Undo après scenario

**Given**
- Utilisateur charge un scénario (10 commandes rejouées)
- currentIndex = 10

**When**
- Clique [Undo]

**Then**
- currentIndex = 9
- Snapshot après 9 commandes
- Comportement normal undo

### CA-undo-18 : Undo après import session

**Given**
- Utilisateur importe une session (fichier avec 8 commandes)
- currentIndex = 8

**When**
- Clique [Undo]

**Then**
- currentIndex = 7
- Snapshot après 7 commandes
- Undo fonctionne normalement sur session importée

## Implémentation : Points clés

1. **Store (repo.ts)** : Ajouter state + actions
   - `currentIndex: ref(0)`
   - `redoStack: ref<number[]>([])`
   - `undo()`, `redo()`, `rebuildState(targetIndex)`

2. **Utils** : Hooks/helpers pour le rejeu déterministe (potentiellement réutilisable)

3. **RefsSidebar.vue** : Boutons [Undo] [Redo]
   - Capturer clics
   - Disabled state selon currentIndex / redoStack
   - Appeler `store.undo()` / `store.redo()`

4. **App.vue** : Capturer raccourcis clavier
   - Keydown listener `Ctrl+Z` / `Cmd+Z` → undo
   - Keydown listener `Ctrl+Y` / `Cmd+Shift+Z` → redo
   - Prévenir default navigateur

5. **Storage** : Ajouter à la persiste localStorage
   - `currentIndex` sauvegardé avec `savedCommands`
   - Restauré au boot

## Dépendances inter-commandes

- Dépend du moteur **déterministe** (rejeu = même état)
- Complémente la **persistance** (spec 31) : currentIndex persisté
- Fonctionne avec **export/import** (spec 58) : importer → currentIndex = fin
- Fonctionne avec **liens partageables** (spec 59) : lien partagé = currentIndex au moment du partage

## Notes pour Phase 7+

- **Phase 7** : Undo/redo basique (rejeu simple)
- **Phase 8** : Optimisation (cache snapshots optionnel)
- **QA** : Tester undo/redo après chaque type d'opération (merge, rebase, stash, etc.)
- **UX Polish** : Animations de transition, transitions du graphe (spec B2)
