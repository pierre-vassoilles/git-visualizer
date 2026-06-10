/**
 * Composable de gestion du thème clair/sombre (spec 56).
 *
 * - `light` | `dark` | `auto` (suit `prefers-color-scheme`).
 * - Persisté dans localStorage (`theme`).
 * - Applique `data-theme="light|dark"` sur <html> (résolu depuis `auto`).
 *
 * État partagé au niveau module (singleton) pour que toute l'app voie le même
 * thème. Aucun impact sur le moteur Git (déterminisme préservé).
 */
import { computed, ref } from 'vue';

export type Theme = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'theme';

const currentTheme = ref<Theme>('auto');
const systemPrefersDark = ref(false);

const effectiveTheme = computed<'light' | 'dark'>(() => {
  if (currentTheme.value === 'auto') {
    return systemPrefersDark.value ? 'dark' : 'light';
  }
  return currentTheme.value;
});

function applyThemeToDOM(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', effectiveTheme.value);
}

function setTheme(theme: Theme): void {
  currentTheme.value = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage indisponible : on continue sans persistance.
  }
  applyThemeToDOM();
}

let initialized = false;

function initTheme(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  currentTheme.value = saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';

  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    systemPrefersDark.value = mq.matches;
    if (!initialized) {
      mq.addEventListener('change', (e) => {
        systemPrefersDark.value = e.matches;
        applyThemeToDOM();
      });
    }
  }
  initialized = true;
  applyThemeToDOM();
}

export function useTheme() {
  return {
    currentTheme: computed(() => currentTheme.value),
    effectiveTheme,
    setTheme,
    initTheme,
  };
}
