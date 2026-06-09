# Phase 7 : Éditeur de résolution de conflits (UI 3-way)

## Résumé

Lors d'une fusion (`git merge`) ou d'un rebase (`git rebase`) ayant généré des conflits, au lieu que l'utilisateur édite manuellement les marqueurs `<<<<<<< ======= >>>>>>>` via `write`, une **modale interactive 3-way** affiche visuellement les trois versions du fichier :
- **Ours** : la version locale (branche courante)
- **Theirs** : la version à fusionner (branche/commit en cours de merge/rebase)
- **Résultat** : l'arbre fusionné éditable

L'utilisateur choisit : garder ours, garder theirs, garder les deux, ou éditer manuellement. L'UI se charge du parsing/écriture des marqueurs ; l'affichage du conflit vit entièrement en `core/` (helper pur, testable headless).

**Cas d'usage** :
- Visualiser rapidement ce qui change dans chaque version
- Appliquer la résolution avec un clic (pas de saisie texte complexe)
- Gérer plusieurs fichiers en conflit avec une UI claire
- Fallback : édition manuelle du résultat si besoin

## Architecture

### Frontière core ↔ UI

**Core (`src/core/`)**

Helper pur `parseConflictContent(fileContent: string): ConflictSection[]` :
- Parse un contenu contenant les marqueurs `<<<<<<< ======= >>>>>>>`
- Retourne une liste de sections de conflit structurées
- Chaque section contient : `{ ours: string; theirs: string; separator?: { start: number; end: number } }`
- La première section pré-conflit (avant `<<<<<<<`) et les sections post-conflit (après `>>>>>>>`) sont ignorées (du contenu pur)

Helper pur `buildResolvedContent(ours: string, theirs: string, choice: 'ours' | 'theirs' | 'both' | 'manual', manualEdits?: string): string` :
- Construit le contenu résolu selon le choix de l'utilisateur
- Supprime les marqueurs
- Retourne une chaîne prête à `write`

**UI (`src/components/`)**

Composant **`ConflictEditorModal.vue`** :
- Affiche quand `snapshot.operationState.type === 'merging'` ou `'rebasing'` ET fichiers en conflit
- Liste les fichiers en conflit (avec case `filesInConflict` > 1)
- Pour chaque fichier (ou le fichier courant sélectionné) :
  - Affiche un panneau 3-way (trois colonnes : ours | theirs | résultat)
  - Boutons d'action : « Garder ours », « Garder theirs », « Garder les deux », « Éditer »
  - L'utilisateur clique → appelle `buildResolvedContent(...)` dans le store (logique pure)
  - Le résultat est **prévisualisé** dans la colonne « Résultat »
  - Bouton « Marquer résolu » → `store.execute('add <file>')` (stage le fichier)
  - Après tous les fichiers résolus → « Continuer » → `store.execute('<merge|rebase> --continue')`

### Snapshot enrichi (ce que l'UI consomme)

```typescript
interface RepoSnapshot {
  // ... existant
  operationState?: {
    type: 'merging' | 'rebasing' | ...;
    filesInConflict?: Array<{
      path: string;
      status: 'unresolved' | 'resolved'; // pour tracker l'avancement
      ours?: string;     // contenu optionnel (pré-parsé) — peut être null si gros fichier
      theirs?: string;
    }>;
    conflictingFileIndex?: number; // fichier courant en cours d'édition (0-based)
  };
}
```

**Alternative plus légère** (si pas de pré-parsing) :
- Exposer juste `filesInConflict: string[]` (noms de fichiers)
- La modale appelle `store.readFile(path)` pour récupérer le contenu (via un helper moteur)
- Le parsing se fait côté UI (ou dans le helper core `parseConflictContent`)

### Contrat moteur

**Nouveau helper dans `src/core/repository.ts`** :

```typescript
/**
 * Parse un contenu fichier contenant les marqueurs de conflit.
 * Retourne une liste de "sections de conflit" avec ours/theirs.
 */
export function parseConflictContent(content: string): ConflictSection[] {
  // Pattern: <<<<<<< ... ======= ... >>>>>>>
  // Retourner tableau { ours, theirs, separator }
}

export interface ConflictSection {
  ours: string;
  theirs: string;
  separator?: { startLine: number; endLine: number }; // pour info/debug
}

/**
 * Construit un contenu résolu à partir d'ours/theirs et d'un choix.
 */
export function buildResolvedContent(
  ours: string,
  theirs: string,
  choice: 'ours' | 'theirs' | 'both' | 'manual',
  manualContent?: string
): string {
  // choice === 'ours' → retourner ours
  // choice === 'theirs' → retourner theirs
  // choice === 'both' → retourner ours + '\n' + theirs (ou autre)
  // choice === 'manual' → retourner manualContent (user-provided)
}
```

