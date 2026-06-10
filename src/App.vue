<script setup lang="ts">
import { onMounted } from 'vue';
import GraphView from '@/components/GraphView.vue';
import TerminalPanel from '@/components/TerminalPanel.vue';
import RefsSidebar from '@/components/RefsSidebar.vue';
import InteractiveRebaseModal from '@/components/InteractiveRebaseModal.vue';
import ConflictEditorModal from '@/components/ConflictEditorModal.vue';
import GuidedTutorialModal from '@/components/GuidedTutorialModal.vue';
import ThemeSwitcher from '@/components/ThemeSwitcher.vue';
import { useRepoStore } from '@/stores/repo';
import { useTheme } from '@/composables/useTheme';

const store = useRepoStore();
const { initTheme } = useTheme();

// Appliquer le thème (light/dark/auto) avant le premier rendu visible.
initTheme();

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
  <div class="layout">
    <header class="topbar">
      <span class="brand">Git Visualizer</span>
      <span class="subtitle">terminal virtuel &amp; visualisation de l'arbre git</span>
      <ThemeSwitcher class="topbar-theme" />
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
.topbar-theme {
  margin-left: auto;
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
</style>
