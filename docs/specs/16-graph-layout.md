# Phase 3 – Visualisation graphique : Algorithme de layout

## Contexte

Cette spec détaille l'algorithme qui transforme une liste de commits en géométrie 2D (positions, lanes, couleurs). Cet algorithme est **pur, déterministe et testable** — aucune dépendance à Vue, DOM ou état externe.

## 1. Vue d'ensemble de l'algorithme

L'algorithme suit ces étapes **séquentielles** :

1. **Tri topologique** : ordonner les commits de manière que tout parent précède ses enfants.
2. **Calcul de profondeur** : assigner à chaque commit une "profondeur" (couche) unique en fonction de sa distance d'une feuille.
3. **Assignation de lanes** : distribuer les commits sur des colonnes (lanes) pour minimiser les croisements d'arêtes.
4. **Calcul de positions (x, y)** : traduire (lane, profondeur) en pixels.
5. **Routage des arêtes** : calculer les chemins des lignes parent → enfant, y compris les merges.
6. **Assignation de couleurs** : une couleur déterministe par lane/branche.

## 2. Étape 1 : Tri topologique

### 2.1 Algorithme : DFS post-ordre inversé

```typescript
function topologicalSort(
  commits: readonly SnapshotCommit[],
): SnapshotCommit[] {
  // Construire un index hash → commit pour O(1) lookup
  const commitMap = new Map<string, SnapshotCommit>();
  for (const c of commits) {
    commitMap.set(c.hash, c);
  }

  // Construire un index hash → liste d'enfants (inverse de parents)
  const childrenMap = new Map<string, string[]>();
  for (const c of commits) {
    for (const parent of c.parents) {
      if (!childrenMap.has(parent)) {
        childrenMap.set(parent, []);
      }
      childrenMap.get(parent)!.push(c.hash);
    }
  }

  const visited = new Set<string>();
  const result: SnapshotCommit[] = [];

  function dfs(hash: string) {
    if (visited.has(hash)) return;
    visited.add(hash);

    const commit = commitMap.get(hash);
    if (!commit) return;

    // Visiter les enfants d'abord (post-ordre)
    for (const childHash of childrenMap.get(hash) ?? []) {
      dfs(childHash);
    }

    // Ajouter après les enfants (post-ordre)
    result.push(commit);
  }

  // Trouver les racines (commits sans parents).
  // Par défaut, visiter tous les commits pour gérer les DAG non-connectés.
  const roots = new Set<string>();
  for (const c of commits) {
    if (c.parents.length === 0) {
      roots.add(c.hash);
    }
  }

  // Si aucune racine (cas pathologique), visiter un commit arbitraire
  if (roots.size === 0 && commits.length > 0) {
    dfs(commits[0].hash);
  } else {
    for (const hash of roots) {
      dfs(hash);
    }
  }

  // Optionnel : vérifier que tous les commits ont été visités
  // (prévention de graphes corrompus)
  if (visited.size !== commits.length) {
    console.warn(`Graphe corrompus : ${visited.size}/${commits.length} commits visités`);
  }

  return result;
}
```

**Propriété** : le résultat ordonne les commits de sorte que pour tout parent P et enfant C, P apparaît **après** C dans la liste (car DFS post-ordre). On inverse ensuite lors de l'assignation de profondeur.

**Complexité** : O(C + E) où C = commits, E = edges (arêtes parent-enfant).

### 2.2 Contrat

- **Entrée** : liste immuable de `SnapshotCommit`.
- **Sortie** : liste triée topologiquement (enfants avant parents).
- **Determinisme** : à défaut de tiebreaker (voir 2.3), résultat peut varier en présence de branches parallèles. Solution : ajouter un hash du commit comme tiebreaker secondaire.

### 2.3 Tri topologique avec tiebreaker

Pour garantir determinisme en cas d'ordre des enfants ambigü, utiliser un **tiebreaker stable** :

