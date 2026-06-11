<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { getAllScenarios } from '@/constants/scenarios';
import { useI18n } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import { localize } from '@/core/tutorial-helpers';
import { useTutorialLauncher } from '@/composables/useTutorialLauncher';
import { useTerminalBus } from '@/composables/useTerminalBus';
import {
  serializeExportedSession,
  exportFilename,
  parseExportedSession,
} from '@/utils/export-import';

const repo = useRepoStore();
const { t, locale } = useI18n();
const { openTutorialLauncher } = useTutorialLauncher();
const { runInTerminal } = useTerminalBus();

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
  runInTerminal(`git checkout ${name}`);
}

/** Clic sur un tag → checkout du commit pointé (HEAD détaché). */
function checkoutTag(name: string): void {
  const hash = repo.snapshot.tags[name];
  if (!hash) return;
  runInTerminal(`git checkout ${hash.slice(0, 7)}`);
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
  const keys: Record<string, MessageKey> = {
    merging: 'op.merging',
    rebasing: 'op.rebasing',
    cherryPicking: 'op.cherryPicking',
    reverting: 'op.reverting',
  };
  const key = keys[type];
  return key ? t(key) : type;
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
  if (cmd) runInTerminal(cmd);
}

function onAbort(): void {
  const op = operationState.value;
  if (!op) return;
  const cmd = abortCmd(op.type);
  if (cmd) runInTerminal(cmd);
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
  if (confirm(t('sidebar.confirmReset'))) {
    repo.resetStorage();
  }
}

// ---------------------------------------------------------------------------
// Export / Import / Share de session (spec 58-59)
// ---------------------------------------------------------------------------

const importFileInput = ref<HTMLInputElement | null>(null);

function onExport(): void {
  const description = prompt(t('sidebar.exportDescriptionPrompt')) ?? undefined;
  const session = repo.exportSession(description);
  const json = serializeExportedSession(session);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename(session.metadata.exportDate);
  a.click();
  URL.revokeObjectURL(url);
}

function onImportClick(): void {
  importFileInput.value?.click();
}

function onShare(): void {
  const { link, size } = repo.generateShareableLink(
    window.location.origin + window.location.pathname,
  );
  if (size === 'error') {
    alert(t('sidebar.shareTooBig'));
    return;
  }
  if (size === 'warning') {
    if (!confirm(t('sidebar.shareLongWarning'))) return;
  }
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(link)
      .then(() => {
        alert(t('sidebar.shareCopied'));
      })
      .catch(() => {
        // Copie refusée (permission/contexte non sécurisé) → montrer le lien à copier.
        prompt(t('sidebar.shareCopied'), link);
      });
  } else {
    prompt(t('sidebar.shareCopied'), link);
  }
}

function onImportFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === 'string' ? reader.result : '';
    const result = parseExportedSession(text);
    if (!result.ok) {
      alert(result.error);
    } else {
      const importResult = repo.importSession(result.session);
      if (importResult.partial) {
        alert(t('sidebar.importPartial', { index: String(importResult.errorIndex ?? '?') }));
      } else {
        alert(t('sidebar.importSuccess', { count: String(importResult.replayed) }));
      }
    }
    // Réinitialise l'input pour permettre de réimporter le même fichier.
    input.value = '';
  };
  reader.onerror = () => {
    alert(t('sidebar.importReadError'));
    input.value = '';
  };
  reader.readAsText(file);
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
  runInTerminal('git fetch');
}

function onPush(): void {
  const head = repo.snapshot.head;
  if (head.type === 'detached') {
    alert(t('sidebar.detachedPushAlert'));
    return;
  }
  runInTerminal(`git push`);
}

function onPull(): void {
  const head = repo.snapshot.head;
  if (head.type === 'detached') {
    alert(t('sidebar.detachedPullAlert'));
    return;
  }
  runInTerminal(`git pull`);
}

// ---------------------------------------------------------------------------
// Scénarios
// ---------------------------------------------------------------------------

const scenarios = computed(() => getAllScenarios());

function onLoadScenario(id: string): void {
  if (confirm(t('sidebar.confirmScenario'))) {
    repo.executeScenario(id);
  }
}

function difficultyLabel(d: 1 | 2 | 3): string {
  return d === 1 ? t('difficulty.easy') : d === 2 ? t('difficulty.medium') : t('difficulty.hard');
}

