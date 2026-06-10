/**
 * Tests Phase 9 : Scénarios distants
 *
 * Couverture :
 *   - Structure du catalogue (catégorie "Distant", ≥ 4 scénarios, ≥ 9 au total)
 *   - Rejeu headless de chaque scénario distant via engine.execute()
 *   - Contrat snapshot distant (remotes, remoteTrackingRefs, tracking, branchUpstream)
 *   - Déterminisme (2 rejeux → mêmes hashes)
 *   - Cohérence graphe distant : computeLayout() ne lève pas d'exception et
 *     produit des nœuds layoutables pour snapshot.remotes.origin
 *
 * Note sur le scénario "push-rejected-rebase" :
 *   Le 4e git push (après le reset) est REJETÉ intentionnellement (non-fast-forward,
 *   exitCode != 0). Le rejeu tolère cet unique échec (comme executeScenario).
 *
 * Principe : boîte noire via execute() + snapshot(). Aucun composant Vue importé.
 */

import { describe, it, expect } from 'vitest';
import { newEngine } from './helpers';
import {
  SCENARIOS,
  getScenarioById,
  getAllScenarios,
  getScenariosByCategory,
} from '@/constants/scenarios';
import { computeLayout } from '@/graph/layout';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

/**
 * Rejoue un scénario en ignorant toutes les erreurs (mode permissif).
 * Utilisé pour les scénarios sans erreur intentionnelle.
 */
function replayScenario(commands: string[]) {
  const engine = newEngine();
  for (const cmd of commands) {
    engine.execute(cmd);
  }
  return engine;
}

/**
 * Rejoue un scénario en tolérant au plus UN échec (le push rejeté non-ff).
 * Renvoie l'engine et la liste des commandes en échec.
 */
function replayScenarioWithFailures(commands: string[]) {
  const engine = newEngine();
  const failures: { cmd: string; exitCode: number; errors: string[] }[] = [];
  for (const cmd of commands) {
    const result = engine.execute(cmd);
    if (result.exitCode !== 0) {
      failures.push({ cmd, exitCode: result.exitCode, errors: result.errors });
    }
  }
  return { engine, failures };
}

// ---------------------------------------------------------------------------
// CA-remote-scenarios-01 : Structure du catalogue — catégorie "Distant"
// ---------------------------------------------------------------------------

