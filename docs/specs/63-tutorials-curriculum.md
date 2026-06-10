# Phase B2 : Curriculum de tutoriels (15 tutoriels)

## Résumé

Cette spec **définit le contenu concret des 15 tutoriels** spécifiés en Phase B2 (spec 62) : 5 par niveau (Basique, Moyen, Avancé). Pour chaque tutoriel, sont détaillés :

- **ID et métadonnées** : titre, description, durée, difficulté, niveau
- **Séquence d'étapes** : pour chaque étape, l'intitulé, la description pédagogique, les commandes attendues, les objectifs de validation, le « pourquoi/comment », l'effet graphe
- **Prédicats de validation** : helpers existants ou nouveaux nécessaires

**Scope** : Spec 62 définit la **structure et l'architecture** ; spec 63 remplit les **contenus pédagogiques complets**. Cette spec ne rédige pas la prose bilingue finale (trop volumineux), mais fournit une **spec détaillée** permettant aux développeurs (ou à un agent writer) de remplir les 15 tutoriels.

## Niveau BASIQUE (5 tutoriels, 10-20 min chacun)

### Tutoriel 1 : Premier commit

**ID** : `first-commit` | **Niveau** : `basic` | **Difficulté** : 1 | **Durée** : 10 min

**Description** : Apprenez à créer votre premier commit avec Git : initialiser un dépôt, créer un fichier, stager et committer.

**Étapes** (4 au total)

#### Étape 1.1 : Initialiser le dépôt

- **Commande attendue** : `git init`
- **Objectifs** : `isInitialized()`
- **Pourquoi** : Un dépôt Git est un conteneur qui sauvegarde l'historique de vos fichiers. `git init` crée la structure interne (branche `main` par défaut).
- **Effet graphe** : Le graphe passe de « vide » (0 commits) à un état vierge prêt à recevoir des commits.
- **Bouton Exécuter** : Oui

#### Étape 1.2 : Créer un fichier

- **Commande attendue** : `write README.md "# My Project"`
- **Objectifs** : `fileExists('README.md')`
- **Pourquoi** : Un commit sauvegarde l'état des fichiers. Avant de committer, créez un fichier (commande `write` du terminal).
- **Effet graphe** : Aucun changement (le fichier est en working tree, pas encore stagé ni commité).
- **Bouton Exécuter** : Non (contient la saisie libre)

#### Étape 1.3 : Stager le fichier

