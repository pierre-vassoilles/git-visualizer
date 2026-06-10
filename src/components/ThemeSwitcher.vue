<script setup lang="ts">
/**
 * Sélecteur de thème clair/sombre/auto (spec 56). Aucune logique métier.
 */
import { useTheme, type Theme } from '@/composables/useTheme';

const { currentTheme, setTheme } = useTheme();

function onChange(e: Event): void {
  setTheme((e.target as HTMLSelectElement).value as Theme);
}
</script>

<template>
  <div class="theme-switcher">
    <label for="theme-select" class="sr-only">Thème</label>
    <span class="theme-icon" aria-hidden="true">🎨</span>
    <select
      id="theme-select"
      class="theme-select"
      :value="currentTheme"
      aria-label="Choisir le thème"
      @change="onChange"
    >
      <option value="light">Clair</option>
      <option value="dark">Sombre</option>
      <option value="auto">Auto</option>
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
