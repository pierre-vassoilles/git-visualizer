# Phase 6 : Persistance localStorage

## Résumé

La session utilisateur (historique des commandes exécutées) est persistée dans le `localStorage` du navigateur. Au rechargement de la page, l'historique est rejoué de manière déterministe (aucun `Date.now()`, aucun état aléatoire), restaurant l'état exact du dépôt. Cette approche est robuste et testable : le moteur est déterministe, donc rejouer la même séquence donne le même résultat.

**Principes** :
- Persister l'**historique de commandes** (pas l'état du moteur, trop volumineux/fragile)
- Rejeu silencieux et déterministe au démarrage
- Versioning du format (évite les incompatibilités futures)
- Gestion d'erreurs : corruption détectée → réinitialisation propre
- Bouton `reset` / commande `git config` pour purger le storage

## Stockage et format

### Clé localStorage

```typescript
const STORAGE_KEY = "git-visualizer:history";  // ou "git-visualizer:session"
const STORAGE_VERSION_KEY = "git-visualizer:history:version";
```

### Format du historique

```typescript
export interface StoredHistory {
  /** Version du format (ex: "1.0") */
  version: string;
  /** Liste des commandes exécutées (chaînes brutes) */
  commands: string[];
  /** Timestamp de la dernière sauvegarde (pour debug) */
  lastSaved: number;
  /** Hash de vérification (optionnel, détect corruption) */
  checksum?: string;
}

// Exemple stocké en JSON
{
  "version": "1.0",
  "commands": [
    "init",
    "add file1.txt",
    "commit -m \"Initial commit\"",
    "branch feature",
    "checkout feature"
  ],
  "lastSaved": 1718017200000,
  "checksum": "abc123..."
}
```

### Versioning du format

| Version | Changements | Notes |
|---------|------------|-------|
| 1.0 | Format initial | Historique + metadata |
| 2.0 (futur) | Ex: commandes groupées par opération | Avec migration |

## Cycle de vie

### Sauvegarde (à chaque commande)

1. Utilisateur exécute une commande (ex: `git commit -m "test"`)
2. Le store (`src/stores/repo.ts`) exécute la commande via l'engine
3. **Succès** : ajouter la commande à la liste locale en mémoire
4. **Écrire dans localStorage** :
   ```typescript
   const history: StoredHistory = {
     version: "1.0",
     commands: store.history, // liste accumulée
     lastSaved: Date.now(),
     checksum: computeChecksum(commands)
   };
   localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
   ```
5. Aucune sauvegarde si la commande échoue (erreur utilisateur)

### Chargement (au démarrage)

1. **App.vue** ou `main.ts` au montage, avant que l'utilisateur ne tape une commande
2. Lire depuis localStorage :
   ```typescript
   const stored = localStorage.getItem(STORAGE_KEY);
   if (!stored) {
     // Première visite, repos empty
     return;
   }
   const history = JSON.parse(stored) as StoredHistory;
   ```
3. **Valider le format** :
   - Version compatible ?
   - Checksum valide ?
   - Si non → log warning, réinitialiser proprement
4. **Rejeu silencieux** :
   ```typescript
   const engine = new GitEngine();
   for (const cmd of history.commands) {
     const result = engine.execute(cmd);
     if (!result.success) {
       // Commande invalide → log + arrêter le rejeu
       console.error(`Failed to replay: ${cmd}`);
       break;
     }
   }
   store.setEngine(engine);
   ```
5. **UI rendue** : snapshot affiche l'état restauré

### Reset / Purge

**Commande utilisateur** : `git config --reset` (ou bouton UI)

Décision : ajouter une "commande" `git config` de configuration qui peut réinitialiser :

```bash
git config --reset  # Purge localStorage et reload
```

**Implémentation** :
```typescript
localStorage.removeItem(STORAGE_KEY);
location.reload();  // Reload la page → boot avec localStorage vide
```

