# Phase 2 : Index Complet et Synthèse

## Fichiers générés pour Phase 2

La Phase 2 complète des spécifications fonctionnelles pour Git Visualizer est constituée de **10 fichiers de spécifications** et **1 fichier de synthèse**. Tous les fichiers sont situés dans `/home/pierre/projects/git-visualizer/www/docs/specs/`.

### Fichiers de spécifications créés

| # | Fichier | Type | Audience | Pages | Contenu clé |
|----|---------|------|----------|-------|------------|
| 1 | `README-PHASE2.md` | Vue d'ensemble | Tous | 2 | Point d'entrée, structure générale, vue d'ensemble |
| 2 | `09-model-phase2.md` | Architecture | Dev, PM | 5 | Évolutions modèle : HEAD détaché, branches vides, tags, prevBranch |
| 3 | `10-branch.md` | Commande | Dev, QA | 6 | `git branch` : lister, créer, -d, -D ; 12 CA |
| 4 | `11-checkout.md` | Commande | Dev, QA | 8 | `git checkout` : branche, détacher, -b, -, --detach ; 11 CA |
| 5 | `12-switch.md` | Commande | Dev, QA | 5 | `git switch` : variante moderne ; 8 CA |
| 6 | `13-restore.md` | Commande | Dev, QA | 6 | `git restore` : restaurer fichiers, --staged, --source ; 9 CA |
| 7 | `14-tag.md` | Commande | Dev, QA | 6 | `git tag` : lister, créer, -d ; 11 CA |
| 8 | `PHASE2-SUMMARY.md` | Architecture | Orchestrateur | 4 | Décisions structurantes, changements fichiers, ordre de dev |
| 9 | `PHASE2-TECHNICAL.md` | Implémentation | Dev (TypeScript) | 6 | Code patterns, helpers, snapshot, examples |
| 10 | `PHASE2-GUIDE.md` | Intégration | Dev, QA | 6 | Workflows complets, interactions, pièges, matrices |
| 11 | `PHASE2-START.md` | Onboarding | Dev débutant | 4 | Guide pas-à-pas, checklist, timeline estimée |
| 12 | `PHASE2-FILES.md` | Récapitulatif | Tous | 4 | Index fichiers, couverture CA, dépendances |

**Total : 12 fichiers de specs, ~60 pages, 51 critères d'acceptation (CA)**

## Composition par audience

### Product Manager / Orchestrateur

