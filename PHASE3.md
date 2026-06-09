# Git Visualizer – Phase 3 : Visualisation graphique du DAG

## 🎯 Vue d'ensemble

La **Phase 3** ajoute la visualisation graphique du DAG Git (arbre des commits) avec branches colorées, arêtes, badges de refs et interactions interactives (pan, zoom, hover, sélection).

**Résultat final** : un graphe SVG interactif affichant l'historique complet du dépôt.

---

## 📦 Spécifications complètes

Toutes les spécifications Phase 3 sont dans **[`docs/specs/`](docs/specs/)** :

### Spécifications techniques (3 fichiers)

1. **[`15-graph-model.md`](docs/specs/15-graph-model.md)** – Modèle de données
   - Extension du snapshot : `allCommits?: SnapshotCommit[]`
   - Types TypeScript : `LayoutInput`, `GraphLayout`, `GraphNode`, `GraphEdge`
   - Contrats et responsabilités

2. **[`16-graph-layout.md`](docs/specs/16-graph-layout.md)** – Algorithme de layout
   - 6 étapes : tri topologique, profondeur, lanes, positions, arêtes, couleurs
   - Pseudo-code détaillé, complexité O(C+E)
   - 7 critères d'acceptation (CA-layout-NN)

3. **[`17-graph-render.md`](docs/specs/17-graph-render.md)** – Rendu SVG et interactions
   - Composant `GraphView.vue` (structure, styles, logique)
   - Pan, zoom, hover, click
   - Badges (branches, tags, HEAD)
   - 9 critères d'acceptation (CA-graph-NN)

### Guides et synthèses (8 fichiers)

- **[`PHASE3-EXECUTIVE-SUMMARY.md`](docs/specs/PHASE3-EXECUTIVE-SUMMARY.md)** (1 page) – **LIRE EN PREMIER**
  - Résumé exécutif pour orchestrateur
  - 5 décisions structurantes
  - Timeline, équipe, porte validation

- **[`PHASE3-START-HERE.md`](docs/specs/PHASE3-START-HERE.md)** – Guide orientation
  - 60 secondes pour comprendre
  - Navigation par rôle
  - Démarrage rapide

- **[`PHASE3-INDEX.md`](docs/specs/PHASE3-INDEX.md)** – Navigation complète
  - Guide de lecture par rôle
  - Dépendances entre specs
  - Tableau consolidé des 18 CAs

- **[`PHASE3-QUICK-START.md`](docs/specs/PHASE3-QUICK-START.md)** – TL;DR pour developers
  - 3 étapes : core, layout, UI
  - Code squelette (TypeScript + Vue)
  - Commandes utiles

- **[`PHASE3-SUMMARY.md`](docs/specs/PHASE3-SUMMARY.md)** – Résumé complet
  - 5 décisions clés avec justification
  - Workflow 5 étapes agentique
  - Critères de succès

- **[`PHASE3-ORCHESTRATION.md`](docs/specs/PHASE3-ORCHESTRATION.md)** – Guide PM
  - Cycle 5 étapes détaillé
  - Timeline 2.5–3 semaines
  - Risk management

- **[`PHASE3-FILES.md`](docs/specs/PHASE3-FILES.md)** – Manifest des fichiers
  - Checklist de livraison
  - Métriques de succès

- **[`PHASE3-VALIDATION-CHECKLIST.md`](docs/specs/PHASE3-VALIDATION-CHECKLIST.md)** – Validation orchestrateur
  - Checklist avant développement
  - Signature pour "Étape 1 DONE"

---

## 🗂️ Structure des fichiers

```
docs/specs/
├── 15-graph-model.md              ← Types, contrats
├── 16-graph-layout.md             ← Algorithme layout
├── 17-graph-render.md             ← Rendu SVG
├── PHASE3-EXECUTIVE-SUMMARY.md    ← 1 PAGE RÉSUMÉ
├── PHASE3-START-HERE.md           ← Orientation
├── PHASE3-INDEX.md                ← Guide complet
├── PHASE3-QUICK-START.md          ← TL;DR code
├── PHASE3-SUMMARY.md              ← Résumé détaillé
├── PHASE3-ORCHESTRATION.md        ← Guide PM
├── PHASE3-FILES.md                ← Manifest
├── PHASE3-VALIDATION-CHECKLIST.md ← Validation
└── README.md                       ← Updated with Phase 3
```

