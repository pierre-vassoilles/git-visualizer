<script setup lang="ts">
import { computed } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { getAllScenarios } from '@/constants/scenarios';
import { getAllTutorials } from '@/constants/tutorials';

const repo = useRepoStore();

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

const branchNames = computed(() => Object.keys(repo.snapshot.branches).sort());

function isCurrentBranch(name: string): boolean {
  const head = repo.snapshot.head;
  return head.type === 'branch' && head.name === name;
}

function branchShortHash(name: string): string {
  const hash = repo.snapshot.branches[name];
  return hash ? hash.slice(0, 7) : '';
}

/** Clic sur une branche → checkout (no-op si déjà courante). */
function checkoutBranch(name: string): void {
  if (isCurrentBranch(name)) return;
  repo.execute(`git checkout ${name}`);
}

/** Clic sur un tag → checkout du commit pointé (HEAD détaché). */
function checkoutTag(name: string): void {
  const hash = repo.snapshot.tags[name];
  if (!hash) return;
  repo.execute(`git checkout ${hash.slice(0, 7)}`);
}

// ---------------------------------------------------------------------------
// HEAD
// ---------------------------------------------------------------------------

const headInfo = computed(() => {
  const head = repo.snapshot.head;
  if (head.type === 'branch') {
    return { detached: false, label: head.name };
  }
  return { detached: true, label: head.hash.slice(0, 7) };
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

const tagEntries = computed(() =>
  Object.entries(repo.snapshot.tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, hash]) => ({ name, shortHash: hash.slice(0, 7) })),
);

// ---------------------------------------------------------------------------
// Opération en cours
// ---------------------------------------------------------------------------

const operationState = computed(() => repo.snapshot.operationState ?? null);

/** Libellé lisible selon le type d'opération. */
function operationLabel(type: string): string {
  const labels: Record<string, string> = {
    merging: 'Merge en cours',
    rebasing: 'Rebase en cours',
    cherryPicking: 'Cherry-pick en cours',
    reverting: 'Revert en cours',
  };
  return labels[type] ?? type;
}

/** Commande --continue selon le type. */
function continueCmd(type: string): string | null {
  const cmds: Record<string, string> = {
    merging: 'git merge --continue',
    rebasing: 'git rebase --continue',
    cherryPicking: 'git cherry-pick --continue',
  };
  return cmds[type] ?? null;
}

/** Commande --abort selon le type. */
function abortCmd(type: string): string | null {
  const cmds: Record<string, string> = {
    merging: 'git merge --abort',
    rebasing: 'git rebase --abort',
    cherryPicking: 'git cherry-pick --abort',
  };
  return cmds[type] ?? null;
}

function onContinue(): void {
  const op = operationState.value;
  if (!op) return;
  const cmd = continueCmd(op.type);
  if (cmd) repo.execute(cmd);
}

function onAbort(): void {
  const op = operationState.value;
  if (!op) return;
  const cmd = abortCmd(op.type);
  if (cmd) repo.execute(cmd);
}

// ---------------------------------------------------------------------------
// Stash
// ---------------------------------------------------------------------------

const stashCount = computed(() => repo.snapshot.stashCount ?? 0);

// ---------------------------------------------------------------------------
// Commandes récentes (10 dernières, plus récente en haut)
// ---------------------------------------------------------------------------

const recentCommands = computed(() => [...repo.history].slice(-10).reverse());

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

function onReset(): void {
  if (confirm("Réinitialiser le dépôt et effacer l'historique localStorage ?")) {
    repo.resetStorage();
  }
}

// ---------------------------------------------------------------------------
// Distant
// ---------------------------------------------------------------------------

const hasRemotes = computed(() => Object.keys(repo.snapshot.remotes ?? {}).length > 0);

const remoteNames = computed(() => Object.keys(repo.snapshot.remotes ?? {}));

