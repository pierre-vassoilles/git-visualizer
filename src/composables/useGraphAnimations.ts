/**
 * Composable de gestion des animations de transition du graphe (spec 52).
 *
 * - `enabled` : l'utilisateur peut activer/désactiver les animations.
 * - Respecte `prefers-reduced-motion: reduce` → animations désactivées d'office.
 * - Persisté dans localStorage (`graph-animations`).
 *
 * État partagé au niveau module (singleton). Aucun impact sur le moteur Git :
 * les animations interpolent côté UI entre deux snapshots de layout déjà
 * calculés par `computeLayout` (qui reste pur et déterministe).
 */
import { computed, ref } from 'vue';

const STORAGE_KEY = 'graph-animations';

/** Préférence explicite de l'utilisateur (par défaut : activé). */
const userEnabled = ref(true);
/** L'OS demande de réduire les animations. */
const reducedMotion = ref(false);

/** Animations effectivement actives (préférence ET pas de reduced-motion). */
const animationsActive = computed(() => userEnabled.value && !reducedMotion.value);

function setEnabled(enabled: boolean): void {
  userEnabled.value = enabled;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // localStorage indisponible : on continue sans persistance.
  }
}

let initialized = false;

function initGraphAnimations(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  if (saved === '0') userEnabled.value = false;
  else if (saved === '1') userEnabled.value = true;

  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion.value = mq.matches;
    if (!initialized) {
      mq.addEventListener('change', (e) => {
        reducedMotion.value = e.matches;
      });
    }
  }
  initialized = true;
}

export function useGraphAnimations() {
  return {
    userEnabled: computed(() => userEnabled.value),
    reducedMotion: computed(() => reducedMotion.value),
    animationsActive,
    setEnabled,
    initGraphAnimations,
  };
}

/**
 * Interpolation linéaire entre deux valeurs. `t` clampé sur [0, 1].
 * Fonction pure (testable headless).
 */
export function lerp(from: number, to: number, t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return from + (to - from) * clamped;
}

/**
 * Easing `ease-out` cubique (décélération). Pure, testable.
 * easeOut(0) = 0, easeOut(1) = 1, dérivée décroissante.
 */
export function easeOutCubic(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const inv = 1 - clamped;
  return 1 - inv * inv * inv;
}
