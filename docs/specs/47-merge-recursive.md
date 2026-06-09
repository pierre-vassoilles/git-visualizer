# Phase 7+ : Merge Récursif — Bases de Fusion Multiples (Criss-Cross)

## Résumé

Cette spec généralise `git merge` pour gérer les **historiques criss-cross** (bases de fusion multiples). En Phase 4, `mergeBase(repo, a, b)` retournait une seule base (LCA simple). Phase 7+ traite les cas où multiple bases existent et implémente une **stratégie récursive simplifiée** pour produire une base virtuelle unique.

**Objectifs** :
- Gérer les criss-cross : quand deux branches divergent/reconvergent, puis divergent à nouveau
- Implémenter `mergeBase` pour retourner **une OU plusieurs** bases candidates
- Implémenter une stratégie de **merge récursif** : fusionner virtuellement les bases, puis utiliser le résultat comme base pour le 3-way merge
- Documenter les **conflits delete/modify** (testables une fois `git rm` dispo, spec 43)

Phase 4 considérait `mergeBase` comme simple ; Phase 7+ l'étend pour les criss-cross et ajoute le contexte pour les conflits complexes.

## Contexte : Historiques Criss-Cross

### Exemple simple de criss-cross

```
     C1 ← C3 (main/HEAD)
    /   ╳
C0
    \   ╱
     C2 ← C4 (feature)
```

Historique :
- C0 : commit initial
- C1 : branche main, modifie `a.txt`
- C2 : branche feature, modifie `b.txt`
- C3 : main continue, modifie `c.txt`
- C4 : feature continue, modifie `d.txt`
- **C1 et C2 n'ont pas d'ancêtre-descendant** : divergence simple jusqu'ici

**Criss-cross** :
```
         C1 ← C3 (main)
        /   ╳   \
    C0       M1  C5 (merge c2 dans c3)
        \   ╱   /
         C2 ← C4 (feature)
```

- M1 : merge C2 dans C3, crée `M1.parents = [C3, C2]`
- LCA(C3, C4) pourrait être **C0 OU M1** (les deux sont des ancêtres communs)

Si on continue :
```
         C1 ← C3 ←─┐
        /   ╳   \  │
    C0       M1 ─→ C5 (feature, merge main)
        \   ╱   /
         C2 ← C4
```

- C5 : merge C3 (main) dans C4 (feature), `C5.parents = [C4, C3]`
- LCA(C3, C4) : ambiguïté criss-cross complète

### LCA simple vs multiple

**LCA simple (Phase 4)** :
```
    C2
   /  \
C0 ←─ C1 ← C3 (main)
           /
        feature
```
- LCA(C3, feature) = C1 (unique, unique le plus proche)

**Cas criss-cross (Phase 7)** :
```
     C1 ← C3
    /   ╳  \
C0       ? → M1
    \   ╱  /
     C2 ← C4 ← C5

LCA(C3, C5) candidates : {C0, M1}
C0 est ancêtre de M1 (M1 est descendant via C3-C5)
```

