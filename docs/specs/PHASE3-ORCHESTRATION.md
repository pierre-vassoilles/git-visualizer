# Phase 3 – Guide d'orchestration pour l'orchestrateur

## Vue d'ensemble

Vous orchestrez la Phase 3 (visualisation graphique du DAG Git) selon le **cycle 5 étapes** défini dans `CLAUDE.md`. Ce guide donne les étapes, livrables attendus, critères de validation et timeline.

---

## Cycle 5 étapes : Vue d'ensemble

```
Étape 1 (Specs)           [Terminé ✓]  → Product Manager
        ↓
Étape 2 (Doc)            [À lancer]     → Technical Writer
        ↓
Étape 3 (Dev)            [À lancer]     → TypeScript Pro (core) + Vue Expert (UI)
        ↓
Étape 4 (Tests)          [À lancer]     → Test Automator
        ↓
Étape 5 (QA)             [À lancer]     → Code Reviewer + Architect
        ↓
Porte : npm run build ✓ + npm test ✓ + revue OK
        ↓
PHASE 3 COMPLETED
```

**Timeline estimée** : 2–3 semaines (specs + dev + tests + QA en parallèle où possible).

---

## Étape 1 : Spécifications (TERMINÉ ✓)

### Livrables

- [ ] `15-graph-model.md` : modèle de données, extension snapshot.
- [ ] `16-graph-layout.md` : algorithme layout détaillé, CA-layout-NN.
- [ ] `17-graph-render.md` : rendu SVG, interactions, CA-graph-NN.
- [ ] `PHASE3-SUMMARY.md` : résumé exécutif, décisions structurantes.
- [ ] `PHASE3-INDEX.md` : guide de lecture et structure.
- [ ] `PHASE3-QUICK-START.md` : TL;DR pour developers.

### Critères de validation (Étape 1)

- [ ] Specs écrites en Markdown, structure claire (sections, code blocks, exemples).
- [ ] Types TypeScript explicites (LayoutInput, GraphLayout, GraphNode, GraphEdge).
- [ ] Critères d'acceptation (CA) chiffrés et testables (CA-layout-NN, CA-graph-NN).
- [ ] Algorithme décrit en pseudo-code (6 étapes, complexité indiquée).
- [ ] Cas limites listés (vide, 1 commit, linéaire, branches, merges, HEAD détaché, nombreux).
- [ ] Décisions structurantes justifiées (pourquoi `allCommits`, pourquoi layout pur, pas de lib).
- [ ] Dépendances claires (15 → 16 → 17, core → layout → UI).
- [ ] Aucune contradiction entre specs (types cohérents, algorithme logique, UI possible).

### Validation d'Étape 1 (orchestrateur)

Vérifier :

1. **Complétude** : tous les livrables présents et formatés.
2. **Cohérence** : types/contrats ne changent pas entre specs (LayoutInput identique partout).
3. **Testabilité** : chaque CA peut être testé automatiquement (Vitest) ou manuellement (vérifiable).
4. **Feasibility** : équipe (dev, QA) peut implémenter d'après ces specs sans questions.

**Signature** : orchestrateur approuve et signale "Étape 1 OK" (ou demande révisions).

---

## Étape 2 : Documentation (parallèle avec Étape 1)

### Livrables

- [ ] `docs/USAGE.md` : ajouter section "Graphe" (comment fonctionne, raccourcis, exemples).
- [ ] `CLAUDE.md` : mettre à jour architecture (ligne sur `src/graph/`).
- [ ] README Phase 3 : courte intro (optionnel, peut être dans PHASE3-INDEX).

### Contenu attendu

**Section Graphe dans USAGE.md** :

