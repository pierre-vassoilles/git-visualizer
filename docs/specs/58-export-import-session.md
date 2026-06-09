# Phase 7 : Export / import de session

## Résumé

L'utilisateur peut exporter sa session actuelle (historique de commandes rejouées) en fichier JSON téléchargeable, et importer un tel fichier pour restaurer la session. Format réutilise le versioning de `storage.ts` pour garantir la compatibilité et la robustesse. Le rejeu est déterministe : une session exporte une liste de commandes, son import les rejoue exactement.

**Principes** :
- Exporter = sérialiser `savedCommands` + métadonnées en JSON
- Importer = lire le JSON, valider, puis reset + rejeu déterministe
- Format versionnée (cohérent avec `storage.ts` 1.0)
- Gestion robuste : fichier corrompu/incompatible → erreur utilisateur claire
- UX simple : boutons Exporter / Importer dans la sidebar

## Export : Fichier et format

### Structure du fichier exporté

```typescript
export interface ExportedSession {
  /** Version du format (ex: "1.0"). */
  version: string;
  /** Metadata. */
  metadata: {
    exportDate: number;        // Date d'export (Date.now())
    exportUrl: string;         // URL de l'app à la date d'export (ex: "git-visualizer:phase7")
    commandCount: number;      // Nombre de commandes
    description?: string;      // Optionnel : description saisie par l'utilisateur
  };
  /** Liste des commandes réussies. */
  commands: string[];
}

// Exemple :
{
  "version": "1.0",
  "metadata": {
    "exportDate": 1718017200000,
    "exportUrl": "git-visualizer:phase7",
    "commandCount": 7,
    "description": "Mon premier rebase interactif"
  },
  "commands": [
    "init",
    "add file1.txt",
    "commit -m \"Initial commit\"",
    "branch feature",
    "checkout feature",
    "add file2.txt",
    "commit -m \"Feature work\""
  ]
}
```

### Fichier téléchargeable

- **Nom** : `git-visualizer-<timestamp>.json`
  - Exemple : `git-visualizer-1718017200000.json`
- **Type MIME** : `application/json`
- **Encodage** : UTF-8
- **Téléchargement** : Navigateur standard (pas de serveur)

### Métadonnées

| Champ | Type | Obligatoire | Note |
|-------|------|-------------|------|
| `exportDate` | number | Oui | `Date.now()` |
| `exportUrl` | string | Oui | Chaîne fixe pour le debug (ex: "git-visualizer:phase7") |
| `commandCount` | number | Oui | Longueur de `commands` (redondante, pour validation) |
| `description` | string | Non | Saisi optionnellement par l'utilisateur lors de l'export |

## Import : Restauration de session

### Workflow utilisateur

1. Utilisateur clique bouton "Importer" dans la sidebar
2. Sélectionne un fichier JSON (dialog fichier native)
3. Si valide : reset + rejeu silencieux ; snapshot rafraîchit
4. Si erreur : affiche message utilisateur clair

### Validation du fichier

**Étapes** :

1. Lire le fichier (JavaScript FileReader API)
2. Parser JSON → si invalide, rejeter
3. Valider le schéma :
   - Champs obligatoires : `version`, `metadata`, `commands`
   - `metadata` doit contenir : `exportDate`, `exportUrl`, `commandCount`
   - `commands` doit être un tableau de chaînes
4. Valider la version majeure (compatibilité)
5. Vérifier que `commandCount === commands.length` (intégrité)
6. Si validation réussit → **reset + rejeu** ; sinon → **erreur utilisateur**

### Rejeu après import

```typescript
// Pseudo-code store (repo.ts)

function importSession(session: ExportedSession) {
  // 1. Valider le fichier (voir CA-export-import-*)
  // 2. Reset propre
  clearHistory();
  reset();
  
  // 3. Rejouer les commandes dans le nouvel engine
  const replayed: string[] = [];
  for (const cmd of session.commands) {
    const result = engine.value.execute(cmd);
    if (result.exitCode !== 0 && engine.snapshot().operationState == null) {
      // Erreur réelle → arrêt du rejeu (rare : les exports sont issus de sessions valides)
      console.error(`Import: command failed: ${cmd}`);
      break;
    }
    replayed.push(cmd);
  }
  
  // 4. Reconstituer l'état réactif
  savedCommands.value = replayed;
  saveHistory(replayed);  // Persister la session importée
  snapshot.value = engine.value.snapshot();
}
```

## Gestion des erreurs

### Fichier corrompu (JSON invalide)

