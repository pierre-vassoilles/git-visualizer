# Audit de conformité Git — moteur vs git réel

> Audit du 2026-06-11. Six passes parallèles (basics / navigation / réécriture /
> outils / distant / contenu), chaque comportement douteux **vérifié contre un
> vrai git** dans un dépôt jetable. Les divergences déjà documentées et assumées
> (hash non byte-exact, messages reformulés, sous-ensemble gitignore, etc.) sont
> exclues.
>
> Sévérités : **HIGH** = enseigne un comportement faux de git / perte de données /
> état incorrect · **MEDIUM** = divergence notable de sortie ou de cas limite ·
> **LOW** = cosmétique.
>
> Plan de correction en fin de document (lots priorisés).

---

## 1. Commandes de base (init / add / status / commit / log)

### BAS-01 — HIGH — commit en HEAD détaché ne fait PAS avancer HEAD (commit orphelin)
`src/core/repository.ts:202-228` (`createCommit`) + `src/core/commands/commit.ts:65-66`.
Le commit est créé mais `repo.head.target` n'est jamais mis à jour en détaché →
commit inaccessible, log inchangé. En prime le headline dit faussement
`(root-commit)` (`isRoot` calculé sur `refs.heads['HEAD']`, toujours vrai).
Git réel : HEAD avance, headline `[detached HEAD <short>] msg`.
**Fix** : dans `createCommit`/`createCommitWithParents`, si `!repo.head.symbolic`,
poser `repo.head.target = commitHash` ; `isRoot = parents.length === 0` ;
headline `detached HEAD`.

### BAS-02 — HIGH — `git log` ne suit que le 1er parent (commits mergés absents)
`src/core/commands/log.ts:15` via `getCommitHistoryWithHashes` (`repository.ts:258-275`).
Après un merge, les commits de la branche fusionnée n'apparaissent pas (seul
`--graph` traverse tous les parents). Enseigne que merger n'intègre pas l'historique.
**Fix** : traversée complète (même BFS que `logGraph`), tri date desc/topo.

### BAS-03 — HIGH — `git init` détruit le working tree pré-init
`src/core/commands/init.ts:16-25`. `write a.txt … ; git init` → fichier perdu
(`repo.workingTree = {}`). Git réel ne touche jamais aux fichiers existants.
**Fix** : ne pas réassigner `workingTree` dans la branche fresh-init.

### BAS-04 — HIGH — `--amend` ignoré → crée un commit supplémentaire
`src/core/commands/commit.ts:36` (pas de validation de flags).
`git commit --amend -m x` crée un 2e commit ; `--amend` seul → erreur trompeuse.
**Fix** : implémenter `--amend` (nouveau commit avec les parents du tip, déplacer
la ref) ou rejeter explicitement les flags inconnus.

### BAS-05 — MEDIUM — `commit -a` / `-am` non gérés, message trompeur
`commit.ts:22-52`. `-a` ignoré → « no changes added to commit » alors que des
modifs suivies existent ; `-am` → « option '-m' is required ».
**Fix** : stager les fichiers suivis (incl. suppressions WT) quand `-a`/`-am`.

### BAS-06 — MEDIUM — `git add <dir>` rejeté (pathspec répertoire non supporté)
`add.ts:36-43`. Incohérent avec `rm -r` qui le supporte.
**Fix** : étendre le pathspec à tous les chemins `== spec` ou sous `spec/`.

### BAS-07 — MEDIUM — impossible de stager une suppression
`add.ts:36-43, 30-33`. Fichier dans l'index absent du WT : `git add <f>` →
pathspec error ; `git add .` n'itère que le WT.
Git réel : `git add f` stage la suppression (`D `).
**Fix** : si le pathspec matche une entrée d'index sans fichier WT, `delete repo.index[path]` ;
pour `.`, itérer aussi les clés d'index manquantes au WT.

### BAS-08 — MEDIUM — `git add -A`/`-u` traités comme des pathspecs
`add.ts:18-19`. `git add -A` → « pathspec '-A' did not match ».
**Fix** : implémenter `-A`/`--all` (union WT+index, respect ignore) et/ou
`error: unknown switch` pour les tokens en `-`.

### BAS-09 — MEDIUM — status long détaché : « On branch HEAD detached at … »
`status.ts:27-32, 152`. Git réel : `HEAD detached at <short>` sans préfixe.
**Fix** : ne pas préfixer « On branch » dans le cas détaché.

### BAS-10 — MEDIUM — `git commit -m hello world` avale « world »
`commit.ts:36-52`. Git réel : args restants = pathspecs (erreur si inconnus).
**Fix** : rejeter (ou traiter en pathspec) tout positionnel restant après `-m <msg>`.

### BAS-11 — MEDIUM — pas de décorations `(HEAD -> main, tag: v1)` hors `--graph`
`log.ts:36-51`. **Fix** : réutiliser le builder `refsByHash` de `logGraph` dans
les formats plain/oneline.

### BAS-12 — LOW — pas de ligne `Merge: <p1> <p2>` dans `git log` plain
`log.ts:38-49`. **Fix** : l'émettre quand `parents.length > 1`.

### BAS-13 — LOW — ordre des décorations : tags avant les autres branches chez git
`log.ts:99-111`. Engine : HEAD → branches → tags ; git : HEAD → tags → branches.

