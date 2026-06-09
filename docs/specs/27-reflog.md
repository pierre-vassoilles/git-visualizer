# Phase 5 : git reflog

## Résumé

Le reflog (reference log) est un journal chronologique de **tous les mouvements de HEAD et des refs** (branches, tags) dans le dépôt. Chaque fois que HEAD avance, se déplace, ou qu'une branche est mise à jour, une entrée est ajoutée au reflog.

**Cas d'usage** :
- Récupérer un commit "perdu" (orphelin après un rebase/reset)
- Trouver l'état précédent de HEAD : `HEAD@{5}` = 5e mouvement en arrière
- Auditer l'historique des opérations (qui a changé HEAD, quand, pourquoi)

**Variantes** :
- `git reflog` (ou `git reflog show HEAD`) : affiche le reflog de HEAD
- `git reflog list` : affiche les noms de tous les refs avec reflog (optionnel Phase 5)
- Révisions : `HEAD@{n}` résout le commit à la nième entrée du reflog de HEAD

## Syntaxe

```
git reflog [show] [<ref>]
git reflog list
```

### Commandes supportées en Phase 5

| Commande | Argument | Comportement | Notes |
|----------|----------|-----------|---------|
| `reflog` (ou `reflog show`) | `[<ref>]` | Affiche le reflog du ref (défaut : HEAD) | |
| `reflog list` | (aucun) | Liste les noms des refs avec reflog | Optionnel Phase 5 |

### Révisions supportées

| Format | Exemple | Signification |
|--------|---------|---------------|
| **HEAD@{n}** (NEW) | `HEAD@{0}`, `HEAD@{5}` | nième entrée du reflog de HEAD (de la plus récente) |
| **Branche@{n}** (NEW) | `main@{2}` | nième entrée du reflog de la branche |
| **Tag@{n}** (optionnel) | `v1.0@{1}` | nième entrée du reflog du tag (rare) |

## Concepts fondamentaux

### Entrée du reflog

Chaque entrée du reflog enregistre :
- **Ancien hash** : le commit/ref pointé avant le mouvement
- **Nouveau hash** : le commit/ref pointé après le mouvement
- **Action** : le type de mouvement (`commit`, `checkout`, `reset`, `merge`, `rebase`, `cherry-pick`, `revert`, etc.)
- **Description** : détails additionnels (branche, message, etc.)
- **Timestamp** : quand le mouvement s'est produit

```typescript
export interface ReflogEntry {
  /** Ancien hash (ou "" si création) */
  oldHash: string;
  /** Nouveau hash */
  newHash: string;
  /** Action : commit, checkout, reset, merge, rebase, revert, cherry-pick, stash, etc. */
  action: string;
  /** Description additionnelle (ex: "main: fast forward", "rebasing: 3 commits") */
  description: string;
  /** Timestamp */
  timestamp: number;
}
```

### Reflog par ref

Le reflog est **isolé par ref** : chaque branche, chaque tag, et HEAD ont leur propre reflog. `HEAD` est un cas particulier.

```
HEAD reflog :
  HEAD@{0}: commit: My new commit
  HEAD@{1}: checkout: switched to branch main
  HEAD@{2}: reset: hard main~1
  HEAD@{3}: merge: Merge branch feature

main reflog (branche) :
  main@{0}: commit: My new commit
  main@{1}: rebase: continued ...
  main@{2}: rebase: started from C0

feature reflog :
  feature@{0}: commit: Added feature
  feature@{1}: checkout: switched from feature to main
  (note : checkout ne change pas le ref feature, mais enregistre dans HEAD reflog)
```

### Indexation HEAD@{n}

`HEAD@{0}` = état le plus récent de HEAD (avant la commande courante)
`HEAD@{1}` = état avant celui-ci
`HEAD@{2}` = état avant celui-ci
etc.

**Après chaque commande**, une nouvelle entrée est ajoutée, et les indices se décalent.

```
Avant commit C3 :
  HEAD@{0}: commit C2
  HEAD@{1}: checkout main
  HEAD@{2}: reset ...

Après commit C3 :
  HEAD@{0}: commit C3
  HEAD@{1}: commit C2
  HEAD@{2}: checkout main
  HEAD@{3}: reset ...
```

## Entrées du reflog par opération

### Commit

**Opération** : `git commit` ou `git merge` (crée un commit)

**Entrée** :
```
action: "commit"
description: "<short_msg>"  ou  "merge: Merge branch '<branchname>'"
oldHash: <hash du commit précédent>
newHash: <hash du nouveau commit>
```

Exemple :
```
HEAD@{0}: commit: My commit message
HEAD@{1}: commit: Previous commit
```