**Lectures de fichier** : ajouter un helper public `readFile(path: string): string` au moteur pour que l'UI puisse récupérer le contenu complet (même volumineux) sans re-stocker dans le snapshot.

### Gestion multi-fichiers

**UI workflow** :

1. Au lancement (détection `operationState.merging`), afficher modale avec **liste des fichiers en conflit**
2. Sélectionner un fichier → afficher le panneau 3-way pour ce fichier
3. Appliquer une résolution (« Garder ours », etc.) → 
   - Appel `store.resolveConflict(filePath, choice, manualEdits?)`
   - Marquage interne : fichier passe à `resolved`
   - Appel auto `store.execute('add <filePath>')` (stage)
4. Affichage du prochain fichier non-résolu OU message "Tous les conflits sont résolus"
5. Bouton « Continuer la fusion » → `store.execute('merge --continue')`

**Fallback** : si utilisateur clique « Éditer », afficher un textarea pour édition manuelle du contenu résolu.

## Flux d'utilisation

### Cas 1 : Conflit simple (1 fichier, 1 section)

**Utilisateur a exécuté** `git merge feature` créant un conflit

**État du snapshot** :
```
operationState.type === 'merging'
operationState.filesInConflict === ['data.txt']
```

**Modale affichée** :
```
┌─────────────────────────────────────────────────┐
│ Résolution de conflits (1/1)                    │
│ Fichier: data.txt                               │
├─────────────────────────────────────────────────┤
│ [OURS] (main)  │ [THEIRS] (feature) │ [RESULT] │
│ line 1         │ line 1              │ line 1  │
│ main edit      │ feature edit        │ <edit>  │
├─────────────────────────────────────────────────┤
│ [Garder ours] [Garder theirs] [Garder les deux] │
│ [Éditer manuellement]                           │
├─────────────────────────────────────────────────┤
│ [Marquer résolu] [Continuer fusion]             │
└─────────────────────────────────────────────────┘
```

**Utilisateur clique « Garder ours »** :
- `buildResolvedContent("main edit", "feature edit", "ours")` → `"main edit"`
- Colonne « RESULT » affiche « main edit »
- Prévisualisation
- Utilisateur clique « Marquer résolu » → `git add data.txt`, fichier marqué `resolved`
- Bouton « Continuer fusion » accessible
- Utilisateur clique → `git merge --continue`, résultat : merge réussi

### Cas 2 : Multi-fichiers (2 fichiers en conflit)

**État du snapshot** :
```
operationState.filesInConflict === ['a.txt', 'b.txt']
```

**Workflow** :

1. Modale : affiche liste [a.txt, b.txt]
2. Utilisateur sélectionne `a.txt` → affiche panneau 3-way
3. Applique « Garder les deux » → `'ours' + '\n' + 'theirs'` affiché dans RESULT
4. Clique « Marquer résolu » → `git add a.txt`, UI passe au prochain fichier
5. Affiche panneau pour `b.txt`
6. Applique une résolution
7. Clique « Marquer résolu » → `git add b.txt`
8. Message : "Tous les conflits résolus"
9. Bouton « Continuer fusion »

### Cas 3 : Édition manuelle

**Utilisateur a** résolu partiellement (ex. garder ours) mais veut ajuster

**Utilisateur clique « Éditer manuellement »** :
- Modale affiche textarea avec contenu courant (RESULT)
- Utilisateur tape des changements
- Clique « Appliquer » → `buildResolvedContent(..., 'manual', userEdits)` → contenu final
- Continue au fichier suivant

### Cas 4 : Rebase avec conflit

**Utilisateur a exécuté** `git rebase main` avec conflit

**État du snapshot** :
```
operationState.type === 'rebasing'
operationState.filesInConflict === ['src/app.ts']
```

**Workflow** : identique (modale 3-way), puis « Continuer » → `git rebase --continue`

## Parsing du conflit (helper core)

### Format Git standard

```
<<<<<<< HEAD:file.txt
local version
=======
remote version
>>>>>>> feature:file.txt
```

**Limitations en Phase 6** :
- Un seul conflit par fichier (pas de multiples sections `<<<<<<<` dans un même fichier)
- Délimiteurs : `<<<<<<<` (7 `<`), `=======`, `>>>>>>>` (7 `>`)
- Séparateurs : ignorés (ne pas les afficher)

**Helper `parseConflictContent(content)`** :

