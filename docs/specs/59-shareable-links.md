# Phase 7 : Liens partageables

## Résumé

Un utilisateur peut partager son état actuel (session) via un lien web. Le lien encode l'historique de commandes compressé et encodé en base64url dans l'URL (fragment ou paramètre de query). À la visite du lien, un modal propose de charger la session : après confirmation, l'app reset + rejeu silencieux, restituant l'état partagé.

**Principes** :
- Encoder une `ExportedSession` (spec 58) dans l'URL de manière compacte (base64url + compressé)
- Sharable sur web (copy/paste, email, etc.)
- Sécurité : seules les commandes (rejouées par le moteur sandboxé) sont encodées
- Priorité URL > localStorage : un lien partagé prime sur une session locale
- UX non-invasive : proposer plutôt qu'imposer

## Encoding et compression

### Format de l'URL

```
https://git-visualizer.example.com/?session=<encoded>
ou
https://git-visualizer.example.com/#session=<encoded>
```

**Choix** : Utiliser le **fragment** (`#session=...`) pour éviter les requêtes serveur (client-side only, aucun serveur n'a besoin de voir la session).

### Processus d'encoding

1. Créer une `ExportedSession` (commandes + metadata)
2. Sérialiser en JSON : `JSON.stringify(session)`
3. Compresser avec gzip (ou déflate) → `Uint8Array`
4. Encoder en base64url : `btoa()` + remplacer `/` → `_`, `+` → `-`
5. Résultat : chaîne alphanumérique sûre pour l'URL

**Formule** : `base64url(gzip(JSON(session)))`

### Limite de taille URL

**Limites navigateur** :
- Chrome/Firefox/Safari : ~2000 caractères (conservative)
- Serveurs HTTP : ~4000-8000 (dépend du serveur)
- Partage email/Slack : ~2000 (conseillé)

**Stratégie de session grande** :
- Session < 1500 chars encoded → OK
- Session 1500-2000 chars → avertissement utilisateur : "Lien très long"
- Session > 2000 chars → refus + message : "Session trop grande pour un lien. Utilisez Export/Import (fichier)."

**Estimation** : 100 commandes typiques (~50-100 chars chacune) = 5-10 KB brut → ~3-5 KB après gzip → ~4-7 KB en base64url.

## Workflow au chargement

### Boot avec lien partagé

1. App démarre
2. Parser l'URL : chercher `#session=...`
3. Si présent ET valide :
   - Décoder base64url → décompresser gzip → parser JSON
   - Si valide : afficher modal "Charger la session partagée ?"
   - Boutons : [Charger] [Ignorer]
4. Si absent : charger depuis localStorage (comme d'habitude)

### Modal de confirmation

```
┌────────────────────────────────┐
│ Charger une session partagée ? │
├────────────────────────────────┤
│ Cet URL contient une session :  │
│                                │
│ • 7 commandes                  │
│ • Créée le 2024-06-09          │
│ • Auteur : ???                 │
│                                │
│ Votre session locale sera      │
│ réinitialisée.                 │
│                                │
│ [Charger] [Annuler]            │
└────────────────────────────────┘
```

- **Charger** : reset + rejeu de la session + ferme modal
- **Annuler** : conserve la session locale (ou localStorage)

### Priorité session

**Décision de Phase 7** :

1. Si URL contient `#session=...` ET utilisateur confirme → charger session URL
2. Sinon, si localStorage valide → charger depuis localStorage
3. Sinon → boot vierge (git init manuel)

**Justification** : Un lien partagé est intentionnel (utilisateur le clique volontairement) → prime sur la persistance locale.

## Sécurité et intégrité

### Validation au décodage

**Étapes** :

1. Extraire et décoder base64url
2. Décompresser gzip
3. Parser JSON (invalide → erreur)
4. Valider le schéma `ExportedSession` (cf. spec 58)
5. Vérifier la version majeure
6. Vérifier `commandCount === commands.length`

**Erreur de décodage** → message utilisateur clair, pas de reset

### Pas de code arbitraire

- L'URL ne contient que **commandes Git** (strings)
- Le moteur rejue les commandes dans un sandbox (moteur sandboxé)
- Aucun `eval()`, aucun script injecté
- Les commandes sont parsées et validées par le moteur
- **Pas de risque de XSS** : les commandes sont textes, les sorties sont filtrées par le moteur

### Protection contre la manipulation

**Cas** : Attaquant modifie l'URL pour injecter une commande malveillante

**Défense** :
- URL tampon → décodage échoue (corruption gzip/base64)
- Commande invalide → moteur retourne `exitCode !== 0`, pas d'exécution
- L'UI affiche l'erreur, l'utilisateur ne risque rien

**Cas critique** : Commande `git rm *` ou `git reset --hard` injectée après une vraie commande

**Défense** : Même si la commande est valide (syntaxe), le moteur la traite comme n'importe quelle commande. L'UI affiche le résultat. L'utilisateur voit ce qui s'est passé (historique visible, graphe ré-affiché). Aucun danger caché.

**Recommandation** : Les utilisateurs ne devraient charger que des liens qu'ils connaissent. Un dialog de confirmation aide.

## UI et interaction

### Bouton "Partager" (Create shareable link)

**Sidebar ou menu** :

```
[Réinitialiser] [Exporter] [Importer] [Partager]
```

- **Partager** : bouton → génère lien → copie au presse-papier → message "✓ Lien copié"
- Optionnel : affiche l'URL dans un textbox pour le montrer
- Optionnel : bouton QR code pour des contextes mobiles

### Générateur de lien

```typescript
function generateShareableLink(): string {
  const session = {
    version: "1.0",
    metadata: { ... },
    commands: store.savedCommands
  };
  const encoded = encodeSession(session);
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}#session=${encoded}`;
}

function encodeSession(session: ExportedSession): string {
  const json = JSON.stringify(session);
  const compressed = gzip(json);  // Uint8Array
  const base64url = btoa(String.fromCharCode(...compressed))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return base64url;
}
```

### Modal de partage

```
┌────────────────────────────────┐
│ Partager cette session         │
├────────────────────────────────┤
│ Lien (copier-coller) :         │
│ https://git-vis.../# 👍 OK    │
│ [Copier] [QR Code] [Fermer]    │
└────────────────────────────────┘
```

### Limite de taille : UX

**Session < 1500 chars** : Aucun avertissement, lien généré normalement

**Session 1500-2000 chars** :
```
⚠ Attention : Lien très long (peut ne pas fonctionner 
partout, ex: email, certains navigateurs)
[Générer quand même] [Annuler]
```

**Session > 2000 chars** :
```
✗ Impossible de générer un lien : session trop grande.
Utilisez Export/Import (fichier) à la place.
[OK]
```

## Cas d'usage pédagogique

1. **Exercice partagé** : Tuteur crée une session d'exercice (5 commandes initiales), la partage via lien ; étudiants cliquent le lien → charger la session → continuer à partir de cet état
2. **Bug reproduction** : Dev crée une séquence de commits qui reproduit un bug, partage le lien ; collaborateurs chargent la session → voient le problème
3. **Demo live** : Formateur construit une démo (git merge, rebase), la partage ; publicum clique le lien → voit la même configuration

## Format de la session codée

La `ExportedSession` (spec 58) est encodée telle quelle. Pas de format spécifique aux liens ; réutiliser le format export/import.

```typescript
// Même que spec 58
export interface ExportedSession {
  version: string;
  metadata: {
    exportDate: number;
    exportUrl: string;
    commandCount: number;
    description?: string;
  };
  commands: string[];
}
```

## Dépendances avec export/import

| Feature | Export/Import (58) | Shareable Links (59) |
|---------|-----|---|
| Format | `ExportedSession` | Même |
| Métadonnées | Fichier disque | Encodées dans URL |
| Portée | Archive locale | Partage web |
| Compression | Optionnel (gzip) | Obligatoire (gzip) |
| Taille limite | Disque (infini pratiquement) | URL (~2KB) |

**Réutilisation** : La validation et le rejeu (spec 58) sont identiques. Les fonctions d'encoding/decoding et de compression sont spécifiques (59).

## Critères d'acceptation

### CA-share-01 : Encoder session en base64url

**Given**
- Session : 3 commandes ["init", "add f", "commit -m test"]

**When**
- Appel `encodeSession(session)`

**Then**
- Retourne une chaîne base64url (alphanumérique + `-` `_`)
- Pas de `/` ni `+` ni `=`
- Peut être décodée et retrouve la session originale

### CA-share-02 : Générer lien shareable

**Given**
- Session valide
- URL actuelle : `https://git-visualizer.app/`

**When**
- Clique bouton [Partager]

**Then**
- Lien généré : `https://git-visualizer.app/#session=<base64url>`
- Lien copié au presse-papier (clipboard API)
- Message : "✓ Lien copié"

### CA-share-03 : Parser session depuis URL au boot

**Given**
- URL : `https://.../#session=<encoded>`
- Encoded est valide

**When**
- App boot

**Then**
- Modal affichée : "Charger la session partagée ?"
- Modal affiche : nombre de commandes, date d'export, optionnel description

### CA-share-04 : Charger session après confirmation

**Given**
- Modal affichée, utilisateur clique [Charger]

**When**
- Confirmation

**Then**
- Reset du repo
- Rejeu de la session
- Snapshot restauré
- Modal fermée
- localStorage mis à jour (nouvelle session devient locale)
- Message optionnel : "Session partagée chargée (7 commandes)"

### CA-share-05 : Annuler chargement

**Given**
- Modal affichée, utilisateur clique [Annuler]

**When**
- Annulation

**Then**
- Session partagée ignorée
- Session locale (localStorage) chargée, ou boot vierge si aucune
- Modal fermée
- URL inchangée (lien reste dans l'historique, pourra être ré-essayé)

### CA-share-06 : URL invalide (décodage échoue)

**Given**
- URL : `https://.../#session=INVALID_BASE64`

**When**
- App boot

**Then**
- Décodage échoue (base64url invalide)
- Aucun modal ; session locale chargée
- Message optionnel en console (debug)
- UX normal

### CA-share-07 : Session décodée invalide (mauvais schéma)

**Given**
- URL encode valide en base64url + gzip, mais JSON n'a pas le bon format

**When**
- App boot et valide la session

**Then**
- Schéma invalide
- Aucun modal ; session locale chargée
- Message : "Impossible de charger la session partagée (format invalide)"

### CA-share-08 : Compresser et décompresser roundtrip

**Given**
- Session grande (100 commandes)

**When**
- Encode (gzip + base64url) → Decode (base64url + gunzip)

**Then**
- Session retrouvée intacte
- Taille compressée < 30% de la taille originale

### CA-share-09 : Limiter la taille du lien

**Given**
- Session encode en > 2000 caractères

**When**
- Clique bouton [Partager]

**Then**
- Modal avertissant : "Session trop grande pour un lien"
- Suggère Export/Import à la place
- Pas de lien généré

### CA-share-10 : Avertissement lien long

**Given**
- Session encode entre 1500 et 2000 caractères

**When**
- Clique bouton [Partager]

**Then**
- Dialog : "⚠ Lien très long. Continuer ?"
- Boutons : [Oui] [Annuler]
- Si [Oui] : lien généré malgré tout

### CA-share-11 : Priorité URL > localStorage

**Given**
- localStorage contient une session A
- URL contient un lien avec session B
- Utilisateur confirme [Charger]

**When**
- Boot + chargement

**Then**
- Session B est chargée (URL prime)
- localStorage est mis à jour avec session B
- Session A est oubliée (sauf si back du navigateur)

### CA-share-12 : QR code optionnel

**Given**
- Lien généré

**When**
- Clique bouton [QR Code] dans modal

**Then**
- Modal affiche un QR code pointant vers l'URL
- QR code scannable et valide

### CA-share-13 : Pas de code XSS

**Given**
- Attaquant crée un lien avec une commande malveillante : `"; echo "hacked`

**When**
- Lien partagé, victime le charge

**Then**
- Commande est parsée normalement par le moteur
- Moteur l'exécute (ou rejette si syntaxe invalide)
- Aucun XSS, aucun accès à `document`/`window`, aucun script injecté
- Historique affiche la commande (transparence)

### CA-share-14 : URL parser ne modifie pas le hashtag

**Given**
- Lien avec session dans `#session=...`
- App route autre (ex: SPA avec routes)

**When**
- Parser détecte `#session=...`

**Then**
- Extrait uniquement `session=...`
- Ignore les autres hashtags/paramètres
- Ne navigue pas vers d'autres routes SPA

### CA-share-15 : Lien fonctionne cross-origin

**Given**
- Lien généré sur `git-visualizer.app`
- Partage via un autre site (Slack, forum, etc.)
- Utilisateur clique le lien depuis un contexte différent

**When**
- Nav vers le lien

**Then**
- App se charge normalement
- Modal de confirmation affichée
- Session chargée sans erreur CORS
- Aucun problème cross-origin (tout est client-side)

## Implémentation : Points clés

1. **Store (repo.ts)** : Ajouter actions `generateShareableLink()` et `loadFromUrl()` (hook au boot)

2. **Utilities** : `src/utils/share.ts`
   - `encodeSession(session): string` (base64url + gzip)
   - `decodeSession(encoded: string): ExportedSession | null` (gunzip + base64url)
   - `getSessionFromUrl(): ExportedSession | null`
   - `checkSessionSize(session): "ok" | "warning" | "error"`

3. **App.vue** : Au montage (avant autres composants)
   - Appel `store.loadFromUrl()`
   - Si lien détecté ET valide → modal de confirmation
   - Sinon → chargement depuis localStorage (comme avant)

4. **RefsSidebar ou menu** : Bouton "Partager"
   - Génère lien + affiche modal / toast
   - Copie au presse-papier (Clipboard API)

5. **Modal** : `ShareSessionModal.vue` (partage) et `LoadSharedSessionModal.vue` (chargement)

6. **Dépendance externe** : Librairie gzip (ex: `pako` ou `fflate`)

## Dépendances inter-commandes

- Dépend de **spec 58 (Export/Import)** : réutilise `ExportedSession` et validation
- Utilisée par spec 60 (undo/redo) : l'historique partagé facilite le test du undo

## Notes pour Phase 7+

- **Phase 7** : Implémentation basique (encode/decode + modal)
- **Phase 8** : QR code (optionnel, dépend lib)
- **Backend optionnel** : Shortlinks (ex: `short.link/abc123` → redirect vers git-visualizer avec session encodée)
- **Analytics** : Tracer les partages (optionnel, respect privacy)