### Checkout / Switch

**Opération** : `git checkout <branchname>` ou `git switch <branchname>`

**Entrée** :
```
action: "checkout"
description: "switched to branch '<branchname>'"  ou  "switched from '<oldbranchname>' to '<newbranchname>'"
oldHash: <hash du commit avant>
newHash: <hash du commit après>
```

Exemple :
```
HEAD@{0}: checkout: switched to branch main
HEAD@{1}: checkout: switched from main to feature
```

### Reset

**Opération** : `git reset <ref>`

**Entrée** :
```
action: "reset"
description: "<mode> <ref>"  (ex: "hard main~1", "soft HEAD")
oldHash: <hash avant reset>
newHash: <hash après reset>
```

Exemple :
```
HEAD@{0}: reset: hard main
HEAD@{1}: reset: soft main~1
```

### Merge

**Opération** : `git merge <branchname>`

**Entrée** :
```
action: "merge"
description: "Merge branch '<branchname>'"  ou  "Merge made by the 'recursive' merge strategy."
oldHash: <hash avant merge>
newHash: <hash du commit de merge>
```

Exemple :
```
HEAD@{0}: merge: Merge branch 'feature'
HEAD@{1}: merge: Merge branch 'hotfix'
```

### Rebase

**Opération** : `git rebase <base>` ou `git rebase -i <base>`

**Entrée** :
```
action: "rebase"
description: "rebase: continue"  ou  "rebase: finish <base>"  ou  "rebase: abort" (optionnel)
oldHash: <hash avant rebase>
newHash: <hash du dernier commit rejoué>
```

Exemple (rebase multi-étapes) :
```
HEAD@{0}: rebase: finish main
HEAD@{1}: rebase: continue
HEAD@{2}: rebase: (initial)
```

**Note** : Pour chaque étape du rebase, on peut ajouter une entrée. Ou simplement une entrée au début et une à la fin.

**Phase 5 choisit : une seule entrée au succès du rebase** (simple).

### Cherry-pick

**Opération** : `git cherry-pick <commit>`

**Entrée** :
```
action: "cherry-pick"
description: "cherry-pick: <commit_message>"  ou  "cherry-pick: fast forward"
oldHash: <hash avant>
newHash: <hash du nouveau commit>
```

### Revert

**Opération** : `git revert <commit>`

**Entrée** :
```
action: "revert"
description: "revert: <commit_msg>"
oldHash: <hash avant>
newHash: <hash du commit de revert>
```

### Tag

**Opération** : `git tag <tagname> [<commit>]`

**Entrée** :
```
action: "tag"
description: "tag: Created tag '<tagname>'"
oldHash: "" (tag créé)
newHash: <hash du commit pointé>
```

**Dans refs/tags reflog** (si implémenté) :
```
refs/tags/v1.0@{0}: tag: Created tag 'v1.0'
```

## Comportement nominal

### Cas 1 : Afficher le reflog de HEAD

**Condition** : `git reflog` ou `git reflog show HEAD`