---

## 🚀 Démarrage rapide (par rôle)

### 👨‍💼 Product Manager / Orchestrateur

1. Lire : **[PHASE3-EXECUTIVE-SUMMARY.md](docs/specs/PHASE3-EXECUTIVE-SUMMARY.md)** (5 min)
2. Lire : **[PHASE3-ORCHESTRATION.md](docs/specs/PHASE3-ORCHESTRATION.md)** (15 min)
3. Valider : **[PHASE3-VALIDATION-CHECKLIST.md](docs/specs/PHASE3-VALIDATION-CHECKLIST.md)** (10 min)
4. Signer "Étape 1 OK" → lancer agents

### 👨‍💻 Developer Backend (Core + Layout)

1. Lire : **[PHASE3-QUICK-START.md](docs/specs/PHASE3-QUICK-START.md)** (10 min)
2. Lire : **[15-graph-model.md](docs/specs/15-graph-model.md)** sections 1–2 (10 min)
3. Lire : **[16-graph-layout.md](docs/specs/16-graph-layout.md)** (45 min)
4. Implémenter :
   - `src/core/repository.ts` : `getAllCommitsTopologicalOrder()`
   - `src/core/engine.ts` : exposer `allCommits`
   - `src/graph/layout.ts` : `calculateLayout()`

### 👨‍💻 Developer Frontend (UI)

1. Lire : **[PHASE3-QUICK-START.md](docs/specs/PHASE3-QUICK-START.md)** (10 min)
2. Lire : **[17-graph-render.md](docs/specs/17-graph-render.md)** (45 min)
3. Implémenter :
   - `src/components/GraphView.vue` : rendu SVG + interactions

### 🧪 QA / Test Automator

1. Lire : spécifications → section "Critères d'acceptation" (30 min)
2. Écrire tests : `tests/graph-layout.test.ts` + `tests/graph-render.test.ts`
3. Target : ≥80% couverture, tous 18 CAs passent

### 🔍 Code Reviewer / Architect

1. Lire : **[PHASE3-ORCHESTRATION.md](docs/specs/PHASE3-ORCHESTRATION.md)** section 5 (15 min)
2. À la revue : vérifier séparation core/UI, déterminisme, performance, tests
3. Valider : couverture ≥80%, tous CAs passent, no blockers

---

## 🎯 Critères d'acceptation (18 CAs)

### Modèle (4 CAs)

- **CA-model-01** : Snapshot expose `allCommits`
- **CA-model-02** : Backward compatibility (snapshot.commits inchangé)
- **CA-model-03** : Branches et tags corrects
- **CA-model-04** : Tri topologique correct (Y(parent) < Y(enfant))

### Layout (7 CAs)

- **CA-layout-01** : Tri topologique respecté
- **CA-layout-02** : Assignation de lanes déterministe
- **CA-layout-03** : Branches cohérentes (main = lane 0)
- **CA-layout-04** : Positions correctes (x, y formules)
- **CA-layout-05** : Arêtes routées (linéaires + courbes)
- **CA-layout-06** : Cas limites (vide, 1, linéaire, branches)
- **CA-layout-07** : Couleurs déterministes

### Rendering (9 CAs)

- **CA-graph-01** : SVG rendu basique
- **CA-graph-02** : Labels et badges affichés
- **CA-graph-03** : Hover → tooltip + highlight
- **CA-graph-04** : Pan et zoom fonctionnels
- **CA-graph-05** : Click → sélection
- **CA-graph-06** : Cas limites sans erreur
- **CA-graph-07** : Arêtes merge (courbes)
- **CA-graph-08** : Couleurs déterministes
- **CA-graph-09** : HEAD détaché marqué

---

## ⏱️ Timeline

```
Semaine 1  : Specs ✓ + Core                    (TypeScript Pro 3j)
Semaine 2  : Layout + UI + Tests               (6j + 2j + 3j parallèle)
Semaine 3  : Code review + Polish              (1j + 2j)
─────────────────────────────────────────────
Total      : ~2.5–3 semaines
```

