<script setup lang="ts">
/**
 * Sélecteur de thème clair/sombre/auto (spec 56). Aucune logique métier.
 */
import { useTheme, type Theme } from '@/composables/useTheme';
import { useI18n } from '@/i18n';

const { currentTheme, setTheme } = useTheme();
const { t } = useI18n();

function onChange(e: Event): void {
  setTheme((e.target as HTMLSelectElement).value as Theme);
}
</script>

<template>
  <div class="theme-switcher">
    <label for="theme-select" class="sr-only">{{ t('theme.label') }}</label>
    <span class="theme-icon" aria-hidden="true">🎨</span>
    <select
      id="theme-select"
      class="theme-select"
      :value="currentTheme"
      :aria-label="t('theme.label')"
      @change="onChange"
    >
      <option value="light">{{ t('theme.light') }}</option>
      <option value="dark">{{ t('theme.dark') }}</option>
      <option value="auto">{{ t('theme.auto') }}</option>
    </select>
  </div>
</template>

<style scoped>
.theme-switcher {
  display: flex;
  align-items: center;
  gap: 4px;
}
.theme-icon {
  font-size: 0.85rem;
}
.theme-select {
  padding: 2px 6px;
  font-size: 0.72rem;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  font-family: ui-monospace, monospace;
}
</style>
