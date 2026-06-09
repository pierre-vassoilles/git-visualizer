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

### Modèle Git (décisions à connaître pour les phases suivantes)

- **L'index est un snapshot COMPLET** aligné sur l'arbre de HEAD (comme le vrai Git) — il n'est PAS vidé au commit. « rien à committer » = arbre de l'index identique à l'arbre de HEAD. Ne pas réintroduire un modèle d'index-delta.
- **Hash déterministe mais PAS byte-exact Git** : SHA-1 sur une chaîne canonique lisible (les hashes de commit ne correspondent donc pas à ceux d'un vrai dépôt). Hash court = 7 chars. Auteur constant, date = base fixe + `commitCount` (jamais `Date.now()`).
- **`snapshot().commits[].branches: string[]`** (et non un singulier) : plusieurs refs peuvent décorer un même commit — prévu pour les branches multiples (phase 2) et les labels du graphe (phase 3).

### Dette connue (issue de la revue QA Phase 1)

- Hint de `git status` non fidèle au vrai Git (`(use "git commit" to finalize)` au lieu de `git restore --staged`) — choix à trancher.
- Parser : guillemets simples et échappement `\"` non gérés ; guillemet non fermé avalé silencieusement. Suffisant en l'état, à durcir si besoin.
- `git commit -m` : parsing positionnel par `indexOf('-m')`, fragile sur cas tordus (non couvert par tests).
- `git status -s` cas `AM` (stagé puis remodifié) collapse en `modified` dans le snapshot — à tester/affiner en phase 2+.