### BAS-14 — LOW — `git add` sans arg : faux fatal exit 1
`add.ts:21-23`. Git réel : « Nothing specified, nothing added. » + hint, **exit 0**.

### BAS-15 — LOW — exit codes : `add <missing>` et `log` dépôt vide → 1 au lieu de 128
`add.ts:38-42`, `log.ts:18`. (`rm.ts` utilise déjà 128 pour la même erreur.)

### BAS-16 — LOW — hint manquant « git restore <file>... to discard changes »
`status.ts:180-184` (section not-staged).

---

## 2. Navigation (branch / checkout / switch / restore / tag)

### NAV-01 — HIGH — la bascule de branche détruit silencieusement les changements stagés
`repository.ts:483-521` (`canSwitchWithoutDataLoss`) + `:534-585` (`applyTreeToRepo`).
Le garde ne compare que WT vs index ; `applyTreeToRepo` reconstruit l'index depuis
l'arbre cible → tout staging (modifs ET nouveaux fichiers stagés) est perdu à
chaque switch. Git réel : porte les changements stagés si le fichier est identique
entre branches, refuse sinon. **Pire constat de l'audit (perte de données silencieuse).**
**Fix** : sémantique two-tree — refuser si index≠HEAD ET cible≠index ; porter les
entrées inchangées entre arbres au lieu de reconstruire.

### NAV-02 — HIGH — faux refus : modif non stagée bloque le switch même si le fichier est identique dans les deux branches
`repository.ts:509-517`. Git réel : switch OK, modif portée (` M`). Enseigne
« toujours commit/stash avant de switcher », ce qui est faux.
**Fix** : ne refuser que si le checkout doit réécrire ce chemin
(`targetHash !== indexEntry.blobHash`).

### NAV-03 — HIGH — fichier untracked en collision avec l'arbre cible silencieusement écrasé
`repository.ts:499-503, 566-584`. Git réel : « untracked working tree files would
be overwritten by checkout… Aborting », exit 1. Perte de données.
**Fix** : flaguer les chemins WT non indexés présents dans `targetFiles` avec
contenu différent.

### NAV-04 — HIGH — `git checkout <ref> -- <path>` ignore la ref
`checkout.ts:36-40` (tout `--` route vers `cmdRestore(repo, pathspecs)`).
Git réel : prend le fichier dans `<ref>` et l'écrit dans **index ET WT** (stagé).
**Fix** : si une ref précède `--`, équivalent `restore --source=<ref> --staged --worktree` ;
garder l'alias actuel pour la forme nue `checkout -- <path>`.

