# Phase 6+ – `git log --graph` (rendu ASCII)

## Résumé

Cette spec couvre la commande `git log --graph [--oneline]` : afficher l'historique des commits sous forme de **graphe ASCII texte** directement dans le terminal (xterm). Les caractères `*`, `|`, `/`, `\` esquissent les branches, merges, et chemins parent-enfant. C'est pédagogique : l'utilisateur comprend la structure du DAG en regardant le texte.

**Exemple** :

```
* commit abc1234
| Author: Unnamed <unnamed@example.com>
| Date:   Mon Jun 9 12:00:00 2025 +0000
|
|     Third commit
|
* commit def5678
| Author: ...
|
|     Second commit
|
* commit abc1111
  Author: ...

      First commit
```

Avec `--oneline` :

```
* abc1234 Third commit
* def5678 Second commit
* abc1111 First commit
```

Avec branches/merges :

```
*   abc1234 Merge branch 'feature'
|\
| * def5678 Feature commit
| |
| * abc5555 Another feature
|/
* abc2222 Main branch commit
* abc3333 First commit
```

## 1. Architecture

### 1.1 Répartition logique

**Core (moteur, TS pur)** : `src/core/commands/log.ts`
- Logique d'affichage des commits (format long/--oneline existant).
- **Nouveau** : `formatGraphLine(commit, graphState): string` → ligne ASCII avec graphe.

**Structure graphique** : `src/graph/ascii.ts` (nouveau, pur)
- **Fonction** : `renderGraphAscii(commits: SnapshotCommit[], options): string[]`
- **Entrée** : liste de commits (du snapshot), optionnel : HEAD, branches.
- **Sortie** : lignes de texte ASCII (1 ligne = 1 "colonne" de graphe, largeur ~200 chars).
- **Aucune dépendance Vue** : testé headless (Vitest).

**Composant UI** : `TerminalPanel.vue`
- Affiche déjà la sortie du moteur (texte brut).
- Pas de changement (la sortie du moteur est du texte, juste affiché).

### 1.2 Flux

```
xterm → terminal input: "git log --graph"
                    ↓
store.execute("log --graph")
                    ↓
engine.execute() → core/commands/log.ts
                    ↓
snapshotCommits + calculateLayout() (optionnel, pour layout)
+ renderGraphAscii(snapshotCommits, { layout })
                    ↓
CommandResult.output = [ "* abc1234 ...", "| ...", "..." ]
                    ↓
TerminalPanel affiche les lignes
```

### 1.3 Algorithme d'ASCII art

L'algorithme repose sur :

1. **Ordre des commits** : tri topologique (du snapshot, ou depuis le moteur).
2. **Lane assignment** : utiliser le modèle de layout (spec 16) pour savoir sur quelle "colonne" chaque commit apparaît.
3. **Tracé ASCII** : pour chaque commit, dessiner les caractères `*`, `|`, `/`, `\`, selon la lane et la connectivité parent-enfant.

**Exemple avec 2 branches** :

```
Lane 0          Lane 1
*               (C3, main)
|               
*               (C2)
|\              
| *             (C1b, feature)
|/              
*               (C1, ancestor)
```

En ASCII, on alterne le codage ligne par ligne :

```
* |     C3 main
* |     C2
|\ \    (merge)
| * |   C1b feature
|/ /    (merge resolve)
* |     C1 ancestor
```

## 2. Signature de fonction

```typescript
// src/graph/ascii.ts

interface GraphAsciiOptions {
  /** Si true, afficher aussi le message et author (long format). Défaut: false (--oneline). */
  verbose?: boolean;

  /** Palette pour les noms de commits. Défaut: null (pas de couleur). */
  colorize?: boolean;

  /** Width max de la zone ASCII. Défaut: 80 chars. */
  maxWidth?: number;

  /** Layout du graphe (en cache depuis spec 16, optionnel). */
  layout?: GraphLayout;

  /** Commits actuellement visibles (depuis snapshot). */
  commits: SnapshotCommit[];

  /** Branches du dépôt (pour les décorer). */
  branches: Record<string, string>;

  /** HEAD (pour marquer le commit courant). */
  head: { type: 'branch' | 'detached'; hash: string; name?: string };
}

