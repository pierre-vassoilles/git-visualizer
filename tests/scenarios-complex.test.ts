/**
 * Tests des scénarios complexes ajoutés (git-flow, multi-branch, feature-rebase).
 *
 * Garantie clé : ces scénarios ne contiennent AUCun conflit volontaire, donc
 * chaque commande doit se rejouer avec exitCode 0. Un échec inattendu (typo,
 * commande non supportée, conflit non prévu) ferait casser ce test.
 */
import { describe, it, expect } from 'vitest';
import { newEngine } from './helpers';
import { getScenarioById } from '@/constants/scenarios';

/** Rejoue un scénario et renvoie l'engine + la liste des commandes en échec. */
function replayStrict(commands: string[]) {
  const engine = newEngine();
  const failures: { cmd: string; errors: string[] }[] = [];
  for (const cmd of commands) {
    const result = engine.execute(cmd);
    if (result.exitCode !== 0) failures.push({ cmd, errors: result.errors });
  }
  return { engine, failures };
}

describe('scénarios complexes — rejeu sans erreur', () => {
  for (const id of ['git-flow', 'multi-branch', 'feature-rebase']) {
    it(`"${id}" : toutes les commandes réussissent (exitCode 0)`, () => {
      const scenario = getScenarioById(id)!;
      expect(scenario, `scénario ${id} introuvable`).not.toBeNull();
      const { failures } = replayStrict(scenario.commands);
      expect(failures, `commandes en échec : ${JSON.stringify(failures)}`).toHaveLength(0);
    });

    it(`"${id}" : pas d'opération en cours à la fin`, () => {
      const scenario = getScenarioById(id)!;
      const { engine } = replayStrict(scenario.commands);
      expect(engine.snapshot().operationState).toBeFalsy();
    });

    it(`"${id}" : difficulté valide et déterministe (2 rejeux identiques)`, () => {
      const scenario = getScenarioById(id)!;
      expect([1, 2, 3]).toContain(scenario.difficulty);
      const s1 = replayStrict(scenario.commands).engine.snapshot();
      const s2 = replayStrict(scenario.commands).engine.snapshot();
      const h1 = (s1.allCommits ?? s1.commits).map((c) => c.hash).sort();
      const h2 = (s2.allCommits ?? s2.commits).map((c) => c.hash).sort();
      expect(h1).toEqual(h2);
    });
  }
});

describe('git-flow — arbre attendu', () => {
  const snap = () => replayStrict(getScenarioById('git-flow')!.commands).engine.snapshot();

  it('5 branches longues + features : main, dev, staging, feat-login, feat-dashboard', () => {
    const branches = Object.keys(snap().branches).sort();
    expect(branches).toEqual(['dev', 'feat-dashboard', 'feat-login', 'main', 'staging']);
  });

  it('tag v1.0.0 présent et pointant sur un commit connu', () => {
    const s = snap();
    expect(Object.keys(s.tags)).toContain('v1.0.0');
    const hashes = new Set((s.allCommits ?? s.commits).map((c) => c.hash));
    expect(hashes.has(s.tags['v1.0.0']!)).toBe(true);
  });

  it('HEAD final sur dev', () => {
    const s = snap();
    expect(s.head.type).toBe('branch');
    if (s.head.type === 'branch') expect(s.head.name).toBe('dev');
  });

  it('contient des commits de merge (≥ 2 parents)', () => {
    const s = snap();
    const merges = (s.allCommits ?? s.commits).filter((c) => c.parents.length >= 2);
    expect(merges.length).toBeGreaterThanOrEqual(3); // login, dashboard, release, back-merge
  });
});

describe('multi-branch — fan-out', () => {
  const snap = () => replayStrict(getScenarioById('multi-branch')!.commands).engine.snapshot();

  it('4 branches : main, feature-a, feature-b, feature-c', () => {
    expect(Object.keys(snap().branches).sort()).toEqual([
      'feature-a',
      'feature-b',
      'feature-c',
      'main',
    ]);
  });

  it('aucun commit de merge (branches purement divergentes)', () => {
    const s = snap();
    const merges = (s.allCommits ?? s.commits).filter((c) => c.parents.length >= 2);
    expect(merges).toHaveLength(0);
  });

  it('8 commits au total (C1 + A1..A3 + B1..B2 + C-1 + C2)', () => {
    const s = snap();
    expect((s.allCommits ?? s.commits).length).toBe(8);
  });
});

describe('feature-rebase — réécriture puis fast-forward', () => {
  const result = () => replayStrict(getScenarioById('feature-rebase')!.commands);

  it('tag v2.0 présent', () => {
    expect(Object.keys(result().engine.snapshot().tags)).toContain('v2.0');
  });

  it('dev et feature pointent sur le même commit après la fusion ff', () => {
    const s = result().engine.snapshot();
    expect(s.branches['dev']).toBe(s.branches['feature']);
  });
});
