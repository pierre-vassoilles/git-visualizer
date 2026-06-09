# Phase 2 : Récapitulatif des Fichiers de Specs

## Fichiers créés pour Phase 2

Tous les fichiers sont situés dans `/home/pierre/projects/git-visualizer/www/docs/specs/`.

### Modèle et architecture

| Fichier | Description | Audience |
|---------|------------|----------|
| `09-model-phase2.md` | Évolutions du modèle de données : HEAD détaché, branches vides, tags, prevBranch | Product manager, Dev |
| `PHASE2-SUMMARY.md` | Résumé exécutif pour l'orchestrateur : décisions critiques, changements fichiers, ordre de dev | Orchestrateur, Lead dev |
| `PHASE2-GUIDE.md` | Guide complet des interactions entre commandes, workflows type, pièges | Dev, QA, Documentaliste |

### Commandes (5 fichiers)

| Fichier | Commande | Syntaxe | Critères d'acceptation |
|---------|----------|---------|------------------------|
| `10-branch.md` | `git branch` | Lister, créer, supprimer (flags -d, -D) | CA-branch-01 à 12 |
| `11-checkout.md` | `git checkout` | Basculer branche, détacher, créer+basculer (-b), revenir (-), --detach | CA-checkout-01 à 11 |
| `12-switch.md` | `git switch` | Variante moderne : basculer branche, créer+basculer (-c), détacher, revenir (-) | CA-switch-01 à 08 |
| `13-restore.md` | `git restore` | Restaurer WT depuis index, retirer du staging (--staged), depuis commit (--source) | CA-restore-01 à 09 |
| `14-tag.md` | `git tag` | Lister, créer (sur HEAD ou commit), supprimer (-d) | CA-tag-01 à 11 |

## Structure interne de chaque spec de commande

Chaque fichier de commande (10-14) suit le même template :

1. **Résumé** : Vue d'ensemble et scope
2. **Syntaxe** : Signature complète, options, arguments
3. **Comportement nominal** : Cas standard avec processus détaillé
4. **Cas d'erreur** : Messages Git exacts, codes de sortie
5. **Critères d'acceptation** : Given/When/Then numérotés (CA-xxx-NN)
6. **Implémentation : Points clés** : Conseils pour le développeur
7. **Dépendances inter-commandes** : Liens avec d'autres fonctionnalités
8. **Notes Phase 2** : Clarifications ou futurs travaux

## Couverture des critères d'acceptation

### `git branch` (10-branch.md)

- **Listage** : CA-branch-01, 02 (une branche, plusieurs, marquage courant)
- **Création** : CA-branch-03, 04, 05 (depuis HEAD normal, vide, détaché)
- **Suppression -d** : CA-branch-07 (succès), 08 (erreur : courante), 10 (inexistante)
- **Suppression -D** : CA-branch-09 (force)
- **Erreurs** : CA-branch-06 (dupliquée), 11 (dépôt non init), 12 (nom invalide)
- **Total** : 12 critères

### `git checkout` (11-checkout.md)

