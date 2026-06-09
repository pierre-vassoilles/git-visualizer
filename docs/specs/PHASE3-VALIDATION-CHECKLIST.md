# Phase 3 – Validation Checklist (pour orchestrateur)

## ✅ Avant de signer "Étape 1 DONE"

Orchestrateur : vérifier chaque item ci-dessous. Marquer ✓ = oui, ✗ = non.

---

### 🎯 Spécifications (3 fichiers)

- [ ] **15-graph-model.md** existe et est complet
  - [ ] Section 1 : problème (snapshot limité)
  - [ ] Section 1 : solution (allCommits optionnel)
  - [ ] Section 2 : types GraphNode, GraphEdge, GraphLayout
  - [ ] Section 3 : décisions structurantes
  - [ ] Section 5 : CA-model-01 à -04 (4 CAs)
  - [ ] Aucune contradiction interne

- [ ] **16-graph-layout.md** existe et est complet
  - [ ] 6 étapes décrites (tri topo, profondeur, lanes, positions, arêtes, couleurs)
  - [ ] Pseudo-code pour chaque étape
  - [ ] Orchestration : fonction `calculateLayout()`
  - [ ] Complexité : O(C+E) indiquée
  - [ ] CA-layout-01 à -07 (7 CAs)
  - [ ] Aucune contradiction interne

- [ ] **17-graph-render.md** existe et est complet
  - [ ] Structure SVG (edges, nodes, badges, labels)
  - [ ] Vue script (computed, méthodes, state)
  - [ ] Styles CSS (nœuds, arêtes, badges, hover, select)
  - [ ] Interactions (pan, zoom, hover, click)
  - [ ] Cas limites (vide, sans commit, nombreux)
  - [ ] CA-graph-01 à -09 (9 CAs)
  - [ ] Aucune contradiction interne

---

### 📚 Guides auxiliaires (4 fichiers)

- [ ] **PHASE3-SUMMARY.md** existe et contient
  - [ ] 5 décisions structurantes (avec justification)
  - [ ] Workflow 5 étapes (Specs → Doc → Dev → Tests → QA)
  - [ ] Critères "Phase 3 COMPLETED"
  - [ ] Questions ouvertes (Phase 4+)

- [ ] **PHASE3-INDEX.md** existe et contient
  - [ ] Dépendances entre specs (15 → 16 → 17)
  - [ ] Workflow d'implémentation (séquencé)
  - [ ] Tableau CA consolidé (18 CAs)
  - [ ] Guide lecture par rôle (PM, dev, QA, architect)

- [ ] **PHASE3-QUICK-START.md** existe et contient
  - [ ] TL;DR 60 secondes
  - [ ] 3 étapes (core, layout, UI) avec code squelette
  - [ ] Tests Vitest essentiels
  - [ ] Checklist dev 3 phases
  - [ ] Débogage rapide

- [ ] **PHASE3-ORCHESTRATION.md** existe et contient
  - [ ] 5 étapes cycle agentique
  - [ ] Livrables + critères validation chaque étape
  - [ ] Timeline 2.5–3 semaines
  - [ ] Allocation rôles (TW, TS Pro, Vue Expert, QA, Architect)
  - [ ] Risk management (5 risques)
  - [ ] Porte validation "Phase 3 COMPLETED"

---

### 🧭 Navigation (2 fichiers)

- [ ] **PHASE3-START-HERE.md** existe et contient
  - [ ] "60 secondes" pour pressés
  - [ ] Lecture par rôle (PM, dev backend, dev frontend, QA, architect)
  - [ ] Liens vers fichiers spécifiques

- [ ] **README.md** (docs/specs/) mis à jour
  - [ ] Section "Phase 3" ajoutée
  - [ ] Index specs 15, 16, 17
  - [ ] Index guides (SUMMARY, INDEX, QUICK-START, ORCHESTRATION)
  - [ ] Links cliquables vers fichiers

---

### 🏗️ Cohérence inter-specs

- [ ] **Types identiques** dans 15, 16, 17
  - [ ] `LayoutInput` défini dans 15, utilisé en 16, 17
  - [ ] `GraphLayout`, `GraphNode`, `GraphEdge` cohérents

- [ ] **Algorithme cohérent** (16 vs 15)
  - [ ] Entrée (commits, branches, head) = LayoutInput de 15
  - [ ] Sortie = GraphLayout de 15

- [ ] **Rendu cohérent** (17 vs 16)
  - [ ] SVG utilise nodes/edges/colors de 16

- [ ] **Backward compatibility** (15 vs moteur existant)
  - [ ] snapshot.commits inchangé (depuis HEAD)
  - [ ] allCommits optionnel (?? : SnapshotCommit[])
  - [ ] Ancien code fonctionne sans allCommits

---