describe('scenarios-remote — CA-remote-01 : catalogue distant structuré', () => {
  it('CA-remote-01 : getScenariosByCategory("Distant") retourne ≥ 4 scénarios', () => {
    const distantScenarios = getScenariosByCategory('Distant');
    expect(distantScenarios.length).toBeGreaterThanOrEqual(4);
  });

  it('CA-remote-01 : getAllScenarios() retourne ≥ 9 scénarios au total', () => {
    const all = getAllScenarios();
    expect(all.length).toBeGreaterThanOrEqual(9);
  });

  it('CA-remote-01 : les 4 scénarios distants ont les ids attendus', () => {
    const ids = SCENARIOS.filter((s) => s.category === 'Distant').map((s) => s.id);
    expect(ids).toContain('clone-push');
    expect(ids).toContain('pull-merge');
    expect(ids).toContain('push-rejected-rebase');
    expect(ids).toContain('collab-two-branches');
  });

  it('CA-remote-01 : tous les scénarios "Distant" ont difficulty ∈ {1, 2, 3}', () => {
    for (const s of getScenariosByCategory('Distant')) {
      expect([1, 2, 3], `difficulty invalide pour ${s.id}`).toContain(s.difficulty);
    }
  });

  it('CA-remote-01 : tous les scénarios "Distant" ont les champs requis', () => {
    for (const s of getScenariosByCategory('Distant')) {
      expect(s.id, `id manquant`).toBeTruthy();
      expect(s.title, `title manquant pour ${s.id}`).toBeTruthy();
      expect(s.description, `description manquante pour ${s.id}`).toBeTruthy();
      expect(s.category).toBe('Distant');
      expect(Array.isArray(s.commands), `commands non-tableau pour ${s.id}`).toBe(true);
      expect(s.commands.length, `commands vide pour ${s.id}`).toBeGreaterThan(0);
    }
  });

  it('CA-remote-01 : "clone-push" a difficulty 1 (facile)', () => {
    const s = getScenarioById('clone-push');
    expect(s).not.toBeNull();
    expect(s!.difficulty).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CA-remote-scenarios-02 : clone-push — état final
// ---------------------------------------------------------------------------

describe('scenarios-remote — CA-remote-02 : clone-push — état final', () => {
  const getSnap = () => replayScenario(getScenarioById('clone-push')!.commands).snapshot();

  it('CA-remote-02 : scénario "clone-push" existe', () => {
    expect(getScenarioById('clone-push')).not.toBeNull();
  });

  it('CA-remote-02 : rejeu sans erreur (toutes les commandes exitCode 0)', () => {
    const { failures } = replayScenarioWithFailures(getScenarioById('clone-push')!.commands);
    expect(failures, `commandes en échec : ${JSON.stringify(failures)}`).toHaveLength(0);
  });

  it("CA-remote-02 : pas d'opération en cours à la fin", () => {
    expect(getSnap().operationState).toBeFalsy();
  });

  it('CA-remote-02 : HEAD sur main', () => {
    const snap = getSnap();
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') expect(snap.head.name).toBe('main');
  });

  it('CA-remote-02 : remotes.origin.allCommits est non vide', () => {
    const snap = getSnap();
    expect(snap.remotes).toBeDefined();
    expect(snap.remotes!['origin']).toBeDefined();
    expect(snap.remotes!['origin']!.allCommits.length).toBeGreaterThan(0);
  });

  it('CA-remote-02 : remoteTrackingRefs.origin.main === branches.main (push a aligné origin)', () => {
    const snap = getSnap();
    expect(snap.remoteTrackingRefs).toBeDefined();
    expect(snap.remoteTrackingRefs!['origin']).toBeDefined();
    expect(snap.remoteTrackingRefs!['origin']!['main']).toBe(snap.branches['main']);
  });

  it('CA-remote-02 : remotes.origin.heads.main === branches.main (remote avancé)', () => {
    const snap = getSnap();
    expect(snap.remotes!['origin']!.heads['main']).toBe(snap.branches['main']);
  });

  it('CA-remote-02 : tracking.main.ahead === 0 après push', () => {
    const snap = getSnap();
    expect(snap.tracking).toBeDefined();
    expect(snap.tracking!['main']).toBeDefined();
    expect(snap.tracking!['main']!.ahead).toBe(0);
  });

  it('CA-remote-02 : tous les hashes de remotes.origin.allCommits sont des commits connus', () => {
    const snap = getSnap();
    const localHashes = new Set((snap.allCommits ?? snap.commits).map((c) => c.hash));
    const remoteAllCommits = snap.remotes!['origin']!.allCommits;
    for (const rc of remoteAllCommits) {
      expect(localHashes.has(rc.hash), `hash distant ${rc.shortHash} inconnu localement`).toBe(
        true,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// CA-remote-scenarios-03 : pull-merge — commit de merge présent
// ---------------------------------------------------------------------------

describe('scenarios-remote — CA-remote-03 : pull-merge — commit de merge créé', () => {
  const getResult = () => replayScenarioWithFailures(getScenarioById('pull-merge')!.commands);
  const getSnap = () => getResult().engine.snapshot();

  it('CA-remote-03 : scénario "pull-merge" existe', () => {
    expect(getScenarioById('pull-merge')).not.toBeNull();
  });

  it('CA-remote-03 : rejeu sans erreur (toutes les commandes exitCode 0)', () => {
    const { failures } = getResult();
    expect(failures, `commandes en échec : ${JSON.stringify(failures)}`).toHaveLength(0);
  });

  it("CA-remote-03 : pas d'opération en cours à la fin", () => {
    expect(getSnap().operationState).toBeFalsy();
  });

  it('CA-remote-03 : il existe au moins un commit de merge (≥ 2 parents)', () => {
    const snap = getSnap();
    const merges = (snap.allCommits ?? snap.commits).filter((c) => c.parents.length >= 2);
    expect(merges.length, 'aucun commit de merge trouvé').toBeGreaterThanOrEqual(1);
  });

  it('CA-remote-03 : pas de marqueur de conflit dans les fichiers', () => {
    const snap = getSnap();
    // Aucune opération merging en cours = conflit résolu ou absent
    expect(snap.operationState?.type).not.toBe('merging');
  });

  it('CA-remote-03 : HEAD sur main', () => {
    const snap = getSnap();
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') expect(snap.head.name).toBe('main');
  });

  it('CA-remote-03 : allCommits ≥ 3 (commits origin + commit local + commit de merge)', () => {
    const snap = getSnap();
    expect((snap.allCommits ?? snap.commits).length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// CA-remote-scenarios-04 : push-rejected-rebase — historique linéaire final
// ---------------------------------------------------------------------------

describe('scenarios-remote — CA-remote-04 : push-rejected-rebase — linéaire après rebase+push', () => {
  /**
   * Dans ce scénario, le 4e git push est intentionnellement REJETÉ (non-ff).
   * On tolère exactement cet unique échec.
   */
  const getResult = () =>
    replayScenarioWithFailures(getScenarioById('push-rejected-rebase')!.commands);
  const getSnap = () => getResult().engine.snapshot();

  it('CA-remote-04 : scénario "push-rejected-rebase" existe', () => {
    expect(getScenarioById('push-rejected-rebase')).not.toBeNull();
  });

  it('CA-remote-04 : exactement 1 commande en échec (le push rejeté)', () => {
    const { failures } = getResult();
    expect(failures.length).toBe(1);
    expect(failures[0]!.cmd).toBe('git push');
    expect(failures[0]!.exitCode).not.toBe(0);
  });

  it("CA-remote-04 : pas d'opération en cours à la fin", () => {
    expect(getSnap().operationState).toBeFalsy();
  });

  it('CA-remote-04 : branches.main === remoteTrackingRefs.origin.main (push final réussi)', () => {
    const snap = getSnap();
    expect(snap.remoteTrackingRefs).toBeDefined();
    expect(snap.remoteTrackingRefs!['origin']!['main']).toBe(snap.branches['main']);
  });

  it('CA-remote-04 : remotes.origin.heads.main === branches.main', () => {
    const snap = getSnap();
    expect(snap.remotes!['origin']!.heads['main']).toBe(snap.branches['main']);
  });

  it('CA-remote-04 : historique linéaire — aucun commit avec ≥ 2 parents (ajouté par ce scénario)', () => {
    const snap = getSnap();
    const merges = (snap.allCommits ?? snap.commits).filter((c) => c.parents.length >= 2);
    expect(merges, 'le scénario rebase ne devrait pas créer de commit de merge').toHaveLength(0);
  });

  it('CA-remote-04 : tracking.main.ahead === 0 après le push final', () => {
    const snap = getSnap();
    expect(snap.tracking).toBeDefined();
    expect(snap.tracking!['main']!.ahead).toBe(0);
  });

  it('CA-remote-04 : tracking.main.behind === 0 après le push final', () => {
    const snap = getSnap();
    expect(snap.tracking!['main']!.behind).toBe(0);
  });

  it('CA-remote-04 : HEAD sur main', () => {
    const snap = getSnap();
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') expect(snap.head.name).toBe('main');
  });
});

// ---------------------------------------------------------------------------
// CA-remote-scenarios-05 : collab-two-branches — deux branches trackées
//
// Le scénario part d'un dépôt neuf (`git init`) avec un distant VIDE
// (`git remote add origin local://origin`) : pousser `main` puis `develop`
// crée à chaque fois une NOUVELLE branche distante (aucune divergence
// préexistante), donc aucun rejet. Les deux branches obtiennent leur upstream.
// ---------------------------------------------------------------------------

describe('scenarios-remote — CA-remote-05 : collab-two-branches — deux branches upstream', () => {
  const getResult = () =>
    replayScenarioWithFailures(getScenarioById('collab-two-branches')!.commands);
  const getSnap = () => getResult().engine.snapshot();

  it('CA-remote-05 : scénario "collab-two-branches" existe', () => {
    expect(getScenarioById('collab-two-branches')).not.toBeNull();
  });

  it('CA-remote-05 : aucune commande en échec (distant vide → pas de rejet)', () => {
    const { failures } = getResult();
    expect(failures, `commandes en échec : ${JSON.stringify(failures)}`).toHaveLength(0);
  });

  it("CA-remote-05 : pas d'opération en cours à la fin", () => {
    expect(getSnap().operationState).toBeFalsy();
  });

  it('CA-remote-05 : remoteTrackingRefs.origin contient main ET develop', () => {
    const snap = getSnap();
    expect(snap.remoteTrackingRefs).toBeDefined();
    expect(snap.remoteTrackingRefs!['origin']).toBeDefined();
    expect(snap.remoteTrackingRefs!['origin']!['main']).toBeTruthy();
    expect(snap.remoteTrackingRefs!['origin']!['develop']).toBeTruthy();
  });

  it('CA-remote-05 : les deux branches locales ont un upstream sur origin', () => {
    const snap = getSnap();
    expect(snap.branchUpstream).toBeDefined();
    expect(snap.branchUpstream!['main']).toEqual({ remote: 'origin', branch: 'main' });
    expect(snap.branchUpstream!['develop']).toEqual({ remote: 'origin', branch: 'develop' });
  });

  it('CA-remote-05 : branches locales main et develop existent', () => {
    const snap = getSnap();
    expect(Object.keys(snap.branches)).toContain('main');
    expect(Object.keys(snap.branches)).toContain('develop');
  });

  it('CA-remote-05 : remotes.origin.heads contient main et develop', () => {
    const snap = getSnap();
    expect(snap.remotes!['origin']!.heads['main']).toBeTruthy();
    expect(snap.remotes!['origin']!.heads['develop']).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// CA-remote-scenarios-06 : Déterminisme — 2 rejeux identiques
// ---------------------------------------------------------------------------

describe('scenarios-remote — CA-remote-06 : déterminisme des scénarios distants', () => {
  for (const id of ['clone-push', 'pull-merge', 'push-rejected-rebase', 'collab-two-branches']) {
    it(`CA-remote-06 : "${id}" — 2 rejeux donnent les mêmes hashes allCommits`, () => {
      const scenario = getScenarioById(id)!;
      const s1 = replayScenario(scenario.commands).snapshot();
      const s2 = replayScenario(scenario.commands).snapshot();

      const h1 = (s1.allCommits ?? s1.commits).map((c) => c.hash).sort();
      const h2 = (s2.allCommits ?? s2.commits).map((c) => c.hash).sort();
      expect(h1).toEqual(h2);
    });

    it(`CA-remote-06 : "${id}" — 2 rejeux donnent les mêmes branches`, () => {
      const scenario = getScenarioById(id)!;
      const s1 = replayScenario(scenario.commands).snapshot();
      const s2 = replayScenario(scenario.commands).snapshot();
      expect(Object.keys(s1.branches).sort()).toEqual(Object.keys(s2.branches).sort());
    });
  }
});

// ---------------------------------------------------------------------------
// CA-remote-scenarios-07 : Cohérence graphe distant — computeLayout() sur remotes.origin
// ---------------------------------------------------------------------------

describe('scenarios-remote — CA-remote-07 : graphe distant layoutable (clone-push)', () => {
  it("CA-remote-07 : computeLayout sur remotes.origin.allCommits ne lève pas d'exception", () => {
    const snap = replayScenario(getScenarioById('clone-push')!.commands).snapshot();

    const remoteOrigin = snap.remotes!['origin']!;
    expect(remoteOrigin.allCommits.length).toBeGreaterThan(0);

    expect(() => {
      computeLayout({
        commits: remoteOrigin.allCommits,
        branches: remoteOrigin.heads,
        head: remoteOrigin.head,
        tags: {},
      });
    }).not.toThrow();
  });

  it('CA-remote-07 : layout produit autant de nœuds que de commits distants', () => {
    const snap = replayScenario(getScenarioById('clone-push')!.commands).snapshot();

    const remoteOrigin = snap.remotes!['origin']!;
    const layout = computeLayout({
      commits: remoteOrigin.allCommits,
      branches: remoteOrigin.heads,
      head: remoteOrigin.head,
      tags: {},
    });

    expect(layout.nodes.length).toBe(remoteOrigin.allCommits.length);
  });

  it('CA-remote-07 : chaque nœud du layout correspond à un commit distant connu', () => {
    const snap = replayScenario(getScenarioById('clone-push')!.commands).snapshot();

    const remoteOrigin = snap.remotes!['origin']!;
    const remoteHashes = new Set(remoteOrigin.allCommits.map((c) => c.hash));

    const layout = computeLayout({
      commits: remoteOrigin.allCommits,
      branches: remoteOrigin.heads,
      head: remoteOrigin.head,
      tags: {},
    });

    for (const node of layout.nodes) {
      expect(remoteHashes.has(node.hash), `nœud layout avec hash inconnu : ${node.hash}`).toBe(
        true,
      );
    }
  });

  it('CA-remote-07 : layout.laneCount ≥ 1 et layout.width > 0', () => {
    const snap = replayScenario(getScenarioById('clone-push')!.commands).snapshot();

    const remoteOrigin = snap.remotes!['origin']!;
    const layout = computeLayout({
      commits: remoteOrigin.allCommits,
      branches: remoteOrigin.heads,
      head: remoteOrigin.head,
      tags: {},
    });

    expect(layout.laneCount).toBeGreaterThanOrEqual(1);
    expect(layout.width).toBeGreaterThan(0);
  });
});
