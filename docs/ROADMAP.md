# Feuille de route — évolutions post-Phase 6

Document de planification. Les phases 0 à 6 sont livrées (voir `CLAUDE.md`).
Chaque phase ci-dessous suit le **cycle agentique à 5 étapes** du projet
(specs → doc → dev → tests → QA, voltagent) et la **porte de validation**
habituelle (specs écrites, `npm run build` vert, `npm test` vert, revue QA sans
bloquant). Principe directeur inchangé : **toute la sémantique Git vit dans
`src/core/` (TS pur, testable headless)** ; l'UI ne fait que parser l'entrée et
rendre l'état.

---

## Axe A — Dépôt distant (`origin`) + visualisation split-screen

Objectif demandé : gérer un dépôt distant et ses commandes (`push`/`pull`/
`fetch`…), et afficher le graphe du distant en split-screen à côté du local.

### Décisions d'architecture (transverses aux phases 7-9)

- **Deux dépôts en mémoire.** Le `GitEngine` possède aujourd'hui un seul
  `Repository`. On ajoute un registre de dépôts distants `remotes: Record<string,
  RemoteRepository>` (au moins `origin`). Un distant est un dépôt **bare**
  (object store + `refs.heads` + HEAD par défaut ; ni index ni working tree).
- **Copie d'objets, pas de réseau.** Le hash étant déterministe et
  content-addressed, `fetch`/`push` se réduisent à **copier les objets manquants**
  d'un object store vers l'autre puis à bouger des refs. Un commit poussé conserve
  exactement son hash → cohérence visuelle parfaite entre les deux graphes.
- **Refs de suivi à distance.** Le dépôt local gagne `refs.remotes:
  Record<remote, Record<branch, hash>>` (= `refs/remotes/origin/main`). Elles ne
  bougent QUE via `fetch`/`push`/`clone`, jamais via un commit local.
- **Upstream tracking.** `branchUpstream: Record<branch, { remote, branch }>`
  (équivalent `branch.<name>.remote` / `.merge`). Posé par `push -u` / `clone` /
  `branch --set-upstream-to`. Active la révision `@{upstream}` / `@{u}` et le
  calcul ahead/behind.
- **Snapshot enrichi (contrat UI).** `snapshot.remotes[name]` expose le graphe du
  distant (mêmes `allCommits` que le local, réutilisables tels quels par le
  layout) ; `snapshot.remoteTrackingRefs` décore le graphe local de labels
  `origin/main` ; `snapshot.tracking[branch] = { ahead, behind, upstream }` pour
  les indicateurs de synchro.
- **Pas de réécriture du layout.** `computeLayout` est déjà pur et générique : on
  l'appelle une 2ᵉ fois sur les commits du distant. Le composant graphe sera
  rendu **paramétrable** (entrée passée en prop) pour servir local ET distant.

### Phase 7 — Modèle distant & récupération (`remote`, `clone`, `fetch`)

- **Modèle** (`model.ts`) : `RemoteRepository`, `refs.remotes`, `branchUpstream`.
- **Helpers** (`repository.ts`) : `copyMissingObjects(src, dst)`,
  `updateRemoteTrackingRef`, `computeAheadBehind(repo, local, remoteRef)` (via
  `isAncestor` + comptage), `resolveCommitish` étendu à `origin/<branch>` et
  `@{upstream}`/`@{u}`.
- **Commandes** :
  - `git remote` / `git remote -v` / `git remote add <nom> <url>` /
    `git remote remove <nom>` — l'`<url>` est symbolique (cosmétique).
  - `git clone <source>` — sans réseau : **amorce** un distant `origin` à partir
    d'un dépôt distant prédéfini (réutilise l'infra des scénarios), copie ses
    objets/branches dans un nouveau dépôt local, pose `origin/*` et l'upstream.
  - `git fetch [<remote>] [<branch>]` — copie les objets manquants du distant,
    met à jour `refs/remotes/origin/*`. **Ne touche ni aux branches locales ni au
    working tree.**
