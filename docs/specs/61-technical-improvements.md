# Phase 7 (Axe B4) – Améliorations techniques : Tests, memoïsation, robustesse

## Contexte et motivation

Le projet a livré les phases 0–6 avec ~691 tests Vitest passants et une architecture stable (séparation core↔UI).
Cette phase consolide les **dettes techniques** identifiées en phase 6, archi-review phases 3–5, et les demandes de robustesse croisées.
Les améliorations ciblent cinq domaines : testabilité composants Vue, performance du graphe (memoïsation + discriminants), autocomplétion casse mixte, virtualisation pour gros DAG, et mutualisation des tokenizers.

**Invariants maintenus** :
- Toute sémantique Git reste dans `src/core/` (TS pur, testable headless).
- L'UI (store + composants) ne fait que parser/rendre l'état.
- Déterminisme : pas de `Date.now()` / `Math.random()`.
- Pas de régression des ~691 tests existants.
- Strict TS (`noUnusedLocals`, `noUnusedParameters`).

---

## 1. Tests composants Vue (`@vue/test-utils`)

### Contexte / Problème

- `RefsSidebar.vue`, l'intégration Tab de `TerminalPanel.vue`, et le futur split-screen n'ont **pas de tests automatisés**.
- `@vue/test-utils` n'est **pas installé** dans `devDependencies`.
- Ces composants ont été **relus en phase 6** (revue manuelle) mais reste non couvert par CI.
- Les futures phases (7–9 : dépôt distant, split-screen) ajouteront de la complexité ; sans tests, les régressions seront inévitables.

### Comportement / Cible

- **Installation** : Ajouter `@vue/test-utils` + adaptateur JSDOM (déjà présent) au `package.json`.
- **Fichiers de test** : Créer (au minimum) :
  - `tests/components/RefsSidebar.test.ts` : rendu de la liste des branches, HEAD courant, tags, opération en cours (merge/rebase), sidebar état vide.
  - `tests/components/TerminalPanel-autocomplete.test.ts` : intégration Tab → `autocomplete()` + affichage candidats, complétion unique, aucun candidat.
  - `tests/components/TerminalPanel-history.test.ts` : ↑/↓ dans l'historique de commandes, édition inline.
- **Couverture minimale** : chaque composant testé sur ses cas d'usage principaux (rendu, interactions, limites).
- **Framework** : Vitest + `@vue/test-utils` (mêmes conventions que les tests headless existants).

### Invariants

- Les tests **ne doivent pas tester la logique Git** (celle-ci est déjà couverte dans `tests/engine.test.ts` et `tests/commands/*.test.ts`).
- Les tests se concentrent sur **rendu Vue** (props, events, réactivité Pinia), **parsing d'input** (xterm), **interactions UI** (clics, focus).
- Les composants ne doivent **pas importer de logique core** au-delà du store (`useRepoStore()`) et des types.

---

## 2. Mémoïsation et discriminant `kind` des badges (GraphView)

### Contexte / Problème (dette Phase 3)

**Perf** : 
- `getNodeBadges(node)` appelé **2 fois par badge** (une fois pour renderr, une fois pour hover/event).
- `layout.edges.filter()` + `.find()` en O(E·N) à chaque render pour calculer `getEdgeColor`.
- Pas de précalcul en `computed` ou Map.

**Maintenabilité** :
- Badges typés par **comparaison de couleur hex** (fragile, `if (color === '#fff')` pour détecter HEAD).
- Impossible de différencier `remote/*` (futur phase 9) visuellement.
- Absence de champ discriminant `kind`.

### Comportement / Cible

1. **Ajouter un champ `kind`** au type `Badge` (ou créer `interface Badge { kind: 'head' | 'branch' | 'tag' | 'remote'; label: string; color: string; bgColor: string; }`).
   - `'head'` : badge HEAD (blanc / noir).
   - `'branch'` : branche locale (bleu clair).
   - `'tag'` : tag (jaune).
   - `'remote'` : ref de suivi distant (gris / cyan, réutilisé en phase 9).