```typescript
function topologicalSort(commits: readonly SnapshotCommit[]): SnapshotCommit[] {
  // ... (identique jusqu'à dfs)

  // Dans dfs : trier les enfants par hash avant de les visiter
  function dfs(hash: string) {
    if (visited.has(hash)) return;
    visited.add(hash);

    const commit = commitMap.get(hash);
    if (!commit) return;

    // Trier les enfants par hash (déterministe)
    const children = childrenMap.get(hash) ?? [];
    const sortedChildren = [...children].sort();

    for (const childHash of sortedChildren) {
      dfs(childHash);
    }

    result.push(commit);
  }

  // ... reste inchangé
}
```

## 3. Étape 2 : Calcul de profondeur

### 3.1 Définition

La **profondeur** d'un commit est son niveau vertical dans le DAG : les feuilles (commits sans enfants) sont à profondeur 0, leurs parents à profondeur 1, etc.

**Formule** : `depth(C) = max(depth(enfant)) + 1` pour tous les enfants de C, ou 0 si pas d'enfants.

### 3.2 Implémentation : programmation dynamique

```typescript
function calculateDepths(
  commits: SnapshotCommit[],
  topSorted: SnapshotCommit[],
): Map<string, number> {
  const commitMap = new Map<string, SnapshotCommit>();
  for (const c of commits) {
    commitMap.set(c.hash, c);
  }

  const childrenMap = new Map<string, string[]>();
  for (const c of commits) {
    for (const parent of c.parents) {
      if (!childrenMap.has(parent)) {
        childrenMap.set(parent, []);
      }
      childrenMap.get(parent)!.push(c.hash);
    }
  }

  const depths = new Map<string, number>();

  // Parcourir en ordre topologique (enfants avant parents)
  for (const commit of topSorted) {
    let maxChildDepth = -1;
    for (const childHash of childrenMap.get(commit.hash) ?? []) {
      const childDepth = depths.get(childHash);
      if (childDepth !== undefined) {
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      }
    }

    depths.set(commit.hash, maxChildDepth + 1);
  }

  return depths;
}
```

**Propriété** : chaque commit reçoit une profondeur unique ≥ 0.

**Complexité** : O(C + E).

## 4. Étape 3 : Assignation de lanes

### 4.1 Objectif

Assigner chaque commit à une **lane** (colonne) de manière à :

1. Minimiser les croisements d'arêtes (impossible dans un DAG général, mais réduire via heuristique).
2. Garder les branches nommées sur des lanes cohérentes (une branche = une lane si possible).
3. Être déterministe : même résultat à chaque appel.

### 4.2 Heuristique : assignation par branche principale + descendance

L'algorithme favorise les **branches nommées**, en particulier la branche par défaut (`main` ou `master`).