- **Snapshot** : `remotes`, `remoteTrackingRefs`, `tracking` (ahead/behind).
- **Tests headless** : clone amorce un état cohérent ; fetch met à jour les refs
  de suivi sans bouger HEAD ; déterminisme (mêmes hashes des deux côtés).

### Phase 8 — Publication & intégration (`push`, `pull`, tracking)

- **`git push [<remote>] [<branch>] [-u] [--force]`** : copie les commits locaux
  vers le distant, met à jour `remote.refs.heads[branch]` ET la ref de suivi
  locale. **Refus si non-fast-forward** (message git : « Updates were rejected… »)
  sauf `--force`. `-u` pose l'upstream. Création de branche distante si absente.
- **`git pull [<remote>] [<branch>] [--rebase]`** = `fetch` + `merge` (défaut) ou
  `rebase` de l'upstream dans la branche courante. **Réutilise les machines merge
  et rebase existantes** (Phase 4) → conflits gérés par le mécanisme actuel.
- **Tracking** : `git branch --set-upstream-to`, révision `@{upstream}`/`@{u}`,
  `git branch -vv` (affiche `[origin/main: ahead 2, behind 1]`), `git status`
  enrichi (« Your branch is ahead of 'origin/main' by N commits »).
- **Tests** : push fast-forward ; push rejeté puis `pull --rebase` puis push ;
  pull divergent → merge commit ; pull avec conflit ; upstream posé/lu.

### Phase 9 — Split-screen & synchronisation visuelle

- **Refactor `GraphView.vue`** en composant **paramétrable** : extraire la logique
  de rendu dans un `GraphCanvas` recevant un `GraphLayout` en prop ; `GraphView`
  devient un conteneur. (Au passage : traiter la dette Phase 3 — mémoïsation des
  badges/couleurs en `computed`, champ `kind` sur les badges.)
- **Layout split-screen** : zone graphe = `local | distant` côte à côte, avec
  bascule (plein écran local / split / distant seul) et option de zoom/pan
  synchronisés. Le distant consomme `snapshot.remotes.origin`.
- **Décorations de synchro** : badges `origin/main` (nouveau `kind:'remote'`) sur
  le graphe local ; mise en évidence des commits « non poussés » (présents en
  local, absents du suivi) et « à récupérer » (présents côté distant).
- **Sidebar** : section « Distant » (remotes + url, upstream par branche,
  indicateur `↑ahead ↓behind`), boutons Fetch / Push / Pull.
- **Scénarios distants** : `clone` → commit → `push` ; `fetch` divergent →
  `pull` ; push rejeté → `pull --rebase` → push ; collaboration simulée (deux
  branches qui divergent du distant).

---

## Axe B — Idées d'évolution complémentaires

Regroupées par thème, avec une estimation d'effort indicative (S/M/L) et la
valeur pédagogique. À prioriser selon l'usage visé (outil d'apprentissage).

### B1. Contenu Git (compléter la couverture du moteur)

- **`git diff` / `git show`** (M, **forte valeur**) — diff working tree vs index,
  index vs HEAD, entre deux commits/branches ; `git show <commit>`. Débloque un
  **visualiseur de diff** dans l'UI (panneau ou modale) — très pédagogique.
- **`git rm` / `git mv`** (S) — supprime/déplace un fichier suivi. Lève aussi la
  dette QA Phase 4 : permet de **tester les conflits delete/modify** en boîte
  noire.
