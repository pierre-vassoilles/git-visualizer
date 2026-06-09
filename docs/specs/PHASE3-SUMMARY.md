# Phase 3 – Visualisation graphique : Résumé des décisions structurantes

## Vue d'ensemble

La Phase 3 ajoute la **visualisation graphique du DAG Git** : l'arbre des commits avec branches colorées, arêtes parent-enfant, badges de refs et interactions (pan, zoom, hover).

**Fichiers specs** :
- `15-graph-model.md` : extension du snapshot, contrats de types.
- `16-graph-layout.md` : algorithme de layout (pur, testable).
- `17-graph-render.md` : rendu SVG, interactions Vue.

## 1. Décision structurante 1 : Extension du snapshot

### Problème

Actuellement, `RepoSnapshot.commits` expose **seulement les commits accessibles depuis HEAD** (via `getCommitHistoryWithHashes(repo)`). Cela signifie :

- Une branche `feature` avec des commits non présents dans l'historique de `main` (quand HEAD = `main`) **n'apparaît pas** dans le snapshot.
- Le graphe ne peut pas visualiser les branches divergentes.

### Solution

**Ajouter un champ optionnel `allCommits?: SnapshotCommit[]`** au `RepoSnapshot` :

```typescript
export interface RepoSnapshot {
  // Champs existants
  readonly initialized: boolean;
  readonly branches: Record<string, string>;
  readonly head: { type: 'branch'; name: string } | { type: 'detached'; hash: string };
  readonly commits: SnapshotCommit[];  // Inchangé : depuis HEAD (backward compat)
  readonly tags: Record<string, string>;
  readonly indexPaths: string[];
  readonly files: SnapshotFile[];

  // NOUVEAU : tous les commits du dépôt (Phase 3)
  readonly allCommits?: SnapshotCommit[];
}
```

### Implémentation requise

1. **Fonction dans `src/core/repository.ts`** : `getAllCommitsTopologicalOrder(repo: Repository): SnapshotCommit[]`
   - Parcourt **tous les objets** du dépôt (`repo.objects`).
   - Collecte les commits (filtre type === 'commit').
   - Trie en **ordre topologique inversé** (parents avant enfants).
   - Décorre chaque commit avec ses branches et tags (identique à `commits`).

2. **Appel dans `src/core/engine.ts:snapshot()`** : calculer et retourner `allCommits`.

### Backward compatibility

- `snapshot.commits` reste inchangé.
- Code existant ne casse pas.
- `GraphView` utilise `snapshot.allCommits ?? snapshot.commits` pour se rabattre.

### Coût

- O(C log C) où C = nombre total de commits (tri topologique).
- Acceptable pour dépôts jusqu'à ~10k commits.
- Future : cache ou lazy loading si besoin.

---

## 2. Décision structurante 2 : Séparation core (layout) / UI (render)

### Principe

L'**algorithme de layout** (transformation commits → géométrie) est **pur, déterministe et testable**, complètement séparé de Vue et du DOM.

```
Moteur Git (core/engine.ts)
    ↓ snapshot
Store Pinia (repo.ts)
    ↓ (réactif)
Layout pur (src/graph/layout.ts)
    ↓ GraphLayout
GraphView Vue (components/GraphView.vue)
    ↓ rendu SVG
Écran
```

### Types du layout

**Entrée** (`LayoutInput`) :
```typescript
interface LayoutInput {
  commits: readonly SnapshotCommit[];
  branches: Readonly<Record<string, string>>;
  head: Readonly<{ type: 'branch'; name: string } | { type: 'detached'; hash: string }>;
  tags: Readonly<Record<string, string>>;
  options?: LayoutOptions;
}
```

**Sortie** (`GraphLayout`) :
```typescript
interface GraphLayout {
  nodes: GraphNode[];  // Position, lane, couleur de chaque commit
  edges: GraphEdge[];  // Connexions parent → enfant
  laneCount: number;
  width: number;
  height: number;
  padding: { top, bottom, left, right };
}

interface GraphNode {
  hash: string;
  x: number;
  y: number;
  lane: number;
  color: string;  // Hex, déterministe par lane/branche
  snapshot: SnapshotCommit;
}

interface GraphEdge {
  fromHash: string;
  toHash: string;
  fromX: number; fromY: number;
  toX: number; toY: number;
  type: 'linear' | 'merge';
  fromLane: number; toLane: number;
}
```

### Testabilité

