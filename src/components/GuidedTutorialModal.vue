<script setup lang="ts">
/**
 * Modale de tutoriel guidé (spec 51, 62).
 *
 * Aucune logique Git : lit l'état du tutoriel via le store (currentStep,
 * tutorialObjectives auto-validés, etc.) et appelle les actions du store.
 * La validation des objectifs se fait dans le store (prédicats purs du core).
 * Champs textuels LocalizedText résolus par `localize()` + locale réactive.
 */
import { computed, ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { localize } from '@/core/tutorial-helpers';
import type { LocalizedText } from '@/core/tutorial-helpers';
import { useI18n } from '@/i18n';

const repo = useRepoStore();
const { t, locale } = useI18n();

/** Résout un LocalizedText dans la locale courante. */
function lz(txt: LocalizedText): string {
  return localize(txt, locale.value);
}

const isVisible = computed(() => repo.tutorialProgress !== null);
const tutorial = computed(() => repo.currentTutorial);
const step = computed(() => repo.currentStep);
const objectives = computed(() => repo.tutorialObjectives);
const stepComplete = computed(() => repo.currentStepComplete);
const completed = computed(() => repo.tutorialCompleted);

// Affichage local de l'indice.
const showHint = ref(false);
// Section « Pourquoi & comment » — toujours présente, réduite par défaut.
const showWhy = ref(false);
// Section « Effet sur le graphe » — ouverte par défaut.
const showGraphEffect = ref(true);

watch(step, () => {
  showHint.value = false;
  showWhy.value = false;
  showGraphEffect.value = true;
});

const stepNumber = computed(() => (repo.tutorialProgress?.currentStepIndex ?? 0) + 1);
const totalSteps = computed(() => tutorial.value?.steps.length ?? 0);
const isLastStep = computed(() => stepNumber.value >= totalSteps.value);

function onHint(): void {
  showHint.value = true;
  repo.useHint();
}
function onExecute(): void {
  const cmd = step.value?.command;
  if (cmd) repo.executeChain(cmd);
}
function onNext(): void {
  repo.nextStep();
}
function onPrev(): void {
  repo.previousStep();
}
function onSkip(): void {
  repo.skipStep();
}
function onQuit(): void {
  repo.quitTutorial();
}
function onRestart(): void {
  if (tutorial.value) repo.startTutorial(tutorial.value.id);
}
</script>

<template>
  <div v-if="isVisible" class="tuto-overlay">
    <div class="tuto-modal" role="dialog" :aria-label="t('tutorial.modalAriaLabel')">
      <!-- Écran de récapitulatif (tutoriel terminé) -->
      <template v-if="completed">
        <header class="tuto-header">
          <h2>{{ t('tutorial.completedTitle') }}</h2>
        </header>
        <p class="tuto-recap-title">{{ tutorial ? lz(tutorial.title) : '' }}</p>
        <ul class="recap-list">
          <li v-for="(s, idx) in tutorial?.steps ?? []" :key="idx">
            <span :class="repo.tutorialProgress?.skippedSteps.includes(s.id) ? 'skipped' : 'done'">
              {{ repo.tutorialProgress?.skippedSteps.includes(s.id) ? '⤼' : '✓' }}
            </span>
            {{ lz(s.title) }}
          </li>
        </ul>
        <p class="recap-stats">
          {{
            t('tutorial.recapStats', {
              hints: String(repo.tutorialProgress?.hintsUsedCount ?? 0),
              skipped: String(repo.tutorialProgress?.skippedSteps.length ?? 0),
            })
          }}
        </p>
        <footer class="tuto-footer">
          <button class="btn btn-primary" @click="onRestart">{{ t('tutorial.restart') }}</button>
          <button class="btn" @click="onQuit">{{ t('tutorial.close') }}</button>
        </footer>
      </template>

      <!-- Étape courante -->
      <template v-else-if="step">
        <header class="tuto-header">
          <h2>{{ tutorial ? lz(tutorial.title) : '' }}</h2>
          <span class="step-counter">{{
            t('tutorial.stepCounter', { current: String(stepNumber), total: String(totalSteps) })
          }}</span>
        </header>

        <h3 class="step-title">{{ lz(step.title) }}</h3>
        <p class="step-desc">{{ lz(step.description) }}</p>

        <!-- Bouton Exécuter (si la commande est définie sur l'étape) -->
        <div v-if="step.command" class="execute-row">
          <button class="btn btn-execute" @click="onExecute">
            ▶ {{ t('tutorial.executeButton') }}
          </button>
          <code class="execute-cmd">{{ step.command }}</code>
        </div>

        <!-- Indice -->
        <div class="hint-row">
          <button v-if="step.hint && !showHint" class="btn btn-hint" @click="onHint">
            💡 {{ t('tutorial.hint') }}
          </button>
          <p v-if="showHint && step.hint" class="hint-text">{{ lz(step.hint) }}</p>
        </div>

        <!-- Checklist des objectifs (auto-validés) -->
        <ul class="objectives">
          <li v-for="(o, idx) in objectives" :key="idx" :class="{ ok: o.passed }">
            <span class="check">{{ o.passed ? '✓' : '○' }}</span>
            {{ lz(o.description) }}
          </li>
        </ul>

        <p v-if="stepComplete" class="success-msg">{{ lz(step.successMessage) }}</p>

        <!-- Section Pourquoi & comment (dépliable, réduite par défaut) -->
        <details
          class="collapsible-section"
          :open="showWhy"
          @toggle="showWhy = ($event.target as HTMLDetailsElement).open"
        >
          <summary class="section-summary">{{ t('tutorial.why') }}</summary>
          <p class="section-body">{{ lz(step.explanation) }}</p>
        </details>

        <!-- Section Effet sur le graphe (dépliable, ouverte par défaut) -->
        <details
          class="collapsible-section"
          :open="showGraphEffect"
          @toggle="showGraphEffect = ($event.target as HTMLDetailsElement).open"
        >
          <summary class="section-summary">{{ t('tutorial.graphEffect') }}</summary>
          <p class="section-body">{{ lz(step.graphEffect) }}</p>
        </details>

        <footer class="tuto-footer">
          <button class="btn" @click="onQuit">{{ t('tutorial.quit') }}</button>
          <button class="btn" :disabled="stepNumber <= 1" @click="onPrev">
            {{ t('tutorial.back') }}
          </button>
          <button class="btn" @click="onSkip">{{ t('tutorial.skip') }}</button>
          <button class="btn btn-primary" :disabled="!stepComplete" @click="onNext">
            {{ isLastStep ? t('tutorial.finish') : t('tutorial.next') }}
          </button>
        </footer>
      </template>
    </div>
  </div>
</template>

<style scoped>
.tuto-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg, rgba(0, 0, 0, 0.45));
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  z-index: 1900;
  padding: 16px;
}
.tuto-modal {
  background: var(--surface-bg, #fff);
  color: var(--surface-fg, #24292e);
  border-radius: 8px;
  width: min(400px, 92vw);
  max-height: 90vh;
  overflow: auto;
  padding: 16px 18px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  font-family: ui-monospace, monospace;
}
.tuto-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 1px solid var(--surface-muted-bg, #eee);
  padding-bottom: 8px;
  margin-bottom: 8px;
}
.tuto-header h2 {
  font-size: 1rem;
  margin: 0;
}
.step-counter {
  font-size: 0.72rem;
  color: #6b7280;
}
.step-title {
  font-size: 0.92rem;
  margin: 6px 0 4px;
}
.step-desc {
  font-size: 0.82rem;
  line-height: 1.5;
  color: #374151;
}
.execute-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  flex-wrap: wrap;
}
.execute-cmd {
  font-size: 0.72rem;
  color: #1e40af;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 3px;
  padding: 2px 6px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hint-row {
  margin: 8px 0;
}
.hint-text {
  font-size: 0.78rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 4px;
  padding: 6px 8px;
  color: #92400e;
}
.objectives {
  list-style: none;
  padding: 0;
  margin: 10px 0;
}
.objectives li {
  font-size: 0.8rem;
  padding: 3px 0;
  color: #6b7280;
}
.objectives li.ok {
  color: #16a34a;
  font-weight: 600;
}
.objectives .check {
  display: inline-block;
  width: 16px;
}
.success-msg {
  font-size: 0.82rem;
  color: #16a34a;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 4px;
  padding: 6px 8px;
}
/* Sections dépliables (Pourquoi & Effet) */
.collapsible-section {
  margin: 8px 0;
  border: 1px solid var(--surface-muted-bg, #e5e7eb);
  border-radius: 4px;
  overflow: hidden;
}
.section-summary {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  cursor: pointer;
  padding: 5px 8px;
  background: var(--surface-muted-bg, #f9fafb);
  user-select: none;
  list-style: none;
}
.section-summary::-webkit-details-marker {
  display: none;
}
.section-summary::before {
  content: '▶ ';
  font-size: 0.6rem;
}
details[open] .section-summary::before {
  content: '▼ ';
}
.section-body {
  font-size: 0.78rem;
  line-height: 1.5;
  color: #374151;
  padding: 6px 8px;
  margin: 0;
}
.tuto-recap-title {
  font-weight: 600;
  font-size: 0.9rem;
}
.recap-list {
  list-style: none;
  padding: 0;
  font-size: 0.82rem;
}
.recap-list .done {
  color: #16a34a;
}
.recap-list .skipped {
  color: #b45309;
}
.recap-stats {
  font-size: 0.75rem;
  color: #6b7280;
}
.tuto-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border-top: 1px solid var(--surface-muted-bg, #eee);
  padding-top: 10px;
  margin-top: 10px;
}
.btn {
  padding: 4px 10px;
  font-size: 0.74rem;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 3px;
  cursor: pointer;
  font-family: ui-monospace, monospace;
}
.btn:hover:not(:disabled) {
  background: #eef;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn-primary {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}
.btn-hint {
  background: #fffbeb;
  border-color: #fde68a;
  color: #92400e;
}
.btn-execute {
  background: #f0fdf4;
  border-color: #86efac;
  color: #166534;
  font-weight: 600;
  white-space: nowrap;
}
.btn-execute:hover {
  background: #dcfce7;
}
</style>
