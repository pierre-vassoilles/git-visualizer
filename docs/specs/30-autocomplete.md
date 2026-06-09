# Phase 6 : Autocomplétion du terminal (UI)

## Résumé

L'autocomplétion terminal (Tab) propose des compléments intelligents pour le texte en cours dans xterm. Elle utilise le catalogue de commandes du core (Fonctionnalité B) pour rester synchronisée, et le snapshot du dépôt (branches, tags) pour proposer des noms de refs. Aucune logique Git ne réside dans ce composant.

**Cas d'usage** :
- `git ch<Tab>` → propose `checkout`, `cherry-pick`
- `git checkout <Tab>` → propose les noms de branches et tags existants
- `git commit -m<Tab>` → complète `-m` en `-m <message>`
- Plusieurs candidats → affiche une liste ; un seul → complète automatiquement

## Syntaxe et comportement

### Architecture

```
TerminalPanel.vue
  ↓ capture événement Tab + texte courant
  ↓ appelle autoCompleter(currentInput, catalog, snapshot)
  ↓ retourne { completion: string, candidates: string[] }
  ↓ si candidates.length === 1 : complète automatiquement
  ↓ si candidates.length > 1 : affiche liste interactive
```

### Fonction de base (headless, testable)

Créer une fonction pure `src/utils/autocomplete.ts` :

```typescript
export interface AutocompleteResult {
  /** Texte à insérer (vide si plusieurs candidats) */
  completion: string;
  /** Candidats possibles (liste pour affichage) */
  candidates: string[];
  /** Type de complément (commandName, flag, ref, ...) */
  context: "commandName" | "flag" | "ref" | "none";
}

export function autocomplete(
  input: string,
  catalog: CommandCatalog,
  snapshot: RepoSnapshot
): AutocompleteResult {
  // Implémentation ci-dessous
}
```

## Cas d'utilisation détaillés

### Cas 1 : Complétion de nom de commande

**Input** : `"git ch"` (utilisateur a tapé `git ch` puis Tab)

**Processus** :
1. Parser l'input : `"git"` = prefix cmd, `"ch"` = début de commande
2. Chercher dans `catalog.lookup` les commandes commençant par `"ch"`
3. Candidats : `["checkout", "cherry-pick"]`
4. Afficher une liste interactive

**Output** :
```
{
  completion: "",  // Plusieurs candidats, ne pas compléter automatiquement
  candidates: ["checkout", "cherry-pick"],
  context: "commandName"
}
```

**Rendu terminal** :
```
git ch[Tab]
checkout
cherry-pick
```

### Cas 2 : Complétion unique de commande

**Input** : `"git com"` (ou `"git co"` → juste `"commit"`)

**Processus** :
1. Parser : `"git"` + `"com"`
2. Candidats commençant par `"com"` : `["commit"]` (exact)
3. Un seul candidat → compléter automatiquement

**Output** :
```
{
  completion: "mit",  // Ajouter "mit" pour faire "commit"
  candidates: ["commit"],
  context: "commandName"
}
```

**Rendu terminal** :
```
git com[Tab] → git commit[space]
```

Le cursor avance et on peut continuer.

### Cas 3 : Complétion de flags

**Input** : `"git reset --"` (utilisateur a tapé `git reset --` puis Tab)

**Processus** :
1. Parser : commande = `reset`, flag = `"--"`
2. Récupérer les flags de `reset` : `--soft`, `--mixed`, `--hard`
3. Candidats commençant par `--` : tous les trois
4. Afficher liste

**Output** :
```
{
  completion: "",
  candidates: ["--soft", "--mixed", "--hard"],
  context: "flag"
}
```

### Cas 4 : Complétion unique de flag

**Input** : `"git reset --mi"` (seul `--mixed` commence par `--mi`)

**Processus** :
1. Parser : `reset` + `--mi`
2. Candidats : `["--mixed"]`
3. Compléter automatiquement : ajouter `"xed"` ou ajouter `" "` (avec espace)

**Output** :
```
{
  completion: "xed ",  // Complète "--mixed " (avec espace après)
  candidates: ["--mixed"],
  context: "flag"
}
```

### Cas 5 : Complétion de noms de refs (branches/tags)

**Input** : `"git checkout "` (après `checkout`, utilisateur tape Tab)

**Processus** :
1. Parser : commande = `checkout`, aucun argument encore
2. `checkout` accepte un argument `<branch>` ou `<commit>`
3. Récupérer depuis snapshot :
   - `snapshot.branches` : ["main", "feature"]
   - `snapshot.tags` : ["v1.0", "release"]
   - Commits (hashes courts optionnels)
4. Combiner : candidats = ["main", "feature", "v1.0", "release"]
5. Afficher liste (4 options)

**Output** :
```
{
  completion: "",
  candidates: ["main", "feature", "v1.0", "release"],
  context: "ref"
}
```

### Cas 6 : Complétion de ref avec prefix

**Input** : `"git checkout fe"` (utilisateur a filtré)

**Processus** :
1. Parser : `checkout` + prefix `"fe"`
2. Candidats commençant par `"fe"` : `["feature"]`
3. Un seul → compléter

