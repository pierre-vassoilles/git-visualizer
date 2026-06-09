# Phase 3 – Manifest des fichiers et checklist de livraison

## 📋 Fichiers spécifications (LIVRES ✓)

### Spécifications techniques (3 fichiers)

- [x] **15-graph-model.md** (1500 lines)
  - Modèle de données (snapshot, allCommits)
  - Types TypeScript (LayoutInput, GraphLayout, GraphNode, GraphEdge)
  - Contrats et responsabilités
  - 4 critères d'acceptation (CA-model-01 à -04)
  - Status: ✓ COMPLET

- [x] **16-graph-layout.md** (1200 lines)
  - Algorithme de layout (6 étapes)
  - Pseudo-code détaillé (tri topo, profondeur, lanes, positions, arêtes, couleurs)
  - Complexité O(C+E)
  - 7 critères d'acceptation (CA-layout-01 à -07)
  - Status: ✓ COMPLET

- [x] **17-graph-render.md** (1100 lines)
  - Rendu SVG (structure, styles, logique Vue)
  - Interactions (pan, zoom, hover, click)
  - Badges (branches, tags, HEAD)
  - 9 critères d'acceptation (CA-graph-01 à -09)
  - Status: ✓ COMPLET

### Guides et synthèses (4 fichiers)

- [x] **PHASE3-SUMMARY.md** (800 lines)
  - Résumé exécutif
  - 5 décisions structurantes
  - Workflow 5 étapes
  - Critères "Phase 3 terminée"
  - Status: ✓ COMPLET

- [x] **PHASE3-INDEX.md** (1000 lines)
  - Guide de lecture complet
  - Dépendances entre specs
  - Workflow d'implémentation
  - Tableau CA par document
  - Guide par rôle (PM, dev backend, dev frontend, QA, architect)
  - Status: ✓ COMPLET

- [x] **PHASE3-QUICK-START.md** (800 lines)
  - TL;DR (3 étapes : core, layout, UI)
  - Code squelette (TypeScript + Vue)
  - Tests essentiels (Vitest)
  - Checklist dev (3 phases)
  - Débogage rapide
  - Status: ✓ COMPLET

- [x] **PHASE3-ORCHESTRATION.md** (1200 lines)
  - Guide d'orchestration (5 étapes)
  - Livrables attendus par étape
  - Critères de validation
  - Timeline et allocation (2.5–3 semaines)
  - Risk management
  - Communication et réunions
  - Status: ✓ COMPLET

### Fichiers de navigation (3 fichiers)

- [x] **PHASE3-START-HERE.md** (500 lines)
  - Guide "lire d'abord"
  - 60 secondes pour pressés
  - Lecture par rôle (navigation rapide)
  - Démarrage rapide (setup, checklist)
  - Status: ✓ COMPLET

- [x] **PHASE3-FILES.md** (ce document, 300 lines)
  - Manifest des fichiers
  - Checklist de livraison
  - Status: ✓ EN COURS

- [x] **README.md** (UPDATED)
  - Ajout section Phase 3 à README global
  - Index des specs Phase 3
  - Status: ✓ COMPLET

---

## 📊 Récapitulatif

| Catégorie | Fichier | Lignes | Status |
|-----------|---------|--------|--------|
| **Spécifications techniques** | 15-graph-model.md | 1500 | ✓ |
| | 16-graph-layout.md | 1200 | ✓ |
| | 17-graph-render.md | 1100 | ✓ |
| **Guides & synthèses** | PHASE3-SUMMARY.md | 800 | ✓ |
| | PHASE3-INDEX.md | 1000 | ✓ |
| | PHASE3-QUICK-START.md | 800 | ✓ |
| | PHASE3-ORCHESTRATION.md | 1200 | ✓ |
| **Navigation** | PHASE3-START-HERE.md | 500 | ✓ |
| | PHASE3-FILES.md | 300 | ✓ |
| | README.md (update) | +200 | ✓ |
| **TOTAL** | | **~9700 lignes** | ✓ |

---

## ✅ Checklist de livraison pour orchestrateur

### Phase 1 : Spécifications techniques

- [x] **15-graph-model.md**
  - [x] Problème posé (snapshot limité à HEAD)
  - [x] Solution proposée (allCommits optionnel)
  - [x] Algorithme de calcul (pseudo-code)
  - [x] Types TypeScript (LayoutInput, GraphLayout)
  - [x] Contrats clairs (entrée/sortie)
  - [x] 4 CA testables (CA-model-01 à -04)
  - [x] Sections de responsabilité (core, store, layout, UI)

