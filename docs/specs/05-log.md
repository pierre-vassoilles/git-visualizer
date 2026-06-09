# Phase 1 : git log

## Résumé

La commande `git log` affiche l'historique des commits accessibles à partir du HEAD courant. Elle liste chaque commit avec son hash, auteur, date, et message.

## Syntaxe

```
git log [options]
```

### Options supportées en Phase 1

| Option | Comportement | Notes |
|--------|-------------|-------|
| (aucune) | Affichage long | Affiche chaque commit en détail |
| `--oneline` | Affichage court | Une ligne par commit (hash court + message) |
| `--graph` | Affichage avec graphique ASCII | Phase 1 optionnel ; voir notes |

**Remarque** : Les options `--decorate`, `--follow`, `--diff`, `-p`, `-n`, etc. ne sont pas implémentées en Phase 1.

## Comportement nominal

### Parcours des commits

La commande `git log` remonte l'arbre des commits en partant du HEAD :

1. Récupérer le commit pointé par HEAD
2. Afficher ce commit
3. Suivre le/les parents (en Phase 1, max 1 parent ; merge sera Phase 2)
4. Répéter jusqu'à atteindre un commit sans parent

**Ordre d'affichage** : Du plus récent (HEAD) au plus ancien (racine).

### Format long (verbose)

Affichage multi-lignes par commit :

```
commit abc1234567890def1234567890def1234567890
Author: Unnamed <unnamed@example.com>
Date:   Mon Jun 9 12:00:00 2025 +0000

    Message du commit

commit def1234567890abc1234567890abc1234567890
Author: Unnamed <unnamed@example.com>
Date:   Mon Jun 9 11:59:59 2025 +0000

    Deuxième commit
```

**Format détaillé par ligne** :

```
commit <FULL_HASH>
Author: <author_string>
Date:   <date_lisible>

    <message_indentées_par_4_espaces>
```

Où :
- `<FULL_HASH>` : le hash SHA-1 complet (40 caractères hexadécimaux)
- `<author_string>` : format "Name <email>"
- `<date_lisible>` : format Git standard (ex. "Mon Jun 9 12:00:00 2025 +0000")
- `<message>` : message du commit, indentée de 4 espaces

**Séparation** : Ligne vide entre les commits.

### Format court (--oneline)

Affichage compact, une ligne par commit :

```
abc1234 Message du commit
def4567 Deuxième commit
```

**Format** : `<SHORT_HASH> <message>`

Où :
- `<SHORT_HASH>` : les 7 premiers caractères du hash (convention Git)
- `<message>` : le message du commit (première ligne seulement si multi-ligne)

### Code de sortie

- **0** : succès (quel que soit le nombre de commits)

## Cas d'erreur

### Dépôt non initialisé

**Condition** : Appeler `git log` sans avoir appelé `git init` d'abord.

**Message d'erreur** (stderr) :
```
fatal: not a git repository (or any of the parent directories): .git
```

**Code de sortie** : 128

### Aucun commit (dépôt vierge)

**Condition** : Appeler `git log` alors que le dépôt n'a aucun commit (HEAD → refs/heads/main sans valeur).

**Message d'erreur** (stderr) :
```
fatal: No commits yet
```

**Code de sortie** : 1

**Comportement** : `output` est vide ; seule la liste `errors` contient le message.

## Critères d'acceptation (Given/When/Then)

### CA-log-01 : Dépôt vierge, aucun commit

**Given**
- Le dépôt a été initialisé (`git init`)
- Aucun commit n'a été créé

**When**
- L'utilisateur exécute `git log`

**Then**
- `exitCode === 1`
- `errors[0]` contient "No commits yet"
- `output` est vide

### CA-log-02 : Un commit unique

**Given**
- Le dépôt a été initialisé
- Un commit "First commit" a été créé avec hash `abc1234567...`

**When**
- L'utilisateur exécute `git log`

**Then**
- `exitCode === 0`
- `output[0]` commence par "commit abc123456789..."
- `output` contient "Author: Unnamed <unnamed@example.com>"
- `output` contient "Date:"
- `output` contient "First commit"
- Aucun parent listé (premier commit)

