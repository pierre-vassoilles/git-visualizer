<script setup lang="ts">
import { onMounted } from 'vue';
import GraphView from '@/components/GraphView.vue';
import TerminalPanel from '@/components/TerminalPanel.vue';
import RefsSidebar from '@/components/RefsSidebar.vue';
import InteractiveRebaseModal from '@/components/InteractiveRebaseModal.vue';
import { useRepoStore } from '@/stores/repo';

const store = useRepoStore();

// PHASE 6 : Restaurer la session depuis localStorage avant toute interaction utilisateur.
onMounted(() => {
  store.loadFromStorage();
});
</script>

<template>
  <!-- Modale rebase interactif : montée au niveau racine pour l'overlay -->
  <InteractiveRebaseModal />
  <div class="layout">
    <header class="topbar">
      <span class="brand">Git Visualizer</span>
      <span class="subtitle">terminal virtuel &amp; visualisation de l'arbre git</span>
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
  align-items: baseline;
  gap: 12px;
  padding: 10px 16px;
  background: #24292e;
  color: #fff;
}
.brand {
  font-weight: 700;
}
.subtitle {
  font-size: 0.8rem;
  color: #b0b6bd;
}
.main {
  grid-area: main;
  display: grid;
  grid-template-rows: 1fr 240px;
  min-height: 0;
}
.graph-pane {
  min-height: 0;
  border-bottom: 1px solid #ddd;
}
.terminal-pane {
  min-height: 0;
}
.sidebar-pane {
  grid-area: sidebar;
}
</style>
