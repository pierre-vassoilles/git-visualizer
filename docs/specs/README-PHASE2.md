# Phase 2 : Spécifications Complètes

Ceci est le point d'entrée pour l'implémentation de Phase 2 du projet Git Visualizer.

## Vue d'ensemble

Phase 2 couvre les branche, la navigation entre eux, et la tagging. Cinq nouvelles commandes sont implémentées :

1. **`git branch`** — Gérer les branche (créer, lister, supprimer)
2. **`git checkout`** — Bascule HEAD vers une branche ou un commit
3. **`git switch`** — Variante moderne de checkout
4. **`git restore`** — Restaurer des fichiers depuis l'index ou un commit
5. **`git tag`** — Gérer les étiquettes

**Périmètre hors Phase 2** : Merge, rebase, reset (Phases 4+).

## Fichiers de spécifications

Tous les fichiers sont dans le répertoire `docs/specs/`.

### Spécifications par commande

| Fichier | Commande | Scope |
|---------|----------|-------|
| `10-branch.md` | `git branch` | Lister, créer, supprimer (-d, -D) |
| `11-checkout.md` | `git checkout` | Basculer branche, détacher HEAD, créer (-b), revenir (-), --detach |
| `12-switch.md` | `git switch` | Variante de checkout : basculer, créer (-c), détacher, revenir (-) |
| `13-restore.md` | `git restore` | Restaurer fichiers (--staged, --source) |
| `14-tag.md` | `git tag` | Lister, créer, supprimer tags légers |

### Documents structurants

| Fichier | Contenu | Public cible |
|---------|---------|-------------|
| `09-model-phase2.md` | Évolutions du modèle de données (HEAD détaché, prevBranch, tags) | Dev, Product manager |
| `PHASE2-SUMMARY.md` | Résumé exécutif : décisions critiques, changements fichiers, ordre de dev | Orchestrateur, Lead dev |
| `PHASE2-TECHNICAL.md` | Détails d'implémentation : helpers, snapshot, code examples | Dev (TypeScript) |
| `PHASE2-GUIDE.md` | Workflows complets, interactions entre commandes, pièges | Dev, QA |
| `PHASE2-START.md` | Guide pas-à-pas pour démarrer le développement | Dev débutant |
| `PHASE2-FILES.md` | Récapitulatif des fichiers et critères d'acceptation | Tous |

**+ ce fichier (README-PHASE2.md)** : Vue d'ensemble et point d'entrée.

## Critères d'acceptation

Phase 2 couvre **51 critères d'acceptation** (CA) au format Given/When/Then :

- **`git branch`** : 12 CA (10-branch.md)
- **`git checkout`** : 11 CA (11-checkout.md)
- **`git switch`** : 8 CA (12-switch.md)
- **`git restore`** : 9 CA (13-restore.md)
- **`git tag`** : 11 CA (14-tag.md)

Chaque CA doit être couvert par au moins un test Vitest.

## Points critiques à comprendre

### 1. HEAD détaché

Représenté par `HEAD.symbolic = false` + `HEAD.target = <commit_hash>`.

État transitionnel où HEAD pointe directement sur un commit au lieu d'une branche.

Affichage Git : `HEAD detached at <commit_hash>`.

### 2. Branches vides

Une branche peut exister avec `refs.heads[name] = ""` (aucun commit associé).

Cas : Après `git init`, la branche `main` est créée vide. Après `git branch feature` sur un dépôt vierge, `feature` est aussi vide.

### 3. Historique de branche précédente

Nouveau champ `prevBranch: string | null` dans Repository.

