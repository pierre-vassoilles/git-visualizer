# Phase 6+ : git config

## Résumé

La commande `git config` lit et écrit les paramètres de configuration du dépôt. Les plus importants pour ce projet : `user.name` et `user.email` (qui personnalisent l'auteur des commits). Le support d'alias (`git config alias.<name> <cmd>`) est optionnel en Phase 1. La configuration persiste en mémoire et doit être **déterministe** : le hash des commits dépend de l'auteur, donc rejouer les mêmes commandes avec la même config doit redonner les mêmes hashes.

## Syntaxe

```
git config [--list] [<key>] [<value>]
```

### Formes supportées

| Forme | Comportement |
|-------|-------------|
| `git config --list` | Affiche toutes les clés/valeurs actuelles |
| `git config <key>` | Lit la valeur de `<key>` |
| `git config <key> <value>` | Écrit `<key> = <value>` (crée ou met à jour) |

### Clés supportées

| Clé | Defaut | Notes |
|-----|--------|-------|
| `user.name` | `(constant initial)` | Auteur du commit (prénom + nom) ; impacte le hash |
| `user.email` | `(constant initial)` | Email de l'auteur ; impacte le hash |
| `alias.<name>` | (aucun) | Alias de commande (optionnel Phase 1) |

### Clés non supportées

Les clés suivantes (du vrai Git) ne sont **pas supportées** (pas d'erreur, mais non traitées) :
- `core.ignorecase`, `core.filemode`, `core.bare`, etc. (infrastructure)
- `color.*`, `user.signingkey`, `push.default`, etc. (comportement optionnel)

Si l'utilisateur essaie de lire une clé non reconnue → erreur standard Git (voir cas d'erreur).

## Comportement nominal

### Initialisation

Au démarrage du moteur :
- `user.name` = `"Author"` (valeur par défaut, constante)
- `user.email` = `"author@example.com"` (valeur par défaut, constante)
- La config est stockée dans `Repository.config: Record<string, string>`

### Lecture (`git config <key>`)

**Condition** : L'utilisateur exécute `git config user.name`.

**Comportement** :
1. Chercher `user.name` dans la config
2. Si trouvé → afficher la valeur sur stdout
3. Si non trouvé → afficher rien sur stdout (code 1, voir ci-dessous)

**Sortie** :
```
Author
```

**Code de sortie** : 
- `0` si la clé existe
- `1` si la clé n'existe pas

### Écriture (`git config <key> <value>`)

**Condition** : L'utilisateur exécute `git config user.name "John Doe"`.

**Comportement** :
1. Analyser la clé et la valeur
2. Stocker dans `Repository.config[key] = value`
3. Aucune sortie sur stdout
4. Code de sortie : `0`

**Effet immédiat** : Les commits suivants utiliseront `user.name = "John Doe"` comme auteur.

**Exemple** :
```
$ git config user.name "John Doe"
$ git config user.email "john@example.com"
$ git commit -m "test"
$ git log --oneline
<hash> test  (Author: John Doe <john@example.com>)
```

### Affichage complet (`git config --list`)

**Condition** : L'utilisateur exécute `git config --list`.

**Comportement** :
1. Afficher toutes les clés configurées, une par ligne
2. Format : `key=value`
3. Les clés sont affichées dans un **ordre déterministe** (ex. sort alphabétique)

**Sortie** :
```
user.email=john@example.com
user.name=John Doe
```

**Code de sortie** : `0`

### Impact sur le hash des commits

**CRUCIAL** : L'auteur (auteur + email) entre dans la chaîne canonique de hachage du commit (cf. `CLAUDE.md`). Cela signifie :
- **Avant changement** : `git commit -m "msg"` produit un hash `A` avec auteur initial
- **Après `git config user.name "New"`** : `git commit -m "msg"` produit un hash `B` différent (même message, même arbre, mais auteur différent)
- **Déterminisme** : Rejouer les mêmes commandes (config comprise) dans le même ordre doit redonner les mêmes hashes
- Exemple : 
  ```
  $ git init
  $ git config user.name "Alice"
  $ write file.txt "A"
  $ git add file.txt
  $ git commit -m "A"
  (hash1 avec Alice)
  $ git config user.name "Bob"
  $ git commit --amend -m "A"
  (hash2 avec Bob, car auteur changé)
  ```

### Alias (optionnel)

Support optionnel en Phase 1. Si implémenté :

**Écriture d'un alias** :
```
git config alias.co checkout
```
Stocke `alias.co = "checkout"` dans la config.

**Utilisation** :
```
git co main
```
Est équivalent à `git checkout main`.

**Syntaxe** : L'alias ne peut être qu'un **nom de commande simple** (pas de composition de pipelines) ; l'implémentation est triviale (substitution de token dans le parser).

**Non-supporté en Phase 1 si manque de temps**.

## Cas d'erreur

### Clé inconnue (lecture)

**Condition** : L'utilisateur exécute `git config unknown.key`.

**Comportement** :
- Pas de sortie sur stdout
- Pas d'erreur sur stderr (Git retourne juste `exitCode 1`)
- Code de sortie : `1`

**Notes** : À la différence du vrai Git qui affiche `error: key does not contain a section: unknown.key`, nous restons silencieux (simplification).

### Clé inconnue (écriture)

**Condition** : L'utilisateur exécute `git config unknown.section.key "value"`.

**Comportement** :
- La clé est **acceptée et stockée** (pas de validation stricte)
- Code de sortie : `0`
- Les prochains appels `git config --list` l'affichent
- À l'usage : si ce n'est pas une clé reconnue, elle est **ignorée** par les commandes git

**Exemple** :
```
$ git config user.custom "test"
(stock la clé, exit 0)
$ git config --list | grep user.custom
user.custom=test
(affichée)
$ git commit -m "msg"
(l'auteur reste "Author <author@example.com>", custom est ignorée)
```

### Syntaxe invalide (parsing)

**Condition** : L'utilisateur exécute `git config` (sans arguments).

**Comportement** :
- Message d'erreur : `fatal: missing key for config set operation` (ou similaire)
- Code de sortie : `128`

**Condition** : `git config user.name` (clé valide) mais avec des guillemets mal fermés.

**Comportement** :
- Le parser capture l'erreur (comme pour les autres commandes)
- Message d'erreur : `fatal: parsing error` (générique)
- Code de sortie : `128`

## Persistance et Déterminisme

### Stockage en mémoire

La config est stockée dans l'instance `Repository` :
```typescript
config: Record<string, string> = {
  'user.name': 'Author',
  'user.email': 'author@example.com'
}
```

Au reset du moteur (`engine.reset()`), elle revient aux défauts initiaux.

### Persistance localStorage (Phase 6+)

Lors du sauvegarde de l'historique de commandes en localStorage :
1. **La config initiale n'est pas persistée** (toujours reset aux défauts)
2. Les commandes `git config ...` **sont enregistrées** dans l'historique
3. Au rejeu (`executeScenario` ou reload), les commandes `git config` sont rejouées dans l'ordre → config reconstruite de façon déterministe

**Exemple** :
```
historique sauvegardé:
[ "git init",
  "git config user.name Alice",
  "write file.txt A",
  "git add file.txt",
  "git commit -m first",
  ... ]

Au reload:
Engine reset() → config = defaults
execute("git init") → OK
execute("git config user.name Alice") → config.user.name = "Alice"
execute("write file.txt A") → WT
execute("git add file.txt") → index
execute("git commit -m first") → commit avec Alice comme auteur
→ MÊME hash qu'avant le reload, déterminisme garantit
```

### Garantie de déterminisme

**Contrat** : Deux appels `engine.execute(commandHistory)` avec le même historique et aucune opération non-déterministe (ex. `Date.now()`, `Math.random()`) doivent produire des hashes de commits identiques.

Cela signifie :
- L'auteur DOIT être intégralement issu de `config.user.name` et `config.user.email`
- Jamais de `Date.now()` ou rng dans le hash
- La date du commit = `baseDate + commitCount * increment` (voir CLAUDE.md)
- La config doit être rejouée en ordre d'apparition (même ordre = même config)

## Critères d'acceptation (Given/When/Then)

### CA-config-01 : Lire la config par défaut

**Given**
- Le moteur a été initialisé (new GitEngine)
- Aucune `git config` exécutée

**When**
- L'utilisateur exécute `git config user.name`

**Then**
- `exitCode === 0`
- `output === "Author"` (la valeur par défaut)

### CA-config-02 : Lire la config email par défaut

**Given**
- Le moteur a été initialisé
- Aucune `git config` exécutée

**When**
- L'utilisateur exécute `git config user.email`

**Then**
- `exitCode === 0`
- `output === "author@example.com"`

### CA-config-03 : Écrire et relire une clé

**Given**
- Le moteur a été initialisé

**When**
- L'utilisateur exécute `git config user.name "Alice"`
- Puis `git config user.name`

**Then**
- Premier appel : `exitCode === 0`, `output === ""` (pas de sortie lors de l'écriture)
- Deuxième appel : `exitCode === 0`, `output === "Alice"`

### CA-config-04 : Modifier un auteur change le hash du commit

**Given**
- Le dépôt a été initialisé (`git init`)
- Une file `test.txt` avec contenu "data" est créée et commitée avec l'auteur par défaut

**When**
- L'utilisateur exécute `git config user.name "Alice"`
- Puis crée et committe une deuxième file `test2.txt` avec contenu "data2"`

**Then**
- Deux commits existent
- `commits[0].author === "Author <author@example.com>"` (par défaut)
- `commits[1].author === "Alice <author@example.com>"` (auteur changé, email inchangé)
- `commits[0].hash !== commits[1].hash` (hashes différents malgré le même contenu)

### CA-config-05 : `--list` affiche toutes les clés

**Given**
- Le moteur a été initialisé
- `git config user.name "Alice"` a été exécuté
- `git config user.email "alice@example.com"` a été exécuté

**When**
- L'utilisateur exécute `git config --list`

**Then**
- `exitCode === 0`
- `output` contient les deux lignes :
  - `user.email=alice@example.com`
  - `user.name=Alice`
- (ordre alphabétique ou déterministe)

### CA-config-06 : Clé inconnue (lecture)

**Given**
- Le moteur a été initialisé

**When**
- L'utilisateur exécute `git config unknown.key`

**Then**
- `exitCode === 1`
- `output === ""` (rien affichéé)
- `errors.length === 0` (pas d'erreur écrite)

### CA-config-07 : Clé non reconnue (écriture)

**Given**
- Le moteur a été initialisé

**When**
- L'utilisateur exécute `git config custom.setting "value"`

**Then**
- `exitCode === 0` (acceptée)
- `git config --list` contient la ligne `custom.setting=value`
- Lors du commit, l'auteur reste inchangé (clé inconnue = ignorée)

### CA-config-08 : Aucun argument

**Given**
- Le moteur a été initialisé

**When**
- L'utilisateur exécute `git config` (sans argument)

**Then**
- `exitCode === 128` (erreur)
- `errors[0]` contient "missing key" ou "usage"

### CA-config-09 : Email et name changent ensemble le hash

**Given**
- Le dépôt a été initialisé

**When**
- Commit 1 : `user.name="Author"`, `user.email="author@example.com"` (par défaut)
- `git config user.email "new@example.com"`
- Commit 2 : même message et arbre que Commit 1

**Then**
- `commits[0].hash !== commits[1].hash` (email changé = hash différent)
- `commits[1].author === "Author <new@example.com>"`

### CA-config-10 : Config persiste entre les commandes

**Given**
- Le moteur a été initialisé
- `git config user.name "Bob"` a été exécuté

**When**
- L'utilisateur exécute `git init` (réinitialise le dépôt)
- Puis `git config user.name`

**Then**
- `exitCode === 0` (pour le `git config user.name`)
- `output === "Author"` (reset aux défauts lors du `git init`)

### CA-config-11 : Déterminisme du hash après rejeu

**Given**
- Historique sauvegardé :
  ```
  git init
  git config user.name Alice
  write file.txt "content"
  git add file.txt
  git commit -m "First"
  git config user.name Bob
  write file2.txt "content2"
  git add file2.txt
  git commit -m "Second"
  ```

**When**
- L'historique est rejouée deux fois indépendamment

**Then**
- Premier rejeu → commits avec hashes `H1`, `H2`
- Deuxième rejeu → commits avec mêmes hashes `H1`, `H2`
- (déterminisme exact garanti)

### CA-config-12 : `--list` vide si aucune config

**Given**
- Le moteur a été initialisé (avant tout `git config write`)

**When**
- L'utilisateur exécute `git config --list`

**Then**
- `exitCode === 0`
- `output` contient les valeurs par défaut ou une liste minimale
- (à spécifier : affiche-t-on les défauts implicites ? Comportement Git : oui, les valeurs interne par défaut sont affichées avec `--list`)

### CA-config-13 : Majuscules et casse dans les clés

**Given**
- Le moteur a été initialisé

**When**
- L'utilisateur exécute `git config user.name "Alice"`
- Puis `git config user.NAME`

**Then**
- Premier : `exitCode === 0`, config mise à jour
- Deuxième : `exitCode === 1` (clé `user.NAME` ne match pas `user.name` ; Git est case-insensitive sur les clés, mais pour simplifier on peut être sensible à la casse)

*Note* : À trancher : Git est case-insensitive (`user.name` == `user.NAME`), mais pour simplification en Phase 1, on peut être case-sensitive.

### CA-config-14 : Alias (optionnel)

**Given**
- Le moteur a été initialisé
- Support d'alias implémenté

**When**
- L'utilisateur exécute `git config alias.co checkout`
- Puis `git co main`

**Then**
- Premier : `exitCode === 0`, alias enregistré
- Deuxième : équivalent à `git checkout main`

*Note* : À implémenter optionnellement ; si temps manque, peut être omis en Phase 1.

---

## Implémentation : Points clés

1. **Stockage** : Ajouter `config: Record<string, string>` à `Repository` avec les défauts initiaux.
2. **Parser** : Ajouter une branche `config` dans le parser qui extrait `--list`, `<key>` et `<value>` (optionnel : `--global`, `--system`).
3. **Commande** : Créer `src/core/commands/config.ts` qui lit/écrit dans `repo.config`.
4. **Hash** : Vérifier que l'auteur du commit utilise `repo.config.user.name` et `repo.config.user.email`, PAS de valeurs en dur.
5. **Snapshot** : Exposer la config dans `snapshot.config` pour l'UI (affichage optionnel dans la sidebar).
6. **Tests** : Vérifier le déterminisme des hashes à travers un rejeu avec config différente.
7. **Défauts** : Initialiser avec `user.name="Author"` et `user.email="author@example.com"`.

## Dépendances inter-commandes

- **Utilisé par** : `git commit`, `git revert`, `git cherry-pick` (tous les commandes créant un commit)
- **Dépend de** : `git init` (optionnel, mais config + init = cohérence)
- **Indépendant** : Pas de lien avec les phases précédentes, sauf le hash

---

## Notes pour le développement

- **Déterminisme d'abord** : Le principal challenge est de garantir que deux rejeux identiques produisent des hashes identiques. Tester exhaustivement.
- **Config après reset** : `engine.reset()` doit restaurer les défauts de config (ou PAS ? À trancher : git réel `git reset` ne touche pas la config ; chez nous, reset du moteur efface tout. À documenter).
- **Alias sympa mais optionnel** : Peut être implémenté rapidement (substitution dans le parser), mais non critique.
- **Persistance localStorage** : Pas besoin de sérialiser la config elle-même ; rejeu de l'historique suffisant si `git config` est une commande comme les autres.