**Ou bouton UI** : un bouton "Reset" dans la RefsSidebar qui :
1. Appelle `localStorage.removeItem(STORAGE_KEY)`
2. Appelle `store.reset()` (réinitialise l'engine)
3. UI refreshe

## Gestion des erreurs

### Format corrompu

**Cas** : JSON invalide dans localStorage

**Gestion** :
```typescript
try {
  const history = JSON.parse(stored) as StoredHistory;
  if (!history.version || !history.commands) {
    throw new Error("Invalid format");
  }
} catch (e) {
  console.warn(`Failed to parse history: ${e.message}`);
  localStorage.removeItem(STORAGE_KEY);
  // Boot vierge
}
```

### Version incompatible

**Cas** : `history.version` est `"2.0"` mais le code n'en sait rien

**Gestion** :
```typescript
const majorVersion = history.version.split(".")[0];
const supportedMajor = "1";
if (majorVersion !== supportedMajor) {
  console.warn(`Unsupported history version: ${history.version}`);
  localStorage.removeItem(STORAGE_KEY);
  // Boot vierge
}
```

### Rejeu partiel (commande invalide)

**Cas** : Dans l'historique, une commande ne peut pas être rejouée (ex: typo sauvegardée)

**Gestion** :
```typescript
for (const cmd of history.commands) {
  const result = engine.execute(cmd);
  if (!result.success) {
    console.warn(`Skipping invalid command in history: ${cmd}`);
    // Ne pas arrêter, continuer le rejeu (plus robuste)
    // Ou : arrêter et log l'erreur pour debug
    break;
  }
}
```

Décision Phase 6 : **arrêter le rejeu dès la première erreur** (détecte les problèmes tôt). L'utilisateur verra son historique partiellement restauré (avant l'erreur).

## Critique et limites

### Problèmes potentiels

1. **Taille limite localStorage** : ~5-10 MB selon le navigateur
   - Historique de 1000 commandes = ~10-50 KB (acceptable)
   - Historique de 100k commandes = ~1-5 MB (limite approchée)
   - **Décision Phase 6** : pas de nettoyage automatique ; l'utilisateur peut reset manuellement

2. **Pas de synchronisation multi-onglets** :
   - Deux onglets modifient localStorage en même temps → collision
   - **Décision Phase 6** : accepter la limitation (edge case rare)

3. **Pas de sauvegarde serveur** :
   - localStorage est local, perdu si cache navigateur nettoyé
   - **Décision Phase 6** : optionnel Phase 7 (export/import)

### Alternatives considérées

- **Sérialiser l'état du moteur** : volumineux, fragile si l'API change
- **IndexedDB** : plus robuste mais plus complexe
- **Service Worker + sync** : serveur backend, hors scope Phase 6

## Critères d'acceptation

### CA-persist-01 : Sauvegarde au boot

**Given**
- Utilisateur a exécuté `git init`, `git add file1`, `git commit -m "test"`

