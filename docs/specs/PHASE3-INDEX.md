# Phase 3 – Visualisation graphique : Index et guide de lecture

## Objectif de la Phase 3

Implémenter la **visualisation graphique du DAG Git** : arbre des commits avec branches colorées, arêtes parent-enfant, badges de refs, et interactions interactives (pan, zoom, hover, sélection).

## Documents de spécifications

### 📘 PHASE3-SUMMARY.md (LIRE D'ABORD)

**Vue d'ensemble exécutive** : résumé des 5 décisions structurantes, workflow de développement, critères de succès.

**À lire si** : vous avez besoin de comprendre le "quoi" et le "pourquoi" en 10 minutes.

**Contient** :
- Contexte général de la Phase 3.
- 5 décisions clés avec leurs justifications.
- Workflow agentique (5 étapes).
- Critères de "Phase 3 terminée".
- Questions ouvertes pour Phase 4+.

---

### 📗 15-graph-model.md (MODÈLE DE DONNÉES)

**Spécification du modèle de données** : extension du snapshot, contrats des types.

**À lire si** :
- Vous implémentez le moteur (core/engine.ts, repository.ts).
- Vous travaillez sur la couche layout (src/graph/).
- Vous avez besoin du contrat exact des types (LayoutInput, GraphLayout).

**Contient** :
- Problème : snapshot limité aux commits depuis HEAD.
- Solution : ajouter `allCommits?: SnapshotCommit[]`.
- Algorithme de calcul de `allCommits` (pseudo-code).
- Contrat de l'algorithme de layout (types `GraphNode`, `GraphEdge`, `GraphLayout`).
- Responsabilités par composant (moteur, store, layout, UI).
- 4 critères d'acceptation (CA-model-01 à -04).

**Termes clés** :
- `RepoSnapshot` : snapshot immuable du dépôt.
- `SnapshotCommit` : un commit avec hash, message, parents, branches, tags.
- `LayoutInput` : entrée du layout (commits + branches + head + options).
- `GraphLayout` : sortie du layout (nodes + edges + dimensions).

**À avoir à côté lors du dev** : ce document + le contenu de `src/core/engine.ts`.

---

### 📙 16-graph-layout.md (ALGORITHME DE LAYOUT)

**Spécification détaillée de l'algorithme** : 6 étapes pures et testables.

**À lire si** :
- Vous implémentez `src/graph/layout.ts`.
- Vous écrivez les tests Vitest pour le layout.
- Vous avez besoin de comprendre le routage des arêtes, l'assignation des lanes, la déterminisme.

**Contient** :
- **Étape 1 : Tri topologique** (DFS post-ordre, tiebreaker hash).
- **Étape 2 : Calcul de profondeur** (DP, O(C+E)).
- **Étape 3 : Assignation de lanes** (heuristique : primary branch, backtrack, orphelins).
- **Étape 4 : Calcul de positions (x, y)** (formule simple : x = lane * laneWidth, y = depth * commitHeight).
- **Étape 5 : Routage des arêtes** (linéaires vs courbes de Bézier).
- **Étape 6 : Assignation de couleurs** (déterministe par branche).
- Fonction principale `calculateLayout(input)` (orchestration).
- 7 critères d'acceptation (CA-layout-01 à -07).

**Termes clés** :
- Topologie : enfants avant parents.
- Depth : niveau vertical (0 = feuille, +1 per parent).
- Lane : colonne (0 = primary branch, 1+ = branches parallèles).
- Linear edge : même lane, ligne droite.
- Merge edge : lanes différentes, courbe Bézier.

**À avoir à côté lors du dev** : ce document + l'implémentation de `src/graph/layout.ts`.

---

### 📕 17-graph-render.md (RENDU SVG ET INTERACTIONS)

**Spécification du rendu visuel** : SVG custom, badges, interactions (pan, zoom, hover, click).

**À lire si** :
- Vous implémentez `src/components/GraphView.vue`.
- Vous écrivez les tests d'intégration (SVG rendering, interactions).
- Vous avez besoin de détails CSS, positionnement des badges, gestion des tooltips.

