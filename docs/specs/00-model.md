# Phase 1 : Modèle de Données

## Vue d'ensemble

La Phase 1 introduit un modèle de données complet pour un dépôt Git minimal. Tout fonctionne en mémoire sans accès au système de fichiers réel — les fichiers sont identifiés par leur chemin et leur contenu.

## Concepts fondamentaux

### 1. Objets Git

Le dépôt stocke trois types d'objets immuables :

#### Blob
Représente le contenu d'un fichier.

```
type Blob = {
  type: "blob",
  content: string    // contenu du fichier
}

Hash (SHA-1 déterministe) = SHA1("blob " + content.length + "\0" + content)
```

Exemple :
```
content = "hello world"
hash = SHA1("blob 11\0hello world") = "95d09f2b...abc123"
```

#### Tree
Représente un répertoire et liste les entrées (blobs et sous-arbres).

```
type Tree = {
  type: "tree",
  entries: {
    [name: string]: {
      mode: "100644" (fichier) | "40000" (répertoire),
      hash: string
    }
  }
}

Hash (SHA-1 déterministe) = SHA1(format_canonique)
```

Format canonique (identique à Git) :
```
Pour chaque entrée (triée par nom) :
  mode (octal) + " " + name + "\0" + hash_binaire (20 octets)
```

Exemple :
```
entries = {
  "README.md": { mode: "100644", hash: "abc123..." },
  "src": { mode: "40000", hash: "def456..." }
}
```

#### Commit
Représente un snapshot du dépôt (pointeur vers un tree + métadonnées).

```
type Commit = {
  type: "commit",
  tree: string,           // hash du tree associé
  parents: string[],      // hashes des commits parents (tableau vide pour le premier)
  author: string,         // ex. "Alice <alice@example.com>"
  date: number,           // timestamp Unix en secondes
  message: string         // message du commit
}

Hash (SHA-1 déterministe) = SHA1(format_canonique)
```

Format canonique (identique à Git) :
```
"tree " + tree_hash + "\n" +
(parents.map(p => "parent " + p + "\n").join("")) +
"author " + author + " " + date + " +0000\n" +
"committer " + author + " " + date + " +0000\n" +
"\n" +
message
```

Exemple :
```
tree d41d8cd98f00b204e9800998ecf8427e
parent a1b2c3d4e5f6...
author Alice <alice@example.com> 1234567890 +0000
committer Alice <alice@example.com> 1234567890 +0000

Première version du README
```

### 2. Références (Refs)

Les références pointent vers des commits.

```
type Ref = {
  symbolic?: boolean,   // true si référence symbolique (ex. HEAD → refs/heads/main)
  target: string        // hash de commit ou chemin d'une autre ref
}

Refs stockées dans :
  refs/heads/BRANCHNAME → commit hash
  refs/tags/TAGNAME → commit hash (phase 1 : pas de tags)
```

**HEAD** : référence spéciale, peut être :
- **Symbolique** : `HEAD → refs/heads/main` (cas normal) → pointe indirectement vers un commit
- **Détachée** : `HEAD → abc123def...` (hash direct) → cas spécial (phase 2+)

### 3. Index (Staging Area)

L'index enregistre les fichiers qui ont été `git add`-és, prêts pour le prochain commit.

```
type Index = {
  [filepath: string]: {
    blobHash: string,   // hash du contenu stagé
    content: string,    // le contenu lui-même (pour cohérence)
    mode: "100644" (fichier) | "100755" (exécutable)
  }
}
```

**Invariants** :
- L'index ne contient que des chemins valides (ex. pas de "/" au début)
- Chaque entrée a un hash déterministe du contenu
- Supprimer un fichier (git rm) enlève l'entrée

### 4. Working Tree

L'état du répertoire de travail tel que vu par l'utilisateur.

```
type WorkingTree = {
  [filepath: string]: {
    content: string,    // contenu du fichier
    mode: "100644" | "100755"
  }
}
```

**Invariants** :
- Les chemins n'ont pas de "/" au début
- Un fichier ne peut pas avoir deux représentations

### 5. État du dépôt (Repository)

Encapsule tous les composants du dépôt.

```
type Repository = {
  // Stockage des objets
  objects: {
    [hash: string]: Blob | Tree | Commit
  },
  
  // Références
  refs: {
    heads: {
      [branchName: string]: string  // hash du commit
    },
    tags: {}  // phase 2
  },
  
  // HEAD
  head: {
    symbolic: boolean,
    target: string  // "refs/heads/main" ou hash
  },
  
  // Index (staging area)
  index: Index,
  
  // Working tree
  workingTree: WorkingTree
}
```

## Invariants globaux

1. **Chaque commit a un tree associé** : `commit.tree` pointe toujours vers un tree existant.
2. **Chaque parent existant** : `commit.parents` ne contient que des hashes de commits existants.
3. **HEAD cohérent** : Si `HEAD.symbolic = true`, alors `HEAD.target` pointe vers une ref valide en `refs/heads/*`.
4. **Index < Working Tree** : L'index ne contient que des fichiers qui existent aussi dans le working tree OU qui ont été supprimés intentionnellement.
5. **Immuabilité des objets** : Une fois créé, un objet (blob/tree/commit) ne peut pas être modifié ; seules les refs changent.
6. **Pas de cycles dans les parents** : DAG (Directed Acyclic Graph) : un commit ne peut pas être son propre ancêtre.

## Calcul des hashes (SHA-1)

Le projet utilise **crypto-js** ou **TweetNaCl.js** ou une librairie légère pour SHA-1.

Format strictement identique à Git :
- **Blob** : `"blob " + content.length + "\0" + content`
- **Tree** : entrées triées, format canonique binaire
- **Commit** : format texte identique à Git

**Important** : Les hashes doivent être **déterministes**. Même contenu = même hash, toujours.

## Simulation d'auteur et de date

Pour simplifier, en Phase 1 :

```
author = "Unnamed <unnamed@example.com>"  (configurable ultérieurement)
date = timestamp Unix en secondes, incrémenté à chaque commit
       (ex. 1000000000 + numCommits)
```

Cela garantit que des commits différents ont des dates différentes (même si lés contenus parents/message sont identiques).

---

## Résumé des décisions structurantes

| Aspect | Décision |
|--------|----------|
| **Stockage** | En mémoire, pas de FS réel |
| **Identification fichiers** | chemin + contenu (string) |
| **Hash** | SHA-1 déterministe, format Git exact |
| **Auteur Phase 1** | "Unnamed <unnamed@example.com>" |
| **Date Phase 1** | Timestamp Unix incrémenté par commit |
| **Index** | Dictionnaire filepath → {blobHash, content, mode} |
| **Working Tree** | Dictionnaire filepath → {content, mode} |
| **HEAD Phase 1** | Toujours symbolique (refs/heads/main) |
| **Branches Phase 1** | main uniquement ; checkout/branch viennent Phase 2+ |
| **Immuabilité** | Objets immuables ; seules refs mutent |