export function renderGraphAscii(options: GraphAsciiOptions): string[] {
  // Retourne un tableau de lignes ASCII
}
```

## 3. Algorithme détaillé

### 3.1 Étape 1 : Tri topologique et calcul de lanes

```typescript
// Réutiliser le modèle de layout pour les lanes stables
const topSorted = topologicalSort(options.commits);
const commitMap = new Map(options.commits.map(c => [c.hash, c]));
const childrenMap = buildChildrenMap(options.commits);
const depths = calculateDepths(options.commits, topSorted);
const laneAssignments = assignLanes({
  topSorted,
  commitMap,
  childrenMap,
  branches: options.branches,
  depths,
});

// Maintenant, chaque commit a une lane (0, 1, 2, ...)
const laneCount = Math.max(...Array.from(laneAssignments.values())) + 1;
```

### 3.2 Étape 2 : Générer une ligne ASCII par commit

Pour chaque commit (en ordre de profondeur, de haut en bas) :

```typescript
for (const commit of topSorted) {
  const lane = laneAssignments.get(commit.hash) ?? 0;
  const depth = depths.get(commit.hash) ?? 0;
  const children = childrenMap.get(commit.hash) ?? [];

  const isLinear = children.length === 1 && /* parent unique de l'enfant */;
  const isMerge = commit.parents.length > 1;
  const hasChildren = children.length > 0;

  // Construire la ligne ASCII
  const asciiLine = buildCommitLine(
    commit,
    lane,
    laneCount,
    children,
    isLinear,
    isMerge,
    options.verbose,
  );

  lines.push(asciiLine);

  // Optionnel : ajouter une ligne de séparation visuelle (trait)
  if (hasChildren && !isLinear) {
    lines.push(buildMergeLine(lane, children, laneCount));
  }
}
```

### 3.3 Fonction buildCommitLine

```typescript
function buildCommitLine(
  commit: SnapshotCommit,
  lane: number,
  laneCount: number,
  children: string[],  // hashes des enfants
  isLinear: boolean,
  isMerge: boolean,
  verbose: boolean,
): string {
  // Exemple avec 2 lanes (lane 0, lane 1)
  // Résultat : "*   <message>" ou "| *   <message>" ou "|\  <message>"

  let prefix = '';

  for (let i = 0; i < laneCount; i++) {
    if (i === lane) {
      // C'est la lane du commit courant
      if (isLinear) {
        // Seul enfant, même lane : ligne droite
        prefix += '* ';
      } else if (isMerge) {
        // Merge : astérisque spécial ou accent
        prefix += '*';
        // Ajouter une arête vers l'autre parent ?
      } else {
        prefix += '* ';
      }
    } else {
      // Autre lane
      if (isLinear && !isMerge) {
        // Lane vide en mode linéaire : espace
        prefix += '  ';
      } else {
        // Lane connectée : trait vertical |
        prefix += '| ';
      }
    }
  }

  // Ajouter le commit info
  let commitInfo = '';
  if (verbose) {
    commitInfo = `commit ${commit.hash}\nAuthor: ...\nDate: ...\n\n    ${commit.message}`;
  } else {
    commitInfo = `${commit.shortHash} ${commit.message.split('\n')[0]}`;
  }

  return prefix + commitInfo;
}
```

### 3.4 Fonction buildMergeLine (trait de merge)

Quand deux branches convergen (merge), dessiner un trait :

```typescript
function buildMergeLine(
  targetLane: number,
  parentLanes: number[],
  laneCount: number,
): string {
  // Exemple : merge de lane 1 vers lane 0
  // Afficher :
  //   |\ 
  //   | \
  // ou
  //   /|
  //  / |

  let line = '';
  for (let i = 0; i < laneCount; i++) {
    if (i === targetLane) {
      line += '|\\';  // ou /\ selon la direction
    } else if (parentLanes.includes(i)) {
      line += ' |';
    } else {
      line += '  ';
    }
  }
  return line;
}
```

## 4. Cas spécialisés

### 4.1 Historique linéaire (une seule branche)

```
* abc1234 Third commit
* def5678 Second commit
* abc1111 First commit
```

Tous les commits sur la même lane, aucun merge. Prefix : `*` suivi du message.

### 4.2 Branches parallèles (sans merge encore)

```
* abc1234 Feature commit 2 (feature)
|
* def5678 Feature commit 1
|
|   abc2222 Main commit 2 (main)
|   /
|  /
| /
* abc3333 Ancestor (both branches)
```

**Tracé** : deux lanes, traits `|` qui se séparent, puis se rejoignent au ancestor.

### 4.3 True merge (2+ parents)

```
*   abcMERG Merge branch 'feature' (main, HEAD)
|\
| * def5678 Feature commit
|/
* abc1111 Main commit
```

**Tracé** : 
- Lane 0 : `*` pour le merge.
- Ligne intermédiaire : `|\` (bifurcation).
- Lane 1 : `|` pour les commits feature.
- Ligne finale : `/` (convergence).

### 4.4 HEAD détaché

Décorer le commit pointé par HEAD :

```
* abc1234 Third commit (HEAD, main)  <- HEAD et main
* def5678 Second commit
* abc1111 First commit
```

Ou si HEAD détaché :

```
* abc1234 Third commit (HEAD)  <- HEAD seul
* def5678 Second commit (main)
* abc1111 First commit
```

## 5. Implémentation dans core/commands/log.ts

Modifier la commande `git log` existante pour supporter `--graph` :

```typescript
// src/core/commands/log.ts