**Output** :
```
{
  completion: "ature",  // Ajouter "ature" pour faire "feature"
  candidates: ["feature"],
  context: "ref"
}
```

### Cas 7 : Pas de complément

**Input** : `"git nosuchcmd"` (commande inconnue)

**Processus** :
1. Parser : `"nosuchcmd"` n'existe pas dans le catalog
2. Candidats : vide
3. Pas de complément proposé (aucun bip, message silencieux)

**Output** :
```
{
  completion: "",
  candidates: [],
  context: "none"
}
```

## Spécification de la fonction autocomplete

### Étapes du parsing

1. **Tokeniser l'input** : découper par espaces, gérer les guillemets
   - `"git checkout feature"` → tokens = ["git", "checkout", "feature"]
   - `"git commit -m \"test msg\""` → tokens = ["git", "commit", "-m", "test msg"]

2. **Identifier le contexte** :
   - Token 0 = `"git"` (toujours)
   - Token 1 = nom de la commande (ex: `"checkout"`)
   - Tokens 2+ = arguments/flags de la commande

3. **Compléter selon le contexte** :
   - Si on complète le token 1 → chercher dans les noms de commandes
   - Si on complète un token 2+ → chercher dans les flags ou refs (selon la commande)

### Logique de complétion

```typescript
export function autocomplete(
  input: string,
  catalog: CommandCatalog,
  snapshot: RepoSnapshot
): AutocompleteResult {
  const tokens = tokenizeInput(input);
  
  // Cas 1 : complète "git" → aucun complément
  if (tokens.length === 0) {
    return { completion: "", candidates: [], context: "none" };
  }
  
  // Cas 2 : complète le nom de la commande
  if (tokens.length === 1) {
    const prefix = tokens[0];
    const candidates = getCommandNames(catalog)
      .filter(cmd => cmd.startsWith(prefix));
    const completion = getSingleCompletion(prefix, candidates);
    return {
      completion,
      candidates,
      context: "commandName"
    };
  }
  
  // Cas 3 : complète un argument/flag de la commande
  const commandName = tokens[1];
  if (!catalog.lookup[commandName]) {
    return { completion: "", candidates: [], context: "none" }; // Commande inconnue
  }
  
  const lastToken = tokens[tokens.length - 1];
  const flags = getCommandFlags(catalog, commandName);
  
  // Chercher si lastToken est un flag
  if (lastToken.startsWith("-")) {
    const candidates = flags
      .map(f => f.name)
      .filter(name => name.startsWith(lastToken));
    const completion = getSingleCompletion(lastToken, candidates);
    return {
      completion: completion ? completion + " " : "",  // Espace après le flag
      candidates,
      context: "flag"
    };
  }
  
  // Sinon, compléter un argument de ref (branche/tag)
  const candidates = getCandidateRefs(snapshot);
  const matching = candidates.filter(ref => ref.startsWith(lastToken));
  const completion = getSingleCompletion(lastToken, matching);
  return {
    completion,
    candidates: matching,
    context: "ref"
  };
}

function getSingleCompletion(prefix: string, candidates: string[]): string {
  if (candidates.length === 1) {
    return candidates[0].slice(prefix.length);
  }
  return "";
}

function getCandidateRefs(snapshot: RepoSnapshot): string[] {
  const refs = [
    ...snapshot.branches,
    ...snapshot.tags,
    // Optionnel : hashes courts des commits
  ];
  return refs.sort();
}

function tokenizeInput(input: string): string[] {
  // Parser basique : découper par espaces
  // Gérer les guillemets (ex: -m "msg avec espaces")
  // Retourner les tokens
}
```

### Affichage de la liste interactive

Quand `candidates.length > 1` :

**Dans le terminal xterm** :
- Afficher les candidats numérotés ou listés sous le prompt
- Ex :
  ```
  git ch[Tab]
  1. checkout
  2. cherry-pick
  
  git ch█  (le curseur reste, prêt à taper)
  ```

- Optionnel : permettre à l'utilisateur de naviguer (↑↓) et sélectionner (Enter)
- Ou : liste simple, prêt à la personne de continuer à taper

**Implémentation xterm** :
- Écrire dans la session xterm (ne pas modifier le prompt ni le texte existant)
- Utiliser `term.write()` et `term.writeln()` pour afficher
- Gérer les ansi codes pour coloration (bleu pour les candidats, ex.)

## Critères d'acceptation

### CA-autocomplete-01 : Complète commande unique

**Given**
- Input = `"git com"`
- Catalog contient `"commit"`

**When**
- Appel `autocomplete(input, catalog, snapshot)`

**Then**
- `candidates.length === 1`
- `completion === "mit"`
- `context === "commandName"`

### CA-autocomplete-02 : Liste candidats multiples (commande)

**Given**
- Input = `"git ch"`
- Catalog contient `"checkout"`, `"cherry-pick"`

**When**
- Appel `autocomplete(input, catalog, snapshot)`