```markdown
## Graphe Git

La visualisation affiche l'arborescence Git (DAG des commits) avec branches colorées.

### Navigation

- **Zoom** : scroll souris (0.1x–5x).
- **Pan** : clic droit + drag.
- **Hover** : survol d'un commit → tooltip (hash, message, parents).
- **Click** : sélection d'un commit.

### Légende

- Cercles = commits (couleur = branche).
- Branches = badges bleus (noms des branches).
- Tags = badges jaunes (noms des tags).
- HEAD = badge blanc ou halo rouge (commit courant).
- Lignes droites = historique linéaire.
- Courbes = merges (2+ parents).

### Exemple

```
$ git init
$ echo "hello" > file.txt
$ git add .
$ git commit -m "Initial commit"
$ git checkout -b feature
$ echo "world" > file.txt
$ git commit -am "Add world"
$ git checkout main
```

Le graphe affiche deux branches divergentes (main, feature) sur des lanes parallèles.
```

**CLAUDE.md - section architecture** :

```markdown
- `src/graph/` — layout (tri topo → lanes → couleurs → géométrie) et types. Fonction pure `calculateLayout(LayoutInput): GraphLayout`, testable Vitest sans DOM.
```

### Critères de validation (Étape 2)

- [ ] Documentation claire, sans jargon (accessibilité pour utilisateurs non-techniques).
- [ ] Exemples concrets (créer branches, merge, checkout → voir graphe changer).
- [ ] Raccourcis/contrôles documentés (pan, zoom, hover).
- [ ] Cohérence avec CLAUDE.md (architecture mentionnée, sans contradiction).

### Validation d'Étape 2 (orchestrateur)

Vérifier :

1. **Clarté** : utilisateur comprend comment utiliser le graphe.
2. **Exemples** : chaque cas clé montré (branche, merge, HEAD détaché).
3. **Complétude** : CLAUDE.md à jour.

**Signature** : orchestrateur approuve doc.

---

## Étape 3 : Développement (parallèle avec Étape 2, commence après Étape 1)

### Sequencing et rôles

```
TypeScript Pro (core)             Vue Expert (UI)
├─ getAllCommitsTopologicalOrder  
├─ update engine.ts (allCommits)
└─ src/graph/layout.ts           [puis] GraphView.vue
                                  ├─ SVG render
                                  └─ interactions
```

**Ordre strict** : core d'abord (layout pur testable), puis UI (dépend de layout).

### Sub-étape 3A : Core (TypeScript Pro)

**Durée estimée** : 3–4 jours.

**Fichiers** :

1. `src/core/repository.ts` → `getAllCommitsTopologicalOrder(repo)`
   - Collecte tous les commits du dépôt.
   - Tri topologique (DFS post-ordre).
   - Tiebreaker hash pour déterminisme.
   
2. `src/core/engine.ts` → `snapshot()` method
   - Call `getAllCommitsTopologicalOrder()`.
   - Décorer avec branches/tags.
   - Exposer `allCommits` dans `RepoSnapshot`.

**Checklist d'implémentation** :

- [ ] Fonction écrite, pas d'erreurs de compilation.
- [ ] Tests unitaires pour tri topo (CA-layout-01 : Y(parent) < Y(enfant)).
- [ ] Tests cas limites (vide, 1 commit, linéaire, branches).
- [ ] Déterminisme vérifié (appel 1000x, résultat identique).
- [ ] Performance : O(C log C), test sur 1000 commits < 50ms.
- [ ] Backward compatibility : `snapshot.commits` inchangé, ancien code fonctionne.

**Validation d'Étape 3A** :

TypeScript Pro : "Core implémenté et testé. `allCommits` exposé, tous les CA-model passent."

Orchestrateur : vérifier `npm run build` vert, `npm test` vert (core tests).

---

### Sub-étape 3B : Layout (TypeScript Pro ou Vue Expert)

**Durée estimée** : 5–7 jours (plus complexe).

**Fichier** : `src/graph/layout.ts`

**Implémentation séquentielle** (tester chaque étape) :

1. **Tri topologique** (1 jour)
   - `topologicalSort(commits): SnapshotCommit[]`
   - Tests : CA-layout-01.

