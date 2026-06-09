# Phase 2 : git tag

## Résumé

La commande `git tag` gère les étiquettes (tags) du dépôt : les lister, créer une nouvelle étiquette légère sur un commit, ou supprimer une étiquette. Les tags pointent vers des commits et peuvent être nommés pour faciliter la navigation (ex. "v1.0", "release").

**Phase 2 scope** : Tags légers uniquement (simple ref vers un commit). Les tags annotés (objets Git avec métadonnées) viennent en phase ultérieure.

## Syntaxe

```
git tag [options] [<tagname> [<commit>]]
```

### Options supportées en Phase 2

| Option | Argument | Comportement | Notes |
|--------|----------|-------------|-------|
| (aucun) | (aucun) | Liste tous les tags | Ordre alphabétique |
| (aucun) | `<tagname>` | Crée un tag léger sur HEAD | |
| (aucun) | `<tagname> <commit>` | Crée un tag léger sur un commit spécifié | |
| `-d` | `<tagname>` | Supprime un tag | |

**Remarque** : Les flags `-a`, `-m`, `-s`, `--sign`, `-u`, `--contains`, `-l`, `--format`, etc. ne sont pas implémentés en Phase 2.

## Comportement nominal

### Cas 1 : Lister les tags (`git tag`)

**Condition** : Aucun argument.

**Processus** :
1. Parcourir `repo.refs.tags` (toutes les étiquettes)
2. Trier alphabétiquement par nom
3. Afficher chaque tag sur une ligne

**Sortie** :
```
release
v1.0
v1.1
```

(Ordre alphabétique.)