**Contient** :
- Architecture du composant Vue.
- Structure SVG (arêtes, nœuds, badges, labels).
- Logique Vue (computed, méthodes, state réactif).
- Styles CSS (nœuds, arêtes, badges, hover, select).
- Rendu des arêtes (droites vs courbes de Bézier cubiques).
- Badges (HEAD, branches, tags) et positionnement.
- Interactions (pan, zoom, hover, click, sélection).
- Gestion des cas limites (vide, sans commit, nombreux commits).
- Performance (virtualisation, debouncing, memoization).
- Palette de couleurs proposée.
- 9 critères d'acceptation (CA-graph-01 à -09).

**Termes clés** :
- Pan : translation du graphe (clic droit + drag).
- Zoom : échelle (scroll souris, 0.1x à 5x).
- Hover : survol d'un nœud → tooltip + highlight.
- Click : sélection d'un nœud (toggle).
- Badge : petit rectangle avec label (HEAD, branche, tag).

**À avoir à côté lors du dev** : ce document + `src/components/GraphView.vue` + `16-graph-layout.md` (pour comprendre `GraphLayout`).

---

## Dépendances entre specs

```
15-graph-model.md (types + contrats)
    ↓
16-graph-layout.md (algorithme + types GraphLayout)
    ↓
17-graph-render.md (SVG + interactions, utilise GraphLayout)
```

- **15 d'abord** : définit les types et contrats.
- **16 ensuite** : implémente l'algorithme, consomme types de 15.
- **17 en parallèle ou après 16** : utilise `GraphLayout` de 16, implémente UI.

---

## Workflow d'implémentation suggéré

### Phase 1 : Core (layout pur)

**Ordre d'implémentation** :

1. `src/core/repository.ts` : ajouter `getAllCommitsTopologicalOrder(repo)`.
   - Specs : section 1.3 de 15-graph-model.md.
   - Tests : tests/graph-layout.test.ts (CA-layout-01 : tri topologique).

2. `src/core/engine.ts` : call `getAllCommitsTopologicalOrder()`, exposer `allCommits` dans snapshot.
   - Specs : section 1.4 de 15-graph-model.md.
   - Tests : tests/graph-layout.test.ts (CA-model-01 à -04).

3. `src/graph/layout.ts` : implémenter les 6 étapes.
   - Specs : sections 2–8 de 16-graph-layout.md.
   - Tests : tests/graph-layout.test.ts (CA-layout-01 à -07).
   - **Itérer, tester à chaque étape** (tri topo, depth, lanes, positions, arêtes, couleurs).

### Phase 2 : UI (rendu SVG)

**Dépend de** : Phase 1 (layout pur fini et testé).

4. `src/components/GraphView.vue` : remplacer placeholder.
   - Specs : sections 1–3 de 17-graph-render.md.
   - Tests : tests/graph-render.test.ts (CA-graph-01 à -09), snapshots SVG.

5. Styles CSS.
   - Specs : section 3 de 17-graph-render.md.
   - Itération UX/design (couleurs, spacing, polices).

### Phase 3 : Tests complets

6. Tests Vitest : couverture ≥ 80%.
   - Specs : tous les CA-layout-NN et CA-graph-NN.
   - Cas limites, branches, merges, HEAD détaché, etc.

### Phase 4 : QA et itération

7. Revue code + architect.
8. Performance (mesure + optimisations si besoin).
9. Itération design/UX.

---

## Critères d'acceptation (CA) par document

### 15-graph-model.md

| CA | Titre | Description |
|-----|-------|-------------|
| CA-model-01 | Snapshot expose `allCommits` | Champ optionnel, calculé, immuable |
| CA-model-02 | Backward compatibility | `snapshot.commits` inchangé |
| CA-model-03 | Branches et tags corrects | Chaque commit porte ses refs |
| CA-model-04 | Tri topologique correct | Parents avant enfants (Y croissant) |

### 16-graph-layout.md

