# Phase 2 : Point de Départ pour le Développement

Ce document guide le développeur pour démarrer l'implémentation de Phase 2.

## 1. Lire en priorité (avant de coder)

**Ordre de lecture recommandé** :

1. `09-model-phase2.md` — Comprendre les changements au modèle (HEAD détaché, prevBranch, tags)
2. `PHASE2-SUMMARY.md` — Points critiques et décisions structurantes
3. `PHASE2-TECHNICAL.md` — Comment implémenter (helpers, snapshot, parsing)
4. Une des 5 specs de commande (10-14) — Lire celle-ci en détail avant d'implémenter

**Total** : ~2-3 heures de lecture active.

## 2. Vérifier l'état de Phase 1

```bash
cd /home/pierre/projects/git-visualizer/www

# Vérifier que Phase 1 compile et passe les tests
npm run build
npm test

# Exemple de sortie attendue :
# ✓ tests/engine.test.ts (195 tests)
# Build successful, no errors
```

Si Phase 1 ne compile pas, corriger d'abord.

## 3. Implémentation par étapes

### Étape 0 : Mettre à jour le modèle (1-2 jours)

**Fichier** : `src/core/model.ts`

- [ ] Ajouter `tags` à `refs`
- [ ] Ajouter `prevBranch` à `Repository`
- [ ] Vérifier que tous les types se compilent

**Fichier** : `src/core/repository.ts`

- [ ] Mettre à jour `createEmptyRepo()` pour initialiser `tags` et `prevBranch`
- [ ] Implémenter les 10+ helpers listés en PHASE2-TECHNICAL.md
- [ ] Tester chaque helper avec des tests unitaires simples

**Vérification** : `npm run build` réussit, `npm test` toujours vert

### Étape 1 : Adapter engine.snapshot() (0.5 jours)

**Fichier** : `src/core/engine.ts`

- [ ] Ajouter `tags: Record<string, string>` au `RepoSnapshot`
- [ ] Ajouter `tags: string[]` à `SnapshotCommit`
- [ ] Mettre à jour `snapshot()` pour construire les maps `hash → tags[]`
- [ ] Tests : vérifier que le snapshot reflète correctement les tags

**Vérification** : `npm run build` réussit

### Étape 2 : Implémenter `git branch` (2-3 jours)

**Fichier** : `src/core/commands/branch.ts`

- [ ] Lire entièrement `10-branch.md`
- [ ] Implémenter les 4 cas : lister, créer, -d, -D
- [ ] Implémenter tous les cas d'erreur avec messages exacts
- [ ] Code de sortie correct (0, 1, 128)

**Fichier** : `src/core/parser.ts`

- [ ] Ajouter le dispatcher pour `branch` dans `dispatch()`

**Tests** : `tests/commands/branch.test.ts`

- [ ] Écrire un test pour chaque CA (CA-branch-01 à 12)
- [ ] ~120 lignes de tests, ~12 cas

**Vérification** :
```bash
npm run build
npm test -- tests/commands/branch.test.ts
```

Tous les tests doivent passer, y compris les tests Phase 1.

### Étape 3 : Implémenter `git checkout` (4-5 jours)

**Fichier** : `src/core/commands/checkout.ts`

- [ ] Lire entièrement `11-checkout.md`
- [ ] Implémenter les 5 cas : basculer branche, créer+basculer, détacher, revenir, --detach
- [ ] **Sécurité** : implémenter `canCheckoutWithoutDataLoss()` et l'appeler
- [ ] Mettre à jour `prevBranch` lors d'un changement
- [ ] Restaurer index et working tree depuis l'arbre du nouveau commit
- [ ] Implémenter tous les cas d'erreur

**Fichier** : `src/core/parser.ts`

- [ ] Ajouter le dispatcher pour `checkout`

**Tests** : `tests/commands/checkout.test.ts`

- [ ] Tests CA-checkout-01 à 11 (~11 cas)
- [ ] Tests de sécurité : changements locaux écrasés
- [ ] Tests d'intégration : `checkout → checkout -`
- [ ] ~300 lignes de tests

**Vérification** : Tous les tests Phase 1 + 2 passent

### Étape 4 : Implémenter `git restore` (2-3 jours)

**Fichier** : `src/core/commands/restore.ts`

- [ ] Lire entièrement `13-restore.md`
- [ ] Implémenter les 3 cas : depuis index, --staged, --source
- [ ] Gérer le pathspec (y compris `.`)
- [ ] Tous les cas d'erreur

**Tests** : `tests/commands/restore.test.ts`

- [ ] Tests CA-restore-01 à 09 (~9 cas)
- [ ] ~250 lignes de tests

**Vérification** : Tous les tests passent

### Étape 5 : Implémenter `git tag` (2-3 jours)

**Fichier** : `src/core/commands/tag.ts`

- [ ] Lire entièrement `14-tag.md`
- [ ] Implémenter les 4 cas : lister, créer sur HEAD, créer sur commit, supprimer
- [ ] Tri alphabétique pour listage
- [ ] Tous les cas d'erreur

**Tests** : `tests/commands/tag.test.ts`

- [ ] Tests CA-tag-01 à 11 (~11 cas)
- [ ] ~200 lignes de tests

**Vérification** : Tous les tests passent

### Étape 6 : Implémenter `git switch` (1 jour)

**Fichier** : `src/core/commands/switch.ts`