```typescript
interface LaneAssignmentContext {
  /** Commits en ordre topologique (enfants avant parents). */
  topSorted: SnapshotCommit[];
  
  /** Map hash → commit pour lookup. */
  commitMap: Map<string, SnapshotCommit>;
  
  /** Map hash → enfants directs. */
  childrenMap: Map<string, string[]>;
  
  /** Branches du dépôt. */
  branches: Record<string, string>;
  
  /** Map hash → profondeurs. */
  depths: Map<string, number>;
}

function assignLanes(ctx: LaneAssignmentContext): Map<string, number> {
  const laneAssignments = new Map<string, number>();
  let nextLane = 0;

  // === Phase 1 : Assigner les branches nommées à des lanes ===
  const primaryBranches = ['main', 'master', 'develop', 'dev'];
  const branchOrder: string[] = [];

  // Ajouter primary branch en premier
  for (const name of primaryBranches) {
    if (name in ctx.branches) {
      branchOrder.push(name);
      break;
    }
  }

  // Ajouter autres branches triées alphabétiquement
  for (const name of Object.keys(ctx.branches).sort()) {
    if (!branchOrder.includes(name)) {
      branchOrder.push(name);
    }
  }

  // Assigner une lane à chaque tip de branche
  const assignedBranches = new Set<string>();
  for (const branchName of branchOrder) {
    const branchHash = ctx.branches[branchName];
    if (branchHash && !laneAssignments.has(branchHash)) {
      laneAssignments.set(branchHash, nextLane);
      assignedBranches.add(branchName);
      nextLane++;
    }
  }

  // === Phase 2 : Backtrack de chaque tip vers la racine ===
  // Propager les lanes des tips vers leurs ancêtres (une lane par chaîne linéaire)
  for (const branchName of branchOrder) {
    const branchHash = ctx.branches[branchName];
    if (!branchHash) continue;

    const lane = laneAssignments.get(branchHash)!;
    const visited = new Set<string>();

    function backtrack(hash: string) {
      if (visited.has(hash)) return;
      visited.add(hash);

      const commit = ctx.commitMap.get(hash);
      if (!commit) return;

      // Assigner la lane courante si pas déjà assignée
      if (!laneAssignments.has(hash)) {
        laneAssignments.set(hash, lane);
      }

      // Backtrack aux parents (dans l'ordre)
      for (const parentHash of commit.parents) {
        backtrack(parentHash);
      }
    }

    backtrack(branchHash);
  }

  // === Phase 3 : Assigner les commits orphelins ===
  // Commits sans branche (ex. en mode détaché ou commits isolés)
  for (const commit of ctx.topSorted) {
    if (!laneAssignments.has(commit.hash)) {
      // Tenter d'utiliser la lane d'un enfant (si unique)
      const childLanes = new Set<number>();
      for (const childHash of ctx.childrenMap.get(commit.hash) ?? []) {
        const childLane = laneAssignments.get(childHash);
        if (childLane !== undefined) {
          childLanes.add(childLane);
        }
      }

      if (childLanes.size === 1) {
        // Un seul enfant assigné : hériter sa lane
        laneAssignments.set(commit.hash, [...childLanes][0]);
      } else {
        // Mehrere enfants ou aucun : assigner une lane nouvelle
        laneAssignments.set(commit.hash, nextLane);
        nextLane++;
      }
    }
  }

  return laneAssignments;
}
```

### 4.3 Propriétés

- **Branches nommées cohérentes** : une branche et ses ancêtres restent sur la même lane (autant que possible).
- **Déterminisme** : branches triées alphabétiquement, tiebreakers explicites.
- **Pas de "gaps"** : lanes sont contiguës (0, 1, 2, ..., n-1).

### 4.4 Complexité

O(C + E) avec une seule passe sur le graphe (Phase 1, 2 et 3).

## 5. Étape 4 : Calcul de positions (x, y)

### 5.1 Formule

Donné un commit à (lane, depth), convertir en pixels :

```typescript
function calculatePositions(
  commits: SnapshotCommit[],
  laneAssignments: Map<string, number>,
  depths: Map<string, number>,
  options: LayoutOptions,
): Map<string, { x: number; y: number }> {
  const laneWidth = options.laneWidth ?? 80;
  const commitHeight = options.commitHeight ?? 60;
  const paddingLeft = 40;
  const paddingTop = 40;

  const positions = new Map<string, { x: number; y: number }>();

  for (const commit of commits) {
    const lane = laneAssignments.get(commit.hash) ?? 0;
    const depth = depths.get(commit.hash) ?? 0;

    const x = paddingLeft + lane * laneWidth;
    const y = paddingTop + depth * commitHeight;

    positions.set(commit.hash, { x, y });
  }

  return positions;
}
```

### 5.2 Propriétés

- **Linéarité** : X croît avec la lane, Y croît avec la profondeur.
- **Espacement régulier** : tous les commits au même depth ont le même Y.

## 6. Étape 5 : Routage des arêtes

### 6.1 Arêtes linéaires (parent-enfant, même lane)

Si un enfant E et son parent P sont sur la **même lane**, l'arête est une **ligne droite** verticale.

```typescript
if (fromLane === toLane) {
  // Ligne droite
  edges.push({
    type: 'linear',
    fromHash: parent.hash,
    toHash: child.hash,
    fromX: positions.get(parent.hash)!.x,
    fromY: positions.get(parent.hash)!.y,
    toX: positions.get(child.hash)!.x,
    toY: positions.get(child.hash)!.y,
    fromLane,
    toLane,
  });
}
```

### 6.2 Arêtes de merge (parent-enfant, lanes différentes)

