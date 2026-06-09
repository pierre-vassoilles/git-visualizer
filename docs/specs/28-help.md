# Phase 6 : git help

## Résumé

La commande `git help` affiche les informations d'aide sur les commandes disponibles. Elle regroupe les commandes par catégorie (création, modification, navigation, fusion/réécriture, outils avancés) et fournit une aide détaillée sur une commande spécifique. L'interface est en français, adaptée au sous-ensemble des commandes implémentées.

**Cas d'usage** :
- `git help` : voir la liste de toutes les commandes
- `git help <commande>` : voir l'aide détaillée d'une commande (synopsis, options, exemples)
- `git --help` ou `git` (sans args) : variantes affichant l'aide générale
- Pour une commande inconnue : message d'erreur explicite

## Syntaxe

```
git help [<commande>]
git --help
git
```

### Variantes supportées en Phase 6

| Invocation | Comportement |
|------------|-------------|
| `git help` | Liste groupée des commandes par catégorie |
| `git help <commande>` | Aide détaillée de `<commande>` |
| `git --help` | Équivalent de `git help` |
| `git` (sans arguments) | Équivalent de `git help` (invite l'utilisateur) |
| `git help <unknown>` | Message d'erreur : commande inconnue |

## Comportement nominal

### Cas 1 : Liste générale (`git help`, `git --help`, `git`)

**Condition** : Aucun argument ou uniquement `--help`.

**Processus** :
1. Grouper les commandes implémentées par catégorie :
   - **Initialisation & Configuration** : init
   - **Fichiers & Index** : add, status, restore, write, read
   - **Commits** : commit, log
   - **Branches** : branch, checkout, switch, tag
   - **Fusion & Réécriture** : merge, reset, revert, cherry-pick, rebase
   - **Outils avancés** : stash, reflog
   - **Aide** : help

2. Pour chaque catégorie, afficher :
   - Titre de catégorie (ex. "Initialisation & Configuration")
   - Ligne par commande : `<nom_commande> <description_courte>`

3. Afficher un message de pied : `"Use 'git help <command>' for more information."`

**Format de sortie** :
```
usage: git [--help] [<commande>]

Initialisation & Configuration
  init          Initialiser un dépôt Git vierge

Fichiers & Index
  add           Ajouter des fichiers à l'index
  status        Afficher l'état du dépôt
  restore       Restaurer fichiers dans l'index ou le working tree
  write         Écrire des fichiers dans le working tree virtuel
  read          Lire des fichiers du working tree virtuel

Commits
  commit        Créer un commit avec les fichiers stagés
  log           Afficher l'historique des commits

Branches
  branch        Créer, lister ou supprimer des branches
  checkout      Basculer de branche ou repositionner HEAD
  switch        Basculer de branche (variante de checkout)
  tag           Créer, lister ou supprimer des étiquettes

Fusion & Réécriture
  merge         Fusionner une branche dans la branche courante
  reset         Réinitialiser HEAD et l'index
  revert        Créer un commit qui annule les changements
  cherry-pick   Appliquer les changements d'un commit ailleurs
  rebase        Rejouer les commits sur une nouvelle base

Outils avancés
  stash         Mettre de côté temporairement des changements
  reflog        Afficher l'historique des mouvements de HEAD

Aide
  help          Afficher cette aide

Use 'git help <command>' for more information.
```

**Code de sortie** : 0

### Cas 2 : Aide détaillée (`git help <commande>`)

**Condition** : Un argument, nom d'une commande implémentée.

**Processus** :
1. Valider que la commande existe
2. Afficher :
   - Nom et description courte
   - **SYNOPSIS** : syntaxe de la commande
   - **DESCRIPTION** : explication du comportement (1-2 paragraphes)
   - **OPTIONS** : tableau des flags/options supportées
   - **EXEMPLES** : 2-3 cas d'usage concrets
   - **RETOUR** : code de sortie en cas de succès/erreur

3. Les descriptions et exemples sont adaptés au sous-ensemble Phase 6 (exclure les options futures)

**Exemple de sortie pour `git help commit`** :
```
NAME
  git commit - Créer un commit avec les fichiers stagés

SYNOPSIS
  git commit [options]

DESCRIPTION
  Enregistre les changements actuels de l'index dans un nouveau commit.
  Le message du commit est obligatoire (-m) ; en son absence, une erreur est retournée.

OPTIONS
  -m <message>  Message du commit

EXAMPLES
  git commit -m "Initial commit"
  git commit -m "Fix bug #123"

EXIT CODES
  0  Succès
  1  Erreur (ex: nothing to commit, bad message)
  128 Dépôt non initialisé
```

**Code de sortie** : 0

### Cas 3 : Commande inconnue

**Condition** : `git help <unknown>` où `<unknown>` n'existe pas.

**Message d'erreur** :
```
fatal: git '<unknown>' is not a git command. See 'git help'.
```

**Code de sortie** : 1

**Comportement** : Aucune modification à l'état du dépôt.

## Cas d'erreur

### Dépôt non initialisé

**Condition** : Appeler `git help` sans que le dépôt soit initialisé (très rare, l'aide doit toujours fonctionner).

**Décision** : `git help` fonctionne même sans `git init` (c'est l'aide générale).

### Commande inconnue

**Condition** : `git help nosuchcommand`

**Message d'erreur** :
```
fatal: git 'nosuchcommand' is not a git command. See 'git help'.
```

**Code de sortie** : 1

## Critères d'acceptation

### CA-help-01 : Afficher l'aide générale

**Given**
- L'engine est initialisé (ou non)

**When**
- L'utilisateur exécute `git help`

**Then**
- `exitCode === 0`
- `output` contient au minimum :
  - Titre "usage: git"
  - Catégories listées (Initialisation & Configuration, Fichiers & Index, etc.)
  - Au moins 3 commandes avec descriptions
  - Message de pied "Use 'git help <command>' for more information."

### CA-help-02 : Variante `git --help`

**Given**
- L'engine initialisé

**When**
- L'utilisateur exécute `git --help`

**Then**
- `exitCode === 0`
- `output` identique ou très similaire à `git help`

### CA-help-03 : Variante `git` sans arguments

**Given**
- L'engine initialisé

**When**
- L'utilisateur exécute `git` (sans aucun argument)

**Then**
- `exitCode === 0`
- `output` affiche une invite/aide (même contenu que `git help`)

### CA-help-04 : Aide détaillée pour une commande

**Given**
- L'engine initialisé
- La commande `commit` est implémentée

**When**
- L'utilisateur exécute `git help commit`

**Then**
- `exitCode === 0`
- `output` contient :
  - Section "NAME" avec description courte
  - Section "SYNOPSIS" avec syntaxe
  - Section "DESCRIPTION" avec explication
  - Section "OPTIONS" avec au moins l'option `-m`
  - Section "EXAMPLES" avec au moins 1 exemple
  - Section "EXIT CODES"

### CA-help-05 : Aide pour plusieurs commandes différentes

**Given**
- L'engine initialisé

**When**
- L'utilisateur exécute successivement :
  - `git help log`
  - `git help branch`
  - `git help merge`

**Then**
- Chaque invocation retourne `exitCode === 0`
- Les contenus sont distincts et appropriés à chaque commande
- Chacun contient la section "SYNOPSIS" avec la syntaxe correcte

### CA-help-06 : Commande inconnue

**Given**
- L'engine initialisé

**When**
- L'utilisateur exécute `git help nosuchcommand`

**Then**
- `exitCode === 1`
- `errors[0]` contient "is not a git command"
- Aucune modification à l'état du dépôt

### CA-help-07 : Format des catégories

**Given**
- L'engine initialisé

**When**
- L'utilisateur exécute `git help`

**Then**
- `output` répartit les commandes en au moins 5 catégories visibles
- Chaque catégorie a un titre clair et au moins 1 commande listée
- Commandes listées : init, add, status, commit, log, branch, checkout, merge, reset, help (minimum)

### CA-help-08 : Aide pour commande inexistante avec typo

**Given**
- L'engine initialisé

**When**
- L'utilisateur exécute `git help chckout` (typo)

**Then**
- `exitCode === 1`
- `errors[0]` contient "is not a git command"

## Implémentation : Points clés

1. **Catalogue de commandes** : Créer une source de vérité (ex. `HELP_CATALOG` dans `core/`) listant chaque commande, sa catégorie, description courte, synopsis, description longue, options, exemples.

2. **Parser** : Reconnaître `git help`, `git --help`, `git` (vide).

3. **Commande `cmdHelp`** : implémenter dans `src/core/commands/help.ts` :
   - Cas 1 : aucun arg → afficher l'aide générale (groupée par catégorie)
   - Cas 2 : un arg valide → afficher l'aide détaillée
   - Cas 3 : un arg invalide → erreur

4. **Format** : respecter une présentation lisible (sections, indentation, tabulation).

5. **Tests** : couvrir les 3 cas (général, détaillé valide, détaillé invalide).

## Dépendances inter-commandes

- **`git help`** fonctionne indépendamment, même sans `git init`.
- Permet de découvrir toutes les autres commandes.

## Notes pour la Phase 6

- Le catalogue d'aide vit dans `core/` (pas de connaissance Git dans l'UI).
- Les descriptions et options doivent être à jour avec l'implémentation réelle (si une commande change en Phase 6, mettre à jour le catalogue).
- L'aide détaillée peut intégrer les descriptions exites dans les specs `01-27.md` (synthèse + exemples).
