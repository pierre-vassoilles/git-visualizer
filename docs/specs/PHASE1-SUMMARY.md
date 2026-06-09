# Phase 1 : Résumé des Décisions Structurantes

Ce document synthétise les décisions clés de la Phase 1 que l'orchestrateur de développement et les tests (Vitest) doivent connaître.

---

## 1. Modèle de Données en Mémoire

### Stockage

- **Pas de système de fichiers réel** : Tout fonctionne en RAM
- **Structures de données** : En mémoire (dictionnaires TypeScript)
- **Objets Git immuables** : Blobs, Trees, Commits ne changent jamais après création
- **Références mutables** : Seules les refs (`refs/heads/*` et HEAD) changent d'état

### Identification des fichiers

- **Chemins relatifs** : Utiliser des chemins sans `/` au début (ex. `src/main.ts`, pas `/src/main.ts`)
- **Contenu** : Identifiés par leur contenu (string) et chemin pour l'index/working tree
- **Mode** : `100644` (fichier régulier) ou `40000` (répertoire) ; `100755` pour exécutables (Phase 2+)

### Hash et Déterminisme

**Format SHA-1 Git-exact** :

| Type | Format | Exemple |
|------|--------|---------|
| **Blob** | `SHA1("blob " + len + "\0" + content)` | `SHA1("blob 11\0hello world")` |
| **Tree** | Entrées triées, format binaire canonique Git | (voir spec 00-model.md) |
| **Commit** | Format texte identique à Git | (voir spec 00-model.md) |

**Déterminisme** : Même contenu parental = même hash, **toujours**, **synchrone**.

**Implementation** : Utiliser une librairie légère (ex. `crypto-js` ou `TweetNaCl.js`) pour SHA-1.

---

## 2. Auteur et Date (Phase 1)

### Auteur par défaut

```
"Unnamed <unnamed@example.com>"
```

(Configurable ultérieurement, mais constant pour Phase 1)

### Timestamp de date

```
Unix timestamp en secondes (entier)
Valeur initiale : 1000000000
Incrémenté de +1 à chaque nouveau commit dans la même session
```

**Raison** : Garantir l'unicité des timestamps pour le déterminisme des hashes.

**Format lisible** : Convertir en JavaScript `new Date(timestamp * 1000).toUTCString()` ou similaire pour affichage dans `git log`.

---

## 3. HEAD et Branches (Phase 1)

### HEAD Phase 1

**Toujours symbolique** :

```typescript
HEAD = {
  symbolic: true,
  target: "refs/heads/main"
}
```

**Détaché** (mode passé à Phase 2+) : Pas supporté en Phase 1.

### Branche par défaut

- **Nom** : `main` (convention Git moderne, pas `master`)
- **Créée au premier `git init`** : Avant le premier commit
- **Branches supplémentaires** : Non supportées en Phase 1 (voir Phase 2)

---

## 4. Index et Working Tree

### Index

**Représentation** :

```typescript
type Index = {
  [filepath: string]: {
    blobHash: string,    // SHA-1 du contenu
    content: string,     // Le contenu lui-même
    mode: "100644" | "100755"
  }
}
```

- **Créé vide** au `git init`
- **Rempli par `git add`** : Ajoute des blobs
- **Vidé par `git commit`** : Index devient `{}`

### Working Tree

**Représentation** :

```typescript
type WorkingTree = {
  [filepath: string]: {
    content: string,
    mode: "100644" | "100755"
  }
}
```

- **Créé vide** au `git init`
- **Modifié par `write` (utilitaire)** : Crée/modifie des fichiers
- **Consulté par `git add`** : Pour calculer les hashes

---

## 5. Commandes Phase 1

### Portée