```typescript
export function parseConflictContent(content: string): ConflictSection[] {
  const lines = content.split('\n');
  const sections: ConflictSection[] = [];
  let i = 0;
  let currentOurs = '';
  let currentTheirs = '';
  let inConflict = false;
  let inOurs = false;

  while (i < lines.length) {
    const line = lines[i];
    
    if (line.startsWith('<<<<<<<')) {
      inConflict = true;
      inOurs = true;
      i++;
      continue;
    }
    
    if (line.startsWith('=======') && inConflict) {
      inOurs = false;
      i++;
      continue;
    }
    
    if (line.startsWith('>>>>>>>') && inConflict) {
      inConflict = false;
      sections.push({ ours: currentOurs.trimEnd(), theirs: currentTheirs.trimEnd() });
      currentOurs = '';
      currentTheirs = '';
      i++;
      continue;
    }
    
    if (inConflict) {
      if (inOurs) {
        currentOurs += line + '\n';
      } else {
        currentTheirs += line + '\n';
      }
    }
    
    i++;
  }
  
  return sections;
}
```

**Cas limites** :
- Contenu sans conflit : retourner `[]` (pas de section)
- Délimiteurs multi-lignes : non supportés (Git les genère sur une seule ligne)
- Encodages non-UTF8 : on considère les fichiers UTF-8

## Modèle de données

### Snapshot enrichi (option complète)

```typescript
interface RepoSnapshot {
  // ... existant
  operationState?: {
    type: 'merging' | 'rebasing' | 'cherry-picking' | 'reverting';
    sourceBranch?: string;
    filesInConflict?: Array<{
      path: string;
      status: 'unresolved' | 'resolved';
      // Optionnel : pré-parsing pour gros fichiers
      conflictSections?: ConflictSection[];
    }>;
    conflictingFileIndex?: number;
  };
}

interface ConflictSection {
  ours: string;
  theirs: string;
}
```

### Store action

```typescript
// Dans stores/repo.ts
async resolveConflict(
  filePath: string,
  choice: 'ours' | 'theirs' | 'both' | 'manual',
  manualContent?: string
): Promise<CommandResult> {
  // 1. Récupérer le contenu du fichier
  const content = this.engine.readFile(filePath);
  
  // 2. Parser les sections de conflit
  const sections = parseConflictContent(content);
  
  // 3. Construire le contenu résolu
  const resolved = buildResolvedContent(
    sections[0].ours,
    sections[0].theirs,
    choice,
    manualContent
  );
  
  // 4. Écrire le fichier résolu
  const writeResult = this.execute(`write ${filePath} "${escaped(resolved)}"`);
  
  // 5. Stage le fichier
  const addResult = this.execute(`add ${filePath}`);
  
  // 6. Mettre à jour snapshot.operationState.filesInConflict[...].status = 'resolved'
  
  return writeResult;
}
```

## Cas d'erreur

### Fichier ne contient pas de marqueurs de conflit

**Condition** : `parseConflictContent` appelé sur un fichier sans `<<<<<<<`