**Parallélisation clé** : Après core finalisé, layout + UI + tests en parallèle.

---

## 🏗️ Architecture (3 couches)

```
┌────────────────────────────────────────────────────────┐
│ UI Layer (GraphView.vue)                               │
│  - SVG rendu (nœuds, arêtes, badges, labels)          │
│  - Interactions (pan, zoom, hover, click)              │
├────────────────────────────────────────────────────────┤
│ Layout Layer (src/graph/layout.ts)                     │
│  - Algorithme pur (6 étapes)                           │
│  - Input: commits, branches, head                      │
│  - Output: GraphLayout (nodes, edges, dimensions)      │
├────────────────────────────────────────────────────────┤
│ Core Layer (src/core/)                                 │
│  - getAllCommitsTopologicalOrder()                     │
│  - snapshot.allCommits (expose TOUS les commits)       │
└────────────────────────────────────────────────────────┘
```

---

## 🔑 5 Décisions structurantes

1. **Extension snapshot** : ajouter `allCommits` (optionnel, backward compat)
2. **Layout pur** : algorithme TypeScript pur, sans Vue/DOM
3. **SVG custom** : pas de lib gitgraph (contrôle total, reset/rebase safe)
4. **Déterminisme** : même input → même layout (tiebreakers explicites)
5. **Orientation** : Y = chronologie (récent d'abord), X = lanes parallèles

---

## 📊 État des spécifications

✅ **COMPLÈTES** et prêtes pour développement.

- 3 spécifications techniques détaillées (15–17)
- 8 guides auxiliaires (SUMMARY, INDEX, QUICK-START, etc.)
- 18 critères d'acceptation testables
- Timeline, équipe, risques, validation définis

**Status** : **✓ PHASE 3 ÉTAPE 1 COMPLETE** (2026-06-09)

---

## 📞 Contacts et help

| Besoin | Ressource |
|--------|-----------|
| **Vue d'ensemble** | [PHASE3-EXECUTIVE-SUMMARY.md](docs/specs/PHASE3-EXECUTIVE-SUMMARY.md) |
| **Questions specs** | Lire spec technique correspondante (15, 16, ou 17) |
| **Code squelette** | [PHASE3-QUICK-START.md](docs/specs/PHASE3-QUICK-START.md) |
| **Navigation** | [PHASE3-START-HERE.md](docs/specs/PHASE3-START-HERE.md) ou [PHASE3-INDEX.md](docs/specs/PHASE3-INDEX.md) |
| **Orchestration** | [PHASE3-ORCHESTRATION.md](docs/specs/PHASE3-ORCHESTRATION.md) |
| **Validation** | [PHASE3-VALIDATION-CHECKLIST.md](docs/specs/PHASE3-VALIDATION-CHECKLIST.md) |

---

## 🎓 Concepts clés

- **DAG** : Directed Acyclic Graph (arbre des commits sans cycles)
- **Topological sort** : ordonner commits tels que parents avant enfants
- **Lanes** : colonnes pour branches parallèles (évite croisements)
- **Determinism** : même input → même output (crucial pour tests, déterminisme)
- **Purity** : layout sans state, sans effet de bord (testable Vitest)

---

## ✨ Prochaines étapes

1. **Orchestrateur** → valider [PHASE3-VALIDATION-CHECKLIST.md](docs/specs/PHASE3-VALIDATION-CHECKLIST.md)
2. **Signer** "Étape 1 OK"
3. **Lancer** Étape 2 (Technical Writer) + Étape 3A (TypeScript Pro)
4. **Daily standups** pour tracking
5. **Jour 11** → sign-off Phase 3 COMPLETED

---

## 🚀 Bon développement !

Toutes les spécifications sont **complètes et prêtes**. Vous avez les outils, la timeline, et le plan.

**Bienvenue en Phase 3 !**

---

**Document créé** : 2026-06-09  
**Status** : ✅ PHASE 3 ÉTAPE 1 COMPLETE – PRÊT DÉVELOPPEMENT

Pour démarrer → lire **[PHASE3-EXECUTIVE-SUMMARY.md](docs/specs/PHASE3-EXECUTIVE-SUMMARY.md)** (5 min).