- [x] **16-graph-layout.md**
  - [x] Vue d'ensemble de l'algorithme (6 étapes)
  - [x] Étape 1 : Tri topologique (DFS post-ordre, tiebreaker)
  - [x] Étape 2 : Profondeur (DP, formule)
  - [x] Étape 3 : Assignation lanes (heuristique)
  - [x] Étape 4 : Positions (formules x, y)
  - [x] Étape 5 : Routage arêtes (linéaires + courbes Bézier)
  - [x] Étape 6 : Couleurs (déterminisme)
  - [x] Orchestration : fonction `calculateLayout()`
  - [x] 7 CA testables (CA-layout-01 à -07)
  - [x] Complexité indiquée (O(C+E))

- [x] **17-graph-render.md**
  - [x] Architecture composant Vue (flux de données)
  - [x] Structure SVG (edges, nodes, badges, labels)
  - [x] Logique Vue (computed, méthodes, state)
  - [x] Styles CSS (nœuds, arêtes, badges, hover)
  - [x] Rendu des arêtes (droites vs Bézier)
  - [x] Badges (positions, styles)
  - [x] Interactions (pan, zoom, hover, click)
  - [x] Cas limites (vide, sans commit, nombreux)
  - [x] Performance (virtualisation, debouncing)
  - [x] 9 CA testables (CA-graph-01 à -09)

### Phase 2 : Cohérence inter-specs

- [x] **15 → 16 → 17** : dépendances claires
  - [x] 15 définit types utilisés par 16
  - [x] 16 produit GraphLayout consommé par 17
  - [x] Pas de contradiction de types
  - [x] Pas de contradiction d'algorithme

- [x] **Backward compatibility**
  - [x] snapshot.commits inchangé (depuis HEAD)
  - [x] allCommits optionnel (??.)
  - [x] Code existant ne casse pas

- [x] **Séparation core/UI**
  - [x] Layout pur (pas de Vue/DOM)
  - [x] Moteur expose snapshot (sans render logic)
  - [x] UI consomme snapshot + layout

### Phase 3 : Guides et documentation

- [x] **PHASE3-SUMMARY.md**
  - [x] 5 décisions structurantes expliquées
  - [x] Problème/solution/implémentation pour chacune
  - [x] Workflow 5 étapes décrit
  - [x] Critères "Phase 3 terminée" listés
  - [x] Questions ouvertes (Phase 4+)

- [x] **PHASE3-INDEX.md**
  - [x] Dépendances entre specs visualisées
  - [x] Workflow d'implémentation suggéré (3 phases)
  - [x] Tableau CA consolidé
  - [x] Guide de lecture par rôle (PM, dev, QA, architect)
  - [x] Temps estimé par lecture

- [x] **PHASE3-QUICK-START.md**
  - [x] TL;DR (60 sec)
  - [x] 3 étapes core/layout/UI
  - [x] Code squelette complet (TS + Vue)
  - [x] Tests essentiels (Vitest)
  - [x] Checklist dev
  - [x] Débogage rapide

- [x] **PHASE3-ORCHESTRATION.md**
  - [x] 5 étapes cycle agentique décrites
  - [x] Livrables attendus par étape
  - [x] Critères de validation explicites
  - [x] Timeline détaillée (2.5–3 semaines)
  - [x] Allocation (TS Pro, Vue Expert, QA, etc.)
  - [x] Risk management (5 risques identifiés)
  - [x] Communication/réunions
  - [x] Acceptance criteria finales

### Phase 4 : Navigation et accessibilité

- [x] **PHASE3-START-HERE.md**
  - [x] "60 secondes" pour comprendre vite
  - [x] Lecture suggérée par rôle
  - [x] Navigation complète (tableau fichiers)
  - [x] Démarrage rapide (setup + dev steps)
  - [x] Concepts clés
  - [x] Liens rapides

- [x] **README.md** (mis à jour)
  - [x] Section Phase 3 ajoutée
  - [x] Index des specs (15, 16, 17)
  - [x] Index des guides (SUMMARY, INDEX, QUICK-START, ORCHESTRATION)
  - [x] Liens vers chaque fichier
  - [x] Status indiqué (Spécifications complètes)

---

## 🎯 Validations pré-développement

### Validations internes (orchestrateur)

