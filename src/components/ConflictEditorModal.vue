<script setup lang="ts">
/**
 * Éditeur de résolution de conflits 3-way (spec 50).
 *
 * Aucune logique Git ici : le composant lit l'état via le store (snapshot,
 * getConflictSections) et applique les résolutions via store.resolveConflict /
 * store.execute. Tout le parsing/écriture vit dans le core.
 */
import { computed, ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';

const repo = useRepoStore();

type Choice = 'ours' | 'theirs' | 'both' | 'manual';

const op = computed(() => repo.snapshot.operationState ?? null);
const filesInConflict = computed<readonly string[]>(() => op.value?.filesInConflict ?? []);
const isVisible = computed(() => op.value !== null && filesInConflict.value.length > 0);

// Fichier courant (index borné à la liste).
const currentIndex = ref(0);
watch(filesInConflict, (files) => {
  if (currentIndex.value >= files.length) currentIndex.value = 0;
});
const currentFile = computed<string | null>(
  () => filesInConflict.value[currentIndex.value] ?? null,
);

// Sections de conflit du fichier courant (parsing délégué au core via le store).
const sections = computed(() =>
  currentFile.value ? repo.getConflictSections(currentFile.value) : [],
);
const ours = computed(() => sections.value[0]?.ours ?? '');
const theirs = computed(() => sections.value[0]?.theirs ?? '');
const hasConflict = computed(() => sections.value.length > 0);
const multipleSections = computed(() => sections.value.length > 1);

// Choix courant + prévisualisation du résultat.
const choice = ref<Choice | null>(null);
const manualText = ref('');
const editing = ref(false);

const resultPreview = computed(() => {
  switch (choice.value) {
    case 'ours':
      return ours.value;
    case 'theirs':
      return theirs.value;
    case 'both':
      return `${ours.value}\n${theirs.value}`;
    case 'manual':
      return manualText.value;
    default:
      return '';
  }
});

// Réinitialise la sélection quand on change de fichier.
watch(currentFile, () => {
  choice.value = null;
  editing.value = false;
  manualText.value = '';
});

function pick(c: Choice): void {
  choice.value = c;
  editing.value = false;
}

function startManualEdit(): void {
  // Préremplit avec la prévisualisation courante (ou ours par défaut).
  manualText.value = resultPreview.value || ours.value;
  choice.value = 'manual';
  editing.value = true;
}

function markResolved(): void {
  if (!currentFile.value || choice.value === null) return;
  repo.resolveConflict(
    currentFile.value,
    choice.value,
    choice.value === 'manual' ? manualText.value : undefined,
  );
  // Le fichier résolu quitte filesInConflict ; on revient au début de la liste.
  currentIndex.value = 0;
}

const continueCmd = computed<string | null>(() => {
  switch (op.value?.type) {
    case 'merging':
      return 'git merge --continue';
    case 'rebasing':
      return 'git rebase --continue';
    case 'cherryPicking':
      return 'git cherry-pick --continue';
    default:
      return null;
  }
});

const abortCmd = computed<string | null>(() => {
  switch (op.value?.type) {
    case 'merging':
      return 'git merge --abort';
    case 'rebasing':
      return 'git rebase --abort';
    case 'cherryPicking':
      return 'git cherry-pick --abort';
    default:
      return null;
  }
});

const canContinue = computed(() => filesInConflict.value.length === 0);

function onContinue(): void {
  if (continueCmd.value) repo.execute(continueCmd.value);
}
function onAbort(): void {
  if (abortCmd.value) repo.execute(abortCmd.value);
}

function selectFile(i: number): void {
  currentIndex.value = i;
}
</script>

<template>
  <div v-if="isVisible" class="conflict-overlay">
    <div class="conflict-modal" role="dialog" aria-label="Résolution de conflits">
      <header class="modal-header">
        <h2>Résolution de conflits</h2>
        <span class="count">{{ filesInConflict.length }} fichier(s) en conflit</span>
      </header>

      <!-- Liste des fichiers en conflit -->
      <ul class="file-list">
        <li
          v-for="(f, i) in filesInConflict"
          :key="f"
          class="file-item"
          :class="{ active: i === currentIndex }"
          @click="selectFile(i)"
        >
          {{ f }}
        </li>
      </ul>

      <div v-if="currentFile" class="file-pane">
        <p class="file-name">
          Fichier : <code>{{ currentFile }}</code>
        </p>

        <p v-if="multipleSections" class="multi-note">
          ⚠ {{ sections.length }} conflits dans ce fichier (la 1ʳᵉ section est affichée).
        </p>

        <template v-if="hasConflict">
          <!-- Panneau 3-way -->
          <div class="three-way">
            <div class="col col-ours">
              <div class="col-head">OURS (local)</div>
              <pre>{{ ours }}</pre>
            </div>
            <div class="col col-theirs">
              <div class="col-head">THEIRS (à fusionner)</div>
              <pre>{{ theirs }}</pre>
            </div>
            <div class="col col-result">
              <div class="col-head">RÉSULTAT</div>
              <textarea v-if="editing" v-model="manualText" class="manual-edit" rows="6" />
              <pre v-else>{{ resultPreview }}</pre>
            </div>
          </div>

          <!-- Actions de résolution -->
          <div class="actions">
            <button class="btn" :class="{ sel: choice === 'ours' }" @click="pick('ours')">
              Garder ours
            </button>
            <button class="btn" :class="{ sel: choice === 'theirs' }" @click="pick('theirs')">
              Garder theirs
            </button>
            <button class="btn" :class="{ sel: choice === 'both' }" @click="pick('both')">
              Garder les deux
            </button>
            <button class="btn" :class="{ sel: editing }" @click="startManualEdit">
              Éditer manuellement
            </button>
          </div>
        </template>

        <p v-else class="no-conflict">Pas de conflit détecté dans ce fichier.</p>

        <div class="resolve-row">
          <button class="btn btn-resolve" :disabled="choice === null" @click="markResolved">
            Marquer résolu
          </button>
        </div>
      </div>

      <div v-else class="all-resolved">Tous les conflits sont résolus.</div>

      <footer class="modal-footer">
        <button class="btn btn-continue" :disabled="!canContinue" @click="onContinue">
          Continuer
        </button>
        <button class="btn btn-abort" @click="onAbort">Annuler l'opération</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.conflict-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg, rgba(0, 0, 0, 0.5));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.conflict-modal {
  background: var(--surface-bg, #fff);
  color: var(--surface-fg, #24292e);
  border-radius: 8px;
  width: min(900px, 92vw);
  max-height: 88vh;
  overflow: auto;
  padding: 16px 20px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  font-family: ui-monospace, monospace;
}
.modal-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 1px solid #eee;
  padding-bottom: 8px;
}
.modal-header h2 {
  font-size: 1.05rem;
  margin: 0;
}
.count {
  font-size: 0.75rem;
  color: #b45309;
}
.file-list {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 0;
  margin: 0;
}
.file-item {
  padding: 2px 8px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 0.75rem;
  cursor: pointer;
}
.file-item.active {
  background: #24292e;
  color: #fff;
  border-color: #24292e;
}
.file-name {
  font-size: 0.8rem;
}
.multi-note {
  font-size: 0.72rem;
  color: #b45309;
}
.three-way {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin: 8px 0;
}
.col {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  min-width: 0;
}
.col-head {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 3px 6px;
  background: #f3f4f6;
  border-bottom: 1px solid #e0e0e0;
}
.col-ours .col-head {
  color: #16a34a;
}
.col-theirs .col-head {
  color: #2563eb;
}
.col pre {
  margin: 0;
  padding: 6px;
  font-size: 0.72rem;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 40px;
}
.manual-edit {
  width: 100%;
  box-sizing: border-box;
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  border: none;
  padding: 6px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.btn {
  padding: 4px 10px;
  font-size: 0.74rem;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 3px;
  cursor: pointer;
  font-family: ui-monospace, monospace;
}
.btn:hover:not(:disabled) {
  background: #eef;
}
.btn.sel {
  background: #24292e;
  color: #fff;
  border-color: #24292e;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.resolve-row {
  margin: 6px 0;
}
.btn-resolve {
  background: #16a34a;
  color: #fff;
  border-color: #16a34a;
}
.no-conflict,
.all-resolved {
  font-size: 0.85rem;
  color: #555;
  padding: 12px 0;
}
.modal-footer {
  display: flex;
  gap: 8px;
  border-top: 1px solid #eee;
  padding-top: 10px;
  margin-top: 8px;
}
.btn-continue {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}
.btn-abort {
  background: #fee2e2;
  color: #b91c1c;
  border-color: #fca5a5;
}
</style>