**Cas** : JSON mal formé (accolade manquante, etc.)

**Gestion** :
```
Erreur utilisateur : "Le fichier est corrompu (JSON invalide)."
```

Pas de reset (l'utilisateur peut réessayer sans perdre sa session courante).

### Format incompatible

**Cas** : `version: "2.0"` (future version)

**Gestion** :
```
Erreur utilisateur : "Version du fichier incompatible (2.0 non supportée). 
Veuillez mettre à jour l'application."
```

### Schéma invalide

**Cas** : Champs manquants, mauvais type (ex: `commands` n'est pas un tableau)

**Gestion** :
```
Erreur utilisateur : "Le fichier n'a pas le bon format. 
Assurez-vous qu'il a été exporté par Git Visualizer."
```

### Intégrité : commandCount ne correspond pas

**Cas** : `metadata.commandCount === 5` mais `commands.length === 4`

**Gestion** :
```
Erreur utilisateur : "Intégrité du fichier compromise (nombre de commandes incohérent)."
```

### Rejeu partiel (commande invalide post-import)

**Cas** : Une commande dans le fichier échoue lors du rejeu

**Gestion** :
- Arrêt du rejeu (comme `loadFromStorage()`)
- Message informatif : `"Session restaurée partiellement (erreur à la commande N)."`
- Snapshot reflète l'état avant l'erreur
- L'utilisateur peut continuer ou reset

**Remarque** : Ce cas est rare (les fichiers exportés proviennent de sessions valides) ; le moteur est déterministe, donc il reproduira le même succès.

## UX et intégration

### Boutons et interaction

**Sidebar (`RefsSidebar.vue`)** :

```
Commandes récentes
  > git checkout main
  > ...
  
  [Réinitialiser] [Exporter] [Importer]
```

- **Exporter** : bouton → dialog (optionnel : textbox description) → téléchargement
- **Importer** : bouton → file input (accept=".json") → validation + rejeu
- **Réinitialiser** : bouton existant, reste inchangé

### Messages utilisateur

**Succès export** :
```
✓ Session exportée en "git-visualizer-<date>.json"
```
(Auto-disparaît après 3 secondes, ou dismissable)

**Succès import** :
```
✓ Session importée. (N commandes rejouées)
```

**Erreur import** :
```
✗ Erreur : <message détaillé>
```

## Format comparé à localStorage

| Aspect | localStorage (`storage.ts`) | Export/Import |
|--------|-----|---|
| Clé | `"git-visualizer:history"` | Fichier disque |
| Portée | Local au navigateur | Shareable (voir spec 59) |
| Durée | Persiste entre reloads | Archive disque |
| Version | 1.0 | 1.0 (idem) |
| Métadonnées | Minimales (lastSaved) | Riches (description, exportUrl) |
| Corruption | Auto-nettoyage | Erreur utilisateur |
| Cas d'usage | Persistence automatique | Sauvegarde explicite + partage (spec 59) |

## Critères d'acceptation

### CA-export-import-01 : Export crée un fichier JSON valide

**Given**
- Utilisateur a exécuté : `git init`, `git add f1.txt`, `git commit -m "test"`
- savedCommands contient 3 commandes

**When**
- Clique sur bouton "Exporter"
- Valide le dialog (optionnel : ajoute description)

**Then**
- Un fichier JSON est téléchargé (navigateur)
- Nom : `git-visualizer-<timestamp>.json`
- Contenu JSON valide
- Champ `version === "1.0"`
- Champ `commands.length === 3`
- Champ `metadata.commandCount === 3`

### CA-export-import-02 : Export encode correctement les commandes

**Given**
- Commande complexe : `git commit -m "Message avec espaces et quotes"`
- savedCommands la contient

**When**
- Export

**Then**
- JSON contient la commande intacte (pas d'échappement corrompu)
- Reimport rejoue la même commande

### CA-export-import-03 : Import valide un JSON corrompu

**Given**
- Utilisateur sélectionne un fichier JSON invalide (accolade manquante)

**When**
- Clique "Importer", sélectionne le fichier

**Then**
- Erreur affichée : "Le fichier est corrompu (JSON invalide)."
- Session courante inchangée (pas de reset)

### CA-export-import-04 : Import rejette version incompatible

**Given**
- Fichier JSON avec `version: "99.0"`

**When**
- Importe

**Then**
- Erreur : "Version du fichier incompatible (99.0 non supportée)."
- Session courante inchangée

### CA-export-import-05 : Import valide le schéma

**Given**
- Fichier JSON valide en structure mais manque le champ `commands`

**When**
- Importe

**Then**
- Erreur : "Le fichier n'a pas le bon format."
- Session courante inchangée

### CA-export-import-06 : Import vérifie commandCount

**Given**
- Fichier JSON avec `metadata.commandCount: 5` mais `commands.length: 4`

**When**
- Importe

**Then**
- Erreur : "Intégrité du fichier compromise (nombre de commandes incohérent)."
- Session courante inchangée

### CA-export-import-07 : Import rejeu déterministe

**Given**
- Fichier exporté d'une session valide (3 commits + 1 branche)

**When**
- Reset à zéro
- Importe le fichier

**Then**
- Snapshot après rejeu == snapshot avant export
- Mêmes commits, mêmes branches, mêmes hashes
- aucune différence due à aléatoire/date

### CA-export-import-08 : Import échoue silencieusement sur commande invalide

**Given**
- Fichier contient : `["init", "add f1", "invalid_cmd", "commit -m test"]`

**When**
- Importe

**Then**
- Rejeu : "init" succès → "add f1" succès → "invalid_cmd" échoue → arrêt
- Snapshot reflète l'état après "add f1"
- Message : "Session restaurée partiellement (erreur à la commande 3)."

### CA-export-import-09 : Export inclut description optionnelle

**Given**
- Utilisateur exporte et saisit description : "Mon rebase interactif"

**When**
- Export

**Then**
- Champ `metadata.description === "Mon rebase interactif"`

### CA-export-import-10 : Export déterministe

**Given**
- Deux exports consécutifs de la même session

**When**
- Compare les fichiers JSON (sans timestamps)

**Then**
- Champs identiques sauf `exportDate` (la seule partie non-déterministe)
- Mêmes commandes, même ordre

### CA-export-import-11 : Import + export roundtrip

**Given**
- Session A exportée en fichier
- Importe le fichier dans une nouvelle session B
- Exporte B en nouveau fichier

**When**
- Compare les deux fichiers

**Then**
- Commandes identiques
- Les métadonnées (exportDate) peuvent différer, mais c'est attendu

### CA-export-import-12 : Export sauvegarde aussi dans localStorage

**Given**
- Utilisateur importe une session depuis un fichier

**When**
- Import réussit

**Then**
- localStorage est mis à jour (clé "git-visualizer:history")
- Si utilisateur recharge la page sans exporter, la session importée est reconstruite

### CA-export-import-13 : Message de succès import

**Given**
- Import de fichier valide avec 10 commandes

**When**
- Rejeu réussit

**Then**
- Message : "✓ Session importée. (10 commandes rejouées)"

### CA-export-import-14 : File input accepte uniquement .json

**Given**
- Dialog importer ouvert

**When**
- Vérifie l'attribut du file input

**Then**
- `accept=".json"` défini
- Filtre fichiers par extension (UX)
- Utilisateur peut forcer un autre type (toujours valider le contenu)

### CA-export-import-15 : Export disabled si aucune commande

**Given**
- Utilisateur vient de démarrer (aucune commande exécutée)
- snapshot.commits.length === 0

**When**
- Regarde le bouton "Exporter"

**Then**
- Bouton disabled (ou masqué)
- Tooltip optionnel : "Exécute des commandes pour exporter"

## Implémentation : Points clés

1. **Store (repo.ts)** : Ajouter action `exportSession(description?: string): Blob` et `importSession(file: File): Promise<void>`
   - Export : sérialise `savedCommands` + metadata
   - Import : lit file, valide, reset, rejeu

2. **UI (RefsSidebar.vue)** : Boutons Exporter / Importer
   - Export : simple, peut afficher dialog saisie description (optionnel)
   - Import : file input, validation visuelle, message feedback

3. **Utilities** : `src/utils/export-import.ts`
   - `validateExportedSession(data: unknown): ExportedSession | null`
   - Helper pour le parsing/validation robuste

4. **Fichier** : Téléchargement navigateur standard (Blob + anchor tag)

## Dépendances inter-commandes

- Réutilise le format `storage.ts` (version 1.0)
- Dépend du rejeu déterministe (core moteur)
- Utilisée par **spec 59 (liens partageables)** : liens partagés encodent une `ExportedSession`

## Notes pour Phase 7+

- **Phase 7** : Export/import basique
- **Phase 8** : Intégration shareable (spec 59)
- **Cleanup** : Compresser le fichier JSON avant téléchargement (gzip) si le fichier est gros
- **Cloud** : Optionnel (backend) pour stockage persistant en serveur
