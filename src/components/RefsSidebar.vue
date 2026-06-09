<script setup lang="ts">
import { computed } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { getAllScenarios } from '@/constants/scenarios';

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

const recentCommands = computed(() =>
  [...repo.history].slice(-10).reverse(),
);

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

function onReset(): void {
  if (confirm('Réinitialiser le dépôt et effacer l\'historique localStorage ?')) {
    repo.resetStorage();
  }
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
</script>

<template>
  <aside class="refs-sidebar">

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
          :class="{ 'item-current': isCurrentBranch(name) }"
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
        <li v-for="tag in tagEntries" :key="tag.name" class="item-row">
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
          <button
            v-if="abortCmd(operationState.type)"
            class="btn btn-abort"
            @click="onAbort"
          >
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
      <p class="stash-count">
        {{ stashCount }} entrée{{ stashCount > 1 ? 's' : '' }}
      </p>
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
      <button class="btn btn-reset" @click="onReset">
        Réinitialiser
      </button>
    </section>

    <!-- ================================================================
         Scénarios
    ================================================================ -->
    <section>
      <h2>Scénarios</h2>
      <ul class="item-list scenario-list">
        <li
          v-for="s in scenarios"
          :key="s.id"
          class="scenario-item"
        >
          <div class="scenario-header">
            <span class="scenario-title">{{ s.title }}</span>
            <span class="scenario-difficulty" :class="`diff-${s.difficulty}`">
              {{ difficultyLabel(s.difficulty) }}
            </span>
          </div>
          <p class="scenario-desc">{{ s.description }}</p>
          <button class="btn btn-scenario" @click="onLoadScenario(s.id)">
            Charger
          </button>
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
  background: #f3f3f3;
  border-left: 1px solid #ddd;
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
  color: #666;
  margin: 0 0 6px;
  padding-bottom: 3px;
  border-bottom: 1px solid #ddd;
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
  border-bottom: 1px solid #e8e8e8;
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

/* --- Divers --- */
.muted {
  color: #aaa;
  font-style: italic;
  padding: 3px 0;
}
</style>
