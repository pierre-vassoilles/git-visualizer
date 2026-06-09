# Phase 3 – Visualisation graphique : Modèle de données et contrats

## Contexte

La Phase 3 visualise l'arborescence Git (DAG des commits) dans `GraphView.vue` à partir du snapshot réactif exposé par le store `repo.ts`. Le moteur Git (Phase 1–2) produit actuellement un **snapshot limité** : seuls les commits accessibles depuis HEAD via `getCommitHistoryWithHashes(repo)`.

Pour une visualisation graphique fidèle de toutes les branches (divergentes ou cachées), il faut **accéder à TOUS les commits du dépôt**, pas seulement ceux depuis HEAD. Cette spec définie :

1. **L'extension du snapshot** pour exposer l'historique complet.
2. **Le contrat de sortie de l'algorithme de layout** (types TypeScript).
3. **Les responsabilités** entre moteur, store et composant graphe.

## 1. Extension du `RepoSnapshot`

### 1.1 Problème

Aujourd'hui, `snapshot.commits` = résultat de `getCommitHistoryWithHashes(repo)`, qui ne retourne que les commits **accessibles depuis HEAD** (via parcours BFS/DFS des parents). Cela signifie :

- Si on a deux branches divergentes `main` et `feature`, et que HEAD pointe sur `main`, les commits isolés de `feature` (non ancêtres de `main`) n'apparaissent PAS dans `snapshot.commits`.
- Le graphe ne peut donc pas les visualiser.

### 1.2 Solution : ajouter `allCommits`

On **enrichit** `RepoSnapshot` avec un **nouveau champ optionnel** qui expose tous les commits du dépôt, quel que soit l'état de HEAD.

```typescript
/** Snapshot sérialisable et immuable de l'état du dépôt. */
export interface RepoSnapshot {
  // Champs existants (cf. engine.ts)
  readonly initialized: boolean;
  readonly branches: Record<string, string>;
  readonly head: { readonly type: 'branch'; readonly name: string } | { readonly type: 'detached'; readonly hash: string };
  readonly commits: SnapshotCommit[];  // Toujours : commits depuis HEAD (backward compat)
  readonly tags: Record<string, string>;
  readonly indexPaths: string[];
  readonly files: SnapshotFile[];

  // NOUVEAU (Phase 3) : tous les commits du dépôt, du plus récent au plus ancien
  // (tri topologique inversé, voir section 1.3)
  readonly allCommits?: SnapshotCommit[];
}
```

### 1.3 Calcul de `allCommits`

L'algorithme dans `engine.ts:snapshot()` doit :