| Commande | Statut | Notes |
|----------|--------|-------|
| `git init` | ✓ Implémentée | Initialise le dépôt |
| `git add <pathspec...>` | ✓ Implémentée | Ajoute à l'index |
| `git status` | ✓ Implémentée | Affiche l'état |
| `git commit -m "msg"` | ✓ Implémentée | Crée un commit |
| `git log` | ✓ Implémentée | Affiche l'historique |
| `write` (utilitaire) | ✓ Implémentée | Crée/modifie fichiers |
| `read` (utilitaire) | ✓ Implémentée | Affiche un fichier |
| `git branch`, `git checkout` | ✗ Phase 2+ | Pas en Phase 1 |
| `git merge`, `git rebase` | ✗ Phase 2+ | Pas en Phase 1 |
| `git rm`, `git mv` | ✗ Phase 1.5+ | Pas en Phase 1 |

### Modes d'erreur communs

| Condition | Code de sortie | Message d'erreur |
|-----------|----------------|-----------------|
| Dépôt non initialisé | 128 | `fatal: not a git repository...` |
| Argument manquant | 1 | `fatal: option '-m' is required` |
| Pathspec non trouvé | 1 | `fatal: pathspec '...' did not match any files` |
| Index vide (commit) | 1 | `fatal: no changes added to commit` |
| Aucun commit (log) | 1 | `fatal: No commits yet` |

---

## 6. Système de fichiers virtuel

### Commandes utilitaires

**`write <filepath> [content]`** : Créer/modifier un fichier

```bash
write README.md "# Project"
write src/main.ts "code"
write empty.txt              # Fichier vide
```

**`read <filepath>`** : Afficher le contenu

```bash
read README.md
```

### Validations de chemin

- ✓ Autorisé : `hello.txt`, `src/main.ts`, `nested/dir/file.txt`
- ✗ Rejeté : `/absolute/path`, `../../escaped`, `path/`, `./current`

---

## 7. Structure des fichiers du moteur

### Emplacements clés (à créer/modifier)

```
src/core/
  engine.ts         ← GitEngine class
  types.ts          ← Interfaces (ajout : Repository, objects, etc.)
  hash.ts           ← Utilitaires SHA-1 (à créer)
  parser.ts         ← Parser de commandes (à créer si complexe)
  git/              ← (Optionnel) Sous-modules pour chaque commande
    init.ts
    add.ts
    status.ts
    commit.ts
    log.ts

docs/specs/
  00-model.md       ← Modèle de données
  01-init.md        ← git init spec
  02-add.md         ← git add spec
  03-status.md      ← git status spec
  04-commit.md      ← git commit spec
  05-log.md         ← git log spec
  06-virtual-fs.md  ← write/read spec
  PHASE1-SUMMARY.md ← Ce fichier
```

---

## 8. Critères de succès (Acceptance Criteria)

### Couverture de tests

- **Minimum** : Chaque spec (01-05, 06) doit avoir au moins 10 CA
- **Vitest** : Les CA doivent être traductibles en tests `describe`/`it`
- **Couverture de code** : Viser >80% des chemins du moteur

### Cas limites prioritaires

1. ✓ **Dépôt vierge** : Toutes les commandes doivent gérer le cas "rien"
2. ✓ **Index vide** : `git commit`, `git status` avec index vide
3. ✓ **Aucun commit** : `git log`, `git status` sans historique
4. ✓ **Fichier remodifié** : Ajouter → modifier → voir deux statuts
5. ✓ **Déterminisme** : Commits identiques = hashes identiques

---

## 9. Évolutions futures (Phase 2+)

**Ne pas implémenter en Phase 1**, mais noter pour la route :

- **Branches** : `git branch`, `git checkout`, multi-branches
- **Merge** : `git merge`, DAG avec multi-parents
- **Rebase** : `git rebase`, réécritures d'historique
- **Tags** : `git tag`, `git tag -l`
- **HEAD détaché** : `checkout <commit>`, pas toujours sur `main`
- **Stash** : `git stash`, sauvegarde temporaire
- **Reset** : `git reset`, retour à un état antérieur
- **Diff** : `git diff`, affichage des changements
- **Index avancé** : `git rm`, `git mv`, `git restore`