/** URL d'un remote (fournie par snapshot.remotes[name].url si disponible). */
function remoteUrl(name: string): string | null {
  // Le snapshot expose heads, allCommits, head — pas d'URL directe Phase 7.
  // On essaie de lire depuis branchUpstream s'il y a un upstream configuré.
  const upstream = repo.snapshot.branchUpstream;
  if (!upstream) return null;
  for (const info of Object.values(upstream)) {
    if (info.remote === name) {
      // L'URL n'est pas dans le snapshot (moteur stocke dans repo.remotes[name].url).
      // On retourne null ; si le moteur l'expose un jour, on la lit ici.
      return null;
    }
  }
  return null;
}

/** Infos de tracking pour une branche (ahead, behind, upstream). */
function trackingInfo(branch: string) {
  return repo.snapshot.tracking?.[branch] ?? null;
}

/** Texte formaté de l'upstream pour une branche. */
function upstreamLabel(branch: string): string | null {
  const info = trackingInfo(branch);
  if (!info?.upstream) return null;
  return `${info.upstream.remote}/${info.upstream.branch}`;
}

/** Couleur CSS de l'indicateur de synchro. */
function syncColor(branch: string): 'synced' | 'ahead' | 'behind' | 'diverged' {
  const info = trackingInfo(branch);
  if (!info) return 'synced';
  const a = info.ahead ?? 0;
  const b = info.behind ?? 0;
  if (a > 0 && b > 0) return 'diverged';
  if (b > 0) return 'behind';
  if (a > 0) return 'ahead';
  return 'synced';
}

function onFetch(): void {
  repo.execute('git fetch');
}

function onPush(): void {
  const head = repo.snapshot.head;
  if (head.type === 'detached') {
    alert('HEAD est detache. Checkout une branche avant de pousser.');
    return;
  }
  repo.execute(`git push`);
}

function onPull(): void {
  const head = repo.snapshot.head;
  if (head.type === 'detached') {
    alert('HEAD est detache. Checkout une branche avant de tirer.');
    return;
  }
  repo.execute(`git pull`);
}

// ---------------------------------------------------------------------------
// Scénarios
// ---------------------------------------------------------------------------

const scenarios = computed(() => getAllScenarios());

function onLoadScenario(id: string): void {
  if (confirm('Charger ce scénario ? Le dépôt courant sera réinitialisé.')) {
    repo.executeScenario(id);
  }
}

function difficultyLabel(d: 1 | 2 | 3): string {
  return d === 1 ? 'Facile' : d === 2 ? 'Moyen' : 'Difficile';
}

// ---------------------------------------------------------------------------
// Tutoriels guidés (spec 51)
// ---------------------------------------------------------------------------

const tutorials = computed(() => getAllTutorials());

function onStartTutorial(id: string): void {
  if (confirm('Démarrer ce tutoriel ? Le dépôt courant sera réinitialisé.')) {
    repo.startTutorial(id);
  }
}
</script>