// ---------------------------------------------------------------------------
// Tutoriels guidés (spec 51 / 62) — ouverture du lanceur
// ---------------------------------------------------------------------------

function onOpenTutorialLauncher(): void {
  openTutorialLauncher();
}
</script>

<template>
  <aside class="refs-sidebar" role="complementary" :aria-label="t('sidebar.ariaLabel')">
    <!-- ================================================================
         Branches
    ================================================================ -->
    <section>
      <h2>{{ t('sidebar.branches') }}</h2>
      <ul class="item-list">
        <li
          v-for="name in branchNames"
          :key="name"
          class="item-row"
          :class="{ 'item-current': isCurrentBranch(name), clickable: !isCurrentBranch(name) }"
          :title="
            isCurrentBranch(name)
              ? t('sidebar.currentBranch')
              : t('sidebar.checkoutTitle', { name })
          "
          @click="checkoutBranch(name)"
        >
          <span class="indicator">{{ isCurrentBranch(name) ? '●' : '○' }}</span>
          <span class="item-name">{{ name }}</span>
          <span class="item-hash">{{ branchShortHash(name) }}</span>
        </li>
        <li v-if="branchNames.length === 0" class="muted">{{ t('sidebar.noBranches') }}</li>
      </ul>
    </section>

    <!-- ================================================================
         HEAD
    ================================================================ -->
    <section>
      <h2>{{ t('sidebar.head') }}</h2>
      <div
        class="head-box"
        :class="headInfo.detached ? 'head-detached' : 'head-symbolic'"
        aria-live="polite"
        :aria-label="t('sidebar.headAriaLabel')"
      >
        <template v-if="!headInfo.detached">
          <span class="head-label">{{ headInfo.label }}</span>
        </template>
        <template v-else>
          <span class="head-label">{{ t('sidebar.detached') }}</span>
          <code class="head-hash">{{ headInfo.label }}</code>
        </template>
      </div>
    </section>

    <!-- ================================================================
         Tags
    ================================================================ -->
    <section v-if="tagEntries.length > 0">
      <h2>{{ t('sidebar.tags') }}</h2>
      <ul class="item-list">
        <li
          v-for="tag in tagEntries"
          :key="tag.name"
          class="item-row clickable"
          :title="t('sidebar.checkoutTagTitle', { name: tag.name })"
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
      <h2>{{ t('sidebar.operation') }}</h2>
      <div class="operation-box">
        <p class="op-type">{{ operationLabel(operationState.type) }}</p>
        <p v-if="operationState.branchName" class="op-detail">
          {{ t('sidebar.branchLabel') }} : <strong>{{ operationState.branchName }}</strong>
        </p>
        <div class="op-actions">
          <button
            v-if="continueCmd(operationState.type)"
            class="btn btn-continue"
            @click="onContinue"
          >
            {{ t('sidebar.continue') }}
          </button>
          <button v-if="abortCmd(operationState.type)" class="btn btn-abort" @click="onAbort">
            {{ t('sidebar.abort') }}
          </button>
        </div>
      </div>
    </section>

    <!-- ================================================================
         Stash
    ================================================================ -->
    <section v-if="stashCount > 0">
      <h2>{{ t('sidebar.stash') }}</h2>
      <p class="stash-count">{{ t('sidebar.stashEntries', { n: stashCount }) }}</p>
    </section>

    <!-- ================================================================
         Commandes récentes
    ================================================================ -->
    <section>
      <h2>{{ t('sidebar.recentCommands') }}</h2>
      <ul class="item-list history-list">
        <li v-for="(cmd, i) in recentCommands" :key="i" class="history-item">
          <code>{{ cmd }}</code>
        </li>
        <li v-if="recentCommands.length === 0" class="muted">{{ t('sidebar.noCommands') }}</li>
      </ul>
      <div class="session-actions">
        <button class="btn btn-reset" @click="onReset">{{ t('sidebar.reset') }}</button>
        <button class="btn btn-undo" :disabled="!repo.canUndo" @click="repo.undo()">
          ↶ {{ t('sidebar.undo') }}
        </button>
        <button class="btn btn-redo" :disabled="!repo.canRedo" @click="repo.redo()">
          ↷ {{ t('sidebar.redo') }}
        </button>
        <button
          class="btn btn-export"
          :disabled="repo.savedCommands.length === 0"
          :title="repo.savedCommands.length === 0 ? t('sidebar.exportDisabledTitle') : undefined"
          @click="onExport"
        >
          {{ t('sidebar.export') }}
        </button>
        <button class="btn btn-import" @click="onImportClick">{{ t('sidebar.import') }}</button>
        <button
          class="btn btn-share"
          :disabled="repo.savedCommands.length === 0"
          :title="repo.savedCommands.length === 0 ? t('sidebar.exportDisabledTitle') : undefined"
          @click="onShare"
        >
          {{ t('sidebar.share') }}
        </button>
        <input
          ref="importFileInput"
          type="file"
          accept=".json"
          class="sr-only"
          @change="onImportFileChange"
        />
      </div>
    </section>

    <!-- ================================================================
         Distant
    ================================================================ -->
    <section v-if="hasRemotes">
      <h2>{{ t('sidebar.remote') }}</h2>

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
              {{ t('sidebar.upToDate') }}
            </span>
            <span v-if="trackingInfo(name)!.gone" class="gone-label">
              {{ t('sidebar.gone') }}
            </span>
            <span v-if="upstreamLabel(name)" class="upstream-label">
              [{{ upstreamLabel(name) }}]
            </span>
            <span v-else class="no-upstream-label">{{ t('sidebar.noUpstream') }}</span>
          </div>
        </div>
      </div>

      <!-- Boutons d'action -->
      <div class="remote-actions">
        <button class="btn btn-fetch" @click="onFetch">{{ t('sidebar.fetch') }}</button>
        <button class="btn btn-push" @click="onPush">{{ t('sidebar.push') }}</button>
        <button class="btn btn-pull" @click="onPull">{{ t('sidebar.pull') }}</button>
      </div>
    </section>

    <!-- ================================================================
         Tutoriels guidés (spec 62) — lanceur + tutoriel en cours
    ================================================================ -->
    <section>
      <h2>{{ t('sidebar.tutorials') }}</h2>
      <!-- Tutoriel en cours : affiche le titre et donne accès -->
      <div v-if="repo.currentTutorial" class="current-tuto-box">
        <span class="current-tuto-label">
          {{ localize(repo.currentTutorial.title, locale) }}
        </span>
      </div>
      <button class="btn btn-tutorial" @click="onOpenTutorialLauncher">
        {{ t('sidebar.openTutorials') }}
      </button>
    </section>

    <!-- ================================================================
         Scénarios
    ================================================================ -->
    <section>
      <h2>{{ t('sidebar.scenarios') }}</h2>
      <ul class="item-list scenario-list">
        <li v-for="s in scenarios" :key="s.id" class="scenario-item">
          <div class="scenario-header">
            <span class="scenario-title">{{ s.title }}</span>
            <span class="scenario-difficulty" :class="`diff-${s.difficulty}`">
              {{ difficultyLabel(s.difficulty) }}
            </span>
          </div>
          <p class="scenario-desc">{{ s.description }}</p>
          <button class="btn btn-scenario" @click="onLoadScenario(s.id)">
            {{ t('sidebar.load') }}
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
  color: var(--link-color);
}