Lire en priorité :
1. `README-PHASE2.md` (vue d'ensemble)
2. `PHASE2-SUMMARY.md` (décisions critiques)
3. `09-model-phase2.md` (modèle)

**Temps estimé** : 1.5-2 heures

### Développeur (TypeScript)

Chemin complet :
1. `README-PHASE2.md` (vue d'ensemble)
2. `PHASE2-START.md` (guide pas-à-pas)
3. `09-model-phase2.md` (modèle à comprendre)
4. `PHASE2-TECHNICAL.md` (implémentation détaillée)
5. Chaque spec de commande (10-14) avant d'implémenter
6. `PHASE2-GUIDE.md` (workflows et pièges)

**Temps estimé** : 5-7 heures de lecture + 14-20 jours d'implémentation

### QA / Testeur

Lire :
1. `README-PHASE2.md` (vue d'ensemble)
2. Chaque spec de commande (10-14) pour les CA
3. `PHASE2-GUIDE.md` (workflows d'intégration, pièges)
4. `PHASE2-TECHNICAL.md` (invariants)

**Temps estimé** : 4-5 heures + test des 51 CA

## Ordre de lecture recommandé (pas à pas)

### Pour comprendre rapidement (30 min)

1. `README-PHASE2.md` (5 min) — Vue d'ensemble
2. `PHASE2-SUMMARY.md` — Points clés (10 min)
3. `PHASE2-GUIDE.md` — Un workflow exemple (15 min)

### Pour comprendre complètement (3-4 heures)

1. `README-PHASE2.md` (15 min)
2. `09-model-phase2.md` (45 min) — Modèle de données
3. `PHASE2-SUMMARY.md` (30 min) — Décisions
4. `PHASE2-TECHNICAL.md` (45 min) — Implémentation
5. `PHASE2-GUIDE.md` (45 min) — Workflows
6. Une spec de commande (30 min) — Détails

### Pour développer (14-20 jours)

1. `PHASE2-START.md` (point d'entrée)
2. Suivi de l'ordre dans PHASE2-START.md
3. Consultation ponctuelle de PHASE2-TECHNICAL.md et des specs

## Périmètre couvert

### Commandes implémentées (5)

1. **`git branch`**
   - Lister branches (marquer la courante avec `*`)
   - Créer une branche (`git branch <name>`)
   - Supprimer une branche (`git branch -d <name>` et `-D <name>`)
   - Erreurs : existe déjà, suppression courante, non mergée
   - **12 critères d'acceptation**

2. **`git checkout`**
   - Basculer vers une branche (`git checkout <branch>`)
   - Créer et basculer (`git checkout -b <branch>`)
   - Détacher HEAD sur un commit (`git checkout <commit>`)
   - Revenir à la branche d'avant (`git checkout -`)
   - Détacher explicitement (`git checkout --detach <commit>`)
   - Sécurité : refuser si changements locaux seraient écrasés
   - **11 critères d'acceptation**

3. **`git switch`**
   - Basculer vers une branche (`git switch <branch>`)
   - Créer et basculer (`git switch -c <branch>`)
   - Détacher HEAD (`git switch --detach <commit>`)
   - Revenir à la branche d'avant (`git switch -`)
   - Messages légèrement différents de checkout
   - **8 critères d'acceptation**

4. **`git restore`**
   - Restaurer fichiers depuis l'index (`git restore <pathspec>`)
   - Retirer du staging (`git restore --staged <pathspec>`)
   - Restaurer depuis un commit (`git restore --source=<commit> <pathspec>`)
   - Supporter le pathspec `.` pour tous les fichiers
   - **9 critères d'acceptation**

5. **`git tag`**
   - Lister les tags (`git tag`)
   - Créer un tag sur HEAD (`git tag <name>`)
   - Créer un tag sur un commit (`git tag <name> <commit>`)
   - Supprimer un tag (`git tag -d <name>`)
   - Tags légers uniquement (Phase 2)
   - **11 critères d'acceptation**

### Concept clés introduits

- **HEAD détaché** : `HEAD.symbolic = false` pointant sur un commit
- **Branches vides** : `refs.heads[name] = ""` (sans commits)
- **Historique de branche** : `prevBranch` pour `checkout -`
- **Tags légers** : `refs.tags[name]` = hash commit
- **Sécurité** : Refus de changement si données perdues

### Cas d'erreur couverts

- Branche/tag déjà existant
- Branche/tag inexistant
- Suppression de la branche courante
- Changements locaux écrasés par un checkout
- Commit inexistant
- HEAD vierge (pas de commits)
- Dépôt non initialisé
- Pathspec invalide
- Noms invalides

## Architecture

### Changements au modèle

**Fichier** : `src/core/model.ts`
- Ajouter `refs.tags: { [tagName: string]: string }`
- Ajouter `prevBranch: string | null`

**Fichier** : `src/core/repository.ts`
- Ajouter 10+ helpers (accesseurs, validation, sécurité)
- Mettre à jour `createEmptyRepo()`

**Fichier** : `src/core/engine.ts`
- Adapter `snapshot()` pour inclure tags
- Ajouter `SnapshotCommit.tags`

**Fichier** : `src/core/parser.ts`
- Ajouter dispatchers pour 5 commandes

### Nouveaux fichiers de commandes

```
src/core/commands/
├── branch.ts   (~280 lignes)
├── checkout.ts (~450 lignes)
├── switch.ts   (~150 lignes)
├── restore.ts  (~350 lignes)
└── tag.ts      (~280 lignes)
```

### Fichiers de test

```
tests/commands/
├── branch.test.ts   (~200 lignes, 12 tests)
├── checkout.test.ts (~300 lignes, 11 tests)
├── switch.test.ts   (~150 lignes, 8 tests)
├── restore.test.ts  (~250 lignes, 9 tests)
└── tag.test.ts      (~200 lignes, 11 tests)
```

**Total estimé** : ~1500 lignes de code + ~1100 lignes de tests

## Critères de succès Phase 2

- [ ] Tous les 51 critères d'acceptation testés (tests Vitest)
- [ ] `npm run build` réussit (no errors, strict typecheck)
- [ ] `npm test` 100% vert (Phase 1 régression + Phase 2 = 245+ tests)
- [ ] `npm run lint` clean (no warnings)
- [ ] Messages d'erreur conformes Git
- [ ] Invariants du modèle maintenus
- [ ] Workflows d'intégration testés (multi-commandes)
- [ ] Code review approuvée
- [ ] Docs utilisateur mises à jour

## Timeline estimée

| Phase | Durée | Cumul |
|-------|-------|-------|
| Lecture/compréhension | 2-3 heures | 2-3 heures |
| Modèle + helpers | 1-2 jours | 1-2 jours |
| Snapshot | 0.5 jour | 1.5-2.5 jours |
| Branch | 2-3 jours | 3.5-5.5 jours |
| Checkout | 4-5 jours | 7.5-10.5 jours |
| Restore | 2-3 jours | 9.5-13.5 jours |
| Tag | 2-3 jours | 11.5-16.5 jours |
| Switch | 1 jour | 12.5-17.5 jours |
| Tests intégration + polish | 2 jours | 14.5-19.5 jours |

**Total** : 2-3 semaines de développement pur (14-20 jours) + 3-4 semaines avec reviews

## Dépendances et prochaines phases

### Dépend de Phase 1

- Modèle fondamental (blob, tree, commit)
- Commandes : init, add, status, commit, log
- Infrastructure : parser, engine, repository

### Phase 3 dépend de Phase 2

- Visualisation graphique du DAG avec branches et tags
- Affichage de HEAD (normal ou détaché)

### Phase 4 dépend de Phase 2

- `git reset` — utilise branches et HEAD
- `git rebase` — utilise checkout pour naviguer

### Phase 5 dépend de Phase 2+3+4

- `git merge` — utilise branches multiples
- Résolution de conflits

## Points d'attention critiques

1. **HEAD détaché** : Structure bien définie, messages Git exacts
2. **Sécurité** : Refus de changement destructif avec détection correcte
3. **prevBranch** : Sauvegardé même en mode détaché (Option A)
4. **Index** : Remplacé intégralement lors d'un checkout (snapshot complet)
5. **Branches vides** : Autorisées, ne causent pas d'erreur
6. **Tags légers** : Phase 2 uniquement (tags annotés plus tard)
7. **Invariants** : HEAD cohérent, refs valides, DAG sans cycles

## Comment contribuer

### Pour écrire du code

1. Lire `PHASE2-START.md` (guide pas-à-pas)
2. Lire `PHASE2-TECHNICAL.md` (patterns d'implémentation)
3. Lire la spec détaillée de la commande en cours (10-14)
4. Implémenter en suivant l'ordre recommandé
5. Tester : `npm test -- tests/commands/<command>.test.ts`
6. Valider finale : `npm run build && npm test`

### Pour écrire des tests

1. Lire la spec de la commande (10-14)
2. Créer un test par critère d'acceptation (CA)
3. Format : `test("CA-xxx-NN: description", () => { ... })`
4. Vérifier que chaque CA est testé

### Pour reviewer

1. Vérifier que le code respecte les specs
2. Vérifier que tous les CA sont couverts par les tests
3. Vérifier que les invariants du modèle sont maintenus
4. Comparer les messages d'erreur avec Git réel
5. Tester les workflows d'intégration

## Ressources supplémentaires

### Documentation Phase 1

- `docs/specs/00-model.md` — Modèle de base
- `docs/specs/01-init.md` à `05-log.md` — Commandes Phase 1
- `src/core/` — Code Phase 1 de référence

### Références externes

- Git documentation officielle : https://git-scm.com/docs
- Git internals : https://git-scm.com/book/en/v2/Git-Internals

## Questions fréquentes

**Q: Par où commencer ?**
A: Lire `PHASE2-START.md`, puis suivre l'ordre : modèle → helpers → branch → checkout → restore → tag → switch.

**Q: Quelle est la différence checkout vs switch ?**
A: `switch` est une variante moderne plus simple (branche/détacher seulement). `checkout` est plus polyvalent. Phase 2 implémente les deux.

**Q: Pourquoi HEAD détaché est-il important ?**
A: C'est l'état transitionnel clé permettant de naviguer n'importe quel commit et de créer des branches experimental. Nécessaire pour Phase 3+ (graphe interactif).

**Q: Combien de tests faut-il écrire ?**
A: Au minimum 51 (un par CA), mais 150+ est plus robuste (tests des cas limites en plus).

**Q: Phase 2 est-elle suffisante pour une app fonctionnelle ?**
A: Oui pour la navigation de base. Phase 3 ajoute la visualisation graphique, essentiels pour l'expérience.

---

## Résumé exécutif

**Phase 2 est une spécification complète et prête pour développement** couvrant :
- 5 commandes Git (branch, checkout, switch, restore, tag)
- 51 critères d'acceptation testables
- Architecture clairement définie
- Guides d'implémentation et de test
- Workflows d'intégration documentés

**Temps estimé pour implémentation** : 2-3 semaines de développement pur

**Point d'entrée** : `README-PHASE2.md` ou `PHASE2-START.md`