### 📋 Critères d'acceptation (18 CAs)

- [ ] **CA-model-01 à -04** (4 CAs) testables
  - [ ] Snapshot expose allCommits
  - [ ] Backward compat
  - [ ] Branches/tags corrects
  - [ ] Tri topologique correct

- [ ] **CA-layout-01 à -07** (7 CAs) testables
  - [ ] Tri topologique (Y(parent) < Y(enfant))
  - [ ] Lanes déterministes
  - [ ] Branches cohérentes (main = lane 0)
  - [ ] Positions correctes (formules x, y)
  - [ ] Arêtes routées (linéaires + courbes)
  - [ ] Cas limites (vide, 1, linéaire, branches)
  - [ ] Couleurs déterministes

- [ ] **CA-graph-01 à -09** (9 CAs) testables
  - [ ] SVG rendu basique
  - [ ] Labels + badges
  - [ ] Hover + tooltip
  - [ ] Pan + zoom
  - [ ] Click + sélection
  - [ ] Cas limites
  - [ ] Arêtes merge
  - [ ] Couleurs deterministes
  - [ ] HEAD détaché

---

### 🎭 Faisabilité par équipe

- [ ] **Technical Writer** peut utiliser 15–17 → rédiger doc utilisateur (USAGE.md)
- [ ] **TypeScript Pro** peut utiliser 15–16 + QUICK-START → implémenter core + layout (3–4j)
- [ ] **Vue Expert** peut utiliser 17 + QUICK-START → implémenter UI (4–5j)
- [ ] **QA** peut utiliser CAs → écrire tests Vitest (5j)
- [ ] **Architect** peut utiliser ORCHESTRATION → revue code (phase finale)

---

### 📊 Qualité de documentation

- [ ] Spécifications écrites en **Markdown lisible** (pas de jargon)
- [ ] **Code blocks formatés** (TypeScript, pseudo-code)
- [ ] **Diagrammes/tableaux** pour clarté (dépendances, CA, timeline)
- [ ] **Références croisées** claires (15 → 16 → 17)
- [ ] **Aucun TODO ou "à déterminer"** (tout spécifié)
- [ ] **Aucune contradiction interne** (types, algo, rendu cohérents)

---

### 🚦 Prêt pour développement

- [ ] PM peut lancer Étape 2 (Technical Writer)
- [ ] PM peut lancer Étape 3A (TypeScript Pro : core)
- [ ] PM peut lancer Étape 3B (après 3A : layout)
- [ ] PM peut lancer Étape 3C (après 3B : UI)
- [ ] PM peut lancer Étape 4 (QA : tests, parallèle à 3C)
- [ ] PM peut lancer Étape 5 (Architect : revue, après dev)

---

## 🎯 Validation finale (orchestrateur)

### Questions clés

**Q1 : Specs écrites et cohérentes ?**
→ Si tous items ci-dessus ✓, oui.

**Q2 : Types TypeScript explicites et utilisables ?**
→ Si 15 sections 2–3 ✓, oui.

**Q3 : Algorithme décrit assez pour être implémenté en TypeScript pur ?**
→ Si 16 sections 2–8 + pseudo-code ✓, oui.

**Q4 : Rendu SVG faisable en Vue 3 ?**
→ Si 17 sections 1–4 + squelette code ✓, oui.

**Q5 : Équipe peut coder d'après ces specs sans questions ?**
→ Si QUICK-START + INDEX ✓, oui.

**Q6 : QA peut écrire tests d'après ces specs ?**
→ Si 18 CAs testables ✓, oui.

---

## ✍️ Signature orchestrateur

```
Specs Phase 3 – Étape 1 VALIDATION
────────────────────────────────────

Date :                 _______________
Orchestrateur :        _______________

□ Spécifications valides
□ Guides cohérents
□ Faisabilité confirmée
□ Équipe prête

Status : [ ] EN COURS    [✓] APPROUVÉ    [ ] REFUSÉ

Notes :  _________________________________________
         _________________________________________
```

---

## 📞 Si refusé ou demande révision

**Indiquer** :

1. Quelle spec ? (15, 16, 17)
2. Quelle section ?
3. Problème ? (ambiguïté, contradiction, manque détail)
4. Suggestion de fix ?

**Puis** : Product Manager refait section, re-valide.

---

## 🚀 Si approuvé : PHASE 3 ÉTAPE 1 DONE ✓

→ **Lancer Étape 2** (Technical Writer).
→ **Lancer Étape 3A** (TypeScript Pro : core) après 1j.
→ **Daily standups** : checkin dev, blocants, progression.

---

**Total checklist items** : ~45 items.

✓ **Tous checkés** → **Étape 1 OK, prêt développement.**

✗ **Quelques manquants** → **Demander révisions, puis re-check.**

Good luck ! 🎯
