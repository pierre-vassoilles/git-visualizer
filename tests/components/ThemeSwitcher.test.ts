/**
 * Tests composant : ThemeSwitcher.vue (spec 56).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ThemeSwitcher from '@/components/ThemeSwitcher.vue';
import { useTheme } from '@/composables/useTheme';

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    useTheme().setTheme('light');
  });

  it('rend un select avec 3 options accessibles', () => {
    const wrapper = mount(ThemeSwitcher);
    const select = wrapper.find('select');
    expect(select.exists()).toBe(true);
    expect(select.attributes('aria-label')).toBeTruthy();
    expect(wrapper.findAll('option').map((o) => o.attributes('value'))).toEqual([
      'light',
      'dark',
      'auto',
    ]);
  });

  it('CA-theme-01 : changer la valeur applique le thème', async () => {
    const wrapper = mount(ThemeSwitcher);
    const select = wrapper.find('select');
    await select.setValue('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('reflète le thème courant', () => {
    useTheme().setTheme('dark');
    const wrapper = mount(ThemeSwitcher);
    expect((wrapper.find('select').element as HTMLSelectElement).value).toBe('dark');
  });
});