| CA | Titre | Description |
|-----|-------|-------------|
| CA-layout-01 | Tri topologique | Y(parent) < Y(enfant) |
| CA-layout-02 | Assignation lanes deterministe | Même snapshot = mêmes lanes |
| CA-layout-03 | Branches cohérentes | Primary = lane 0, autres stables |
| CA-layout-04 | Positions correctes | x = lane*w, y = depth*h |
| CA-layout-05 | Arêtes routées | Parent → enfant toutes présentes |
| CA-layout-06 | Cas limites | Vide, 1 commit, linéaire, branches |
| CA-layout-07 | Assignation couleurs | Déterministes, distinctes |

### 17-graph-render.md

| CA | Titre | Description |
|-----|-------|-------------|
| CA-graph-01 | Rendu SVG basique | Nœuds, arêtes, pas erreur |
| CA-graph-02 | Labels et badges | Hash, message, branches, tags, HEAD |
| CA-graph-03 | Hover et tooltip | Opacité, tooltip avec infos |
| CA-graph-04 | Pan et zoom | Scroll/drag, 0.1x–5x |
| CA-graph-05 | Sélection | Click toggle, border noir |
| CA-graph-06 | Cas limites | Pas erreur SVG, vide, 1, >100 commits |
| CA-graph-07 | Arêtes de merge | 2+ parents, courbes, pointillé |
| CA-graph-08 | Couleurs deterministes | Même branche = même couleur |
| CA-graph-09 | HEAD détaché | Badge ou halo distinctif |

**Total** : 18 critères d'acceptation testables et vérifiables.

---

## Fichiers clés à consulter

### Existants (à comprendre)

- `src/core/engine.ts` : `RepoSnapshot`, `SnapshotCommit`, `snapshot()` method.
- `src/core/repository.ts` : `getCommitHistoryWithHashes()` (fonction de référence).
- `src/stores/repo.ts` : exposition du snapshot réactif.
- `src/components/GraphView.vue` : placeholder à remplacer.
- `CLAUDE.md` : architecture, conventions.

### À créer (Phase 3)

- `src/graph/layout.ts` : layout pur (fonction + types).
- `src/graph/index.ts` : exports (optionnel si type dans layout.ts).
- `tests/graph-layout.test.ts` : tests layout (Vitest).
- `tests/graph-render.test.ts` : tests rendu/interactions (optionnel, snapshots).

### À modifier

- `src/core/repository.ts` : ajouter `getAllCommitsTopologicalOrder()`.
- `src/core/engine.ts` : appeler `getAllCommitsTopologicalOrder()`, exposer `allCommits`.
- `src/components/GraphView.vue` : remplacer placeholder par rendu complet.

---

## Guide de lecture par rôle

### 👨‍💼 Product Manager / Orchestrateur

1. **PHASE3-SUMMARY.md** : vue exécutive, décisions, porte de validation.
2. **PHASE3-INDEX.md** (ce document) : vue d'ensemble et structuration.

**Temps** : 15 min.

---

### 👨‍💻 Développeur Backend (moteur Git)

1. **PHASE3-SUMMARY.md** : contexte (5 min).
2. **15-graph-model.md, sections 1–2** : modèle et contrat (10 min).
3. **16-graph-layout.md, sections 1–2** : tri topologique, profondeur (15 min).
4. Implémenter `getAllCommitsTopologicalOrder()` + update `engine.ts`.
5. **16-graph-layout.md, sections 3–4** : lanes, positions (15 min).
6. Implémenter `assignLanes()` + `calculatePositions()`.

**Dépend de** : phase 1 (moteur pur).

---

### 👨‍💻 Développeur Frontend (Layout)

1. **PHASE3-SUMMARY.md** : contexte (5 min).
2. **15-graph-model.md, section 2** : contrat LayoutInput/GraphLayout (10 min).
3. **16-graph-layout.md** : algorithme complet (45 min).
4. Implémenter `src/graph/layout.ts` : fonction `calculateLayout()`.
5. Tester + déboguer avec Vitest.

**Dépend de** : phase 1 (moteur expose `allCommits`).

---

### 👨‍💻 Développeur Frontend (UI Vue)

1. **PHASE3-SUMMARY.md** : contexte (5 min).
2. **15-graph-model.md, section 2** : types (5 min).
3. **17-graph-render.md** : rendu SVG + interactions (40 min).
4. Implémenter `src/components/GraphView.vue`.
5. CSS + itération UX.

