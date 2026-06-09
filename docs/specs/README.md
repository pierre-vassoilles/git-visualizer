# Phase 1 : Spécifications du Git Visualizer

Bienvenue ! Ce répertoire contient les spécifications complètes de la Phase 1 du projet Git Visualizer.

## 📋 Index des spécifications

### Fondamentaux
- **[00-model.md](00-model.md)** : Modèle de données du dépôt en mémoire
  - Objets Git (Blob, Tree, Commit)
  - Références et HEAD
  - Index et Working Tree
  - Invariants globaux
  - Calcul des hashes SHA-1

### Commandes Git (Phase 1)
1. **[01-init.md](01-init.md)** : `git init`
   - Initialisation d'un dépôt
   - Création de la branche `main`
   - États nominaux et erreurs

2. **[02-add.md](02-add.md)** : `git add <pathspec...>`
   - Ajout de fichiers à l'index (staging)
   - Calcul des hashes de blobs
   - Gestion des chemins

3. **[03-status.md](03-status.md)** : `git status`
   - Affichage de l'état du dépôt
   - Fichiers tracked/untracked/modified
   - Formats long et court (`--short`)

4. **[04-commit.md](04-commit.md)** : `git commit -m "message"`
   - Création de commits
   - Construction du tree depuis l'index
   - Gestion des parents (DAG)

5. **[05-log.md](05-log.md)** : `git log`
   - Affichage de l'historique
   - Formats long et `--oneline`
   - Parcours des commits

### Utilitaires (Phase 1)
6. **[06-virtual-fs.md](06-virtual-fs.md)** : `write` et `read`
   - Commandes pour gérer le working tree virtuel
   - Création/modification/lecture de fichiers
   - Intégration avec les commandes Git

### Synthèse
- **[PHASE1-SUMMARY.md](PHASE1-SUMMARY.md)** : Résumé des décisions structurantes
  - Points clés pour le développement
  - Critères d'acceptation
  - Checklist de livraison
  - Exemple de scénario complet

---

## 🎯 Aperçu de la Phase 1

### Scope

La Phase 1 couvre les **commandes essentielles** pour initialiser un dépôt, ajouter des fichiers, et créer un historique linéaire :

| Commande | Statut | Notes |
|----------|--------|-------|
| `git init` | ✓ | Initialisation simple |
| `git add` | ✓ | Avec support `git add .` |
| `git status` | ✓ | Formats long et court |
| `git commit` | ✓ | Avec `-m` obligatoire |
| `git log` | ✓ | Avec `--oneline` optionnel |
| `write` (utilitaire) | ✓ | Création de fichiers |
| `read` (utilitaire) | ✓ | Lecture de fichiers |

### Hors scope Phase 1

- Branches multiples (Phase 2)
- Checkout/Switch (Phase 2)
- Merge/Rebase (Phase 2)
- Tags (Phase 2)
- HEAD détaché (Phase 2)
- Reset/Restore (Phase 3)
- Diff (Phase 3)

---

## 🏗️ Architecture

### Moteur Git (Pur TypeScript)

```
src/core/
  engine.ts       ← Classe GitEngine, entry point
  types.ts        ← Types partagés (CommandResult, etc.)
```

**À implémenter** :
```
src/core/
  hash.ts         ← Utilitaires SHA-1
  parser.ts       ← Parser de commandes
  repository.ts   ← Classe Repository (état du dépôt)
  objects/        ← Objets Git (Blob, Tree, Commit)
  commands/       ← Implémentations des commandes
    init.ts
    add.ts
    status.ts
    commit.ts
    log.ts
  utils/          ← Utilitaires (write, read, validation chemin)
```

### Aucune dépendance au système de fichiers réel

- Pas de `fs` du Node.js
- Pas d'accès au disque
- Tout en mémoire (dictionnaires TypeScript)

### Testabilité

