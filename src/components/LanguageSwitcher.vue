<script setup lang="ts">
/**
 * Sélecteur de langue FR/EN (spec 55). Aucune logique métier ni git.
 */
import { useI18n, type Locale } from '@/i18n';

const { t, getLocale, setLocale } = useI18n();

function onChange(e: Event): void {
  setLocale((e.target as HTMLSelectElement).value as Locale);
}
</script>

<template>
  <div class="language-switcher">
    <label for="lang-select" class="sr-only">{{ t('ui.language') }}</label>
    <span class="lang-icon" aria-hidden="true">🌐</span>
    <select
      id="lang-select"
      class="lang-select"
      :value="getLocale()"
      :aria-label="t('ui.language')"
      @change="onChange"
    >
      <option value="fr">Français</option>
      <option value="en">English</option>
    </select>
  </div>
</template>

<style scoped>
.language-switcher {
  display: flex;
  align-items: center;
  gap: 4px;
}
.lang-icon {
  font-size: 0.85rem;
}
.lang-select {
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