Permet `git checkout -` (revenir à la branche d'avant).

Conservé même quand HEAD est détaché (Option A du spec).

### 4. Sécurité : Refus de changement destructif

`git checkout` refuse de basculer si des changements locaux seraient écrasés.

Message exact Git : `"error: Your local changes to the following files would be overwritten by checkout:"`

Détection implémentée via `canCheckoutWithoutDataLoss()` helper.

### 5. Tags légers

Phase 2 implémente uniquement les tags légers : simples refs vers des commits.

Structure : `refs.tags[name] = <commit_hash>`.

Tags annotés (avec métadonnées) viennent plus tard.

## Changements au modèle

### Repository (src/core/model.ts)

```typescript
// Ajouts
refs.tags: { [tagName: string]: string }  // NEW
prevBranch: string | null                 // NEW
```

### RepoSnapshot (src/core/engine.ts)

```typescript
// Ajouts
tags: Record<string, string>               // NEW
SnapshotCommit.tags: string[]             // NEW (tags pointant sur le commit)
```

### Helpers à ajouter (src/core/repository.ts)

10+ helpers pour accès, validation, sécurité (détails en PHASE2-TECHNICAL.md).

## Fichiers de code à créer

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

## Fichiers de code à modifier

```
src/core/
  ├── model.ts              (ajouter champs)
  ├── repository.ts         (ajouter helpers)
  ├── engine.ts             (adapter snapshot)
  └── parser.ts             (ajouter dispatchers)
```

## Pour démarrer le développement

1. **Lire** `PHASE2-START.md` (guide pas-à-pas)
2. **Comprendre** `09-model-phase2.md` (modèle) et `PHASE2-SUMMARY.md` (décisions)
3. **Implémenter** dans l'ordre : modèle → helpers → branch → checkout → restore → tag → switch
4. **Tester** : Chaque CA = au moins 1 test Vitest
5. **Vérifier** : `npm run build && npm test` doivent passer, sans régressions Phase 1

## Validation finale

Phase 2 est complète quand :

- [ ] Tous les fichiers de code implémentés
- [ ] `npm run build` réussit (no errors)
- [ ] `npm test` 100% vert (51+ tests Phase 2, 195+ tests Phase 1 régression)
- [ ] `npm run lint` clean
- [ ] Messages d'erreur conformes Git
- [ ] Workflows d'intégration testés
- [ ] Code review approuvée

## Dépendances entre fichiers de specs

```
09-model-phase2.md
    ↓
PHASE2-SUMMARY.md  ← pour l'orchestrateur
    ↓
PHASE2-TECHNICAL.md  ← pour le dev (comment implémenter)
    ↓
10-14 (specs commandes)  ← spécifications détaillées
    ↓
PHASE2-GUIDE.md  ← workflows et intégrations
    ↓
PHASE2-START.md  ← pas-à-pas pour démarrer
```

## Chronologie de lecture recommandée

**Pour comprendre Phase 2 dans les 2-3 heures** :

1. Ce README (15 min)
2. `PHASE2-SUMMARY.md` (45 min)
3. `09-model-phase2.md` (30 min)
4. `PHASE2-GUIDE.md` workflows (30 min)
5. Une des specs de commande au choix (30 min)

**Pour l'implémentation** :

1. `PHASE2-START.md` (30 min) — guide global
2. `PHASE2-TECHNICAL.md` (1 heure) — détails d'implémentation
3. Chaque spec de commande (30 min par commande) avant d'implémenter

## Interactions avec d'autres phases

### Dépend de Phase 1

- Modèle de données (blob, tree, commit, refs, index, working tree)
- Commandes : init, add, status, commit, log
- Helpers : hash, objectStore, parser

### Phase 3 dépend de Phase 2

- Graphe DAG avec branches et tags affichés
- Indication visuelle de HEAD (branche normale ou détaché)

### Phase 4 dépend de Phase 2

- `git reset` utilise les branches et HEAD
- `git rebase` utilise checkout pour naviguer

### Phase 5 dépend de Phase 2+3+4

- `git merge` utilise branches multiples
- Résolution de conflits

## Support et escalade

**Questions sur la spec** ? Consulter :
- Le spec spécifique (10-14) pour une commande
- `PHASE2-GUIDE.md` pour les interactions
- `PHASE2-SUMMARY.md` pour les décisions critiques

**Questions d'implémentation** ? Consulter :
- `PHASE2-TECHNICAL.md` pour les helpers et patterns
- `PHASE2-START.md` pour le workflow pas-à-pas

**Bugs ou erreurs dans les specs** ? Les signaler avec :
- Le numéro du CA affecté
- La commande et le cas exact
- Les messages Git exacts concernés

## Statut

**Dernière mise à jour** : Juin 2026

**Spécifications** : Complètes et prêtes pour développement

**Implémentation** : À démarrer

---

**Commencer** → Lire `PHASE2-START.md`

**Approfondir** → Lire les 5 specs de commande (10-14)

**Comprendre l'archi** → Lire `PHASE2-TECHNICAL.md`