<template>
  <aside class="refs-sidebar" role="complementary" aria-label="État du dépôt">
    <!-- ================================================================
         Branches
    ================================================================ -->
    <section>
      <h2>Branches</h2>
      <ul class="item-list">
        <li
          v-for="name in branchNames"
          :key="name"
          class="item-row"
          :class="{ 'item-current': isCurrentBranch(name), clickable: !isCurrentBranch(name) }"
          :title="isCurrentBranch(name) ? 'Branche courante' : `Checkout ${name}`"
          @click="checkoutBranch(name)"
        >
          <span class="indicator">{{ isCurrentBranch(name) ? '●' : '○' }}</span>
          <span class="item-name">{{ name }}</span>
          <span class="item-hash">{{ branchShortHash(name) }}</span>
        </li>
        <li v-if="branchNames.length === 0" class="muted">aucune branche</li>
      </ul>
    </section>

    <!-- ================================================================
         HEAD
    ================================================================ -->
    <section>
      <h2>HEAD</h2>
      <div
        class="head-box"
        :class="headInfo.detached ? 'head-detached' : 'head-symbolic'"
        aria-live="polite"
        aria-label="Cible HEAD courante"
      >
        <template v-if="!headInfo.detached">
          <span class="head-label">{{ headInfo.label }}</span>
        </template>
        <template v-else>
          <span class="head-label">détaché</span>
          <code class="head-hash">{{ headInfo.label }}</code>
        </template>
      </div>
    </section>

    <!-- ================================================================
         Tags
    ================================================================ -->
    <section v-if="tagEntries.length > 0">
      <h2>Tags</h2>
      <ul class="item-list">
        <li
          v-for="tag in tagEntries"
          :key="tag.name"
          class="item-row clickable"
          :title="`Checkout ${tag.name} (HEAD détaché)`"
          @click="checkoutTag(tag.name)"
        >
          <span class="tag-icon">⬡</span>
          <span class="item-name">{{ tag.name }}</span>
          <span class="item-hash">{{ tag.shortHash }}</span>
        </li>
      </ul>
    </section>

    <!-- ================================================================
         Opération en cours
    ================================================================ -->
    <section v-if="operationState">
      <h2>⚠ Opération en cours</h2>
      <div class="operation-box">
        <p class="op-type">{{ operationLabel(operationState.type) }}</p>
        <p v-if="operationState.branchName" class="op-detail">
          Branche : <strong>{{ operationState.branchName }}</strong>
        </p>
        <div class="op-actions">
          <button
            v-if="continueCmd(operationState.type)"
            class="btn btn-continue"
            @click="onContinue"
          >
            Continuer
          </button>
          <button v-if="abortCmd(operationState.type)" class="btn btn-abort" @click="onAbort">
            Annuler
          </button>
        </div>
      </div>
    </section>

    <!-- ================================================================
         Stash
    ================================================================ -->
    <section v-if="stashCount > 0">
      <h2>Stash</h2>
      <p class="stash-count">{{ stashCount }} entrée{{ stashCount > 1 ? 's' : '' }}</p>
    </section>

    <!-- ================================================================
         Commandes récentes
    ================================================================ -->
    <section>
      <h2>Commandes récentes</h2>
      <ul class="item-list history-list">
        <li v-for="(cmd, i) in recentCommands" :key="i" class="history-item">
          <code>{{ cmd }}</code>
        </li>
        <li v-if="recentCommands.length === 0" class="muted">aucune commande</li>
      </ul>
      <button class="btn btn-reset" @click="onReset">Réinitialiser</button>
    </section>

    <!-- ================================================================
         Distant
    ================================================================ -->
    <section v-if="hasRemotes">
      <h2>Distant</h2>

      <!-- Liste des remotes -->
      <div class="remote-list">
        <div v-for="name in remoteNames" :key="name" class="remote-entry">
          <span class="remote-name">{{ name }}</span>
          <span v-if="remoteUrl(name)" class="remote-url">{{ remoteUrl(name) }}</span>
        </div>
      </div>

      <!-- Branches avec infos de tracking -->
      <div class="tracking-section">
        <div v-for="name in branchNames" :key="name" class="branch-track-row">
          <div class="branch-track-header">
            <span class="indicator">{{ isCurrentBranch(name) ? '●' : '○' }}</span>
            <span class="item-name" :class="{ 'item-current-name': isCurrentBranch(name) }">{{
              name
            }}</span>
          </div>
          <div v-if="trackingInfo(name)" class="track-stats" :class="`sync-${syncColor(name)}`">
            <span v-if="(trackingInfo(name)!.ahead ?? 0) > 0" class="ahead-count">
              &#8593;{{ trackingInfo(name)!.ahead }}
            </span>
            <span v-if="(trackingInfo(name)!.behind ?? 0) > 0" class="behind-count">
              &#8595;{{ trackingInfo(name)!.behind }}
            </span>
            <span
              v-if="
                (trackingInfo(name)!.ahead ?? 0) === 0 &&
                (trackingInfo(name)!.behind ?? 0) === 0 &&
                upstreamLabel(name)
              "
              class="synced-label"
            >
              a jour
            </span>
            <span v-if="trackingInfo(name)!.gone" class="gone-label"> (gone) </span>
            <span v-if="upstreamLabel(name)" class="upstream-label">
              [{{ upstreamLabel(name) }}]
            </span>
            <span v-else class="no-upstream-label">(pas d'upstream)</span>
          </div>
        </div>
      </div>

      <!-- Boutons d'action -->
      <div class="remote-actions">
        <button class="btn btn-fetch" @click="onFetch">Fetch</button>
        <button class="btn btn-push" @click="onPush">Push</button>
        <button class="btn btn-pull" @click="onPull">Pull</button>
      </div>
    </section>

    <!-- ================================================================
         Scénarios
    ================================================================ -->
    <section>
      <h2>Scénarios</h2>
      <ul class="item-list scenario-list">
        <li v-for="s in scenarios" :key="s.id" class="scenario-item">
          <div class="scenario-header">
            <span class="scenario-title">{{ s.title }}</span>
            <span class="scenario-difficulty" :class="`diff-${s.difficulty}`">
              {{ difficultyLabel(s.difficulty) }}
            </span>
          </div>
          <p class="scenario-desc">{{ s.description }}</p>
          <button class="btn btn-scenario" @click="onLoadScenario(s.id)">Charger</button>
        </li>
      </ul>
    </section>

    <!-- ================================================================
         Tutoriels guidés
    ================================================================ -->
    <section>
      <h2>Tutoriels guidés</h2>
      <ul class="item-list scenario-list">
        <li v-for="t in tutorials" :key="t.id" class="scenario-item">
          <div class="scenario-header">
            <span class="scenario-title">{{ t.title }}</span>
            <span class="scenario-difficulty" :class="`diff-${t.difficulty}`">
              {{ difficultyLabel(t.difficulty) }}
            </span>
          </div>
          <p class="scenario-desc">{{ t.description }}</p>
          <p class="tuto-meta">{{ t.steps.length }} étapes · ~{{ t.duration }} min</p>
          <button class="btn btn-tutorial" @click="onStartTutorial(t.id)">Commencer</button>
        </li>
      </ul>
    </section>
  </aside>
</template>

<style scoped>
.refs-sidebar {
  padding: 12px;
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-left: 1px solid var(--border-color);
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.78rem;
}

section {
  margin-bottom: 18px;
}

h2 {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  margin: 0 0 6px;
  padding-bottom: 3px;
  border-bottom: 1px solid var(--border-color);
}

/* --- Listes génériques --- */
.item-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  border-bottom: 1px solid var(--border-light);
}