**When**
- Ferme et recharge la page (F5 ou fermer l'onglet)

**Then**
- Historique restauré à la sauvegarde
- `snapshot.commits.length >= 1`
- L'état du graphe est identique avant/après

### CA-persist-02 : Format versionnée

**Given**
- localStorage contient une entrée avec `version: "1.0"`

**When**
- Crée un `StoredHistory` et l'écrit

**Then**
- `JSON.parse(localStorage.getItem(STORAGE_KEY)).version === "1.0"`

### CA-persist-03 : Corruption détectée

**Given**
- localStorage contient une chaîne JSON invalide

**When**
- App.vue charge l'historique au montage

**Then**
- Parse échoue (try/catch)
- localStorage est purgé
- Boot en état vierge (comme une première visite)

### CA-persist-04 : Version incompatible ignorée

**Given**
- localStorage contient `version: "99.0"` (future version)

**When**
- App.vue charge l'historique

**Then**
- Version non reconnue → localStorage purgé
- Boot en état vierge

### CA-persist-05 : Rejeu déterministe

**Given**
- Commandes exécutées : `"init"`, `"add f1"`, `"commit -m C1"`, `"branch b1"`, `"checkout b1"`

**When**
- Rejeu des mêmes commandes dans un nouvel engine

**Then**
- Snapshot identique : mêmes commits, mêmes branches, mêmes hashes
- Pas de différences dues à des timestamps ou IDs aléatoires

### CA-persist-06 : Erreur durant rejeu

**Given**
- localStorage contient : `["init", "invalid_cmd", "add f1"]`

**When**
- App.vue rejue l'historique

**Then**
- "init" réussit
- "invalid_cmd" échoue → arrêt du rejeu
- "add f1" n'est pas exécutée
- Snapshot reflète l'état après "init" uniquement

### CA-persist-07 : Bouton reset

**Given**
- Utilisateur a exécuté plusieurs commandes
- localStorage est rempli

**When**
- Clique sur le bouton "Reset" dans la UI

**Then**
- localStorage est vidé
- L'engine est réinitialisé (factory new)
- Snapshot est vierge

### CA-persist-08 : Sauvegarde uniquement après succès

**Given**
- Utilisateur exécute `git commit` (sans `-m`, erreur)

**When**
- Commande échoue

**Then**
- Historique n'est pas modifié
- localStorage conserve l'état avant la tentative échouée

### CA-persist-09 : Performance du rejeu

**Given**
- localStorage contient 1000 commandes

**When**
- Page rechargée (rejeu all 1000 commandes)

**Then**
- Boot complète en < 2-3 secondes (acceptable)
- Aucun gel/lag perceptible

### CA-persist-10 : Checksum optionnel

**Given**
- Historique sauvegardé

**When**
- JSON contient un champ `checksum`

**Then**
- À la réception, validation optionnelle (si checksum présent)
- Détecte les modifications manuelles de localStorage

### CA-persist-11 : localStorage clé bien nommée

**Given**
- Une clé localStorage pour le projet

**When**
- Inspecte `localStorage.getItem("git-visualizer:history")`

**Then**
- Retourne un JSON valide (ou null si absent)
- Nom clair pour debug

### CA-persist-12 : Pas de sauvegarde avant init

**Given**
- Utilisateur tape une commande avant `git init`

**When**
- Commande échoue (pas de repo)

**Then**
- localStorage ne contient aucune entrée (ne pas persister les erreurs)

## Implémentation : Points clés

1. **Store (Pinia)** : Ajouter logique de sauvegarde/chargement dans `src/stores/repo.ts`
   - `loadFromStorage()` : au montage
   - `saveToStorage()` : après chaque `execute()` succès
   - `resetStorage()` : action pour purger

2. **App.vue** : Au montage, appeler `store.loadFromStorage()` avant montage d'autres composants

3. **Utilities** : Créer `src/utils/storage.ts` :
   - `loadHistory(): StoredHistory | null`
   - `saveHistory(commands: string[]): void`
   - `clearHistory(): void`
   - `validateHistoryFormat(data: unknown): boolean`

4. **Checksum** : Optionnel Phase 6 ; simple hash SHA-256 ou simpler (ex: CRC).

5. **Tests** : Couvrir les cas :
   - Sauvegarde/chargement sans erreur
   - Corruption JSON
   - Version incompatible
   - Erreur durant rejeu

## Dépendances inter-commandes

- Dépend de **moteur déterministe** (Phase 5) : dates fixes, pas de Math.random()
- Utilisée par **TerminalPanel** (sauvegarde après chaque commande) et **App.vue** (chargement au boot)

## Notes pour Phase 6+

- **Phase 6** : Sauvegarde basique (liste commands)
- **Phase 7** : Export/Import (permettre à l'utilisateur d'exporter une session en fichier)
- **Phase 8** : Synchronisation serveur (optionnel, pour accès multi-device)
- **Cleanup** : Ajouter une limite de taille (ex: max 10 MB, puis déduplicate/compresse)