- [ ] Lire entièrement `12-switch.md`
- [ ] Peut être un wrapper léger autour de `checkout` avec messages adaptés
- [ ] Ou implémentation indépendante partageant les helpers

**Tests** : `tests/commands/switch.test.ts`

- [ ] Tests CA-switch-01 à 08 (~8 cas)
- [ ] ~150 lignes de tests

**Vérification** : Tous les tests passent

### Étape 7 : Tests d'intégration et polishing (2 jours)

- [ ] Écrire des tests d'intégration (workflows multi-commandes)
- [ ] Vérifier les invariants (voir PHASE2-SUMMARY.md)
- [ ] Comparer les messages avec Git réel
- [ ] Optimiser les performances si nécessaire

**Vérification** :
```bash
npm run build
npm run lint
npm test
npm run format
```

Tout doit être vert et sans erreurs.

## 4. Points critiques à double-vérifier

### Avant de commencer une commande

1. **Lire la spec entièrement** : Tous les cas, erreurs, critères d'acceptation
2. **Comprendre les dépendances** : Quels helpers Phase 2 utilise la commande ?
3. **Lister les tests** : Combien de CA ? Quels sont les pièges ?

### Pendant l'implémentation

1. **Vérifier les messages d'erreur** : Comparer avec Git réel (ou la spec exactement)
2. **Tester avant de coder plus** : Écrire un test, voir qu'il échoue, puis coder
3. **Maintenir les invariants** : Après chaque opération, l'état du repo est-il cohérent ?
4. **Pas de logique dans le parser** : Garder le parsing simple, mettre la logique dans les commandes

### Après chaque commande

1. **Tous les tests Phase 1 passent** : `npm test` vert
2. **Tous les CA de la commande testés** : ~1 test par CA
3. **Cas limites couverts** : voir "Cas limites" dans chaque spec
4. **Pas de compilation errors** : `npm run build` réussit

## 5. Workflow de développement recommandé

```bash
# Phase 1 : Setup
npm run build && npm test  # vérifier que Phase 1 fonctionne

# Phase 2 : Itération par commande
# Pour git branch :
npm test -- tests/commands/branch.test.ts  # tests rouges
# ... implémenter branch.ts ...
npm run build && npm test -- tests/commands/branch.test.ts  # tests verts

# Pour git checkout :
npm test -- tests/commands/checkout.test.ts  # tests rouges
# ... implémenter checkout.ts ...
npm run build && npm test -- tests/commands/checkout.test.ts  # tests verts

# Etc. pour restore, tag, switch

# Validation finale
npm run build
npm run lint
npm test
npm run format
```

## 6. Ressources supplémentaires

- **PHASE2-SUMMARY.md** : Résumé exécutif, décisions critiques
- **PHASE2-TECHNICAL.md** : Code example, helpers, snapshot
- **PHASE2-GUIDE.md** : Workflows, pièges, interactions
- **10-branch.md**, **11-checkout.md**, **12-switch.md**, **13-restore.md**, **14-tag.md** : Specs détaillées
- **CLAUDE.md** : Architecture globale, conventions

## 7. Checklist avant de déclarer Phase 2 complète

- [ ] `npm run build` réussit (no errors)
- [ ] `npm test` 100% vert (Phase 1 + 2)
- [ ] `npm run lint` clean
- [ ] Tous les critères d'acceptation testés (51 CA = 51+ tests)
- [ ] Invariants du modèle vérifiés
- [ ] Messages d'erreur comparés avec Git réel
- [ ] Workflows d'intégration testés
- [ ] Docs utilisateur mises à jour (USAGE.md)
- [ ] Code review approuvée
- [ ] Pas de régressions Phase 1

## 8. Communication de progression

**Après Étape 0** : "Modèle et helpers prêts, snapshot adapté"

**Après Étape 2** : "`git branch` implémentée, 12 tests verts"

**Après Étape 3** : "`git checkout` implémentée, 11 tests verts + sécurité validée"

**Après Étape 4** : "`git restore` implémentée, 9 tests verts"

**Après Étape 5** : "`git tag` implémentée, 11 tests verts"

**Après Étape 6** : "`git switch` implémentée, 8 tests verts"

**Après Étape 7** : "Phase 2 complète, 51 CA testés, 0 régressions Phase 1, build ✓"

## 9. Temps estimé

| Étape | Durée | Cumul |
|-------|-------|-------|
| 0. Modèle | 1-2 jours | 1-2 jours |
| 1. Snapshot | 0.5 jour | 1.5-2.5 jours |
| 2. Branch | 2-3 jours | 3.5-5.5 jours |
| 3. Checkout | 4-5 jours | 7.5-10.5 jours |
| 4. Restore | 2-3 jours | 9.5-13.5 jours |
| 5. Tag | 2-3 jours | 11.5-16.5 jours |
| 6. Switch | 1 jour | 12.5-17.5 jours |
| 7. Intégration + polish | 2 jours | 14.5-19.5 jours |

**Total estimé** : 2-3 semaines (14-20 jours de travail pur).

Avec reviews et ajustements : **3-4 semaines**.

## 10. Prochaines étapes après Phase 2

Une fois Phase 2 complète :

- **Phase 3** : Graphe DAG avec branches, tags, HEAD détaché visualisés
- **Phase 4** : `git reset` et `git rebase` (réécrivain d'historique)
- **Phase 5** : `git merge` et résolution de conflits

Chacune construira sur Phase 2.

---

**Bon développement !** 🚀

