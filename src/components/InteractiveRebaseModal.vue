<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import type { TodoItem } from '@/core/model';

const repo = useRepoStore();

// La modale est visible uniquement quand awaitingTodoEdit === true
const isVisible = computed(() => repo.snapshot.rebasingInteractive?.awaitingTodoEdit === true);

// Copie locale éditable de la todo list (jamais de mutation du snapshot gelé)
type LocalItem = { action: TodoItem['action']; commitHash: string; message: string };

const localTodo = ref<LocalItem[]>([]);

// Résultat d'erreur affiché après soumission si exitCode !== 0
const errorLines = ref<string[]>([]);
const submitted = ref(false);

// Quand la modale s'ouvre, initialise la copie locale depuis le snapshot
watch(isVisible, (visible) => {
  if (visible) {
    const raw = repo.snapshot.rebasingInteractive?.todoList ?? [];
    localTodo.value = raw.map((item) => ({
      action: item.action as TodoItem['action'],
      commitHash: item.commitHash,
      message: item.message,
    }));
    errorLines.value = [];
    submitted.value = false;
  }
}, { immediate: true });

const ACTIONS: TodoItem['action'][] = ['pick', 'reword', 'squash', 'fixup', 'drop', 'edit'];

const ACTION_LABELS: Record<TodoItem['action'], string> = {
  pick:   'pick   – rejouer le commit',
  reword: 'reword – rejouer + éditer le message',
  squash: 'squash – fusionner dans le précédent (combine les messages)',
  fixup:  'fixup  – fusionner dans le précédent (jette ce message)',
  drop:   'drop   – supprimer le commit',
  edit:   'edit   – s\'arrêter pour amender (Phase 6)',
};

