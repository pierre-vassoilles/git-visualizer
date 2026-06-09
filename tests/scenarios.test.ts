/**
 * Tests Phase 6 : Scénarios préchargés
 * Spec : docs/specs/32-scenarios.md
 *
 * Principe : tests dérivés des spécifications (CA numérotés).
 * Les scénarios sont rejoués headless via engine.execute() (pas le store).
 */

import { describe, it, expect } from 'vitest';
import { newEngine } from './helpers';
import { SCENARIOS, getScenarioById, getAllScenarios, getScenariosByCategory } from '@/constants/scenarios';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

/**
 * Rejoue un scénario entier en ignorant les erreurs (pour les scénarios
 * qui incluent volontairement des commandes en conflit).
 */
function replayScenario(commands: string[]) {
  const engine = newEngine();
  for (const cmd of commands) {
    engine.execute(cmd);
  }
  return engine;
}

// ---------------------------------------------------------------------------
// CA-scenarios-01 : Structure du catalogue
// ---------------------------------------------------------------------------

describe('scenarios — CA-scenarios-01 : catalogue accessible et structuré', () => {
  it('CA-scenarios-01 : SCENARIOS n\'est pas vide', () => {
    expect(SCENARIOS.length).toBeGreaterThan(0);
  });

  it('CA-scenarios-01 : chaque scénario a les champs requis (id, title, description, category, difficulty, commands)', () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.id, `id manquant`).toBeTruthy();
      expect(scenario.title, `title manquant pour ${scenario.id}`).toBeTruthy();
      expect(scenario.description, `description manquante pour ${scenario.id}`).toBeTruthy();
      expect(scenario.category, `category manquante pour ${scenario.id}`).toBeTruthy();
      expect(Array.isArray(scenario.commands), `commands non-tableau pour ${scenario.id}`).toBe(true);
      expect(scenario.commands.length, `commands vide pour ${scenario.id}`).toBeGreaterThan(0);
    }
  });

  it('CA-scenarios-01 : getScenariosByCategory("Branches") retourne au moins 1 scénario', () => {
    const branchScenarios = getScenariosByCategory('Branches');
    expect(branchScenarios.length).toBeGreaterThanOrEqual(1);
  });

  it('CA-scenarios-01 : scénario Branches a tous les champs requis', () => {
    const branchScenarios = getScenariosByCategory('Branches');
    for (const s of branchScenarios) {
      expect(s.id).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(Array.isArray(s.commands)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// CA-scenarios-03 : État après charge de branch-merge
// ---------------------------------------------------------------------------

describe('scenarios — CA-scenarios-03 : branch-merge — état final', () => {
  it('CA-scenarios-03 : scénario "branch-merge" existe', () => {
    const scenario = getScenarioById('branch-merge');
    expect(scenario).not.toBeNull();
  });

  it('CA-scenarios-03 : après rejeu — snapshot.branches contient "main"', () => {
    const scenario = getScenarioById('branch-merge')!;
    const engine = replayScenario(scenario.commands);
    const snap = engine.snapshot();
    expect(Object.keys(snap.branches)).toContain('main');
  });

  it('CA-scenarios-03 : après rejeu — snapshot.branches contient "feature"', () => {
    const scenario = getScenarioById('branch-merge')!;
    const engine = replayScenario(scenario.commands);
    const snap = engine.snapshot();
    expect(Object.keys(snap.branches)).toContain('feature');
  });

  it('CA-scenarios-03 : après rejeu — au moins 2 commits', () => {
    const scenario = getScenarioById('branch-merge')!;
    const engine = replayScenario(scenario.commands);
    const snap = engine.snapshot();
    const allCommits = snap.allCommits ?? snap.commits;
    expect(allCommits.length).toBeGreaterThanOrEqual(2);
  });

  it('CA-scenarios-03 : après rejeu — pas d\'opération en cours', () => {
    const scenario = getScenarioById('branch-merge')!;
    const engine = replayScenario(scenario.commands);
    const snap = engine.snapshot();
    expect(snap.operationState).toBeFalsy();
  });

  it('CA-scenarios-03 : après rejeu — HEAD sur "main"', () => {
    const scenario = getScenarioById('branch-merge')!;
    const engine = replayScenario(scenario.commands);
    const snap = engine.snapshot();
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') {
      expect(snap.head.name).toBe('main');
    }
  });
});

// ---------------------------------------------------------------------------
// CA-scenarios-04 : Conflit de merge — opération en cours au milieu
// ---------------------------------------------------------------------------

describe('scenarios — CA-scenarios-04 : merge-conflict — conflit visible au merge', () => {
  it('CA-scenarios-04 : scénario "merge-conflict" existe', () => {
    const scenario = getScenarioById('merge-conflict');
    expect(scenario).not.toBeNull();
  });

  it('CA-scenarios-04 : en s\'arrêtant au merge — operationState.type === "merging"', () => {
    const scenario = getScenarioById('merge-conflict')!;
    // Rejouer jusqu'à la commande de merge (incluse) mais avant la résolution
    // Le merge est la commande qui échoue avec un conflit
    // On cherche l'index du merge dans la séquence
    const mergeIdx = scenario.commands.findIndex(cmd => cmd.startsWith('git merge'));
    expect(mergeIdx).toBeGreaterThanOrEqual(0);

    const engine = newEngine();
    for (let i = 0; i <= mergeIdx; i++) {
      engine.execute(scenario.commands[i]!);
    }
    const snap = engine.snapshot();
    expect(snap.operationState?.type).toBe('merging');
  });

  it('CA-scenarios-04 : après rejeu complet — conflit résolu (pas d\'operationState)', () => {
    const scenario = getScenarioById('merge-conflict')!;
    const engine = replayScenario(scenario.commands);
    const snap = engine.snapshot();
    expect(snap.operationState).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// CA-scenarios-06 : Déterminisme du scénario cherry-pick-tag
// ---------------------------------------------------------------------------

describe('scenarios — CA-scenarios-06 : déterminisme cherry-pick-tag', () => {
  it('CA-scenarios-06 : deux rejeux donnent des snapshots identiques (mêmes hashes)', () => {
    const scenario = getScenarioById('cherry-pick-tag')!;
    const e1 = replayScenario(scenario.commands);
    const e2 = replayScenario(scenario.commands);
    const snap1 = e1.snapshot();
    const snap2 = e2.snapshot();

    // Mêmes commits
    const commits1 = (snap1.allCommits ?? snap1.commits).map(c => c.hash).sort();
    const commits2 = (snap2.allCommits ?? snap2.commits).map(c => c.hash).sort();
    expect(commits1).toEqual(commits2);

    // Mêmes branches
    expect(Object.keys(snap1.branches).sort()).toEqual(Object.keys(snap2.branches).sort());

    // Mêmes tags
    expect(snap1.tags).toEqual(snap2.tags);
  });
});

// ---------------------------------------------------------------------------
// CA-scenarios-08 : Catégories du catalogue
// ---------------------------------------------------------------------------

describe('scenarios — CA-scenarios-08 : catégories présentes', () => {
  it('CA-scenarios-08 : getAllScenarios() retourne au moins 5 scénarios', () => {
    const all = getAllScenarios();
    expect(all.length).toBeGreaterThanOrEqual(5);
  });

  it('CA-scenarios-08 : au moins 3 catégories différentes', () => {
    const all = getAllScenarios();
    const categories = new Set(all.map(s => s.category));
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });

  it('CA-scenarios-08 : catégories incluent au moins "Branches", "Fusion", "Réécriture"', () => {
    const all = getAllScenarios();
    const categories = new Set(all.map(s => s.category));
    expect(categories.has('Branches')).toBe(true);
    expect(categories.has('Fusion')).toBe(true);
    expect(categories.has('Réécriture') || categories.has('Réparation') || categories.has('Réécriture')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-scenarios-09 : Difficulté des scénarios
// ---------------------------------------------------------------------------

describe('scenarios — CA-scenarios-09 : champ difficulty valide', () => {
  it('CA-scenarios-09 : tous les scénarios ont difficulty ∈ {1, 2, 3}', () => {
    for (const scenario of SCENARIOS) {
      expect([1, 2, 3], `difficulty invalide pour ${scenario.id}`).toContain(scenario.difficulty);
    }
  });

  it('CA-scenarios-09 : "branch-merge" a difficulty === 1 (facile)', () => {
    const scenario = getScenarioById('branch-merge')!;
    expect(scenario.difficulty).toBe(1);
  });

  it('CA-scenarios-09 : "merge-conflict" a difficulty >= 2 (moyen ou difficile)', () => {
    const scenario = getScenarioById('merge-conflict')!;
    expect(scenario.difficulty).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// CA-scenarios-11 : Tags dans cherry-pick-tag
// ---------------------------------------------------------------------------

describe('scenarios — CA-scenarios-11 : cherry-pick-tag — tags présents', () => {
  it('CA-scenarios-11 : scénario "cherry-pick-tag" existe', () => {
    const scenario = getScenarioById('cherry-pick-tag');
    expect(scenario).not.toBeNull();
  });

  it('CA-scenarios-11 : après rejeu — tags contient "v1.0"', () => {
    const scenario = getScenarioById('cherry-pick-tag')!;
    const engine = replayScenario(scenario.commands);
    const snap = engine.snapshot();
    expect(Object.keys(snap.tags)).toContain('v1.0');
  });

  it('CA-scenarios-11 : après rejeu — tags contient "feature-tip"', () => {
    const scenario = getScenarioById('cherry-pick-tag')!;
    const engine = replayScenario(scenario.commands);
    const snap = engine.snapshot();
    expect(Object.keys(snap.tags)).toContain('feature-tip');
  });

  it('CA-scenarios-11 : chaque tag pointe sur un commit connu', () => {
    const scenario = getScenarioById('cherry-pick-tag')!;
    const engine = replayScenario(scenario.commands);
    const snap = engine.snapshot();
    const allHashes = new Set(
      (snap.allCommits ?? snap.commits).map(c => c.hash)
    );
    for (const [tagName, tagHash] of Object.entries(snap.tags)) {
      expect(allHashes.has(tagHash), `tag "${tagName}" pointe sur un hash inconnu`).toBe(true);
    }
  });
});