- **`.gitignore`** (S/M) — fichiers ignorés exclus du statut/`add`.
- **`git config`** (S) — `user.name` / `user.email` (personnalise l'auteur, qui
  est aujourd'hui constant), alias de commandes.
- **`git restore`/`checkout -- <path>` complets** (S) — solde la dette Phase 2
  (quadrant `--staged` × `--source`, `checkout -- <pathspec>`).
- **Merge récursif / criss-cross** (L) — `mergeBase` ne renvoie qu'une base ;
  gérer les bases multiples (dette Phase 4).
- **`git bisect`** (M) — recherche dichotomique d'un commit fautif, excellent pour
  l'apprentissage.
- **`git blame` simplifié** (M) — annoter les lignes par dernier commit.

### B2. UX & pédagogie

- **Éditeur de résolution de conflits** (M, **forte valeur**) — interface 3-way
  (ours/theirs/résultat) au lieu d'éditer les marqueurs `<<<<<<<` à la main via
  `write`.
- **Tutoriels guidés pas-à-pas** (M) — au-dessus des scénarios : objectifs,
  vérification d'état, indices. Transforme l'outil en parcours d'apprentissage.
- **Animations de transition du graphe** (M) — animer commit/merge/rebase/reset
  pour *voir* la réécriture d'historique. Très parlant.
- **Refs cliquables** (S) — clic sur une branche/tag dans la sidebar ou le graphe
  → `checkout` ; menu contextuel sur un commit (reset, revert, cherry-pick, tag).
- **`git log --graph` ASCII** dans le terminal (S) — rendu texte de l'arbre.
- **Internationalisation** (M) — l'UI et les messages sont en français ;
  ajouter l'anglais (les messages d'erreur git sont déjà en anglais).
- **Thème sombre / responsive / accessibilité** (S/M) — confort et a11y (ARIA sur
  le SVG, navigation clavier).
- **Palette de commandes / aide contextuelle** (S) — `Ctrl+K`, suggestions selon
  l'état du dépôt.

### B3. Session & partage

- **Export / import de session** (S) — sérialiser l'historique de commandes en
  fichier JSON (le déterministe garantit le rejeu). Annoncé comme « Phase 7 » dans
  `docs/specs/31-persistence.md`.
- **Liens partageables** (M) — encoder une session dans l'URL (ou un short-link)
  pour partager un exercice ou un état.
- **Undo / redo applicatif** (M) — navigation avant/arrière dans l'historique des
  snapshots (distinct du reflog Git), pour explorer sans crainte.

### B4. Qualité & technique (dette + robustesse)

- **`@vue/test-utils`** (S) — solde la dette Phase 6 : tests composants pour
  `RefsSidebar`, l'intégration Tab de `TerminalPanel`, et le futur split-screen.
- **Mémoïsation du graphe** (S) — dette Phase 3 : précalcul couleurs/badges en
  `computed`, `kind` discriminant sur les badges (utile pour l'axe A).
- **Fix casse autocomplétion** (S) — dette Phase 6 : compléter en remplaçant le
  token entier plutôt qu'en ajoutant un suffixe (refs en casse mixte).
- **Performance gros DAG** (M) — virtualisation/culling du SVG pour de grands
  historiques (agent `performance-engineer`).
- **Reflog des branches & à la création** (S) — dette Phase 5.
- **Mutualisation des tokenizers** (S) — `parser.tokenize`, `autocomplete`,
  parsing positionnel de `commit -m` : une seule implémentation robuste
  (guillemets simples, échappements).

---

## Séquencement recommandé

1. **Phase 7 → 8 → 9** (axe A) — la demande principale ; 7 et 8 sont du moteur
   pur (testable headless), 9 est l'UI. Embarquer au passage la dette graphe
   (B4 mémoïsation/`kind`) lors du refactor de la Phase 9.
2. **B1 `git diff`/`show` + visualiseur de diff** — fort levier pédagogique,
   relativement isolé, peut se faire en parallèle de l'axe A.
3. **B1 `git rm`/`mv`** — petit, lève une dette de test des conflits.
4. **B2 éditeur de conflits + tutoriels guidés** — capitalise sur les scénarios et
   les conflits déjà gérés.
5. **B3 export/partage**, puis le reste de B2/B4 au fil de l'eau.

> Les estimations S/M/L et l'ordre sont indicatifs : à arbitrer selon que la
> priorité est la **fidélité à Git** (axe B1) ou l'**expérience d'apprentissage**
> (axe B2) — l'axe A (distant + split-screen) sert les deux.
