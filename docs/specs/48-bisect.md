# Phase 7 (Axe B1) : git bisect

## Résumé

La commande `git bisect` effectue une **recherche dichotomique** dans l'historique pour trouver le premier commit ayant introduit un bug. L'utilisateur classe les commits comme "bon" ou "mauvais", et `git bisect` propose automatiquement un commit médian à tester. Processus itératif jusqu'à la convergence vers le commit fautif.

**Cas d'usage** :
- Identifier le commit précis ayant cassé une fonctionnalité
- Prédéterminé : "ce commit était bon, ce commit est mauvais"
- Apprentissage : visualiser le processus de dichotomie sur le graphe

**Variantes** :
- `git bisect start [<mauvais>] [<bon>]` : initialiser la recherche
- `git bisect bad [<commit>]` : marquer le commit courant (ou un autre) comme mauvais
- `git bisect good [<commit>]` : marquer le commit courant (ou un autre) comme bon
- `git bisect reset` : annuler et restaurer l'état de HEAD avant la recherche
- Message de progression : "Bisecting: N revisions left to test after this (roughly log2 N steps)" (affichage progressif)
- Convergence : "abc1234 is the first bad commit" (ou "bisect found no new commits to test")

## Syntaxe

```
git bisect [start | bad | good | reset] [<commit>]
```

### Commandes supportées en Phase 7

| Commande | Argument | Comportement | Notes |
|----------|----------|-------------|-------|
| `bisect start` | `[<bad>] [<good>]` | Initialise la recherche | Arguments optionnels (défaut : HEAD = bad, ancêtre trouvé = good) |
| `bisect bad` | `[<commit>]` | Marque comme mauvais | Défaut : HEAD courant |
| `bisect good` | `[<commit>]` | Marque comme bon | Défaut : HEAD courant |
| `bisect reset` | (aucun) | Annule et restaure HEAD | Nécessite état bisect actif |

**Remarques** :
- `git bisect run`, `git bisect visualize`, `--no-checkout`, etc. ne sont pas implémentés en Phase 7.
- Phase 7 choisit : **mode interactif seul** (user marque manuellement).

## Concepts fondamentaux

### État de bisect

Quand `bisect start` est appelé, le dépôt entre en "mode bisect". L'état est conservé dans le modèle sous `repo.bisectState`.

```typescript
export interface BisectState {
  /** true si une recherche est en cours */
  active: boolean;
  /** Hash du commit marqué comme mauvais */
  badCommit: string;
  /** Liste des commits marqués comme bons */
  goodCommits: string[]; // au minimum un
  /** Commits déjà testés (classés bon/mauvais) */
  testedCommits: Record<string, "good" | "bad">; // hash → classification
  /** Hash du commit courant à tester (proposé par la dichotomie) */
  currentCandidate: string;
  /** Entier restant à tester (log2(candidates)) */
  remaining: number;
  /** Hash de HEAD avant le bisect (pour restaurer avec reset) */
  originalHead: string;
}
```

### Algorithme de bisect

1. **Initialiser** : marquer les bornes (bon/mauvais)
2. **Itérer** :
   - Calculer l'ensemble des commits candidats (entre bon et mauvais, non encore testés)
   - Sélectionner le médian (par tri topologique, profondeur)
   - Checkout automatique
   - Attendre la classification
3. **Converger** :
   - Quand candidats restants = 1 : « found »
   - Quand candidates = 0 : « no new commits » (bug introduit au-dessus de la borne mauvaise)

### Calcul du candidat médian

**Sélection du commit à tester** :
1. Énumérer tous les commits accessibles depuis "mauvais" mais **pas** depuis "bon"
2. Trier par BFS/profondeur (tri topologique inverse)
3. Choisir le commit qui **minimise le nombre de commits restants** après sa classification
   - Si classé "bon" : combien reste-t-il entre lui et mauvais ?
   - Si classé "mauvais" : combien reste-t-il entre bon et lui ?
   - Choisir celui qui balance ces deux cas

**Simplification Phase 7** :
- Énumérer les candidats
- Utiliser la médiane par indice (candidates[len/2]) ou le commit à profondeur médiane (via tri topologique)
- Moins parfait que Git, mais déterministe et compréhensible

## Comportement nominal

### Cas 1 : Bisect start simple

**Condition** :
- Repository avec historique linéaire : C0 ← C1 ← C2 ← C3 (HEAD, mauvais)
- Savoir que C0 est bon

**Commande** : `git bisect start C3 C0`

**Processus** :
1. Vérifier que C3 et C0 existent
2. Vérifier que C0 est ancêtre de C3 (sinon erreur)
3. Créer `repo.bisectState` :
   ```typescript
   {
     active: true,
     badCommit: C3,
     goodCommits: [C0],
     testedCommits: { C3: "bad", C0: "good" },
     currentCandidate: C1 ou C2 (médian),
     remaining: 1 (log2(2)) ou 2,
     originalHead: <HEAD courant avant bisect>
   }
   ```