- Moteur **headless** : Testable avec Vitest sans UI
- API `execute(input: string): CommandResult` stable
- Chaque test peut initialiser un engine propre

---

## 📊 Critères de succès

### Couverture des cas nominaux et limites

Chaque spécification définit des **Critères d'Acceptation (CA)** testables :

```
CA-<cmd>-<num> : <description>

Given   : État initial
When    : Action utilisateur
Then    : Résultat attendu
```

**Exemple** :
```
CA-init-01 : Init sur dépôt vierge
Given  : Engine en état vierge
When   : git init
Then   : exitCode === 0, HEAD → refs/heads/main, index vide
```

### Implémentation avec Vitest

Chaque CA doit être traduit en test Vitest :

```typescript
it('CA-init-01 : Init sur dépôt vierge', () => {
  const engine = new GitEngine();
  const result = engine.execute('git init');
  
  expect(result.exitCode).toBe(0);
  expect(result.output[0]).toContain('Initialized');
  // ... assertions supplémentaires
});
```

---

## 🔑 Décisions structurantes clés

### 1. Format de hash

**SHA-1 Git-exact** (déterministe) :

```
Blob   : SHA1("blob " + len + "\0" + content)
Tree   : Format binaire canonique Git
Commit : Format texte identique à Git
```

### 2. Auteur et date (Phase 1)

```
author = "Unnamed <unnamed@example.com>"
date   = timestamp Unix, incrémenté par commit
```

### 3. HEAD et branches

- **Toujours symbolique** (Phase 1) : HEAD → refs/heads/main
- **Branche unique** : `main` seulement
- **Détaché** : Phase 2+

### 4. Index et Working Tree

- **Index** : Dictionnaire `filepath → {blobHash, content, mode}`
- **Working Tree** : Dictionnaire `filepath → {content, mode}`
- **Séparation claire** : Les deux peuvent diverger (visible dans `git status`)

### 5. Commandes utilitaires

- **`write <path> [content]`** : Crée/modifie un fichier
- **`read <path>`** : Affiche le contenu
- Nécessaires pour tester sans vraies commandes shell

---

## 📖 Guide de lecture

### Pour les développeurs

1. Commencer par **[00-model.md](00-model.md)** pour comprendre l'architecture
2. Puis lire **[PHASE1-SUMMARY.md](PHASE1-SUMMARY.md)** pour les points clés
3. Implémenter dans l'ordre :
   - `git init` (01-init.md)
   - `git add` (02-add.md)
   - `write`/`read` (06-virtual-fs.md)
   - `git status` (03-status.md)
   - `git commit` (04-commit.md)
   - `git log` (05-log.md)
4. Écrire les tests Vitest en parallèle

### Pour les testeurs/QA

- Lire les **Critères d'Acceptation** (CA) dans chaque spécification
- Traduire en cas de test Vitest
- Vérifier la couverture de code (viser >80%)

### Pour les revue de code

- Vérifier que les **invariants** du modèle sont respectés
- S'assurer que les **messages d'erreur matchent Git**
- Valider le **déterminisme des hashes**
- Tester les **cas limites** (index vide, aucun commit, etc.)

---

## 🚀 Prochaines étapes

Une fois la Phase 1 complète et testée :

- **Phase 1.5** : Suppression de fichiers, `git rm`, `git mv`
- **Phase 2** : Branches, `git branch`, `git checkout`, `git merge`
- **Phase 3** : Reset, Restore, Diff
- **Phase 4+** : Rebase, Stash, Tags, et optimisations UI

---

## 📝 Notes

- Les spécifications sont autoritaires : elles définissent le contrat
- Les tests Vitest doivent couvrir **tous les CA**
- Chaque commit doit être testé en isolation (chaque test crée un engine propre)
- Les messages d'erreur doivent être **exactement** ceux spécifiés (pour la compatibilité Git)

---

**Dernière mise à jour** : 2026-06-09  
**Status** : Phase 1 spécifications complètes et prêtes au développement