### CA-log-03 : Multiple commits

**Given**
- Le dépôt a été initialisé
- Trois commits ont été créés avec messages "First", "Second", "Third"
- Leurs hashes sont respectivement `aaa...`, `bbb...`, `ccc...`

**When**
- L'utilisateur exécute `git log`

**Then**
- `exitCode === 0`
- Le premier commit affiché est "Third" (le plus récent)
- Le second commit affiché est "Second"
- Le troisième commit affiché est "First"
- Les trois commits sont présents dans l'output

### CA-log-04 : Format --oneline avec un commit

**Given**
- Le dépôt a été initialisé
- Un commit "Initial" avec hash `abc1234567...` a été créé

**When**
- L'utilisateur exécute `git log --oneline`

**Then**
- `exitCode === 0`
- `output[0]` contient "abc1234 Initial" (hash court + message)
- Aucune ligne "Author:" ou "Date:"

### CA-log-05 : Format --oneline avec multiple commits

**Given**
- Le dépôt a été initialisé
- Trois commits créés : "First", "Second", "Third"

**When**
- L'utilisateur exécute `git log --oneline`

**Then**
- `exitCode === 0`
- `output` contient 3 lignes
- `output[0]` (plus récent) contient "Third"
- `output[1]` contient "Second"
- `output[2]` (plus ancien) contient "First"
- Chaque ligne a le format "<SHORT_HASH> <message>"

### CA-log-06 : Dépôt non initialisé

**Given**
- L'engine est en état vierge (pas d'appel à `git init`)

**When**
- L'utilisateur exécute `git log`

**Then**
- `exitCode === 128`
- `errors[0]` contient "not a git repository"

### CA-log-07 : Affichage de dates lisibles

**Given**
- Le dépôt a été initialisé
- Un commit créé

**When**
- L'utilisateur exécute `git log`

**Then**
- `exitCode === 0`
- `output` contient une ligne "Date: " au format lisible (ex. "Mon Jun 9 12:00:00 2025 +0000")
- La date doit être valide et cohérente avec le timestamp du commit

### CA-log-08 : Message multi-ligne (première ligne affichée en --oneline)

**Given**
- Le dépôt a été initialisé
- Un commit avec message multi-ligne "First line\nSecond line\nThird line"

**When**
- L'utilisateur exécute `git log --oneline`

**Then**
- `exitCode === 0`
- `output[0]` contient "First line" (pas "Second line" ou "Third line")

### CA-log-09 : Commits avec contenu différent, hashes différents

**Given**
- Le dépôt a été initialisé
- Deux commits créés avec des contenus/messages différents

**When**
- L'utilisateur exécute `git log`

**Then**
- `exitCode === 0`
- Les hashes des deux commits sont différents
- Les deux commits sont listés avec leurs hashes respectifs

### CA-log-10 : Hash court unique (7 caractères)

**Given**
- Le dépôt a été initialisé
- Plusieurs commits créés

**When**
- L'utilisateur exécute `git log --oneline`

**Then**
- `exitCode === 0`
- Chaque ligne commence par exactement 7 caractères hexadécimaux (hash court)

---

## Implémentation : Points clés

1. **Parcours des commits** : Partir du HEAD et remonter jusqu'à la racine via `commit.parents`.
2. **Formatage des dates** : Convertir le timestamp Unix en format lisible (JavaScript `Date` + locale).
3. **Hash court** : Utiliser les 7 premiers caractères du hash SHA-1.
4. **Ordre d'affichage** : Du plus récent (HEAD) au plus ancien.
5. **Validation** : Vérifier que HEAD pointe vers un commit valide.

## Dépendances inter-commandes

- **Dépend de** : `git init` (dépôt doit être initialisé)
- **Dépend de** : `git commit` (pour avoir des commits à afficher)

---

## Notes pour le développement

- La logique de parcours des commits doit gérer les racines (commits sans parent).
- Le format long doit inclure tous les détails (author, date, message indenté).
- Le format --oneline doit être compact et lisible.
- Implémenter --graph en Phase 1 est optionnel mais bienvenue (affiche un graphique ASCII de l'historique).