**Comportement** : retourner `[]` (pas d'erreur) ; l'UI affiche un message « Pas de conflit détecté »

### Contenu vide ou très gros

**Condition** : Fichier géant (> 100 KB) ou vide

**Comportement** :
- Vide : afficher sections vides (`ours === ''`, `theirs === ''`)
- Gros : le helper `readFile` le retourne tel quel ; UI doit gérer le rendu (virtualisation optionnelle)

### Plusieurs sections de conflit dans un fichier

**Condition** : Fichier contient 2+ blocs `<<<<<<< ... ======= ... >>>>>>>`

**Phase 7 décision** : retourner toutes les sections, afficher un message "Plusieurs conflits dans ce fichier" et permettre à l'utilisateur de les résoudre dans une boucle (UI : afficher la 1ère section, bouton « Suivant » après résolution)

## Critères d'acceptation

### CA-conflict-editor-01 : Modale affichée lors d'un merge avec conflit

**Given**
- Dépôt avec branches main et feature divergentes
- Merge en cours avec conflit

**When**
- `snapshot.operationState.type === 'merging'` et `filesInConflict.length > 0`

**Then**
- `ConflictEditorModal.vue` est affichée
- Titre affiche « Résolution de conflits »
- Liste des fichiers en conflit visible

### CA-conflict-editor-02 : Parsing conflit simple

**Given**
- Fichier avec contenu :
  ```
  line 1
  <<<<<<< HEAD
  ours edit
  =======
  theirs edit
  >>>>>>>
  line 2
  ```

**When**
- `parseConflictContent(content)` exécuté

**Then**
- Retourne `[{ ours: "ours edit", theirs: "theirs edit" }]`
- Délimiteurs non inclus

### CA-conflict-editor-03 : Affichage 3-way

**Given**
- Modale affichée pour un fichier en conflit

**When**
- UI rend le panneau 3-way

**Then**
- Colonne OURS affiche le contenu local
- Colonne THEIRS affiche le contenu à fusionner
- Colonne RESULT vide ou prévisualisation selon sélection

### CA-conflict-editor-04 : Action « Garder ours »

**Given**
- Panneau 3-way affiché
- Sections de conflit : `ours = "local"`, `theirs = "remote"`

**When**
- Utilisateur clique « Garder ours »

**Then**
- RESULT affiche « local »
- `buildResolvedContent("local", "remote", "ours")` retourne « local »

### CA-conflict-editor-05 : Action « Garder theirs »

**Given**
- Panneau 3-way affiché

**When**
- Utilisateur clique « Garder theirs »

**Then**
- RESULT affiche « remote »
- `buildResolvedContent(...)` retourne « remote »

### CA-conflict-editor-06 : Action « Garder les deux »

**Given**
- Panneau 3-way affiché
- Ours = "A", Theirs = "B"

**When**
- Utilisateur clique « Garder les deux »

**Then**
- RESULT affiche « A » suivi de « B »
- `buildResolvedContent("A", "B", "both")` retourne « A\nB »

### CA-conflict-editor-07 : Marquer résolu (add fichier)

**Given**
- Résolution appliquée (ex. garder ours)

**When**
- Utilisateur clique « Marquer résolu »

**Then**
- `store.execute('add <filePath>')` appelé
- Fichier passé à `status: 'resolved'` dans le snapshot
- Modale passe au fichier suivant (si multi-fichiers)

### CA-conflict-editor-08 : Multi-fichiers

**Given**
- 2 fichiers en conflit : a.txt, b.txt

**When**
- Utilisateur résout a.txt, clique « Marquer résolu »

**Then**
- UI affiche le panneau pour b.txt
- a.txt marqué `resolved`
- Bouton « Continuer » désactivé jusqu'à résolution complète

### CA-conflict-editor-09 : Édition manuelle

**Given**
- Résolution appliquée, utilisateur veut ajuster

**When**
- Utilisateur clique « Éditer manuellement »

**Then**
- Modale affiche textarea avec contenu courant (RESULT)
- Utilisateur peut taper/modifier
- Clique « Appliquer » → contenu éditée devient résolu

### CA-conflict-editor-10 : Continuer après résolution

**Given**
- Tous les fichiers résolus et stagés

**When**
- Utilisateur clique « Continuer la fusion »

**Then**
- `store.execute('merge --continue')` (ou `rebase --continue` si rebase)
- Merge/rebase s'achève (succès ou nouveau conflit)
- Modale fermée si succès

### CA-conflict-editor-11 : Rebase avec conflit

**Given**
- Rebase en cours avec conflit

**When**
- `snapshot.operationState.type === 'rebasing'` et `filesInConflict.length > 0`

**Then**
- Modale affichée (identique au merge)
- Bouton « Continuer » appelle `rebase --continue`

### CA-conflict-editor-12 : Aucun fichier ne contient conflit

**Given**
- Merge marqué comme ayant conflit, mais fichier parsé retourne `[]`

**When**
- Modale affiche le fichier

**Then**
- Affiche message « Pas de conflit détecté »
- Bouton pour passer au fichier suivant

### CA-conflict-editor-13 : Plusieurs sections de conflit (optionnel Phase 7)

**Given**
- Fichier avec 2 blocs `<<<<<<<` distincts

**When**
- `parseConflictContent` exécuté

**Then**
- Retourne array de 2 sections
- UI affiche message « 2 conflits dans ce fichier »
- Permet résolution séquentielle (section 1, puis section 2)

## Implémentation : Points clés

1. **Helper pur core** : `parseConflictContent`, `buildResolvedContent` testables headless
2. **Modale Vue** : aucune logique Git, juste rendu et appels store
3. **Lecture fichier** : ajouter `readFile(path)` public au moteur (wrapper autour de la gestion interne WT)
4. **Multi-fichiers** : boucle simple, fichier courant suivi via index
5. **Fallback manuel** : textarea pour cas complexes

## Dépendances inter-commandes

- Dépend de **Phase 4** : merge, rebase, cherry-pick (génération des conflits)
- Dépend de **Phase 5** : rebase interactif (gestion interactive existante)
- Utilisée par **scénarios Phase 6** : ex. scénario « Conflit de Merge »

## Notes pour Phase 7+

- **Phase 8** : Ajouter visuels avancés (coloration syntaxe par section, minimap des conflits)
- **Phase 9** : Animation de la résolution (transition visuelles)
- **Internationalisation** : boutons/messages traduits en anglais (pour accessibilité)
- **Accessibilité** : ARIA labels, navigation clavier (Tab entre sections)
