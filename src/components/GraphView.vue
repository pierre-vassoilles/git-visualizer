<script setup lang="ts">
// Placeholder phase 0. Le rendu SVG du DAG (layout topo + lanes + couleurs)
// arrive en phase 3, piloté par le store.
import { useRepoStore } from '@/stores/repo';

const repo = useRepoStore();
</script>

<template>
  <div class="graph-view">
    <div class="graph-placeholder">
      <p class="title">Graphe Git</p>
      <p class="hint">
        La visualisation de l'arbre apparaîtra ici (phase 3).<br />
        Commandes exécutées : {{ repo.log.length }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.graph-view {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
  overflow: auto;
}
.graph-placeholder {
  text-align: center;
  color: #888;
}
.title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #555;
}
.hint {
  font-size: 0.85rem;
}
</style>
