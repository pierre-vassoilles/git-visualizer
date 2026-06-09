# Phase 7 (Axe B1) : git blame

## Résumé

La commande `git blame` annotera chaque ligne d'un fichier avec le **dernier commit l'ayant modifiée** (et ses métadonnées : hash court, auteur, date, message court). Utile pour :
- Tracer l'origine d'une ligne de code
- Identifier l'auteur et le moment d'une modification
- Auditer l'historique de changement par ligne
- Valeur pédagogique : comprendre que chaque ligne a une "généalogie" dans le dépôt

**Variantes** :
- `git blame <pathspec>` : annoter le fichier cible
- Optionnel Phase 7 : `-L <start>,<end>` (plage de lignes)
- Optionnel Phase 7 : `-C`, `-M` (détection de copie/déplacement)

**Format de sortie** :
- Texte : `<hash> (<author> <timestamp>) <line_content>` (style Git standard)
- Contrat UI : liste de `BlameEntry` pour intégration future dans un visualiseur (highlight par commit)

## Syntaxe

```
git blame [options] <pathspec>
```

### Options supportées en Phase 7

| Option | Argument | Comportement | Notes |
|--------|----------|-------------|-------|
| (aucun) | `<pathspec>` | Annoter le fichier complet | Format texte |
| `-L` | `<start>,<end>` | Limiter à plage de lignes | Optionnel ; `<start>` et `<end>` numéros ou regex |
| `-p` / `--porcelain` | (aucun) | Format machine (optionnel Phase 7) | Pour intégration UI |

**Remarques** :
- `-C`, `-M`, `-S`, `-w`, `--no-pager`, etc. ne sont pas implémentés Phase 7.
- Phase 7 implémente : texte simple + contrat de données pour UI.

## Concepts fondamentaux

### Algorithme de blame

Pour chaque ligne du fichier courant :
1. **Remonter l'historique** : parcourir le graphe des commits depuis HEAD
2. **Comparer le contenu** : pour chaque commit, récupérer le fichier à cet état
3. **Détecter la modification** : la première fois qu'une ligne change (vs parent), noter le commit
4. **Itérer jusqu'à la racine** : continuer jusqu'au premier commit touchant la ligne
5. **Résultat** : pour chaque ligne, le commit qui l'a créée ou modifiée en dernier

### Exemple de remontée

```
Historique du fichier "README.md" :
  C3 (HEAD): "## Installation"  (modifié)
  C2:        "# Project"         (créé)
             "## Installation"  (créé)
  C1:        n/a (fichier n'existe pas)
  C0:        (racine)

Après blame :
  Ligne 1 "# Project"        → C2
  Ligne 2 "## Installation"  → C3 (dernière modification)
```

### Cas spéciaux

**Fichier non suivi** : le fichier n'existe pas dans la branche tracked

**Fichier créé récemment** : toutes les lignes viennent du commit de création

**Fichier supprimé** : erreur "path does not exist"

**HEAD détaché** : traiter normalement (remonter depuis HEAD)

**Merge commits** : utiliser le 1er parent uniquement (pour éviter la complexité)

### Contrat de données pour l'UI

```typescript
export interface BlameEntry {
  /** Numéro de ligne (1-indexed) */
  lineNumber: number;
  /** Contenu de la ligne */
  content: string;
  /** Hash complet du commit */
  commitHash: string;
  /** Hash court (7 chars) */
  commitShort: string;
  /** Auteur (format "Name <email>") */
  author: string;
  /** Timestamp Unix */
  timestamp: number;
  /** Message du commit (première ligne seulement) */
  subject: string;
}
```

Exposer dans `snapshot.blameResult` (optionnel pour Phase 7 ; contrat futur).

## Comportement nominal

### Cas 1 : Blame simple (une seule version du fichier)

**Condition** :
- Repository : C0 (tree: {file.txt: "line 1\nline 2"}) ← C1 (tree: {file.txt: "line 1\nline 2"}) (HEAD)
- Fichier n'a jamais changé

**Commande** : `git blame file.txt`

**Processus** :
1. Vérifier que `file.txt` existe dans HEAD
2. Récupérer le contenu HEAD : `["line 1", "line 2"]`
3. Pour chaque ligne :
   - Remonter le graphe depuis HEAD
   - Chercher le commit l'ayant introduite/modifiée
   - Pour "line 1" : trouvée en C0 → blame = C0
   - Pour "line 2" : trouvée en C0 → blame = C0