**Dépend de** : phase 2 (layout pur fini).

---

### 🧪 QA / Test Automator

1. **15-graph-model.md, section 5** : CA-model-NN (5 min).
2. **16-graph-layout.md, section 9** : CA-layout-NN (10 min).
3. **17-graph-render.md, section 8** : CA-graph-NN (10 min).
4. Écrire tests Vitest : `tests/graph-layout.test.ts` + `tests/graph-render.test.ts`.
5. Couvrir tous les CA + cas limites.

**Dépend de** : specs finalisées (ce document).

---

### 🔍 Code Reviewer / Architect

1. **PHASE3-SUMMARY.md** : décisions structurantes (15 min).
2. **15–17** : scan rapide des specs (15 min).
3. À la revue :
   - Conformité specs ↔ code.
   - Séparation core/UI respectée.
   - Déterminisme de layout (tester plusieurs fois).
   - Performance : O(C+E) respecté ?
   - Couverture tests ≥ 80%.
   - Cas limites couverts.

**Outils** : Chrome DevTools, Vitest, npm run build.

---

## Checklist de validation de Phase 3

### Avant de coder

- [ ] Specs 15–17 relues et validées par orchestrateur.
- [ ] Équipe comprend les 5 décisions structurantes.
- [ ] Types (LayoutInput, GraphLayout) documentés et approuvés.

### Pendant le dev

- [ ] `src/core/repository.ts:getAllCommitsTopologicalOrder()` implémenté + testé.
- [ ] `src/core/engine.ts:snapshot()` expose `allCommits`.
- [ ] `src/graph/layout.ts:calculateLayout()` implémenté, 6 étapes testées.
- [ ] `src/components/GraphView.vue` remplace placeholder, SVG rendu.
- [ ] Tests Vitest : couverture ≥ 80%, tous CA passent.

### À la fin

- [ ] `npm run build` vert (typecheck strict).
- [ ] `npm test` vert (tous tests passent).
- [ ] Revue QA sans blocant.
- [ ] DAG visualisé correctement pour cas tests (démo manuelle).

---

## Ressources externes (optionnel)

- **Git internals** : pro Git, chapters 9–10 (DAG, refs, objects).
- **Topological sort** : https://en.wikipedia.org/wiki/Topological_sorting (DFS post-ordre).
- **Bézier curves** : https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths (Path element).
- **Vue 3 + SVG** : https://vuejs.org/ (computed, ref, event listeners).

---

## Prochaines étapes après Phase 3

1. **Phase 4 : Merge & Rebase** → DAG mutable, reset/rebase réécrivent historique.
2. **Phase 5 : Interactive features** → contexte-menu, cherry-pick, stash.
3. **Phase 6+ : Optimisations** → virtualisation, minimap, shortcuts clavier.

---

## Questions fréquentes (FAQ)

**Q : Pourquoi pas utiliser gitgraph.js ?**
A : Reset/rebase réécrivent l'historique ; une lib générique ne suivrait pas. Rendu custom = responsabilité claire.

**Q : Comment gérer les merges (2 parents) ?**
A : Phase 3 prépare les arêtes (type='merge'). Phase 4 ajoute `git merge` réel.

**Q : Pourquoi ajouter `allCommits` au lieu de changer `commits` ?**
A : Backward compatibility. `commits` = depuis HEAD (cas commun), `allCommits` = tous (graphe complet).

**Q : Comment assurer le déterminisme de layout ?**
A : Tiebreakers explicites (sort par hash), test 1000x sur même snapshot.

**Q : Performance pour 10k commits ?**
A : O(C log C) → acceptable. Au-delà, virtualisation (Phase 4+).

---

## Contacts et escalade

- **Questions specs** → orchestrateur (product-manager).
- **Questions layout** → typescript-pro (core + graph).
- **Questions rendering** → vue-expert (UI).
- **Questions tests** → test-automator (Vitest).
- **Blocants** → architect-reviewer.

---

**Dernière mise à jour** : 2026-06-09 (spécifications Phase 3, révision 1).

**État** : ✅ Spécifications écrites, prêtes pour développement.
