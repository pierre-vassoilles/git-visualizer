# Phase 9 – Sidebar « Distant » et Scénarios distants

## Contexte

Cette spec couvre l'**extension de la `RefsSidebar`** (finalisée en Phase 6, spec 33) avec une section « Distant » affichant les remotes, l'upstream par branche, et les indicateurs de synchronisation (`↑ahead`, `↓behind`). Elle formalise aussi les **scénarios pédagogiques de collaboration distante** (clone → commit → push, fetch divergent → pull, etc.) : données pures à ajouter au catalogue de Phase 6.

## 1. Extension RefsSidebar : Section « Distant »

### 1.1 Localisation et visibilité

**Après la section "Commandes récentes" (Phase 6)**, ajouter une nouvelle section « Distant » :

```
┌────────────────────────────┐
│ Commandes récentes         │
│   > git commit -m ...      │
│   > git push               │
│   [Reset History]          │
│                            │
│ Distant                    │
│   origin (https://...)     │
│                            │
│   Upstream (main)          │
│   Branches:                │
│     [*] main               │
│         ↑ 2 ↓ 0 [origin/m] │
│     [ ] feature            │
│         ↑ 1 ↓ 3 (unpushed) │
│                            │
│   [Fetch] [Push] [Pull]    │
└────────────────────────────┘
```

**Visibilité** :
- Section présente si `snapshot.remotes?.origin` existe
- Masquée si aucun remote

### 1.2 Contenu : Remotes et URL

**Source** : `snapshot.remotes: Record<string, RemoteRepository>`

**Rendu** :

```
Distant
  origin
  https://example.com/repo.git
  
  [autres remotes...]
```

Afficher chaque remote avec son URL (cosmétique, fournie par le moteur Phase 7).

### 1.3 Upstream par branche

**Source** : `snapshot.tracking: Record<branch, { ahead, behind, upstream }>`

**Rendu pour chaque branche** :

```
[*] main
    ↑ 2 (ahead)    ↓ 0 (behind)   [origin/main]  ← upstream
    
[ ] feature
    ↑ 1 ↓ 3        (no upstream)  ← branche locale, pas d'upstream
```

**Format** :
- Ligne branche : `[*] nomBranche`
- Ligne stat (indentée) : `↑N ↓M [origin/branche]` si upstream posé
- Ou : `↑N ↓M (no upstream)` si branche locale non trackée

**Indicateur visuel** :
- `↑N` : N commits à pousser (local only)
- `↓M` : M commits à récupérer (remote only)
- Si N > 0 et M > 0 : divergent (couleur orange/warning)
- Si N = 0 et M = 0 : à jour (vert)
- Si M > 0 : orange (à récupérer)

### 1.4 Boutons d'action

**Trois boutons** dans la section Distant :

```
[Fetch]  [Push]  [Pull]
```

**Comportement** (Phase 9 : exécution simple, pas de validation UI avancée) :

- **[Fetch]** : Exécute `git fetch origin` (ou `git fetch` si remote unique)
- **[Push]** : Exécute `git push origin <branch>` (branche courante)
  - Si rejeté : message d'erreur affiché (via `CommandResult`)
  - Optionnel : bouton `-u` (push -u) pour poser l'upstream
- **[Pull]** : Exécute `git pull origin <branch>` (merge ou rebase selon config Phase 8)

**Nota** : Phase 9 n'implémente que l'UI ; Phase 7-8 fournit les commandes.

## 2. Scénarios distants

Ces scénarios s'ajoutent au catalogue de données pures `src/constants/scenarios.ts`
(cf. spec 32). **Convention de commandes — identique aux scénarios Phase 6 :** les
commandes git portent le préfixe `git` (`git init`, `git commit -m "..."`,
`git clone ...`, `git push`...) ; seuls les utilitaires `write <path> "<contenu>"`
et `read <path>` sont sans préfixe. Les scénarios supposent les commandes distantes
(`clone`/`fetch`/`push`/`pull`, specs 35-38) implémentées : **aucun « hack » de
simulation n'est requis.**

### 2.1 Produire une divergence en session mono-client

