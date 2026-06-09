# Phase 6 : Catalogue de commandes (pour autocomplétion)

## Résumé

Le cœur du moteur (`src/core/`) doit exposer une source de vérité programmatique listant toutes les commandes implémentées, leurs flags/options supportées, et des métadonnées basiques (description courte, catégorie). Cette donnée est **pure** (pas d'imports Vue) et testable headless. L'UI (autocomplétion, aide dynamique) la consomme sans dupliquer ou hardcoder la liste.

**Principes** :
- Centraliser la définition des commandes (une seule place où ajuster une commande)
- Aucune connaissance Git dans l'UI (décisions sur les flags, syntaxe vivent dans le core)
- Contrat stable et versionnable

## Spécification du catalogue

### Structure de données

Le catalogue est un export pur du module `src/core/` (ex. `src/core/catalog.ts` ou intégré dans `src/core/engine.ts`).

```typescript
export interface CommandMetadata {
  /** Nom de la commande (ex: "commit", "branch") */
  name: string;
  /** Description courte (1 ligne, ex: "Créer un commit") */
  description: string;
  /** Catégorie (ex: "Commits", "Branches") */
  category: string;
  /** Flags et options supportées */
  flags: Flag[];
}

export interface Flag {
  /** Nom du flag (ex: "-m", "--soft") */
  name: string;
  /** True si le flag accepte un argument (ex: -m <message>) */
  hasArgument: boolean;
  /** Description courte du flag */
  description: string;
  /** True si le flag est couramment utilisé / recommandé */
  isCommon: boolean;
}

export interface CommandCatalog {
  /** Version du catalogue (pour versionning) */
  version: string;
  /** Commandes groupées par catégorie */
  commands: Record<string, CommandMetadata[]>;
  /** Map plate : nom → CommandMetadata (pour lookup rapide) */
  lookup: Record<string, CommandMetadata>;
}
```

### Exemple de catalogue

```typescript
export const COMMAND_CATALOG: CommandCatalog = {
  version: "1.0",
  commands: {
    "Initialisation & Configuration": [
      {
        name: "init",
        description: "Initialiser un dépôt Git vierge",
        category: "Initialisation & Configuration",
        flags: [],
      },
    ],
    "Fichiers & Index": [
      {
        name: "add",
        description: "Ajouter des fichiers à l'index",
        category: "Fichiers & Index",
        flags: [
          { name: "-A", hasArgument: false, description: "Ajouter tous les fichiers", isCommon: true },
          { name: "--all", hasArgument: false, description: "Alias de -A", isCommon: false },
          { name: "<pathspec>", hasArgument: false, description: "Chemins spécifiques", isCommon: true },
        ],
      },
      {
        name: "status",
        description: "Afficher l'état du dépôt",
        category: "Fichiers & Index",
        flags: [
          { name: "-s", hasArgument: false, description: "Format court", isCommon: true },
          { name: "--short", hasArgument: false, description: "Alias de -s", isCommon: false },
        ],
      },
      // ... autres commandes
    ],
    "Commits": [
      {
        name: "commit",
        description: "Créer un commit avec les fichiers stagés",
        category: "Commits",
        flags: [
          { name: "-m", hasArgument: true, description: "Message du commit", isCommon: true },
          { name: "--message", hasArgument: true, description: "Alias de -m", isCommon: false },
        ],
      },
      // ...
    ],
    // ... autres catégories
  },
  lookup: {
    "init": { name: "init", ... },
    "add": { name: "add", ... },
    "commit": { name: "commit", ... },
    // ...
  },
};

// Export d'une fonction helper pour obtenir le catalogue
export function getCommandCatalog(): CommandCatalog {
  return COMMAND_CATALOG;
}

// Export pour l'autocomplétion : liste des noms de commandes
export function getCommandNames(): string[] {
  return Object.keys(COMMAND_CATALOG.lookup).sort();
}

// Export pour lookup : commande → flags
export function getCommandFlags(commandName: string): Flag[] {
  return COMMAND_CATALOG.lookup[commandName]?.flags ?? [];
}
```

### Contenu du catalogue (Phase 6)

Le catalogue doit couvrir TOUTES les commandes implémentées à la fin de la Phase 5 :

| Commande | Catégorie | Flags à lister |
|----------|-----------|----------------|
| init | Initialisation & Configuration | (aucun en Phase 1) |
| add | Fichiers & Index | `-A`, `--all`, `<pathspec>` |
| status | Fichiers & Index | `-s`, `--short` |
| restore | Fichiers & Index | `--staged`, `--source=<commit>`, `<pathspec>` |
| write | Fichiers & Index | `<path>`, `<content>` (utilitaire) |
| read | Fichiers & Index | `<path>` (utilitaire) |
| commit | Commits | `-m <message>` |
| log | Commits | `[<ref>]` (optionnel) |
| branch | Branches | `-d`, `-D`, `[<branchname>]` |
| checkout | Branches | `-b`, `<branch/commit>`, `-` |
| switch | Branches | `-c`, `--detach`, `<branch>`, `-` |
| tag | Branches | `-d`, `<tagname>`, `<commit>` |
| merge | Fusion & Réécriture | `--no-ff`, `-m <message>`, `--abort`, `<branchname>` |
| reset | Fusion & Réécriture | `--soft`, `--mixed`, `--hard`, `<ref>` |
| revert | Fusion & Réécriture | `<commit>` |
| cherry-pick | Fusion & Réécriture | `--continue`, `--abort`, `<commit>` |
| rebase | Fusion & Réécriture | `-i`, `--continue`, `--abort`, `<base>` |
| stash | Outils avancés | `push`, `list`, `pop`, `apply`, `drop`, `<index>` |
| reflog | Outils avancés | `show`, `[<ref>]` |
| help | Aide | `[<commande>]` |

### Contrat pour l'autocomplétion (Fonctionnalité C)

L'UI appelle :
- `engine.getCommandNames()` : liste des noms de commandes
- `engine.getCommandFlags(name)` : liste des flags pour une commande
- `engine.getCatalog()` : le catalogue complet (optionnel, pour affichage riche)

La source de vérité reste dans `core/` ; aucune duplication.

## Cas d'utilisation

### Cas 1 : Récupérer la liste des commandes

```typescript
import { getCommandNames } from './core/catalog';

const commands = getCommandNames();
// Result: ['add', 'branch', 'checkout', 'commit', ...]
```

### Cas 2 : Récupérer les flags d'une commande

```typescript
import { getCommandFlags } from './core/catalog';

const flags = getCommandFlags('commit');
// Result: [
//   { name: '-m', hasArgument: true, description: '...', isCommon: true },
//   { name: '--message', hasArgument: true, description: '...', isCommon: false },
// ]
```

### Cas 3 : Vérifier si une commande existe

```typescript
import { COMMAND_CATALOG } from './core/catalog';

const exists = 'commit' in COMMAND_CATALOG.lookup;
// Result: true
```

### Cas 4 : Obtenir la description d'une commande

```typescript
import { COMMAND_CATALOG } from './core/catalog';

const meta = COMMAND_CATALOG.lookup['commit'];
console.log(meta.description);
// Result: "Créer un commit avec les fichiers stagés"
```

## Critères d'acceptation

### CA-catalog-01 : Catalogue exporte toutes les commandes

**Given**
- Le core contient un module `catalog.ts` (ou équivalent)

**When**
- Appel `getCommandNames()` depuis le core

**Then**
- Retourne un array contenant ALL les noms de commandes Phase 5 :
  - init, add, status, restore, write, read
  - commit, log
  - branch, checkout, switch, tag
  - merge, reset, revert, cherry-pick, rebase
  - stash, reflog
  - help (Phase 6)
- Aucun doublon, ordre alphabétique

### CA-catalog-02 : Métadonnées pour chaque commande

**Given**
- Le catalogue est initialisé

**When**
- Récupère une commande : `COMMAND_CATALOG.lookup['commit']`

**Then**
- L'objet contient :
  - `name === "commit"`
  - `description` : string non-vide
  - `category` : string (ex: "Commits")
  - `flags` : array de Flag

### CA-catalog-03 : Flags courants marqués

**Given**
- Le catalogue contient la commande `commit`

**When**
- Récupère les flags : `getCommandFlags('commit')`

**Then**
- Retourne au minimum le flag `-m`
- Le flag `-m` a `isCommon === true`
- Le flag `-m` a `hasArgument === true`
- Description de `-m` contient "message"

### CA-catalog-04 : Lookup performance

**Given**
- Le catalogue avec 18+ commandes

**When**
- Appel `COMMAND_CATALOG.lookup['reset']` (accès direct)

**Then**
- Retourne instantanément (O(1)), sans itération

### CA-catalog-05 : Groupement par catégorie

**Given**
- Le catalogue avec `commands` groupé par catégorie

**When**
- Accède `COMMAND_CATALOG.commands['Commits']`

**Then**
- Retourne array contenant : commit, log
- Aucune autre commande dans ce groupe

### CA-catalog-06 : Version du catalogue

**Given**
- Le catalogue contient un champ `version`

**When**
- Récupère `COMMAND_CATALOG.version`

**Then**
- Retourne une string (ex: "1.0")
- Peut servir pour validation de compatibilité future

### CA-catalog-07 : Commande inexistante retourne vide

**Given**
- Le catalogue initialisé

**When**
- Appel `getCommandFlags('nosuchcommand')`

**Then**
- Retourne un array vide `[]` (pas d'exception)

### CA-catalog-08 : Descriptifs en français

**Given**
- Le catalogue complet

**When**
- Itère sur toutes les commandes et flags

**Then**
- Chaque `description` est en français
- Aucune description vide

### CA-catalog-09 : Flags avec et sans argument

**Given**
- Le catalogue

**When**
- Récupère les flags de `add` et `reset`

**Then**
- `add` : flags sans argument (`-A`, `--all`) + `<pathspec>` (pas un flag classique)
- `reset` : flags sans argument (`--soft`, `--mixed`, `--hard`) + argument `<ref>` (optionnel)
- Chaque flag a `hasArgument` à true/false selon sa nature

### CA-catalog-10 : Cohérence avec l'implémentation

**Given**
- Un changement à une commande en Phase 6 (ex: nouveau flag)

**When**
- Met à jour le core (la commande elle-même)

**Then**
- Le catalogue est aussi mis à jour
- Aucune désynchronisation entre le code et le catalogue
- Critère testable : les tests du core/commands vérifient que les flags affichés dans le catalogue existent réellement

## Implémentation : Points clés

1. **Localisation** : Créer `src/core/catalog.ts` (ou intégrer dans `src/core/engine.ts` en export séparé) contenant `COMMAND_CATALOG` + helpers.

2. **Synchronisation** : À chaque ajout/modification de commande en Phase 6, mettre à jour le catalogue simultanément (dans le même commit/PR).

3. **Tests** : Écrire un test dans `tests/` qui :
   - Charge le catalogue
   - Vérifie que chaque commande du catalogue existe dans le parser
   - Vérifie que chaque flag du catalogue est supporté par la commande (parsing)

4. **Export** : Exporter depuis `engine.ts` ou créer une API stable `gitEngine.getCatalog()`.

5. **Pas de hardcodage UI** : Aucune liste de commandes/flags ne doit être écrite en dur dans `Vue/Pinia`. L'UI consomme uniquement via l'API du core.

## Dépendances inter-commandes

- **`git help`** (Fonctionnalité A) : consomme le catalogue pour afficher les options
- **Autocomplétion** (Fonctionnalité C) : consomme le catalogue pour proposer des flags
- Toutes les commandes Phase 5 doivent y figurer

## Notes pour Phase 6+

- Si une nouvelle commande est ajoutée, mettre à jour le catalogue en même temps.
- Le catalogue peut servir de base pour une future implémentation de `git help <cmd>` qui affiche les options depuis le catalogue.
- Version du catalogue permet de détecter des incompatibilités futures (UI ancienne vs moteur neuf).