4. **Formatage** :
   ```
   abc1234 (Unnamed <unnamed@example.com> 2025-06-09 12:00:00) line 1
   abc1234 (Unnamed <unnamed@example.com> 2025-06-09 12:00:00) line 2
   ```
5. **Code de sortie** : 0

### Cas 2 : Blame avec plusieurs modifications

**Condition** :
```
C0: file.txt = "line 1\nline 2"
C1: file.txt = "line 1\nLINE 2 EDITED"  (modifie ligne 2)
HEAD: C1
```

**Commande** : `git blame file.txt`

**Processus** :
1. Récupérer contenu HEAD : `["line 1", "LINE 2 EDITED"]`
2. Pour "line 1" : chercher origine
   - En C1 : existe
   - Parent C0 : existe identique
   - C0 est le premier commit touchant "line 1" → blame = C0
3. Pour "LINE 2 EDITED" :
   - En C1 : existe
   - Parent C0 : "line 2" (différent)
   - C1 est le premier commit la modifiant → blame = C1
4. **Sortie** :
   ```
   abc1234 (... 2025-...) line 1
   def5678 (... 2026-...) LINE 2 EDITED
   ```
5. **Code de sortie** : 0

### Cas 3 : Blame avec addition de lignes

**Condition** :
```
C0: file.txt = "line 1"
C1: file.txt = "line 1\nline 2\nline 3"  (ajoute lignes 2 et 3)
HEAD: C1
```

**Commande** : `git blame file.txt`

**Processus** :
1. Pour "line 1" : trouvée inchangée depuis C0 → C0
2. Pour "line 2" : nouvelle en C1 → C1
3. Pour "line 3" : nouvelle en C1 → C1
4. **Sortie** :
   ```
   abc1234 (...) line 1
   def5678 (...) line 2
   def5678 (...) line 3
   ```

### Cas 4 : Blame avec suppression de lignes

**Condition** :
```
C0: file.txt = "line 1\nline 2\nline 3"
C1: file.txt = "line 1\nline 3"  (supprime ligne 2)
HEAD: C1
```

**Commande** : `git blame file.txt`

**Processus** :
1. Contenu HEAD : 2 lignes
2. Pour "line 1" : C0
3. Pour "line 3" : C0 (pas modifiée)
4. **Sortie** :
   ```
   abc1234 (...) line 1
   abc1234 (...) line 3
   ```

### Cas 5 : Blame HEAD détaché

**Condition** : HEAD détaché sur un commit spécifique (pas de branche)