- **Tous les tests du layout sont purs** : pas de DOM, pas de Vue, aucun state externe.
- Cas tests : mono-branche linéaire, branches divergentes, merges, HEAD détaché, dépôt vide, nombreux commits.
- Framework : **Vitest** (tests/graph-layout.test.ts).

---

## 3. Décision structurante 3 : Algorithme de layout (6 étapes)

### Étapes séquentielles

**1. Tri topologique**
- Ordre : enfants avant parents (DFS post-ordre).
- Tiebreaker : sort par hash pour déterminisme.

**2. Calcul de profondeur**
- depth(C) = max(depth(enfants)) + 1, ou 0 si pas d'enfants.
- DP : O(C + E).

**3. Assignation de lanes**
- Phase 1 : assigner une lane à chaque tip de branche (primaires d'abord : main, master).
- Phase 2 : backtrack de chaque tip vers la racine, propager la lane.
- Phase 3 : assigner les commits orphelins (pas de branche).
- Déterminisme : branches triées alphabétiquement, tiebreakers explicites.

**4. Calcul de positions (x, y)**
- x = paddingLeft + lane * laneWidth
- y = paddingTop + depth * commitHeight

**5. Routage des arêtes**
- Arêtes linéaires (même lane) : lignes droites.
- Arêtes de merge (lanes différentes) : courbes de Bézier cubiques (pointe via vers bas-milieu).

**6. Assignation de couleurs**
- Primary branch (`main`, `master`) → couleur 0 (bleu).
- Autres branches → couleurs distinctes (hash du nom pour tiebreaker).
- Palette : 8–12 couleurs contrastées (Solarized-like).

### Complexité

- Topologie : O(C + E)
- Profondeur : O(C + E)
- Lanes : O(C + E)
- Positions : O(C)
- Arêtes : O(E)
- **Total : O(C + E)** (linéaire).

---

## 4. Décision structurante 4 : Rendu SVG custom (pas de lib)

### Pas de dépendance externe

Per `CLAUDE.md` : **pas de gitgraph.js ou lib similaire**. Moteur de rendu custom, piloté par notre modèle de layout.

**Raison** : reset/rebase réécrivent l'historique ; une lib générique ne suivrait pas nos cas de mutation. Rendu custom = responsabilité claire.

### Structure SVG

```
<svg width="..." height="...">
  <!-- Arêtes (parent → enfant) -->
  <g class="edges">
    <line/> ou <path/> (courbes de merge)
  </g>

  <!-- Nœuds (commits) -->
  <g class="nodes">
    <circle/> (couleur de la lane)
  </g>

  <!-- Badges (refs) -->
  <g class="badges">
    <g> (HEAD, branches, tags)
      <rect/> (fond badge)
      <text/> (label)
    </g>
  </g>

  <!-- Labels (hash + message) -->
  <g class="labels">
    <text/> (shortHash)
    <text/> (message tronqué)
  </g>
</svg>
```

### Positionnement des éléments

- Nœuds : cercle (rayon = 6px), rempli de la couleur de lane.
- Arêtes : lignes (1.5px), ou courbes (merge).
- Badges : rectangles avec texte (10px font), empilés au-dessus du nœud.
- Labels : texte monospace (shortHash 11px, message 10px), à côté du nœud.

---

## 5. Décision structurante 5 : Badges de refs et HEAD

### Types de badges

1. **HEAD** : petit rectangle blanc (`#fff` bg, `#333` border), texte "HEAD" ou "HEAD (détaché)".
2. **Branches** : rectangles bleus clair (`#e0e7ff` bg, `#4f46e5` border), texte = nom de branche.
3. **Tags** : rectangles jaunes (`#fef3c7` bg, `#f59e0b` border), texte = nom de tag.

### Positionnement

- Au-dessus du nœud (y - nodeRadius - 8).
- Si plusieurs branches/tags : empiler verticalement (+20px entre chacun).

### Cas spéciaux

- **HEAD branche** : badge "HEAD" + badge de la branche (ex. "HEAD -> main").
- **HEAD détaché** : badge "HEAD (abc1234)" (hash court du HEAD).
- **Plusieurs branches same-commit** : tous les badges affichés (liste de noms).

---

## 6. Interactions utilisateur

### Pan & Zoom

- **Zoom** : scroll souris, 0.1x à 5x.
- **Pan** : clic droit + drag pour translator.
- Transform SVG : `translate(panX, panY) scale(zoom)`.

### Hover

- Survol nœud : opacité 100%, stroke épaissit.
- Tooltip avec hash + message + parents (positionné à la souris).
- Arêtes liées : surlignées (couleur plus foncée).

### Click

- Click nœud : toggle sélection (border noir, highlight).
- Un seul nœud sélectionné à la fois.
- Click ailleurs : désélect.

### Optionnel (Phase 4+)

- Double-click → paneler détails du commit.
- Shift+click → multi-select.
- Contexte-menu (clic droit) → menu d'actions (checkout, cherry-pick, etc.).

---

## 7. Orientation et conventions géométriques

### Axe Y (temps)

- **Haut (Y=0)** : commits les plus récents (topologiquement, d'abord dans le DAG).
- **Bas (Y croissant)** : commits plus anciens.
- **Sens comme `git log`** : ordre chronologique inversé (newest first).

### Axe X (lanes)

- **Gauche (X=0+padding)** : lane 0 (primary branch).
- **Droite (X croissant)** : lanes 1, 2, ... (branches parallèles).

### Propriété d'ordre topologique

Pour tout parent P et enfant E :
- `Y(P) < Y(E)` (P au-dessus, E au-dessous).
- Garanti par le tri topologique + assignation de profondeur.

---

## 8. Gestion des cas limites

### Dépôt non initialisé

Placeholder : "Graphe Git" / "Initialisez un dépôt pour voir le graphe."

### Dépôt sans commit

Placeholder : "Aucun commit pour l'instant."

### Branche unique linéaire

- Tous les nœuds sur lane 0.
- Y croissant régulièrement.
- Pas d'arêtes courbes.
- Cas le plus simple.

### Branches multiples divergentes

- Chaque branche sa lane.
- Merge : nœud avec 2+ parents → 2+ arêtes, dont une courbe.

### HEAD détaché

- Badge ou halo autour du commit pointé par HEAD.
- Styling distinctif (rouge, ex. `#ef4444`).

### Nombreux commits (>100)

- SVG redimensionné (width/height augmentent).
- Pan/zoom permettent de naviguer.
- Optionnel (Phase 4) : virtualisation ou minimap.

---

## 9. Workflow de développement (phases agentiques)

Per `CLAUDE.md`, la Phase 3 suit le **cycle 5 étapes** :

### Étape 1 : Spécifications (agent product-manager)

**Livrable** : 3 fichiers specs.
- `15-graph-model.md` : extension snapshot, contrats types.
- `16-graph-layout.md` : algorithme layout détaillé + CA.
- `17-graph-render.md` : rendu SVG, interactions + CA.

✓ **Complété** : ce document.

### Étape 2 : Documentation (agent technical-writer)

**Tâches** :
- Mettre à jour `docs/USAGE.md` : section "Graphe" (comment il fonctionne, raccourcis pan/zoom).
- Mettre à jour `CLAUDE.md` : section graph/ dans architecture.

### Étape 3 : Développement (agent typescript-pro / vue-expert)

**Tâches** :
1. Implémenter `src/core/repository.ts:getAllCommitsTopologicalOrder(repo)`.
2. Mettre à jour `src/core/engine.ts:snapshot()` pour calculer `allCommits`.
3. Créer `src/graph/layout.ts` : fonction `calculateLayout(input: LayoutInput): GraphLayout`.
4. Remplacer `src/components/GraphView.vue` : rendu SVG + interactions.
5. Ajouter types dans `src/graph/index.ts` (exports) ou `src/types/graph.ts`.

**Ordre** : core d'abord (layout pur), puis UI (Vue/SVG).

### Étape 4 : Tests (agent test-automator)

**Fichiers tests** :
- `tests/graph-layout.test.ts` : tous les cas CA-layout-NN.
- `tests/graph-render.test.ts` : cas CA-graph-NN (snapshots SVG, interactions).

**Couverture** :
- Tri topologique (linéaire, branches, merges).
- Assignation lanes (branches primaires, orphelins).
- Positionnement (x, y corrects).
- Couleurs (déterministes, distinctes).
- Arêtes (linéaires + courbes).
- Cas limites (vide, 1 commit, HEAD détaché).

### Étape 5 : QA (agent code-reviewer + architect-reviewer)

**Revue** :
- Specs vs implémentation : conformité 100%.
- Séparation core / UI : layout pur, aucune dépendance Vue.
- Performance : O(C + E) respecté, pas de re-calculs inutiles.
- Déterminisme : même input → même layout à chaque appel.
- Tests : couverture ≥ 80%, cas limites couverts.

---

## 10. Critères de "Phase 3 terminée"

### Porte de validation (à la fin de la Phase 3)

- [ ] Specs écrites et validées (3 fichiers).
- [ ] `npm run build` vert (typecheck strict + build de prod).
- [ ] `npm test` vert (tests verts, couverture CA).
- [ ] Revue QA sans blocant.
- [ ] GraphView affiche le DAG correctement (tests visuels / démo).

### Métriques de succès

- **Couverture de code** : ≥ 80% pour layout + render.
- **Déterminisme** : layout identique sur 1000 appels consécutifs (même snapshot).
- **Performance** : layout < 50ms pour 500 commits (mesuré Vitest + browser DevTools).
- **Cas limites** : tous les CA-layout-NN et CA-graph-NN passent.
- **Usabilité** : DAG lisible et navigable pour dépôts jusqu'à 1000 commits.

---

## 11. Fichiers à créer / modifier

### Création

- `src/graph/layout.ts` : fonction `calculateLayout` + types.
- `src/graph/index.ts` : exports (types + fonction).
- `tests/graph-layout.test.ts` : tous les tests layout.
- `tests/graph-render.test.ts` : tests SVG/interactions (optionnel, peut utiliser snapshots).

### Modification

- `src/core/repository.ts` : ajouter `getAllCommitsTopologicalOrder(repo)`.
- `src/core/engine.ts` : call `getAllCommitsTopologicalOrder` dans `snapshot()`, exposer `allCommits`.
- `src/components/GraphView.vue` : remplacer placeholder par rendu SVG complet.
- `docs/USAGE.md` : ajouter section "Graphe".
- `CLAUDE.md` : mettre à jour section architecture (graph/).

---

## 12. Références croisées

### Specs Phase 3

- **15-graph-model.md** → 16-graph-layout.md (input `LayoutInput` → output `GraphLayout`).
- **16-graph-layout.md** → 17-graph-render.md (use `GraphLayout` pour SVG).
- **17-graph-render.md** → `src/components/GraphView.vue` implémentation.

### Specs Phase 2 (dépendances)

- `14-tag.md` : tags décorés dans `SnapshotCommit.tags` (consommé par layout + render).
- `12-switch.md` : HEAD détaché (consommé par render comme cas spécial).

### Specs Phase 1 (fondation)

- `00-model.md` : structure `Commit`, `parents[]`, arbre du DAG.
- `05-log.md` : ordre topologique (notion de "histoire").

---

## 13. Questions ouvertes (à traiter Phase 4+)

1. **Merge avec 2+ parents** : Phase 3 prépare les arêtes, Phase 4 intègre `git merge` réel.
2. **Rebase** : réécrit l'historique, Phase 3 layout doit rester robuste.
3. **Virtualisation** : dépôts > 1000 commits, loader les commits par batch ?
4. **Minimap** : optional, vue d'ensemble dans un coin (Phase 4 UX).
5. **Contexte-menu** : click droit sur un commit → actions (checkout, cherry-pick, etc., Phase 4).

---

## Sommaire exécutif

**Phase 3 visualise le DAG Git** via :

1. **Extension du snapshot** : ajouter `allCommits` pour exposer TOUS les commits du dépôt (pas seulement depuis HEAD).

2. **Algorithme de layout pur** : 6 étapes (tri topo, profondeur, lanes, positions, arêtes, couleurs), O(C+E), déterministe, testable sans DOM.

3. **Rendu SVG custom** : nœuds colorés, arêtes linéaires/courbes, badges de refs (branches, tags, HEAD), labels (hash + message).

4. **Interactions** : hover (tooltip, highlight), click (sélection), pan (clic droit + drag), zoom (scroll).

5. **Cas limites gérés** : vide, sans commit, linéaire, branches divergentes, HEAD détaché, nombreux commits.

**Décisions structurantes clés** :

- ✅ `allCommits` optionnel (backward compat).
- ✅ Layout pur, séparé de Vue/DOM.
- ✅ Déterminisme : même input → même géométrie.
- ✅ Custom SVG (pas de lib gitgraph).
- ✅ Orientation : Y = chronologie (neuf d'abord), X = lanes parallèles.

**Critères d'acceptation** : 17 CA sur layout (CA-layout-01 à -07) + 9 CA sur render (CA-graph-01 à -09).

---

**Prochaines étapes** : 
- Validation des specs par orchestrateur.
- Étape 2 (doc) + Étape 3 (dev) en parallèle.
- Étape 4 (tests) dès que layout spec finalisée.
