<script setup lang="ts">
// Placeholder phase 0. Affichera branches / tags / HEAD en phase 2-3.
import { useRepoStore } from '@/stores/repo';

const repo = useRepoStore();
</script>

<template>
  <aside class="refs-sidebar">
    <h2>Références</h2>
    <p class="muted">branches / tags / HEAD (phase 2)</p>

    <!-- Phase 5 : stash count -->
    <template v-if="repo.snapshot.stashCount && repo.snapshot.stashCount > 0">
      <h2>Stash</h2>
      <p class="stash-count">{{ repo.snapshot.stashCount }} entrée{{ repo.snapshot.stashCount > 1 ? 's' : '' }} en stash</p>
    </template>

    <h2>Historique</h2>
    <ul class="history">
      <li v-for="(cmd, i) in repo.history" :key="i">{{ cmd }}</li>
      <li v-if="repo.history.length === 0" class="muted">aucune commande</li>
    </ul>
  </aside>
</template>

<style scoped>
.refs-sidebar {
  padding: 12px;
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  background: #f3f3f3;
  border-left: 1px solid #ddd;
}
h2 {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #666;
  margin: 16px 0 6px;
}
.history {
  list-style: none;
  margin: 0;
  padding: 0;
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
}
.history li {
  padding: 2px 0;
  border-bottom: 1px solid #e5e5e5;
  word-break: break-all;
}
.muted {
  color: #aaa;
  font-size: 0.8rem;
}
.stash-count {
  font-size: 0.8rem;
  font-family: ui-monospace, monospace;
  color: #6f42c1;
  margin: 0;
  padding: 2px 0;
}
</style>
