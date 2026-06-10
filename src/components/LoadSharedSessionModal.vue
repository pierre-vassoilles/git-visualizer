<script setup lang="ts">
/**
 * Modale de chargement d'une session partagée (spec 59).
 *
 * Visible quand `repo.pendingSharedSession` est non-null (posé par App.vue au
 * boot si un fragment #session= est détecté dans l'URL).
 *
 * Aucune logique git ni d'encodage ici : tout passe par le store.
 */
import { computed } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useI18n } from '@/i18n';

const repo = useRepoStore();
const { t } = useI18n();

const session = computed(() => repo.pendingSharedSession);

const commandCount = computed(() => session.value?.commands.length ?? 0);

const exportDate = computed(() => {
  const ts = session.value?.metadata.exportDate;
  if (!ts) return '';
  return new Date(ts).toLocaleDateString();
});

const description = computed(() => session.value?.metadata.description ?? null);

function onLoad(): void {
  if (!session.value) return;
  repo.importSession(session.value);
  repo.pendingSharedSession = null;
  // Nettoie le fragment de l'URL sans recharger la page.
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

function onCancel(): void {
  repo.pendingSharedSession = null;
  repo.loadFromStorage();
}
</script>

<template>
  <div v-if="session !== null" class="shared-overlay">
    <div class="shared-modal" role="dialog" :aria-label="t('share.modalTitle')">
      <header class="modal-header">
        <h2>{{ t('share.modalTitle') }}</h2>
      </header>

      <div class="modal-body">
        <p class="cmd-count">{{ t('share.modalCommandCount', { count: String(commandCount) }) }}</p>
        <p class="export-date">{{ t('share.modalDate', { date: exportDate }) }}</p>
        <p v-if="description" class="description">{{ description }}</p>
        <p class="warning">{{ t('share.modalWarning') }}</p>
      </div>

      <footer class="modal-footer">
        <button class="btn btn-cancel" @click="onCancel">{{ t('share.cancel') }}</button>
        <button class="btn btn-load" @click="onLoad">{{ t('share.load') }}</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.shared-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg, rgba(0, 0, 0, 0.45));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.shared-modal {
  background: var(--surface-bg, #fff);
  color: var(--surface-fg, #24292e);
  border-radius: 8px;
  width: min(400px, 92vw);
  padding: 20px 22px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
}

.modal-header {
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
  margin-bottom: 14px;
}

.modal-header h2 {
  font-size: 1rem;
  margin: 0;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.cmd-count {
  font-weight: 600;
  margin: 0;
}

.export-date {
  color: #6b7280;
  font-size: 0.82rem;
  margin: 0;
}

.description {
  font-size: 0.82rem;
  color: #374151;
  margin: 0;
  padding: 6px 8px;
  background: var(--surface-muted-bg, #f9fafb);
  border-radius: 4px;
  border: 1px solid #e5e7eb;
}

.warning {
  font-size: 0.8rem;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 4px;
  padding: 6px 8px;
  margin: 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid #eee;
  padding-top: 12px;
}

.btn {
  padding: 5px 14px;
  font-size: 0.78rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-family: ui-monospace, monospace;
  background: #fff;
  transition: background 0.15s;
}

.btn-cancel:hover {
  background: #f1f5f9;
}

.btn-load {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.btn-load:hover {
  background: #1d4ed8;
  border-color: #1d4ed8;
}
</style>
