# Phase 1 : Système de fichiers virtuel

## Résumé

Comme le projet s'exécute dans un terminal web sans accès au système de fichiers réel, il faut un mécanisme pour créer et modifier des fichiers dans le working tree virtuel. Ce document spécifie la commande utilitaire (non-Git) permettant cela.

## Rationale

Les commandes Git (`git add`, `git status`, `git commit`) opèrent sur le working tree. Sans possibilité de créer/modifier des fichiers, ces commandes seraient inutiles. La solution est une **commande utilitaire simple** (analogue à `echo`, `touch`, `cat` en shell réel) pour gérer les fichiers virtuels.

## Approche choisie : Commande `write`

**Syntaxe simplifiée et pragmatique** :

```bash
write <filepath> <content>
```

ou

```bash
write <filepath>
```

### Arguments

| Argument | Comportement | Obligatoire |
|----------|-------------|------------|
| `<filepath>` | Chemin du fichier à créer/modifier (ex. `hello.txt`, `src/main.ts`) | Oui |
| `<content>` | Contenu du fichier (string) | Optionnel (voir ci-dessous) |

### Variantes

#### 1. Créer/modifier un fichier avec contenu

```bash
write README.md "# My Project"
write src/main.ts "console.log('hello')"
write nested/dir/file.txt "content"
```

**Comportement** :
- Si le fichier n'existe pas, le créer
- Si le fichier existe, remplacer son contenu
- Créer les répertoires imbriqués automatiquement (ex. `nested/dir/`)
- Ajouter le fichier au working tree

**Sortie** : Aucune (succès silencieux)

**Code de sortie** : 0

#### 2. Créer un fichier vide (touch)

```bash
write filename.txt
```

(Sans deuxième argument.)

**Comportement** :
- Créer un fichier vide

**Sortie** : Aucune

**Code de sortie** : 0

#### 3. Afficher le contenu d'un fichier (cat)

```bash
read <filepath>
```

**Comportement** :
- Afficher le contenu du fichier sur stdout, ligne par ligne
- Erreur si le fichier n'existe pas

**Sortie** : Contenu du fichier

**Code de sortie** : 0 (succès) ou 1 (fichier non trouvé)

**Exemple** :
```bash
read README.md
# Affiche : "# My Project"
```

### Cas d'erreur

#### Chemin invalide

**Condition** : Utiliser un chemin absolu ou invalide.

**Message d'erreur** (stderr) :
```
error: invalid path '<filepath>'
```

**Code de sortie** : 1

**Exemple invalide** : `/absolute/path/file.txt`, `../../escaped.txt`

#### Fichier non trouvé (read)

**Condition** : Appeler `read <filepath>` sur un fichier inexistant.

**Message d'erreur** (stderr) :
```
error: file not found: '<filepath>'
```

**Code de sortie** : 1

---

## Critères d'acceptation (Given/When/Then)

### CA-write-01 : Créer un fichier simple

**Given**
- Le working tree est vide

**When**
- L'utilisateur exécute `write hello.txt "hello world"`

**Then**
- `exitCode === 0`
- `output` est vide
- `workingTree["hello.txt"]` existe
- `workingTree["hello.txt"].content === "hello world"`

### CA-write-02 : Créer un fichier avec chemin imbriqué

**Given**
- Le working tree est vide

**When**
- L'utilisateur exécute `write src/core/main.ts "code"`

**Then**
- `exitCode === 0`
- `workingTree["src/core/main.ts"]` existe
- `workingTree["src/core/main.ts"].content === "code"`

### CA-write-03 : Modifier un fichier existant

**Given**
- `workingTree["file.txt"]` existe avec contenu "v1"

**When**
- L'utilisateur exécute `write file.txt "v2"`

**Then**
- `exitCode === 0`
- `workingTree["file.txt"].content === "v2"` (remplacé)

### CA-write-04 : Créer un fichier vide (write sans contenu)

**Given**
- Le working tree est vide

**When**
- L'utilisateur exécute `write empty.txt`

**Then**
- `exitCode === 0`
- `workingTree["empty.txt"]` existe
- `workingTree["empty.txt"].content === ""`

### CA-write-05 : Lire le contenu d'un fichier (read)

**Given**
- `workingTree["doc.md"]` existe avec contenu "# Heading\nSome text"

**When**
- L'utilisateur exécute `read doc.md`

**Then**
- `exitCode === 0`
- `output[0] === "# Heading"`
- `output[1] === "Some text"`

### CA-write-06 : Lire un fichier inexistant

**Given**
- `workingTree["missing.txt"]` n'existe pas

**When**
- L'utilisateur exécute `read missing.txt`

**Then**
- `exitCode === 1`
- `errors[0]` contient "file not found"

### CA-write-07 : Chemin invalide (absolu)

**Given**
- Aucune condition préalable

**When**
- L'utilisateur exécute `write /absolute/path.txt "content"`

**Then**
- `exitCode === 1`
- `errors[0]` contient "invalid path"
- Le working tree n'est pas modifié

### CA-write-08 : Contenu avec espaces

**Given**
- Aucune condition préalable

**When**
- L'utilisateur exécute `write file.txt "hello world with spaces"`

**Then**
- `exitCode === 0`
- `workingTree["file.txt"].content === "hello world with spaces"`

### CA-write-09 : Contenu avec caractères spéciaux

**Given**
- Aucune condition préalable

**When**
- L'utilisateur exécute `write file.txt "line1\nline2\n"`

**Then**
- `exitCode === 0`
- Le contenu inclut les newlines littérales

### CA-write-10 : Interaction avec git add et status

**Given**
- Le dépôt a été initialisé

**When**
- L'utilisateur exécute `write myfile.txt "content"`
- Puis `git add myfile.txt`
- Puis `git status`

**Then**
- `git status` affiche `myfile.txt` comme "new file" à ajouter
- L'index contient `myfile.txt`

---

## Implémentation : Points clés

1. **Parser les arguments** : Gérer les cas où le contenu est absent (fichier vide).
2. **Création de répertoires** : Implémenter un système de chemins imbriqués (ex. créer `src` et `core` si `src/core/file.txt` est demandé).
3. **Normalisation des chemins** : Rejeter les chemins absolus, les `..`, les `//`.
4. **Contenu multi-ligne** : Supporter les newlines dans le contenu (`\n`).
5. **Isolation** : Les commandes `write` et `read` ne sont que pour le working tree ; elles ne touchent pas l'index ou les commits.

## Dépendances inter-commandes

- **Utilisé par** : `git add`, `git status`, `git commit` (qui opèrent sur le working tree)
- **Non Git** : Commande utilitaire, pas une vraie commande Git

---

## Notes pour le développement

- Les commandes `write` et `read` sont des **utilitaires de test et de démonstration** ; elles ne sont pas partie du standard Git mais nécessaires pour l'implémentation.
- Elles doivent être intégrées au moteur Git (mêmes calls `execute()`) mais avec un dispatcher préalable (ex. si `input` commence par `write` ou `read`, utiliser le handler d'utilitaire).
- Un scénario complet d'utilisation :
  ```bash
  git init
  write README.md "# Project"
  git add README.md
  git status
  git commit -m "Initial commit"
  git log
  ```

---

## Alternative future : Shell interactif

En Phase 2+, on pourrait envisager un shell interactif complet (bash-like) pour manipuler le working tree avec des commandes réelles comme `echo`, `touch`, `cat`, etc. Cela dépasserait le scope de Phase 1.

Pour Phase 1, les commandes `write` et `read` suffisent.