2. **Profondeur** (0.5 jour)
   - `calculateDepths(commits, topSorted): Map<string, number>`
   - Tests : Y(parent) < Y(enfant).

3. **Lanes** (2 jours)
   - `assignLanes(commits, branches, ...): Map<string, number>`
   - Tests : CA-layout-02, 03.
   - Itération : si résultat non-déterministe, ajuster tiebreakers.

4. **Positions** (1 jour)
   - `calculatePositions(commits, lanes, depths, options): Map<string, {x, y}>`
   - Tests : CA-layout-04 (x = lane*w, y = depth*h).

5. **Arêtes** (1.5 jours)
   - `buildEdges(commits, lanes, positions): GraphEdge[]`
   - Linéaires vs courbes.
   - Tests : CA-layout-05, 07.

6. **Couleurs** (0.5 jour)
   - `assignColors(branches, lanes, palette): Map<number, string>`
   - Tests : CA-layout-07 (déterminisme).

7. **Orchestration** (0.5 jour)
   - `calculateLayout(input: LayoutInput): GraphLayout`
   - Tests : CA-layout-06 (tous cas limites).

**Checklist d'implémentation** :

- [ ] 6 étapes implémentées.
- [ ] Types `GraphNode`, `GraphEdge`, `GraphLayout` définis.
- [ ] Fonction `calculateLayout` exposée.
- [ ] Déterminisme : 1000 appels identiques, sortie identique.
- [ ] Performance : < 50ms pour 500 commits.
- [ ] Tous CA-layout-NN passent (7 CAs).
- [ ] Pas de dépendances Vue/DOM (pur TypeScript).

**Validation d'Étape 3B** :

TypeScript Pro : "Layout implémenté, pur, déterministe, performant. Tous CA-layout passent."

Orchestrateur : vérifier `npm test tests/graph-layout.test.ts` 100% vert.

---

### Sub-étape 3C : UI / SVG (Vue Expert)

**Durée estimée** : 4–5 jours (parallèle avec 3B après que layout type soit disponible).

**Fichier** : `src/components/GraphView.vue`

**Implémentation** :

1. **Structure SVG** (1.5 jours)
   - `<g class="edges">` : lignes/courbes.
   - `<g class="nodes">` : cercles.
   - `<g class="badges">` : rectangles avec texte.
   - `<g class="labels">` : hash + message.

2. **Calcul de layout** (0.5 jour)
   - Computed `graphLayout` → call `calculateLayout()`.
   - Computed `headHash`.
   - Fallback : `snapshot.allCommits ?? snapshot.commits`.

3. **Interactions** (1.5 jours)
   - Zoom : scroll mouse, 0.1x–5x.
   - Pan : clic droit + drag.
   - Hover : tooltip, highlight.
   - Click : sélection.

4. **Styles CSS** (1 jour)
   - Nœuds (couleur, hover, selected, head).
   - Arêtes (linéaires, merge, hover).
   - Badges (branch bleu, tag jaune, HEAD blanc).
   - Placeholder (non-initialisé, sans commit).

5. **Cas limites** (0.5 jour)
   - Dépôt non-init → placeholder.
   - Sans commit → placeholder.
   - Nombreux commits → scroll/pan/zoom.

**Checklist d'implémentation** :

- [ ] SVG rendu sans erreur.
- [ ] Nœuds, arêtes, badges visibles.
- [ ] Pan fonctionne (clic droit + drag).
- [ ] Zoom fonctionne (scroll, 0.1–5x).
- [ ] Hover → tooltip.
- [ ] Click → sélection.
- [ ] Couleurs visuellement agréables.
- [ ] Cas limites sans erreur.
- [ ] Tous CA-graph-NN testables (9 CAs).

**Validation d'Étape 3C** :

Vue Expert : "GraphView.vue implémenté, interactif, responsive. Tous CA-graph testables."

