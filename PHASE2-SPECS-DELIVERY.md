# Phase 2 : Livraison des Spécifications

**Date** : Juin 2026  
**Statut** : ✅ Complète et prête pour développement  
**Livrables** : 13 documents de spécifications, 51 critères d'acceptation

## Fichiers générés

Tous les fichiers sont dans `/home/pierre/projects/git-visualizer/www/docs/specs/`.

### Spécifications des commandes (5 fichiers)

- `10-branch.md` — `git branch` (lister, créer, supprimer)
- `11-checkout.md` — `git checkout` (bascule, détacher, créer, revenir)
- `12-switch.md` — `git switch` (variante moderne)
- `13-restore.md` — `git restore` (restaurer fichiers)
- `14-tag.md` — `git tag` (créer, lister, supprimer tags)

### Documents architecturaux et de guide (8 fichiers)

| Fichier | Public | Usage |
|---------|--------|-------|
| `09-model-phase2.md` | Dev, PM | Modèle de données + changements |
| `PHASE2-SUMMARY.md` | Orchestrateur | Décisions critiques + ordre de dev |
| `PHASE2-TECHNICAL.md` | Dev TypeScript | Patterns implémentation + helpers |
| `PHASE2-GUIDE.md` | Dev, QA | Workflows + pièges + intégrations |
| `PHASE2-START.md` | Dev débutant | Guide pas-à-pas pour démarrer |
| `PHASE2-FILES.md` | Tous | Index des fichiers + couverture CA |
| `PHASE2-INDEX.md` | Tous | Synthèse complète + timeline |
| `README-PHASE2.md` | Tous | Point d'entrée + vue d'ensemble |

**Total : 13 fichiers de specs, ~65 pages, 51 critères d'acceptation**

## Points clés

### Modèle

- **HEAD détaché** : `HEAD.symbolic = false` pointant sur commit
- **Branches vides** : `refs.heads[name] = ""`
- **Historique de branche** : `prevBranch` pour `checkout -`
- **Tags légers** : `refs.tags[name]` = hash commit

### Commandes

| Commande | CA | Flags |
|----------|----|----|
| `git branch` | 12 | (aucun), -d, -D |
| `git checkout` | 11 | -b, --, --detach |
| `git switch` | 8 | -c, --detach |
| `git restore` | 9 | --staged, --source |
| `git tag` | 11 | -d |

### Sécurité

- Refus de changement si données perdues localement
- Message exact Git : `"error: Your local changes..."`
- Implémentation via helper `canCheckoutWithoutDataLoss()`

## Démarrer l'implémentation

### Lire en priorité

1. **`PHASE2-START.md`** (guide pas-à-pas) — 30 min
2. **`09-model-phase2.md`** (modèle) — 45 min
3. **`PHASE2-TECHNICAL.md`** (implémentation) — 1h

### Implémentation

Ordre recommandé : modèle → helpers → branch → checkout → restore → tag → switch

Estimé : 2-3 semaines de développement pur (14-20 jours)

## Vérification

- [ ] Lire la spec (10-14) avant chaque commande
- [ ] Implémenter tous les cas (nominaux + erreurs)
- [ ] Tester chaque CA (51+ tests Vitest)
- [ ] `npm run build` ✓
- [ ] `npm test` 100% vert ✓
- [ ] Pas de régressions Phase 1 ✓

## Architecture

### Fichiers à modifier

```
src/core/
├── model.ts            (+2 champs)
├── repository.ts       (+10+ helpers)
├── engine.ts           (adapter snapshot)
└── parser.ts           (dispatcher pour 5 commandes)
```

### Fichiers à créer

```
src/core/commands/
├── branch.ts
├── checkout.ts
├── switch.ts
├── restore.ts
└── tag.ts

tests/commands/
├── branch.test.ts
├── checkout.test.ts
├── switch.test.ts
├── restore.test.ts
└── tag.test.ts
```

## Prochaines phases

- **Phase 3** : Graphe DAG avec branches, tags, HEAD détaché
- **Phase 4** : `git reset` et `git rebase`
- **Phase 5** : `git merge` et résolution de conflits

---

**Point d'entrée** : `/home/pierre/projects/git-visualizer/www/docs/specs/README-PHASE2.md`

**Guide de développement** : `/home/pierre/projects/git-visualizer/www/docs/specs/PHASE2-START.md`

