# Git Visualizer

> Un terminal web virtuel où vous tapez de **vraies commandes Git**, exécutées par
> un moteur Git réimplémenté de zéro en TypeScript, et où vous voyez le DAG des
> commits (branches, fusions, rebases, dépôts distants) se dessiner en direct.

Un bac à sable pour apprendre Git. Pas de vrai système de fichiers, pas de vrai
réseau — tout tourne dans le navigateur contre un moteur en mémoire déterministe :
la même séquence de commandes produit toujours le même graphe. Vous tapez `git`,
vous voyez l'arbre.

🇬🇧 _An English version of this document is available: [README.md](./README.md)._

---

## Pourquoi

La plupart des outils « apprendre Git » animent un script figé ou enrobent le
binaire `git` réel. Git Visualizer fait ni l'un ni l'autre : il **réimplémente la
sémantique de Git** (objets, refs, index, working tree, réécriture d'historique)
en TypeScript pur, testable headless, puis rend le modèle obtenu sous forme de DAG
coloré. Vous pouvez tout casser, réécrire l'historique, résoudre des conflits,
pousser/tirer vers un distant simulé — et *voir* exactement ce que chaque commande
fait au graphe.

## Fonctionnalités

### Un (vrai) moteur Git

- **Objets & hachage déterministe** — blobs, trees, commits avec un SHA-1 pur sur
  une chaîne canonique (déterministe, mais **pas** identique octet pour octet au
  vrai Git).
- **Modèle de dépôt complet** — refs (branches/tags), HEAD symbolique & détaché,
  index de staging, working tree virtuel, reflog, stash, distants & suivi
  d'upstream.
- **Plus de 30 commandes Git** (voir [ci-dessous](#commandes-git-prises-en-charge)),
  dont la réécriture d'historique (`rebase`, y compris **interactif** `rebase -i`),
  les fusions 3-way avec marqueurs de conflit, `cherry-pick`, `revert`,
  `reset --soft/--mixed/--hard`.
- **Distants sans réseau** — `clone`/`fetch`/`push`/`pull` se réduisent à copier
  des objets adressés par contenu entre stores en mémoire : un commit poussé
  conserve son hash exact des deux côtés.
- **Erreurs fidèles à Git** — les erreurs utilisateur renvoient des messages et
  des codes de sortie façon git, jamais d'exceptions.

### Visualisation & UX

- **DAG des commits en direct** — layout SVG maison (tri topologique → lanes →
  couleurs → géométrie) avec pan/zoom, badges branche/tag/HEAD, et **animations**
  de transition fluides pour commit, merge, rebase et reset.
- **Vue distante en split-screen** — graphes local | distant côte à côte, avec
  surlignage des commits non poussés / non récupérés.
- **Terminal xterm.js** — historique des commandes (↑/↓), autocomplétion Tab
  (commandes, flags, refs), sortie ANSI colorisée pour `git diff` / `git log --graph`.
- **Éditeur de conflits** — modale 3-way (ours / theirs / résultat) au lieu d'éditer
  les marqueurs `<<<<<<<` à la main.
- **Modale de rebase interactif** — réordonner / pick / reword / squash / fixup / drop.
- **Tutoriels guidés & scénarios** — leçons pas-à-pas avec objectifs auto-validés,
  plus des scénarios de dépôt préconstruits.
- **Palette de commandes** (`Ctrl/Cmd+K`), refs cliquables & menus contextuels sur
  les commits.
- **Thème sombre**, mise en page responsive, navigation clavier, ARIA sur le graphe.
- **i18n** — interface français / anglais (les messages d'erreur Git restent en
  anglais, comme le vrai Git).
- **Persistance** — votre session est restaurée au rechargement par rejeu
  déterministe.

## Architecture

Principe directeur : **toute la sémantique Git vit dans `src/core/` (TypeScript
pur, zéro import Vue) et est testable headless via Vitest.** L'UI (store Pinia +
composants Vue + xterm + SVG) ne fait que parser l'entrée et rendre l'état — elle
ne contient aucune logique Git.

```
xterm (TerminalPanel) → store.execute(cmd) → core/engine.execute()
                                                   ↓ mute le Repository
        snapshot réactif Pinia ← (graphe, sidebar, statut) re-render
```

| Couche             | Emplacement          | Responsabilité                                                       |
| ------------------ | -------------------- | -------------------------------------------------------------------- |
| **Moteur**         | `src/core/`          | `engine.ts` (point d'entrée public stable), `parser.ts`, `repository.ts`, `objectStore.ts`, `commands/` (un module par commande), `model/`. |
| **Store**          | `src/stores/repo.ts` | Façade Pinia — possède l'instance du moteur, expose `execute()` + un snapshot réactif gelé. **Seule** passerelle entre l'UI et le moteur. |
| **Layout du graphe** | `src/graph/`       | Algorithme de layout pur consommé par `GraphCanvas.vue` (pas de lib gitgraph — reset/rebase réécrivent l'historique, donc le rendu est piloté par notre propre modèle). |
| **Composants**     | `src/components/`    | `TerminalPanel`, `GraphView`/`GraphCanvas`, `RefsSidebar`, modales conflit & rebase, palette de commandes… |

Le moteur expose un `snapshot()` immuable et gelé pour l'UI ; le store le pose dans
un `ref` réactif. Le layout (`computeLayout`), le diff (`diffSides`), le tokenizer,
le matching `.gitignore` et le parsing de conflits sont tous des **fonctions pures**.

## Démarrage

Prérequis : Node.js 18+ et npm.

```bash
npm install
npm run dev        # serveur de dev Vite → http://localhost:5173
```

Ouvrez ensuite le panneau terminal et tapez, par exemple :

```bash
git init
write hello.txt "première ligne"   # `write`/`read` sont des utilitaires de FS virtuel
git add hello.txt
git commit -m "commit initial"
git checkout -b feature
write hello.txt "deuxième ligne"
git commit -am "travail sur feature"
git checkout main
git merge feature
```

…et regardez le graphe se mettre à jour après chaque commande.

## Scripts

```bash
npm run dev          # serveur de dev Vite
npm run build        # vue-tsc -b (typecheck strict) + build de prod
npm run typecheck    # typecheck seul
npm test             # Vitest, une passe (1185+ tests)
npm run test:watch   # Vitest en watch
npm run lint         # ESLint (.ts/.vue)
npm run format       # Prettier
npx vitest run tests/engine.test.ts   # un seul fichier de test
```

## Commandes Git prises en charge

| Catégorie                  | Commandes                                                                |
| -------------------------- | ------------------------------------------------------------------------ |
| Initialisation & config    | `init`, `config`, `help`                                                 |
| Instantanés                | `add`, `status`, `commit`, `rm`, `mv`, `restore`, support `.gitignore`   |
| Branches & navigation      | `branch`, `checkout` (`-b`, `--detach`, `-- <path>`), `switch`, `tag`     |
| Inspection                 | `log` (`--graph`, `--oneline`), `diff` (`--staged`, `<a> <b>`), `show`, `reflog`, `rev-parse` |
| Fusion & réécriture        | `merge` (`--no-ff`, `--abort`, `--continue`), `reset`, `revert`, `cherry-pick`, `rebase`, `rebase -i` |
| Remisage                   | `stash` (`push`/`list`/`pop`/`apply`/`drop`)                             |
| Distants                   | `remote`, `clone`, `fetch`, `push` (`-u`, `-f`), `pull` (`--rebase`)      |
| Révisions                  | `HEAD~n`, `<ref>~n`, `HEAD@{n}`, `@{upstream}`/`@{u}`, `<remote>/<branch>`, hashes courts |

`git help` / `git help <commande>` lit un catalogue de commandes unique
(`src/core/catalog.ts`) qui alimente aussi l'autocomplétion Tab.

## Structure du projet

```
src/
  core/            # le moteur Git (TS pur, zéro Vue) — engine, parser, repository,
    commands/      #   objectStore, diff, gitignore, tokenizer, sha1, + un fichier par commande
  graph/           # algorithmes purs de layout / culling / graphe ASCII
  stores/          # store Pinia (repo.ts) — la façade UI↔moteur
  components/      # composants Vue (terminal, graphe, sidebar, modales, palette)
  composables/     # thème, animations du graphe
  constants/       # scénarios, tutoriels, dépôts distants prédéfinis
  i18n/            # messages FR/EN
  utils/           # autocomplétion, stockage, chaînage shell, recherche palette
tests/             # suites Vitest (moteur + composants)
docs/
  specs/           # specs numérotées par fonctionnalité (source de vérité des tests)
  USAGE.md         # référence complète des commandes (côté utilisateur)
  ROADMAP.md       # feuille de route post-Phase 6
```

## Workflow de développement

Le projet est construit phase par phase. Chaque fonctionnalité (et chaque commande
Git non triviale) suit un **cycle à 5 étapes**, chaque étape étant déléguée à un
agent spécialisé : **specs → doc → dev → tests → QA**. Le comportement de référence
est le `git` réel.

Conventions vérifiées à la revue :

- **Aucune logique Git dans les composants ni le store** — uniquement dans `core/`.
  Le store est une façade fine.
- Le moteur ne lève jamais d'exception pour une erreur utilisateur — il retourne
  `fail([...])` avec des messages façon git. Le `throw` est réservé aux bugs internes.
- Toute commande ajoutée dans `core/commands/` arrive avec ses tests Vitest.
- Les tests sont dérivés de `docs/specs/`, pas de l'implémentation.
- TypeScript strict partout (`noUnusedLocals` / `noUnusedParameters` actifs —
  `npm run build` casse sur un import inutilisé).

Voir [`CLAUDE.md`](./CLAUDE.md) pour les notes d'architecture complètes et
l'historique des phases, et [`docs/USAGE.md`](./docs/USAGE.md) pour la référence
complète des commandes.

## Stack technique

Vue 3 · Vite · Pinia · TypeScript (strict) · xterm.js · Vitest · layout SVG maison.

## Licence

[MIT](./LICENSE)