**Processus** : Identique (remonter depuis HEAD, peu importe s'il est détaché)

**Sortie** : Standard

### Cas 6 : Blame option `-L` (plage de lignes)

**Condition** : `git blame -L 2,4 file.txt` (annoter lignes 2 à 4 seulement)

**Processus** :
1. Récupérer le contenu complet
2. Calculer blame pour toutes les lignes (internal)
3. Filtrer le résultat : ne montrer que les lignes 2 à 4
4. **Sortie** : uniquement lignes 2-4 avec leurs annotations

### Cas 7 : Contrat de données pour UI (Porcelain)

**Condition** : Interne ; snapshot expose `blameResult`

**Structure** :
```json
{
  "file": "file.txt",
  "entries": [
    {
      "lineNumber": 1,
      "content": "line 1",
      "commitHash": "abc123...",
      "commitShort": "abc1234",
      "author": "Unnamed <unnamed@example.com>",
      "timestamp": 1749627600,
      "subject": "Initial commit"
    },
    ...
  ]
}
```

## Cas d'erreur

### Fichier non suivi / inexistant

**Condition** : `git blame nonexistent.txt` (fichier n'existe pas dans HEAD)

**Message d'erreur** :
```
fatal: <pathspec>: no such path in revision <HEAD>
```

**Code de sortie** : 128

**Comportement** : Aucune sortie.

### Dépôt non initialisé

**Condition** : Appeler `git blame <file>` sans `git init`

**Message d'erreur** :
```
fatal: not a git repository (or any of the parent directories): .git
```

**Code de sortie** : 128

### Dépôt sans commits

**Condition** : `git init` mais pas encore de commits

**Message d'erreur** :
```
fatal: No commits yet
```

**Code de sortie** : 128

### Plage de lignes invalide

**Condition** : `git blame -L 10,5 file.txt` (start > end)

**Message d'erreur** :
```
fatal: Malformed line range specification -L 10,5
```

**Code de sortie** : 128

**Comportement** : Aucune sortie.

### Plage de lignes hors limites

**Condition** : `git blame -L 1,100 file.txt` mais le fichier n'a que 5 lignes

**Comportement Phase 7** :
- Afficher jusqu'à la fin du fichier (comportement lenient)
- Ou refuser (comportement strict, comme Git)
- Phase 7 choisit : **afficher jusqu'à la fin** (tolérant)

## Critères d'acceptation

### CA-blame-01 : Blame simple (une seule version)

**Given**
- Repository : C0 (file.txt: "hello\nworld"), HEAD = C0

**When**
- Exécute `git blame file.txt`

**Then**
- `exitCode === 0`
- `output.length === 2` (deux lignes)
- Chaque ligne contient :
  - Hash court de C0 (abc1234)
  - Auteur "Unnamed <...>"
  - Date
  - Contenu ("hello", "world")

### CA-blame-02 : Blame avec modifications

**Given**
- Repository :
  - C0: file.txt = "line 1\nline 2"
  - C1: file.txt = "line 1\nLINE 2 EDITED"
  - HEAD = C1

**When**
- Exécute `git blame file.txt`

**Then**
- `exitCode === 0`
- Ligne 1 : blame = C0
- Ligne 2 : blame = C1
- `output[0]` contient "abc1234" (C0)
- `output[1]` contient "def5678" (C1)

### CA-blame-03 : Blame avec ajout de lignes

**Given**
- Repository :
  - C0: file.txt = "line 1"
  - C1: file.txt = "line 1\nline 2\nline 3"
  - HEAD = C1

**When**
- Exécute `git blame file.txt`

**Then**
- `exitCode === 0`
- Lignes 2 et 3 : blame = C1
- Ligne 1 : blame = C0
- `output.length === 3`

### CA-blame-04 : Blame avec suppression de lignes

**Given**
- Repository :
  - C0: file.txt = "a\nb\nc"
  - C1: file.txt = "a\nc" (supprime "b")
  - HEAD = C1

**When**
- Exécute `git blame file.txt`

**Then**
- `exitCode === 0`
- `output.length === 2` (seulement "a" et "c" affichées)
- Ligne 1 "a" : blame = C0
- Ligne 2 "c" : blame = C0

### CA-blame-05 : Fichier inexistant

**Given**
- Repository avec commits

**When**
- Exécute `git blame nosuchfile.txt`

**Then**
- `exitCode === 128`
- `errors[0]` contient "no such path"

### CA-blame-06 : Dépôt non initialisé

**Given**
- Engine en état vierge (pas d'init)

**When**
- Exécute `git blame file.txt`

**Then**
- `exitCode === 128`
- `errors[0]` contient "not a git repository"

### CA-blame-07 : Dépôt sans commits

**Given**
- Repository initialisée (`git init`), aucun commit

**When**
- Exécute `git blame file.txt`

**Then**
- `exitCode === 128`
- `errors[0]` contient "No commits yet"

### CA-blame-08 : Blame HEAD détaché

**Given**
- HEAD détaché sur un commit C1 (file.txt présent)

**When**
- Exécute `git blame file.txt`

**Then**
- `exitCode === 0`
- Output standard (détaché ne change rien)

### CA-blame-09 : Format output (ligne par ligne)

**Given**
- Repository : C0 (file.txt = "hello")

**When**
- Exécute `git blame file.txt`

**Then**
- `exitCode === 0`
- Format : `<hash> (<author> <date>) <content>`
- Exemple : `abc1234 (Unnamed <unnamed@example.com> Mon Jun 9 12:00:00 2025 +0000) hello`

### CA-blame-10 : Blame option `-L` (plage)

**Given**
- Repository : file.txt avec 5 lignes

**When**
- Exécute `git blame -L 2,4 file.txt`

**Then**
- `exitCode === 0`
- `output.length === 3` (lignes 2, 3, 4)
- Lignes 1 et 5 absentes de l'output

### CA-blame-11 : Blame avec révisions HEAD~n

**Given**
- Repository : C0 ← C1 ← C2 (HEAD)
- file.txt modifiée à chaque commit

**When**
- Exécute `git blame HEAD~1 -- file.txt`

**Then**
- `exitCode === 0`
- Blame calculated against HEAD~1 (C1), pas HEAD (C2)

### CA-blame-12 : Contrat de données blameResult

**Given**
- Repository avec file.txt

**When**
- Internement : `engine.blame("file.txt")` retourne `BlameResult`

**Then**
- `snapshot.blameResult` contient :
  - `file: "file.txt"`
  - `entries: BlameEntry[]`
  - Chaque entry : `{lineNumber, content, commitHash, commitShort, author, timestamp, subject}`

### CA-blame-13 : Multiple modifications même fichier

**Given**
- Repository :
  - C0: file = "a\nb"
  - C1: file = "a\nB" (modifie b)
  - C2: file = "A\nB" (modifie a)
  - HEAD = C2

**When**
- Exécute `git blame file.txt`

**Then**
- `exitCode === 0`
- Ligne 1 "A" : blame = C2
- Ligne 2 "B" : blame = C1

### CA-blame-14 : Plage invalide (-L start > end)

**Given**
- file.txt avec plusieurs lignes

**When**
- Exécute `git blame -L 5,2 file.txt`

**Then**
- `exitCode === 128`
- `errors[0]` contient "Malformed"

### CA-blame-15 : Fichier vide

**Given**
- Repository : file.txt vide (crée en C0)

**When**
- Exécute `git blame file.txt`

**Then**
- `exitCode === 0`
- `output` vide (pas de lignes à annoter)

### CA-blame-16 : Blame avec merge commits

**Given**
- Repository :
  - C0 ← C1 (main)
  - C0 ← C2 (feature)
  - Merge M : parents = [C1, C2]
  - file.txt modifiée en C2, merge en M
  - HEAD = M

**When**
- Exécute `git blame file.txt`

**Then**
- `exitCode === 0`
- Les lignes modifiées en C2 sont blâmées à C2 (utiliser 1er parent pour remonter)
- Pas d'erreur due au merge

## Décisions de conception (Phase 7)

| Aspect | Décision |
|--------|----------|
| **Algorithme de remontée** | BFS/DFS suivant 1er parent uniquement (merge : ignorer 2e parent) |
| **Comparaison ligne à ligne** | Comparaison simple (string `===`) ; pas de diff raffiné |
| **Détection de copie/déplacement** | Pas implémenté Phase 7 (-C, -M) |
| **Format texte** | Standard Git : `<hash> (<author> <date>) <content>` |
| **Contrat UI (Porcelain)** | `BlameEntry[]` exposé dans snapshot (optionnel pour Phase 7) |
| **Option `-L`** | Implémentée (simple : filtrage post-calcul) |
| **Fichier inexistant** | Erreur "no such path" |
| **Historique non-linéaire** | Accepter les merges ; 1er parent uniquement |

## Modèle de données

### BlameResult (nouveau type)

```typescript
export interface BlameResult {
  file: string;
  entries: BlameEntry[];
}

export interface BlameEntry {
  lineNumber: number;
  content: string;
  commitHash: string;
  commitShort: string;
  author: string;
  timestamp: number;
  subject: string; // première ligne du message
}
```

### Repository (optionnel pour Phase 7 ; contrat futur)

Ne pas ajouter à `repo` (c'est un output, pas un état persistant).

### RepoSnapshot (extension optionnelle)

```typescript
export interface RepoSnapshot {
  // ... champs existants
  /** Résultat de blame (optionnel, si dernier blame en mémoire) */
  blameResult?: BlameResult;
}
```

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/model.ts` | Ajouter `BlameResult`, `BlameEntry` |
| `src/core/repository.ts` | Helpers : `getFileAtCommit(repo, path, commit)`, `computeBlame(repo, path)` |
| `src/core/commands/blame.ts` | **Nouveau fichier** : implémenter `cmdBlame` avec parsing `-L`, formatage texte, contrat données |
| `src/core/engine.ts` | Route `blame` vers handler |
| Tests | Couvrir `49-blame.md` CA-* |

## Notes d'implémentation

### Récupération du fichier à un commit

```typescript
function getFileAtCommit(
  repo: Repository,
  path: string,
  commitHash: string
): string | null {
  const commit = getCommit(repo, commitHash);
  if (!commit) return null;
  
  const tree = getObject(repo, commit.tree);
  if (tree.type !== 'tree') return null;
  
  // Naviguer dans l'arbre pour trouver le blob
  const blob = navigateTree(repo, tree, path);
  return blob ? blob.content : null;
}
```

### Calcul du blame (remontée d'historique)

```typescript
function computeBlame(
  repo: Repository,
  path: string
): BlameEntry[] {
  const headHash = headCommitHash(repo);
  if (!headHash) return []; // Pas de commits
  
  const currentContent = getFileAtCommit(repo, path, headHash);
  if (currentContent === null) return []; // Fichier absent
  
  const lines = currentContent.split('\n');
  const blame: BlameEntry[] = [];
  
  // Initialiser : chaque ligne assume venir de HEAD
  const lineToCommit = new Map<number, string>();
  lines.forEach((_, i) => lineToCommit.set(i, headHash));
  
  // Remonter l'historique
  const visited = new Set<string>();
  const queue = [headHash];
  
  while (queue.length > 0) {
    const currentHash = queue.shift()!;
    if (visited.has(currentHash)) continue;
    visited.add(currentHash);
    
    const currentCommit = getCommit(repo, currentHash);
    if (!currentCommit || currentCommit.parents.length === 0) {
      // Racine : aucun parent, toutes les lignes restantes viennent d'ici
      continue;
    }
    
    // Comparer avec le 1er parent
    const parentHash = currentCommit.parents[0];
    queue.push(parentHash);
    
    const parentContent = getFileAtCommit(repo, path, parentHash);
    const parentLines = parentContent ? parentContent.split('\n') : [];
    
    // Déterminer quelles lignes ont changé
    for (let i = 0; i < lines.length; i++) {
      if (lineToCommit.get(i) === currentHash) {
        // Cette ligne n'a pas encore été blâmée plus loin
        if (i >= parentLines.length || parentLines[i] !== lines[i]) {
          // La ligne a changé (ou existe seulement dans current)
          lineToCommit.set(i, currentHash);
        } else {
          // La ligne est identique au parent
          lineToCommit.set(i, parentHash);
        }
      }
    }
  }
  
  // Construire les BlameEntry
  for (let i = 0; i < lines.length; i++) {
    const commitHash = lineToCommit.get(i) || headHash;
    const commit = getCommit(repo, commitHash);
    const shortHash = commitHash.slice(0, 7);
    const subject = commit.message.split('\n')[0];
    
    blame.push({
      lineNumber: i + 1, // 1-indexed
      content: lines[i],
      commitHash,
      commitShort: shortHash,
      author: commit.author,
      timestamp: commit.date,
      subject,
    });
  }
  
  return blame;
}
```

### Parsing de `-L start,end`

```typescript
function parseLineRange(rangeStr: string): { start: number; end: number } | null {
  const match = /^(\d+)(?:,(\d+))?$/.exec(rangeStr);
  if (!match) return null;
  
  const start = parseInt(match[1]!, 10);
  const end = match[2] ? parseInt(match[2]!, 10) : start;
  
  if (start > end || start < 1) return null;
  
  return { start, end };
}
```

### Formatage pour affichage

```typescript
function formatBlameLine(entry: BlameEntry): string {
  const dateStr = new Date(entry.timestamp * 1000).toISOString().slice(0, 10); // YYYY-MM-DD
  return `${entry.commitShort} (${entry.author} ${dateStr}) ${entry.content}`;
}
```

---

## Valeur pédagogique

Le blame **crée une connexion directe ligne → commit → historique** :
- Voir qui a écrit une ligne (auteur, date)
- Comprendre l'évolution d'un fichier ligne par ligne
- Tracer un bug jusqu'à sa source (utilisé en combinaison avec bisect)
- Apprendre que l'historique est immuable mais traçable

Futur (Phase 8+) : visualiseur de blame dans l'UI (highlight par commit, clic pour voir le commit complet).