**Then**
- `candidates === ["checkout", "cherry-pick"]`
- `completion === ""`
- `context === "commandName"`

### CA-autocomplete-03 : Pas de candidats

**Given**
- Input = `"git nosuch"`
- Aucune commande ne commence par `"nosuch"`

**When**
- Appel `autocomplete(input, catalog, snapshot)`

**Then**
- `candidates === []`
- `completion === ""`
- `context === "none"`

### CA-autocomplete-04 : Complète flag unique

**Given**
- Input = `"git reset --mi"`
- Catalog : reset a flags `--soft`, `--mixed`, `--hard`

**When**
- Appel `autocomplete(input, catalog, snapshot)`

**Then**
- `candidates === ["--mixed"]`
- `completion === "xed "` (avec espace)
- `context === "flag"`

### CA-autocomplete-05 : Liste flags multiples

**Given**
- Input = `"git reset --"`
- Reset a flags : `--soft`, `--mixed`, `--hard`

**When**
- Appel `autocomplete(input, catalog, snapshot)`

**Then**
- `candidates.length === 3`
- `candidates` contient les trois flags
- `completion === ""`

### CA-autocomplete-06 : Complète branche unique

**Given**
- Input = `"git checkout fe"`
- Snapshot.branches = `["main", "feature"]`

**When**
- Appel `autocomplete(input, catalog, snapshot)`

**Then**
- `candidates === ["feature"]`
- `completion === "ature"`
- `context === "ref"`

### CA-autocomplete-07 : Liste branches et tags

**Given**
- Input = `"git checkout "`
- Snapshot.branches = `["main", "feature"]`
- Snapshot.tags = `["v1.0", "release"]`

**When**
- Appel `autocomplete(input, catalog, snapshot)`

**Then**
- `candidates.length >= 4`
- `candidates` contient "main", "feature", "v1.0", "release"
- `completion === ""`

### CA-autocomplete-08 : Integration xterm (UI)

**Given**
- `TerminalPanel.vue` est actif
- Utilisateur a tapé `"git ch"` dans le terminal

**When**
- Utilisateur tape Tab

**Then**
- Le terminal affiche une liste des candidats ["checkout", "cherry-pick"]
- Ou auto-complète si un seul candidat
- Aucune exception

### CA-autocomplete-09 : Complétion sans briser l'input

**Given**
- Input = `"git reset --soft main"` (full command)

**When**
- Utilisateur tape Tab (après "main")

**Then**
- `candidates === []` (pas de complément supplémentaire après le ref)
- Aucune modification à l'input

### CA-autocomplete-10 : Respect de la casse

**Given**
- Input = `"git Ch"` (majuscule)
- Commande = `"checkout"` (minuscule)

**When**
- Appel `autocomplete(input, catalog, snapshot)`

**Then**
- Décision : ignorer la casse (recommandé Git) ou respecter ?
- **Choix Phase 6** : ignorer la casse (Git standard)
- `candidates === ["checkout"]` si input === `"git ch"`
- Suggestion : normaliser l'input en minuscule avant comparaison

### CA-autocomplete-11 : Filtre candidats par préfixe

**Given**
- Catalog avec commandes : init, add, status, ...
- Input = `"git s"`

**When**
- Appel `autocomplete(input, catalog, snapshot)`

**Then**
- `candidates` contient uniquement les commandes commençant par `"s"`
- Inclut : "status", "switch", "stash"
- Exclut : "init", "add", "checkout"

### CA-autocomplete-12 : Ordre des candidats

**Given**
- Candidats : ["cherry-pick", "checkout"]

**When**
- Retourne les candidats

**Then**
- Ordre alphabétique ou ordre du catalog (constant)
- Pas d'ordre aléatoire

## Implémentation : Points clés

1. **Fonction pure** : `src/utils/autocomplete.ts` contenant `autocomplete()` + helpers, testable headless (pas d'import Vue).

2. **Parser** : `tokenizeInput()` découpe par espaces, gère guillemets basiquement.

3. **Lookup** : Consommer le catalog du core sans duplication.

4. **xterm intégration** : Dans `TerminalPanel.vue`, capturer l'événement Tab, appeler `autocomplete()`, afficher les candidats dans le terminal.

5. **Candidats affichage** : Liste simple, une par ligne, précédée d'un index ou symbole (pour clarté visuelle).

6. **Pas de modification input** : L'autocomplétion propose des complétions, mais ne modifie pas directement le texte (l'utilisateur décide).

7. **Performance** : `getCandidateRefs()` peut être lent si snapshot énorme. Mettre en cache si nécessaire.

## Dépendances inter-commandes

- Dépend de **Fonctionnalité B** (catalogue de commandes) : lecture du catalog
- Dépend de **snapshot réactif** (Pinia) : branches, tags, commits
- Utilisée par **TerminalPanel.vue** (UI)

## Notes pour Phase 6

- L'autocomplétion est une amélioration UX ; pas de logique Git.
- Début simple (complète commandes + flags) ; refiner si besoin (ex: path completion, commit filter).
- Si Performance issue (gros snapshot) → ajouter debounce ou cache.