.indicator {
  font-size: 0.65rem;
  color: var(--text-tertiary);
  min-width: 12px;
}
.item-current .indicator {
  color: var(--link-color);
}

.item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-hash {
  color: var(--text-tertiary);
  font-size: 0.7rem;
  font-family: ui-monospace, monospace;
}

.tag-icon {
  font-size: 0.7rem;
  color: var(--tag-color);
  min-width: 12px;
}

/* --- HEAD --- */
.head-box {
  padding: 6px 8px;
  border-radius: 3px;
  font-size: 0.8rem;
}

.head-symbolic {
  background: var(--info-bg);
  border-left: 3px solid var(--link-color);
}

.head-detached {
  background: var(--warning-bg);
  border-left: 3px solid var(--warning-border);
}

.head-label {
  font-weight: 600;
}

.head-hash {
  margin-left: 6px;
  color: var(--warning-fg);
}

/* --- Opération en cours --- */
.operation-box {
  background: var(--warning-bg);
  border-left: 3px solid var(--warning-border);
  padding: 6px 8px;
  border-radius: 3px;
}

.op-type {
  font-weight: 700;
  margin: 0 0 4px;
  color: var(--warning-fg);
}

.op-detail {
  margin: 2px 0;
  color: var(--text-secondary);
}

.op-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

/* --- Stash --- */
.stash-count {
  color: var(--tag-color);
  margin: 0;
  font-weight: 600;
}

