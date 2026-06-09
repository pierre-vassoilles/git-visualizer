<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useRepoStore } from '@/stores/repo';

const repo = useRepoStore();
const host = ref<HTMLDivElement | null>(null);

const PROMPT = '\x1b[32mgit-playground\x1b[0m $ ';
let term: Terminal;
let fit: FitAddon;
let current = '';
let histIndex = -1;

function write(text: string): void {
  term.write(text);
}

function runCurrentLine(): void {
  const command = current;
  current = '';
  histIndex = -1;
  write('\r\n');

  const result = repo.execute(command);
  for (const line of result.output) {
    write(`${line}\r\n`);
  }
  for (const line of result.errors) {
    // Rouge ANSI pour stderr.
    write(`\x1b[31m${line}\x1b[0m\r\n`);
  }
  // Réécrit le prompt sans saut de ligne superflu.
  write(PROMPT);
}

function replaceLine(next: string): void {
  // Efface la ligne courante puis réécrit prompt + contenu.
  write('\x1b[2K\r');
  write(PROMPT + next);
  current = next;
}

function onData(data: string): void {
  switch (data) {
    case '\r': // Entrée
      runCurrentLine();
      break;
    case '': // Backspace
      if (current.length > 0) {
        current = current.slice(0, -1);
        write('\b \b');
      }
      break;
    case '[A': // Flèche haut → historique précédent
      if (repo.history.length > 0) {
        histIndex = histIndex < 0 ? repo.history.length - 1 : Math.max(0, histIndex - 1);
        replaceLine(repo.history[histIndex]);
      }
      break;
    case '[B': // Flèche bas → historique suivant
      if (histIndex >= 0) {
        histIndex++;
        if (histIndex >= repo.history.length) {
          histIndex = -1;
          replaceLine('');
        } else {
          replaceLine(repo.history[histIndex]);
        }
      }
      break;
    default:
      // Caractères imprimables uniquement.
      if (data >= ' ' && data !== '') {
        current += data;
        write(data);
      }
  }
}

function onResize(): void {
  fit.fit();
}

onMounted(() => {
  term = new Terminal({
    cursorBlink: true,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 13,
    theme: { background: '#1e1e1e', foreground: '#d4d4d4' },
  });
  fit = new FitAddon();
  term.loadAddon(fit);
  term.open(host.value!);
  fit.fit();

  write('Git Visualizer — terminal virtuel\r\n');
  write("Tapez une commande git (le moteur arrive en phase 1).\r\n");
  write(PROMPT);

  term.onData(onData);
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  term?.dispose();
});
</script>

<template>
  <div ref="host" class="terminal-host"></div>
</template>

<style scoped>
.terminal-host {
  width: 100%;
  height: 100%;
  padding: 8px;
  background: #1e1e1e;
  box-sizing: border-box;
}
</style>
