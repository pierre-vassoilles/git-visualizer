# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Terminal web virtuel où l'utilisateur tape des commandes Git, exécutées par un **moteur Git réimplémenté en TypeScript**, dont le résultat est visualisé sous forme de DAG (arbre des commits avec branches colorées). Vue 3 + Vite + Pinia + xterm.js. Interface en français.

## Commandes

```bash
npm run dev         # serveur de dev Vite (http://localhost:5173)
npm run build       # vue-tsc -b (typecheck strict) + build de prod
npm run typecheck   # typecheck seul (tsconfig.app)
npm test            # Vitest une passe
npm run test:watch  # Vitest en watch
npx vitest run tests/engine.test.ts   # un seul fichier de test
npm run lint        # ESLint (.ts/.vue)
npm run format      # Prettier
```

## Architecture

Principe directeur : **toute la sémantique Git vit dans `src/core/` (TS pur, zéro import Vue) et est testable headless via Vitest.** L'UI (Pinia + composants Vue + xterm + SVG) ne fait que parser l'entrée et rendre l'état — elle ne contient aucune logique git.

Flux de données :

```
xterm (TerminalPanel) → store.execute(cmd) → core/engine.execute()
                                                   ↓ mute le Repository
        snapshot réactif Pinia ← (graphe, sidebar, status) re-render
```

- `src/core/` — moteur. `engine.ts` = point d'entrée public stable (`execute(input): CommandResult`). À étoffer : `parser.ts` (tokenisation + flags + dispatch), `repository.ts` (refs, HEAD symbolique/détaché, index, working tree), `objectStore.ts` (objets + hash déterministe), `commands/` (un module par commande), `model/` (types Commit/Tree/Blob/Ref…). `types.ts` définit `CommandResult` + helpers `ok()`/`fail()`.
- `src/stores/repo.ts` — Pinia. Possède l'instance du moteur (`shallowRef`, non réactif en interne), expose `execute()`, `log`, `history`, `reset()`. C'est la **seule** façade entre UI et moteur.
- `src/graph/` — algo de layout (tri topologique → lanes → couleurs → géométrie) consommé par `GraphView.vue`. **Pas** de lib gitgraph : reset/rebase réécrivent l'historique, le rendu doit être piloté par notre propre modèle.
- `src/components/` — `TerminalPanel.vue` (xterm, gère saisie/historique ↑↓/ANSI), `GraphView.vue` (SVG), `RefsSidebar.vue`, à venir `StatusPanel.vue` et `InteractiveRebaseModal.vue`.

## Conventions

- **Ne pas mettre de logique git dans les composants ni le store** — uniquement dans `core/`. Le store est une façade fine.
- Le moteur ne renvoie jamais d'exception à l'UI pour une erreur utilisateur : il retourne `fail([...])` (messages calqués sur ceux de git). Réserver les `throw` aux bugs internes.
- L'instance moteur est dans un `shallowRef` : après une mutation, exposer un **snapshot** réactif (à introduire en phase 1) plutôt que de rendre le moteur réactif.
- Toute commande ajoutée dans `core/commands/` doit venir avec ses tests Vitest dans `tests/`.
- Strict TS partout (`noUnusedLocals`/`noUnusedParameters` actifs — `npm run build` casse sur un import/var inutilisé).

## Workflow agentique (agents voltagent)

Chaque phase (et chaque commande Git non triviale) suit un **cycle à 5 étapes**, chaque étape déléguée à un agent voltagent spécialisé via l'outil `Agent` (`subagent_type: "<nom>"`). L'orchestration reste pilotée par l'agent principal : il enchaîne les étapes, relit chaque livrable, et ne passe à la suivante que si la précédente est validée.