.item-row.clickable {
  cursor: pointer;
}

.item-row.clickable:hover {
  background: var(--bg-tertiary);
}

.item-current .item-name {
  font-weight: 700;
  color: #0070f3;
}

.indicator {
  font-size: 0.65rem;
  color: #aaa;
  min-width: 12px;
}
.item-current .indicator {
  color: #0070f3;
}

.item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-hash {
  color: #999;
  font-size: 0.7rem;
  font-family: ui-monospace, monospace;
}

.tag-icon {
  font-size: 0.7rem;
  color: #7c3aed;
  min-width: 12px;
}

/* --- HEAD --- */
.head-box {
  padding: 6px 8px;
  border-radius: 3px;
  font-size: 0.8rem;
}

.head-symbolic {
  background: #e8f4fb;
  border-left: 3px solid #0070f3;
}

.head-detached {
  background: #fff7ed;
  border-left: 3px solid #f59e0b;
}

.head-label {
  font-weight: 600;
}

.head-hash {
  margin-left: 6px;
  color: #b45309;
}

/* --- Opération en cours --- */
.operation-box {
  background: #fffbeb;
  border-left: 3px solid #f59e0b;
  padding: 6px 8px;
  border-radius: 3px;
}

.op-type {
  font-weight: 700;
  margin: 0 0 4px;
  color: #92400e;
}

