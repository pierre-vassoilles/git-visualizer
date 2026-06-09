# Git Visualizer Phase 1 : Guide pour l'orchestrateur de développement

Ce guide s'adresse à l'équipe d'orchestration qui coordonne les développeurs et les tests pour la Phase 1.

---

## 📋 Livérables Phase 1

Tous les fichiers ci-dessous ont été créés et sont dans `/home/pierre/projects/git-visualizer/www/docs/specs/` :

| Fichier | Taille | Contenu |
|---------|--------|---------|
| `README.md` | Index + guide d'utilisation | Navigation, scope, architecture |
| `00-model.md` | Modèle de données | Objets Git, Repository, invariants |
| `01-init.md` | Spec git init | 2 CA, syntaxe, erreurs |
| `02-add.md` | Spec git add | 10 CA, gestion pathspec, blobs |
| `03-status.md` | Spec git status | 9 CA, formats long/court, état |
| `04-commit.md` | Spec git commit | 10 CA, création commits, tree |
| `05-log.md` | Spec git log | 10 CA, formats, historique |
| `06-virtual-fs.md` | Spec write/read | 10 CA, utilitaires fichiers |
| `PHASE1-SUMMARY.md` | Résumé structurant | Points clés, checklist, exemple |
| `ORCHESTRATOR-GUIDE.md` | Ce fichier | Plan d'exécution, décisions |

**Total de critères d'acceptation** : 2 + 10 + 9 + 10 + 10 + 10 = **61 CA** à implémenter et tester.

---

## 🎯 Plan d'exécution

### Sprint 1 : Fondamentaux et initialisation (semaine 1)

**Objectif** : Préparer l'architecture, implémenter `git init` et les utilitaires.

#### Tâches dev
1. **Architecture du moteur**
   - Créer `src/core/types.ts` complet (Repository, Blob, Tree, Commit, Index, WorkingTree)
   - Créer `src/core/repository.ts` (classe Repository avec état interne)
   - Créer `src/core/hash.ts` (fonctions SHA-1 déterministes : hashBlob, hashTree, hashCommit)
   - Créer `src/core/parser.ts` (parser de commandes brutes → tokens)

2. **Utilitaires (write/read)**
   - Implémenter le dispatcher pour `write` et `read` dans `execute()`
   - Tester l'isolation : working tree ≠ index

3. **git init**
   - Implémenter la logique d'initialisation (HEAD, refs/heads/main, index, workingTree vides)
   - Tester les CA-init-01, CA-init-02, CA-init-03
   - Valider les messages d'erreur

#### Tâches test (Vitest)
- Écrire les tests pour 01-init.md (2 CA min)
- Écrire les tests pour 06-virtual-fs.md (10 CA min)
- Vérifier que les chemins invalides sont rejetés
- Couverture visée : >80% des fonctions d'init et write/read

#### Validation
- [ ] `git init` fonctionne, HEAD → main, index/working tree vides
- [ ] `write` crée des fichiers dans le working tree
- [ ] `read` affiche le contenu
- [ ] Aucun accès au FS réel (vérifier avec `grep -r "require\|import.*fs"`)

---

### Sprint 2 : Staging et état (semaine 2)

**Objectif** : Implémenter `git add` et `git status`.

