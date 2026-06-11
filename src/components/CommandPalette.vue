<script setup lang="ts">
/**
 * Palette de commandes (spec 57). Ctrl/Cmd+K pour ouvrir.
 *
 * Aucune logique Git : recherche déléguée à `searchPaletteItems` (pur), et
 * exécution via le store (execute / executeScenario / startTutorial) ou les
 * actions UI (thème, reset).
 */
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useTheme } from '@/composables/useTheme';
import { getAllScenarios } from '@/constants/scenarios';
import { getAllTutorials } from '@/constants/tutorials';
import { localize } from '@/core/tutorial-helpers';
import { searchPaletteItems, type PaletteItem } from '@/utils/commandPalette';
import { useI18n } from '@/i18n';

const repo = useRepoStore();
const { effectiveTheme, setTheme } = useTheme();
const { t, locale } = useI18n();

const open = ref(false);
const query = ref('');
const selectedIndex = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);

const items = computed<PaletteItem[]>(() =>
  searchPaletteItems(
    query.value,
    {
      catalog: repo.getCatalog(),
      snapshot: repo.snapshot,
      history: repo.history,
      scenarios: getAllScenarios().map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
      })),
      tutorials: getAllTutorials().map((tuto) => ({
        id: tuto.id,
        title: localize(tuto.title, locale.value),
        description: localize(tuto.description, locale.value),
      })),
    },
    50,
    t,
  ),
);

// Réinitialise la sélection quand la liste change.
watch(items, () => {
  selectedIndex.value = 0;
});

function openPalette(): void {
  open.value = true;
  query.value = '';
  selectedIndex.value = 0;
  // focus après rendu
  void Promise.resolve().then(() => inputEl.value?.focus());
}
function closePalette(): void {
  open.value = false;
}

function runItem(item: PaletteItem): void {
  switch (item.kind) {
    case 'command':
      repo.execute(item.command);
      break;
    case 'scenario':
      repo.executeScenario(item.scenarioId);
      break;
    case 'tutorial':
      repo.startTutorial(item.tutorialId);
      break;
    case 'ui':
      if (item.uiAction === 'toggle-theme') {
        setTheme(effectiveTheme.value === 'dark' ? 'light' : 'dark');
      } else if (item.uiAction === 'reset') {
        repo.resetStorage();
      }
      break;
  }
  closePalette();
}

function moveSelection(delta: number): void {
  const n = items.value.length;
  if (n === 0) return;
  selectedIndex.value = (selectedIndex.value + delta + n) % n;
}

function onInputKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveSelection(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveSelection(-1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const item = items.value[selectedIndex.value];
    if (item) runItem(item);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closePalette();
  }
}

function onGlobalKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    if (open.value) closePalette();
    else openPalette();
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown));

// Indique si une rubrique change pour afficher l'en-tête de section.
function sectionHeader(index: number): string | null {
  const item = items.value[index]!;
  const prev = items.value[index - 1];
  if (!prev || prev.section !== item.section) return item.section;
  return null;
}
</script>

<template>
  <div v-if="open" class="palette-overlay" @click="closePalette">
    <div class="palette" role="dialog" :aria-label="t('palette.ariaLabel')" @click.stop>
      <input
        ref="inputEl"
        v-model="query"
        class="palette-input"
        type="text"
        :placeholder="t('palette.placeholder')"
        :aria-label="t('palette.searchAriaLabel')"
        @keydown="onInputKeydown"
      />
      <ul class="palette-list">
        <template v-for="(item, i) in items" :key="i">
          <li v-if="sectionHeader(i)" class="palette-section">{{ sectionHeader(i) }}</li>
          <li
            class="palette-item"
            :class="{ selected: i === selectedIndex }"
            @click="runItem(item)"
            @mousemove="selectedIndex = i"
          >
            <span class="palette-label">{{ item.label }}</span>
            <span v-if="item.description" class="palette-desc">{{ item.description }}</span>
          </li>
        </template>
        <li v-if="items.length === 0" class="palette-empty">{{ t('palette.empty') }}</li>
      </ul>
      <div class="palette-foot">{{ t('palette.foot') }}</div>
    </div>
  </div>
</template>

<style scoped>
.palette-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  z-index: 2100;
}
.palette {
  width: min(560px, 92vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #1a1a1a);
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  font-family: ui-monospace, monospace;
}
.palette-input {
  padding: 12px 14px;
  font-size: 0.9rem;
  border: none;
  border-bottom: 1px solid var(--border-color, #ddd);
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #1a1a1a);
  outline: none;
}
.palette-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
}
.palette-section {
  padding: 4px 14px;
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary, #999);
}
.palette-item {
  padding: 5px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}
.palette-item.selected {
  background: var(--accent-blue, #0066cc);
  color: #fff;
}
.palette-label {
  font-size: 0.82rem;
}
.palette-desc {
  font-size: 0.68rem;
  color: var(--text-secondary, #666);
}
.palette-item.selected .palette-desc {
  color: rgba(255, 255, 255, 0.85);
}
.palette-empty {
  padding: 12px 14px;
  color: var(--text-tertiary, #999);
  font-size: 0.8rem;
}
.palette-foot {
  padding: 6px 14px;
  border-top: 1px solid var(--border-color, #ddd);
  font-size: 0.66rem;
  color: var(--text-tertiary, #999);
}
</style>