En stratégie **récursive simple** :
- Chercher **tous les ancêtres communs maximaux** (pas dominés par d'autres)
- Si 1 seul → traiter comme Phase 4
- Si plusieurs → les **fusionner virtuellement** pour créer une base synthétique

## Comportement nominal : Merge Récursif

### Cas 1 : Historique sans criss-cross (Phase 4 inchangé)

**Condition** : `mergeBase(repo, a, b)` retourne une seule base (LCA simple).

**Processus** : Idem Phase 4 — merge 3-way normal.

**Exemple** :
```
C0 ← C1 ← C2 (main)
       ↖
        D1 ← D2 (feature)

LCA(C2, D2) = C1 (unique)
→ Merge 3-way : base=C1, ours=C2, theirs=D2
```

### Cas 2 : Criss-cross avec bases multiples

**Condition** : `mergeBase(repo, a, b)` retourne **plusieurs bases** (ou identifie un criss-cross).

**Processus** :

1. **Identifier tous les ancêtres communs maximaux** : LCAs qui ne sont pas ancêtres d'un autre LCA
   ```typescript
   function findAllMaximalLCAs(repo, a, b): Set<string> {
     const common = allCommonAncestors(a, b);
     return common.filter(lca => 
       !common.some(other => 
         other !== lca && isAncestor(repo, other, lca)
       )
     );
   }
   ```

2. **Si 1 seul LCA maximal** : procéder comme Phase 4 (aucun criss-cross)

3. **Si plusieurs LCAs maximaux** :
   - Fusionner récursivement : traiter les LCAs comme un merge virtuel
   - Pour chaque pair de LCAs (lca1, lca2) :
     - Récursivement `mergeBase(lca1, lca2)` pour obtenir leur base commune
     - Effectuer un merge 3-way virtuel de lca1 et lca2 au-dessus de leur base
     - Le résultat devient la **base synthétique** pour le merge principal
   - Utiliser cette base synthétique pour le 3-way final : `(syntheticalBase, a, b)`

4. **Créer le commit de fusion** : comme d'habitude, avec `parents = [a, b]`

**Exemple criss-cross** :
```
     C1 ← C3 (main)
    /   ╳
C0
    \   ╱
     C2 ← C4 ← C5 (feature)

C3 = "modify a.txt", C5 = "modify b.txt"
base=C0 (contenu original a.txt, b.txt)

LCAs(C3, C5) = {C0} (pas vraiment criss-cross, C0 unique)

Si vraiment criss-cross (ajouter M1) :
     C1 ← C3 ←─┐
    /   ╳   \  │
C0       M1 ──→ (merge C3 et C5)
    \   ╱   /
     C2 ← C4 ← C5

M1.parents = [C3, C2], M1 merge a.txt et b.txt
LCAs(C3, C5) candidates = {C0, M1}

Stratégie récursive :
- LCA simple = C0 (car M1 est un merge, pas un LCA maximal au-dessus de C0)
- OU : si on définit LCA comme « tout ancêtre commun » :
  → C0 et M1 tous deux ancêtres
  → Stratégie récursive fusionne M1 et C0 pour obtenir base synthétique
```

### Matérialisation et simplification Phase 7

Pour Phase 7, on **simplifie** la stratégie récursive :

1. Calculer `allLCAs = findAllMaximalLCAs(repo, a, b)`
2. Si `|allLCAs| === 1` : utiliser comme Phase 4
3. Si `|allLCAs| > 1` :
   - **Fusion virtuelle des LCAs** : 
     - Prendre le premier LCA comme "base de base"
     - Fusionner les autres LCAs 2 par 2 en amont (logiquement, pas en créant des commits)
     - Utiliser le tree résultant comme base synthétique
   - **3-way avec base synthétique** : faire le merge normal avec cette base artificielle

**Code pattern** :
```typescript
function mergeRecursive(repo, a: string, b: string, depth = 0) {
  const lcas = findAllMaximalLCAs(repo, a, b);
  
  if (lcas.size === 1) {
    return { baseHash: [...lcas][0], strategy: 'simple' };
  }
  
  // Criss-cross détecté
  if (depth > 5) {
    // Limite de récursion pour éviter les boucles infinies
    return { baseHash: [...lcas][0], strategy: 'limited-recursion' };
  }
  
  // Fusionner les LCAs 2 par 2
  let synthesizedTree = getTree(repo, [...lcas][0]);
  for (let i = 1; i < lcas.size; i++) {
    const nextLCA = [...lcas][i];
    const baseForLCAs = mergeRecursive(repo, [...lcas][0], nextLCA, depth + 1);
    // 3-way merge : base=baseForLCAs, ours=synthesizedTree, theirs=nextLCA.tree
    synthesizedTree = performVirtualMerge(repo, 
      getTree(repo, baseForLCAs.baseHash),
      synthesizedTree,
      getTree(repo, nextLCA)
    );
  }
  
  return { baseTree: synthesizedTree, strategy: 'recursive' };
}
```

## Conflits Suppression/Modification (delete/modify)

### Contexte (dette Phase 4)

En Phase 4, on n'avait pas `git rm`, donc on ne pouvait pas tester les conflits delete/modify en boîte noire. Phase 7+ les documente et les teste (une fois `git rm` implémenté, spec 43).

### Définition

**Conflit delete/modify** : Un fichier est **supprimé dans une branche** mais **modifié dans l'autre** par rapport à l'ancêtre commun.

### Cas

#### Cas A : Suppression vs modification (pas de fusion possible)

**Base** : `file.txt` existant
**Branche A** : `file.txt` supprimé
**Branche B** : `file.txt` modifié

→ **Conflit** : ne peut pas décider automatiquement (Git lui-même demande à l'utilisateur)

#### Cas B : Deux branches suppriment le fichier

**Base** : `file.txt` existant
**Branche A** : `file.txt` supprimé
**Branche B** : `file.txt` supprimé

→ **Pas de conflit** : supprimer silencieusement

#### Cas C : Deux branches modifient identiquement

**Base** : `file.txt = "original"`
**Branche A** : `file.txt = "modified"`
**Branche B** : `file.txt = "modified"`

→ **Pas de conflit** : accepter la modification

### Détection et matérialisation

**Détection** :
```typescript
function hasDeleteModifyConflict(base, ours, theirs) {
  const baseHas = file in base;
  const oursHas = file in ours;
  const theirsHas = file in theirs;
  
  // Suppression vs modification
  if (!oursHas && baseHas && theirsHas && base[file] !== theirs[file]) {
    return 'CONFLICT (delete/modify): file.txt deleted by us, modified by them';
  }
  if (oursHas && baseHas && !theirsHas && base[file] !== ours[file]) {
    return 'CONFLICT (delete/modify): file.txt modified by us, deleted by them';
  }
  
  return null;
}
```

**Matérialisation** (Phase 7+) :

**Option 1 : Marqueurs simples** (similaire aux conflits 3-way)

```
<<<<<<< HEAD
[contenu modifié]
=======
[fichier supprimé]
>>>>>>> feature
```

**Option 2 : Annotation sans marqueurs** (plus proche Git réel)

```
Fichier : deleted by us / modified by them
→ Ne pas écrire de marqueurs ; signaler comme "unmerged" dans l'index
→ L'utilisateur doit manuellement `git add` ou `git rm` pour résoudre
```

**Recommandation Phase 7+** : Option 2 (plus fidèle à Git). Stocker l'état "conflit delete/modify" et afficher un message.

**Message** :
```
CONFLICT (delete/modify): file.txt deleted by us, modified by them.
```

**Stockage** : Exposer dans le snapshot les fichiers "delete/modify en conflit" :
```typescript
snapshot.conflictedFiles?: Array<{
  path: string,
  type: 'content' | 'delete-modify' | 'add-add' | ...
}>
```

**Résolution** :
- `git add file.txt` → accepter la modification (garder le fichier)
- `git rm file.txt` → accepter la suppression (retirer du merge)

## Cas d'erreur

### Criss-cross infini ou deep

**Condition** : `mergeBase` détecte un criss-cross si profond que la récursion dépasse 5 niveaux.

**Comportement** : Interrompre la récursion, utiliser le premier LCA trouvé comme base.

**Message** : (optionnel en Phase 7) Avertissement console, pas d'erreur utilisateur.

**Code de sortie** : Continuer normally (pas de rupture du merge).

### Historique disconnecté

**Condition** : Les deux commits n'ont pas d'ancêtre commun (rare, possible si dépôts fusionnés).

**Comportement** : Traiter comme un "unrelated histories" merge. Git 2.9+ accepte avec `--allow-unrelated-histories` ; Phase 7+ refuse pour l'instant.

**Message d'erreur** (optionnel) :
```
fatal: refusing to merge unrelated histories
```

**Code de sortie** : 1

**Note** : À revoir si jamais on ajoute `clone` et dépôts distants (axe A, Phase 7).

## Critères d'acceptation

### CA-merge-recursive-01 : LCA simple (pas criss-cross)

**Given**
- Repository :
  ```
  C0 ← C1 ← C3 (main/HEAD)
       ↖
        C2 ← C4 (feature)
  ```

**When**
- Exécute `git merge feature`

**Then**
- `exitCode === 0`
- `mergeBase(repo, C3, C4) === C1` (unique LCA)
- Merge 3-way : base=C1, ours=C3, theirs=C4
- Commit de fusion créé (si pas fast-forward)

### CA-merge-recursive-02 : Criss-cross simple — deux LCAs

**Given**
- Repository :
  ```
       C1 ← C3 (main)
      /   ╳
  C0       
      \   ╱
       C2 ← C4 ← C5 (feature)
  ```
  - C1 : modifie `a.txt`
  - C2 : modifie `b.txt`
  - C3 : modifie `c.txt`
  - C4 : modifie `d.txt`
  - C5 : merge résultat
  - LCAs(C3, C5) = {C0} (C0 unique, car C2 ou C1 descendants)

**When**
- Exécute `git merge feature` (depuis main/C3 vers C5)

**Then**
- `exitCode === 0`
- `mergeBase(repo, C3, C5)` retourne C0
- Merge 3-way normal (pas vraiment criss-cross compliqué ici)
- Pas de conflit (a.txt, b.txt, c.txt, d.txt tous distincts)

### CA-merge-recursive-03 : Criss-cross avec M1 (bases multiples)

**Given**
- Repository très stylisée pour criss-cross réel :
  ```
       C1 ← C3 ←─┐
      /   ╳   \  │
  C0       M1 ──→ C5 (feature)
      \   ╱   /
       C2 ← C4
  ```
  - C0 : `a.txt = "a0"`, `b.txt = "b0"`
  - C1 : `a.txt = "a1"`, `b.txt = "b0"`
  - C2 : `a.txt = "a0"`, `b.txt = "b2"`
  - C3 : `a.txt = "a1"`, `b.txt = "b0"`, `c.txt = "c3"`
  - C4 : `a.txt = "a0"`, `b.txt = "b2"`, `d.txt = "d4"`
  - M1 : merge C2 into C3, `a.txt = "a1"`, `b.txt = "b2"` (résolu)
  - C5 : merge C3 into C4, contient `a.txt = "a1"`, `b.txt = "b2"` depuis M1
  
  (En réalité, cette construction est complexe ; on accepte une representation simplifiée)

**When**
- Exécute `git merge feature` (C3 vs C5)

**Then**
- `exitCode === 0`
- `mergeBase(repo, C3, C5)` détecte criss-cross ET retourne C0 ou candidats multiples
- Stratégie récursive appliquée (ou fallback simple)
- Merge 3-way réussi (ou conflit attendu documenté)

### CA-merge-delete-modify-01 : Suppression vs modification

**Given**
- Repository :
  - C0 : `file.txt = "original"`
  - C1 (main) : `file.txt = "modified"`
  - C2 (feature) : `file.txt` supprimé
  - HEAD sur C1

**When**
- Exécute `git merge feature`

**Then**
- `exitCode === 1` (conflit)
- `output` contient `"CONFLICT (delete/modify): file.txt"`
- Fichier `file.txt` ne pas dans `workingTree` (suppression gagne provisoirement)
- OU marqueurs de conflit dans WT (selon implémentation)
- État "merging" activé
- Utilisateur doit `git add file.txt` ou `git rm file.txt` pour résoudre

### CA-merge-delete-modify-02 : Les deux suppriment — pas de conflit

**Given**
- Repository :
  - C0 : `file.txt = "original"`
  - C1 (main) : `file.txt` supprimé
  - C2 (feature) : `file.txt` supprimé

**When**
- Exécute `git merge feature`

**Then**
- `exitCode === 0`
- Pas de conflit
- `file.txt` absent du tree final
- Merge réussi (fast-forward ou commit de fusion)

### CA-merge-delete-modify-03 : Deux modifient identiquement — pas de conflit

**Given**
- Repository :
  - C0 : `file.txt = "original"`
  - C1 (main) : `file.txt = "modified v1"`
  - C2 (feature) : `file.txt = "modified v1"` (identique)

**When**
- Exécute `git merge feature`

**Then**
- `exitCode === 0`
- Pas de conflit
- `file.txt = "modified v1"` dans le tree final

### CA-merge-delete-modify-04 : Deux modifient différemment — conflit de contenu

**Given**
- Repository :
  - C0 : `file.txt = "original"`
  - C1 (main) : `file.txt = "modified a"`
  - C2 (feature) : `file.txt = "modified b"` (différent)

**When**
- Exécute `git merge feature`

**Then**
- `exitCode === 1` (conflit)
- `output` contient `"CONFLICT (content): file.txt"`
- Marqueurs dans WT : `<<<<<<< HEAD ... ======= ... >>>>>>>`
- Pas de "delete/modify" (tous deux modifient, n'est pas une suppression)

## Notes d'implémentation

### Ordre de priorité des stratégies

1. **LCA unique (Phase 4)** : Appliquer directement
2. **Criss-cross léger (2–3 LCAs)** : Fusion virtuelle simple
3. **Criss-cross profond (>5 niveaux)** : Fallback LCA simple avec avertissement

### Récursion et limite

Implémenter un compteur de profondeur pour éviter les boucles infinies :
```typescript
function mergeRecursive(repo, a, b, depth = 0) {
  if (depth > 5) {
    // Fallback : utiliser le premier LCA
    return { baseHash: findFirstLCA(repo, a, b), strategy: 'recursion-limit' };
  }
  // ... reste du code
}
```

### Fusion virtuelle

La fusion "virtuelle" des LCAs ne crée **pas** de commit dans le DAG. Elle compute simplement les trees et les fusionne en mémoire pour obtenir un tree synthétique servant de base.

### Phase 8+ : Criss-cross et remotes

Quand on ajoute les remotes (Phase 8+), les criss-cross deviennent plus courants (plusieurs `fetch/pull` créent naturellement des criss-cross). L'infrastructure Phase 7 les gérera transparemment.

## Dépendances inter-commandes

- Dépend de : `git merge` (Phase 4), `git init`, commits
- Impacte (futur) : `git pull` (Phase 8), `git rebase` (Phase 4+) si criss-cross
- Requiert : `git rm` pour tester delete/modify en boîte noire (spec 43)

## Résumé des changements

| Aspect | Phase 4 | Phase 7+ |
|--------|---------|---------|
| `mergeBase` | Retourne 1 LCA | Identifie multiple LCAs si criss-cross |
| Stratégie 3-way | Base unique | Base synthétique pour criss-cross |
| Conflits delete/modify | Non testables | Documentés, testés après `git rm` |
| Récursion de merge | Aucune | Fusion virtuelle des LCAs |
| Limite récursion | — | Max 5 niveaux |