#### Tâches dev
1. **git add**
   - Implémenter le parser de pathspecs (fichiers individuels + ".")
   - Valider les chemins (reject /absolu, .., //)
   - Implémenter le calcul de hash de blobs
   - Implémenter la mise à jour de l'index
   - Tester les CA-add-01 à CA-add-10

2. **git status**
   - Implémenter la comparaison HEAD/index/working tree
   - Implémenter le format long (verbose)
   - Implémenter le format court (`-s`)
   - Tester les CA-status-01 à CA-status-09

#### Tâches test (Vitest)
- Écrire tous les tests pour 02-add.md (10 CA)
- Écrire tous les tests pour 03-status.md (9 CA)
- Vérifier les cas limites : index vide, fichier remodifié, aucun commit
- Couverture visée : >85%

#### Validation
- [ ] `git add file.txt` ajoute le fichier à l'index avec hash correct
- [ ] `git add .` ajoute tous les fichiers du working tree
- [ ] `git status` affiche les fichiers staged/untracked/modified
- [ ] Les hashes de blobs sont déterministes

---

### Sprint 3 : Commits et historique (semaine 3)

**Objectif** : Implémenter `git commit` et `git log`.

#### Tâches dev
1. **git commit**
   - Implémenter la construction du tree depuis l'index (récursive pour les répertoires)
   - Implémenter la création de commit (tree + parents + author + date)
   - Implémenter le calcul de hash de commit (déterministe)
   - Implémenter la mise à jour de refs/heads/main
   - Implémenter le nettoyage d'index après commit
   - Tester les CA-commit-01 à CA-commit-10

2. **git log**
   - Implémenter le parcours des commits (remonter les parents)
   - Implémenter le format long (verbose)
   - Implémenter le format court (`--oneline`)
   - Tester les CA-log-01 à CA-log-10

#### Tâches test (Vitest)
- Écrire tous les tests pour 04-commit.md (10 CA)
- Écrire tous les tests pour 05-log.md (10 CA)
- Vérifier la déterminisme : même commit = même hash
- Vérifier les parents (pas de parent pour le premier, 1 parent pour les suivants)
- Couverture visée : >85%

#### Validation
- [ ] `git commit -m "msg"` crée un commit avec tree + parents + author + date
- [ ] L'index est vidé après commit
- [ ] refs/heads/main pointe vers le dernier commit
- [ ] `git log` affiche les commits dans le bon ordre (récent → ancien)
- [ ] Hashes de commits sont déterministes (même contenu = même hash)

---

### Sprint 4 : Intégration et raffinement (semaine 4)

**Objectif** : Intégration complète, tests exhaustifs, documentation d'implémentation.

#### Tâches dev
1. **Intégration cross-commandes**
   - Vérifier que les commandes interagissent correctement
   - Tester les scénarios multi-étapes (init → write → add → status → commit → log)
   - Valider les dépendances (ex. add dépend de init)

2. **Raffinement des messages d'erreur**
   - S'assurer que tous les messages matchent Git
   - Tester contre `git` réel pour les messages standards

3. **Documentation d'implémentation**
   - Écrire des commentaires clairs dans le code
   - Documenter les invariants du Repository
   - Créer un fichier `IMPLEMENTATION.md` avec la structure interne

#### Tâches test (Vitest)
- Scénario complet test (init → write 2 files → add → commit → modify → status → log)
- Cas d'erreur exhaustifs : tous les codes de sortie testés
- Couverture de code : viser 90%+
- Tester la déterminisme multi-session (deux engines indépendants doivent générer les mêmes hashes)

#### Validation
- [ ] Tous les 61 CA testés et passants
- [ ] Couverture de code ≥90%
- [ ] Scénario complet fonctionne de bout en bout
- [ ] Zéro accès au FS réel
- [ ] Messages d'erreur matchent Git
- [ ] Pas de dépendances externes (excepto crypto pour SHA-1)

---

## 🔑 Décisions architecturales critiques

### 1. Hash SHA-1 (Décision critique)

**Ce qui doit être fait** :
- Utiliser une librairie légère : `crypto-js` (ou `tweetnacl.js` si déjà présent)
- Format **strictement Git** : `blob 11\0hello world` pour un blob
- **Déterminisme** : Même contenu = même hash, synchrone, pas de non-déterminisme

**À tester** :
```typescript
// Deux engines indépendants, même contenu → même hash
const e1 = new GitEngine();
const e2 = new GitEngine();

e1.execute('write a.txt "hello"');
e1.execute('git init');
e1.execute('git add a.txt');

e2.execute('write a.txt "hello"');
e2.execute('git init');
e2.execute('git add a.txt');

// Les hashes doivent être identiques
```

### 2. Index : Dictionnaire persistant

**Ce qui doit être fait** :
- Représenter l'index comme un dictionnaire TypeScript
- Clé = chemin du fichier (string)
- Valeur = {blobHash, content, mode}
- Chaque `git add` le modifie ; chaque `git commit` le vide

**À tester** :
```typescript
// Après git add file.txt "hello"
expect(index["file.txt"]).toBeDefined();
expect(index["file.txt"].content).toBe("hello");
expect(index["file.txt"].blobHash).toBeDefined();
```

### 3. Working Tree : Aussi dictionnaire

**Ce qui doit être fait** :
- Même structure que l'index
- Modifié uniquement par `write`
- Consulté par `git add` et `git status`

### 4. HEAD : Toujours symbolique (Phase 1)

**Ce qui doit être fait** :
- `HEAD = { symbolic: true, target: "refs/heads/main" }`
- Jamais de HEAD détaché en Phase 1
- Pas de `git checkout <commit>`

### 5. Repository : Single instance per Engine

**Ce qui doit être fait** :
- Un seul Repository par GitEngine instance
- Repository encapsule objects, refs, HEAD, index, workingTree
- Accès via méthodes (pas de direct mutation depuis dehors)

---

## 📊 Checklist de livraison

### Code
- [ ] `src/core/types.ts` avec tous les types
- [ ] `src/core/repository.ts` avec la classe Repository
- [ ] `src/core/hash.ts` avec SHA-1 déterministe
- [ ] `src/core/parser.ts` avec parser de commandes
- [ ] `src/core/engine.ts` updated avec dispatcher complet
- [ ] Commandes : `git init`, `git add`, `git status`, `git commit`, `git log`
- [ ] Utilitaires : `write`, `read`
- [ ] Zéro accès au vrai FS

### Tests (Vitest)
- [ ] 61 CA couverts par des tests `it()`
- [ ] Couverture de code ≥90%
- [ ] Tous les tests passants
- [ ] Pas de flakiness (résultats déterministes)

### Documentation
- [ ] Tous les fichiers specs dans `docs/specs/` complétés
- [ ] `IMPLEMENTATION.md` avec structure interne du code
- [ ] Commentaires clairs dans le code
- [ ] README.md à jour

### Intégration
- [ ] Aucun conflit avec Phase 0 (legacy code)
- [ ] Types compatibles avec l'UI Vue (si nécessaire)
- [ ] `execute()` signature stable

---

## 🚦 Critères de succès globaux

### Pour le développement
1. **Tous les CA implémentés** : 61/61 CA dans le code
2. **Tests Vitest** : Tous les tests passants, couverture ≥90%
3. **Déterminisme** : Hashes identiques pour contenu identique
4. **Zéro FS** : `grep "require.*fs"` or `import.*fs` returns nothing

### Pour la qualité
1. **Messages d'erreur** : Matchent Git standard
2. **Invariants** : Repository toujours en état valide
3. **Pas de régression** : Phase 0 tests toujours passants
4. **Performance** : Engine < 100ms par commande (acceptable pour in-memory)

### Pour la maintenabilité
1. **Code lisible** : Fonctions petites (<50 lignes), noms clairs
2. **Pas de duplication** : Utilitaires réutilisables
3. **Documentation** : Chaque fonction a un JSDoc
4. **Tests maintenables** : Chaque test indépendant, setup/teardown clairs

---

## ⏰ Timeline proposée

```
Week 1 (Sprint 1) : git init + write/read + architecture
  Day 1-2 : Architecture (types, repository, hash)
  Day 3-4 : Implémentation git init + write/read
  Day 5   : Tests + validation

Week 2 (Sprint 2) : git add + git status
  Day 1-3 : Implémentation git add (parser, hash, index)
  Day 4-5 : Implémentation git status (formats)
  Day 6   : Tests + validation

Week 3 (Sprint 3) : git commit + git log
  Day 1-3 : Implémentation git commit (tree, parents, refs)
  Day 4-5 : Implémentation git log (parcours, formats)
  Day 6   : Tests + validation

Week 4 (Sprint 4) : Intégration + raffinement
  Day 1-2 : Intégration cross-commandes
  Day 3-4 : Tests exhaustifs + déterminisme
  Day 5   : Documentation + cleanup
  Day 6   : Code review + final sign-off
```

---

## 👥 Assignation et dépendances

### Composants imbriqués (suggest order)

```
Layer 1 (Foundations)
  → types.ts, hash.ts, parser.ts

Layer 2a (Core)
  → repository.ts, engine.ts dispatcher

Layer 2b (Utilitaires)
  → write, read (dépendent de Layer 1)

Layer 3 (Commands linéaires)
  → git init (dépend de Layer 2a)
  → git add (dépend de init + types)
  → git status (dépend de add)
  → git commit (dépend de status + tree building)
  → git log (dépend de commit)
```

**Suggestion** :
- **Dev 1** : Foundations (types, hash, parser, repository)
- **Dev 2** : Commands (init, add, status, commit, log)
- **Dev 3** : Utilitaires + tests intégration
- **QA/Test** : Vitest suite en parallèle

---

## 🔍 Points de vérification

### Avant livraison

1. **Déterminisme** :
   ```bash
   # Créer deux dépôts identiques, vérifier hashes
   # → Doivent être strictement identiques
   ```

2. **Pas d'accès FS** :
   ```bash
   grep -r "require.*['\"]fs['\"]" src/
   grep -r "import.*from.*['\"]fs['\"]" src/
   # → Aucun résultat
   ```

3. **Couverture** :
   ```bash
   vitest run --coverage
   # → Lines: ≥90%, Functions: ≥90%, Branches: ≥85%
   ```

4. **Tests passants** :
   ```bash
   vitest run
   # → 61+ tests, 0 failures
   ```

5. **Zéro console.error en mode clean** (except désiré) :
   ```bash
   # Vérifier que les commandes en erreur ne laissent pas d'état inconsistent
   ```

---

## 📞 Escalade et blocages

### Blocages potentiels

| Problème | Mitigation |
|----------|-----------|
| Déterminisme SHA-1 | Tester tôt (Sprint 1), comparer avec `git hash-object` |
| Tree imbriquée complexe | Développer récursivement, tester avec pathspecs profonds (ex. `a/b/c/d/e.txt`) |
| Messages d'erreur Git | Tester contre `git` réel, utiliser une ressource externe comme référence |
| Performance en-mémoire | En Phase 1, accepter la consommation mémoire (pas de persistance) |

### Escalade
- **Technique** : Questions sur la spec → Consulter `PHASE1-SUMMARY.md`
- **Architecture** : Changements majeurs → Réviser avec lead tech
- **Timeline** : Retards → Prioriser (order: init → add → commit → log → status → utilitaires)

---

## 📝 Notes supplémentaires

1. **Pas de branches en Phase 1** : Simplifier en maintenant `refs/heads/main` uniquement
2. **Pas de merge** : DAG linéaire, pas de multi-parents
3. **Auteur fixe** : "Unnamed <unnamed@example.com>" suffisant pour Phase 1
4. **Date auto-increment** : 1000000000 + numCommits simple et reproductible
5. **Index vide après commit** : Critique pour éviter les double-commits

---

## ✅ Définition de "Fait" (Definition of Done)

Une tâche est "Faite" si :

1. **Code implémenté** : 100% des CA couverts
2. **Tests écrits** : Chaque CA a un test Vitest
3. **Tests passants** : 0 erreurs, couverture ≥90% pour cette tâche
4. **Code review** : Au moins une autre personne a validé
5. **Pas de regression** : Tests Phase 0 toujours passants
6. **Documentation** : Commentaires et README à jour
7. **No blockers** : Aucun point bloquant pour les tâches suivantes

---

**Fin du guide orchestrateur. Bon développement !** 🚀