**Processus** :
1. Récupérer le reflog de HEAD : `repo.reflog[HEAD]` (liste d'entrées)
2. Formater chaque entrée :
   ```
   <shortHash(newHash)> HEAD@{n}: <action>: <description>
   ```
3. Afficher du plus récent au plus ancien

**Format de sortie** :
```
abc1234 HEAD@{0}: commit: My new commit
def5678 HEAD@{1}: checkout: switched to branch main
9ab0123 HEAD@{2}: reset: hard main
cde4567 HEAD@{3}: merge: Merge branch feature
```

**Code de sortie** : 0

### Cas 2 : Afficher le reflog d'une branche

**Condition** : `git reflog show main`

**Processus** :
1. Récupérer le reflog de la branche : `repo.reflog['refs/heads/main']`
2. Formater et afficher

**Format de sortie** :
```
abc1234 main@{0}: commit: Latest commit on main
9ab0123 main@{1}: rebase: continue
```

### Cas 3 : Résoudre HEAD@{n}

**Condition** : Utiliser `HEAD@{n}` dans une commande (ex. `git show HEAD@{3}`, `git reset HEAD@{5}`)

**Processus** :
1. Parser `HEAD@{n}` dans `resolveCommitish`
2. Récupérer le reflog de HEAD : `repo.reflog[HEAD]`
3. Accéder l'entrée à l'index n : `reflog[n]`
4. Retourner `newHash` de cette entrée

**Résultat** : Le commit pointé à cet état de HEAD

### Cas 4 : Reflog vide

**Condition** : Repo initialisé, mais aucune opération effectuée

**Reflog de HEAD** : Vide ou contient une seule entrée "init" (optionnel)

### Cas 5 : Reflog après reset --hard

**Condition** : HEAD pointait C3, puis `git reset --hard C1`

**Entrée ajoutée** :
```
HEAD@{0}: reset: hard C1
HEAD@{1}: commit: C3
HEAD@{2}: checkout: switched to branch main
```

**Si utilisateur** : utilise `git reset --hard HEAD@{1}`, ils reviennent à C3 (undo du reset)

## Cas d'erreur

### Index hors limites

**Condition** : `HEAD@{10}` quand le reflog n'a que 5 entrées

**Message d'erreur** :
```
fatal: HEAD@{10}: revision not found
```

**Code de sortie** : 128

**Comportement** : Commande utilisant cette révision échoue.

### Reflog d'un ref non existant

**Condition** : `nosuchbranch@{0}`

**Message d'erreur** :
```
fatal: nosuchbranch: no such branch
```

**Code de sortie** : 128

## Critères d'acceptation

### CA-reflog-01 : Afficher reflog HEAD

**Given**
- Repository avec plusieurs commits et checkouts

**When**
- Exécute `git reflog`

**Then**
- `exitCode === 0`
- `output` contient lignes : `HEAD@{0}: ...`, `HEAD@{1}: ...`, etc.
- Ordre : plus récent en tête

### CA-reflog-02 : Résoudre HEAD@{n}

**Given**
- Repository avec reflog de HEAD contenant 3 entrées :
  - HEAD@{0}: commit abc1234
  - HEAD@{1}: reset def5678
  - HEAD@{2}: checkout 9ab0123

**When**
- Appel `resolveCommitish(repo, "HEAD@{2}")`

**Then**
- Retourne le hash du commit à HEAD@{2}

### CA-reflog-03 : Reflog après commit

**Given**
- Repository initial vide

**When**
- Crée deux commits : C1, C2

**Then**
- `repo.reflog[HEAD]` contient au minimum :
  - Entrée : action "commit", newHash = C1
  - Entrée : action "commit", newHash = C2
- Accessibles via `HEAD@{0}`, `HEAD@{1}`

### CA-reflog-04 : Reflog après checkout

**Given**
- Repository avec branches `main` et `feature`

**When**
- Exécute `git checkout feature`

**Then**
- Entrée reflog ajoutée : action "checkout", description "switched to branch feature"

### CA-reflog-05 : Reflog après reset

**Given**
- HEAD pointe C3

**When**
- Exécute `git reset --hard C1`

**Then**
- Entrée reflog : action "reset", description "hard C1", newHash = C1

### CA-reflog-06 : Reflog après merge

**Given**
- HEAD sur `main` (C1), merge `feature` (C2)

**When**
- Exécute `git merge feature`

**Then**
- Entrée reflog : action "merge", description contient "Merge branch 'feature'"

### CA-reflog-07 : Reflog après rebase

**Given**
- HEAD sur `feature` avec commits à rejouer

**When**
- Exécute `git rebase main` (succès)

**Then**
- Entrée reflog : action "rebase", description contient "finish" ou "continue"

### CA-reflog-08 : Reflog branche

**Given**
- Branche `main` avec reflog

**When**
- Exécute `git reflog show main`

**Then**
- `exitCode === 0`
- `output` affiche le reflog de `main`

### CA-reflog-09 : Index hors limites

**Given**
- Reflog HEAD avec 3 entrées

**When**
- Appel `resolveCommitish(repo, "HEAD@{10}")`

**Then**
- Retourne null
- Commande l'utilisant échoue avec "revision not found"

### CA-reflog-10 : Reset --hard avec undo via reflog

**Given**
- HEAD pointe C3
- Reflog HEAD contient HEAD@{1}: commit C3

**When**
- Exécute `git reset --hard HEAD@{1}`

**Then**
- HEAD restauré à C3 (undo du reset précédent)
- Nouvelle entrée reflog : reset à C3

### CA-reflog-11 : Reflog après revert

**Given**
- Commit C1, puis `git revert C1`

**When**
- Exécute la commande

**Then**
- Entrée reflog : action "revert", newHash = commit de revert

### CA-reflog-12 : Reflog après cherry-pick

**Given**
- Commit C2 sur branche autre, cherry-pick vers HEAD

**When**
- Exécute `git cherry-pick C2`

**Then**
- Entrée reflog : action "cherry-pick", newHash = nouveau commit

## Décisions de conception (Phase 5)

| Aspect | Décision |
|--------|----------|
| **Reflog par ref** | HEAD + chaque branche (tags optionnel) |
| **Entrées par opération** | Entrée unique au succès (pas d'entrées intermédiaires pour rebase en cours) |
| **Indexation HEAD@{n}** | De la plus récente (0) à la plus ancienne |
| **Durée de vie** | Phase 5 : aucun nettoyage (pas de limite de jours ou d'entrées) |
| **Interaction avec orphelines commits** | Reflog conserve les commits orphelins accessibles via `HEAD@{n}` |
| **Format affichage** | `<shortHash> <ref>@{n}: <action>: <description>` (standard Git) |
| **Reflog list** | Optionnel Phase 5 ; `git reflog show` suffit pour les cas courants |

## Modèle de données

### Repository (extension)

```typescript
export interface Repository {
  // ... champs existants
  /** Reflog: map ref → list d'entrées (du plus récent au plus ancien) */
  reflog?: Record<string, ReflogEntry[]>;
}

export interface ReflogEntry {
  /** Hash avant le mouvement (vide pour creation) */
  oldHash: string;
  /** Hash après le mouvement */
  newHash: string;
  /** Action : commit, checkout, reset, merge, rebase, cherry-pick, revert, tag, etc. */
  action: string;
  /** Description supplémentaire */
  description: string;
  /** Timestamp de l'opération */
  timestamp: number;
}
```

### RepoSnapshot (extension, optionnel)

L'UI peut optionnellement exposer les top N entrées du reflog pour debug/affichage.

```typescript
export interface RepoSnapshot {
  // ... champs existants
  /** Entrées récentes du reflog HEAD (optionnel, pour l'UI) */
  reflogHeadRecent?: Array<{
    index: number;
    hash: string;
    action: string;
    description: string;
  }>;
}
```

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/model.ts` | Ajouter `ReflogEntry`, étendre `Repository` avec `reflog` |
| `src/core/repository.ts` | Ajouter helpers : `addReflogEntry`, `getReflog`, `parseReflogRevision` |
| `src/core/repository.ts` | Étendre `resolveCommitish` pour supporter `HEAD@{n}`, `<ref>@{n}` |
| `src/core/commands/reflog.ts` | **Nouveau fichier** : implémenter `cmdReflog`, `cmdReflogShow`, `cmdReflogList` |
| `src/core/engine.ts` | Route `reflog` vers les handlers |
| **Tous les commands** | Ajouter appels à `addReflogEntry` après chaque opération (commit, checkout, reset, merge, rebase, cherry-pick, revert, tag) |
| Tests | Couvrir `27-reflog.md` CA-* |

## Notes d'implémentation

### Quand ajouter une entrée reflog

1. **Commit** : après création de commit (dans `createCommit` ou `createCommitWithParents`)
   ```
   action: "commit"
   description: "<short_msg>"
   oldHash: <hash avant>
   newHash: <hash du nouveau commit>
   ```

2. **Checkout** : dans `cmdCheckout` après changement de HEAD

3. **Reset** : dans `cmdReset` après changement de HEAD

4. **Merge** : dans `cmdMerge` après changement de HEAD (fast-forward ou merge commit)

5. **Rebase** : dans `cmdRebase` après succès (une seule entrée)

6. **Revert** : dans `cmdRevert` après création du commit de revert

7. **Cherry-pick** : dans `cmdCherryPick` après création du commit

8. **Tag** : optionnel Phase 5 (can skip si pas de `git tag` implémenté)

### Parsing de HEAD@{n}

Extension de `resolveCommitish` :

```typescript
// Avant : ~n
// Après : supporter aussi @{n}

const atMatch = /^(.+?)@\{(\d+)\}$/.exec(ref);
if (atMatch) {
  const base = atMatch[1]!;
  const n = parseInt(atMatch[2]!, 10);
  const refName = base === 'HEAD' ? 'HEAD' : `refs/heads/${base}`;
  const entries = repo.reflog?.[refName] ?? [];
  if (n < entries.length) {
    return entries[n]!.newHash;
  }
  return null; // revision not found
}
```

### Affichage reflog

Format standard Git :

```
abc1234 HEAD@{0}: commit: Message of commit
def5678 HEAD@{1}: checkout: switched to branch main
9ab0123 HEAD@{2}: reset: hard main~1
```

Champs :
- `shortHash` (7 chars)
- `ref@{index}` (ex: `HEAD@{0}`)
- `action:` (label)
- `description` (reste de la ligne)

## Impact sur Phase 6+

- **Reflog cleanup** : implémenter `git reflog expire`, `git reflog prune` (optionnel)
- **Reflog branch** : tracking complet des réfs branches/tags (actuellement centralisé sur HEAD)
- **Reflog interactive** : interface UI pour "time travel" dans le reflog (optionnel)