- **Basculer branche** : CA-checkout-01, 09 (succès, idempotent)
- **Créer + basculer (-b)** : CA-checkout-02 (succès), 07 (erreur : existe)
- **Détacher HEAD** : CA-checkout-03 (sur commit)
- **Revenir (-)** : CA-checkout-04 (succès), 08 (erreur : pas d'historique)
- **Navigation détaché** : CA-checkout-10 (détaché → branche → revenir)
- **--detach** : CA-checkout-11 (explicite)
- **Sécurité** : CA-checkout-06 (changements écrasés)
- **Erreurs** : CA-checkout-05 (branche inexistante)
- **Total** : 11 critères

### `git switch` (12-switch.md)

- **Basculer branche** : CA-switch-01
- **Créer + basculer (-c)** : CA-switch-02, 07 (succès et erreur)
- **Détacher (--detach)** : CA-switch-03
- **Revenir (-)** : CA-switch-04, 08 (succès et erreur)
- **Sécurité** : CA-switch-06
- **Erreurs** : CA-switch-05 (inexistante)
- **Total** : 8 critères

### `git restore` (13-restore.md)

- **Restaurer WT depuis index** : CA-restore-01, 02 (fichier, tous)
- **Retirer du staging (--staged)** : CA-restore-03, 04 (fichier existant, nouveau)
- **Depuis commit (--source)** : CA-restore-05, 06 (existant, inexistant/suppression)
- **Erreurs** : CA-restore-07 (pathspec inexistant), 08 (commit inexistant), 09 (pathspec vide)
- **Total** : 9 critères

### `git tag` (14-tag.md)

- **Listage** : CA-tag-01, 02 (aucun, plusieurs, tri alphabétique)
- **Création sur HEAD** : CA-tag-03, 05 (normal, détaché)
- **Création sur commit** : CA-tag-04
- **Suppression** : CA-tag-06 (succès), 08 (inexistant)
- **Erreurs** : CA-tag-07 (dupliquée), 09 (commit inexistant), 10 (HEAD vierge), 11 (nom invalide)
- **Total** : 11 critères

## Récapitulatif des critères d'acceptation

**Total Phase 2** : 12 + 11 + 8 + 9 + 11 = **51 critères d'acceptation**

## Liens de dépendances entre specs

```
09-model-phase2.md ← foundation
    ↓
10-branch.md ← crée des branche
    ↓
11-checkout.md ← utilise branch, modifie HEAD + index/WT
    ↓
12-switch.md ← wrapper de checkout
    ↓
13-restore.md ← indépendant (utilise HEAD/index comme sources)
    ↓
14-tag.md ← indépendant (utilise commits)
```

## Intégration avec Phase 1

### Fichiers Phase 1 à consulter

- `00-model.md` : Modèle de base (blob, tree, commit, refs, index, WT)
- `01-init.md` à `05-log.md` : Commandes Phase 1

### Changements attendus aux fichiers Phase 1

Pas de changements au contenu des specs Phase 1 (elles restent valides).

Mais les implémentations Phase 1 doivent être adaptées :
- `src/core/repository.ts` : ajouter helpers Phase 2
- `src/core/engine.ts` : adapter `snapshot()` pour tags
- `src/core/parser.ts` : dispatcher les 5 nouvelles commandes

## Checklist de couverture pour l'implémentation

### Pour chaque commande, vérifier

- [ ] Tous les cas nominaux implémentés (Cas 1, 2, 3... de la spec)
- [ ] Tous les cas d'erreur implémentés avec message exact
- [ ] Tous les critères d'acceptation couverts par des tests Vitest
- [ ] Options/flags correct parsés
- [ ] Code de sortie correct (0, 1, 128)
- [ ] Output matching Git exact (ou proche accepté pour Phase 2)
- [ ] Invariants du modèle maintenus après chaque opération

### Pour l'intégration

- [ ] `npm run build` réussit (typecheck strict, pas de inutilisé)
- [ ] `npm test` 100% vert (tous les tests Phase 1 + 2)
- [ ] Tests de régression Phase 1 passent
- [ ] Workflows complets testés (multi-commandes enchaînées)
- [ ] QA : Revue des invariants et pièges mentionnés

## Fichiers de test attendus (Vitest)

En addition aux specs, le dev doit créer des fichiers de test :

| Fichier | Commande | Approche |
|---------|----------|----------|
| `tests/commands/branch.test.ts` | branch | Chaque CA = test ou groupe |
| `tests/commands/checkout.test.ts` | checkout | Cas nominaux + erreurs |
| `tests/commands/switch.test.ts` | switch | Partagé avec checkout si wrapper |
| `tests/commands/restore.test.ts` | restore | Chaque type de restore |
| `tests/commands/tag.test.ts` | tag | Listage, création, suppression |

Estimation : ~150 tests Vitest (couvrant 51 CA + edge cases).

## Format des critères d'acceptation

**Standard utilisé** : Given/When/Then

Exemple (CA-branch-03) :
```
### CA-branch-03 : Créer une branche depuis HEAD

**Given**
- L'engine est initialisé
- HEAD pointe sur `main` avec un commit

**When**
- L'utilisateur exécute `git branch feature`

**Then**
- `exitCode === 0`
- `output === []`
- `refs.heads.feature` existe et pointe sur le même hash que main
```

## Notes pour l'orchestrateur

1. **Critères de merge** : Chaque CA testée = test vert, code review approuvé
2. **Validation de conformité** : Comparer output exact avec Git réel sur les cas clés
3. **Performances** : Pas de problème attendu en Phase 2 (données en mémoire)
4. **Docs utilisateur** : À mettre à jour en parallèle des specs (USAGE.md)

## Prochains livrables (Phase 3+)

- Phase 3 (Visualisation) : Graphe DAG avec branches, tags, HEAD détaché
- Phase 4 (Reset/Rebase) : `git reset`, `git rebase` — dépend de Phase 2
- Phase 5 (Merge) : `git merge`, conflict resolution — dépend de Phase 2+

