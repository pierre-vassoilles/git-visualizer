/**
 * Tests : palette de commandes — recherche pure (spec 57).
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';
import { fuzzyScore, searchPaletteItems, type PaletteContext } from '@/utils/commandPalette';

function ctxFrom(engine: ReturnType<typeof replay>, history: string[] = []): PaletteContext {
  return {
    catalog: engine.getCatalog(),
    snapshot: engine.snapshot(),
    history,
    scenarios: [{ id: 's1', title: 'Démo', description: 'Un scénario' }],
    tutorials: [{ id: 't1', title: 'Premier commit', description: 'Tuto' }],
  };
}

describe('fuzzyScore', () => {
  it('sous-séquence → score non null ; sinon null', () => {
    expect(fuzzyScore('com', 'commit')).not.toBeNull();
    expect(fuzzyScore('cmt', 'commit')).not.toBeNull();
    expect(fuzzyScore('zzz', 'commit')).toBeNull();
  });
  it('requête vide → 0', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });
  it('préfixe mieux noté qu’un match tardif', () => {
    const prefix = fuzzyScore('co', 'commit')!;
    const late = fuzzyScore('it', 'commit')!;
    expect(prefix).toBeLessThan(late);
  });
});

describe('searchPaletteItems', () => {
  it('requête vide → sections Commandes / Scénarios / Tutoriels / Actions', () => {
    const items = searchPaletteItems('', ctxFrom(replay(['git init'])));
    const sections = new Set(items.map((i) => i.section));
    expect(sections.has('Commandes')).toBe(true);
    expect(sections.has('Scénarios')).toBe(true);
    expect(sections.has('Tutoriels')).toBe(true);
    expect(sections.has('Actions')).toBe(true);
    expect(items.some((i) => i.kind === 'command' && i.command === 'git commit')).toBe(true);
  });

  it('requête vide → commandes récentes en tête', () => {
    const items = searchPaletteItems('', ctxFrom(replay(['git init']), ['git status', 'git log']));
    expect(items[0]!.section).toBe('Récentes');
    expect(items.some((i) => i.label === 'git log')).toBe(true);
  });

  it('requête "commit" → filtre flou, items pertinents', () => {
    const items = searchPaletteItems('commit', ctxFrom(replay(['git init'])));
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.kind === 'command' && i.command === 'git commit')).toBe(true);
  });

  it('requête sans correspondance → vide', () => {
    const items = searchPaletteItems('zzzqqq', ctxFrom(replay(['git init'])));
    expect(items.length).toBe(0);
  });

  it('suggestions contextuelles : merge en cours → --continue/--abort', () => {
    const engine = replay([
      'git init',
      'write f.txt "base"',
      'git add f.txt',
      'git commit -m "base"',
      'git checkout -b feature',
      'write f.txt "feat"',
      'git add f.txt',
      'git commit -m "feat"',
      'git checkout main',
      'write f.txt "main"',
      'git add f.txt',
      'git commit -m "main"',
      'git merge feature',
    ]);
    const items = searchPaletteItems('', ctxFrom(engine));
    const labels = items.map((i) => i.label);
    expect(labels).toContain('git merge --continue');
    expect(labels).toContain('git merge --abort');
  });

  it('action UI de bascule de thème présente', () => {
    const items = searchPaletteItems('thème', ctxFrom(replay(['git init'])));
    expect(items.some((i) => i.kind === 'ui' && i.uiAction === 'toggle-theme')).toBe(true);
  });
});