Un seul client est actif. Pour qu'un scénario montre `origin` *en avance* (push
rejeté, pull qui fusionne), le distant doit déjà contenir des commits absents du
clone local. Cela repose sur les **dépôts source prédéfinis** de `git clone`
(spec 35) : certaines sources sont volontairement « pré-divergées » (la branche du
distant possède un commit que le clone ne reçoit pas encore, révélé par
`git fetch`). Les scénarios sans divergence (7 et 10) n'en ont pas besoin.

### Scénario 7 — Clone, commit, push (facile)

```typescript
{
  id: 'clone-push',
  title: 'Clone, Commit & Push',
  description: 'Cloner un depot distant, ajouter un commit, le pousser sur origin.',
  category: 'Distant',
  difficulty: 1,
  commands: [
    'git clone demo-repo',              // amorce origin + branche locale + upstream
    'write feature.txt "nouvelle fonctionnalite"',
    'git add feature.txt',
    'git commit -m "Ajout de la fonctionnalite"',   // main : ahead 1
    'git push',                         // origin/main rattrape main : ahead 0
  ],
}
```

**État final attendu** : `main` et `origin/main` pointent le même commit ;
`tracking.main = { ahead: 0, behind: 0 }`.

### Scénario 8 — Fetch divergent puis pull (merge) (moyen)

