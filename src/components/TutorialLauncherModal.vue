<script setup lang="ts">
/**
 * Lanceur de tutoriels groupés par niveau (spec 62).
 *
 * Aucune logique Git : liste les tutoriels depuis getTutorialsByLevel (données
 * pures), localise les textes via localize(), déclenche startTutorial() via le
 * store. Visibilité pilotée par le composable useTutorialLauncher (singleton).
 */
import { computed } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { getTutorialsByLevel } from '@/constants/tutorials';
import { localize, levelToDifficulty } from '@/core/tutorial-helpers';
import type { TutorialLevel } from '@/core/tutorial-helpers';
import { useI18n } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import { useTutorialLauncher } from '@/composables/useTutorialLauncher';

const repo = useRepoStore();
const { t, locale } = useI18n();
const { isOpen, closeTutorialLauncher } = useTutorialLauncher();

const LEVELS: TutorialLevel[] = ['basic', 'medium', 'advanced'];

const levelLabelKey: Record<TutorialLevel, MessageKey> = {
  basic: 'sidebar.tutorialLevel.basic',
  medium: 'sidebar.tutorialLevel.medium',
  advanced: 'sidebar.tutorialLevel.advanced',
};

function difficultyLabel(d: 1 | 2 | 3): string {
  return d === 1 ? t('difficulty.easy') : d === 2 ? t('difficulty.medium') : t('difficulty.hard');
}

function tutorialsByLevel(level: TutorialLevel) {
  return getTutorialsByLevel(level);
}

/** Sections non vides (on n'affiche pas de section vide). */
const visibleLevels = computed(() => LEVELS.filter((l) => tutorialsByLevel(l).length > 0));

function onStartTutorial(id: string): void {
  repo.startTutorial(id);
  closeTutorialLauncher();
}

function onClose(): void {
  closeTutorialLauncher();
}

function onOverlayClick(e: MouseEvent): void {
  if ((e.target as Element).classList.contains('launcher-overlay')) {
    closeTutorialLauncher();
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeTutorialLauncher();
}
</script>

<template>
  <div
    v-if="isOpen"
    class="launcher-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Choisir un tutoriel"
    @click="onOverlayClick"
    @keydown="onKeydown"
  >
    <div class="launcher-modal">
      <header class="launcher-header">
        <h2 class="launcher-title">{{ t('sidebar.tutorials') }}</h2>
        <button class="btn-close" aria-label="Fermer" @click="onClose">✕</button>
      </header>

      <div class="launcher-body">
        <section v-for="level in visibleLevels" :key="level" class="level-section">
          <h3 class="level-heading">{{ t(levelLabelKey[level]) }}</h3>
          <ul class="tuto-list">
            <li v-for="tuto in tutorialsByLevel(level)" :key="tuto.id" class="tuto-item">
              <div class="tuto-item-header">
                <span class="tuto-item-title">{{ localize(tuto.title, locale) }}</span>
                <span class="tuto-difficulty" :class="`diff-${levelToDifficulty(tuto.level)}`">
                  {{ difficultyLabel(levelToDifficulty(tuto.level)) }}
                </span>
              </div>
              <p class="tuto-item-desc">{{ localize(tuto.description, locale) }}</p>
              <p class="tuto-item-meta">
                ~{{ tuto.duration }} min · {{ tuto.steps.length }} étapes
              </p>
              <button
                class="btn btn-start"
                :data-tutorial-id="tuto.id"
                @click="onStartTutorial(tuto.id)"
              >
                {{ t('sidebar.start') }}
              </button>
            </li>
          </ul>
        </section>
      </div>

      <footer class="launcher-footer">
        <button class="btn btn-cancel" @click="onClose">Fermer</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.launcher-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg, rgba(0, 0, 0, 0.45));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1950;
  padding: 16px;
}
.launcher-modal {
  background: var(--surface-bg, #fff);
  color: var(--surface-fg, #24292e);
  border-radius: 8px;
  width: min(520px, 94vw);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  font-family: ui-monospace, monospace;
}
.launcher-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 10px;
  border-bottom: 1px solid var(--surface-muted-bg, #e5e7eb);
}
.launcher-title {
  margin: 0;
  font-size: 1rem;
}
.btn-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  color: #6b7280;
  padding: 2px 6px;
  border-radius: 3px;
  line-height: 1;
}
.btn-close:hover {
  background: var(--surface-muted-bg, #f3f4f6);
}
.launcher-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 18px;
}
.level-section {
  margin-bottom: 18px;
}
.level-heading {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #6b7280;
  margin: 0 0 8px;
  padding-bottom: 3px;
  border-bottom: 1px solid var(--surface-muted-bg, #e5e7eb);
}
.tuto-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tuto-item {
  border: 1px solid var(--surface-muted-bg, #e5e7eb);
  border-radius: 5px;
  padding: 10px 12px;
}
.tuto-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.tuto-item-title {
  font-weight: 600;
  font-size: 0.85rem;
  flex: 1;
}
.tuto-difficulty {
  font-size: 0.62rem;
  padding: 1px 5px;
  border-radius: 2px;
  font-weight: 600;
  white-space: nowrap;
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
.tuto-item-desc {
  font-size: 0.75rem;
  color: #555;
  line-height: 1.4;
  margin: 0 0 4px;
  font-family: sans-serif;
}
.tuto-item-meta {
  font-size: 0.68rem;
  color: #9ca3af;
  margin: 0 0 8px;
}
.launcher-footer {
  padding: 10px 18px;
  border-top: 1px solid var(--surface-muted-bg, #e5e7eb);
  display: flex;
  justify-content: flex-end;
}
.btn {
  padding: 5px 12px;
  font-size: 0.75rem;
  cursor: pointer;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 3px;
  font-family: ui-monospace, monospace;
}
.btn-start {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #3730a3;
}
.btn-start:hover {
  background: #e0e7ff;
  border-color: #a5b4fc;
}
.btn-cancel:hover {
  background: #f1f5f9;
}
</style>