function moveUp(index: number): void {
  if (index <= 0) return;
  const arr = localTodo.value;
  [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
}

function moveDown(index: number): void {
  const arr = localTodo.value;
  if (index >= arr.length - 1) return;
  [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
}

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

// L'action reword (ou squash/fixup) rend le champ message éditable
function isMessageEditable(action: TodoItem['action']): boolean {
  return action === 'reword' || action === 'squash' || action === 'fixup';
}

async function submitTodo(): Promise<void> {
  submitted.value = true;
  errorLines.value = [];

  const todoList: TodoItem[] = localTodo.value.map((item) => ({
    action: item.action,
    commitHash: item.commitHash,
    message: item.message,
  }));

  const result = repo.executeRebaseTodo(todoList);

  if (result.exitCode !== 0) {
    errorLines.value = [...result.errors, ...result.output];
    submitted.value = false;
  }
  // Si exitCode === 0, le snapshot est mis à jour par le store et
  // isVisible redevient false automatiquement (awaitingTodoEdit === false).
}

function abortRebase(): void {
  repo.execute('git rebase --abort');
  errorLines.value = [];
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isVisible" class="modal-overlay" role="dialog" aria-modal="true" aria-label="Rebase interactif">
      <div class="modal-panel">
        <header class="modal-header">
          <h2 class="modal-title">Rebase interactif — édition de la todo list</h2>
        </header>

        <!-- Aide rapide -->
        <details class="help-block">
          <summary>Aide — signification des actions</summary>
          <ul class="help-list">
            <li v-for="action in ACTIONS" :key="action">
              <code class="action-code">{{ action }}</code> — {{ ACTION_LABELS[action].split(' – ')[1] }}
            </li>
          </ul>
          <p class="help-note">
            Réordonnez les lignes avec les boutons ↑ / ↓. Le commit le plus ancien est en haut.
            <code>squash</code> et <code>fixup</code> ne peuvent pas être la première action.
          </p>
        </details>

        <!-- Liste des commits -->
        <div class="todo-list" role="list">
          <div
            v-for="(item, idx) in localTodo"
            :key="item.commitHash"
            class="todo-row"
            :class="{ 'action-drop': item.action === 'drop' }"
            role="listitem"
          >
            <!-- Sélecteur d'action -->
            <select
              v-model="item.action"
              class="action-select"
              :aria-label="`Action pour le commit ${shortHash(item.commitHash)}`"
            >
              <option v-for="a in ACTIONS" :key="a" :value="a">{{ a }}</option>
            </select>

            <!-- Hash court -->
            <code class="commit-hash">{{ shortHash(item.commitHash) }}</code>

            <!-- Message (en lecture seule sauf si éditable) -->
            <input
              v-if="isMessageEditable(item.action)"
              v-model="item.message"
              type="text"
              class="message-input message-editable"
              :aria-label="`Message du commit ${shortHash(item.commitHash)}`"
            />
            <span v-else class="message-input message-readonly">{{ item.message }}</span>

            <!-- Boutons de réordonnancement -->
            <div class="order-buttons">
              <button
                class="btn-icon"
                :disabled="idx === 0"
                :aria-label="`Monter le commit ${shortHash(item.commitHash)}`"
                @click="moveUp(idx)"
              >↑</button>
              <button
                class="btn-icon"
                :disabled="idx === localTodo.length - 1"
                :aria-label="`Descendre le commit ${shortHash(item.commitHash)}`"
                @click="moveDown(idx)"
              >↓</button>
            </div>
          </div>

          <p v-if="localTodo.length === 0" class="empty-list">
            Aucun commit dans la todo list.
          </p>
        </div>

        <!-- Affichage des erreurs moteur -->
        <div v-if="errorLines.length > 0" class="error-block" role="alert">
          <p class="error-title">Erreur :</p>
          <pre v-for="(line, i) in errorLines" :key="i" class="error-line">{{ line }}</pre>
        </div>

        <!-- Actions principales -->
        <footer class="modal-footer">
          <button
            class="btn btn-primary"
            :disabled="submitted"
            @click="submitTodo"
          >
            Démarrer le rebase
          </button>
          <button class="btn btn-secondary" @click="abortRebase">
            Annuler (git rebase --abort)
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Overlay plein écran */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

/* Panneau principal */
.modal-panel {
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  width: 100%;
  max-width: 720px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* En-tête */
.modal-header {
  padding: 16px 20px 12px;
  border-bottom: 1px solid #ddd;
  flex-shrink: 0;
}

.modal-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #24292e;
}

/* Aide */
.help-block {
  padding: 10px 20px;
  border-bottom: 1px solid #eee;
  font-size: 0.78rem;
  color: #555;
  flex-shrink: 0;
}

.help-block summary {
  cursor: pointer;
  font-weight: 600;
  color: #0366d6;
}

.help-list {
  margin: 8px 0 4px 16px;
  padding: 0;
  list-style: disc;
}

.help-list li {
  margin: 2px 0;
}

.help-note {
  margin: 6px 0 0;
  font-style: italic;
}

.action-code {
  font-family: ui-monospace, monospace;
  background: #f0f0f0;
  padding: 1px 4px;
  border-radius: 3px;
}

/* Liste des commits */
.todo-list {
  overflow-y: auto;
  flex: 1;
  padding: 8px 20px;
}

.todo-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 4px;
  border-bottom: 1px solid #f0f0f0;
  min-height: 34px;
}

.todo-row.action-drop {
  opacity: 0.45;
}

.action-select {
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  padding: 2px 4px;
  border: 1px solid #ccc;
  border-radius: 3px;
  background: #fafafa;
  width: 80px;
  flex-shrink: 0;
}

.commit-hash {
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  color: #0366d6;
  width: 56px;
  flex-shrink: 0;
}

.message-input {
  flex: 1;
  font-size: 0.85rem;
  font-family: ui-monospace, monospace;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-editable {
  padding: 2px 6px;
  border: 1px solid #ccc;
  border-radius: 3px;
  background: #fff;
  color: #24292e;
}

.message-editable:focus {
  outline: 2px solid #0366d6;
  outline-offset: 1px;
}

.message-readonly {
  display: block;
  padding: 2px 6px;
  color: #555;
  border: 1px solid transparent;
}

.order-buttons {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.btn-icon {
  background: none;
  border: 1px solid #ccc;
  border-radius: 3px;
  width: 22px;
  height: 18px;
  font-size: 0.7rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: #555;
  line-height: 1;
}

.btn-icon:disabled {
  opacity: 0.3;
  cursor: default;
}

.btn-icon:not(:disabled):hover {
  background: #e8f0fe;
  border-color: #0366d6;
  color: #0366d6;
}

.empty-list {
  color: #aaa;
  font-size: 0.85rem;
  text-align: center;
  padding: 20px 0;
}

/* Erreurs */
.error-block {
  padding: 10px 20px;
  background: #fff8f8;
  border-top: 1px solid #f5c6cb;
  flex-shrink: 0;
}

.error-title {
  margin: 0 0 4px;
  font-weight: 700;
  color: #c0392b;
  font-size: 0.85rem;
}

.error-line {
  margin: 2px 0;
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  color: #c0392b;
  white-space: pre-wrap;
  word-break: break-all;
}

/* Pied de page */
.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid #ddd;
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.btn {
  padding: 7px 14px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn-primary {
  background: #2ea44f;
  color: #fff;
  border-color: #2c974b;
}

.btn-primary:not(:disabled):hover {
  background: #2c974b;
}

.btn-secondary {
  background: #fafbfc;
  color: #c0392b;
  border-color: #e4a09a;
}

.btn-secondary:hover {
  background: #fff0ee;
  border-color: #c0392b;
}
</style>