### NAV-05 — HIGH — `checkout -b` / `switch -c` ignorent silencieusement `<start-point>`
`checkout.ts:53-59,130-152` ; `switch.ts:44-50,113-133`. Même classe de bug que
celui corrigé en B4 pour `git branch <name> <start-point>`.
**Fix** : lire l'arg, `resolveCommitish` (fatal si échec), créer la branche là,
puis dérouler la logique de switch complète (l'arbre change).

### NAV-06 — MEDIUM — `branch -d` ignore l'upstream pour « not fully merged »
`branch.ts:92-105`. Git réel : mergée dans son upstream → suppression avec warning.
**Fix** : si upstream existe et tip ancêtre de la ref de suivi, autoriser (+ warning).

### NAV-07 — MEDIUM — suppression non stagée ressuscitée au switch
`repository.ts:499` (boucle sur le WT seulement). Git réel : la suppression est
portée si le fichier est identique entre branches.
**Fix** : même logique de carry-over que NAV-01.

### NAV-08 — MEDIUM — `git branch <name>` autorisé sur HEAD non-né
`branch.ts:168-171`. Git réel : `fatal: not a valid object name: 'main'`, 128.

### NAV-09 — MEDIUM — `restore --staged` sur HEAD non-né désindexe au lieu d'échouer
`restore.ts:108-119`. Git réel : `fatal: could not resolve HEAD`, 128
(le bon geste est `git rm --cached`).

### NAV-10 — MEDIUM — `resolveCommitish` préfère branche > tag ; git préfère tag
`repository.ts:430-441`. gitrevisions : `refs/tags` avant `refs/heads` (+ warning
« refname ambiguous »). Le checkout, lui, préfère légitimement la branche (déjà
correct via son fast-path). **Fix** : inverser les étapes 2 et 3 du resolver.

### NAV-11 — MEDIUM — `--detach` sans commit → erreur au lieu de détacher sur HEAD
`checkout.ts:43-50`, `switch.ts:34-41`. **Fix** : défaut `commitRef = 'HEAD'`.

### NAV-12 — MEDIUM — `checkout -`/`switch -` ne peut jamais revenir à un état détaché
`checkout.ts:105-109,172-178` (prevBranch ne stocke que des noms de branches).
Git réel : `@{-1}` enregistre aussi les épisodes détachés.
**Fix** : valeur taguée `{branch}|{detachedHash}` ; re-détacher si hash.
(Ou acter la divergence en doc.)

### NAV-13 — MEDIUM — `git checkout <branch> <pathspec>` (sans `--`) fait un switch complet
`checkout.ts:63-71` (pathspecs silencieusement perdus). Git réel : restaure le
fichier depuis la branche SANS switcher. **Fix** : router vers le chemin NAV-04.

### NAV-14 — MEDIUM — `restore --source=<commit>` supprime des fichiers untracked
`restore.ts:71-72` (`inSource` accepte tout chemin du WT). Git réel : pathspec
error, fichier intact. **Fix** : n'accepter un chemin WT que s'il est suivi.

### NAV-15 — MEDIUM — pas d'entrée reflog pour `checkout -b`, `switch -c`, `switch --detach`
`checkout.ts:130-152`, `switch.ts:113-166`. Décale l'arithmétique `HEAD@{n}`
(tutoriel undo). **Fix** : appeler `addReflogEntryForHead` comme les autres chemins.

### NAV-16 — LOW — listing `git branch` sans ligne `* (HEAD detached at <short>)`
`branch.ts:186-198`.

### NAV-17 — LOW — checkout/switch vers la branche courante : silencieux
Git réel : `Already on 'main'`.

### NAV-18 — LOW — pas de checkout DWIM d'une branche de suivi distante
`checkout.ts:69-79`. `git checkout feature` quand seul `origin/feature` existe →
erreur ; git crée la locale + upstream. Workflow standard post-clone.

### NAV-19 — LOW — `isValidTagName` trop permissif
`tag.ts:17-23`. `a..b`, `a.lock`, `~^:?*[` acceptés.
**Fix** : réutiliser `isValidBranchName`.

---

## 3. Réécriture (merge / reset / revert / cherry-pick / rebase)

### RWR-01 — HIGH — merger un ancêtre crée un commit de merge fantôme
`merge.ts:88-99`. « Already up to date. » seulement si tip == HEAD ; un ancêtre
strict déclenche un vrai merge à 2 parents inutile.
**Fix** : retourner « Already up to date. » quand `isAncestor(tip, HEAD)`
(même avec `--no-ff`).

### RWR-02 — HIGH — merge/rebase/cherry-pick/revert écrasent silencieusement les changements non commités
`merge.ts:107-127` + `performTrueMerge`, `repository.ts:1220-1222` (`replayCommit`),
`revert.ts`. Aucune vérification de propreté ; git réel refuse
(« local changes would be overwritten » / « you have unstaged changes »).
**Fix** : garde de propreté commun au démarrage des 4 opérations.

### RWR-03 — HIGH — `rebase --continue` / `cherry-pick --continue` / finalisation revert committent des marqueurs de conflit
`rebase.ts:689`, `cherry-pick.ts:143`, et branche `repo.reverting` de `commit.ts:41/81`
(seuls les chemins merge/cherry-pick finalisés par `git commit` ont eu le fix M1).
**Fix** : même garde `hasConflictMarkers` (« unmerged files », exit 1) sur les 3 chemins.

### RWR-04 — HIGH — `reset --hard` ne nettoie pas l'état d'opération en cours
`reset.ts:82-92`. Après reset --hard pendant un merge conflictuel, `repo.merging`
survit → un `git commit` ultérieur crée un merge à 2 parents depuis un état propre.
Git réel : reset --hard supprime MERGE_HEAD/CHERRY_PICK_HEAD/REVERT_HEAD.
**Fix** : effacer `merging`/`cherryPicking`/`reverting` dans `cmdReset`.

### RWR-05 — HIGH — cherry-pick refuse tout ancêtre de HEAD
`cherry-pick.ts:83-84`. Bloque le workflow canonique « revert puis re-cherry-pick ».
Cette règle n'existe pas dans git. **Fix** : supprimer le refus `isAncestor`
(combiner avec RWR-06 pour le cas résultat-vide).

### RWR-06 — MEDIUM — résultats vides : cherry-pick crée un commit vide ; rebase rejoue les commits déjà upstream
`repository.ts:1235-1241` (`replayCommit` committe toujours).
Git réel : cherry-pick vide → exit 1 « now empty » (suggère --skip) ; rebase →
commit sauté avec warning.
**Fix** : si l'arbre résultant == arbre du parent : skip (rebase) / stop exit 1 (cherry-pick).

### RWR-07 — HIGH — pas de garde croisé entre opérations
`merge.ts:47`, `cherry-pick.ts`, `revert.ts`, `rebase.ts` (chacun ne vérifie que
son propre état). Un merge peut démarrer en plein rebase conflictuel et corrompre
le bookkeeping. **Fix** : `getOperationInProgress(repo)` partagé refusant le
démarrage si l'un des 4 états est posé.

### RWR-08 — MEDIUM — `git rebase <descendant>` dit « already up to date » au lieu de fast-forwarder
`rebase.ts:78-97` (le bloc FF ligne 114 est du code mort).
Git réel : déplace la branche sur le tip. **Fix** : exécuter le chemin FF quand
HEAD est ancêtre strict de la base.

### RWR-09 — MEDIUM — pendant un rebase conflictuel, HEAD reste attaché et la branche bouge immédiatement
`rebase.ts:170-186`. Git réel : HEAD détaché pendant le rebase, la branche ne
bouge qu'à la fin. (Recoupe TLS-08.)
**Fix** : détacher HEAD au démarrage, ne ré-attacher/déplacer la branche qu'au finish.

### RWR-10 — MEDIUM — `git revert --continue` non supporté (et misparsé)
`revert.ts`. **Fix** : router `--continue` vers la même finalisation que
`git commit` sous `repo.reverting` (avec le garde RWR-03).

### RWR-11 — MEDIUM — revert d'un revert : sujet malformé ; hash court dans « This reverts commit »
`revert.ts:166` (interpole le message multi-ligne complet ; git ne prend que la
1re ligne, et écrit le hash complet).

### RWR-12 — MEDIUM — `cherry-pick -m <n>` non parsé (l'arg devient la révision)
`cherry-pick.ts:46`. L'erreur du moteur conseille pourtant `-m <parent>`.
**Fix** : parser `-m <n>` (miroir de l'implémentation revert) ou corriger le message.

### RWR-13 — MEDIUM — `git reset <pathspec>` (désindexer un chemin) non implémenté
`reset.ts:48-60`. Commande débutant archi-courante.
**Fix** : si les args trailing nomment des fichiers existants, réinitialiser ces
entrées d'index depuis l'arbre du commit cible.

### RWR-14 — LOW — cosmétique groupée
`reset --mixed` silencieux (git : « Unstaged changes after reset: ») ; messages
de conflit revert/cherry-pick/rebase (« Conflict in » vs « Merge conflict in » +
bloc hint rebase) ; label de marqueur sans sujet (`>>>>>>> abc1234` vs
`abc1234 (c2)`) ; `--abort` sans opération → exit 1 au lieu de 128 ;
« 3-way » vs « ort ».

---

## 4. Outils avancés (stash / reflog / rebase -i)

### TLS-01 — HIGH — stash push embarque (et supprime) les fichiers untracked
`stash.ts:91-106, 118, 130-132`. Untracked seul → git : « No local changes to
save » sans rien faire ; engine les stash et les retire du WT.
**Fix** : ne stocker que les chemins suivis modifiés ; exclure les untracked de
`hasChanges` et du nettoyage WT.

### TLS-02 — HIGH — stash apply/pop : faux conflits sur fichiers non touchés par le stash
`stash.ts:258-273`. Le stash étant un snapshot WT complet, une modif locale
postérieure sur un fichier non touché par le stash → marqueurs injectés. Git :
les deux modifs coexistent (et refuse proprement quand ça toucherait un fichier modifié).
**Fix** : appliquer le **diff** du stash (stash WT vs `entry.headHash`), ne
conflicter que les chemins modifiés des deux côtés.

### TLS-03 — MEDIUM — pop/apply restaurent l'index stashé tel quel (sémantique `--index` par défaut)
`stash.ts:281`. Git : tout revient non stagé sauf `--index`.
**Fix** : reconstruire l'index depuis HEAD après application.

### TLS-04 — MEDIUM — les suppressions stashées ne sont pas rejouées au pop
`stash.ts:252-273`. Conséquence de TLS-02 (diff-based règle aussi ce cas).

### TLS-05 — MEDIUM — stash sur HEAD non-né : succès silencieux
`stash.ts:58-66`. Git : « You do not have the initial commit yet », exit 1.

### TLS-06 — MEDIUM — conflit de stash : aucun `operationState` → invisible pour l'UI de résolution
`stash.ts:283-289` + `engine.ts:515-524`. La modale conflits / sidebar ne se
déclenchent pas, contrairement à tous les autres conflits du produit.
**Fix** : exposer les fichiers en conflit (réutiliser `filesInConflict`) via un
état léger.

### TLS-07 — HIGH — rebase -i tout-`drop` : branche immobile mais « Successfully rebased »
`rebase.ts:318-469` (+ entrée reflog mensongère `:460-465`). Git : branche resetée
sur la base. **Fix** : si aucun commit créé, déplacer explicitement la ref sur
`base` et reconstruire index/WT.

### TLS-08 — MEDIUM — (= RWR-09) HEAD attaché pendant le rebase, branche déplacée au fil du replay
`rebase.ts:189-195, 439-444, 365-370` + `repository.ts:1033-1040`. Cas
squash-conflit : branche posée un cran SOUS le dernier commit rejoué.

### TLS-09 — MEDIUM — checkout/switch écrivent dans le reflog de la branche de destination
`repository.ts:1292-1300` (`addReflogEntryForHead` écrit HEAD ET la branche).
→ `<branch>@{n}` faux (entrées checkout avec des positions que la ref n'a jamais eues).
**Fix** : dans checkout/switch, n'écrire que le reflog de HEAD.

### TLS-10 — MEDIUM — rebase : une seule entrée reflog `finish` au lieu d'une par pick
`rebase.ts:208-213, 460-465, 884-889`. `HEAD@{1}` engine = tip pré-rebase →
`reset --hard HEAD@{1}` annule le rebase ; sur le vrai git ça n'annule RIEN
(l'undo réel passe par `ORIG_HEAD`/`branch@{1}`). Risque pédagogique direct.
**Fix** : une entrée par commit rejoué (+ start/finish), ou signaler la
simplification dans la doc/tutoriels.

### TLS-11 — MEDIUM — squash/fixup créent un commit intermédiaire fantôme visible dans le graphe
`rebase.ts:335-343, 382-386, 559+, 714+` + `engine.ts:105` (allCommits inclut les
orphelins par design). `commitCount` incrémenté deux fois (trous de dates).
**Fix** : variante de `replayCommit` qui s'arrête après la mise à jour index/WT.

### TLS-12 — LOW — action `edit` acceptée mais traitée comme `pick`
`rebase.ts:245, 410-413`. **Fix** : retirer `edit` de `validActions`.

### TLS-13 — LOW — reflog de branches supprimées / de tags : feature spec'ée (B4) mais le vrai git ne l'offre pas
À signaler dans doc/tutoriel `reset-reflog` (la récupération réelle passe par le
reflog de HEAD).

### TLS-14 — LOW — entrées reflog manquantes : `checkout -b`/`switch -c` (recoupe NAV-15), `rebase --abort`
`checkout.ts:128-151`, `rebase.ts:473-493`.

---

## 5. Distant (remote / clone / fetch / push / pull / tracking)

### RMT-01 — HIGH — flags inconnus avalés par push/pull ; intention destructive inversée
`push.ts:34-36`, `pull.ts:28-30`. `git push --delete origin foo` → **pousse** foo ;
`--dry-run` pousse réellement ; `pull --ff-only` merge quand même.
**Fix** : whitelist des flags connus, `fail()` sur tout token `-*` inconnu.

### RMT-02 — MEDIUM — message du commit de merge de pull
`pull.ts:81-88` → `Merge branch 'origin/main'`. Git : `Merge branch 'main' of <url>`
(pull) / `Merge remote-tracking branch 'origin/main'` (merge direct).
**Fix** : passer `-m` depuis `cmdPull` ; détecter la source remote-tracking dans `cmdMerge`.

### RMT-03 — MEDIUM — `git pull <remote>` sans upstream pull silencieusement la branche homonyme
`pull.ts:38-45`. Git : échoue (« did not specify a branch ») ; et avec un upstream
de nom différent, git merge la branche configurée, pas l'homonyme.
**Fix** : résoudre via `branchUpstream` ; sinon fail exit 1.

### RMT-04 — MEDIUM — `git push` (sans arg) ignore le refus name-mismatch de push.default=simple
`push.ts:42-62`. Upstream `origin/other` sur branche `topic` → git refuse
(« upstream branch … does not match the name »), engine pousse (sémantique `upstream`).
**Fix** : fail 128 quand `upstream.branch !== cur` (ou acter `upstream` en doc).

### RMT-05 — MEDIUM — `git push <remote>` sans upstream pousse l'homonyme ; git refuse
`push.ts:63-71`. Git moderne : « has no upstream branch … --set-upstream », 128.
Enseigne que `git push origin` marche avant `-u`.
**Fix** : exiger un upstream ou un arg branche explicite (hint `--set-upstream`).

### RMT-06 — MEDIUM (latent) — vérification FF du push contre la ref de suivi locale, pas la ref réelle du distant
`push.ts:96-120`. Si tracking absent alors que la branche distante existe, le
check FF est sauté → écrasement silencieux sans `--force`. Inatteignable
aujourd'hui (refs synchronisées) mais le modèle est faux.
**Fix** : baser le check sur `remote.refs.heads[remoteBranch]`.

### RMT-07 — LOW — `git fetch` no-op affiche « Already up to date. » (git : rien)
`fetch.ts:83-85`.

### RMT-08 — LOW — fetch sans gestion de flags (`--all`, `-p`, `--tags` → « No remote named '--all' »)
`fetch.ts:24`. **Fix** : implémenter `--all`, rejeter le reste explicitement.

### RMT-09 — LOW — refspecs push (`local:remote`, `:branch`) non supportés, erreur trompeuse
`push.ts:72-93`. **Fix** : parser `src:dst` ou rejeter explicitement ; exit 1
pour src manquant.

### RMT-10 — LOW — `branch -u` n'accepte qu'un upstream `<remote>/<branch>`
`branch.ts:273-285`. Git accepte aussi une branche locale (remote `.`).

### RMT-11 — LOW — révisions `@{n}` nu et `@` non supportées
`repository.ts:395`. `@{1}` (branche courante) et `@` (alias HEAD) → null/128.

---

## 6. Contenu (diff / show / rm / mv / gitignore / config)

### CNT-01 — HIGH — `git rm` supprime un fichier nouvellement stagé (jamais commité) sans refus
`rm.ts:55-87` (`headBlob === undefined` → aucun garde). Git : « has changes staged
in the index (use --cached … or -f) », exit 1. Perte de données.
**Fix** : traiter `headBlob === undefined && idx !== undefined` comme changement
stagé exigeant `--cached`/`-f`.

### CNT-02 — MEDIUM — `rm` : mauvais message de refus pour modif stagée seule (WT==index≠HEAD)
`rm.ts:61-72` (la spec 43 encode la même condition fausse). Git distingue
« changes staged in the index » (hint --cached) de « staged content different
from both » (index≠HEAD ET WT≠index). **Fix** : deux branches + maj spec 43.

### CNT-03 — MEDIUM — `rm --cached` saute tous les gardes
`rm.ts:55`. Git refuse quand index≠HEAD ET WT≠index (le blob stagé serait perdu).
La spec 43 (« désindexation pure ») diverge elle-même du vrai git.

### CNT-04 — MEDIUM — `rm <dir>` sans `-r` : mauvaise erreur
`rm.ts:47-49`. Git : « fatal: not removing 'dir' recursively without -r ».

### CNT-05 — MEDIUM — `git diff <path>` sans repli pathspec
`diff.ts:102-107`. `git diff a.txt` → « ambiguous argument » au lieu du diff
WT-vs-index du fichier. Entrée débutant très courante.
**Fix** : si `resolveCommitish` échoue mais le positionnel existe en WT/index/HEAD,
le traiter en pathspec.

### CNT-06 — MEDIUM — `git diff --staged <commit>` ignore le commit
`diff.ts:93-97`. Git : compare `<commit>` vs index.

### CNT-07 — MEDIUM — `git mv` écrase un fichier WT untracked à destination sans `-f`
`mv.ts:49` (ne vérifie que l'index). Git : « fatal: destination exists », 128.

### CNT-08 — MEDIUM — `git mv <dir> <dir2>` non supporté
`mv.ts:30-32`. Git renomme toutes les entrées sous `src/` (blobs conservés).

### CNT-09 — MEDIUM — `git mv` avec >2 positionnels mute le mauvais état
`mv.ts:26-27` (le reste est ignoré : mauvais rename silencieux). Git : dernier
arg = destination (répertoire si multiple). **Fix** : implémenter ou refuser 128.

### CNT-10 — LOW — diff de fichier vide : headers `---`/`+++` sans hunks (git s'arrête à `index`)
`diff.ts:213-214`.

### CNT-11 — LOW — trailing newline : ligne fantôme dans `splitLines` + pas de marqueur `\ No newline at end of file`
`diff.ts:81-86`. Impact faible (le `write` ne produit jamais de `\n` final).

### CNT-12 — LOW — `git rm -r .` non supporté
`rm.ts:40-44`. **Fix** : cas spécial `.`/`./` = match-all.

### CNT-13 — LOW — config : clés sans section acceptées (git : « key does not contain a section », exit 2) ; sans args → 128 vs 129
`config.ts:48-50, 21-25`. La spec 45 documente « toute clé acceptée » — pour info.

### CNT-14 — LOW — diff : options inconnues silencieusement ignorées (`--stat`, `--name-only`, `-U5`…)
`diff.ts:88`. Git : erreur exit 129. **Fix** : rejeter les flags non reconnus.

### CNT-15 — LOW — littéraux de messages
`mv.ts:51` (« Use -f to overwrite, or -r to remove duplicates » n'existe pas dans
git ; forme réelle `destination exists, source=<s>, destination=<d>`) ;
`add.ts:49` (refus ignore : phrasé git ancien vs bloc « The following paths are
ignored… hint: Use -f »).

---

## Avancement

- **Lot 1 — FAIT** (commit dédié). BAS-01/03/04, RWR-01/02/03/04/05/06/07, TLS-07,
  RMT-01, CNT-01/02/03 corrigés. Helpers partagés `getOperationInProgress` /
  `hasUncommittedChanges` / `listUncommittedPaths` (repository.ts) +
  `refuseIfOperationInProgress` / `refuseIfDirty` (commands/guards.ts). Tests :
  `tests/audit-lot1.test.ts` (15 cas) + tests existants ajustés. 1290 verts.
  Note : la garde de propreté est volontairement **conservatrice** (refuse tout
  changement non commité avant merge/rebase/cherry-pick/revert, là où git réel
  tolère parfois les fichiers non concernés) — choix pédagogique « commit/stash
  d'abord » endossé par l'audit.
- **Lot 2 — FAIT** (commit dédié). Sémantique **two-tree** de checkout/switch :
  classifieur partagé `classifySwitch` (carry / apply / conflict / conflict-untracked)
  consommé par `canSwitchWithoutDataLoss` (retourne désormais `{tracked, untracked}`)
  et `applyTreeToRepo(repo, target, source)`. NAV-01/02/03/07 (changements indexés
  & non indexés portés ; untracked en collision refusé), NAV-04/13
  (`checkout <ref> -- <path>` / `<ref> <path>` → restauration index+WT via cmdRestore),
  NAV-05 (`checkout -b`/`switch -c <start-point>`), NAV-11 (`--detach` sans arg = HEAD),
  NAV-15 (reflog `checkout -b`/`switch -c`/`switch --detach`). Bonus NAV-17 (« Already
  on '<branch>' »). Tests : `tests/audit-lot2.test.ts` (10 cas). 1300 verts.
  NAV-07 (carry d'une suppression non stagée) non testé en boîte noire (pas de
  primitive de suppression WT-only) — couvert par le même classifieur.
- **Lot 3 — FAIT** (commit dédié). **Implémenté** : BAS-02 (`git log` traverse
  tous les parents — les commits fusionnés réapparaissent), BAS-11 (décorations
  `(HEAD -> main, tag: v1, dev)` en plain & oneline), BAS-12 (ligne `Merge:`),
  BAS-13 (ordre HEAD → tags → branches), RWR-08 (rebase sur un descendant →
  fast-forward ; **débloque aussi `git rebase -i HEAD~n`** qui était capté par le
  raccourci « already up to date »), TLS-09 (checkout/switch n'écrivent QUE le
  reflog de HEAD, plus de pollution du reflog de la branche de destination).
  Helpers log mutualisés `getReachableSorted`/`collectDecorations`. Tests :
  `tests/audit-lot3.test.ts` (7 cas). 1307 verts.
  **Reportés / documentés comme simplifications assumées** (refontes profondes des
  internals du rebase, à risque élevé pour un gain pédagogique transitoire ;
  l'audit offrait explicitement l'option « documenter ») :
  - **RWR-09 / TLS-08** : pendant un rebase (conflit en pause), HEAD reste attaché
    et la branche est déplacée au fil du replay (le vrai git détache HEAD et ne
    déplace la branche qu'au `finish`). État transitoire ; corrigé par `--abort`.
  - **TLS-10** : le rebase écrit une seule entrée reflog `finish` (pas une par
    pick) → `reset --hard HEAD@{1}` annule tout le rebase (le vrai git passe par
    `ORIG_HEAD`). À signaler dans le tutoriel `reset-reflog`.
  - **TLS-11** : squash/fixup créent un commit intermédiaire orphelin visible dans
    le graphe (`allCommits` affiche les orphelins par design).
- **Lot 4 — FAIT** (commit dédié). Refonte **diff-based** du stash. TLS-01
  (`git stash` ne stashe plus les fichiers non suivis et ne les retire pas du WT ;
  untracked-only → « No local changes to save »), TLS-02/04 (application par diff
  stash-vs-headHash : ne touche que les chemins modifiés par le stash → plus de
  faux conflits, suppressions rejouées), TLS-03 (pop/apply restaurent en NON
  stagé, index aligné sur HEAD ; `--index` non géré), TLS-05 (HEAD non-né → erreur).
  TLS-06 (conflit de pop) traité au **minimum** : index aligné sur HEAD → `git
  status` montre les fichiers en conflit (pas d'`operationState` « stashing »
  dédié pour la modale, à ajouter si besoin). `hasChanges` réutilise
  `hasUncommittedChanges`. Tests : `tests/audit-lot4.test.ts` (6 cas) + 2 tests
  stash existants corrigés (untracked préservé). 1313 verts.
- **Lot 5 — FAIT** (commit dédié). Sémantique distante moderne. RMT-03
  (`git pull <remote>` sans upstream sur ce remote → refus ; sinon branche
  configurée honorée), RMT-04/05 (`push.default=simple` : `git push` refuse si le
  nom de l'upstream diffère ; `git push <remote>` exige un upstream et suggère
  `--set-upstream`), RMT-02 (merge de pull → « Merge branch '<branch>' of <url> »),
  RMT-06 (vérif FF du push contre la ref RÉELLE du distant `remote.refs.heads`),
  RMT-07 (`git fetch` no-op silencieux), RMT-08 (`git fetch --all` + rejet des
  flags inconnus), RMT-11 (`@` = HEAD, `@{n}` nu = reflog de la branche courante).
  Tests : `tests/audit-lot5.test.ts` (9 cas). 1322 verts.
- **Lot 6 — FAIT** (commit dédié). Complétude des commandes de contenu. BAS-05
  (`commit -a`/`-am`), BAS-10 (positionnels après `-m` → pathspec error), BAS-06
  (`add <répertoire>`), BAS-07 (`add` stage une suppression), BAS-08 (`add -A`),
  CNT-04 (`rm <dir>` sans `-r` → « not removing recursively »), CNT-12 (`rm -r .`),
  CNT-05 (`diff <path>` repli pathspec), CNT-06 (`diff --staged <commit>`), CNT-07
  (`mv` refuse d'écraser un untracked sans `-f`), CNT-08 (`mv <dir> <dir2>`), CNT-09
  (`mv` >2 positionnels → destination répertoire requise), NAV-08 (`branch` sur
  HEAD non-né → refus), NAV-09 (`restore --staged` HEAD non-né → erreur), NAV-10
  (resolver préfère le tag à la branche), NAV-14 (`restore --source` ne supprime
  pas un untracked), RWR-12 (`cherry-pick -m <n>` d'un merge), RWR-13
  (`reset <pathspec>` désindexe sans bouger HEAD). Tests : `tests/audit-lot6.test.ts`
  (16 cas) + 7 tests existants corrigés (comportement aligné sur git). 1338 verts.
- Lot 7 : à venir.

## Plan de correction (lots priorisés)

Chaque lot suit le cycle 5 étapes du projet (specs → doc → dev → tests → QA).
Les lots 1 à 3 corrigent tout le HIGH ; 4 à 6 sont du MEDIUM groupé par thème ;
7 ramasse le LOW cosmétique en passes rapides.

### Lot 1 — Intégrité d'état & anti-perte de données (tout HIGH hors navigation)
> Le moteur ne doit jamais produire un état que git ne produirait pas, ni perdre
> des données sans refus.

1. **BAS-01** commit détaché avance HEAD (+ headline `detached HEAD`, isRoot par parents).
2. **BAS-03** `git init` préserve le WT pré-init.
3. **BAS-04** `--amend` implémenté (ou flags inconnus rejetés partout dans commit).
4. **RWR-02 + RWR-07** garde commun de démarrage des 4 opérations : propreté
   index/WT + refus si une opération est déjà en cours (`getOperationInProgress`).
5. **RWR-03 + RWR-10** garde `hasConflictMarkers` sur `rebase --continue`,
   `cherry-pick --continue`, finalisation revert (+ `revert --continue` routé).
6. **RWR-04** `reset --hard` efface `merging`/`cherryPicking`/`reverting`.
7. **RWR-01** merge d'un ancêtre → « Already up to date. ».
8. **RWR-05 (+RWR-06)** cherry-pick d'ancêtres autorisé ; résultat vide → skip
   (rebase) / stop « now empty » (cherry-pick).
9. **TLS-07** rebase -i tout-drop déplace la branche sur la base.
10. **RMT-01** push/pull : whitelist de flags, échec sur flag inconnu.
11. **CNT-01 (+CNT-02/03)** matrice de refus `git rm` conforme (3 messages, --cached gardé).

### Lot 2 — Sémantique two-tree de checkout/switch (cluster NAV HIGH)
> Gros chantier unique dans `repository.ts` (`canSwitchWithoutDataLoss` +
> `applyTreeToRepo`) — à traiter ensemble, c'est la même mécanique.

1. **NAV-01/02/03/07** : refuser seulement si le checkout doit réécrire un chemin
   localement modifié (stagé OU non) ; porter les changements compatibles
   (modifs, fichiers stagés, suppressions) ; refuser l'écrasement d'untracked.
2. **NAV-04/13** `checkout <ref> -- <path>` et `checkout <ref> <path>` →
   restore-from-commit (index+WT), sans switch.
3. **NAV-05** `checkout -b`/`switch -c <start-point>`.
4. **NAV-11** `--detach` sans arg = HEAD.
5. **NAV-15/TLS-14** entrées reflog `checkout -b`/`switch -c`/`switch --detach`.

### Lot 3 — Pédagogie de l'historique : log, rebase visuel, reflog
1. **BAS-02** `git log` traverse tous les parents.
2. **BAS-11/12/13** décorations + ligne `Merge:` + ordre tags.
3. **RWR-09/TLS-08** HEAD détaché pendant le rebase, branche déplacée au finish
   (le graphe montre alors le vrai déroulement d'un rebase).
4. **RWR-08** `rebase <descendant>` fast-forwarde (réactive le code mort).
5. **TLS-09** checkout/switch n'écrivent que le reflog de HEAD.
6. **TLS-10** une entrée reflog par pick (+start/finish) — ou divergence actée
   dans le tutoriel `reset-reflog`.
7. **TLS-11** squash/fixup sans commit intermédiaire fantôme.

### Lot 4 — Refonte stash (diff-based)
1. **TLS-01** untracked exclus du stash.
2. **TLS-02/04** application par diff (stash vs headHash) → plus de faux
   conflits, suppressions rejouées.
3. **TLS-03** pop/apply restaurent en non-stagé (réserver `--index`).
4. **TLS-05** HEAD non-né → erreur.
5. **TLS-06** conflit de pop visible par l'UI (filesInConflict / état léger).

### Lot 5 — Distant : sémantique push/pull moderne
1. **RMT-03** `pull <remote>` sans upstream → erreur ; upstream de nom différent honoré.
2. **RMT-04/05** push.default=simple : name-mismatch refusé ; `push <remote>`
   sans upstream → hint `--set-upstream`.
3. **RMT-02** messages de merge de pull (`'main' of <url>` / `remote-tracking branch`).
4. **RMT-06** check FF contre la ref réelle du distant.
5. **RMT-08** `fetch --all` ; flags inconnus rejetés. **RMT-07** fetch no-op silencieux.
6. **RMT-11** `@` et `@{n}` nus.

### Lot 6 — Contenu : add/commit/diff/mv complétés
1. **BAS-05** `commit -a`/`-am`. **BAS-10** positionnels après `-m` rejetés.
2. **BAS-06/07/08** `add <dir>`, stager une suppression, `add -A`.
3. **CNT-05/06** `diff <path>` (repli pathspec) et `diff --staged <commit>`.
4. **CNT-07/08/09** mv : collision WT untracked, mv de répertoire, >2 positionnels.
5. **CNT-04/12** messages/`.` de `rm -r`.
6. **NAV-08/09/10/14** unborn HEAD (branch/restore), priorité tag>branche du
   resolver, restore --source sur untracked.
7. **RWR-12/13** `cherry-pick -m`, `reset <pathspec>`.

### Lot 7 — Passe cosmétique (LOW restants, regroupables en 1-2 PR)
BAS-09/13/14/15/16, NAV-16/17/19, RWR-11/14, TLS-12, RMT-07/09/10, CNT-10/11/13/14/15,
BAS-12.
Divergences à **acter en doc** plutôt que corriger (décision à prendre) :
NAV-12 (`checkout -` détaché), NAV-18 (DWIM remote), NAV-06 (branch -d upstream),
TLS-13 (reflog tags/branches supprimées — feature volontaire spec 61).

---

## Comportements vérifiés conformes (pour mémoire)
Index-snapshot complet ; `status -s` AM ; restore quadrant complet (incl.
désindexation) ; FF/no-ff/merge --continue avec garde M1 ; reset modes
soft/mixed/hard (HEAD détaché inclus) ; structure/ordre des marqueurs de conflit
(merge ET sens inversé rebase/cherry-pick) ; revert de merge avec -m ;
findMergeBases/criss-cross ; aborts (merge/rebase/cherry-pick) ; fetch pur
(ne touche jamais branches locales/HEAD/index/WT) ; computeAheadBehind ==
`rev-list --left-right --count` (vérifié sur DAG mergé) ; refus non-ff de push
(message + exit 1) + --force ; clone (refs de suivi, branche par défaut non-main,
source détachée, source vide) ; `@{u}` priorité locale ; hunk math du diff
(création/vidage/fusion de hunks) ; gitignore (last-match-wins, négation,
dir-only, ancrage, `**/`) ; config user.* → auteur des commits ; stash pop
conserve le stash en cas de conflit ; HEAD@{n} ordre et cycle undo/redo ;
squash/fixup messages ; drop partiel/réordonnancement.
