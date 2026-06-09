# Phase 1 : git init

## Résumé

La commande `git init` initialise un dépôt Git vierge. À la fin, le dépôt est dans un état connu :
- Une branche par défaut `main` existe et est active via HEAD
- Pas de commits
- Index vide
- Working tree vide

## Syntaxe

```
git init [options]
```

### Options supportées en Phase 1

| Flag | Comportement | Notes |
|------|-------------|-------|
| Aucun | Initialise le dépôt | État par défaut |

**Remarque** : Les flags `-q`, `--bare`, `--initial-branch`, etc. ne sont pas implémentés en Phase 1.

## Comportement nominal

### État initial avant init

Avant d'appeler `git init`, le dépôt n'existe pas (ou est vierge). Chaque instance de `GitEngine` démarre en état non-initialisé.

### État après init

Après `git init` succès :

1. **Repository créée** : La structure interne est initialisée
2. **HEAD configuré** : HEAD symbolique → `refs/heads/main`
3. **Branche main** : Créée dans `refs/heads/main` (aucun commit associé pour l'instant)
4. **Index vide**
5. **Working tree vide**

### Sortie standard

```
Initialized empty Git repository in <virtual path>
```

Où `<virtual path>` est un chemin virtuel constant (ex. `./.git/`).

### Code de sortie

- **0** : succès
- **1** : erreur (ex. dépôt déjà initialisé)

## Cas d'erreur

### Dépôt déjà initialisé

**Condition** : Appeler `git init` sur un dépôt qui a déjà été initialisé (HEAD existe).

**Sortie standard** (stdout, pas une erreur — comme le vrai Git) :
```
Reinitialized existing Git repository in <virtual path>
```

**Code de sortie** : 0 (Git considère cela comme un succès)

**Comportement** : L'état du dépôt reste inchangé ; il n'est pas réinitialisé.

## Critères d'acceptation (Given/When/Then)

### CA-init-01 : Init sur dépôt vierge

**Given**
- L'engine est en état vierge (pas d'initialisation)

**When**
- L'utilisateur exécute `git init`

**Then**
- `exitCode === 0`
- `output[0]` contient "Initialized empty Git repository"
- `HEAD.symbolic === true`
- `HEAD.target === "refs/heads/main"`
- `refs.heads.main` existe (aucune valeur : branche sans commit)
- `index === {}` (vide)
- `workingTree === {}` (vide)
- `objects === {}` (vide)

### CA-init-02 : Init sur dépôt déjà initialisé

**Given**
- L'engine a déjà été initialisé (HEAD existe)

**When**
- L'utilisateur exécute `git init` à nouveau

**Then**
- `exitCode === 0`
- `errors[0]` contient "Reinitialized existing Git repository"
- L'état du dépôt reste inchangé (même refs, même objects, etc.)

### CA-init-03 : Vérification des chemins valides après init

**Given**
- L'engine vient de subir `git init`

**When**
- L'utilisateur exécute `git status`

**Then**
- La branche affichée est `main`
- Aucun fichier n'est listé (working tree vide)

---

## Implémentation : Points clés

1. **Vérification de l'état** : Tester si `HEAD` est déjà défini pour détecter une réinitialisation.
2. **Initialisation atomique** : Créer tous les composants en une seule opération.
3. **Branche par défaut** : `main` (suivre la convention Git moderne).
4. **Message de sortie** : Doit exactement matcher le format Git.

## Dépendances inter-commandes

- **`git init`** doit être appelée avant toute autre commande Git (à part l'aide).
- Aucune autre commande ne devrait succéder sans `git init`.

---

## Notes pour le développement

- La notion de "dépôt déjà initialisé" dépend de l'existence de HEAD.
- Chaque test Vitest doit commencer par `new GitEngine()` + `init()` pour avoir un état propre.
- Pas de fichier `.git/` réel ; utiliser des structures de données en mémoire.