4. **Checkout du candidat** : `git checkout C1` (HEAD détaché)
5. **Sortie** :
   ```
   Bisecting: 1 revision left to test after this (roughly 1 step)
   [abc1234] Commit message of C1
   ```
6. **Code de sortie** : 0

### Cas 2 : Bisect sans arguments (HEAD = bad)

**Condition** : `git bisect start` (aucun argument)

**Processus** :
1. Marquer HEAD courant comme mauvais
2. Chercher un ancêtre "bon" : le commit le plus ancien (racine) est supposé bon par défaut
   - Ou parcourir jusqu'à trouver un commit marqué "good" (si aucun : erreur)
3. Initialiser comme Cas 1

**Erreur possible** :
```
fatal: Bisect start without a bad revision given
```

Ou proposer une heuristique intelligente (chercher la branche par défaut, etc.). Phase 7 choisit : **exiger au minimum un argument** (bad) ou les deux.

### Cas 3 : Marquer comme bon / mauvais

**Condition** : En mode bisect, utilisateur teste le commit proposé

**Commandes** :
- `git bisect good` → le commit courant est bon
- `git bisect bad` → le commit courant est mauvais

**Processus pour `git bisect good`** :
1. Vérifier que `repo.bisectState.active === true`
2. Récupérer HEAD courant : `currentHash`
3. Ajouter à `bisectState.testedCommits[currentHash] = "good"`
4. Mettre à jour `goodCommits` si ce n'est pas déjà dedans
5. **Recalculer les candidats** :
   - Énumérer commits entre `badCommit` et tous les `goodCommits`
   - Exclure les commits déjà testés et classés
   - Sélectionner le médian
6. **Si aucun candidat** :
   - Le commit courant est le premier mauvais
   - Message : `<hash> is the first bad commit`
   - Arrêter (mais garder `bisectState.active = true` pour que user puisse faire `git bisect reset`)
   - Code de sortie : 0
7. **Sinon** :
   - Checkout du nouveau candidat
   - Afficher la progression : `Bisecting: N revisions left...`
   - Code de sortie : 0

**Identique pour `git bisect bad`** (même logique, mais ajoute à `badCommit` ou liste de candidats mauvais).

### Cas 4 : Convergence

**Condition** : Après plusieurs classifications, l'ensemble des candidats se réduit à 1

**Processus** :
1. Après marquer un commit, calculer les candidats restants
2. Si `candidats.length === 1` :
   - Le candidat restant est le premier mauvais
   - Message :
     ```
     <hash> is the first bad commit
     commit <fullHash>
     Author: ...
     Date: ...
       <commit message>
     ```
   - Code de sortie : 0
   - `bisectState.active = true` (user peut `reset`)

### Cas 5 : Bisect reset

**Condition** : `git bisect reset` (en mode bisect)

**Processus** :
1. Vérifier que `bisectState.active === true`
2. Restaurer HEAD à `bisectState.originalHead`
3. Nettoyer `bisectState` (ou marquer `active = false`)
4. **Sortie** : `Previous HEAD position was <hash>... Switched to branch <branch>` (ou idem pour HEAD détaché)
5. **Code de sortie** : 0

### Cas 6 : Bisect avec historique non-linéaire

**Condition** : DAG avec merges. Chercher parmi un sous-graphe (bad ancêtre, good dans un branch divergent)

**Processus** : Complexe. Phase 7 peut simplifier :
- Accepter les merges (ne pas les refuser)
- Utiliser BFS pour énumérer (pas de parcours spécialisé)
- Candidat médian = celui à mi-profondeur BFS

## Cas d'erreur

### Bisect non initialisé

**Condition** : `git bisect good` quand aucun `bisect start` n'a été exécuté

**Message d'erreur** :
```
fatal: no bisect started
```

**Code de sortie** : 128

**Comportement** : Aucune modification.

### Arguments invalides à start

**Condition** : `git bisect start C1 C2` où C2 n'est pas ancêtre de C1

**Message d'erreur** :
```
fatal: Bad bisect terms: <good> is not an ancestor of <bad>
```

**Code de sortie** : 128

**Comportement** : `bisectState.active` reste false.

### Commit inexistant

**Condition** : `git bisect good <hash>` où `<hash>` n'existe pas

**Message d'erreur** :
```
fatal: ambiguous argument '<hash>': unknown revision
```

**Code de sortie** : 128

**Comportement** : Aucune modification.

### Aucun bon commit

**Condition** : `git bisect start C3 C0` mais c'est C3 qui est bon et C0 qui est mauvais