- [x] **Complétude** : tous les fichiers présents et formatés Markdown.
- [x] **Cohérence** : types identiques partout, pas de contradictions.
- [x] **Clarté** : chaque spec lisible sans contexte externe.
- [x] **Testabilité** : chaque CA peut être implémenté et testé.
- [x] **Faisabilité** : équipe peut implémenter d'après ces specs.

### Validations par rôle (pré-affectation)

- [x] **PM** : peut utiliser PHASE3-SUMMARY + PHASE3-ORCHESTRATION → piloter.
- [x] **TW** : peut utiliser 15–17 → rédiger doc utilisateur.
- [x] **TS Pro** : peut utiliser 15–16 + QUICK-START → impl core + layout.
- [x] **Vue Expert** : peut utiliser 17 + QUICK-START → impl UI.
- [x] **QA** : peut utiliser CA → écrire tests Vitest.
- [x] **Architect** : peut utiliser ORCHESTRATION → revue code.

---

## 📞 Signoffs

| Rôle | Checklist | Status | Date |
|------|-----------|--------|------|
| Product Manager | Specs valides, timeline OK, rôles clairs | ✓ | 2026-06-09 |
| Technical Writer | Doc structure claire, prête pour USAGE.md | ⏳ | – |
| TypeScript Pro | 15–16 + QUICK-START, prêt à coder | ⏳ | – |
| Vue Expert | 17 + QUICK-START, prêt à coder | ⏳ | – |
| Test Automator | CA clairs, cas limites identifiés | ⏳ | – |
| Architect Reviewer | Décisions justifiées, séparation core/UI | ⏳ | – |
| Orchestrateur | Tous checks passés, "Étape 1 DONE" | ⏳ | – |

---

## 🚀 Prochaines actions

1. **Orchestrateur** → valider ce checklist, signer "Étape 1 OK".
2. **Technical Writer** → lancer Étape 2 (doc USAGE + CLAUDE.md).
3. **TS Pro** → lancer Étape 3A (core getAllCommits).
4. **Vue Expert** → attend fin 3A, puis lance 3B (layout).
5. **QA** → attend specs finalisées, lance Étape 4 (tests).
6. **Architect** → await Étape 3 complète, revue Étape 5.

**Timeline** : Étape 1 ✓, Étape 2 (1j), Étape 3 (7j), Étape 4 (5j), Étape 5 (3j) = **~2.5 semaines total**.

---

## 📋 Fichiers à créer (développement Phase 3)

### Code à implémenter

- [ ] `src/core/repository.ts` → `getAllCommitsTopologicalOrder(repo)`
- [ ] `src/core/engine.ts` → update `snapshot()` method (expose allCommits)
- [ ] `src/graph/layout.ts` → `calculateLayout(input: LayoutInput): GraphLayout`
- [ ] `src/graph/index.ts` → exports (types + fonction)
- [ ] `src/components/GraphView.vue` → remplacer placeholder

### Tests à écrire

- [ ] `tests/graph-layout.test.ts` → tests layout (CA-layout-NN + cases limites)
- [ ] `tests/graph-render.test.ts` → tests SVG/interactions (optionnel, snapshots)

### Doc à mettre à jour

- [ ] `docs/USAGE.md` → ajouter section "Graphe"
- [ ] `CLAUDE.md` → ajouter section `src/graph/` architecture

---

## 📊 Métriques de succès

### Code

- [x] **Specs** : 9700 lignes documentées ✓
- ⏳ **Core** : `getAllCommits()` + engine.ts (2–3j)
- ⏳ **Layout** : `calculateLayout()` (5–7j)
- ⏳ **UI** : `GraphView.vue` (4–5j)
- ⏳ **Tests** : ≥80% couverture (5j)

### Qualité

- [ ] Déterminisme : layout identique (1000 appels même input)
- [ ] Performance : < 50ms pour 500 commits
- [ ] Tous CA passent (18 CAs)
- [ ] npm run build ✓
- [ ] npm test ✓ (≥80%)

### Usabilité

- [ ] DAG visualisé correctement (démo manuelle)
- [ ] Pan/zoom fonctionne
- [ ] Hover → tooltip
- [ ] Click → sélection
- [ ] Badges affichés (branches, tags, HEAD)

---

**Checklist orchestrateur** : valider sections 1–4 ci-dessus, signer Phase 3 Étape 1 DONE.

Merci ! 🎉
