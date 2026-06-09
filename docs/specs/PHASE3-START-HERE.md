# Phase 3 – START HERE

Bienvenue sur la Phase 3 du Git Visualizer ! 🚀

Vous êtes ici parce que vous commencez à implémenter la **visualisation graphique du DAG Git** (l'arbre des commits avec branches colorées, arêtes, et interactions).

## ⚡ 60 secondes (pour pressés)

**Ce qu'on fait** : afficher l'arborescence Git (DAG) dans un graphe interactif SVG.

**3 parties** :
1. **Core** : exposer TOUS les commits du dépôt (pas seulement depuis HEAD) → champ `allCommits` du snapshot.
2. **Layout** : transformer commits en géométrie (x, y, lanes, couleurs) → fonction pure `calculateLayout()`.
3. **UI** : rendu SVG interactif (pan, zoom, hover, badges) → composant `GraphView.vue`.

**Fichiers clés à lire** :
- `15-graph-model.md` (types, contrats)
- `16-graph-layout.md` (algorithme)
- `17-graph-render.md` (SVG, interactions)

**Timeline** : 2–3 semaines (parallélisation : core → layout + UI en parallèle, puis tests).

**Tests** : 18 critères d'acceptation (CA-layout-NN, CA-graph-NN) → tous doivent passer.

---

## 🎯 Lisez d'abord selon votre rôle

### 👨‍💼 Product Manager / Orchestrateur

**Temps** : 15 minutes.

1. **[PHASE3-SUMMARY.md](PHASE3-SUMMARY.md)** (5 min) : vue exécutive, 5 décisions clés.
2. **[PHASE3-ORCHESTRATION.md](PHASE3-ORCHESTRATION.md)** (10 min) : workflow, timeline, porte de validation.

**Puis** : lancer les agents (TW, TS Pro, Vue Expert, QA, Architect).

---

### 👨‍💻 Développeur TypeScript (Core + Layout)

**Temps** : 1–2 heures.

1. **[PHASE3-SUMMARY.md](PHASE3-SUMMARY.md)** (5 min) : contexte.
2. **[15-graph-model.md](15-graph-model.md), sections 1–2** (10 min) : modèle et types.
3. **[16-graph-layout.md](16-graph-layout.md)** (40 min) : algorithme complet (lire, pas coder encore).
4. **[PHASE3-QUICK-START.md](PHASE3-QUICK-START.md), sections 1–2** (15 min) : squelette code.
5. **Commencer le dev** :
   - Jour 1 : `getAllCommitsTopologicalOrder()` + `engine.ts` update.
   - Jour 2–3 : `calculateLayout()` (6 étapes, test chaque étape).
   - Jour 4 : Review et déterminisme check.

**Specs à consulter pendant dev** :
- 15-graph-model.md (types)
- 16-graph-layout.md (algorithme détaillé)

---

### 👨‍💻 Développeur Vue/Frontend (UI)

**Temps** : 1–2 heures.

1. **[PHASE3-SUMMARY.md](PHASE3-SUMMARY.md)** (5 min) : contexte.
2. **[15-graph-model.md](15-graph-model.md), section 2** (5 min) : types GraphLayout.
3. **[17-graph-render.md](17-graph-render.md)** (40 min) : rendu SVG complet.
4. **[PHASE3-QUICK-START.md](PHASE3-QUICK-START.md), section 3** (15 min) : squelette Vue.
5. **Commencer le dev** :
   - Jour 1–2 : SVG structure (edges, nodes, badges, labels).
   - Jour 3 : Interactions (pan, zoom, hover, click).
   - Jour 4 : Styles CSS + itération UX.

**Dépend de** : layout pur finalisé (attend jour 3 du TS Pro).

**Specs à consulter pendant dev** :
- 17-graph-render.md (rendu complet)

---

### 🧪 QA / Test Automator

**Temps** : 1–2 heures.

1. **[PHASE3-SUMMARY.md](PHASE3-SUMMARY.md)** (5 min) : contexte.
2. **[16-graph-layout.md](16-graph-layout.md), section 9** (10 min) : CA-layout-NN (7 CAs).
3. **[17-graph-render.md](17-graph-render.md), section 8** (10 min) : CA-graph-NN (9 CAs).
4. **[PHASE3-QUICK-START.md](PHASE3-QUICK-START.md), section 4** (15 min) : exemple tests.
5. **Commencer le dev test** :
   - Jour 2 : tests layout (tant que impl commence).
   - Jour 4 : tests SVG/interactions.
   - Jour 5 : couverture finale ≥ 80%.

**Cas à tester** :
- Tri topologique (linéaire, branches, merges).
- Assignation lanes (primaire, orphelins).
- Positions (x, y formules).
- Couleurs (déterminisme).
- Arêtes (linéaires + courbes).
- SVG rendering (nœuds, badges, labels).
- Interactions (pan, zoom, hover, click).
- Cas limites (vide, 1, linéaire, branches divergentes, HEAD détaché, nombreux).

---

### 🔍 Code Reviewer / Architect

**Temps** : 30 min (avant dev) + 2h (review complète).

1. **[PHASE3-SUMMARY.md](PHASE3-SUMMARY.md)** (5 min) : décisions.
2. **[PHASE3-ORCHESTRATION.md](PHASE3-ORCHESTRATION.md), "Étape 5"** (10 min) : critères review.
3. **[16-graph-layout.md](16-graph-layout.md), sections 1–2** (15 min) : comprendre algorithme.
4. **À la revue** (2h) :
   - Vérifier séparation core/UI.
   - Vérifier déterminisme (appeler layout 10x, output identique).
   - Vérifier performance (< 50ms pour 500 commits).
   - Vérifier couverture tests ≥ 80%.
   - Vérifier CA passent.

---

## 📚 Navigation complète

### Spécifications techniques

| Fichier | Pour qui | Durée | Résumé |
|---------|----------|-------|--------|
| 15-graph-model.md | Dev core/layout | 30 min | Types, contrats, snapshot extension |
| 16-graph-layout.md | Dev layout/QA | 45 min | Algorithme 6 étapes, CA-layout-NN |
| 17-graph-render.md | Dev UI/QA | 45 min | SVG, interactions, CA-graph-NN |

### Guides auxiliaires

| Fichier | Pour qui | Durée | Résumé |
|---------|----------|-------|--------|
| PHASE3-SUMMARY.md | Tous | 10 min | 5 décisions clés, critères succès |
| PHASE3-INDEX.md | Navigation | 20 min | Guide lecture par rôle, dépendances |
| PHASE3-QUICK-START.md | Dev | 30 min | TL;DR + code squelette |
| PHASE3-ORCHESTRATION.md | PM/Orchestrateur | 45 min | 5 étapes, timeline, porte validation |
| PHASE3-START-HERE.md | Vous êtes ici ! | 15 min | Orientation selon rôle |

---

## 🚦 Démarrage rapide (pour coder tout de suite)

### Setup

```bash
cd /home/pierre/projects/git-visualizer/www
npm install
npm run dev           # Vérifier que ça compile
npm test              # Vérifier que tests passent
```

### Dev Core (Jour 1–2)

1. Lire [16-graph-layout.md, sections 2–3](16-graph-layout.md#2-étape-1--tri-topologique).
2. Implémenter `getAllCommitsTopologicalOrder()` dans `src/core/repository.ts`.
3. Tester avec `npx vitest run tests/graph-layout.test.ts`.
4. Appeler dans `src/core/engine.ts:snapshot()`, exposer `allCommits`.

**Commandes utiles** :

```bash
npx vitest run tests/graph-layout.test.ts      # Tester layout seul
npm run build                                  # Typecheck strict
npm run format                                 # Format code
```

### Dev Layout (Jour 2–3)

1. Lire [16-graph-layout.md complet](16-graph-layout.md).
2. Créer `src/graph/layout.ts`.
3. Implémenter 6 étapes (une par jour si possible).
4. Tester chaque étape.

**Checklist** :

- [ ] Étape 1 : Tri topologique (Y(parent) < Y(enfant)).
- [ ] Étape 2 : Profondeur (DP).
- [ ] Étape 3 : Lanes (primaire, backtrack, orphelins).
- [ ] Étape 4 : Positions (x, y formules).
- [ ] Étape 5 : Arêtes (linéaires + courbes).
- [ ] Étape 6 : Couleurs (déterministes).
- [ ] Orchestration : `calculateLayout()` combine tout.
- [ ] Tests : tous CA-layout passent.

### Dev UI (Jour 3–4)

1. Lire [17-graph-render.md](17-graph-render.md).
2. Remplacer `src/components/GraphView.vue` (copier squelette de [PHASE3-QUICK-START.md](PHASE3-QUICK-START.md#3-ui--composant-vue)).
3. SVG : edges, nodes, badges, labels.
4. Interactions : pan, zoom, hover, click.
5. Styles CSS.

**Checklist** :

- [ ] SVG rendu sans erreur (`npm run dev`, vérifier dans navigateur).
- [ ] Nœuds visibles (couleur de lane).
- [ ] Arêtes connectent nœuds.
- [ ] Badges affichent branches/tags/HEAD.
- [ ] Labels (hash + message).
- [ ] Pan (clic droit + drag).
- [ ] Zoom (scroll souris).
- [ ] Hover (tooltip, highlight).
- [ ] Click (sélection).
- [ ] Cas limites (vide, 1, nombreux).

---

## ✅ Checklist de développement

### Avant de commencer

- [ ] Lire les specs (PHASE3-SUMMARY + votre rôle).
- [ ] Comprendre les 5 décisions structurantes.
- [ ] Vérifier que `npm run build` vert (baseline).

### Pendant le dev

- [ ] Tester souvent (`npm test`).
- [ ] Commit régulièrement (petit commits).
- [ ] Demander clarification si spec ambiguë.

### À la fin

- [ ] `npm run build` vert (typecheck strict, no errors).
- [ ] `npm test` vert (tous tests passent).
- [ ] Couverture ≥ 80%.
- [ ] Code review par architect.
- [ ] DAG visualisé correctement (démo manuelle : créer branches, voir graphe).

---

## 🆘 Besoin d'aide ?

### Questions sur les specs

→ Lire le spec relevant complet (pas juste la section).
→ Si toujours flou, ouvrir une issue ou demander à PM.

### Questions sur l'architecture

→ Relire [PHASE3-SUMMARY.md](PHASE3-SUMMARY.md) sections 1–6.
→ Consulter `CLAUDE.md` (architecture project).

### Questions sur le code existant

→ Lire `src/core/engine.ts` (snapshot, types).
→ Lire `src/stores/repo.ts` (comment snapshot réactif).
→ Lire `src/components/GraphView.vue` (placeholder à remplacer).

### Questions sur les tests

→ Regarder `tests/engine.test.ts` (exemple Vitest).
→ Traduire CA en test (Given/When/Then).

### Blocant technique

→ Slack/escalade architect-reviewer.

---

## 📅 Timeline suggérée

```
Jour 1 : Core (getAllCommits)                  [TS Pro]
Jour 2 : Core tests + Layout étapes 1–3       [TS Pro + QA setup]
Jour 3 : Layout étapes 4–6 + UI setup         [TS Pro + Vue Expert]
Jour 4 : UI (SVG + interactions) + Layout tests [Vue Expert + QA]
Jour 5 : UI styles + tests finaux + QA        [Vue Expert + QA]
Jour 6 : Code review + fixes                  [Architect + TS Pro/Vue]
Jour 7 : Démo + sign-off                      [All + PM]
```

---

## 🎓 Concepts clés à retenir

1. **DAG topologique** : parents avant enfants (pas de cycles).
2. **Lanes** : colonnes pour branches parallèles.
3. **Déterminisme** : même input = même output (tiebreakers !).
4. **Pureté du layout** : pas d'état, pas d'effet de bord.
5. **SVG custom** : pas de lib, rendu full control.

---

## 🔗 Liens rapides

- **[PHASE3-INDEX.md](PHASE3-INDEX.md)** : tous les fichiers avec descriptions.
- **[PHASE3-QUICK-START.md](PHASE3-QUICK-START.md)** : TL;DR code.
- **[PHASE3-ORCHESTRATION.md](PHASE3-ORCHESTRATION.md)** : workflow complet.
- **[CLAUDE.md](../../CLAUDE.md)** : architecture global du project.

---

## ✨ Bon développement !

Vous avez les specs, le guide, le timeline. Les spécifications de Phase 3 sont **complètes et détaillées**.

**Prochaine étape** : lancer les agents (tech writer, dev, QA) selon le rôle, et itérer rapidement.

N'hésitez pas à relire les specs si besoin — elles sont construites pour être compréhensibles et complètes.

🚀 **C'est parti !**

---

**Questions ?** Lire [PHASE3-INDEX.md#guide-de-lecture-par-rôle](PHASE3-INDEX.md#guide-de-lecture-par-rôle) pour votre rôle spécifique.