**Détection** : Après un marquage, si aucun commit candidat subsiste et on a jamais marqué une borne comme "good"

**Message d'erreur** :
```
fatal: bisect found no new commits
```

**Code de sortie** : 0 (pas vraiment une erreur ; information)

## Critères d'acceptation

### CA-bisect-01 : Start simple avec deux bornes

**Given**
- Repository : C0 ← C1 ← C2 ← C3 (HEAD)

**When**
- Exécute `git bisect start C3 C0`

**Then**
- `exitCode === 0`
- `repo.bisectState.active === true`
- `repo.bisectState.badCommit === C3`
- `repo.bisectState.goodCommits` contient C0
- `repo.bisectState.currentCandidate` est C1 ou C2 (médian)
- HEAD détaché sur le candidat
- `output[0]` contient "Bisecting"

### CA-bisect-02 : Marquer comme bon

**Given**
- Bisect en cours, HEAD sur le candidat C1
- C0 est bon, C3 est mauvais

**When**
- Exécute `git bisect good`

**Then**
- `exitCode === 0`
- `repo.bisectState.testedCommits[C1] === "good"`
- HEAD bascule sur nouveau candidat (C2)
- `output[0]` contient "Bisecting"

### CA-bisect-03 : Marquer comme mauvais

**Given**
- Bisect en cours sur C1

**When**
- Exécute `git bisect bad`

**Then**
- `exitCode === 0`
- `repo.bisectState.testedCommits[C1] === "bad"`
- HEAD bascule sur nouveau candidat
- `output[0]` contient "Bisecting"

### CA-bisect-04 : Convergence vers le premier mauvais

**Given**
- Bisect C0 (bon) ← C1 (bon, marqué) ← C2 (mauvais)
- Seulement C2 reste candidat

**When**
- Exécute `git bisect bad` sur C2

**Then**
- `exitCode === 0`
- `output[0]` contient "is the first bad commit"
- `output` contient le hash complet de C2
- `output` contient le message du commit
- `repo.bisectState.active === true`

### CA-bisect-05 : Reset après bisect

**Given**
- Bisect terminé (premier mauvais trouvé)
- Original HEAD avant bisect = C3

**When**
- Exécute `git bisect reset`

**Then**
- `exitCode === 0`
- HEAD restauré à C3
- `repo.bisectState.active === false`
- `output[0]` contient le message de retour (branche ou hash)

### CA-bisect-06 : Bisect non initialisé

**Given**
- Repository sans bisect actif

**When**
- Exécute `git bisect good`

**Then**
- `exitCode === 128`
- `errors[0]` contient "no bisect started"
- Aucune modification

### CA-bisect-07 : Bornes invalides (good pas ancêtre de bad)

**Given**
- Repository : C0 ← C1, C0 ← C2 (branches divergentes)

**When**
- Exécute `git bisect start C1 C2` (C2 pas ancêtre de C1)

**Then**
- `exitCode === 128`
- `errors[0]` contient "is not an ancestor"
- `repo.bisectState.active === false`

### CA-bisect-08 : Commit inexistant lors de start

**Given**
- Repository avec commits existants

**When**
- Exécute `git bisect start nonexistent C0`

**Then**
- `exitCode === 128`
- `errors[0]` contient "unknown revision"

### CA-bisect-09 : Bisect avec plus de 3 commits

**Given**
- Repository linéaire : C0 ← ... ← C7 (HEAD)
- Savoir que C1 est bon, C7 est mauvais

**When**
- Exécute `git bisect start C7 C1` (6 commits entre)

**Then**
- `exitCode === 0`
- `repo.bisectState.remaining > 0` (log2(6) ≈ 3)
- `repo.bisectState.currentCandidate` situé vers le milieu (C4 ou C5)

### CA-bisect-10 : Bisect et révisions HEAD~n

**Given**
- Repository : C0 ← C1 ← C2 ← C3 (HEAD)

**When**
- Exécute `git bisect start HEAD HEAD~3`

**Then**
- `exitCode === 0`
- Bisect démarre avec HEAD (C3) = bad, C0 = good

### CA-bisect-11 : Marquer un commit autre que HEAD

**Given**
- Bisect en cours, HEAD détaché sur C2

**When**
- Exécute `git bisect good C1` (pas HEAD)

**Then**
- `exitCode === 0`
- `repo.bisectState.testedCommits[C1] === "good"` (non HEAD)
- HEAD reste sur C2 (ou bascule au prochain candidat)

### CA-bisect-12 : Affichage progression (roughement log2 N)

**Given**
- Bisect C0 ← ... ← C31 (32 commits)

**When**
- Exécute `git bisect start C31 C0`

**Then**
- `output[0]` contient "Bisecting: X revisions left"
- X devrait être ≈ 16 (après la première dichotomie)
- Chaque marque (good/bad) réduit N de moitié