**Cas particulier** : S'il n'y a aucun tag, affichage vide (pas de message d'erreur).

**Code de sortie** : 0

### Cas 2 : Créer un tag sur HEAD (`git tag <tagname>`)

**Condition** : Un argument, sans `<commit>`.

**Processus** :
1. Vérifier que `<tagname>` n'existe pas déjà dans `refs.tags`
2. Récupérer le hash du commit HEAD courant
3. Vérifier que HEAD pointe sur un commit (sinon, erreur)
4. Créer l'entrée `refs.tags[<tagname>] = <hash_du_commit_HEAD>`
5. **Pas d'output** (succès muet)
6. **Code de sortie** : 0

**Cas particulier** : Si HEAD est détaché, créer le tag sur le commit détaché (pas d'erreur).

### Cas 3 : Créer un tag sur un commit spécifié (`git tag <tagname> <commit>`)

**Condition** : Deux arguments.

**Processus** :
1. Vérifier que `<tagname>` n'existe pas déjà
2. Vérifier que `<commit>` existe dans `objects`
3. Créer l'entrée `refs.tags[<tagname>] = <commit>`
4. **Pas d'output**
5. **Code de sortie** : 0

### Cas 4 : Supprimer un tag (`git tag -d <tagname>`)

**Condition** : Flag `-d` et un argument.

**Processus** :
1. Vérifier que `<tagname>` existe dans `refs.tags`
2. Supprimer l'entrée `refs.tags[<tagname>]`
3. **Sortie** : `Deleted tag '<tagname>' (was <shortHash>).` où `<shortHash>` est le commit pointé
4. **Code de sortie** : 0

## Cas d'erreur

### Tag déjà existant

**Condition** : Appeler `git tag <tagname>` où `<tagname>` existe déjà dans `refs.tags`.

**Message d'erreur** :
```
fatal: tag '<tagname>' already exists
```

**Code de sortie** : 1

**Comportement** : Aucune modification aux refs.

### Tag à supprimer n'existe pas

**Condition** : Appeler `git tag -d <tagname>` où `<tagname>` n'existe pas.

**Message d'erreur** :
```
error: tag '<tagname>' not found.
```

**Code de sortie** : 1

**Comportement** : Aucune modification.

### Créer un tag sur un commit inexistant

**Condition** : Appeler `git tag <tagname> <commit>` où `<commit>` n'existe pas dans `objects`.

**Message d'erreur** :
```
fatal: object '<commit>' is not a commit
```

ou (variante) :

```
fatal: cannot find object for '<commit>'
```

**Code de sortie** : 1

**Comportement** : Aucune modification.

### Créer un tag sur HEAD vierge (aucun commit)

**Condition** : Appeler `git tag <tagname>` alors qu'il n'y a aucun commit (HEAD détaché ou branche vide).

**Message d'erreur** :
```
fatal: Failed to resolve 'HEAD' as a valid ref.
```

ou (simplifié) :

```
fatal: cannot describe anything with HEAD
```

**Code de sortie** : 1

**Comportement** : Aucune modification.

### Nom de tag invalide

**Condition** : Appeler `git tag <tagname>` où `<tagname>` contient des caractères invalides ou est vide.

**Message d'erreur** :
```
fatal: invalid tag name '<tagname>'
```

**Code de sortie** : 1

**Phase 2 Implémentation** : Accepter tout nom alphanummérique + tirets, points, underscores. Rejeter :
- Noms vides
- Noms commençant par `-`
- Noms réservés : `HEAD`, etc.

### Dépôt non initialisé

**Condition** : Appeler `git tag` sans `git init`.

**Message d'erreur** :
```
fatal: not a git repository (or any of the parent directories): .git
```

**Code de sortie** : 128

## Critères d'acceptation (Given/When/Then)

### CA-tag-01 : Lister les tags (aucun)

**Given**
- L'engine est initialisé
- Aucun tag n'existe

**When**
- L'utilisateur exécute `git tag`

**Then**
- `exitCode === 0`
- `output` est vide (pas de tags listés)

### CA-tag-02 : Lister les tags (plusieurs, tri alphabétique)

**Given**
- L'engine est initialisé avec commits
- Les tags existent : `release`, `v1.0`, `v1.1` (pointant vers des commits)

**When**
- L'utilisateur exécute `git tag`

**Then**
- `exitCode === 0`
- `output` contient les trois lignes en ordre alphabétique :
  - `"release"`
  - `"v1.0"`
  - `"v1.1"`

### CA-tag-03 : Créer un tag sur HEAD

**Given**
- L'engine est initialisé avec un commit (hash = "abc123...")
- HEAD pointe sur ce commit
- Aucun tag `v1.0` n'existe

**When**
- L'utilisateur exécute `git tag v1.0`

**Then**
- `exitCode === 0`
- `output` est vide (succès muet)
- `refs.tags['v1.0'] === "abc123..."` (ou hash complet)

### CA-tag-04 : Créer un tag sur un commit spécifié

**Given**
- L'engine a deux commits : c1 et c2
- HEAD pointe sur c2
- Aucun tag `v1.0` n'existe

**When**
- L'utilisateur exécute `git tag v1.0 c1` (ou hash complet de c1)

**Then**
- `exitCode === 0`
- `refs.tags['v1.0'] === c1`

### CA-tag-05 : Créer un tag en mode HEAD détaché

**Given**
- L'engine a commits
- HEAD est détaché sur le commit c2

**When**
- L'utilisateur exécute `git tag v1.0`

**Then**
- `exitCode === 0`
- `refs.tags['v1.0']` pointe sur c2 (le commit détaché)

### CA-tag-06 : Supprimer un tag

**Given**
- L'engine est initialisé
- Un tag `v1.0` existe (pointant sur "abc123...")

**When**
- L'utilisateur exécute `git tag -d v1.0`

**Then**
- `exitCode === 0`
- `output[0]` contient `"Deleted tag 'v1.0'"` et le shortHash
- `refs.tags['v1.0']` n'existe plus

### CA-tag-07 : Erreur : tag déjà existant

**Given**
- L'engine est initialisé
- Un tag `v1.0` existe déjà

**When**
- L'utilisateur exécute `git tag v1.0`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"tag 'v1.0' already exists"`
- `refs.tags` inchangé

### CA-tag-08 : Erreur : supprimer un tag inexistant

**Given**
- L'engine est initialisé
- Aucun tag `nosuch` n'existe

**When**
- L'utilisateur exécute `git tag -d nosuch`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"tag 'nosuch' not found"`
- Aucune modification

### CA-tag-09 : Erreur : créer un tag sur un commit inexistant

**Given**
- L'engine est initialisé

**When**
- L'utilisateur exécute `git tag v1.0 nosuchcommit`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"is not a commit"` ou `"cannot find object"`
- `refs.tags` inchangé

### CA-tag-10 : Erreur : créer un tag sur HEAD vierge

**Given**
- L'engine est initialisé avec `git init` mais aucun commit
- HEAD pointe sur la branche main (vide)

**When**
- L'utilisateur exécute `git tag v1.0`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"Failed to resolve 'HEAD'"` ou similaire
- `refs.tags` inchangé

### CA-tag-11 : Nom de tag invalide (vide)

**Given**
- L'engine est initialisé

**When**
- L'utilisateur exécute `git tag ""`

**Then**
- `exitCode === 1`
- `errors[0]` contient `"invalid tag name"`

## Implémentation : Points clés

1. **Listage** : Itérer sur `Object.entries(repo.refs.tags)`, trier alphabétiquement, afficher chaque nom
2. **Création** : Vérifier l'unicité dans `refs.tags`, vérifier que le commit existe, assigner le hash
3. **Suppression** : Vérifier l'existence, récupérer le shortHash avant suppression, puis `delete refs.tags[name]`
4. **Validation** : Créer `isValidTagName(name: string): boolean` pour vérifier les noms
5. **Résolution HEAD** : Utiliser `headCommitHash(repo)` pour obtenir le hash de HEAD ; si `null`, erreur
6. **Résolution commit** : Supporter les hashes courts (7 chars) — implémenter `resolveCommitHash(repo, shortOrFull: string): string | null`

## Dépendances inter-commandes

- **`git tag`** dépend de `git init` (dépôt initialisé)
- **`git tag`** peut interagir avec `git log` (affichage des tags, Phase 3+)
- **`git tag`** peut interagir avec `git checkout <tag>` (checkout sur un tag, Phase 3+)

## Notes Phase 2

### Tags dans le snapshot

Le snapshot (engine.ts) doit inclure les tags pour que le graphe puisse les afficher :

```typescript
export interface RepoSnapshot {
  ...
  tags: Record<string, string>;  // tagName → hash
}

export interface SnapshotCommit {
  ...
  tags: string[];  // tags pointant sur ce commit
}
```

Adapter `snapshot()` pour construire les maps `hash → tags[]`.

### Tags et branches

Les tags et branches sont indépendants ; un même commit peut avoir plusieurs branches et plusieurs tags. Le snapshot reflète les deux.

### Ordre d'affichage

`git tag` affiche les tags en ordre alphabétique (pas en ordre de création). Utiliser `.sort()`.

### Tags légers vs annotés

Phase 2 implémente uniquement les tags légers (ref simples). Les tags annotés (objets Git avec auteur, date, message) viennent en phase ultérieure.

Une tag léger est juste `refs.tags[name] = <commit_hash>`.

Un tag annoté serait un objet immutable avec :
```typescript
type TagObject = {
  type: "tag",
  object: string,        // hash du commit
  tagger: string,        // "Author <email>"
  date: number,
  message: string
}
```

Phase 2 n'implément pas les TagObjects.