Si P et E sont sur **lanes différentes**, l'arête est une **courbe de Bézier** reliant les deux lanes.

**Forme** : courbe quadratique ou cubique reliant (fromX, fromY) à (toX, toY), avec points de contrôle intermédiaires pour éviter les croisements droits.

```typescript
if (fromLane !== toLane) {
  // Courbe de merge
  edges.push({
    type: 'merge',
    fromHash: parent.hash,
    toHash: child.hash,
    fromX: positions.get(parent.hash)!.x,
    fromY: positions.get(parent.hash)!.y,
    toX: positions.get(child.hash)!.x,
    toY: positions.get(child.hash)!.y,
    fromLane,
    toLane,
  });
}
```

**Calcul des points de contrôle** (implémentation en spec 17 — rendu SVG) : tirer une ligne droite, puis courber pour passer entre les lanes.

### 6.3 Algorithme de routage global

```typescript
function routeEdges(
  commits: SnapshotCommit[],
  commitMap: Map<string, SnapshotCommit>,
  laneAssignments: Map<string, number>,
  positions: Map<string, { x: number; y: number }>,
): GraphEdge[] {
  const edges: GraphEdge[] = [];

  for (const commit of commits) {
    const childLane = laneAssignments.get(commit.hash) ?? 0;
    const childPos = positions.get(commit.hash)!;

    for (const parentHash of commit.parents) {
      const parentCommit = commitMap.get(parentHash);
      if (!parentCommit) continue;

      const parentLane = laneAssignments.get(parentHash) ?? 0;
      const parentPos = positions.get(parentHash)!;

      edges.push({
        type: parentLane === childLane ? 'linear' : 'merge',
        fromHash: parentHash,
        toHash: commit.hash,
        fromX: parentPos.x,
        fromY: parentPos.y,
        toX: childPos.x,
        toY: childPos.y,
        fromLane: parentLane,
        toLane: childLane,
      });
    }
  }

  return edges;
}
```

## 7. Étape 6 : Assignation de couleurs

Voir section 2.5 de spec 15-graph-model.md. Résumé :

1. **Primary branch** (`main`, `master`) → couleur 0.
2. **Autres branches** → assignation par hash du nom (déterministe).
3. **Palette** : 8–12 couleurs contrastées.

```typescript
function assignNodeColors(
  nodes: GraphNode[],
  branches: Record<string, string>,
  colorPalette: string[],
): GraphNode[] {
  return nodes.map(node => {
    // Trouver la première branche pointant ce commit
    const branchName = Object.entries(branches).find(
      ([_, hash]) => hash === node.hash,
    )?.[0];

    let colorIndex = 0;
    if (branchName) {
      if (['main', 'master', 'develop'].includes(branchName)) {
        colorIndex = 0;
      } else {
        // Hash du nom comme seed
        const hash = branchName
          .split('')
          .reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xffffffff, 0);
        colorIndex = 1 + (Math.abs(hash) % (colorPalette.length - 1));
      }
    }

    return {
      ...node,
      color: colorPalette[colorIndex],
    };
  });
}
```

## 8. Orchestration : fonction principale de layout