## Décisions de conception (Phase 7)

| Aspect | Décision |
|--------|----------|
| **Sélection du candidat médian** | Énumération topologique + médiane par indice ; déterministe |
| **Historique non-linéaire** | Accepter les merges ; utiliser BFS pour énumérer |
| **Mode interactif seul** | Pas de `--run` ou mode automatisé |
| **Format de convergence** | "X is the first bad commit" + affichage complet du commit |
| **Restauration HEAD** | Après `reset`, retrouver la branche/hash original |
| **Reflog** : Optionnel : tracker les bisect ops dans le reflog (déjà en place par `checkout`/`reset`) |
| **Snapshot exposé** | `snapshot.bisectState` (optionnel : affichage UI, barre de progression) |

## Modèle de données

### Repository (extension)

```typescript
export interface Repository {
  // ... champs existants
  bisectState?: BisectState;
}

export interface BisectState {
  /** true si une recherche est en cours */
  active: boolean;
  /** Hash du commit marqué comme mauvais */
  badCommit: string;
  /** List des commits marqués comme bons */
  goodCommits: string[];
  /** Commits déjà classés */
  testedCommits: Record<string, "good" | "bad">;
  /** Hash du commit proposé à tester */
  currentCandidate: string;
  /** Entier approximatif restant (log2) */
  remaining: number;
  /** Hash de HEAD avant bisect (pour reset) */
  originalHead: string;
}
```

### RepoSnapshot (extension)

```typescript
export interface RepoSnapshot {
  // ... champs existants
  /** État de bisect (optionnel pour l'UI : affichage barre progression) */
  bisectState?: BisectState;
}
```

## Résumé des changements

| Fichier | Changement |
|---------|-----------|
| `src/core/model.ts` | Ajouter `BisectState`, étendre `Repository` avec `bisectState` |
| `src/core/repository.ts` | Helpers : `selectBisectCandidate(repo, badCommit, goodCommits, testedCommits)`, `enumerateCandidates(...)` (BFS/topologique) |
| `src/core/commands/bisect.ts` | **Nouveau fichier** : implémenter `cmdBisectStart`, `cmdBisectGood`, `cmdBisectBad`, `cmdBisectReset` |
| `src/core/engine.ts` | Route `bisect` et sous-commandes |
| Tests | Couvrir `48-bisect.md` CA-* |

## Notes d'implémentation

### Sélection du candidat médian

Approche simple et déterministe :

```typescript
function selectBisectCandidate(
  repo: Repository,
  badCommit: string,
  goodCommits: string[],
  testedCommits: Record<string, "good" | "bad">
): string | null {
  // Énumérer tous les commits accessibles depuis bad
  // mais non accessibles depuis aucun good
  const candidates = enumerateCandidates(repo, badCommit, goodCommits);
  
  // Exclure les commits déjà testés
  const remaining = candidates.filter(h => !testedCommits[h]);
  
  if (remaining.length === 0) return null; // Convergence
  if (remaining.length === 1) return remaining[0];
  
  // Retourner le médian
  return remaining[Math.floor(remaining.length / 2)];
}
```

### Énumération des candidats

Utiliser BFS depuis `badCommit`, en arrêtant au niveau des `goodCommits` :

```typescript
function enumerateCandidates(
  repo: Repository,
  badCommit: string,
  goodCommits: string[]
): string[] {
  const goodSet = new Set(goodCommits);
  const visited = new Set<string>();
  const queue = [badCommit];
  const candidates: string[] = [];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    
    // Inclure current, sauf s'il est dans goodSet (lui-même pas inclus)
    if (!goodSet.has(current)) {
      candidates.push(current);
    }
    
    // Ajouter les parents, sauf les "good" commits
    const commit = getCommit(repo, current);
    for (const parent of commit.parents) {
      if (!visited.has(parent) && !goodSet.has(parent)) {
        queue.push(parent);
      }
    }
  }
  
  return candidates;
}
```

### Calcul du nombre restant

Approximation simple : `Math.ceil(Math.log2(remaining.length))` = nombre d'étapes attendues.

### Affichage du commit trouvé

À la convergence :

```
abc1234 is the first bad commit
commit abc123456789def1234567890def1234567890
Author: Unnamed <unnamed@example.com>
Date:   Mon Jun 9 12:00:00 2025 +0000

    Commit message here
```

Utiliser les mêmes helpers que `git log` pour formater.

---

## Valeur pédagogique

Le bisect **visualise la dichotomie** : on voit le graphe se "réduire" au fur et à mesure. Idéal pour :
- Comprendre la recherche binaire appliquée au contrôle de version
- Déboguer un bug sans le code source complet (tester localement)
- Apprendre l'historique non-linéaire (merges dans le processus de bisect)
