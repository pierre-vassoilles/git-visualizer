<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useRepoStore } from '@/stores/repo';
import { autocomplete, replaceLastToken } from '@/utils/autocomplete';
import { splitCommandChain } from '@/utils/shell';

// Séquence ANSI pour effacer l'écran + le scrollback puis ramener le curseur en haut.
const CLEAR_SCREEN = '\x1b[2J\x1b[3J\x1b[H';

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

/**
 * Colorise une ligne de sortie façon visualiseur de diff (git diff / git show) :
 * vert pour les ajouts, rouge pour les suppressions, cyan pour les en-têtes de
 * hunk, gris pour les en-têtes de fichier. Les lignes non-diff sont inchangées.
 */
function colorizeDiffLine(line: string): string {
  const RESET = '\x1b[0m';
  if (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('new file') ||
    line.startsWith('deleted file') ||
    line.startsWith('Binary files') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ')
  ) {
    return `\x1b[2m${line}${RESET}`; // gris (en-tête)
  }
  if (line.startsWith('@@')) return `\x1b[36m${line}${RESET}`; // cyan (hunk)
  if (line.startsWith('+')) return `\x1b[32m${line}${RESET}`; // vert (ajout)
  if (line.startsWith('-')) return `\x1b[31m${line}${RESET}`; // rouge (suppression)
  return line;
}

/**
 * Exécute la ligne courante, en gérant le chaînage de commandes :
 * - `;`  : exécute la commande suivante quoi qu'il arrive.
 * - `&&` : exécute la suivante uniquement si la précédente a réussi (exitCode 0).
 * Le builtin `clear` (effacement de l'écran) est traité ici, côté terminal.
 */
function runCurrentLine(): void {
  const line = current;
  current = '';
  histIndex = -1;
  write('\r\n');

  let lastOk = true;
  for (const segment of splitCommandChain(line)) {
    const command = segment.command.trim();
    if (command === '') continue;
    // Court-circuit du `&&` : on saute si la précédente a échoué.
    if (segment.operator === '&&' && !lastOk) continue;

    if (command === 'clear') {
      write(CLEAR_SCREEN);
      lastOk = true;
      continue;
    }

    const result = repo.execute(command);
    for (const out of result.output) {
      write(`${colorizeDiffLine(out)}\r\n`);
    }
    for (const err of result.errors) {
      // Rouge ANSI pour stderr.
      write(`\x1b[31m${err}\x1b[0m\r\n`);
    }
    lastOk = result.exitCode === 0;
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

/**
 * Gestion de la touche Tab : autocomplétion basée sur le catalogue du moteur.
 *
 * - 0 candidat : ne fait rien.
 * - 1 candidat : remplace le dernier token par le candidat complet (casse
 *   préservée : `fe` → `Feature`).
 * - N candidats : affiche la liste en dessous du prompt (ANSI cyan), puis
 *   réaffiche le prompt + la ligne courante intacte.
 */
function handleTab(): void {
  const catalog = repo.getCatalog();
  // Autocomplète le DERNIER segment d'une éventuelle chaîne (`a && b`, `a ; b`),
  // le suffixe renvoyé restant valide pour un simple append sur la ligne courante.
  const segments = splitCommandChain(current);
  const lastSegment = segments[segments.length - 1]?.command.replace(/^\s+/, '') ?? current;
  const result = autocomplete(lastSegment, catalog, repo.snapshot);

  if (result.candidates.length === 0) {
    // Rien à proposer — ne rien faire
    return;
  }

  if (result.candidates.length === 1) {
    // Complétion unique : remplacer le dernier token par le candidat complet
    // (préserve la casse du candidat, pas celle tapée par l'utilisateur).
    const newLine = replaceLastToken(current, result.completion);
    replaceLine(newLine);
    return;
  }

  // Plusieurs candidats : afficher la liste, puis réafficher prompt + ligne
  write('\r\n');
  write('\x1b[36m' + result.candidates.join('  ') + '\x1b[0m\r\n');
  write(PROMPT + current);
}

function onData(data: string): void {
  switch (data) {
    case '\r': // Entrée
      runCurrentLine();
      break;
    case '	': // Tab
      handleTab();
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
  write("Tapez une commande git (ex. \x1b[36mgit init\x1b[0m). \x1b[2mTab\x1b[0m = autocomplétion, \x1b[2mgit help\x1b[0m = aide.\r\n");
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