/* --- Historique --- */
.history-list .history-item {
  padding: 2px 0;
  border-bottom: 1px solid var(--border-light);
  overflow: hidden;
}

.history-list code {
  color: var(--link-color);
  font-size: 0.75rem;
  word-break: break-all;
}

/* --- Scénarios --- */
.scenario-list {
  gap: 0;
}

.scenario-item {
  padding: 6px 0;
  border-bottom: 1px solid var(--border-light);
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
  background: var(--success-bg);
  color: var(--success-fg);
}

.diff-2 {
  background: var(--warning-bg);
  color: var(--warning-fg);
}

.diff-3 {
  background: var(--danger-bg);
  color: var(--danger-fg);
}

.scenario-desc {
  margin: 2px 0 4px;
  color: var(--text-secondary);
  font-size: 0.72rem;
  line-height: 1.3;
  font-family: sans-serif;
}

/* --- Boutons --- */
.btn {
  padding: 3px 8px;
  font-size: 0.72rem;
  cursor: pointer;
  border: 1px solid var(--btn-border);
  background: var(--btn-bg);
  color: var(--text-primary);
  border-radius: 3px;
  font-family: inherit;
  transition: background 0.15s;
}

.btn-continue:hover {
  background: var(--success-bg);
  border-color: var(--success-border);
}

.btn-abort:hover {
  background: var(--danger-bg);
  border-color: var(--danger-border);
}

.session-actions {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.session-actions .btn-reset {
  flex: 1 1 100%;
}

.btn-reset:hover {
  background: var(--btn-hover-bg);
}

.btn-undo,
.btn-redo {
  flex: 1;
}

.btn-undo:hover:not(:disabled),
.btn-redo:hover:not(:disabled) {
  background: var(--btn-hover-bg);
  border-color: var(--text-tertiary);
}

.btn-undo:disabled,
.btn-redo:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-export {
  flex: 1;
}

.btn-export:hover:not(:disabled) {
  background: var(--success-bg);
  border-color: var(--success-border);
}

.btn-export:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-import {
  flex: 1;
}

.btn-import:hover {
  background: var(--info-bg);
  border-color: var(--link-color);
}

.btn-share {
  flex: 1;
}

.btn-share:hover:not(:disabled) {
  background: var(--info-bg);
  border-color: var(--link-color);
}

.btn-share:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-scenario {
  margin-top: 2px;
}

.btn-scenario:hover {
  background: var(--info-bg);
  border-color: var(--link-color);
}

.tuto-meta {
  font-size: 0.68rem;
  color: var(--text-secondary);
  margin: 2px 0;
}

.current-tuto-box {
  background: var(--tutorial-bg);
  border-left: 3px solid var(--tutorial-border);
  border-radius: 3px;
  padding: 4px 8px;
  margin-bottom: 6px;
}

.current-tuto-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--tutorial-fg);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-tutorial {
  margin-top: 2px;
  background: var(--tutorial-bg);
  border-color: var(--tutorial-border);
}

.btn-tutorial:hover {
  background: var(--tutorial-bg);
  border-color: var(--tutorial-fg);
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
  color: var(--text-primary);
}

.remote-url {
  font-size: 0.68rem;
  color: var(--text-tertiary);
  word-break: break-all;
}

.tracking-section {
  margin-bottom: 8px;
}

.branch-track-row {
  padding: 3px 0;
  border-bottom: 1px solid var(--border-light);
}

.branch-track-header {
  display: flex;
  align-items: center;
  gap: 4px;
}

.item-current-name {
  font-weight: 700;
  color: var(--link-color);
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
  color: var(--success-fg);
  font-weight: 600;
}

.behind-count {
  color: var(--warning-fg);
  font-weight: 600;
}

.synced-label {
  color: var(--success-fg);
  font-style: italic;
}

.gone-label {
  color: var(--danger-fg);
  font-style: italic;
}

.upstream-label {
  color: var(--link-color);
}

.no-upstream-label {
  color: var(--text-tertiary);
  font-style: italic;
}

.remote-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}

.btn-fetch:hover {
  background: var(--info-bg);
  border-color: var(--link-color);
}

.btn-push:hover {
  background: var(--success-bg);
  border-color: var(--success-border);
}

.btn-pull:hover {
  background: var(--warning-bg);
  border-color: var(--warning-border);
}

/* --- Divers --- */
.muted {
  color: var(--text-tertiary);
  font-style: italic;
  padding: 3px 0;
}
</style>