2. **Précalculer en `computed`** :
   - Fonction pure `computeNodeBadges(node: SnapshotCommit, ...): Badge[]` extraite.
   - Memoïser en `computed` : `badgesByHash: computed(() => Map<hash, Badge[]>)`.
   - Idem pour couleurs d'arêtes : `edgeColorMap: computed(() => Map<fromHash, color>)`.

3. **Refactoriser le template** :
   - Boucler sur `badgesByHash.get(node.hash)` (lookup O(1)).
   - Boucler sur `edgeColorMap.get(edge.fromHash)` pour colorer l'arête.

4. **Invariant** : Pas de changement de comportement visuel ; uniquement optimisation perf + clarification de type.

---

## 3. Fix autocomplétion casse mixte

### Contexte / Problème (dette Phase 6)

- **Symptôme** : Branche nommée `Feature` (majuscule) ; utilisateur tape `fe` puis Tab → candidat affiché `Feature`, mais complété comme `ature` (la casse du candidat original).
- **Cause** : `singleCompletion()` utilise `candidate.slice(prefix.length)` (suffixe).
  - Avec préfixe `"fe"` (minuscule) et candidat `"Feature"`, on retourne `"ature"` (manque le `F` majuscule).
- **Impact** : Les refs en casse mixte sont mal complétées.

### Comportement / Cible

1. **Nouvelle stratégie** : Remplacer le dernier **token entier** par le candidat complet.
   - Au lieu de : `"git checkout fe" + "ature"` → `"git checkout feature"`
   - Faire : `"git checkout fe"` → retirer `"fe"` → ajouter `"Feature"` → `"git checkout Feature"`

2. **Implémentation** :
   - Dans `singleCompletion()` ou une helper dédiée : localiser le dernier token dans l'input.
   - Retourner la **chaîne de remplacement complète** (le candidat), PAS un suffixe.
   - `TerminalPanel` utilise cette chaîne pour remplacer le dernier token via une fonction `replaceLastToken(input, replacement)`.

3. **Invariant** : 
   - Candidat unique → complète entièrement (casse préservée du candidat).
   - Candidats multiples → liste affichée, pas de modification input.
   - Le filtre reste insensible à la casse (`ref.toLowerCase().startsWith(prefix.toLowerCase())`).

---

## 4. Performance gros DAG : virtualisation / culling SVG

### Contexte / Problème