---

## 10. Points d'attention pour le développement

### 1. Immuabilité des objets

Une fois un blob/tree/commit créé, il ne doit jamais changer. Utiliser `Object.freeze()` ou structures immutables pour l'enforcer.

### 2. Parsing des commandes

L'entry point `execute(input: string)` reçoit une ligne brute. Bien parser les arguments, espaces, quotes, etc.

### 3. Calcul du tree depuis l'index

La tâche la plus complexe est de construire un tree récursivement depuis l'index (qui est plat). Exemple :

```
Index:
  "README.md" → blob_hash_A
  "src/main.ts" → blob_hash_B
  "src/types.ts" → blob_hash_C

Tree généré:
  README.md → blob_hash_A
  src/ → (subtree)
    main.ts → blob_hash_B
    types.ts → blob_hash_C
```

Implémenter une fonction récursive pour cela.

### 4. Validation des chemins

Normaliser et valider les chemins partout (pas de `//`, `/`, `..`, etc.).

### 5. Messages d'erreur exactes

Pour une meilleure UX, les messages d'erreur doivent matcher Git le plus possible. Tester contre `git` réel.

### 6. Ordre d'affichage

- `git status` : Fichiers triés alphabétiquement
- `git log` : Du plus récent au plus ancien
- `git add .` : Tous les fichiers du working tree

### 7. Index vs Working Tree

L'index et le working tree peuvent diverger (ex. fichier remodifié après add). Cette divergence doit être visible dans `git status`.

---

## 11. Checklist de livraison Phase 1

- [ ] Spec 00-model.md révisée et approuvée
- [ ] Spec 01-init.md + tests Vitest (CA-init-01 à CA-init-03)
- [ ] Spec 02-add.md + tests Vitest (CA-add-01 à CA-add-10)
- [ ] Spec 03-status.md + tests Vitest (CA-status-01 à CA-status-09)
- [ ] Spec 04-commit.md + tests Vitest (CA-commit-01 à CA-commit-10)
- [ ] Spec 05-log.md + tests Vitest (CA-log-01 à CA-log-10)
- [ ] Spec 06-virtual-fs.md + tests Vitest (CA-write-01 à CA-write-10)
- [ ] Couverture de code moteur >80%
- [ ] Aucune dépendance externe pour l'FS réel
- [ ] Tous les CA traduits en tests et passants
- [ ] Messages d'erreur matchen Git standard
- [ ] Documentation des invariants de Repository

---

## 12. Exemple de scénario complet (Phase 1)

Voici un scénario qu'un utilisateur pourrait exécuter :

```bash
# Initialiser
git init
# → Output: "Initialized empty Git repository"

# Créer des fichiers
write README.md "# My Project"
write src/main.ts "console.log('hello');"

# Vérifier l'état
git status
# → Affiche les deux fichiers untracked

# Ajouter à l'index
git add README.md src/main.ts

# Vérifier de nouveau
git status
# → Affiche les deux fichiers à "new file" et staged

# Créer un commit
git commit -m "Initial commit"
# → Output: "[main abc1234] Initial commit"

# Voir l'historique
git log
# → Affiche le commit avec hash, date, message

# Modifier un fichier
write src/main.ts "console.log('hello world');"

# Vérifier l'état
git status
# → Affiche le fichier modifié (unstaged)

# Re-ajouter et committer
git add src/main.ts
git commit -m "Update main.ts"

# Voir les deux commits
git log --oneline
# → Liste les deux commits (plus récent d'abord)
```

---

## Contact et Questions

- **Spécifications** : Consulter les fichiers dans `docs/specs/`
- **Implémentation** : En `src/core/`
- **Tests** : En `tests/` (Vitest)
- **Déploiement** : Via Vite (build + serve)

Bon développement ! 🚀
