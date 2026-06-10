import { describe, it, expect, beforeEach } from 'vitest';
import { useI18n } from '@/i18n';
import { MESSAGE_KEYS } from '@/i18n/messages';
import frMessages from '@/i18n/locales/fr.json';
import enMessages from '@/i18n/locales/en.json';

describe('i18n (spec 55)', () => {
  beforeEach(() => {
    // État partagé (singleton) : repartir du français entre les tests.
    useI18n().setLocale('fr');
  });

  describe('CA-i18n-02 / CA-i18n-12 : parité FR/EN', () => {
    it('fr.json et en.json couvrent exactement MESSAGE_KEYS', () => {
      const keys = [...MESSAGE_KEYS].sort();
      expect(Object.keys(frMessages).sort()).toEqual(keys);
      expect(Object.keys(enMessages).sort()).toEqual(keys);
    });

    it('aucune valeur vide', () => {
      for (const v of Object.values(frMessages)) expect(v).not.toBe('');
      for (const v of Object.values(enMessages)) expect(v).not.toBe('');
    });
  });

  describe('CA-i18n-03 : traduction réactive selon la locale', () => {
    it('renvoie le français par défaut', () => {
      const { t } = useI18n();
      expect(t('sidebar.recentCommands')).toBe('Commandes récentes');
    });

    it('bascule en anglais après setLocale', () => {
      const { t, setLocale, getLocale } = useI18n();
      setLocale('en');
      expect(getLocale()).toBe('en');
      expect(t('sidebar.recentCommands')).toBe('Recent commands');
    });
  });

  describe('CA-i18n-04 : persistance localStorage', () => {
    it('écrit la locale dans localStorage', () => {
      useI18n().setLocale('en');
      expect(localStorage.getItem('i18n.locale')).toBe('en');
    });
  });

  describe('CA-i18n-09 : fallback', () => {
    it('retourne la clé brute si absente des deux dictionnaires', () => {
      const { t } = useI18n();
      // @ts-expect-error — clé volontairement invalide pour tester le fallback
      expect(t('does.not.exist')).toBe('does.not.exist');
    });
  });

  describe('interpolation de paramètres', () => {
    it('remplace {name}', () => {
      const { t } = useI18n();
      expect(t('sidebar.checkoutTitle', { name: 'feature' })).toBe('Checkout feature');
    });

    it('remplace plusieurs paramètres', () => {
      const { t } = useI18n();
      expect(t('sidebar.stepsAndDuration', { steps: 4, duration: 10 })).toBe('4 étapes · ~10 min');
    });
  });
});