1. **Parcourir TOUS les objets** du store d'objets (`repo.objects`).
2. **Filtrer** ceux de type `commit`.
3. **Trier** en ordre topologique inversé (parents avant enfants, plus récent d'abord).
4. **Décorer** chaque commit avec ses branches et tags (identique à `commits`).

**Tri topologique inversé** : parcours en profondeur depuis les "leaves" (commits sans enfants). Un commit A doit apparaître avant B dans la liste si B est un enfant de A.

```typescript
// Pseudo-code (implémentation détaillée en phase 4)
function getAllCommitsTopologicalOrder(repo: Repository): SnapshotCommit[] {
  // 1. Collecter tous les commits
  const commitObjects = new Map<string, Commit>();
  for (const [hash, obj] of Object.entries(repo.objects)) {
    if (obj && obj.type === 'commit') {
      commitObjects.set(hash, obj);
    }
  }

  // 2. Tri topologique : les parents avant leurs enfants
  // Variante BFS depuis les "feuilles" (commits sans enfants locaux)
  // ou variante DFS post-ordre
  const sorted: string[] = topologicalSort(commitObjects, repo.refs);

  // 3. Décorer
  const hashToBranches: Record<string, string[]> = { /* ... */ };
  const hashToTags: Record<string, string[]> = { /* ... */ };

  return sorted.map(hash => ({
    hash,
    shortHash: shortHash(hash),
    message: commitObjects.get(hash)!.message,
    parents: commitObjects.get(hash)!.parents,
    branches: hashToBranches[hash] ?? [],
    tags: hashToTags[hash] ?? [],
  }));
}
```

**Remarque** : pour les dépôts très volumineux (milliers de commits), ce calcul peut être coûteux. Prévoir (Phase 4+) un cache ou une approche lazy.

### 1.4 Utilisation dans GraphView

Le composant `GraphView.vue` utilisera `snapshot.allCommits ?? snapshot.commits` pour se rabattre sur l'historique depuis HEAD en l'absence de `allCommits` (backward compat pendant la transition).

```typescript
// En Vue/TypeScript
const graphCommits = computed(() => {
  return repo.snapshot.allCommits ?? repo.snapshot.commits;
});
```

Cela garantit qu'une branche historique sans `allCommits` n'affichera que les commits depuis HEAD, ce qui est le comportement attendu.

## 2. Contrat de l'algorithme de layout

### 2.1 Entrée

L'algorithme de layout reçoit un **snapshot complet** (ou au minimum `snapshot.allCommits` + refs) et produit une **géométrie 2D**.

```typescript
import type { SnapshotCommit } from '@/core/engine';

/**
 * Entrée : liste immuable de commits (depuis snapshot) + refs courantes.
 * Chaque commit porte hash, message, parents, branches décoratives et tags.
 */
export interface LayoutInput {
  /** Tous les commits (ou commits depuis HEAD). */
  commits: readonly SnapshotCommit[];

  /** Branches courantes (nom → hash). Aide au tri deterministic des lanes. */
  branches: Readonly<Record<string, string>>;

  /** HEAD courant (pour surbrillance optionnelle). */
  head: Readonly<{ type: 'branch'; name: string } | { type: 'detached'; hash: string }>;

  /** Tags courants. */
  tags: Readonly<Record<string, string>>;

  /** Options de rendu (dimension canvas, spacing, couleurs, etc.). */
  options?: LayoutOptions;
}

export interface LayoutOptions {
  /** Écartement horizontal entre lanes (pixels). Défaut : 80. */
  laneWidth?: number;

  /** Écartement vertical entre commits (pixels). Défaut : 60. */
  commitHeight?: number;

  /** Largeur des nœuds (rayon du cercle). Défaut : 6. */
  nodeRadius?: number;

  /** Palette de couleurs pour les lanes. Défaut : voir section 2.5. */
  colorPalette?: string[];
}
```

### 2.2 Sortie

L'algorithme retourne une **géométrie complète** consumable par le rendu SVG et les interactions.

```typescript
/**
 * Modèle géométrique d'un commit sur le graphe.
 */
export interface GraphNode {
  /** Hash complet (clé unique). */
  hash: string;

  /** Position en pixels. */
  x: number;
  y: number;

  /** Lane assignée (0 = colonne 0, 1 = colonne 1, etc.). */
  lane: number;

  /** Couleur hex de la lane (déterministe, voir section 2.5). */
  color: string;

  /** Données du snapshot pour affichage (message, branches, tags). */
  snapshot: SnapshotCommit;
}

/**
 * Arête parent → enfant (ou dans le cas de merge, parent A → enfant).
 */
export interface GraphEdge {
  /** Hash du parent. */
  fromHash: string;

  /** Hash de l'enfant. */
  toHash: string;

  /** Position du parent. */
  fromX: number;
  fromY: number;

  /** Position de l'enfant. */
  toX: number;
  toY: number;

  /** Type d'arête (linéaire, merge croisée, etc.). Voir section 2.6. */
  type: 'linear' | 'merge';

  /** Lane du parent (pour routage des courbes de merge). */
  fromLane: number;

  /** Lane de l'enfant. */
  toLane: number;
}

/**
 * Résultat du layout : géométrie complète prête à rendre.
 */
export interface GraphLayout {
  /** Nœuds du graphe (un par commit). */
  nodes: GraphNode[];

  /** Arêtes parent → enfant. */
  edges: GraphEdge[];

  /** Nombre de lanes utilisées (largeur du DAG). */
  laneCount: number;

  /** Dimensions du canvas (pixels). */
  width: number;
  height: number;

  /** Marges appliquées autour du graphe. */
  padding: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}
```

### 2.3 Contrat de calcul

**Responsabilités du layout** :

1. **Tri topologique strict** : si A est parent de B, alors Y(A) < Y(B) (A au-dessus, B au-dessous).
2. **Assignation de lanes deterministe** : même comportement sur des exécutions successives. Basée sur : priorité aux branches nommées, hash comme tiebreaker.
3. **Calcul de positions** : chaque nœud a une (lane, depth) qui se traduit en (x, y).
4. **Arêtes droites ou courbes** : arêtes parent-enfant dans la même lane sont droites ; les merges (multi-parents) routent via des courbes (Section 2.6).
5. **Pas de croisements d'arêtes** : grâce aux lanes, on évite le crossing classique des DAGs.

### 2.4 Orientation et conventions

- **Axe Y vertical** : 0 en haut, Y croissant vers le bas.
- **Commits en ordre chronologique inverse** : le plus récent (derniers commits topologiquement) en haut.
- **Axe X horizontal** : X = `lane * laneWidth + padding.left`.
- **Profondeur** : calculée comme le nombre minimal de sauts depuis une feuille (commit sans enfant) jusqu'au nœud courant. Ou : le maximum de (profondeur du parent) + 1.

### 2.5 Assignation de couleurs

**Règle déterministe par lane/branche** :

1. **Primary branch** (défaut : `main` ou `master`) → couleur 0 (bleu, ex. `#3b82f6`).
2. **Autres branches** → assigner un index à partir de 1 ; hash du nom de branche comme seed pour tiebreaker (garantir la reproducibilité).
3. **Palette** : 8–12 couleurs contrastées (ex. Solarized, ou palette Vue Kelvin similaire).

**Pseudo-code** :

```typescript
function assignLaneColors(
  branches: Record<string, string>,
  laneAssignments: Map<string, number>,
  palette: string[]
): Map<number, string> {
  const laneToColor = new Map<number, string>();

  // Identifier la primary branch
  const mainBranches = ['main', 'master', 'develop'];
  let primaryBranch: string | undefined;
  for (const name of mainBranches) {
    if (name in branches) {
      primaryBranch = name;
      break;
    }
  }

  // Assigner les couleurs par lane
  const processedBranches = new Set<string>();
  if (primaryBranch) {
    const lane = laneAssignments.get(branches[primaryBranch]);
    if (lane !== undefined) {
      laneToColor.set(lane, palette[0]); // Bleu
      processedBranches.add(primaryBranch);
    }
  }

  // Autres branches : hash deterministe
  for (const [branchName, branchHash] of Object.entries(branches)) {
    if (processedBranches.has(branchName)) continue;
    const lane = laneAssignments.get(branchHash);
    if (lane !== undefined) {
      const colorIndex = 1 + (hashString(branchName) % (palette.length - 1));
      laneToColor.set(lane, palette[colorIndex]);
      processedBranches.add(branchName);
    }
  }

  return laneToColor;
}
```

## 3. Décisions structurantes et recommandations

### 3.1 Extension du snapshot

**Décision** : ajouter un champ **optionnel** `allCommits?: SnapshotCommit[]` à `RepoSnapshot`, calculé dans `engine.ts:snapshot()` par parcours de tous les commits du dépôt en tri topologique.

**Justification** :
- Backward compatible : les anciens consumers utilisent `snapshot.commits` (depuis HEAD).
- Explicit : la présence de `allCommits` indique que le moteur expose le graphe complet.
- Flexible : permet une implémentation progressive (Phase 3 utilise `allCommits`, Phase 1–2 ne l'exigent pas).

**Coût** : O(C log C) où C = nombre total de commits (tri topologique). Acceptable pour des dépôts jusqu'à ~10k commits.

### 3.2 Algorithme de layout

**Décision** : implémenter dans `src/graph/layout.ts` une fonction **pure, testable**, sans dépendances à Vue/DOM.

**Entrée** : `LayoutInput` (commits + refs + options).
**Sortie** : `GraphLayout` (nodes + edges + dimensions).

**Testabilité** : tous les cas (mono-branche linéaire, multi-branches divergentes, merges, HEAD détaché, dépôt vide) peuvent être testés via Vitest sans DOM.

### 3.3 Contrat des lanes et couleurs

**Lanes** : déterministes, basées sur l'ordre topologique et une heuristique de priorité (branches nommées avant orphelines).

**Couleurs** : déterministes, assignées par lane. Une couleur par lane, même si plusieurs branches pointent sur des commits distincts d'une lane.

### 3.4 Gestion des cas limites

L'algorithme doit gérer sans erreur :

- **Dépôt non initialisé** : `commits.length === 0`, retourner un `GraphLayout` vide.
- **Dépôt sans commit** : même que ci-dessus.
- **Branche unique linéaire** : une lane, tous les nœuds à (0, depth).
- **Branches multiples divergentes** : chaque branche sa lane, arêtes routées.
- **HEAD détaché** : marqué dans le nœud (booléen ou badge).
- **Nombreux commits** : support jusqu'à ~1000 commits sur l'écran (au-delà, pan/zoom requis).

## 4. Responsabilités par composant

### 4.1 Moteur (`src/core/engine.ts`)

- Calcule `allCommits` par tri topologique de tous les commits du dépôt.
- Enrichit chaque commit avec ses branches et tags.
- Retourne un snapshot immuable (gelé).

**Fonction à ajouter** : `getAllCommitsTopologicalOrder(repo: Repository): SnapshotCommit[]`.

### 4.2 Store (`src/stores/repo.ts`)

- Expose `snapshot` réactif (déjà fait).
- Aucun changement requis (le store consomme déjà le snapshot du moteur).

### 4.3 Graphe (`src/graph/layout.ts`)

- Reçoit `snapshot` (ou `LayoutInput`).
- Produit `GraphLayout` (géométrie complète).
- **Pur, sans effets de bord** : chaque appel déterministe pour un même input.
- Bien séparé du rendu Vue.

### 4.4 Composant (`src/components/GraphView.vue`)

- Consomme `snapshot` du store.
- Appelle `calculateLayout(snapshot)` pour obtenir la géométrie.
- Rend le SVG (voir spec 17-graph-render.md).
- Gère interactions et pan/zoom.

## 5. Critères d'acceptation (modèle de données)

### CA-model-01 : Snapshot expose `allCommits`

- [ ] `RepoSnapshot` a un champ `allCommits?: SnapshotCommit[]`.
- [ ] `engine.ts:snapshot()` calcule et retourne `allCommits` (non vide après commit).
- [ ] Éléments de `allCommits` sont triés topologiquement (parents avant enfants en termes de Y).

### CA-model-02 : Backward compatibility

- [ ] `snapshot.commits` reste inchangé (commits depuis HEAD).
- [ ] Code existant ne casse pas.
- [ ] GraphView peut utiliser `snapshot.allCommits ?? snapshot.commits` sans erreur.

### CA-model-03 : Récupération des branches et tags

- [ ] Chaque `SnapshotCommit` de `allCommits` porte ses branches et tags corrects.
- [ ] Si deux branches pointent le même commit, `branches` list les deux noms.

### CA-model-04 : Tri topologique correct

- [ ] Pour tout edge parent → enfant, Y(parent) < Y(enfant).
- [ ] Pas de cycle (par construction du moteur).
- [ ] Test : créer deux branches divergentes, vérifier tous les commits sont presents.

## 6. Références et contexte

- **engine.ts** : `RepoSnapshot`, `SnapshotCommit`, `snapshot()` méthode.
- **repository.ts** : `getCommitHistoryWithHashes(repo)` (à étendre avec `getAllCommitsTopologicalOrder`).
- **GraphView.vue** : à remplacer (voir spec 17).

---

**Prochaines étapes** :
- Spec 16 : détailler l'algorithme de layout (tri topologique, assignation de lanes, calcul de (x, y)).
- Spec 17 : rendu SVG, interactions, badges de refs.