Suppose une source prédéfinie pré-divergée (`origin/main` en avance d'un commit).

```typescript
{
  id: 'fetch-pull-merge',
  title: 'Fetch divergent & Pull (merge)',
  description: 'Le distant a avance : recuperer puis integrer par une fusion.',
  category: 'Distant',
  difficulty: 2,
  commands: [
    'git clone diverged-repo',          // origin contient C2-remote non recu sur main
    'write local.txt "travail local"',
    'git add local.txt',
    'git commit -m "C2-local : travail local"',   // main diverge d'origin
    'git fetch',                        // origin/main avance ; main : ahead 1, behind 1
    'git pull --no-rebase',             // fusionne origin/main dans main -> commit de merge
  ],
}
```

**État final attendu** : un commit de merge à 2 parents (C2-local, C2-remote) ;
`tracking.main` à jour après un éventuel `git push`.

### Scénario 9 — Push rejeté, pull --rebase, push (moyen)

```typescript
{
  id: 'push-rejected-rebase',
  title: 'Push rejete -> Pull --rebase -> Push',
  description: 'Un push non-fast-forward est rejete ; rebase sur origin puis push.',
  category: 'Distant',
  difficulty: 2,
  commands: [
    'git clone diverged-repo',
    'write local.txt "travail local"',
    'git add local.txt',
    'git commit -m "C2-local"',
    'git push',                         // REJETE : non-fast-forward (origin en avance)
    'git pull --rebase',                // rejoue C2-local au-dessus d'origin/main (nouveau hash)
    'git push',                         // accepte
  ],
}
```

**État final attendu** : historique linéaire (rebase), `main` == `origin/main`,
`tracking.main = { ahead: 0, behind: 0 }`. Le `git push` rejeté renvoie
`exitCode != 0` ; le scénario poursuit le rejeu (cf. règle `executeScenario`,
spec 32 / Phase 6).

### Scénario 10 — Collaboration, deux branches (moyen)

```typescript
{
  id: 'collab-two-branches',
  title: 'Collaboration : deux branches',
  description: 'main et develop divergent de la base commune, push selectif par branche.',
  category: 'Distant',
  difficulty: 2,
  commands: [
    'git init',
    'write shared.txt "base"',
    'git add shared.txt',
    'git commit -m "C1 : base partagee"',
    'git remote add origin local://origin',
    'git push -u origin main',
    'git checkout -b develop',
    'write dev.txt "fonctionnalite develop"',
    'git add dev.txt',
    'git commit -m "C2 : develop"',
    'git push -u origin develop',
    'git checkout main',
    'write main.txt "fonctionnalite main"',
    'git add main.txt',
    'git commit -m "C3 : main"',
    'git push',
  ],
}
```

**État final attendu** : `origin` possède `main` (C1<-C3) et `develop` (C1<-C2) ;
les deux branches à jour (`ahead 0, behind 0`).

> Les sources `demo-repo` / `diverged-repo` sont des dépôts prédéfinis de
> `git clone` (spec 35) ; `local://origin` est une url symbolique (spec 34).

## 3. Intégration dans la RefsSidebar

### 3.1 Structure du composant (après Phase 6)

**Avant Phase 9** (Phase 6, spec 33) :

```vue
<template>
  <aside class="refs-sidebar">
    <section>Branches</section>
    <section>HEAD</section>
    <section>Tags</section>
    <section>Opération en cours</section>
    <section>Stash</section>
    <section>Commandes récentes</section>
  </aside>
</template>
```

**Après Phase 9** :

```vue
<template>
  <aside class="refs-sidebar">
    <section>Branches</section>
    <section>HEAD</section>
    <section>Tags</section>
    <section>Opération en cours</section>
    <section>Stash</section>
    <section>Commandes récentes</section>
    <section>Distant</section>  ← NEW
  </aside>
</template>
```

### 3.2 Code source : Distante Sidebar

```vue
<!-- src/components/RefsSidebar.vue (section Distant ajoutée) -->

<!-- Après <section class="section-history"> -->

<section class="section-remote" v-if="hasRemotes">
  <h2>Distant</h2>
  
  <!-- Remotes list -->
  <div class="remotes-list">
    <div v-for="(remote, name) in snapshot.remotes" :key="name" class="remote-item">
      <p class="remote-name">{{ name }}</p>
      <p v-if="remoteUrls[name]" class="remote-url">{{ remoteUrls[name] }}</p>
    </div>
  </div>
  
  <!-- Branches + tracking status -->
  <div class="tracking-section">
    <h3>Branches</h3>
    <div v-for="branch in snapshot.branches" :key="branch" class="branch-tracking">
      <span class="branch-indicator">
        {{ isHeadOnBranch(branch) ? '[*]' : '[ ]' }}
      </span>
      <span class="branch-name">{{ branch }}</span>
      
      <!-- Tracking info (si upstream posé) -->
      <div v-if="snapshot.tracking?.[branch]" class="tracking-info">
        <span class="ahead" v-if="snapshot.tracking[branch].ahead > 0">
          ↑ {{ snapshot.tracking[branch].ahead }}
        </span>
        <span class="behind" v-if="snapshot.tracking[branch].behind > 0">
          ↓ {{ snapshot.tracking[branch].behind }}
        </span>
        <span v-if="snapshot.tracking[branch].upstream" class="upstream">
          [{{ snapshot.tracking[branch].upstream?.remote }}/{{ snapshot.tracking[branch].upstream?.branch }}]
        </span>
        <span v-else class="no-upstream">(no upstream)</span>
      </div>
    </div>
  </div>
  
  <!-- Action buttons -->
  <div class="remote-actions">
    <button @click="fetchRemote" class="btn-fetch">Fetch</button>
    <button @click="pushRemote" class="btn-push">Push</button>
    <button @click="pullRemote" class="btn-pull">Pull</button>
  </div>
</section>

<script setup lang="ts">
// (additions au script de Phase 6)

const hasRemotes = computed(() => {
  return Object.keys(snapshot.value.remotes ?? {}).length > 0;
});

const remoteUrls = computed(() => {
  // Phase 7-8 fournira les URLs depuis snapshot
  const urls: Record<string, string> = {};
  // TODO: parser snapshot.remotes[name].url si disponible
  return urls;
});

function fetchRemote() {
  store.execute("fetch origin");
  // TODO: handle error, afficher feedback
}

function pushRemote() {
  // Déterminer la branche courante
  const branch = getCurrentBranch();
  store.execute(`push origin ${branch}`);
}

function pullRemote() {
  const branch = getCurrentBranch();
  store.execute(`pull origin ${branch}`);
}

function getCurrentBranch(): string {
  if (snapshot.value.head.type === 'branch') {
    return snapshot.value.head.name;
  }
  // Si HEAD détaché, on ne peut pas pull/push sans branche
  return 'main'; // default (ou afficher un message d'erreur)
}
</script>

<style scoped>
.section-remote {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #ccc;
}

.remotes-list {
  margin-bottom: 12px;
  font-size: 12px;
}

.remote-item {
  padding: 4px 0;
  margin-bottom: 8px;
}

.remote-name {
  font-weight: bold;
  margin: 0;
  color: #333;
}

.remote-url {
  margin: 0;
  color: #666;
  font-size: 11px;
}

.tracking-section {
  margin: 12px 0;
}

.tracking-section h3 {
  font-size: 11px;
  font-weight: bold;
  margin: 8px 0 4px;
  color: #555;
}

.branch-tracking {
  padding: 4px 0;
  font-size: 12px;
  border-bottom: 1px solid #eee;
}

.branch-indicator {
  margin-right: 4px;
}

.branch-name {
  font-weight: bold;
}

.tracking-info {
  font-size: 10px;
  margin-left: 8px;
  color: #666;
}

.ahead {
  color: #10b981; /* vert : à pousser *)
}

.behind {
  color: #f59e0b; /* orange : à récupérer *)
}

.upstream {
  color: #0066cc;
  margin-left: 4px;
}

.no-upstream {
  color: #999;
  font-style: italic;
}

.remote-actions {
  display: flex;
  gap: 6px;
  margin-top: 12px;
}

.btn-fetch, .btn-push, .btn-pull {
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid #999;
  background: white;
  border-radius: 2px;
}

.btn-fetch:hover { background: #e0f2fe; }
.btn-push:hover { background: #f0fdf4; }
.btn-pull:hover { background: #fef3c7; }
</style>
```

## 4. Critères d'acceptation

### CA-remote-sidebar-01 : Section Distant présente si remote existe

**Given**
- `snapshot.remotes?.origin` présent

**When**
- RefsSidebar affiche

**Then**
- Section "Distant" visible
- Affiche "origin" + URL (si disponible en Phase 7)

### CA-remote-sidebar-02 : Section Distant absente si pas de remote

**Given**
- `snapshot.remotes?.origin` absent/vide

**When**
- RefsSidebar affiche

**Then**
- Section "Distant" masquée
- Pas de message d'erreur

### CA-remote-sidebar-03 : Affichage branches avec tracking

**Given**
- `snapshot.branches: ["main", "feature"]`
- `snapshot.tracking.main: { ahead: 2, behind: 0, upstream: { remote: 'origin', branch: 'main' } }`
- `snapshot.tracking.feature: { ahead: 0, behind: 3, upstream: null }`

**When**
- RefsSidebar affiche la section Distant

**Then**
- "main" affiche : `[*] main ↑2 ↓0 [origin/main]`
- "feature" affiche : `[ ] feature ↑0 ↓3 (no upstream)`

### CA-remote-sidebar-04 : Couleurs indicateurs ahead/behind

**Given**
- Branche avec `ahead: 1, behind: 3`

**When**
- RefsSidebar affiche

**Then**
- `↑1` couleur verte (ou neutre)
- `↓3` couleur orange/warning

### CA-remote-sidebar-05 : Boutons Fetch/Push/Pull

**Given**
- Section Distant visible

**When**
- Inspectez les boutons

**Then**
- Trois boutons présents : "Fetch", "Push", "Pull"
- Cliquables (pas grisés)

### CA-remote-sidebar-06 : Click Fetch exécute git fetch

**Given**
- Branch "main" courante

**When**
- Clique sur [Fetch]

**Then**
- Exécute `git fetch origin`
- `snapshot.remoteTrackingRefs.origin` mis à jour
- Sidebar rafraîchit

### CA-remote-sidebar-07 : Click Push exécute git push

**Given**
- Branch "main" courante
- Commit local non-poussé

**When**
- Clique sur [Push]

**Then**
- Exécute `git push origin main`
- `snapshot.remoteTrackingRefs.origin.main` mis à jour
- `snapshot.tracking.main.ahead` revient à 0

### CA-remote-sidebar-08 : Click Pull exécute git pull

**Given**
- Branch "main" courante
- Commits distants non-récupérés

**When**
- Clique sur [Pull]

**Then**
- Exécute `git pull origin main`
- Commits distants fusionnés localement
- `snapshot.tracking.main.behind` revient à 0

### CA-remote-sidebar-09 : Scénario Clone-Push

**Given**
- Exécute scénario "clone-push"

**When**
- Commandes exécutées

**Then**
- `snapshot.branches.main` pointe le dernier commit
- `snapshot.remoteTrackingRefs.origin.main` identique
- `snapshot.tracking.main.ahead === 0`
- Graphe affiche local + distant (split-screen si actif)

### CA-remote-sidebar-10 : Scénario Deux Branches

**Given**
- Exécute scénario "collab-two-branches"

**When**
- Toutes les commandes exécutées

**Then**
- `snapshot.branches: ["main", "develop"]`
- `snapshot.remotes.origin.branches: ["main", "develop"]`
- Deux branches locales et deux refs de suivi
- Graphe affiche 2 branches avec commits distincts
- `snapshot.tracking.main.ahead === 0` et `snapshot.tracking.develop.ahead === 0`

### CA-remote-sidebar-11 : Scénarios listables et accessibles

**Given**
- Appel `getAllScenarios().filter(s => s.category === 'Collaboration')`

**When**
- Inspectez le résultat

**Then**
- Au moins 2 scénarios distants
- Chacun a `id`, `title`, `description`, `commands`

### CA-remote-sidebar-12 : Scénario défaillance (futur Phase 8)

**Given**
- Placeholder pour "Fetch & Pull" (Phase 8)

**When**
- Tentative de charge

**Then**
- Affiche message : "[Phase 8] Fetch & Pull (à venir)" ou similaire
- Pas d'erreur

### CA-remote-sidebar-13 : HEAD détaché dans actions push/pull

**Given**
- HEAD détaché

**When**
- Clique sur [Push] ou [Pull]

**Then**
- Affiche un message d'erreur ou comportement gracieux (ex: « Checkout une branche avant de push »)
- Pas de commande exécutée

### CA-remote-sidebar-14 : Réactivité après commande

**Given**
- User exécute `git fetch origin` via terminal (ou bouton)

**When**
- Snapshot mis à jour

**Then**
- Section Distant rafraîchit
- Indicateurs ahead/behind réactifs
- Branches de suivi réactives

### CA-remote-sidebar-15 : Affichage formaté upstream

**Given**
- Branche "feature" avec upstream "origin/develop"

**When**
- RefsSidebar affiche

**Then**
- Label `[origin/develop]` visible (pas `origin.develop`, ni `refs/remotes/origin/develop`)

## 5. Implémentation : Points clés

1. **Section Distant dans RefsSidebar** :
   - Ajouter après "Commandes récentes"
   - Computed `hasRemotes` pour visibilité
   - Affichage branches + tracking info

2. **Boutons d'action** :
   - Fetch, Push, Pull appellent `store.execute()`
   - Déterminer la branche courante (impossible si HEAD détaché → feedback utilisateur)

3. **Scénarios distants** :
   - Ajouter à `src/constants/scenarios.ts`
   - Catégorie "Collaboration"
   - Commandes sans préfixe `git`
   - Tests : snapshot final vérifié (branches, refs de suivi, ahead/behind)

4. **Persistance** :
   - Aucune nouvelle persistence requise (scénarios et sidebar sont réactives du snapshot)

## 6. Dépendances inter-phases

- **Dépend de Phase 6** : RefsSidebar existante, interface Scenario
- **Dépend de Phase 7-8** : Moteur distant, commandes clone/fetch/push/pull, snapshot enrichi
- **Utilisée par Phase 9** : Split-screen graph (spec 40) affiche les refs de suivi visualmente

## 7. Notes pour Phase 8+

- **Phase 8** : Implémentation complet de fetch/push/pull, scénarios divergents testés
- **Phase 10** : UI Polish (icônes, animations, dark mode)
- **Phase 10+** : Création de scénarios par l'utilisateur, partage, export/import

---

**Prochaines étapes** :
- Implémentation `src/components/RefsSidebar.vue` section Distant (Phase 9)
- Ajout scénarios 7 & 10 à `src/constants/scenarios.ts` (Phase 9)
- Tests : Vitest scénarios distants, @vue/test-utils RefsSidebar distante (Phase 10)
- Implémentation Phase 7-8 : moteur distant, commandes, snapshot enrichi
