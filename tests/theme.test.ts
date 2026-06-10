/**
 * Tests : composable useTheme (spec 56). jsdom fournit document + localStorage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useTheme } from '@/composables/useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('setTheme("dark") applique data-theme + persiste', () => {
    const { setTheme, effectiveTheme } = useTheme();
    setTheme('dark');
    expect(effectiveTheme.value).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('setTheme("light") repasse en clair', () => {
    const { setTheme, effectiveTheme } = useTheme();
    setTheme('light');
    expect(effectiveTheme.value).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('auto sans matchMedia (jsdom) → light effectif', () => {
    const { setTheme, effectiveTheme } = useTheme();
    setTheme('auto');
    expect(effectiveTheme.value).toBe('light');
  });

  it('initTheme lit le thème persisté', () => {
    localStorage.setItem('theme', 'dark');
    const { initTheme, currentTheme, effectiveTheme } = useTheme();
    initTheme();
    expect(currentTheme.value).toBe('dark');
    expect(effectiveTheme.value).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
