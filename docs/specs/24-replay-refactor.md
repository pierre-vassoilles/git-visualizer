# Phase 5 : Refactorisation de la logique de replay (dette Phase 4)

## Résumé

Cette spécification traite la **dette Phase 4** signalée dans le CLAUDE.md : **déduplération de la logique de replay et de diff applicatif**. La Phase 4 a implémenté `rebase`, `cherry-pick`, et `revert` avec ~80 lignes de code dupliquées entre `cmdRebase` et `rebaseContinue`, et des divergences dans `applyDiff` (partiellement mort) utilisé inconsistamment.

**Objectif Phase 5** :
- Extraire un helper centralisé `replayCommit(repo, origCommit, newParentHash, label)` utilisé par rebase, rebase -i, cherry-pick, revert, et potentiellement d'autres commandes.
- Clarifier le contrat entre "récupérer le diff d'un commit" et "appliquer le diff sur un nouvel arbre" pour éviter les réimplémentations inline.
- Documenter le traitement cohérent des conflits (marqueurs, état d'opération).

**Impact** :
- Réduction de ~200 lignes de code dupliqué.
- Logique testable en isolation : facilite les tests de replay dans les futurs refactorings.
- Fondation solide pour le rebase interactif (qui enchaine plusieurs replay).

## Contexte Phase 4

En Phase 4 :
- `cmdRebase` (lignes ~138–248) : boucle manuelle de replay (`for (let i = 0; i < commitsToReplay.length; i++)`)
- `rebaseContinue` (lignes ~316–406) : **même boucle réimplémentée** pour continuer
- `cmdCherryPick` / `cmdRevert` : logique similaire inline

**Problèmes identifiés** :
1. **Duplication** : les deux branches de rebase dupliquent presque entièrement le calcul du diff, l'application, la détection de conflits, et la création de commit.
2. **Divergence** : `applyDiff` n'est **pas utilisé** par rebase ; au lieu de cela, rebase réimplémente l'application fichier par fichier (ajouts, suppressions, modifications) en ligne.
3. **Maintenance difficile** : corriger un bug dans le replay nécessite de patcher plusieurs endroits.

## Contrat du helper `replayCommit`

### Signature

```typescript
export interface ReplayCommitOptions {
  /** Commit original à rejouer */
  origCommit: Commit;
  /** Hash du commit original (pour les marqueurs de conflit) */
  origHash: string;
  /** Hash du nouveau parent (base) sur lequel rejouer */
  newParentHash: string;
  /** Label pour les marqueurs de conflit (ex: shortHash du commit original) */
  label: string;
}

export interface ReplayCommitResult {
  /** Hash du commit rejoué (créé), ou null si conflit */
  newHash: string | null;
  /** Fichiers en conflit avec marqueurs (si conflit) */
  conflicts: Record<string, string>;
  /** État à préserver pour continuer après résolution (si conflit) */
  resumeState?: {
    /** Arbre partiellement appliqué du commit à rejouer */
    partialFiles: Record<string, string>;
    /** Message du commit à créer après résolution */
    commitMessage: string;
  };
}

/**
 * Rejoue un commit unique au-dessus d'un nouveau parent.
 *
 * Processus :
 * 1. Déterminer les changements du commit original (origCommit.tree vs son parent)
 * 2. Appliquer les changements sur le nouvel arbre parent
 * 3. Si conflit détecté :
 *    - Retourner les fichiers en conflit avec marqueurs
 *    - Exposer l'état pour continuer après résolution (replayOneCommitContinue)
 *    - Mettre à jour index et working tree du repo avec les marqueurs
 *    - **Ne pas créer de commit**
 * 4. Si pas de conflit :
 *    - Créer le nouveau commit avec le nouvel arbre et les parents explicites
 *    - Mettre à jour index et working tree du repo
 *    - Retourner le hash du commit
 *
 * @param repo - Repository mutable
 * @param options - Paramètres du replay
 * @returns Résultat du replay (commit créé ou conflits)
 */
export function replayCommit(
  repo: Repository,
  options: ReplayCommitOptions
): ReplayCommitResult
```

### Implémentation attendue

Pseudo-code :

```typescript
function replayCommit(repo, { origCommit, origHash, newParentHash, label }): ReplayCommitResult {
  // 1. Déterminer les changements du commit (diff parent → origCommit)
  const parentHash = origCommit.parents[0] ?? null;
  const parentTreeHash = parentHash
    ? getCommit(repo, parentHash)?.tree ?? null
    : null;
  const diff = computeTreeDiff(repo, parentTreeHash, origCommit.tree);

  // 2. Récupérer les fichiers du nouveau parent
  const newParentCommit = getCommit(repo, newParentHash);
  if (!newParentCommit) {
    throw new Error(`Parent commit not found: ${newParentHash}`);
  }
  const newParentFiles = getTreeFiles(repo, newParentCommit.tree);

  // 3. Appliquer le diff (logique centralisée)
  const resultFiles = { ...newParentFiles };
  const conflictFiles: Record<string, string> = {};

  // Suppression
  for (const path of Object.keys(diff.deleted)) {
    delete resultFiles[path];
  }

  // Ajouts
  for (const [path, content] of Object.entries(diff.added)) {
    if (path in resultFiles && resultFiles[path] !== content) {
      conflictFiles[path] = makeConflictMarkers(resultFiles[path]!, content, label);
      resultFiles[path] = conflictFiles[path]!;
    } else {
      resultFiles[path] = content;
    }
  }

  // Modifications
  for (const [path, { from, to }] of Object.entries(diff.modified)) {
    const current = resultFiles[path];
    if (current === undefined) {
      resultFiles[path] = to;
    } else if (current === from) {
      resultFiles[path] = to;
    } else if (current === to) {
      // Déjà appliqué, ok
    } else {
      conflictFiles[path] = makeConflictMarkers(current, to, label);
      resultFiles[path] = conflictFiles[path]!;
    }
  }

  // 4. Gérer les conflits ou créer le commit
  if (Object.keys(conflictFiles).length > 0) {
    // Mettre à jour l'index et le working tree avec les marqueurs
    repo.index = buildIndexFromFiles(repo, resultFiles);
    repo.workingTree = buildWorkingTreeFromFiles(repo, resultFiles);

    return {
      newHash: null,
      conflicts: conflictFiles,
      resumeState: {
        partialFiles: resultFiles,
        commitMessage: origCommit.message,
      }
    };
  }

  // Pas de conflit : créer le commit
  repo.index = buildIndexFromFiles(repo, resultFiles);
  repo.workingTree = buildWorkingTreeFromFiles(repo, resultFiles);
  const treeHash = buildTreeFromIndex(repo, repo.index);

  const newCommitHash = createCommitWithParents(repo, {
    message: origCommit.message,
    treeHash,
    parents: [newParentHash],
  });

  return {
    newHash: newCommitHash,
    conflicts: {},
  };
}
```

### Variante : `replayCommitWithPartialFiles` (pour continuer après résolution)

Après que l'utilisateur ait résolu les conflits (édité les fichiers en conflit, exécuté `git add`), on doit créer le commit avec l'index courant au lieu de précalculer l'arbre.

```typescript
export interface ReplayContinueOptions {
  /** Message du commit à créer (du commit original) */
  commitMessage: string;
  /** Hash du nouveau parent */
  newParentHash: string;
}

/**
 * Crée le commit après résolution manuelle de conflits.
 * Utilise l'index courant du repo comme source de l'arbre final.
 */
export function replayCommitContinue(
  repo: Repository,
  options: ReplayContinueOptions
): string {
  const treeHash = buildTreeFromIndex(repo, repo.index);
  return createCommitWithParents(repo, {
    message: options.commitMessage,
    treeHash,
    parents: [options.newParentHash],
  });
}
```

## Helpers de support

Ces helpers existent ou doivent être clarifiés :

| Helper | Statut Phase 4 | Usage | Notes |
|--------|---|---|---|
| `computeTreeDiff(repo, fromTreeHash, toTreeHash)` | ✓ Existe | Calcule diff entre deux arbres | Utilisé par cherry-pick/revert/rebase |
| `getTreeFiles(repo, treeHash)` | ✓ Existe | Flatten tree en map path → content | Utilisé par plusieurs helpers |
| `makeConflictMarkers(ours, theirs, label)` | ✓ Existe | Crée marqueurs standard Git | |
| `buildIndexFromFiles(repo, files)` | ✓ Existe | Construit Index depuis map de fichiers | |
| `buildWorkingTreeFromFiles(repo, files)` | ✓ Existe | Construit WT depuis map de fichiers | |
| `buildTreeFromIndex(repo, index)` | ✓ Existe | Construit tree hash depuis Index | |
| `createCommitWithParents(repo, options)` | ✓ Existe (Phase 4 rebase) | Crée commit avec parents explicites | **À extraire** de rebase.ts si inline |

## Refactorisation de rebase

Une fois `replayCommit` implémenté, `cmdRebase` et `rebaseContinue` deviennent :

```typescript
export function cmdRebase(repo: Repository, args: string[]): CommandResult {
  // ... validation, résolution base, check ancestors, etc. (inchangé)

  // Sauvegarder l'état
  const branchBeforeRebase = currentBranch(repo);
  const indexBeforeRebase = cloneIndex(repo.index);
  const workingTreeBeforeRebase = cloneWorkingTree(repo.workingTree);

  let currentNewParent = baseHash;
  const replayed: string[] = [];

  for (const { hash: origHash, commit: origCommit } of commitsToReplay) {
    const result = replayCommit(repo, {
      origCommit,
      origHash,
      newParentHash: currentNewParent,
      label: origHash.slice(0, 7),
    });

    if (!result.newHash) {
      // Conflit
      repo.rebasing = {
        base: baseHash,
        toReplay: commitsToReplay.slice(i).map((c) => c.hash),
        replayed,
        // ... reste de l'état
      };
      // Retourner erreur conflit
      return fail([`CONFLICT (content): Conflict in ${Object.keys(result.conflicts).join(', ')}`]);
    }

    replayed.push(result.newHash);
    currentNewParent = result.newHash;
  }

  // Succès
  return ok([`Successfully rebased and updated ${branchLabel}.`]);
}

function rebaseContinue(repo: Repository): CommandResult {
  // ... validation état rebasing

  const { commitMessage, base, toReplay, replayed } = repo.rebasing;
  const parentHash = replayed.length > 0 ? replayed[replayed.length - 1]! : base;

  const newHash = replayCommitContinue(repo, {
    commitMessage,
    newParentHash: parentHash,
  });

  const newReplayed = [...replayed, newHash];
  let currentNewParent = newHash;

  // Continuer avec les commits restants
  for (const origHash of toReplay.slice(1)) {
    const origCommit = getCommit(repo, origHash);
    if (!origCommit) continue;

    const result = replayCommit(repo, {
      origCommit,
      origHash,
      newParentHash: currentNewParent,
      label: origHash.slice(0, 7),
    });

    if (!result.newHash) {
      // Conflit
      repo.rebasing = {
        ...repo.rebasing,
        toReplay: toReplay.slice(1), // mise à jour
        replayed: newReplayed,
      };
      return fail([...]);
    }

    newReplayed.push(result.newHash);
    currentNewParent = result.newHash;
  }

  // Succès
  delete repo.rebasing;
  return ok([...]);
}
```

Réduction : ~80 lignes dupliquées disparaissent, code centralisé et testable.

## Critères d'acceptation

### CA-replay-01 : `replayCommit` sans conflit

**Given**
- Repository avec commits C0 ← C1 (HEAD), C0 ← D1
- D1 modifie `a.txt` : "base" → "feature"
- C1 modifie `b.txt` : "base" → "main"

**When**
- Appel `replayCommit(repo, { origCommit: D1, origHash, newParentHash: C1_hash, label: "D1" })`

**Then**
- `result.newHash` : hash du nouveau commit D1'
- `result.conflicts` : vide
- `repo.index` et `repo.workingTree` : alignés sur le nouvel arbre
- D1' a `a.txt = "feature"`, `b.txt = "main"` (merge des deux)

### CA-replay-02 : `replayCommit` avec conflit

**Given**
- C0 ← C1 (HEAD) où C1 a `a.txt = "main"`
- C0 ← D1 où D1 a `a.txt = "feature"`
- Base C0 : `a.txt = "base"`

**When**
- Appel `replayCommit(repo, { origCommit: D1, origHash: D1_hash, newParentHash: C1_hash, label: shortHash(D1) })`

**Then**
- `result.newHash` : null
- `result.conflicts['a.txt']` : contient marqueurs `<<<<<<<`, `=======`, `>>>>>>>`
- `repo.workingTree['a.txt']` : mis à jour avec les marqueurs
- `result.resumeState.commitMessage` : "message de D1"

### CA-replay-03 : `replayCommitContinue` après résolution

**Given**
- État de conflit du CA-replay-02
- Utilisateur a édité `a.txt` : résolvé à "resolved"
- `repo.index['a.txt']` : mis à jour avec contenu résolu

**When**
- Appel `replayCommitContinue(repo, { commitMessage: "...", newParentHash: C1_hash })`

**Then**
- Retourne hash du commit D1'
- D1' a `a.txt = "resolved"`
- D1'.parents = [C1]

### CA-replay-04 : Déduplification rebase

**Given**
- Rebase Phase 4 existant avec 3 commits à rejouer

**When**
- Exécute `git rebase main` (nominal)
- Puis simule conflit et `git rebase --continue`

**Then**
- Code de rebase.ts réduit de ~80 lignes (dupliquées entre cmdRebase et rebaseContinue)
- Tous les tests Phase 4 rebase restent verts
- Comportement identique (aucune régression)

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/repository.ts` | Ajouter `replayCommit(repo, options)` et `replayCommitContinue(repo, options)` |
| `src/core/commands/rebase.ts` | Refactoriser `cmdRebase` et `rebaseContinue` pour utiliser `replayCommit` |
| `src/core/commands/cherry-pick.ts` | Refactoriser pour utiliser `replayCommit` (si inline avant) |
| `src/core/commands/revert.ts` | Refactoriser pour utiliser `replayCommit` (si inline avant) |
| Tests | Ajouter tests `replayCommit` (nominal, conflit, continue) |

## Notes de conception

1. **Fail-fast sur parent manquant** : `replayCommit` lance une erreur si `newParentHash` inexistant (bug interne, pas erreur utilisateur) ; la commande appeuse gère la validation en amont.
2. **État de résumé minimal** : `resumeState` contient uniquement ce qui est nécessaire pour créer le commit après résolution (message + parent) ; les détails du diff sont oubliés (comme Git qui rethéque après ajout).
3. **Marqueurs de conflit cohérents** : `makeConflictMarkers(ours, theirs, label)` doit toujours être appelé avec les mêmes paramètres pour cohérence (label = shortHash pour identification).
4. **Pas de état global "en replay"** : `replayCommit` ne modifie que l'index/WT du repo ; l'état "rebasing"/"cherry-picking"/etc. est géré par la commande appeluse.

## Impact sur Phase 5

- **Rebase interactif** : s'appuiera sur `replayCommit` pour exécuter la todo list, éliminant les divergences.
- **Tests futurs** : `replayCommit` étant testable en isolation, les futurs refactorings de replay sont plus sûrs.
- **Cherry-pick multiples** (Phase 5+) : pourra itérer sur `replayCommit` au lieu de réimplémenter.