- **Symptôme** : Repository avec >1000 commits → SVG rendu avec TOUS les nœuds/arêtes → performance dégradée (lag pan/zoom).
- **Cause** : Pas de virtualisation du SVG (tout ce qui n'est pas dans le viewport est quand même rendu).
- **Impact** : Mauvaise UX sur gros historiques.

### Comportement / Cible

1. **Virtualisation / Culling** :
   - Calculer la **bounding box du viewport** (en coordonnées logiques du graphe, après pan/zoom).
   - Filtrer les nœuds / arêtes : ne rendre que ceux visibles (+ marge de buffer ~20% pour smoothness au scroll).
   - Arêtes : exclure celles dont les deux extrémités sont hors viewport.

2. **Implémentation** :
   - Helper pur `culledLayout(layout: GraphLayout, viewport: {x, y, width, height}, zoom, pan): CulledLayout` qui retourne nodes/edges filtrés.
   - `computed` dans `GraphView.vue` : `renderedLayout = computed(() => culledLayout(...))`.
   - Template : boucle sur `renderedLayout.nodes` et `renderedLayout.edges` au lieu de `layout.nodes/edges`.

3. **Seuil activateur** (optionnel) :
   - Si `layout.nodes.length < 100` : sauter le culling (overhead non justifié).
   - Si `layout.nodes.length >= 100` : activer culling.

4. **Invariant** :
   - Pas de changement du layout lui-même (l'algo `computeLayout` reste pur).
   - Pas de modification des coordonnées (culling ne fait que filtrer).
   - Pan/zoom continue à fonctionner ; le viewport se met à jour réactivement.

---

## 5. Reflog des créations de branches / tags

### Contexte / Problème (dette Phase 5)

- **Symptôme** : `git branch foo` crée la branche mais n'écrit **pas d'entrée reflog**.
- **Cause** : `cmdBranch`, `cmdTag` créent la ref mais n'appellent pas `recordReflogEntry()` du dépôt.
- **Impact** : 
  - Le reflog est incomplet ; impossible de naviguer vers l'ancien commit si on change de branche.
  - Incohérence : `git checkout` enregistre un reflog entry, `git branch -d` aussi, mais la création ne le fait pas.

### Comportement / Cible

1. **Enregistrement reflog à la création** :
   - `git branch <name> [<commit>]` : écrire une entrée reflog au moment où la ref est créée.
     - Message suggéré : `"branch: Created from <short-hash>"` ou `"branch: Created at <short-hash>"`.
   - `git tag <name> [<commit>]` : idem.
   - `git tag -d <name>` : enregistrer un reflog pour la suppression.

2. **Format du reflog** (cohérent avec Phase 5) :
   - Entrée : `{ action: 'branch', ref: 'main', oldHash: null, newHash: <hash>, message: 'Created from <short>' }`.
   - Ou : `{ action: 'create', ref: 'main', ... }` (dépend de l'enum `ReflogAction` existant).

3. **Invariant** :
   - Pas de changement du comportement existant ; uniquement ajout d'entrées reflog.
   - Reflog doit rester immuable une fois écrit (pas de modification rétroactive).

---

## 6. Mutualisation des tokenizers

### Contexte / Problème (dette Phase 6)

Le projet contient **plusieurs tokenizers divergents** :

1. `src/core/parser.tokenize(input)` — guillemets doubles, pas d'échappements.
2. `src/utils/autocomplete.tokenizeInput(input)` — guillemets doubles, pas d'échappements (redondant avec parser).
3. `src/core/commands/commit.ts` — parsing positionnel `indexOf('-m')` (fragile, peut croiser des guillemets).
4. `src/utils/shell.ts` (si existe) — parsing ad-hoc pour chaînes de commandes.

**Problèmes** :
- Guillemets simples `'...'` non gérés (diverge du parsing git).
- Échappements `\"` non gérés.
- Guillemet non fermé avalé silencieusement.
- Code dupliqué → maintenance difficile.

### Comportement / Cible

1. **Créer un tokenizer unique** : `src/core/tokenizer.ts` (ou étendre `src/core/parser.ts`).
   - Export fonction pure `tokenize(input, options?): Token[]` où `Token = { value: string; type: 'literal' | 'quoted' | 'flag' }`.
   - Gère : guillemets doubles ET simples, échappements `\"` et `\'`, détecte guillemets non fermés (erreur ou warning).

2. **Options** :
   - `allowSingleQuotes: true` (défaut false pour compatibilité).
   - `allowEscapes: true` (défaut false).
   - `strict: true` (erreur sur guillemet non fermé ; défaut false = avalé).

3. **Consolidation** :
   - `src/core/parser.tokenize()` → délègue à `tokenizer.tokenize(input, {allowSingleQuotes: false, strict: false})`.
   - `src/utils/autocomplete.tokenizeInput()` → réutilise le même.
   - `src/core/commands/commit.ts` → utilise le tokenizer (évite le parsing positionnel fragile).

4. **Invariant** :
   - Pas de changement de sémantique pour les inputs existants (guillemets doubles, pas d'échappements).
   - Futures phases (axe A, B1) peuvent utiliser l'option `allowEscapes: true` pour des cas avancés.
   - Tests : `tests/tokenizer.test.ts` (cas nominaux + edges : guillemets mixtes, échappements, guillemet non fermé).

---

## 7. Consolidation et séquençage

### Frontière core ↔ UI

- **1–3, 5–6** (improvements 1, 3, 5, 6) : Transforment `src/core/`, `src/utils/`, `tests/`.
- **2, 4** (improvements 2, 4) : Transforment `src/components/GraphView.vue`, `src/graph/`.
- Aucune fuite de logique Git dans les composants.

### Dépendances inter-items

- **Item 2 (badges `kind`)** dépend légèrement de **item 1** (structure Type `Badge` à définir).
- **Item 3 (fix casse)** indépendant (amélioration isolée du `utils/autocomplete.ts`).
- **Item 4 (virtualisation)** indépendant (purement `GraphView.vue` + helper pur).
- **Item 5 (reflog)** indépendant (amélioration `commands/branch.ts`, `commands/tag.ts`).
- **Item 6 (tokenizer)** indépendant (création nouveau module, consolidation progressive).

### Réalisation en parallèle possible

Phases 1–3 développables en parallèle : tests, graphe memoïsé, autocomplétion casse.
Phases 4–6 légèrement moins liées : performance, reflog, tokenizer (peuvent démarrer indépendamment).

---

## Critères d'acceptation

### Item 1 — Tests composants (`@vue/test-utils`)

**CA-tests-01 : Installation et configuration**
- [ ] `@vue/test-utils` ajouté à `devDependencies` (version compatible Vue 3).
- [ ] Adaptateur JSDOM configuré (déjà présent via jsdom + vitest).
- [ ] `npm test` continue de passer (aucune régression).

**CA-tests-02 : RefsSidebar.test.ts — Rendu basique**
- [ ] Composant monte sans erreur.
- [ ] Liste des branches rendue (chaque élément du snapshot).
- [ ] Branche courante marquée visuellement (en gras, couleur distincte, ou symbole).
- [ ] Aucun contenu Git dans le test (logique testée ailleurs).

**CA-tests-03 : RefsSidebar.test.ts — Cas limites**
- [ ] Dépôt non initialisé → placeholder ou liste vide.
- [ ] HEAD détaché → badge "HEAD (détaché)" visible.
- [ ] Opération en cours (merge/rebase) → boutons Continuer/Annuler visibles.
- [ ] Stash non vide → section stash affichée avec count.

**CA-tests-04 : TerminalPanel-autocomplete.test.ts — Intégration Tab**
- [ ] Utilisateur tape `git ch[Tab]` → candidats listés (ou complétés si 1).
- [ ] Événement `Tab` capturé (pas refusé par le navigateur).
- [ ] `autocomplete()` appelée avec input courant + catalog + snapshot.
- [ ] Résultat (candidates, completion) affiché dans le terminal sans erreur.

**CA-tests-05 : TerminalPanel-autocomplete.test.ts — Aucun candidat**
- [ ] Input invalide → pas de candidat proposé, pas de crash.
- [ ] Utilisateur peut continuer à taper normalement.

**CA-tests-06 : TerminalPanel-history.test.ts — Navigation**
- [ ] Utilisateur tape `git init`, ↑ récupère la dernière commande.
- [ ] ↑ / ↓ navigue avant/arrière dans l'historique.
- [ ] Édition inline pendant la navigation (ex. ↑ ramène "git init", utilisateur modifie → "git init foo").
- [ ] ↑ + ↓ jusqu'au bout → retour à la ligne vide.

**CA-tests-07 : Tests sans imports core logique**
- [ ] Aucun `import * from '@/core/commands'` dans les tests composants.
- [ ] Aucune logique Git testée (ex. pas de `expect(repo.refs)` sur les effets Git).
- [ ] Focus sur l'interaction Vue (rendu, events, props).

### Item 2 — Memoïsation et `kind` des badges

**CA-graphmemo-01 : Type Badge avec `kind`**
- [ ] Nouveau type `interface Badge { kind: 'head' | 'branch' | 'tag' | 'remote'; ... }` défini (dans `src/graph/types.ts` ou nouveau fichier).
- [ ] TypeScript strict : aucun `// @ts-ignore`.
- [ ] Utilisé dans `GraphView.vue` pour typer les éléments du template.

**CA-graphmemo-02 : Computed badgesByHash**
- [ ] Fonction pure `computeNodeBadges(node, headHash, allBranches, tags)` créée et exportée.
- [ ] Computed `badgesByHash: computed(() => Map<string, Badge[]>)` dans GraphView (réactif, memoïsé par Vue).
- [ ] Appel une fois par node par render, pas 2×.

**CA-graphmemo-03 : Template utilise badgesByHash**
- [ ] Boucle v-for refactorisée : `for badge in badgesByHash.get(node.hash) ?? []`.
- [ ] Accès à `badge.kind` pour styler (pas comparaison de couleur hex).
- [ ] Pas d'appel `getNodeBadges(node)` dans le template.

**CA-graphmemo-04 : Computed edgeColorMap (optionnel mais recommandé)**
- [ ] Si `getEdgeColor()` appelée >100 fois/render sur un gros graphe : créer `edgeColorMap`.
- [ ] Map précalculé en `computed()` : `{fromHash → color}`.
- [ ] Template : `edge.color = edgeColorMap.get(edge.fromHash) ?? '#999'` (O(1) lookup).

**CA-graphmemo-05 : Pas de changement visuel**
- [ ] Couleurs des badges identiques avant/après.
- [ ] Layout du graphe identique (même position, même arêtes).
- [ ] Snapshot 691 tests existants continue de passer.

**CA-graphmemo-06 : Performance améliorée**
- [ ] Profil avant/après sur 500+ commits : temps de render réduit (~30–50% si lourds avant).
- [ ] Pan/zoom fluidité améliorée.

### Item 3 — Fix autocomplétion casse mixte

**CA-autocase-01 : Nouvelle helper `replaceLastToken()`**
- [ ] Fonction pure `replaceLastToken(input: string, replacement: string): string`.
- [ ] Localise le dernier token (après tokenisation).
- [ ] Retourne input avec le dernier token remplacé par le replacement complet.
- [ ] Testée : `replaceLastToken("git checkout fe", "Feature")` → `"git checkout Feature"`.

**CA-autocase-02 : `singleCompletion()` retourne candidat complet**
- [ ] Modifiée pour retourner le candidat complet (string) au lieu du suffixe.
- [ ] Signature : `singleCompletion(prefix, candidates): string` (le candidat lui-même si 1, sinon "").
- [ ] Utilisée dans `autocomplete()` pour déterminer le candidat à compléter.

**CA-autocase-03 : Integration dans TerminalPanel**
- [ ] `TerminalPanel.vue` utilise `replaceLastToken(input, completion)` pour insérer le candidat.
- [ ] Complétion unique de `fe` → `Feature` maintient la casse.
- [ ] Pas de régression : complétion multiple, aucun candidat, commandes restent inchangées.

**CA-autocase-04 : Test casse mixte**
- [ ] Branch `Feature`, input `git checkout fe[Tab]` → complète en `git checkout Feature`.
- [ ] Branch `develop`, input `git checkout dev[Tab]` → complète en `git checkout develop`.
- [ ] Filter insensible à la casse (ex. `fe` = `Fe` = `FE` = `fE` pour filtrer), mais candidat gardé dans sa casse.

**CA-autocase-05 : Filtrage insensible à la casse**
- [ ] `autocomplete(..., input="git checkout FE")` → candidats avec `.toLowerCase().startsWith("fe")`.
- [ ] Pas de impact sur la logique du filtre (reste insensible).

**CA-autocase-06 : Pas de régression**
- [ ] Autocomplétion commandes, flags, refs en minuscule continuent à marcher.
- [ ] Test autocomplete existant passe.

### Item 4 — Performance gros DAG : virtualisation

**CA-perf-01 : Helper culledLayout**
- [ ] Fonction pure `culledLayout(layout, viewport, zoom, pan): CulledLayout` créée et testée.
- [ ] Prend en entrée un `GraphLayout` et un `viewport: {x, y, width, height}`.
- [ ] Retourne `CulledLayout` avec `nodes` et `edges` filtrés (visible + buffer 20%).
- [ ] Invariant : pas d'arêtes vers/de nœuds hors viewport.

**CA-perf-02 : Computed renderedLayout dans GraphView**
- [ ] `computed(() => culledLayout(layout, {x, y, width, height}, zoom, pan))`.
- [ ] Viewport calculé en fonction du pan/zoom courant.
- [ ] Memoïsé (réactif, pas de recalcul si pan/zoom inchangé).

**CA-perf-03 : Template rendu sur renderedLayout**
- [ ] v-for sur `renderedLayout.nodes` au lieu de `layout.nodes`.
- [ ] v-for sur `renderedLayout.edges` au lieu de `layout.edges`.
- [ ] Pas de changement visuel pour petits graphes (<100 commits).

**CA-perf-04 : Seuil (optionnel)**
- [ ] Si `layout.nodes.length < 100` : culling saute (return layout as-is).
- [ ] Si >= 100 : culling actif.
- [ ] Seuil configurable via `LayoutOptions` ou constante.

**CA-perf-05 : Pan/zoom inchangés**
- [ ] Événements souris (wheel, drag) continuent à fonctionner.
- [ ] Coords logiques pan/zoom identiques (culling ne change rien).
- [ ] Zoom 0.1x–5x continue à fonctionner.

**CA-perf-06 : Performance mesurable**
- [ ] Gros graphe (1000+ commits) : FPS pan/zoom amélioré (target >= 30 FPS).
- [ ] Temps de render initial réduit (~50–70% moins de nœuds/arêtes si grande majorité hors viewport).

### Item 5 — Reflog des créations de branches / tags

**CA-reflog-01 : Branch creation enregistre reflog**
- [ ] `git branch foo` crée la branche.
- [ ] Une entrée reflog est écrite : ex. `{ action: 'branch', ref: 'foo', oldHash: null, newHash: <hash>, message: 'branch: Created' }`.
- [ ] Entry visible via `git reflog` (futur, ou debug inspect).

**CA-reflog-02 : Tag creation enregistre reflog**
- [ ] `git tag v1.0` crée le tag.
- [ ] Une entrée reflog est écrite (même format).
- [ ] Entry visible via reflog.

**CA-reflog-03 : Tag deletion enregistre reflog**
- [ ] `git tag -d v1.0` supprime le tag.
- [ ] Entrée reflog écrite avec `newHash: null` (ou oldHash = ancien hash).
- [ ] Symétrique : création/suppression sont tracées.

**CA-reflog-04 : Format coherent avec Phase 5**
- [ ] Enum `ReflogAction` utilisé correctement (ajouter 'branch-create', 'tag-create' si absent).
- [ ] Ou réutiliser 'branch'/'tag' existant avec context 'created'.
- [ ] Pas de changement du snapshot.reflog existant (uniquement ajout d'entrées).

**CA-reflog-05 : Pas de régression**
- [ ] `git branch` toujours crée une branche.
- [ ] `git tag` toujours crée un tag.
- [ ] Comportement logique identique (uniquement reflog amélioré).
- [ ] Tests reflog/stash existants (~50 tests) passent.

**CA-reflog-06 : Edge cases**
- [ ] `git branch foo <commit-hash>` (création sur commit spécifique) → reflog avec ce hash.
- [ ] `git branch -d` (suppression existante) → reflog enregistré correctement (déjà fait en Phase 5).

### Item 6 — Mutualisation des tokenizers

**CA-tokenizer-01 : Module src/core/tokenizer.ts crée**
- [ ] Nouveau fichier `src/core/tokenizer.ts` (ou extension `src/core/parser.ts`).
- [ ] Export fonction `tokenize(input: string, options?: TokenizeOptions): string[]` (pour compatibilité) ou `Token[]`.
- [ ] TypeScript strict, aucun any.

**CA-tokenizer-02 : Guillemets doubles + simples (optionnel)**
- [ ] Option `allowSingleQuotes: boolean` (défaut false).
- [ ] Avec `false` (défaut) : `'hello'` → token `"'hello'"` (littéral, pas des guillemets).
- [ ] Avec `true` : `'hello'` → token `"hello"` (traité comme guillemets).

**CA-tokenizer-03 : Échappements (optionnel)**
- [ ] Option `allowEscapes: boolean` (défaut false).
- [ ] Avec `true` : `\"hello\"` → token `"hello"` (guillemets échappés consommés).
- [ ] Avec `false` (défaut) : `\"hello\"` → token `"\\"hello\\""` (littéral).

**CA-tokenizer-04 : Guillemets non fermés**
- [ ] Option `strict: boolean` (défaut false).
- [ ] Avec `false` (défaut) : `git commit -m "unclosed` → token `"unclosed"` avalé silencieusement.
- [ ] Avec `true` : même input → erreur retournée (`TokenizeError`).

**CA-tokenizer-05 : Consolidation parser.tokenize()**
- [ ] `src/core/parser.tokenize()` délègue à `tokenizer.tokenize(input, {allowSingleQuotes: false, strict: false})`.
- [ ] Comportement identique avant/après (tests parser ne changent pas).

**CA-tokenizer-06 : Consolidation autocomplete.tokenizeInput()**
- [ ] `src/utils/autocomplete.tokenizeInput()` → réutilise `tokenizer.tokenize()` (même options par défaut).
- [ ] Code dupliqué supprimé.
- [ ] Tests autocomplete pas affectés.

**CA-tokenizer-07 : Consolidation commit -m parsing**
- [ ] `src/core/commands/commit.ts` parsing de `-m` utilise le tokenizer (plutôt que `indexOf('-m')`).
- [ ] Robustesse améliorée : `git commit -m "msg" -m "other"` traité correctement.
- [ ] Pas de changement du comportement pour inputs valides.

**CA-tokenizer-08 : Tests exhaustifs**
- [ ] `tests/tokenizer.test.ts` créé avec 20+ cas :
  - Cas nominaux : guillemets doubles, espaces.
  - Guillemets simples (option).
  - Échappements (option).
  - Guillemets non fermés (strict/non-strict).
  - Guillemets imbriqués / échappés.
  - Edge case : input vide, espaces uniquement, guillemet seul.
- [ ] ~100% couverture de `tokenizer.ts`.

**CA-tokenizer-09 : Pas de régression**
- [ ] Parser tests (~40 tests) passent.
- [ ] Autocomplete tests (~30 tests) passent.
- [ ] Commit tests (~20 tests) passent.
- [ ] `npm test` = ~720+ tests verts.

**CA-tokenizer-10 : Documentation**
- [ ] Commentaires JSDoc dans le tokenizer.
- [ ] Exemple d'usage en docstring.
- [ ] Options documentées (défauts explicites).

---

## Architecture et dépendances

### Fichiers à créer / modifier

**Créations** :
- `tests/components/RefsSidebar.test.ts` (item 1)
- `tests/components/TerminalPanel-autocomplete.test.ts` (item 1)
- `tests/components/TerminalPanel-history.test.ts` (item 1)
- `tests/tokenizer.test.ts` (item 6)
- `src/core/tokenizer.ts` ou extension de `src/core/parser.ts` (item 6)
- Optionnel : `tests/graph-culling.test.ts` (item 4)

**Modifications** :
- `package.json` : ajouter `@vue/test-utils` (item 1)
- `src/graph/types.ts` : ajouter `Badge` interface avec `kind` (item 2)
- `src/components/GraphView.vue` : memoïsation badges/couleurs, culling (items 2, 4)
- `src/utils/autocomplete.ts` : `singleCompletion()`, `replaceLastToken()` (item 3)
- `src/components/TerminalPanel.vue` : utiliser `replaceLastToken()` (item 3)
- `src/core/commands/branch.ts`, `tag.ts` : enregistrer reflog (item 5)
- `src/core/parser.ts` : déléguer au tokenizer (item 6)
- Optionnel : `src/graph/culling.ts` (item 4)

### Frontière core ↔ UI

- **Core changes** (items 1, 3, 5, 6) : `src/core/`, `src/utils/`.
  - Pas d'import Vue, aucune logique Git dans les composants.
- **UI changes** (items 2, 4) : `src/components/GraphView.vue`, `src/graph/`.
  - Séparation du rendu (culling) de la logique de layout (reste pur).

---

## Notes et points ouverts

### Performance item 4 (virtualisation)

- L'**overhead du culling** (calcul viewport + filtrage) doit être < temps gagné en rendu SVG.
  - Sur 100 commits : culling overhead ~1–2ms, gain SVG ~0 ms (peu de gain, culling saute).
  - Sur 500+ commits : overhead ~5–10ms, gain SVG ~50–200ms (culling vaut le coup).
  - **Seuil empirique** : activé si `nodes.length >= 100`.

- Alternative : **debounce pan/zoom** (recalc layout 100ms après dernier event).
  - Moins invasif, mais moins précis.
  - À considérer si culling trop complexe.

### Refactoring item 1 (tests composants)

- Les tests `RefsSidebar.test.ts` et `TerminalPanel-*.test.ts` ne doivent **pas tester la logique Git**.
  - Ex. : **pas** d'appel direct à `engine.execute()` ou vérification du snapshot du dépôt.
  - La logique Git est couverte par les tests headless (`engine.test.ts`, `commands/*.test.ts`).
  - Focus : rendu Vue, interaction utilisateur, props/events.

- **Setup test** : créer un snapshot "initial" (ex. `{ initialized: true, branches: {...}, commits: [...] }`) et tester le rendu.
  - Utiliser `@vue/test-utils` + `createPinia()` pour le store réactif.

### Tokenizer scope (item 6)

- Le tokenizer **ne doit pas faire d'analyse sémantique** (ex. "identifier une commande", "parser flags").
  - C'est du parsing de **syntaxe**, pas de **logique Git**.
  - L'analyse sémantique reste dans `src/core/parser.ts` (dispatch, validation flags, etc.).

- **Futur** : si besoin de robustesse avancée (ex. guillemets imbriqués, variable expansion comme bash), ajouter des options au tokenizer ; le reste du projet (parser, autocomplete) migrer progressivement.

### Reflog item 5 (créations refs)

- **Optionnel en Phase 7** : si l'implémentation déjà enregistre des reflog pour d'autres opérations, l'ajout pour créations/suppressions est minime (~5 lignes par commande).
- **Si reflog n'existe pas en Phase 7** : cette improvement attend que reflog soit actif (Phase 5+).

---

## Critères de porte (validation)

Une amélioration technique est **complète** si :

1. **Specs écrites** → cette doc ✓
2. **Code implémenté** (items 1–6).
3. **Tests** : tous les CA du groupe passent.
4. **Build** : `npm run build` vert (aucune erreur TS, ESLint).
5. **Tests globaux** : `npm test` >= 691 tests verts (pas de régression).
6. **Revue** : code-reviewer valide conformité, perf, pas de fuites architecture.

---

## Références

- `docs/CLAUDE.md` : dettes Phase 3/5/6.
- `docs/ROADMAP.md` : section B4 (axe B — Qualité & technique).
- `docs/specs/17-graph-render.md` : rendu graphe, structure Badge.
- `docs/specs/30-autocomplete.md` : autocomplétion existante.
- `docs/specs/24-stash-reflog.md` : reflog format et opérations.