- **Commande attendue** : `git add README.md`
- **Objectifs** : `isStaged('README.md')`
- **Pourquoi** : L'index (« staging area ») est une zone de préparation. `git add` place les fichiers modifiés dans l'index en vue du commit.
- **Effet graphe** : Aucun changement (l'index n'est pas visible dans le graphe, seulement l'état du fichier change).
- **Bouton Exécuter** : Oui

#### Étape 1.4 : Créer le commit

- **Commande attendue** : `git commit -m "Initial commit"`
- **Objectifs** : `commitCountEquals(1)`, `noStagedChanges()`
- **Pourquoi** : `git commit` crée un snapshot permanent de l'index, avec un message explicatif. L'index redevient propre.
- **Effet graphe** : Le graphe affiche un nœud : le commit C1 avec le label `(main, HEAD)`.
- **Bouton Exécuter** : Oui

**Prédicats** : Tous existants (spec 51).

---

### Tutoriel 2 : Staging area

**ID** : `staging-area` | **Niveau** : `basic` | **Difficulté** : 1 | **Durée** : 15 min

**Description** : Comprenez le rôle de l'index (staging area) : working tree vs index vs HEAD. Apprenez à stager partiellement, visualiser les différences, et restaurer.

**Étapes** (5 au total)

#### Étape 2.1 : Setup

- **Commande attendue** : `git init ; write file.txt "v1" ; git add file.txt ; git commit -m "Initial"`
- **Objectifs** : `commitCountEquals(1)`, `fileExists('file.txt')`
- **Pourquoi** : Préparation : créer un commit de départ sur lequel travailler.
- **Effet graphe** : Graphe affiche C1 (main, HEAD).
- **Bouton Exécuter** : Oui

#### Étape 2.2 : Modifier un fichier

- **Commande attendue** : `write file.txt "v2"`
- **Objectifs** : `fileExists('file.txt')` (pas `noStagedChanges()` — le fichier n'est pas stagé)
- **Pourquoi** : Une modification est d'abord en working tree. Elle n'affecte pas l'index ni HEAD.
- **Effet graphe** : Aucun changement.
- **Bouton Exécuter** : Non

#### Étape 2.3 : Stager la modification

- **Commande attendue** : `git add file.txt`
- **Objectifs** : `isStaged('file.txt')`
- **Pourquoi** : `git add` copie le fichier modifié dans l'index. L'index représente maintenant l'état « prêt à committer ».
- **Effet graphe** : Aucun changement.
- **Bouton Exécuter** : Oui

#### Étape 2.4 : Visualiser la différence avec HEAD

- **Commande attendue** : `git diff --staged`
- **Objectifs** : `isStaged('file.txt')`
- **Pourquoi** : `git diff --staged` montre les changements **stagés** (index vs HEAD). Utile pour relire avant de committer.
- **Effet graphe** : Aucun changement.
- **Bouton Exécuter** : Oui

#### Étape 2.5 : Restaurer un fichier depuis HEAD

- **Commande attendue** : `git restore --staged file.txt`
- **Objectifs** : `noStagedChanges()`
- **Pourquoi** : `git restore --staged` **désindex** un fichier : l'index redevient aligné sur HEAD, tandis que le working tree garde la modification.
- **Effet graphe** : Aucun changement (index n'est pas visible).
- **Bouton Exécuter** : Oui

**Prédicats** : Tous existants.

---

### Tutoriel 3 : Branches basics

**ID** : `branches-basics` | **Niveau** : `basic` | **Difficulté** : 1 | **Durée** : 12 min

**Description** : Apprenez à créer, lister et naviguer entre branches. Comprenez le rôle de HEAD.

**Étapes** (5 au total)

#### Étape 3.1 : Setup

- **Commande attendue** : `git init ; write f.txt "x" ; git add f.txt ; git commit -m "C1"`
- **Objectifs** : `commitCountEquals(1)`, `headPointsTo('main')`
- **Pourquoi** : Préparation.
- **Effet graphe** : C1 avec HEAD → main.
- **Bouton Exécuter** : Oui

#### Étape 3.2 : Créer une branche

- **Commande attendue** : `git branch feature`
- **Objectifs** : `hasBranch('feature')`, `headPointsTo('main')`
- **Pourquoi** : `git branch <name>` crée une nouvelle branche pointant sur le commit courant (HEAD). HEAD ne change pas.
- **Effet graphe** : Deux branches sur C1 (main avec HEAD, feature sans).
- **Bouton Exécuter** : Oui

#### Étape 3.3 : Basculer sur la branche

- **Commande attendue** : `git checkout feature`
- **Objectifs** : `headPointsTo('feature')`, `hasBranch('feature')`
- **Pourquoi** : `git checkout <branche>` déplace HEAD : vous travaillez maintenant sur `feature`. Tous les commits créés appelle seront sur cette branche.
- **Effet graphe** : HEAD se déplace vers feature (sur C1).
- **Bouton Exécuter** : Oui

#### Étape 3.4 : Créer un commit sur feature

- **Commande attendue** : `write f.txt "y" ; git add f.txt ; git commit -m "C2"`
- **Objectifs** : `commitCountEquals(2)`, `headPointsTo('feature')`
- **Pourquoi** : Les commits créés vont sur la branche courante (feature). Le graphe diverge : main et feature se séparent.
- **Effet graphe** : Graphe affiche C1 (main) ← C2 (feature, HEAD).
- **Bouton Exécuter** : Oui

#### Étape 3.5 : Retourner sur main

- **Commande attendue** : `git checkout main`
- **Objectifs** : `headPointsTo('main')`, `commitCountEquals(2)`
- **Pourquoi** : Revenir sur main pour préparer une fusion.
- **Effet graphe** : HEAD se déplace sur main (C1).
- **Bouton Exécuter** : Oui

**Prédicats** : Tous existants.

---

### Tutoriel 4 : Tags & HEAD détaché

**ID** : `tags-detached` | **Niveau** : `basic` | **Difficulté** : 1 | **Durée** : 8 min

**Description** : Apprenez les tags (références immuables aux commits) et HEAD détaché (l'état où vous pointez directement sur un commit, pas une branche).

**Étapes** (4 au total)

#### Étape 4.1 : Setup

- **Commande attendue** : `git init ; write f.txt "1" ; git add f.txt ; git commit -m "C1" ; write f.txt "2" ; git add f.txt ; git commit -m "C2"`
- **Objectifs** : `commitCountEquals(2)`
- **Pourquoi** : Préparation.
- **Effet graphe** : C1 ← C2 (main, HEAD).
- **Bouton Exécuter** : Oui

#### Étape 4.2 : Créer un tag

- **Commande attendue** : `git tag v1.0`
- **Objectifs** : `hasTag('v1.0')`, `commitCountEquals(2)`
- **Pourquoi** : Un tag marque un commit important (ex: release). Contrairement aux branches, les tags ne se déplacent pas lors de nouveaux commits.
- **Effet graphe** : Badge `v1.0` s'affiche sur C2.
- **Bouton Exécuter** : Oui

#### Étape 4.3 : Checkout sur un commit (HEAD détaché)

- **Commande attendue** : `git checkout <hash-C1>`
- **Objectifs** : `isHeadDetached()`, `commitCountEquals(2)`
- **Pourquoi** : Normalement HEAD pointe une branche (mode symbolique). `git checkout <commit>` détache HEAD : il pointe directement le commit. État temporaire, utile pour explorer l'historique.
- **Effet graphe** : Badge HEAD sur C1 sans nom de branche.
- **Bouton Exécuter** : Oui (nécessite dynamic hash substitution dans l'UI/tests)

#### Étape 4.4 : Retourner sur une branche

- **Commande attendue** : `git checkout main`
- **Objectifs** : `headPointsTo('main')`, `not isHeadDetached()`
- **Pourquoi** : Quitter le mode détaché en revenantà une branche.
- **Effet graphe** : HEAD revient sur main (C2).
- **Bouton Exécuter** : Oui

**Prédicats** : Tous existants + `isHeadDetached()` (déjà dans spec 51).

**Note** : Étape 4.3 demande la substitution du hash de C1. Le test doit construire le hash ou le récupérer du snapshot avant l'étape.

---

### Tutoriel 5 : Undo basics

**ID** : `undo-basics` | **Niveau** : `basic` | **Difficulté** : 1 | **Durée** : 10 min

**Description** : Apprenez les façons d'annuler : `git restore` (avant commit), `git reset` (défaire des commits).

**Étapes** (4 au total)

#### Étape 5.1 : Setup

- **Commande attendue** : `git init ; write f.txt "initial" ; git add f.txt ; git commit -m "C1"`
- **Objectifs** : `commitCountEquals(1)`
- **Pourquoi** : Préparation.
- **Effet graphe** : C1 (main, HEAD).
- **Bouton Exécuter** : Oui

#### Étape 5.2 : Modifier et annuler avec restore (working tree)

- **Commande attendue** : `write f.txt "oops" ; git restore f.txt`
- **Objectifs** : `fileExists('f.txt')`
- **Pourquoi** : `git restore` annule les modifications en working tree en copiant depuis l'index (ou HEAD si `--staged`). Utile pour défaire une erreur de saisie.
- **Effet graphe** : Aucun changement.
- **Bouton Exécuter** : Non (deux commandes ; l'utilisateur fait les deux)

#### Étape 5.3 : Stager, puis annuler le staging

- **Commande attendue** : `write f.txt "changed" ; git add f.txt ; git restore --staged f.txt`
- **Objectifs** : `noStagedChanges()`
- **Pourquoi** : `git restore --staged` annule le staging : l'index redevient aligné sur HEAD, le working tree garde la modification.
- **Effet graphe** : Aucun changement.
- **Bouton Exécuter** : Non

#### Étape 5.4 : Committer, puis reset

- **Commande attendue** : `git commit -m "mistake" ; git reset --mixed HEAD~1`
- **Objectifs** : `commitCountEquals(1)`, `noStagedChanges()`
- **Pourquoi** : `git reset --mixed` défait le dernier commit et remet ses changements en working tree (index et HEAD redeviennent alignés sur le parent).
- **Effet graphe** : Le commit "mistake" disparaît du graphe. HEAD revient sur C1.
- **Bouton Exécuter** : Non

**Prédicats** : Tous existants.

---

## Niveau MOYEN (5 tutoriels, 15-25 min chacun)

### Tutoriel 6 : Merge fast-forward vs --no-ff

**ID** : `merge-ff-vs-noff` | **Niveau** : `medium` | **Difficulté** : 2 | **Durée** : 18 min

**Description** : Comprenez la différence entre une fusion rapide (fast-forward) et une fusion classique (true merge) avec --no-ff.

**Étapes** (6 au total)

#### Étape 6.1 : Setup feature branch

- **Commande attendue** : `git init ; write f.txt "v1" ; git add f.txt ; git commit -m "C1" ; git branch feature ; git checkout feature ; write f.txt "v2" ; git add f.txt ; git commit -m "C2"`
- **Objectifs** : `commitCountEquals(2)`, `headPointsTo('feature')`
- **Pourquoi** : Préparation : branch feature 1 commit en avant de main.
- **Effet graphe** : C1 (main) ← C2 (feature, HEAD).
- **Bouton Exécuter** : Oui

#### Étape 6.2 : Revenir sur main

- **Commande attendue** : `git checkout main`
- **Objectifs** : `headPointsTo('main')`
- **Pourquoi** : Préparation avant la fusion.
- **Effet graphe** : HEAD sur main (C1).
- **Bouton Exécuter** : Oui

#### Étape 6.3 : Fusion fast-forward (par défaut)

- **Commande attendue** : `git merge feature`
- **Objectifs** : `commitCountEquals(2)`, `headPointsTo('main')`, `noOperationInProgress()`
- **Pourquoi** : Quand main n'a pas divergé (main est ancestor de feature), Git peut faire une fusion rapide : il déplace juste main vers C2. Pas de nouveau commit.
- **Effet graphe** : C1 ← C2, main bascule de C1 à C2 (linéaire, pas de commit merge visible).
- **Bouton Exécuter** : Oui

#### Étape 6.4 : Nouvelle feature (créer une divergence)

- **Commande attendue** : `git branch feature2 ; git checkout feature2 ; write f.txt "v3" ; git add f.txt ; git commit -m "C3"`
- **Objectifs** : `commitCountEquals(3)`, `headPointsTo('feature2')`
- **Pourquoi** : Création d'une nouvelle branche + commit.
- **Effet graphe** : C1 ← C2 (main) ← C3 (feature2, HEAD).
- **Bouton Exécuter** : Oui

#### Étape 6.5 : Modifier main (créer une vraie divergence)

- **Commande attendue** : `git checkout main ; write f.txt "v2-alt" ; git add f.txt ; git commit -m "C4"`
- **Objectifs** : `commitCountEquals(4)`, `headPointsTo('main')`
- **Pourquoi** : Deux branchesonent modifié le même fichier. Fusion non-FF (merge commit) sera nécessaire.
- **Effet graphe** : C1 ← C2 (main, HEAD), C1 ← C4 (main, HEAD) — fork visible.
- **Bouton Exécuter** : Oui

#### Étape 6.6 : Fusion --no-ff (forcer un merge commit)

- **Commande attendue** : `git merge feature2 --no-ff -m "Merge feature2"`
- **Objectifs** : `commitCountEquals(5)`, `headPointsTo('main')`, `noOperationInProgress()`
- **Pourquoi** : `--no-ff` crée un commit de fusion même si fast-forward était possible (au lieu d'une fusion rapide). Le commit de fusion a 2 parents : graphe préserve l'historique de fusion.
- **Effet graphe** : Graphe affiche C1 ← C2 (main), C1 ← C4 ← C5 (main, HEAD avec 2 parents : C4 et C3).
- **Bouton Exécuter** : Oui

**Prédicats** : Tous existants.

---

### Tutoriel 7 : Merge conflits

**ID** : `merge-conflicts` | **Niveau** : `medium` | **Difficulté** : 2 | **Durée** : 20 min

**Description** : Comprenez les conflits de fusion : comment ils apparaissent, comment les résoudre avec l'éditeur, et finaliser le merge.

**Étapes** (5 au total)

#### Étape 7.1 : Setup avec divergence conflictuelle

- **Commande attendue** : `git init ; write f.txt "line1\nline2" ; git add f.txt ; git commit -m "C1" ; git branch feature ; git checkout feature ; write f.txt "line1\nCHANGED-BY-FEATURE" ; git add f.txt ; git commit -m "C2-feature"`
- **Objectifs** : `commitCountEquals(2)`, `headPointsTo('feature')`
- **Pourquoi** : Préparation : two branches modifient le même fichier à la même ligne.
- **Effet graphe** : C1 ← C2-feature (feature, HEAD).
- **Bouton Exécuter** : Oui

#### Étape 7.2 : Modifier main aussi

- **Commande attendue** : `git checkout main ; write f.txt "line1\nCHANGED-BY-MAIN" ; git add f.txt ; git commit -m "C2-main"`
- **Objectifs** : `commitCountEquals(3)`, `headPointsTo('main')`
- **Pourquoi** : Créer une vraie divergence conflictuelle.
- **Effet graphe** : C1 ← C2-feature (feature), C1 ← C2-main (main, HEAD).
- **Bouton Exécuter** : Oui

#### Étape 7.3 : Merger (conflit)

- **Commande attendue** : `git merge feature`
- **Objectifs** : `noOperationInProgress() === false` (opération = `merging`), `fileExists('f.txt')`
- **Pourquoi** : Le merge s'arrête avec conflit. Les deux versions du fichier sont marquées avec `<<<<<<<`, `=======`, `>>>>>>>`.
- **Effet graphe** : Graphe affiche une état de fusion conflictuelle (badge "Merging" visible dans la sidebar).
- **Bouton Exécuter** : Oui

#### Étape 7.4 : Résoudre le conflit (via modale)

- **Commande attendue** : Utilisateur ouvre la modale d'édition, sélectionne « Garder nos changements » ou édite manuellement, clique « Marquer résolu »
- **Objectifs** : `noOperationInProgress() === false` (toujours merging, fichier n'a plus de marqueurs)
- **Pourquoi** : La modale permet de choisir ours/theirs ou éditer. Une fois résolu, `git add` implicite marque le fichier comme résolu.
- **Effet graphe** : Pas de changement visible (opération toujours en cours).
- **Bouton Exécuter** : Non (interaction modale)

#### Étape 7.5 : Finaliser le merge

- **Commande attendue** : `git merge --continue` OU `git commit -m "Resolved"`
- **Objectifs** : `commitCountEquals(4)`, `headPointsTo('main')`, `noOperationInProgress()`
- **Pourquoi** : Créer le commit de merge après résolution.
- **Effet graphe** : Graphe affiche C4 (merge commit) avec 2 parents : C2-main et C2-feature. Badge "Merging" disparu.
- **Bouton Exécuter** : Oui

**Prédicats** : Tous existants + `noOperationInProgress()` (usage négatif).

**Note** : Étape 7.4 utilise la modale d'édition de conflits (spec 50).

---

### Tutoriel 8 : Rebase basics

**ID** : `rebase-basics` | **Niveau** : `medium` | **Difficulté** : 2 | **Durée** : 15 min

**Description** : Comprenez le rebase : rejouer les commits d'une branche sur une autre base. Linéarisation de l'historique vs merge.

**Étapes** (5 au total)

#### Étape 8.1 : Setup divergence

- **Commande attendue** : `git init ; write f.txt "v1" ; git add f.txt ; git commit -m "C1" ; git branch feature ; git checkout feature ; write f.txt "v2" ; git add f.txt ; git commit -m "C2-feature"`
- **Objectifs** : `commitCountEquals(2)`, `headPointsTo('feature')`
- **Pourquoi** : Préparation.
- **Effet graphe** : C1 ← C2-feature (feature, HEAD).
- **Bouton Exécuter** : Oui

#### Étape 8.2 : Créer un commit sur main

- **Commande attendue** : `git checkout main ; write f.txt "v1b" ; git add f.txt ; git commit -m "C2-main"`
- **Objectifs** : `commitCountEquals(3)`
- **Pourquoi** : Créer une divergence.
- **Effet graphe** : C1 ← C2-feature (feature), C1 ← C2-main (main, HEAD).
- **Bouton Exécuter** : Oui

#### Étape 8.3 : Revenir sur feature

- **Commande attendue** : `git checkout feature`
- **Objectifs** : `headPointsTo('feature')`
- **Pourquoi** : Préparation avant rebase.
- **Effet graphe** : HEAD sur feature (C2-feature).
- **Bouton Exécuter** : Oui

#### Étape 8.4 : Rebase sur main

- **Commande attendue** : `git rebase main`
- **Objectifs** : `commitCountEquals(3)`, `headPointsTo('feature')`, `noOperationInProgress()` (si aucun conflit)
- **Pourquoi** : `git rebase main` rejoue les commits de feature (relatifs à l'ancien ancêtre C1) sur la nouvelle base (C2-main). Les hashes changent (replay), l'historique devient linéaire.
- **Effet graphe** : Linéaire : C1 ← C2-main ← C2-feature' (feature, HEAD). L'ancien C2-feature est inaccessible (garbage).
- **Bouton Exécuter** : Oui

#### Étape 8.5 : Merger feature dans main (maintenant fast-forward)

- **Commande attendue** : `git checkout main ; git merge feature`
- **Objectifs** : `commitCountEquals(3)`, `headPointsTo('main')`
- **Pourquoi** : Après rebase, la fusion est devenue fast-forward (linéaire).
- **Effet graphe** : main bascule sur C2-feature'.
- **Bouton Exécuter** : Oui

**Prédicats** : Tous existants.

**Note** : Les hashes changent après rebase (replay). Tests doivent utiliser des prédicats, pas des hashes littéraux.

---

### Tutoriel 9 : Remote clone/push

**ID** : `remote-clone-push` | **Niveau** : `medium` | **Difficulté** : 2 | **Durée** : 20 min

**Description** : Apprenez les concepts de base du travail distant : cloner un dépôt, pousser des changements.

**Étapes** (5 au total)

#### Étape 9.1 : Cloner un dépôt

- **Commande attendue** : `git clone public-repo` (dépôt prédéfini)
- **Objectifs** : `isInitialized()`, `commitCountEquals(1)`, `hasBranch('main')`
- **Pourquoi** : `git clone` crée une copie locale d'un dépôt distant, avec tout l'historique.
- **Effet graphe** : Graphe passe du « vide » à l'affichage de l'historique du dépôt distant.
- **Bouton Exécuter** : Oui

#### Étape 9.2 : Créer un commit local

- **Commande attendue** : `write readme.txt "local change" ; git add readme.txt ; git commit -m "Local work"`
- **Objectifs** : `commitCountEquals(2)`, `headPointsTo('main')`
- **Pourquoi** : Travailler localement.
- **Effet graphe** : Graphe affiche un nouveau commit en avant de main.
- **Bouton Exécuter** : Oui

#### Étape 9.3 : Vérifier l'upstream

- **Commande attendue** : `git remote -v`
- **Objectifs** : `commitCountEquals(2)` (inchangé)
- **Pourquoi** : Affiche les dépôts distants connus et leurs URLs.
- **Effet graphe** : Pas de changement.
- **Bouton Exécuter** : Oui

#### Étape 9.4 : Définir l'upstream

- **Commande attendue** : `git branch -u origin/main` OU `git branch --set-upstream-to=origin/main`
- **Objectifs** : `commitCountEquals(2)` (inchangé)
- **Pourquoi** : Lier la branche locale main à son équivalent distant (origin/main) pour que `git push`/`git pull` sachent où aller par défaut.
- **Effet graphe** : Pas de changement visible, mais la métadonnée de suivi est établie.
- **Bouton Exécuter** : Oui

#### Étape 9.5 : Pousser vers le distant

- **Commande attendue** : `git push`
- **Objectifs** : `commitCountEquals(2)` (inchangé localement), pas d'erreur push
- **Pourquoi** : `git push` copie les commits locaux vers le dépôt distant et met à jour origin/main.
- **Effet graphe** : Si split-screen activé, le graphe distant se met à jour pour afficher le nouveau commit.
- **Bouton Exécuter** : Oui

**Prédicats** : Nouveaux possibles : `hasRemote(name)`, `branchHasUpstream(name)`. À ajouter en `tutorial-helpers.ts`.

**Nouvelles briques** : Spec 63 introduit **`hasRemote(name)`** (`snap.remotes` existence) et **`branchHasUpstream(name)`** (snippet optionnel).

---

### Tutoriel 10 : Remote fetch/pull

**ID** : `remote-fetch-pull` | **Niveau** : `medium` | **Difficulté** : 2 | **Durée** : 18 min

**Description** : Apprenez à récupérer (fetch) les changements distants et les intégrer (pull) dans la branche locale.

**Étapes** (5 au total)

#### Étape 10.1 : Cloner et configurer upstream

- **Commande attendue** : `git clone collab-repo ; git branch -u origin/main`
- **Objectifs** : `isInitialized()`, `branchHasUpstream('main')`
- **Pourquoi** : Préparation.
- **Effet graphe** : Graphe affiche l'historique du dépôt cloné.
- **Bouton Exécuter** : Oui

#### Étape 10.2 : Créer un commit local

- **Commande attendue** : `write local.txt "my change" ; git add local.txt ; git commit -m "Local"`
- **Objectifs** : Plus de commits que le distant (ahead state).
- **Pourquoi** : Travailler localement.
- **Effet graphe** : Commit local en avant.
- **Bouton Exécuter** : Oui

#### Étape 10.3 : Simuler des changements distants

- **Commande attendue** : (via tests : distant dépôt prédéfini diverge) — utilisateur tape `git fetch`
- **Objectifs** : Le snapshot montre des commits en provenance du distant (ajoutés aux refs.remotes).
- **Pourquoi** : Fetch copie les objets distants et met à jour origin/\* refs.
- **Effet graphe** : Le graphe reçoit des nœuds depuis le distant (si split-screen activé).
- **Bouton Exécuter** : Oui

#### Étape 10.4 : Examiner l'état de suivi

- **Commande attendue** : `git status` OU `git branch -vv`
- **Objectifs** : Affiche « ahead » ou « behind » par rapport à origin/main.
- **Pourquoi** : Vérifier la divergence avant pull.
- **Effet graphe** : Pas de changement.
- **Bouton Exécuter** : Oui

#### Étape 10.5 : Pull (fetch + merge)

- **Commande attendue** : `git pull`
- **Objectifs** : Pas d'opération en cours (si pas de conflit), commits fusionnés.
- **Pourquoi** : `git pull` fetch puis merge les changements distants.
- **Effet graphe** : Graphe affiche un commit merge si le pull fusionnait deux historiques.
- **Bouton Exécuter** : Oui

**Prédicats** : Existants + éventuels `branchHasUpstream(name)`.

---

## Niveau AVANCÉ (5 tutoriels, 20-30 min chacun)

### Tutoriel 11 : Interactive rebase

**ID** : `interactive-rebase` | **Niveau** : `advanced` | **Difficulté** : 3 | **Durée** : 25 min

**Description** : Comprenez le rebase interactif : réordonnancer, squasher, nettoyer l'historique avant push.

**Étapes** (6 au total)

#### Étape 11.1 : Setup avec plusieurs commits

- **Commande attendue** : `git init ; write a.txt "1" ; git add a.txt ; git commit -m "A" ; write b.txt "2" ; git add b.txt ; git commit -m "B" ; write c.txt "3" ; git add c.txt ; git commit -m "C"`
- **Objectifs** : `commitCountEquals(3)`
- **Pourquoi** : Préparation : 3 commits à nettoyer.
- **Effet graphe** : 3 commits linéaires.
- **Bouton Exécuter** : Oui

#### Étape 11.2 : Lancer un rebase interactif

- **Commande attendue** : `git rebase -i HEAD~2` (rebase des 2 derniers commits)
- **Objectifs** : `operationState.rebasing === true` (état)
- **Pourquoi** : `git rebase -i` ouvre la modale InteractiveRebaseModal où l'utilisateur édite le todo list.
- **Effet graphe** : Pas de changement visible (opération interactive, en attente).
- **Bouton Exécuter** : Oui

#### Étape 11.3 : Éditer la todo list (squash)

- **Commande attendue** : Utilisateur édite : `pick A`, `squash B`, `pick C` (dans la modale)
- **Objectifs** : `operationState.rebasing === true` (toujours en cours)
- **Pourquoi** : Marquer B pour squash (fusionner dans A).
- **Effet graphe** : Pas de changement (attente).
- **Bouton Exécuter** : Non (modale)

#### Étape 11.4 : Continuer le rebase

- **Commande attendue** : Utilisateur clique « Continuer » dans la modale
- **Objectifs** : `commitCountEquals(2)`, `noOperationInProgress()`
- **Pourquoi** : Rebase applique la todo list : A et B squashés en un commit, C rejoué.
- **Effet graphe** : Graphe affiche 2 commits (A+B fusionnés, C).
- **Bouton Exécuter** : Non (modale)

#### Étape 11.5 : Vérifier le résultat

- **Commande attendue** : `git log --oneline`
- **Objectifs** : `commitCountEquals(2)`
- **Pourquoi** : L'historique est nettoyé.
- **Effet graphe** : 2 commits visibles.
- **Bouton Exécuter** : Oui

**Prédicats** : Existants + vérification d'opération `rebasing` (utilise `operationState`).

**Note** : Étapes 11.3-11.4 utilisent l'UI InteractiveRebaseModal (spec 27).

---

### Tutoriel 12 : Reset & reflog

**ID** : `reset-reflog` | **Niveau** : `advanced` | **Difficulté** : 3 | **Durée** : 20 min

**Description** : Apprenez le reflog : historique de HEAD. Récupérez un commit « perdu » après un reset.

**Étapes** (5 au total)

#### Étape 12.1 : Setup avec plusieurs commits

- **Commande attendue** : `git init ; write f.txt "1" ; git add f.txt ; git commit -m "C1" ; write f.txt "2" ; git add f.txt ; git commit -m "C2" ; write f.txt "3" ; git add f.txt ; git commit -m "C3"`
- **Objectifs** : `commitCountEquals(3)`
- **Pourquoi** : Préparation.
- **Effet graphe** : 3 commits linéaires.
- **Bouton Exécuter** : Oui

#### Étape 12.2 : Reset --hard (perte de commits visibles)

- **Commande attendue** : `git reset --hard HEAD~1`
- **Objectifs** : `commitCountEquals(2)`
- **Pourquoi** : Simuler une « perte » accidentelle.
- **Effet graphe** : C3 disparaît ; graphe affiche C1, C2.
- **Bouton Exécuter** : Oui

#### Étape 12.3 : Afficher le reflog

- **Commande attendue** : `git reflog`
- **Objectifs** : `commitCountEquals(2)` (inchangé)
- **Pourquoi** : Vérifier que l'historique de HEAD contient l'entrée du reset. L'utilisateur voit : `HEAD@{0}: reset --hard HEAD~1` et `HEAD@{1}: commit C3`.
- **Effet graphe** : Pas de changement.
- **Bouton Exécuter** : Oui

#### Étape 12.4 : Retrouver le commit perdu

- **Commande attendue** : Utilisateur lit le reflog, voit HEAD@{1} pointait sur C3, puis exécute `git reset --hard HEAD@{1}`
- **Objectifs** : `commitCountEquals(3)`
- **Pourquoi** : Récupérer l'état antérieur.
- **Effet graphe** : C3 réapparaît ; graphe affiche C1, C2, C3.
- **Bouton Exécuter** : Oui

**Prédicats** : Existants.

**Note** : Spec 51 avait une version de ce tutoriel ; spec 63 l'enrichit pédagogiquement.

---

### Tutoriel 13 : Cherry-pick & revert

**ID** : `cherry-pick-revert` | **Niveau** : `advanced` | **Difficulté** : 3 | **Durée** : 22 min

**Description** : Apprenez à copier un commit (cherry-pick) ou l'inverser (revert).

**Étapes** (6 au total)

#### Étape 13.1 : Setup avec deux branches

- **Commande attendue** : `git init ; write f.txt "base" ; git add f.txt ; git commit -m "C1" ; git branch feature ; git checkout feature ; write f.txt "feature change" ; git add f.txt ; git commit -m "C2-feature" ; git checkout main`
- **Objectifs** : `commitCountEquals(2)`, `headPointsTo('main')`
- **Pourquoi** : Préparation.
- **Effet graphe** : C1 ← C2-feature (feature), HEAD sur main (C1).
- **Bouton Exécuter** : Oui

#### Étape 13.2 : Cherry-pick un commit de feature

- **Commande attendue** : `git cherry-pick C2-feature` (ou `git cherry-pick feature`)
- **Objectifs** : `commitCountEquals(3)`, `headPointsTo('main')`
- **Pourquoi** : `git cherry-pick` copie un commit sur la branche courante avec un nouveau hash (replay). Utile pour appliquer une partie de l'historique d'une autre branche.
- **Effet graphe** : C1 ← C2-feature (feature), C1 ← C2' (main, HEAD, nouvel hash).
- **Bouton Exécuter** : Oui

#### Étape 13.3 : Créer un commit à inverser

- **Commande attendue** : `write f.txt "oops" ; git add f.txt ; git commit -m "Bad commit"`
- **Objectifs** : `commitCountEquals(4)`, `headPointsTo('main')`
- **Pourquoi** : Préparation pour revert.
- **Effet graphe** : Nouveau commit C4 (Bad commit) sur main.
- **Bouton Exécuter** : Oui

#### Étape 13.4 : Revert le commit

- **Commande attendue** : `git revert HEAD`
- **Objectifs** : `commitCountEquals(5)`, `headPointsTo('main')`
- **Pourquoi** : `git revert` crée un nouveau commit qui inverse les changements du commit spécifié. Contrairement à reset, revert préserve l'historique.
- **Effet graphe** : Nouveau commit C5 (Revert "Bad commit") en montrant le diff inversé.
- **Bouton Exécuter** : Oui

**Prédicats** : Existants.

**Note** : Cherry-pick/revert utilisent le moteur `replayCommit` de phase 4+.

---

### Tutoriel 14 : Stash workflow

**ID** : `stash-workflow` | **Niveau** : `advanced` | **Difficulté** : 3 | **Durée** : 18 min

**Description** : Apprenez le stash : sauvegarder temporairement les modifications sans les committer.

**Étapes** (5 au total)

#### Étape 14.1 : Setup

- **Commande attendue** : `git init ; write f.txt "initial" ; git add f.txt ; git commit -m "C1"`
- **Objectifs** : `commitCountEquals(1)`
- **Pourquoi** : Préparation.
- **Effet graphe** : C1 (main, HEAD).
- **Bouton Exécuter** : Oui

#### Étape 14.2 : Modifier et stasher

- **Commande attendue** : `write f.txt "work in progress" ; git stash push -m "temp"`
- **Objectifs** : `commitCountEquals(1)`, `noStagedChanges()`, working tree clean
- **Pourquoi** : `git stash` sauvegarde les modifications en working tree dans une pile temporaire.
- **Effet graphe** : Le graphe redevient propre (C1).
- **Bouton Exécuter** : Oui

#### Étape 14.3 : Basculer de branche

- **Commande attendue** : `git checkout -b hotfix ; write f.txt "hotfix" ; git add f.txt ; git commit -m "C2-hotfix"`
- **Objectifs** : `commitCountEquals(2)`, `headPointsTo('hotfix')`
- **Pourquoi** : Travailler sur autre chose.
- **Effet graphe** : C1 ← C2-hotfix (hotfix, HEAD).
- **Bouton Exécuter** : Oui

#### Étape 14.4 : Revenir sur main et lister le stash

- **Commande attendue** : `git checkout main ; git stash list`
- **Objectifs** : `headPointsTo('main')`, stash visible (snapshot.stashCount > 0)
- **Pourquoi** : Vérifier les entrées stashées.
- **Effet graphe** : HEAD sur main (C1).
- **Bouton Exécuter** : Oui

#### Étape 14.5 : Appliquer le stash

- **Commande attendue** : `git stash pop`
- **Objectifs** : `commitCountEquals(2)` (l'entrée stash disparaît du stash mais les modifications sont restaurées en WT), working tree has modifications
- **Pourquoi** : Récupérer les modifications mises de côté.
- **Effet graphe** : Pas de changement visible (modifications en WT).
- **Bouton Exécuter** : Oui

**Prédicats** : Nouveaux : `hasStashCount(n)` (recommandé). Voir notes.

**Nouvelles briques** : **`hasStashCount(n)`** helper pour vérifier `snapshot.stashCount >= n`.

---

### Tutoriel 15 : Pull rebase collab

**ID** : `pull-rebase-collab` | **Niveau** : `advanced` | **Difficulté** : 3 | **Durée** : 20 min

**Description** : Apprenez à gérer les push rejetés (non fast-forward) dans un workflow collaboratif : pull --rebase suivi d'un push.

**Étapes** (5 au total)

#### Étape 15.1 : Cloner et créer un commit

- **Commande attendue** : `git clone feature-repo ; write local.txt "my work" ; git add local.txt ; git commit -m "Local"`
- **Objectifs** : `commitCountEquals(2)`, `branchHasUpstream('main')`
- **Pourquoi** : Préparation.
- **Effet graphe** : Graphe du dépôt cloné + nouveau commit local.
- **Bouton Exécuter** : Oui

#### Étape 15.2 : Simuler un push rejeté (distant diverge)

- **Commande attendue** : (Via tests : distant reçoit des commits) `git push` (échoue, non-FF)
- **Objectifs** : exitCode != 0 (push échoue)
- **Pourquoi** : Le distant a de nouveaux commits que local ne connaît pas.
- **Effet graphe** : Pas de changement (push rejected).
- **Bouton Exécuter** : Oui

#### Étape 15.3 : Fetch les changements

- **Commande attendue** : `git fetch`
- **Objectifs** : Commit distant mis à jour dans refs.remotes
- **Pourquoi** : Mettre à jour la vue du distant.
- **Effet graphe** : Si split-screen, graphe distant se met à jour.
- **Bouton Exécuter** : Oui

#### Étape 15.4 : Pull --rebase

- **Commande attendue** : `git pull --rebase`
- **Objectifs** : `noOperationInProgress()` (si pas de conflit), commits linéarisés
- **Pourquoi** : `git pull --rebase` au lieu du merge par défaut, pour garder l'historique linéaire.
- **Effet graphe** : Historique linéaire (rebase replay).
- **Bouton Exécuter** : Oui

#### Étape 15.5 : Push maintenant réussi

- **Commande attendue** : `git push`
- **Objectifs** : exitCode === 0, pas d'opération en cours
- **Pourquoi** : Après rebase, le push est maintenant fast-forward et accepté.
- **Effet graphe** : Si split-screen, distant se met à jour.
- **Bouton Exécuter** : Oui

**Prédicats** : Existants + `branchHasUpstream(name)`.

---

## Prédicats suggérés (nouveaux)

À ajouter dans `src/core/tutorial-helpers.ts` si nécessaire :

```typescript
/** Le nombre d'entrées stashées est >= n. */
export function hasStashCount(n: number): (snap: RepoSnapshot) => boolean {
  return (snap) => (snap.stashCount ?? 0) >= n;
}

/** Branche `name` a un upstream défini. */
export function branchHasUpstream(name: string): (snap: RepoSnapshot) => boolean {
  return (snap) => {
    const upstream = snap.branchUpstream?.[name];
    return !!upstream; // upstream est une clé "origin/main" si définie
  };
}

/** Dépôt distant `name` existe. */
export function hasRemote(name: string): (snap: RepoSnapshot) => boolean {
  return (snap) => name in (snap.remotes ?? {});
}
```

**Faisabilité confirmée** (vérifiée contre `RepoSnapshot` dans `src/core/engine.ts`) : le snapshot expose bien `stashCount?: number`, `branchUpstream?: Record<string, {remote, branch}>` et `remotes?: Record<...>`. Les trois prédicats ci-dessus sont donc implémentables tels quels (avec les coalescences `?? {}` / `?? 0` pour les champs optionnels). Aucun enrichissement du snapshot n'est nécessaire.

## Résumé du curriculum

| #   | ID                 | Niveau   | Difficulté | Durée | Sujet                                 |
| --- | ------------------ | -------- | ---------- | ----- | ------------------------------------- |
| 1   | first-commit       | basic    | 1          | 10    | init, add, commit                     |
| 2   | staging-area       | basic    | 1          | 15    | index vs WT vs HEAD, restore          |
| 3   | branches-basics    | basic    | 1          | 12    | branch, checkout, HEAD                |
| 4   | tags-detached      | basic    | 1          | 8     | tag, checkout <commit>, detached      |
| 5   | undo-basics        | basic    | 1          | 10    | restore, reset --mixed                |
| 6   | merge-ff-vs-noff   | medium   | 2          | 18    | ff merge, --no-ff                     |
| 7   | merge-conflicts    | medium   | 2          | 20    | merge conflit, résolution, --continue |
| 8   | rebase-basics      | medium   | 2          | 15    | rebase, linéarisation                 |
| 9   | remote-clone-push  | medium   | 2          | 20    | clone, remote, push -u                |
| 10  | remote-fetch-pull  | medium   | 2          | 18    | fetch, branch -u, pull                |
| 11  | interactive-rebase | advanced | 3          | 25    | rebase -i, squash, reorder            |
| 12  | reset-reflog       | advanced | 3          | 20    | reset, reflog, HEAD@{n}               |
| 13  | cherry-pick-revert | advanced | 3          | 22    | cherry-pick, revert                   |
| 14  | stash-workflow     | advanced | 3          | 18    | stash push/pop/list                   |
| 15  | pull-rebase-collab | advanced | 3          | 20    | pull --rebase, push rejeté            |

**Total** : 255 minutes (~4h25) pour les 15 tutoriels.

## Notes finales

1. **Contenu bilingue** : Spec 63 ne rédige pas la prose complète FR/EN. Un agent writer ou l'équipe pédagogique remplira les champs `explanation` et `graphEffect` une fois cette structure validée.

2. **Prédicats** : Les 3 nouveaux prédicats (`hasStashCount`, `branchHasUpstream`, `hasRemote`) doivent être vérifiés auprès de la structure RÉELLE du snapshot (Phase 9+).

3. **Dépôts prédéfinis** : Tutoriels 9-15 utilisent des dépôts clonable (public-repo, collab-repo, feature-repo, etc.). Vérifier la structure existante en `src/constants/predefinedRemotes.ts`.

4. **Tests** : Chaque tutoriel doit valider via CA (Critères d'Acceptation de spec 62). Un test suite : `tests/curriculum.test.ts` automatise les CA-tut62-\* et vérifierait que tous les 15 tutoriels ont les champs attendus.
