/**
 * Internationalisation de l'UI (spec 55).
 *
 * - `t(key, params?)` : traduction réactive, fallback EN puis la clé brute.
 * - `setLocale` / persistance localStorage (`i18n.locale`).
 * - État partagé au niveau module (singleton) → tous les composants se
 *   rafraîchissent au changement de langue (ref réactif).
 *
 * Frontière stricte : le moteur Git n'est jamais localisé. Les messages
 * d'erreur (`CommandResult.fail`) restent en anglais, fidèles au vrai git ;
 * la locale n'affecte ni les hashes ni l'état du moteur (déterminisme préservé).
 */
import { computed, ref } from 'vue';
import type { MessageKey } from './messages';
import frMessages from './locales/fr.json';
import enMessages from './locales/en.json';

export type Locale = 'fr' | 'en';

const STORAGE_KEY = 'i18n.locale';

const dictionaries: Record<Locale, Record<string, string>> = {
  fr: frMessages,
  en: enMessages,
};

const currentLocale = ref<Locale>('fr');

/** Remplace les `{param}` par leurs valeurs dans un message. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/**
 * Traduit une clé dans la locale courante.
 * Fallback : locale courante → anglais → la clé elle-même (jamais d'exception).
 */
function translate(key: MessageKey, params?: Record<string, string | number>): string {
  const raw = dictionaries[currentLocale.value][key] ?? dictionaries.en[key] ?? (key as string);
  return interpolate(raw, params);
}

function setLocale(locale: Locale): void {
  currentLocale.value = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // localStorage indisponible : on continue sans persistance.
  }
}

let initialized = false;

export function initI18n(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  if (saved === 'fr' || saved === 'en') {
    currentLocale.value = saved;
  } else if (typeof navigator !== 'undefined' && navigator.language) {
    currentLocale.value = navigator.language.startsWith('en') ? 'en' : 'fr';
  }

  // Synchronisation multi-onglet (optionnel spec §8).
  if (!initialized && typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'fr' || e.newValue === 'en')) {
        currentLocale.value = e.newValue;
      }
    });
  }
  initialized = true;
}

export function useI18n() {
  return {
    /** Traduction réactive (utiliser `t(...)` directement dans les templates). */
    t: (key: MessageKey, params?: Record<string, string | number>) => translate(key, params),
    locale: computed(() => currentLocale.value),
    setLocale,
    getLocale: (): Locale => currentLocale.value,
    initI18n,
  };
}