.op-detail {
  margin: 2px 0;
  color: #555;
}

.op-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

/* --- Stash --- */
.stash-count {
  color: #6d28d9;
  margin: 0;
  font-weight: 600;
}

/* --- Historique --- */
.history-list .history-item {
  padding: 2px 0;
  border-bottom: 1px solid #e8e8e8;
  overflow: hidden;
}

.history-list code {
  color: #1e40af;
  font-size: 0.75rem;
  word-break: break-all;
}

/* --- Scénarios --- */
.scenario-list {
  gap: 0;
}

.scenario-item {
  padding: 6px 0;
  border-bottom: 1px solid #e8e8e8;
}

.scenario-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.scenario-title {
  font-weight: 600;
  flex: 1;
}

.scenario-difficulty {
  font-size: 0.65rem;
  padding: 1px 4px;
  border-radius: 2px;
  font-weight: 600;
}

.diff-1 {
  background: #dcfce7;
  color: #166534;
}

.diff-2 {
  background: #fef9c3;
  color: #854d0e;
}

.diff-3 {
  background: #fee2e2;
  color: #991b1b;
}

.scenario-desc {
  margin: 2px 0 4px;
  color: #555;
  font-size: 0.72rem;
  line-height: 1.3;
  font-family: sans-serif;
}

/* --- Boutons --- */
.btn {
  padding: 3px 8px;
  font-size: 0.72rem;
  cursor: pointer;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 3px;
  font-family: inherit;
  transition: background 0.15s;
}

.btn-continue:hover {
  background: #dcfce7;
  border-color: #86efac;
}

.btn-abort:hover {
  background: #fee2e2;
  border-color: #fca5a5;
}

.btn-reset {
  margin-top: 6px;
  width: 100%;
}

.btn-reset:hover {
  background: #f1f5f9;
}

.btn-scenario {
  margin-top: 2px;
}

.btn-scenario:hover {
  background: #eff6ff;
  border-color: #93c5fd;
}

.tuto-meta {
  font-size: 0.68rem;
  color: #6b7280;
  margin: 2px 0;
}

.btn-tutorial {
  margin-top: 2px;
  background: #eef2ff;
  border-color: #c7d2fe;
}

.btn-tutorial:hover {
  background: #e0e7ff;
  border-color: #a5b4fc;
}

/* --- Distant --- */
.remote-list {
  margin-bottom: 8px;
}

.remote-entry {
  padding: 2px 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.remote-name {
  font-weight: 700;
  color: #333;
}

.remote-url {
  font-size: 0.68rem;
  color: #888;
  word-break: break-all;
}

.tracking-section {
  margin-bottom: 8px;
}

.branch-track-row {
  padding: 3px 0;
  border-bottom: 1px solid #e8e8e8;
}

.branch-track-header {
  display: flex;
  align-items: center;
  gap: 4px;
}

.item-current-name {
  font-weight: 700;
  color: #0070f3;
}

.track-stats {
  font-size: 0.68rem;
  margin-left: 16px;
  margin-top: 1px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.ahead-count {
  color: #16a34a;
  font-weight: 600;
}

.behind-count {
  color: #f59e0b;
  font-weight: 600;
}

.synced-label {
  color: #16a34a;
  font-style: italic;
}

.gone-label {
  color: #dc2626;
  font-style: italic;
}

.upstream-label {
  color: #0070f3;
}

.no-upstream-label {
  color: #aaa;
  font-style: italic;
}

.remote-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}

.btn-fetch:hover {
  background: #e0f2fe;
  border-color: #7dd3fc;
}

.btn-push:hover {
  background: #f0fdf4;
  border-color: #86efac;
}

.btn-pull:hover {
  background: #fef3c7;
  border-color: #fde68a;
}

/* --- Divers --- */
.muted {
  color: #aaa;
  font-style: italic;
  padding: 3px 0;
}
</style>