export function cmdLog(repo: Repository, args: string[]): CommandResult {
  const oneline = args.includes('--oneline');
  const graph = args.includes('--graph');

  // ... (checks: repo initialized, commits exist) ...

  const commits = getAccessibleCommits(repo);

  let output: string[] = [];

  if (graph) {
    // Nouveau : affichage graphe ASCII
    const asciiLines = renderGraphAscii({
      commits,
      branches: repo.refs.branches,
      head: repo.head,
      verbose: !oneline,
      layout: undefined,  // Optionnel : passer le layout pour cohérence
    });
    output = asciiLines;
  } else {
    // Existant : affichage long ou --oneline
    output = commits.map((c) => {
      if (oneline) {
        return `${c.shortHash} ${c.message.split('\n')[0]}`;
      } else {
        return formatLongCommit(c);
      }
    });
  }

  return ok(output);
}
```

## 6. Considérations de performance

### 6.1 Commits nombreux

Pour un dépôt avec >500 commits, l'algorithme reste O(C + E) :
- Tri topologique : O(C + E)
- Calcul lanes : O(C + E)
- Génération ASCII : O(C)
- Total : O(C + E) acceptable

### 6.2 Width du terminal

Si `maxWidth=80` et plusieurs branches, le graphe peut être "compressé" (plusieurs lanes sur <80 chars). **Approx** : 3-4 chars par lane (` | ` ou ` * `). Avec 20 lanes, c'est ~80 chars, déjà au limite. **Optionnel** : réduire la taille ou scroller horizontalement.

## 7. Critères d'acceptation

### CA-log-graph-01 : Commande --graph seule

- [ ] User : `git log --graph`
- [ ] Résultat : texte ASCII avec graphe.
- [ ] Format long (Author, Date, message indenté).
- [ ] Chaque commit : `*` sur sa lane.

### CA-log-graph-02 : --graph --oneline combinés

- [ ] User : `git log --graph --oneline`
- [ ] Résultat : texte ASCII compact.
- [ ] Format court : `<HASH> <message>` (une ligne par commit).

### CA-log-graph-03 : Historique linéaire

- [ ] Historique : C1 ← C2 ← C3 (linéaire).
- [ ] Affichage :
  ```
  * abc1234 C3
  * def5678 C2
  * abc1111 C1
  ```
- [ ] Tous sur lane 0, `*` aligné verticalement.

### CA-log-graph-04 : Branches parallèles

- [ ] Deux branches divergentes (sans merge).
- [ ] Affichage : deux lanes avec traits `|` qui se séparent.
- [ ] Ancestor en bas avec traits convergents.

### CA-log-graph-05 : True merge (2 parents)

- [ ] Merge commit avec 2 parents.
- [ ] Affichage : `*` pour le merge, `|\` ou `/\` pour la bifurcation, traits de convergence.
- [ ] Deux arêtes distinctes vers les deux parents.

### CA-log-graph-06 : Décoration HEAD

- [ ] Commit pointé par HEAD : badge `(HEAD)` au bout de la ligne (ou `(HEAD -> main)`).
- [ ] HEAD détaché : badge `(HEAD)` seul.
- [ ] Branches : badges `(branchName)` sur les tips.

### CA-log-graph-07 : Tags décorés

- [ ] Commit tagué : badge `(tag: tagName)` au bout de la ligne.
- [ ] Tags apparaissent à côté du shortHash.

### CA-log-graph-08 : Cas vide / aucun commit

- [ ] Repo vierge : `fatal: No commits yet` (déjà géré).
- [ ] Pas d'affichage graphe.

### CA-log-graph-09 : Repo non initialisé

- [ ] Pas d'init : `fatal: not a git repository` (déjà géré).

### CA-log-graph-10 : Commits inaccessibles (détachés)

- [ ] HEAD pointe un commit "orphelin" (aucune branche ne le pointe).
- [ ] Affichage : `*` sur sa lane, decoré `(HEAD)`.
- [ ] Commits antérieurs affichés jusqu'à la racine.

### CA-log-graph-11 : Ordre topologique

- [ ] Enfants avant parents (mais lisibles de haut en bas).
- [ ] Pour tout commit C : enfants de C sont listés avant C.

### CA-log-graph-12 : Determinisme

- [ ] Même repo → même affichage ASCII à chaque appel.
- [ ] Ordre des lanes stable (branches triées algo).

### CA-log-graph-13 : Sans --graph, pas de changement

- [ ] User : `git log` (sans --graph).
- [ ] Affichage : format long, **pas d'ASCII art** (spec 05 inchangée).

### CA-log-graph-14 : Format long verbose

- [ ] User : `git log --graph` (sans --oneline).
- [ ] Affichage : ASCII + auteur + date + message indenté (spec 05, long format).

### CA-log-graph-15 : Performance gros DAG

- [ ] 500 commits : exécution < 100ms.
- [ ] Pas de hang ou lag.

### CA-log-graph-16 : Caractères ASCII uniquement

- [ ] Output : `*`, `|`, `/`, `\`, espace, alphanumériques.
- [ ] Aucun caractère UTF-8 ou émoji (compatibilité xterm).

### CA-log-graph-17 : Pas de color ANSI (Phase 6)

- [ ] Affichage en texte brut (pas de `\x1b[...` color codes).
- [ ] Optionnel en Phase 7 : couleurs ANSI.

---

## 4. Notes pour implémentation

1. **Fonction dans core** : `renderGraphAscii` en `src/graph/ascii.ts` ou `src/core/ascii.ts`.
2. **Réutiliser layout** : optionnel, mais recommandé pour cohérence avec le graphe SVG.
3. **Ordre**: partir du HEAD (ou tous les roots si détaché) et remonter.
4. **Stabilité clés** : même commit = même position ASCII à chaque appel.
5. **Tests** : snapshot les lignes produites (Vitest can match multi-line strings).
6. **Integration** : modifier `cmdLog` dans `src/core/commands/log.ts` pour dispatcher sur graph vs long/oneline.

## 5. Exemples de test

### Test 1 : Historique linéaire

```typescript
it('should render linear history as ASCII graph', () => {
  const commits = [
    { hash: 'aaa', parents: [], message: 'First' },
    { hash: 'bbb', parents: ['aaa'], message: 'Second' },
    { hash: 'ccc', parents: ['bbb'], message: 'Third' },
  ];

  const lines = renderGraphAscii({
    commits,
    branches: { main: 'ccc' },
    head: { type: 'branch', name: 'main', hash: 'ccc' },
    verbose: true,
  });

  // Assert: lines[0] contient "* ccc Third (main, HEAD)"
  // Assert: lines[n] contient "* bbb Second"
  // Assert: pas de |, /, \ (linéaire)
});
```

### Test 2 : Merge

```typescript
it('should render merge with two parents', () => {
  const commits = [
    { hash: 'ancestor', parents: [], message: 'Ancestor' },
    { hash: 'main', parents: ['ancestor'], message: 'Main' },
    { hash: 'feature', parents: ['ancestor'], message: 'Feature' },
    {
      hash: 'merge',
      parents: ['main', 'feature'],
      message: 'Merge',
    },
  ];

  const lines = renderGraphAscii({ commits, /* ... */ });

  // Assert: lines contiennent |\
  // Assert: merge sur lane de main
  // Assert: feature sur lane différente
});
```

## 6. Dépendances inter-specs

- **Spec 16 (layout)** : optionnel (utiliser pour cohérence).
- **Spec 05 (log)** : étendre (pas remplacer).
- **Spec 17 (render)** : pas d'impact (rendu texte, pas SVG).
- **Spec 52, 53, 54** : pas d'impact.
