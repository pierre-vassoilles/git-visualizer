<script setup lang="ts">
import { onMounted } from 'vue';
import GraphView from '@/components/GraphView.vue';
import TerminalPanel from '@/components/TerminalPanel.vue';
import RefsSidebar from '@/components/RefsSidebar.vue';
import InteractiveRebaseModal from '@/components/InteractiveRebaseModal.vue';
import ConflictEditorModal from '@/components/ConflictEditorModal.vue';
import GuidedTutorialModal from '@/components/GuidedTutorialModal.vue';
import ThemeSwitcher from '@/components/ThemeSwitcher.vue';
import LanguageSwitcher from '@/components/LanguageSwitcher.vue';
import CommandPalette from '@/components/CommandPalette.vue';
import { useRepoStore } from '@/stores/repo';
import { useTheme } from '@/composables/useTheme';
import { useGraphAnimations } from '@/composables/useGraphAnimations';
import { useI18n } from '@/i18n';

const store = useRepoStore();
const { initTheme } = useTheme();
const { initGraphAnimations } = useGraphAnimations();
const { t, initI18n } = useI18n();

// Appliquer le thème (light/dark/auto) avant le premier rendu visible.
initTheme();
// Charger la préférence d'animation + détecter prefers-reduced-motion.
initGraphAnimations();
// Charger la langue (localStorage → navigator → fr).
initI18n();

// PHASE 6 : Restaurer la session depuis localStorage avant toute interaction utilisateur.
onMounted(() => {
  store.loadFromStorage();
});
</script>

<template>
  <!-- Modales montées au niveau racine pour l'overlay -->
  <InteractiveRebaseModal />
  <ConflictEditorModal />
  <GuidedTutorialModal />
  <CommandPalette />
  <div class="layout">
    <header class="topbar">
      <span class="brand">Git Visualizer</span>
      <span class="subtitle">{{ t('app.subtitle') }}</span>
      <div class="topbar-controls">
        <LanguageSwitcher />
        <ThemeSwitcher />
      </div>
    </header>

    <main class="main">
      <section class="graph-pane">
        <GraphView />
      </section>
      <section class="terminal-pane">
        <TerminalPanel />
      </section>
    </main>

    <RefsSidebar class="sidebar-pane" />
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 1fr 260px;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    'topbar topbar'
    'main sidebar';
  height: 100vh;
}
.topbar {
  grid-area: topbar;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--topbar-bg);
  color: var(--topbar-fg);
}
.brand {
  font-weight: 700;
}
.subtitle {
  font-size: 0.8rem;
  color: #b0b6bd;
}
.topbar-controls {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.main {
  grid-area: main;
  display: grid;
  grid-template-rows: 1fr 240px;
  min-height: 0;
}
.graph-pane {
  min-height: 0;
  border-bottom: 1px solid var(--border-color);
}
.terminal-pane {
  min-height: 0;
}
.sidebar-pane {
  grid-area: sidebar;
}

/* Responsive : sous 820px, on empile graphe / terminal / sidebar verticalement
   et on laisse la page défiler (a11y + confort mobile). */
@media (max-width: 820px) {
  .layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      'topbar'
      'main'
      'sidebar';
    height: auto;
    min-height: 100vh;
  }
  .topbar {
    flex-wrap: wrap;
  }
  .subtitle {
    flex-basis: 100%;
    order: 3;
  }
  .main {
    grid-template-rows: minmax(280px, 60vh) minmax(160px, 30vh);
  }
  .sidebar-pane {
    border-left: none;
    border-top: 1px solid var(--border-color);
    max-height: none;
  }
}
</style>
