<script setup lang="ts">
/**
 * Modale de tutoriel guidé (spec 51).
 *
 * Aucune logique Git : lit l'état du tutoriel via le store (currentStep,
 * tutorialObjectives auto-validés, etc.) et appelle les actions du store.
 * La validation des objectifs se fait dans le store (prédicats purs du core).
 */
import { computed, ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';

const repo = useRepoStore();

const isVisible = computed(() => repo.tutorialProgress !== null);
const tutorial = computed(() => repo.currentTutorial);
const step = computed(() => repo.currentStep);
const objectives = computed(() => repo.tutorialObjectives);
const stepComplete = computed(() => repo.currentStepComplete);
const completed = computed(() => repo.tutorialCompleted);

// Affichage local de l'indice.
const showHint = ref(false);
watch(step, () => {
  showHint.value = false;
});

const stepNumber = computed(() => (repo.tutorialProgress?.currentStepIndex ?? 0) + 1);
const totalSteps = computed(() => tutorial.value?.steps.length ?? 0);
const isLastStep = computed(() => stepNumber.value >= totalSteps.value);

function onHint(): void {
  showHint.value = true;
  repo.useHint();
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
    <div class="tuto-modal" role="dialog" aria-label="Tutoriel guidé">
      <!-- Écran de récapitulatif (tutoriel terminé) -->
      <template v-if="completed">
        <header class="tuto-header">
          <h2>🎉 Tutoriel complété !</h2>
        </header>
        <p class="tuto-recap-title">{{ tutorial?.title }}</p>
        <ul class="recap-list">
          <li v-for="s in tutorial?.steps ?? []" :key="s.id">
            <span :class="repo.tutorialProgress?.skippedSteps.includes(s.id) ? 'skipped' : 'done'">
              {{ repo.tutorialProgress?.skippedSteps.includes(s.id) ? '⤼' : '✓' }}
            </span>
            {{ s.title }}
          </li>
        </ul>
        <p class="recap-stats">
          Indices utilisés : {{ repo.tutorialProgress?.hintsUsedCount ?? 0 }} · Étapes sautées :
          {{ repo.tutorialProgress?.skippedSteps.length ?? 0 }}
        </p>
        <footer class="tuto-footer">
          <button class="btn btn-primary" @click="onRestart">Recommencer</button>
          <button class="btn" @click="onQuit">Fermer</button>
        </footer>
      </template>

      <!-- Étape courante -->
      <template v-else-if="step">
        <header class="tuto-header">
          <h2>{{ tutorial?.title }}</h2>
          <span class="step-counter">Étape {{ stepNumber }} / {{ totalSteps }}</span>
        </header>

        <h3 class="step-title">{{ step.title }}</h3>
        <p class="step-desc">{{ step.description }}</p>

        <!-- Indice -->
        <div class="hint-row">
          <button v-if="step.hint && !showHint" class="btn btn-hint" @click="onHint">
            💡 Indice
          </button>
          <p v-if="showHint && step.hint" class="hint-text">{{ step.hint }}</p>
        </div>

        <!-- Checklist des objectifs (auto-validés) -->
        <ul class="objectives">
          <li v-for="o in objectives" :key="o.description" :class="{ ok: o.passed }">
            <span class="check">{{ o.passed ? '✓' : '○' }}</span>
            {{ o.description }}
          </li>
        </ul>

        <p v-if="stepComplete" class="success-msg">{{ step.successMessage }}</p>

        <footer class="tuto-footer">
          <button class="btn" @click="onQuit">Quitter</button>
          <button class="btn" :disabled="stepNumber <= 1" @click="onPrev">Revenir</button>
          <button class="btn" @click="onSkip">Passer</button>
          <button class="btn btn-primary" :disabled="!stepComplete" @click="onNext">
            {{ isLastStep ? 'Terminer' : 'Suivant' }}
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
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  z-index: 1900;
  padding: 16px;
}
.tuto-modal {
  background: #fff;
  border-radius: 8px;
  width: min(380px, 92vw);
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
  border-bottom: 1px solid #eee;
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
  border-top: 1px solid #eee;
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
</style>
