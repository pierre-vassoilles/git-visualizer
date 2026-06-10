/**
 * Tests a11y (spec 56) : présence des attributs ARIA clés (markup, pas lecteur).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import RefsSidebar from '@/components/RefsSidebar.vue';
import GraphView from '@/components/GraphView.vue';
import { useRepoStore } from '@/stores/repo';

describe('Accessibilité — attributs ARIA', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('CA-a11y : RefsSidebar a role=complementary + aria-label', () => {
    const wrapper = mount(RefsSidebar, { global: { plugins: [createPinia()] } });
    const aside = wrapper.find('aside.refs-sidebar');
    expect(aside.attributes('role')).toBe('complementary');
    expect(aside.attributes('aria-label')).toBeTruthy();
  });

  it('CA-a11y-04 : la zone HEAD est aria-live', () => {
    const store = useRepoStore();
    store.execute('git init');
    store.execute('write a.txt "x"');
    store.execute('git add a.txt');
    store.execute('git commit -m "C1"');
    const wrapper = mount(RefsSidebar, { global: { plugins: [createPinia()] } });
    const head = wrapper.find('.head-box');
    expect(head.attributes('aria-live')).toBe('polite');
  });

  it('CA-a11y-05 : GraphView a role=img + aria-label', () => {
    const wrapper = mount(GraphView, { global: { plugins: [createPinia()] } });
    const view = wrapper.find('.graph-view');
    expect(view.attributes('role')).toBe('img');
    expect(view.attributes('aria-label')).toBeTruthy();
  });
});