Orchestrateur : vérifier rendu SVG en dev (http://localhost:5173), tester pan/zoom/hover manuellement.

---

### Validation d'Étape 3 (orchestrateur)

Critères cumulés :

- [ ] Core (3A) : `npm test` vert, allCommits exposé.
- [ ] Layout (3B) : `npm test tests/graph-layout.test.ts` vert, déterministe.
- [ ] UI (3C) : SVG rendu, interactif, cas limites OK.
- [ ] `npm run build` vert (typecheck strict, pas d'erreur).
- [ ] Pas de logique git dans Vue/store (séparation core/UI respectée).

**Signature** : orchestrateur approuve dev.

---

## Étape 4 : Tests (parallèle avec Étape 3C)

### Livrables

- [ ] `tests/graph-layout.test.ts` : tests layout (CA-layout-NN + cas limites).
- [ ] `tests/graph-render.test.ts` : tests SVG/interactions (optionnel, peut utiliser snapshots).

### Contenu des tests

**graph-layout.test.ts** (inspiré de 16-graph-layout.md) :

```typescript
describe('Graph Layout', () => {
  describe('CA-layout-01: Topological sort', () => {
    it('respects parent-child order (Y(parent) < Y(child))', () => {
      // Create A <- B <- C
      // Check Y(A) < Y(B) < Y(C)
    });
    it('handles linear history', () => { /* ... */ });
    it('handles merge (multi-parent)', () => { /* ... */ });
  });

  describe('CA-layout-02: Deterministic lanes', () => {
    it('assigns same lanes on repeated calls', () => {
      const layout1 = calculateLayout(input);
      const layout2 = calculateLayout(input);
      expect(layout1.nodes.map(n => n.lane)).toEqual(layout2.nodes.map(n => n.lane));
    });
  });

  describe('CA-layout-03: Branch coherence', () => {
    it('primary branch on lane 0', () => {
      // main branch tip on lane 0
    });
    it('other branches on distinct lanes', () => { /* ... */ });
  });

  describe('CA-layout-04: Positions', () => {
    it('computes x = lane * laneWidth + padding.left', () => { /* ... */ });
    it('computes y = depth * commitHeight + padding.top', () => { /* ... */ });
  });

  describe('CA-layout-05: Edges', () => {
    it('creates edge for each parent-child pair', () => { /* ... */ });
    it('linear edges (same lane) are straight', () => { /* ... */ });
    it('merge edges (diff lanes) are marked as merge', () => { /* ... */ });
  });

  describe('CA-layout-06: Edge cases', () => {
    it('empty repo → empty layout', () => { /* ... */ });
    it('one commit → single node', () => { /* ... */ });
    it('linear history → all on lane 0', () => { /* ... */ });
    it('divergent branches → each on own lane', () => { /* ... */ });
  });

  describe('CA-layout-07: Colors', () => {
    it('assigns deterministic color per lane', () => {
      // Repeated calls → same colors
    });
    it('primary branch (main) → color 0 (blue)', () => { /* ... */ });
  });
});
```

**graph-render.test.ts** (optionnel, peut utiliser snapshots Vue) :

```typescript
describe('Graph Render (SVG)', () => {
  // CA-graph-01: Basic SVG
  // CA-graph-02: Labels & badges
  // CA-graph-03: Hover & tooltip
  // ... etc.
  // Peut utiliser snapshots ou testing-library/@vue
});
```

### Métriques

- **Couverture** : ≥ 80% code couverture (layout + UI).
- **Cas testés** : tous les CA (18 total).
- **Cas limites** : vide, 1 commit, linéaire, branches, merges, HEAD détaché, nombreux.

### Validation d'Étape 4

- [ ] Tests écrits depuis specs (pas depuis implémentation).
- [ ] Tous CA passent (18/18).
- [ ] `npm test` vert.
- [ ] Couverture ≥ 80%.

**Signature** : test-automator approuve tests.

Orchestrateur : vérifier `npm test` vert, couverture.

---

## Étape 5 : QA (après dev + tests)

### Code Review

- [ ] **Séparation core/UI** : layout pur (pas de Vue/DOM en src/graph/layout.ts).
- [ ] **Types** : LayoutInput, GraphLayout, GraphNode, GraphEdge bien définis, cohérents.
- [ ] **Déterminisme** : layout toujours identique pour input identique (tester 10x).
- [ ] **Performance** : O(C+E) respecté, < 50ms pour 500 commits.
- [ ] **Backward compat** : `snapshot.commits` inchangé, ancien code fonctionne.
- [ ] **Conventions** : pas d'`any`, strict TS, imports cohérents.

### Architect Review

- [ ] **Décisions structurantes** : `allCommits` optional, layout pur, SVG custom bien justifiées.
- [ ] **Évolutivité** : comment scale à 10k commits ? (virtualisation Phase 4 ?).
- [ ] **Maintenabilité** : code lisible, pas de copier-coller, fonctions réutilisables.
- [ ] **Intégration** : comment graphe intègre avec reset/rebase (Phase 4) ?

### Issues possibles (exemples)

| Problème | Critique ? | Solution |
|----------|-----------|----------|
| Layout non-déterministe (couleurs varient) | Oui | Ajouter tiebreaker (hash branche) |
| Performance > 100ms pour 500 commits | Oui | Optimiser tri topo ou DP |
| SVG affiche rien | Oui | Debug graphLayout (console log) |
| Pan/zoom ne fonctionne pas | Oui | Vérifier transform SVG, event listeners |
| Tooltip pas visible | Non | UX tweak, peut repousser |
| Couleurs ternes | Non | Ajuster palette, Phase 4 |

### Validation d'Étape 5

- [ ] Code review : aucun blocant.
- [ ] Architect review : aucun blocant.
- [ ] Issues corrigées ou acceptées (avec justification).
- [ ] Build vert, tests vert.

**Signature** : code-reviewer + architect approuvent.

Orchestrateur : approuve review.

---

## Porte de validation (Phase 3 completée)

Pour marquer Phase 3 comme **"COMPLETED"**, vérifier :

- [ ] **Étape 1 (Specs)** : 6 fichiers livrés, validés.
- [ ] **Étape 2 (Doc)** : USAGE.md + CLAUDE.md mis à jour.
- [ ] **Étape 3 (Dev)** : core + layout + UI implémentés, `npm run build` vert.
- [ ] **Étape 4 (Tests)** : `npm test` vert, ≥ 80% couverture, tous CA passent.
- [ ] **Étape 5 (QA)** : revue OK, pas de blocant.
- [ ] **Démo** : DAG visualisé correctement pour 5+ cas tests (linéaire, branches, merges, HEAD détaché, nombreux commits).

**Sign-off** : orchestrateur → "Phase 3 COMPLETED".

---

## Timeline et allocation (suggestion)

### Semaine 1 : Specs + Core

| Jour | Rôle | Tâche | Durée |
|------|------|-------|-------|
| Lun | PM | Specs (15–17) validées | 2j |
| Mar | TW | Doc (USAGE + CLAUDE) | 1j |
| Mer–Ven | TS Pro | Core (3A) : getAllCommits + engine.ts | 3j |

### Semaine 2 : Layout + UI

| Jour | Rôle | Tâche | Durée |
|------|------|-------|-------|
| Lun–Mer | TS Pro | Layout (3B) : 6 étapes | 3j |
| Jeu–Ven | Vue Expert | UI (3C) : SVG + interactions | 2j (start Wed) |
| Lun–Ven | QA | Tests (4) : layout + render | 3j (parallèle) |

### Semaine 3 : QA + Polish

| Jour | Rôle | Tâche | Durée |
|------|------|-------|-------|
| Lun–Mar | Code Review | Revue code + fixes | 2j |
| Mer | Architect | Revue architecture | 1j |
| Jeu–Ven | TS Pro / Vue Expert | Polish + perf | 2j |

**Total** : ~2.5–3 semaines (avec parallélisation).

---

## Communication et réunions

### Kickoff (avant Jour 1)

- [ ] Présentation PHASE3-SUMMARY à toute l'équipe (30 min).
- [ ] Q&A sur décisions structurantes.
- [ ] Assignation rôles (TS Pro, Vue Expert, QA, Architects).
- [ ] Calendrier partagé.

### Daily standup (15 min, daily)

- [ ] Étapes 3A, 3B, 3C : blocants ? progresser comme prévu ?
- [ ] Tests (4) : coverage, blocker tests ?
- [ ] QA (5) : prêt à commencer ?

### Checkpoint fin Semaine 1

- [ ] Core (3A) testé et fusionné.
- [ ] Layout implémentation en cours (étapes 1–3 finies).
- [ ] Pas de blocker.

### Checkpoint fin Semaine 2

- [ ] Layout + UI implémentés.
- [ ] Tests à couverture ≥ 80%.
- [ ] Aucun blocant majeur.

### Review meeting fin Semaine 3

- [ ] Présentation porte de validation (orchestrateur check).
- [ ] Code review findings (code-reviewer).
- [ ] Architect concerns (architect-reviewer).
- [ ] Sign-off Phase 3 COMPLETED.

---

## Risk management

### Risques identifiés

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|-----------|
| Layout non-déterministe | Moyen | Élevé | Tester déterminisme tôt (jour 5) |
| SVG rendu mal (positions) | Moyen | Moyen | Debug avec console.log x/y (jour 7) |
| Performance < acceptée | Bas | Moyen | Benchmark jour 6, optimiser DP |
| Merge (2 parents) arêtes cassées | Bas | Moyen | Cas test jour 4 (avant impl UI) |
| Specifications manquent détails | Bas | Élevé | QA relire specs jour 1 (avant dev) |

### Escalade

- **Blocker technique** → architect-reviewer.
- **Blocker spec** → orchestrateur.
- **Delay ≥ 2 jours** → replan avec PM.

---

## Acceptance criteria pour orchestrateur

### À la fin de Phase 3, vérifier

- [ ] 6 specs fichiers livrés, relus, cohérents.
- [ ] `npm run build` ✓ (typecheck strict, no errors).
- [ ] `npm test` ✓ (all tests pass, ≥ 80% coverage).
- [ ] Core : `allCommits` exposé, backward compat ✓.
- [ ] Layout : pur, déterministe, O(C+E), CA-layout-NN passent.
- [ ] UI : SVG rendu, interactif (pan, zoom, hover, click), CA-graph-NN testables.
- [ ] Code review : pas de blocant.
- [ ] Architect review : pas de blocant.
- [ ] Démo : DAG visualisé pour 5+ cas (travail fonctionnellement).

---

## Notes finales

1. **Parallelisation** : specs d'abord (Étape 1), puis Étape 2 + 3A parallèle, puis 3B + 3C parallèle, puis 4 + 5 chevauchent.

2. **Itération rapide** : test chaque étape (layout) avant de passer à la suivante. Détecter les bugs tôt.

3. **Determinism** : clé pour un layout reproductible. Tester 1000x même input → même output.

4. **Performance** : O(C+E) acceptable jusqu'à ~10k commits. Virtualisation = Phase 4+.

5. **Backward compat** : `snapshot.commits` reste (depuis HEAD), `allCommits` nouveau (optionnel).

6. **Evolvability** : Phase 4 (merge, rebase) dépend du layout bien construit. Pas de "tech debt" ici.

---

**Bon orchestrage ! 🎯**

Vous avez 5 agents voltagents, un cycle clair, et un plan détaillé. Lancer et itérer.