```typescript
export function calculateLayout(input: LayoutInput): GraphLayout {
  const {
    commits,
    branches,
    head,
    options = {},
  } = input;

  // Gestion du cas vide
  if (commits.length === 0) {
    return {
      nodes: [],
      edges: [],
      laneCount: 0,
      width: 0,
      height: 0,
      padding: { top: 40, bottom: 40, left: 40, right: 40 },
    };
  }

  const commitMap = new Map<string, SnapshotCommit>();
  for (const c of commits) {
    commitMap.set(c.hash, c);
  }

  // === Étapes séquentielles ===
  const topSorted = topologicalSort(commits);
  
  const childrenMap = new Map<string, string[]>();
  for (const c of commits) {
    for (const p of c.parents) {
      if (!childrenMap.has(p)) childrenMap.set(p, []);
      childrenMap.get(p)!.push(c.hash);
    }
  }

  const depths = calculateDepths(commits, topSorted);

  const laneAssignments = assignLanes({
    topSorted,
    commitMap,
    childrenMap,
    branches,
    depths,
  });

  const positions = calculatePositions(commits, laneAssignments, depths, options);

  const edges = routeEdges(commits, commitMap, laneAssignments, positions);

  // === Construction des nœuds ===
  const nodes: GraphNode[] = [];
  const colorPalette = options.colorPalette ?? defaultColorPalette();
  
  for (const commit of commits) {
    nodes.push({
      hash: commit.hash,
      x: positions.get(commit.hash)!.x,
      y: positions.get(commit.hash)!.y,
      lane: laneAssignments.get(commit.hash)!,
      color: getColorForLane(
        laneAssignments.get(commit.hash) ?? 0,
        branches,
        colorPalette,
      ),
      snapshot: commit,
    });
  }

  // === Calcul des dimensions ===
  const laneCount = Math.max(...[...laneAssignments.values()]) + 1;
  const maxDepth = Math.max(...[...depths.values()]);
  const padding = { top: 40, bottom: 40, left: 40, right: 40 };

  const width =
    padding.left + (laneCount * (options.laneWidth ?? 80)) + padding.right;
  const height =
    padding.top + ((maxDepth + 1) * (options.commitHeight ?? 60)) + padding.bottom;

  return {
    nodes,
    edges,
    laneCount,
    width,
    height,
    padding,
  };
}
```

## 9. Critères d'acceptation (layout)

### CA-layout-01 : Tri topologique

- [ ] Pour tout edge parent → enfant, Y(parent) < Y(enfant) ou même Y si multi-parents.
- [ ] Test : créer une chaîne linéaire (A ← B ← C), vérifier Y(A) < Y(B) < Y(C).
- [ ] Test : créer un merge (A ← B, A ← C, B ← D), vérifier ordre cohérent.

### CA-layout-02 : Assignation de lanes deterministe

- [ ] Même snapshot → même assignation de lanes à chaque appel.
- [ ] Test : appeler `calculateLayout` 2x sur un DAG fixe, vérifier nodes et lanes identiques.

### CA-layout-03 : Branches cohérentes

- [ ] Primary branch (`main`) reste sur lane 0.
- [ ] Autres branches sont sur des lanes stables (même branche = même lane).
- [ ] Test : créer branches `main` et `feature`, vérifier chacune sur sa lane.

### CA-layout-04 : Positions correctes

- [ ] Chaque nœud a x = paddingLeft + lane * laneWidth.
- [ ] Chaque nœud a y = paddingTop + depth * commitHeight.
- [ ] Pas de chevauchements (positions uniques).

### CA-layout-05 : Arêtes routées

- [ ] Chaque arête parent → enfant présente.
- [ ] Arêtes linéaires (même lane) : toX === fromX.
- [ ] Arêtes de merge (lanes différentes) : type === 'merge'.
- [ ] Test : DAG avec merge (2 parents), vérifier 2 arêtes présentes.

### CA-layout-06 : Cas limites

- [ ] Dépôt vide : `GraphLayout.nodes === []`, pas erreur.
- [ ] Un commit : retourne un nœud à (0, 0), `laneCount === 1`.
- [ ] Chaîne linéaire : tous les nœuds sur lane 0, Y croissant.
- [ ] Branches divergentes : chaque branche sa lane, Y indépendant par lane.

### CA-layout-07 : Assignation de couleurs

- [ ] Chaque nœud a une couleur hex valide (ex. `#3b82f6`).
- [ ] Primary branch = couleur 0.
- [ ] Autres branches = couleurs distinctes (ou palette cyclée).
- [ ] Test : vérifier déterminisme (même dépôt = mêmes couleurs).

## 10. Références

- **engine.ts** : `SnapshotCommit`, structure des commits.
- **15-graph-model.md** : contrat de `LayoutInput`, `GraphLayout`.
- **17-graph-render.md** : utilisation de `GraphLayout` pour le rendu SVG.

---

**Prochaines étapes** :
- Spec 17 : rendu SVG, interaction, badges de refs.
- Implémentation dans `src/graph/layout.ts`.
- Tests Vitest : `tests/graph-layout.test.ts`.