| Étape | Agent voltagent | Rôle sur ce projet | Livrable |
|---|---|---|---|
| 1. **Specs** | `voltagent-biz:product-manager` | Spécifier la sémantique Git de la fonctionnalité (cas nominaux, flags, erreurs façon git, critères d'acceptation). Le comportement de référence est `git` réel. | `docs/specs/<feature>.md` |
| 2. **Doc** | `voltagent-biz:technical-writer` | Rédiger/mettre à jour la doc utilisateur (commande, options, exemples) et les notes d'architecture impactées. | maj `docs/`, `CLAUDE.md` |
| 3. **Dev** | `voltagent-lang:typescript-pro` (moteur `core/`) · `voltagent-lang:vue-expert` (UI Vue 3) | Implémenter dans `core/` (logique) ou dans les composants/store (UI), en respectant la frontière core↔UI. | code |
| 4. **Tests** | `voltagent-qa-sec:test-automator` | Écrire les tests Vitest depuis les critères d'acceptation de l'étape 1 (cas nominaux + erreurs + bords : HEAD détaché, fast-forward, réécriture d'historique). | `tests/**/*.test.ts` |
| 5. **QA** | `voltagent-qa-sec:code-reviewer` · `voltagent-qa-sec:architect-reviewer` (décisions d'archi) | Revue : conformité aux specs, respect des conventions, qualité, couverture, régressions. | rapport de revue |

### Règles d'orchestration

- **Specs avant code.** Aucune implémentation ne démarre sans la spec de l'étape 1 (la spec définit les critères d'acceptation que les tests vérifieront).
- **Tests dérivés des specs, pas du code.** L'agent tests travaille à partir de `docs/specs/`, pas de l'implémentation, pour éviter de tester les bugs.
- **Frontière core↔UI respectée à la revue.** L'étape QA rejette toute logique git ayant fui dans le store ou les composants.
- **Porte de validation par phase.** Une phase n'est `completed` que si : specs écrites, doc à jour, `npm run build` vert, `npm test` vert, revue QA sans bloquant.
- **Étapes indépendantes en parallèle.** Quand specs/doc de plusieurs commandes sont indépendantes, lancer les agents en parallèle (plusieurs appels `Agent` dans un même message). Le dev d'une commande et les tests d'une autre déjà spécifiée peuvent aussi se chevaucher.
- **Agents complémentaires ponctuels** : `voltagent-qa-sec:debugger` (diagnostic d'un test rouge tenace), `voltagent-qa-sec:performance-engineer` (layout du graphe sur gros DAG), `voltagent-core-dev:ui-designer` (design de `GraphView`/modal rebase).

### Cycle type d'une phase

```
product-manager (specs)
        ↓
technical-writer (doc)  ──┐
        ↓                 │ (peut chevaucher le dev)
typescript-pro / vue-expert (dev)
        ↓
test-automator (tests Vitest)
        ↓
code-reviewer (+ architect-reviewer) (QA)
        ↓
porte : build + tests verts, revue OK → phase completed
```

## État d'avancement

Développement par phases (voir la liste de tâches).

- **Phase 0 terminée** : scaffold, layout 3 zones, terminal xterm, moteur stub.
- **Phase 1 terminée** : moteur noyau réel. Objets (blob/tree/commit) + SHA-1 pur déterministe (`sha1.ts`), `Repository` (refs, HEAD, index, working tree), parser (`parser.ts`), commandes `git init/add/status/commit/log` + utilitaires `write`/`read` (working tree virtuel, pas de vrai FS). `engine.snapshot()` expose un état immuable (gelé) pour l'UI ; le store le pose dans un `ref` réactif. Specs dans `docs/specs/`, doc utilisateur dans `docs/USAGE.md`. 195 tests Vitest verts.
- **Phase 2 terminée** : branches & navigation. `git branch` (-d/-D), `checkout` (-b, `<commit>` → HEAD détaché, `-`), `switch` (-c, --detach, -), `restore` (--staged, --source), `tag` (-d). Modèle étendu : `refs.tags`, `prevBranch`, HEAD détaché (`head.symbolic=false`). Helpers : `isHeadDetached`, `resolveCommitish`, `canSwitchWithoutDataLoss`, `applyTreeToRepo`… Snapshot enrichi : `tags` global + `commits[].tags`. 299 tests verts (specs `09-14`).
- **Phase 3 terminée** : visualisation SVG. Snapshot enrichi avec `allCommits` (TOUT le graphe, pas seulement depuis HEAD). Algorithme de layout **pur** dans `src/graph/layout.ts` (`computeLayout(input): GraphLayout`, types dans `src/graph/types.ts`) : tri topologique déterministe, assignation de lanes avec **résolution de collision `(lane, depth)`** (deux commits distincts n'ont jamais la même position ; lane propagée le long du 1er parent uniquement → merges bien rendus), couleur par lane, arêtes `linear`/`merge`. Rendu dans `GraphView.vue` (SVG custom, badges branches/HEAD/tags, pan/zoom, tooltip). 371 tests verts (specs `15-17`).

- **Phase 4 terminée** : fusion & réécriture. `git merge` (fast-forward, `--no-ff`, true merge 3-way à 2 parents, `-m`, `--abort`), `reset` (--soft/--mixed/--hard), `revert`, `cherry-pick`, `rebase` (non interactif, replay → nouveaux hash, `--continue`/`--abort`). Helpers : `isAncestor`, `mergeBase`, `resolveCommitish` étendu aux révisions `HEAD~n`/`<ref>~n`, `getCommitsToReplay`, `computeTreeDiff`, `createCommitWithParents`. Conflits matérialisés par marqueurs `<<<<<<< ======= >>>>>>>` + état d'opération (`merging`/`rebasing`/…) exposé dans `snapshot.operationState`. Dette Phase 2 `branch -d` (non mergée) corrigée via `isAncestor`. 453 tests verts (specs `18-23`).

- **Phase 5 terminée** : outils avancés. `git rebase -i` (todo list éditée via `InteractiveRebaseModal.vue` ; actions pick/reword/squash/fixup/drop + réordonnancement ; conflits → `--continue`/`--abort`), `git stash` (push/list/pop/apply/drop), `git reflog` (+ révision `HEAD@{n}` pour l'undo). Refactor de la dette Phase 4 : helper unique `replayCommit`/`replayCommitContinue` (rebase + cherry-pick), `applyDiff` mort supprimé. Modèles : `TodoItem`, `StashEntry`, `ReflogEntry`. Contrat UI : `GitEngine.executeRebaseInteractive(todo)` via l'action store `executeRebaseTodo` ; snapshot expose `rebasingInteractive` + `stashCount`. 509 tests verts (specs `24-27`).

- **Phase 6 terminée** : finitions & DX. `git help` / `git help <cmd>` / `git --help` (commande `core/commands/help.ts` lisant le catalogue). **Catalogue de commandes** `src/core/catalog.ts` (`COMMAND_CATALOG` : nom/catégorie/description/flags/synopsis/exemples) = **source de vérité unique** consommée par `git help` ET l'autocomplétion ; `lookup` dérivé par code des données (anti-désync) ; exposé à l'UI via `GitEngine.getCatalog()`/`getCommandNames()`/`getCommandFlags()` → store `getCatalog()`. **Autocomplétion** Tab : fonction pure `src/utils/autocomplete.ts` (commandes/flags/refs depuis catalogue+snapshot), intégrée dans `TerminalPanel.vue`. **Persistance** localStorage par rejeu d'historique déterministe : `src/utils/storage.ts` (versionné `1.0`, purge si corrompu/incompatible) + store (`loadFromStorage`/`resetStorage`, `savedCommands` distinct de `history`). Critère de persistance : `exitCode===0` **OU** opération en cours (un merge/rebase conflictuel survit au reload ; le rejeu ne s'arrête que sur un échec réel). **Scénarios** pédagogiques : données pures `src/constants/scenarios.ts` (5 scénarios) + store `executeScenario(id)` (reset+purge storage, persiste sa séquence). **RefsSidebar** finalisée (branches+courante, HEAD détaché, tags, opération en cours + Continuer/Annuler, stash, commandes récentes, Réinitialiser, liste des scénarios). Doc `docs/USAGE.md` §8-12. Specs `28-33`. 655 tests verts.

- **Phase 7 terminée** : modèle distant (lecture). Modèle : `RemoteRepository` bare (`{url, objects: Record<string,GitObject>, refs:{heads}, head}`) dans `repo.remotes` ; refs de suivi sous `repo.refs.remotes` (PAS `refRemotes`) ; `repo.branchUpstream`. Commandes `git remote` (list/-v/add/remove|rm), `git clone <source>` (dépôts prédéfinis **construits par rejeu de commandes** dans `src/constants/predefinedRemotes.ts` → hashes identiques au moteur ; `public-repo`/`collab-repo`/`feature-repo`), `git fetch [<remote>] [<branche>]` (copie d'objets via `copyMissingObjects` + maj `refs.remotes` ; **ne touche jamais branches locales/HEAD/index/WT**). Helpers `repository.ts` : `copyMissingObjects`, `getDefaultBranch`, `computeAheadBehind` (différence symétrique des ensembles accessibles — correct sur DAG), `validateRemoteName`. Snapshot enrichi (gelé) : `remotes` (graphe du distant, mêmes `SnapshotCommit` → réutilisable par `computeLayout` en Phase 9), `remoteTrackingRefs`, `tracking{upstream,ahead,behind}`. `isInitialized` corrigé (robuste à une branche par défaut ≠ `main`, utilisé aussi par le snapshot). Catalogue étendu (remote/clone/fetch). Doc `docs/USAGE.md` §13. Specs `34-36`. 747 tests verts.

  Dette Phase 7 (revue QA) — non bloquante, à traiter en Phase 8/9 :
  - **Cycle d'import** `constants/predefinedRemotes` → `core/parser` → `core/commands/clone` → `constants/predefinedRemotes` (fonctionnel grâce au lazy, mais fragile ; à casser, et déplacer ce builder vers `core/` plutôt que `constants/` car il exécute le moteur).
  - `validateRemoteName` accepte `origin/local` (la spec 34 le dit invalide) — à durcir si besoin.
  - `clone` réinitialise le `Repository` champ par champ (ne remet pas reflog/stash/merging à zéro) — sans effet sur un clone depuis un dépôt vierge, à durcir.
  - Cast `{objects} as Repository` dans `engine.snapshot()` (réutilisation de `getAllCommitsTopologicalOrder`) ; rétro-compat des champs distant dupliquée dans `cmdRemote`/`cmdFetch` (extraire un `ensureRemoteFields`).
  - CA-clone-05 (HEAD détaché côté source) non couverte (pas de dépôt prédéfini détaché) ; cas fetch fast-forward/rewind/divergent (CA-fetch-05/08) couverts en Phase 8 (nécessitent `push` pour faire diverger le distant).

- **Phase 8 terminée** : synchronisation distant ↔ local. `git push [<remote>] [<branch>] [-u|--set-upstream] [-f|--force]` (vérification fast-forward via `isAncestor`, **refus non-ff → exitCode 1** sauf `--force` ; maj double `remote.refs.heads` + `repo.refs.remotes` ; copie d'objets local→remote ; `-u` pose l'upstream). `git pull [<remote>] [<branch>] [--rebase|--no-rebase]` = **composition** `cmdFetch` + `cmdMerge`/`cmdRebase` (réutilise Phase 4 ; conflits → operationState hérité ; « no tracking information » exit 1). Suivi : `git branch -u <r>/<b>` / `--set-upstream-to=` / `--unset-upstream`, `git branch -vv` (ahead/behind/gone), `git status` enrichi (ahead/behind/diverged/gone/up-to-date), `git rev-parse <rev>` (nouveau). **`resolveCommitish` étendu** : refs de suivi `<remote>/<branch>` (depuis `refs.remotes`) + `@{upstream}`/`@{u}`/`<branch>@{u}` (priorité : branche locale AVANT remote/branch). Snapshot : `branchUpstream` (gelé) + `tracking{upstream,ahead,behind,gone}` (via `computeAheadBehind`, = sémantique `upstream..HEAD`/`HEAD..upstream`). Catalogue étendu (push/pull/rev-parse + flags branch). Doc `docs/USAGE.md` §14. Specs `37-39`. 879 tests verts.

  Dette Phase 8 (revue QA) — non bloquante, à traiter avant/pendant Phase 9 :
  - `pull` suppose la convention de nommage de ref de suivi `<remote>/<branch>` écrite par `fetch` (couplage implicite non contractualisé) — R1 (string-match sur l'erreur de fetch) déjà corrigé en vérifiant `repo.remotes` dans pull.
  - Logique `@{u}` dupliquée entre `rev-parse.ts` et `resolveCommitish` → extraire un `resolveUpstream(repo, branch)` (prévu spec 38) consommé par les deux.
  - Classification de l'état de suivi (gone/ahead/behind/diverged/up-to-date) re-dérivée 3× (branch -vv, status, snapshot) → exposer un discriminant `state` dans `snapshot.tracking` (utile pour la sidebar Phase 9).
  - Init défensif des champs distant copié dans push/pull/branch → helper `ensureRemoteFields` (dette Phase 7 toujours ouverte).
  - `pull origin <branche-inexistante>` renvoie 128 (la spec voulait 1) ; pas d'ambiguïté signalée branche-locale-à-slash vs `remote/branch` (ordre correct, sans warning).

- **Phase 9 terminée** : visualisation du distant + sidebar distante + scénarios (UI uniquement, zéro nouvelle commande). Refactor `GraphView.vue` → **`GraphCanvas.vue`** (présentationnel PUR : reçoit `layout: GraphLayout`, `badgesByHash`, `highlightedNodes`, `headHash`/`headDetached` en props, n'accède pas au store) + `GraphView.vue` (conteneur connecté). Modes **local / split / remote** (toolbar ; bascule auto en split au 1er distant ; boutons grisés sans distant). `computeLayout` réutilisé tel quel sur `snapshot.remotes[name]` (mêmes `SnapshotCommit`). Décorations : badges `kind:'remote'` (`origin/main`) sur le graphe local, surlignage des commits **non poussés** (calcul par accessibilité depuis les tips de suivi) et **non récupérés**. **Dette Phase 3 soldée** : badges mémoïsés en `computed` (Map par hash), champ discriminant `kind:'head'|'branch'|'tag'|'remote'`, couleurs d'arête en Map (plus de `.find()` O(E·N)). Sidebar « Distant » (remotes, ahead/behind/upstream/gone, boutons Fetch/Push/Pull → `store.execute`). 4 scénarios « Distant » (clone-push, pull-merge, push-rejected-rebase, collab-two-branches — dépôts prédéfinis réels + clone/reset pour la divergence). Specs `40-41`, doc `docs/USAGE.md`. 929 tests verts (dont `tests/scenarios-remote.test.ts`).

  Dette Phase 9 (revue QA) — non bloquante :
  - **Pas de tests composants** (`@vue/test-utils` absent) → `GraphCanvas`/`GraphView`/`RefsSidebar` non couverts ; la non-régression du graphe repose sur la revue. M1 (perte de l'anneau HEAD à l'extraction) et le surlignage non-poussé par tip-only ont été **corrigés** avant commit. À verrouiller en ajoutant `@vue/test-utils` (spec 61).
  - Duplication ~85 % `buildLocalBadges`/`buildRemoteBadges` (palettes hex répétées) → factoriser un `buildBadges(commits, headState, {remoteRefs})`.
  - `RefsSidebar` : garde HEAD-détaché des boutons push/pull via `alert()` (duplique une règle moteur ; idéalement laisser le moteur renvoyer `fail` et surfacer le résultat) ; `remoteUrl()` renvoie toujours null (l'url n'est pas exposée dans `snapshot.remotes` — l'exposer ou retirer).
  - Sélection mono-remote (`Object.keys(remotes)[0]`) : le multi-remote n'affiche qu'origin.
  - Divergences spec↔code à acter : catégorie scénarios `'Distant'` (spec disait `'Collaboration'`), `pull-merge` (spec : `fetch-pull-merge`), contrat de props `GraphCanvas` (amélioré vs spec 40).
  - Reprises de la dette Phase 8 toujours ouvertes (R3 `resolveUpstream`, R5 discriminant `state` dans `tracking`, R6 `ensureRemoteFields`).

- **Phase B4 terminée** (Axe B — qualité & dette technique, spec `61`). 5 items sur 6 traités (l'item 2 « badges `kind` + mémoïsation » était déjà soldé en Phase 9) :
  - **Item 6 — tokenizer unique** : `src/core/tokenizer.ts` (`tokenize(input, options?)`, options `allowSingleQuotes`/`allowEscapes`/`strict`/`keepEmptyTokens`, `TokenizeError`). `parser.tokenize` et `autocomplete.tokenizeInput` y délèguent (source de vérité unique). Comportement par défaut = ancien parser (guillemets doubles, espaces fusionnés, token vide quoté émis) ; `keepEmptyTokens` reproduit la sémantique d'autocomplétion.
  - **Item 3 — autocomplétion casse mixte** : `singleCompletion` renvoie désormais le **candidat complet** (casse préservée) au lieu d'un suffixe ; nouvelle helper pure `replaceLastToken(input, replacement)` ; `TerminalPanel` remplace le dernier token. **Contrat changé** : `AutocompleteResult.completion` = candidat complet à substituer (flag unique → candidat + espace).
  - **Item 5 — reflog création/suppression** : `git branch`/`git tag` (création) et `git tag -d`/`git branch -d` écrivent une entrée reflog (`action:'branch'|'tag'`, description `Created from <short>` / `Deleted <name>`). `git reflog <ref>` étendu aux **tags** et aux refs **supprimées** (le reflog survit, `newHash` vide → affiche `oldHash`).
  - **Item 4 — virtualisation SVG** : `src/graph/culling.ts` (`culledLayout(layout, viewport, {threshold=100, buffer=0.2})`, **pur**, ne mute pas le layout, conserve une arête si ≥1 extrémité visible). `GraphCanvas.vue` calcule `renderedLayout` (viewport logique depuis pan/zoom + taille conteneur mesurée par `ResizeObserver`) ; **passthrough sous 100 nœuds** → zéro changement visuel en usage normal.
  - **Item 1 — tests composants** : `@vue/test-utils` ajouté. `tests/components/` : `RefsSidebar.test.ts` (rendu branches/HEAD détaché/opération/stash, piloté par le store réel), `TerminalPanel-autocomplete.test.ts` + `TerminalPanel-history.test.ts` (xterm **mocké** via `vi.hoisted` + `vi.mock`, capture du callback `onData` et des `write` ; testent l'interaction, pas la logique git). **Solde la dette « pas de tests composants » des Phases 6/9.**
  - **Corrections revue QA** : `git branch <name> <start-point>` était silencieusement ignoré (créait toujours sur HEAD) → désormais résolu via `resolveCommitish` (`Badge` déplacé vers `src/graph/types.ts` ; `reflog list` retombe sur `oldHash` si `newHash` vide). 989 tests verts. Dette Phase 9 « pas de tests composants » et dette Phase 6 « autocomplétion casse mixte » **soldées**.

  Dette B4 (non bloquante) : duplication `buildLocalBadges`/`buildRemoteBadges` (dette Phase 9) non traitée ; `commit -m` garde son `indexOf('-m')` (opère sur des tokens déjà découpés, non concerné par le tokenizer — CA-tokenizer-07 non livré) ; `splitCommandChain` (`utils/shell.ts`) reste un découpeur d'instructions distinct (non fusionné, rôle différent) ; `replaceLastToken` utilise `lastIndexOf(' ')` (refs sans espace) plutôt que le tokenizer ; culling jamais exercé en pratique (graphes pédagogiques < 100 nœuds).

- **Phase B1 (git diff/show) terminée** (Axe B — contenu Git, spec `42`). **Moteur de diff pur** `src/core/diff.ts` (`diffSides(oldSide, newSide, {context=3})`, LCS ligne à ligne → `DiffFile`/`DiffHunk`/`DiffLine`, hunks à 3 lignes de contexte, `formatFiles` = sortie git-compatible `diff --git`/`index`/`@@`/`+`/`-`, `isBinary` = détection d'octet nul → `Binary files … differ`). `DiffSide = Record<path,{content,hash,mode}>` = contrat exposable à l'UI. Commandes `core/commands/diff.ts` (WT vs index / `--staged`|`--cached` index vs HEAD / `<commit>` / `<c1> <c2>` / `-- <pathspec>` ; helpers `workingTreeSide`/`indexSide`/`treeSide` réutilisables) et `core/commands/show.ts` (métadonnées `commit/Author/Date/message` + diff vs 1er parent, ou arbre vide si commit initial ; `Merge:` pour les commits de fusion). Erreurs façon git (révision inconnue → 128, dépôt non init → 128, `show` sur dépôt vierge → 128). Catalogue étendu (diff/show dans la catégorie « Commits »). **Visualiseur de diff** = colorisation ANSI de la sortie dans `TerminalPanel` (`colorizeDiffLine` : vert/rouge/cyan/gris). Doc `docs/USAGE.md`. 1011 tests verts (`tests/diff-show.test.ts` : 22 CA, dont fichier supprimé/binaire testés en boîte blanche via `diffSides` car `git rm`/octets nuls indisponibles avant B1-`rm`).

- **Phase B1 (git rm/mv) terminée** (Axe B — contenu Git, spec `43`). `core/commands/rm.ts` : `git rm [--cached] [-r|--recursive] [-f|--force] <pathspec>...` (supprime de l'index + WT ; `--cached` = désindex pur → fichier untracked ; `-r` énumère les chemins sous `<dir>/` ; refus exit 1 si modifié non stagé / stagé ≠ HEAD sauf `-f` ; validation atomique avant toute suppression). `core/commands/mv.ts` : `git mv [-f] <src> <dst>` (réutilise la **même entrée d'index** → blobHash conservé ; `<dst>` répertoire → déplace dedans ; refus exit 128 si destination existe sans `-f` / source absente / src==dst). **`status` corrigé** : l'untracked est défini par l'absence dans **l'index** (plus le garde `!(in headFiles)`) → `rm --cached` affiche `?? file.txt` (fidèle à git). Câblé parser + catalogue (catégorie « Fichiers & Index »). **Dette Phase 4 levée** : le conflit **delete/modify** est désormais testable en boîte noire (`git rm`+commit puis `git merge` → `operationState: merging`), et la dette B1 « diff sur fichier supprimé » est close (`git rm` puis `git diff --staged`). Doc `docs/USAGE.md`. 1031 tests verts (`tests/rm-mv.test.ts` : 20 CA). **Correction revue QA** : snapshot (`engine.ts`) aligné sur `status` (HEAD+WT-hors-index → `untracked`, pas `deleted`) pour éviter une incohérence terminal/UI. Dette acceptée : le format court `status -s` n'émet qu'**un statut par chemin** (donc `rm --cached` montre `??` mais pas la ligne `D ` staged que git réel afficherait aussi) ; messages d'erreur `mv` (`bad source`) fidèles à git réel mais divergents du littéral de la spec 43.

  Dette B1 (non bloquante, revue QA) : `git diff` montre les fichiers **untracked** comme « added » (conforme à la spec 42 mais diverge du vrai git qui les masque) ; pas d'UI modale dédiée (visualiseur = colorisation terminal) ; `git diff`/binaire sur fichier supprimé non atteignables en boîte noire tant que `git rm` (spec 43) n'existe pas ; `treeSide` force `mode:'100644'` (`flattenTree` ne remonte pas le mode — sans effet tant qu'aucun blob `100755`) ; `git show` d'un commit de fusion affiche `Merge:` **et** un diff vs 1er parent (le vrai git n'affiche pas de diff par défaut sur un merge) ; `hashBlob` du WT recalculé vs `blobHash` de l'index (identiques car SHA-1 pur déterministe).

- **Phase B1 (.gitignore) terminée** (spec `44`). Module **PUR** `src/core/gitignore.ts` : `parseGitignore(content)` → `IgnorePattern[]` (compile chaque ligne : négation `!`, dir-only `/` final, ancrage si `/` interne ou initial, glob→regex `*`=`[^/]*`/`?`=`[^/]`/`**/`=`(?:.*/)?` ; commentaires `#` + lignes vides ignorés ; pattern invalide → littéral sans exception), `isIgnored(path, patterns)` (« last match wins » sur le chemin + ses répertoires-ancêtres ; dir-only ne match que les ancêtres → ré-inclusion `!/build/keep/` possible), `loadIgnorePatterns(repo)` (lit `repo.workingTree['.gitignore']`). Câblé : `status` (untracked filtrés, sauf fichiers suivis dans l'index), `add` (refus exit 1 `… is ignored by one of your .gitignore files` sauf `-f`/`--force` ; `git add .` exclut les ignorés ; un fichier déjà dans l'index n'est jamais bloqué). Pas de commande dédiée (`.gitignore` = fichier du WT via `write`). Doc `docs/USAGE.md`. 1159 tests verts (`tests/gitignore.test.ts` : 14 CA + module pur).

  Dette B1-gitignore (non bloquante) : sous-ensemble de `git check-ref-format`/gitignore réel (pas de `a/**/b` au milieu, pas la règle git « impossible de ré-inclure sous un répertoire exclu » — on l'autorise pour coller à CA-14) ; `.gitignore` lui-même apparaît en untracked (fidèle à git) ; relecture/recompilation à chaque `status`/`add` (pas de cache — déterministe, acceptable sur petits dépôts).


- **Phase B2 (éditeur de conflits) terminée** (Axe B — UX & pédagogie, spec `50`). Helpers **purs** dans `repository.ts` : `parseConflictContent(content): ConflictSection[]` (parse `<<<<<<< ======= >>>>>>>`, multi-sections, ignore le hors-conflit), `buildResolvedContent(ours, theirs, choice, manual?)` (`ours`/`theirs`/`both`/`manual`), `hasConflictMarkers`. Moteur : `GitEngine.readFile(path)` + `writeFile(path, content)` (écriture directe, sans le parsing fragile de la commande `write`). Snapshot : `operationState.filesInConflict: string[]` (fichiers du WT contenant encore des marqueurs, gelé). Store : `readFile`/`getConflictSections`/`resolveConflict(path, choice, manual?)` (orchestration pure : lit → résout via core → `writeFile` → `git add`). **`git merge --continue` implémenté** (route vers `cmdCommit` ; corrige aussi le bouton « Continuer » merge de la sidebar qui échouait). Composant **`ConflictEditorModal.vue`** (overlay racine dans `App.vue`) : liste des fichiers en conflit, panneau 3-way ours/theirs/résultat, boutons Garder ours/theirs/les deux/Éditer, Marquer résolu (→ `resolveConflict`), Continuer (actif quand `filesInConflict` vide), Annuler — **zéro logique git** (tout via le store). Modèle « conflit pleine-page » (la 1ʳᵉ section couvre tout le fichier, cohérent avec `makeConflictMarkers`). 1052 tests verts (`tests/conflict-resolution.test.ts` 15 + `tests/components/ConflictEditorModal.test.ts` 6).

  **Correction revue QA (M1)** : `finalizeMergeCommit`/`finalizeCherryPickCommit` (donc `git commit` ET `git merge --continue`) **refusent désormais** de finaliser tant qu'un fichier du WT contient des marqueurs (`error: …unmerged files`, exit 1) — on ne committe jamais de marqueurs. `filesInConflict` réutilise `hasConflictMarkers` (déduplication, M2).

  Dette B2 (non bloquante) : la résolution (`writeFile` direct) n'est **pas persistée** dans `savedCommands` → au rechargement, le merge conflictuel est rejoué et le `git merge --continue` rejoué **échoue proprement** (marqueurs encore présents, grâce à M1) ; l'utilisateur ré-résout via la modale. Multi-sections : `resolveConflict` ne traite que la 1ʳᵉ (modèle conflit pleine-page, conforme à `makeConflictMarkers` qui n'en génère qu'une) ; détection de conflit par présence de `<<<<<<<` (heuristique simple, faux positif possible sur un fichier contenant légitimement la séquence).

- **Phase B2 (tutoriels guidés) terminée** (Axe B — UX & pédagogie, spec `51`). Types + prédicats de validation **purs** dans `src/core/tutorial-helpers.ts` (`Tutorial`/`TutorialStep`/`StepObjective` + `hasCommits`/`commitCountEquals`/`hasBranch`/`headPointsTo`/`isHeadDetached`/`hasTag`/`fileExists`/`isStaged`/`noStagedChanges`/`noOperationInProgress`/`hasBranchCount`/`all`) — **adaptés au snapshot réel** (`branches`/`tags` = Record, `head` = `{type,name|hash}`, `files` = SnapshotFile[]), pas à la forme hypothétique de la spec. Types placés dans `tutorial-helpers.ts` (et non `model.ts`) pour éviter le cycle model↔engine (`RepoSnapshot` vit dans engine). Catalogue de **données pures** `src/constants/tutorials.ts` (3 tutoriels : `first-commit`, `branching`, `undo-reset` ; `getAllTutorials`/`getTutorialById`/`tutorialDifficultyLabel`). Store : état `tutorialProgress` + computeds `currentTutorial`/`currentStep`/`tutorialObjectives` (prédicats évalués contre le snapshot, try/catch → false) / `currentStepComplete`/`tutorialCompleted` + actions `startTutorial` (reset + purge storage), `nextStep`/`previousStep`/`skipStep`/`useHint`/`quitTutorial`. Composant **`GuidedTutorialModal.vue`** (overlay racine) : énoncé, indice, checklist d'objectifs auto-validés, Suivant (actif si objectifs ✓)/Revenir/Passer/Quitter, écran de récap final — **zéro logique git** (tout via le store). Section « Tutoriels guidés » dans `RefsSidebar`. Déterminisme strict (pas de timer/Date.now : le récap montre indices+étapes sautées, pas le temps). 1077 tests verts (`tests/tutorials.test.ts` 17 + `tests/components/GuidedTutorialModal.test.ts` 6).

  Dette B2-tutoriels (non bloquante, revue QA) : `previousStep`/`skipStep` sont **purement navigationnels** (pas de rollback de l'état moteur, contrairement au « recharge l'état pré-étape » de la spec) ; progression non persistée (reload perd `tutorialProgress`) ; étape `check-reflog` (undo-reset) a un objectif **informatif** (`commitCountEquals(2)`, déjà vrai à l'entrée) car le reflog n'est pas exposé dans le snapshot ; objectif `commit-on-branch` vérifie `hasCommits(2)` sans contrôler que le nouveau commit porte bien `feature` (écart assumé vs spec) ; `currentStepComplete` exige ≥1 objectif (une étape sans objectif resterait non complétable — non rencontré).

- **Phase B2 (`git log --graph` ASCII) terminée** (spec `54`). Module **pur** `src/graph/ascii.ts` (`renderGraphAscii({commits, refsByHash, verbose, formatDate})`) : rendu par **suivi de colonnes** (`*` commit, `|` lane active, `\` bifurcation de merge, `/` convergence), caractères ASCII uniquement, pas d'ANSI. `cmdLog` étendu (`--graph` [+`--oneline`]) : traversée des commits accessibles depuis HEAD, **tri déterministe par date décroissante** (= ordre topologique enfants-avant-parents, car nos dates sont monotones avec `commitCount`), décorations `(HEAD -> main, tag: v1, feature)`. Catalogue `log` enrichi (`--graph`). 1089 tests verts (`tests/log-graph.test.ts` : 12 CA). Rendu approximatif vs git réel (connecteurs espacés `| \`) mais lisible et pédagogique.

- **Phase B2 (refs cliquables + menu contextuel) terminée** (spec `53`). **Sidebar** : branches cliquables → `git checkout <branche>` (no-op si courante), tags cliquables → `git checkout <hash>` (HEAD détaché) ; classe `.clickable`. **Graphe** : `GraphCanvas` émet `nodeContextMenu(hash,x,y)` au clic droit (+ attribut `:data-hash` sur les cercles, utile aux tests) ; `GraphView` affiche un **menu contextuel** (overlay + Escape + clic-outside) avec Checkout (caché si HEAD)/Reset --soft/--mixed/--hard (confirmations, `--hard` danger)/Revert (caché sur racine)/Cherry-pick/Tag… (`prompt`)/Copier le hash (`navigator.clipboard`). Câblé sur le graphe **local uniquement**. Toutes les actions passent par `store.execute('git …')` — zéro logique git dans l'UI (les exemples de la spec omettaient le préfixe `git`, ajouté). 1100 tests verts (`GraphView-context.test.ts` 8 + clics sidebar 3).

- **Phase B2 (thème sombre + a11y) — cœur livré** (spec `56`). Infrastructure de thème : variables CSS dans `src/style.css` (`:root` clair + `[data-theme="dark"]`), composable **`src/composables/useTheme.ts`** (singleton `light`/`dark`/`auto`, persistance localStorage `theme`, `prefers-color-scheme`, applique `data-theme` sur `<html>`), composant **`ThemeSwitcher.vue`** dans la topbar, init dans `App.vue`. Surfaces principales var-ifiées (topbar, layout, RefsSidebar, GraphView toolbar/panes, fond GraphCanvas via `--graph-canvas-bg`). **a11y** : `.sr-only`, `:focus-visible` global, `role="complementary"`/`aria-label` sur la sidebar, `aria-live` sur HEAD, `role="img"`/`aria-label` sur le graphe, `aria-label` sur le sélecteur de thème. 1110 tests verts (`theme.test.ts` 4 + `ThemeSwitcher.test.ts` 3 + `a11y.test.ts` 3).

  Dette B2-thème (assumée, non bloquante) : **var-ification partielle** — les modales (Conflict/Tutorial/Rebase), le terminal (xterm a son propre thème sombre fixe), les badges/labels du graphe et certaines couleurs scoped ne consomment pas encore les variables → en mode sombre, ces surfaces restent claires (cohérence dark incomplète). **Responsive** (layout mobile empilé, breakpoints) et **audit contraste automatisé** (`axe-core`, CA-theme-04) **non implémentés**. Navigation clavier dans le graphe (Enter/Espace sur un commit, CA-a11y-02) non faite.

- **Phase B2 (finition thème/a11y) terminée** (spec `56`, reprise de la dette). **Navigation clavier du graphe** (CA-a11y-02) : nœuds `tabindex=0` + `role="button"` + `aria-label` (`Commit <short> : <message>`) ; `onNodeKeydown` (Entrée/Espace → `selectNode` ; ContextMenu/Shift+F10 → ouvre le menu contextuel au niveau du nœud) ; style `.node:focus-visible` (anneau bleu). **Responsive** : breakpoint `@media (max-width: 820px)` dans `App.vue` (empilage topbar/main/sidebar, page scrollable, sidebar bord-haut). **Var-ification des conteneurs de modales** : nouvelles vars sémantiques `--overlay-bg`/`--surface-bg`/`--surface-muted-bg`/`--surface-fg` (light + dark) ; appliquées aux overlays + panneaux de `ConflictEditorModal`/`GuidedTutorialModal`/`InteractiveRebaseModal` (`CommandPalette` consommait déjà les vars) → en sombre l'overlay/le fond/le texte des modales suivent le thème. 1143 tests verts (`tests/components/GraphCanvas-a11y.test.ts` 4).

  Dette B2-thème restante (assumée) : **var-ification fine NON faite** — les cartes/accents internes des modales (panes 3-way, en-têtes, boutons sémantiques vert/rouge/ambre) gardent des couleurs en dur (lisibles mais non thémées) ; xterm garde son thème sombre fixe ; badges/labels du graphe en dur. **Audit contraste automatisé** (`axe-core`, CA-theme-04) toujours non implémenté. aria-label racine du graphe encore en dur (non i18n).

- **Phase B2 (palette de commandes) terminée** (spec `57`). Util **pur** `src/utils/commandPalette.ts` : `fuzzyScore(query,text)` (sous-séquence, préfixe favorisé) + `searchPaletteItems(query, ctx, limit)` → items typés (`command`/`scenario`/`tutorial`/`ui`) ; requête vide = Récentes (historique) + Suggéré (contextuel : `--continue`/`--abort` si opération, `git commit`/`status` selon l'index, `git merge` si ≥2 branches) + Commandes + Scénarios + Tutoriels + Actions ; requête non vide = filtre flou trié par score. Composant **`CommandPalette.vue`** (overlay, monté dans `App.vue`) ouvert par **Ctrl/Cmd+K** (toggle), input + liste à sections, navigation ↑/↓/Entrée/Échap, clic ; exécution via `store.execute`/`executeScenario`/`startTutorial` ou actions UI (bascule thème, reset) — zéro logique git. 1125 tests verts (`command-palette.test.ts` 9 + `CommandPalette.test.ts` 6).

  Dette B2-palette (non bloquante) : les commandes lancées via la palette passent par `store.execute` mais **ne s'échoient pas dans le terminal xterm** (le terminal n'affiche que sa propre saisie) — le graphe/snapshot se mettent à jour ; les commandes à argument (`git commit -m "message"`, `git merge `) sont exécutées telles quelles (placeholder) plutôt qu'insérées dans l'input.

- **Phase B2 (animations du graphe) terminée** (spec `52`). Composable **`src/composables/useGraphAnimations.ts`** (singleton `userEnabled` persisté localStorage `graph-animations` ; détecte `prefers-reduced-motion` → `animationsActive = userEnabled && !reducedMotion`) + helpers **purs** `lerp`/`easeOutCubic` (testés). `GraphCanvas.vue` interpole entre `prevLayout` et `props.layout` via `animProgress` 0→1 piloté par `requestAnimationFrame` (durée 380 ms, easing ease-out) : **`computeLayout` reste pur** (aucune modif). Identité par `hash` : nœuds stables → position interpolée ; nouveaux → apparition (opacity 0→0.85, montée depuis le bas) ; disparus → rendus en couche dédiée en fondu (opacity→0) puis retirés ; arêtes idem (endpoints suivent les nœuds, fade-in/out). Sans rAF (tests) ou animations off → bascule directe sur l'état final (zéro changement visuel). Toggle « Animations » dans la toolbar de `GraphView` (grisé si `prefers-reduced-motion`), init dans `App.vue`. Pas de test d'animation visuelle (spec §7), seuls les helpers purs sont testés. 1131 tests verts (`tests/graph-animations.test.ts` 6).

  Dette B2-anim (non bloquante) : pas de file d'attente d'animations (commits rapides successifs → la dernière transition gagne, l'animation en cours est interrompue, pas de saccade car interpolation depuis l'état courant) ; interaction culling↔animation non vérifiée sur gros DAG (les nouveaux nœuds montent depuis `layout.height` même si hors viewport — sans effet < 100 nœuds) ; pas de slider de vitesse (toggle on/off seulement).

- **Phase B2 (i18n FR/EN) terminée** (spec `55`). Module **`src/i18n/`** : `messages.ts` (union type-safe `MessageKey` + `MESSAGE_KEYS` figé pour le test de parité), `locales/fr.json`/`en.json` (dictionnaires, `resolveJsonModule` activé dans `tsconfig.app.json`), `index.ts` (composable `useI18n` → `t(key, params?)` réactif avec interpolation `{param}`, `setLocale`/`getLocale`, `initI18n` ; **singleton** au niveau module → tous les composants se rafraîchissent ; fallback locale→EN→clé brute ; persistance localStorage `i18n.locale` ; détection `navigator.language` ; sync multi-onglet via event `storage`). **`LanguageSwitcher.vue`** (topbar, à côté de `ThemeSwitcher`). Composants câblés : `App.vue` (sous-titre), `ThemeSwitcher`, `GraphView` (toolbar local/split/distant, animations, placeholders, menu contextuel, confirm/prompt), `RefsSidebar` (toutes les sections + confirm/alert ; boucle tutoriels renommée `t→tuto` pour ne pas masquer `t()`). **Frontière stricte respectée** : le moteur Git n'est jamais localisé (messages d'erreur EN, hashes déterministes inchangés). 1139 tests verts (`tests/i18n.test.ts` 8 : parité, fallback, interpolation, persistance, réactivité).

  Dette B2-i18n (non bloquante, assumée) : **catalogue `git help` NON traduit** (le core reste EN ; spec §5 recommandait de dupliquer le catalogue FR/EN — coût élevé/valeur faible, reporté → CA-i18n-06/07 partiellement non couverts). **Contenu des scénarios/tutoriels** (titres/descriptions/énoncés) reste en FR (données dans `constants/` ; CA-i18n-08 non couvert). Modales (`Conflict`/`Tutorial`/`Rebase`/`Palette`) et `TerminalPanel` non encore traduits (libellés FR). aria-label racine du graphe (`GraphView`) encore en dur. La traduction de ces surfaces s'ajoute incrémentalement (ajouter la clé dans `messages.ts` + les 2 JSON, le test de parité garantit la symétrie).

### Graphe (à connaître pour la Phase 4)

- L'algorithme de layout gère **déjà les merges** (commit à 2+ parents) : le 1er parent continue la lane, les parents secondaires vont sur une lane libre ; collision `(lane,depth)` résolue. Le rendu distingue `type:'merge'`. Quand `git merge` arrivera, le graphe affichera correctement les fusions sans changement du layout.
- Le graphe consomme `snapshot.allCommits ?? snapshot.commits`.

### Modèle Git (décisions à connaître pour les phases suivantes)

- **L'index est un snapshot COMPLET** aligné sur l'arbre de HEAD (comme le vrai Git) — il n'est PAS vidé au commit. « rien à committer » = arbre de l'index identique à l'arbre de HEAD. Ne pas réintroduire un modèle d'index-delta.
- **Hash déterministe mais PAS byte-exact Git** : SHA-1 sur une chaîne canonique lisible (les hashes de commit ne correspondent donc pas à ceux d'un vrai dépôt). Hash court = 7 chars. Auteur constant, date = base fixe + `commitCount` (jamais `Date.now()`).
- **`snapshot().commits[].branches: string[]`** (et non un singulier) : plusieurs refs peuvent décorer un même commit — prévu pour les branches multiples (phase 2) et les labels du graphe (phase 3).
- **Noms de branches** : les `/` sont autorisés (style git-flow `feature/login`). Validation `isValidBranchName` dans `repository.ts` (sous-ensemble de `git check-ref-format` : rejette `/` en tête/fin, `//`, `..`, composant en `.`/`.lock`, espaces et `~ ^ : ? * [ \ @{`, pseudo-refs réservés). Partagée par `git branch`, `checkout -b`, `switch -c`.

### Dette connue (issue de la revue QA Phase 1)

- Hint de `git status` non fidèle au vrai Git (`(use "git commit" to finalize)` au lieu de `git restore --staged`) — choix à trancher.
- Parser : guillemets simples et échappement `\"` non gérés ; guillemet non fermé avalé silencieusement. Suffisant en l'état, à durcir si besoin.
- `git commit -m` : parsing positionnel par `indexOf('-m')`, fragile sur cas tordus (non couvert par tests).
- `git status -s` cas `AM` (stagé puis remodifié) collapse en `modified` dans le snapshot — à tester/affiner en phase 2+.

Dette Phase 2 (revue QA) — **à traiter en Phase 4** (impactent merge/rebase) :
- `git branch -d` et `-D` sont identiques : la sémantique « branche non mergée » n'est PAS vérifiée. Nécessitera un helper `isAncestor(repo, a, b)` (de toute façon requis pour merge/rebase).
- `restore --staged --source=<commit>` combinés : la branche `--source` court-circuite `--staged` (modifie le WT au lieu de l'index). Router selon le quadrant `(isStaged, sourceRef)`.
- `restore` ne valide pas les pathspecs multiples (un chemin inexistant parmi plusieurs est ignoré sans erreur).
- `git checkout -- <pathspec>` (compat restore) non géré.
- `resolveCommitish` : une branche vide (`""`) « consomme » le nom et empêche la résolution d'un tag/hash homonyme ; pas de détection d'ambiguïté tag vs hash court.

Dette Phase 3 (revue QA) — non bloquante :
- `GraphView.vue` : rendu non mémoïsé (`getNodeBadges` appelé 2×/badge, `layout.edges.filter` et `getEdgeColor` en `.find()` O(E·N) à chaque render). À précalculer en `computed` (Map couleur/badges) avant d'afficher de gros graphes.
- Badges typés par comparaison de couleur hex (fragile) → ajouter un champ discriminant `kind: 'head'|'branch'|'tag'`.
- `getColorForCommit` colore par branche puis par lane (incohérence couleur nœud/arête possible) ; le contrat de type dit « couleur par lane ». À unifier.
- `LayoutOptions.nodeRadius` et `LayoutInput.head`/`tags` déclarés mais non utilisés par `computeLayout` (surbrillance HEAD faite côté UI).

Dette Phase 4 (revue QA) — **à traiter en Phase 5** (le rebase interactif s'appuie dessus) :
- `rebase` refuse désormais une branche contenant un merge (corrigé) ; pour le rebase interactif, prévoir une vraie gestion ou conserver le refus.
- **Dédupliquer la logique de replay/diff** : `cmdRebase` et `rebaseContinue` dupliquent ~80 lignes ; `applyDiff`/`makeConflictMarkers` (repository.ts) sont des helpers partiellement morts/divergents (cherry-pick/revert/rebase réimplémentent la boucle inline). Extraire un `replayOneCommit(repo, origCommit, newParent)` avant Phase 5.
- `mergeBase` renvoie une seule base (pas de criss-cross/recursive) ; conflit delete/modify non testable en boîte noire (pas de `git rm`). À documenter/tester en blanc-box.
- Champs morts : `headHashBeforeRevert`/`headHashBeforePick` (conservés par symétrie).

Dette Phase 5 (revue QA) — non bloquante :
- `git revert` n'utilise PAS encore `replayCommit` (applique un diff inversé inline) — la dédup voulue par la spec 24 n'est atteinte qu'aux 2/3 ; nécessiterait une option `invert` sur le helper.
- `git stash list` : format inversé vs git réel (« On » avec message / « WIP on … <short> <subject> » sans) et hash court manquant — cosmétique, à corriger en Phase 6.
- Création de branche/tag n'écrit pas d'entrée reflog (optionnel selon spec).
- Plusieurs tests reflog/stash utilisent des assertions `toContain` assez larges.

Dette Phase 6 (revue QA) — non bloquante (les bloquants/medium R4-persistance-conflit et M2-cohérence-storage-scénario ont été corrigés avant commit) :
- `autocomplete.ts` : complétion par **suffixe** (`candidate.slice(prefix.length)`) alors que le filtre est insensible à la casse → une ref en casse mixte (ex. branche `Feature`) complétée depuis `fe` produit `feature` (casse perdue). Edge case rare ; fix propre = remplacer le dernier token entier par le candidat.
- `RefsSidebar.vue` / `TerminalPanel.vue` (Tab) : **pas de tests auto** (`@vue/test-utils` absent). Relus en revue, mais CA-refs-sidebar-* et l'intégration Tab restent non couverts ; ajouter `@vue/test-utils` en Phase 7 si on veut les automatiser.
- `catalog.ts` : champ `version: '1.0'` déclaré mais non consommé (à câbler ou retirer). `add <pathspec>` a `hasArgument:true` (l'exemple de la spec 29 suggérait `false`) — à trancher.
- `autocomplete.ts` est un **3e tokenizer** du projet (après `parser.tokenize` et le parsing positionnel de `commit -m`), mêmes limites guillemets ; `getCommandNames()` du core non réutilisé (re-tri local). Mutualiser si l'occasion se présente.
- UX : au rechargement, l'historique ↑/↓ (`history`) est perdu (seul `savedCommands` est reconstruit) — choix assumé. `executeScenario` remonte ses erreurs via `console` (pas via `CommandResult`), acceptable car ids statiques.
- `TerminalPanel.vue` : caractères de contrôle littéraux dans le `switch` de `onData` (lint `control-character-in-input-stream`, non bloquant build) — à passer en échappements `\x1b[...`.
