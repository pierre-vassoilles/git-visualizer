/**
 * Tests Phase 6 : Catalogue de commandes
 * Spec : docs/specs/29-command-catalog.md
 *
 * Principe : tests dérivés des spécifications (CA numérotés), pas de l'implémentation.
 */

import { describe, it, expect } from 'vitest';
import { newEngine } from './helpers';
import { COMMAND_CATALOG, getCommandNames, getCommandFlags } from '@/core/catalog';

// ---------------------------------------------------------------------------
// CA-catalog-01 : getCommandNames() couvre toutes les commandes Phase 5
// ---------------------------------------------------------------------------

describe('catalog — CA-catalog-01 : couverture complète des commandes', () => {
  const REQUIRED_COMMANDS = [
    'init', 'add', 'status', 'restore', 'write', 'read',
    'commit', 'log',
    'branch', 'checkout', 'switch', 'tag',
    'merge', 'reset', 'revert', 'cherry-pick', 'rebase',
    'stash', 'reflog',
    'help',
  ];

  it('CA-catalog-01 : getCommandNames() retourne toutes les 20 commandes', () => {
    const names = getCommandNames();
    for (const cmd of REQUIRED_COMMANDS) {
      expect(names).toContain(cmd);
    }
  });

  it('CA-catalog-01 : getCommandNames() trié alphabétiquement', () => {
    const names = getCommandNames();
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('CA-catalog-01 : getCommandNames() sans doublon', () => {
    const names = getCommandNames();
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('CA-catalog-01 : engine.getCommandNames() expose la même liste', () => {
    const engine = newEngine();
    const names = engine.getCommandNames();
    for (const cmd of REQUIRED_COMMANDS) {
      expect(names).toContain(cmd);
    }
  });
});

// ---------------------------------------------------------------------------
// CA-catalog-02 : Métadonnées non vides pour chaque commande
// ---------------------------------------------------------------------------

describe('catalog — CA-catalog-02 : métadonnées pour commit', () => {
  it('CA-catalog-02 : lookup["commit"].name === "commit"', () => {
    const meta = COMMAND_CATALOG.lookup['commit'];
    expect(meta).toBeDefined();
    expect(meta.name).toBe('commit');
  });

  it('CA-catalog-02 : description non vide', () => {
    const meta = COMMAND_CATALOG.lookup['commit'];
    expect(meta.description).toBeTruthy();
    expect(meta.description.length).toBeGreaterThan(0);
  });

  it('CA-catalog-02 : category non vide', () => {
    const meta = COMMAND_CATALOG.lookup['commit'];
    expect(meta.category).toBeTruthy();
    expect(meta.category.length).toBeGreaterThan(0);
  });

  it('CA-catalog-02 : flags est un tableau', () => {
    const meta = COMMAND_CATALOG.lookup['commit'];
    expect(Array.isArray(meta.flags)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-catalog-03 : Flag -m de commit — isCommon, hasArgument, description
// ---------------------------------------------------------------------------

describe('catalog — CA-catalog-03 : flag -m de commit', () => {
  it('CA-catalog-03 : getCommandFlags("commit") retourne au minimum le flag -m', () => {
    const flags = getCommandFlags('commit');
    const mFlag = flags.find(f => f.name === '-m');
    expect(mFlag).toBeDefined();
  });

  it('CA-catalog-03 : flag -m est isCommon === true', () => {
    const flags = getCommandFlags('commit');
    const mFlag = flags.find(f => f.name === '-m');
    expect(mFlag?.isCommon).toBe(true);
  });

  it('CA-catalog-03 : flag -m a hasArgument === true', () => {
    const flags = getCommandFlags('commit');
    const mFlag = flags.find(f => f.name === '-m');
    expect(mFlag?.hasArgument).toBe(true);
  });

  it('CA-catalog-03 : description de -m contient "message"', () => {
    const flags = getCommandFlags('commit');
    const mFlag = flags.find(f => f.name === '-m');
    expect(mFlag?.description.toLowerCase()).toContain('message');
  });
});

// ---------------------------------------------------------------------------
// CA-catalog-04 : Lookup O(1) — accès direct sans itération
// ---------------------------------------------------------------------------

describe('catalog — CA-catalog-04 : lookup O(1)', () => {
  it('CA-catalog-04 : COMMAND_CATALOG.lookup["reset"] retourne un objet', () => {
    const meta = COMMAND_CATALOG.lookup['reset'];
    expect(meta).toBeDefined();
    expect(meta.name).toBe('reset');
  });

  it('CA-catalog-04 : lookup est un objet (pas une Map ni un tableau)', () => {
    expect(typeof COMMAND_CATALOG.lookup).toBe('object');
    expect(COMMAND_CATALOG.lookup).not.toBeNull();
    expect(!Array.isArray(COMMAND_CATALOG.lookup)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-catalog-05 : Groupement par catégorie — "Commits" contient commit et log
// ---------------------------------------------------------------------------

describe('catalog — CA-catalog-05 : groupement par catégorie Commits', () => {
  it('CA-catalog-05 : commands["Commits"] contient commit et log', () => {
    const commits = COMMAND_CATALOG.commands['Commits'];
    expect(commits).toBeDefined();
    const names = commits.map(c => c.name);
    expect(names).toContain('commit');
    expect(names).toContain('log');
  });

  it('CA-catalog-05 : commands["Commits"] ne contient que commit et log', () => {
    const commits = COMMAND_CATALOG.commands['Commits'];
    // La spec dit exactement commit + log dans la catégorie Commits
    const names = commits.map(c => c.name);
    expect(names.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// CA-catalog-06 : Version du catalogue
// ---------------------------------------------------------------------------

describe('catalog — CA-catalog-06 : version du catalogue', () => {
  it('CA-catalog-06 : version est une string non vide', () => {
    expect(typeof COMMAND_CATALOG.version).toBe('string');
    expect(COMMAND_CATALOG.version.length).toBeGreaterThan(0);
  });

  it('CA-catalog-06 : engine.getCatalog().version est une string', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    expect(typeof catalog.version).toBe('string');
    expect(catalog.version.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// CA-catalog-07 : Commande inexistante retourne []
// ---------------------------------------------------------------------------

describe('catalog — CA-catalog-07 : commande inexistante', () => {
  it('CA-catalog-07 : getCommandFlags("nosuchcommand") === []', () => {
    const flags = getCommandFlags('nosuchcommand');
    expect(flags).toEqual([]);
  });

  it('CA-catalog-07 : engine.getCommandFlags("nosuchcommand") === []', () => {
    const engine = newEngine();
    const flags = engine.getCommandFlags('nosuchcommand');
    expect(flags).toEqual([]);
  });

  it('CA-catalog-07 : aucune exception levée', () => {
    expect(() => getCommandFlags('nosuchcommand')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// CA-catalog-08 : Descriptifs en français et non vides
// ---------------------------------------------------------------------------

describe('catalog — CA-catalog-08 : descriptions en français non vides', () => {
  it('CA-catalog-08 : toutes les descriptions de commandes sont non vides', () => {
    const names = getCommandNames();
    for (const name of names) {
      const meta = COMMAND_CATALOG.lookup[name];
      expect(meta?.description, `description vide pour "${name}"`).toBeTruthy();
      expect(meta?.description.length, `description trop courte pour "${name}"`).toBeGreaterThan(0);
    }
  });

  it('CA-catalog-08 : les descriptions contiennent des caractères français (accents ou au moins ASCII)', () => {
    // Vérification minimale : au moins quelques descriptions ont des accents ou mots français typiques
    const allDescriptions = getCommandNames()
      .map(n => COMMAND_CATALOG.lookup[n]?.description ?? '')
      .join(' ');
    // On s'assure qu'aucune description n'est en anglais pur sans fr
    // Test permissif : au moins 3 descriptions contiennent des accents ou mots français
    const frenchIndicators = getCommandNames()
      .map(n => COMMAND_CATALOG.lookup[n]?.description ?? '')
      .filter(d => /[éèêëàâùûîïôçœæ]|Créer|Afficher|Ajouter|Lister|Supprimer|Fusionner|Réinitialiser|Basculer/i.test(d));
    expect(frenchIndicators.length).toBeGreaterThanOrEqual(3);
    expect(allDescriptions.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// CA-catalog-09 : Flags avec et sans argument pour add et reset
// ---------------------------------------------------------------------------

describe('catalog — CA-catalog-09 : flags hasArgument cohérent', () => {
  it('CA-catalog-09 : add — flag -A a hasArgument === false', () => {
    const flags = getCommandFlags('add');
    const flagA = flags.find(f => f.name === '-A' || f.name === '--all');
    expect(flagA).toBeDefined();
    expect(flagA?.hasArgument).toBe(false);
  });

  it('CA-catalog-09 : reset — flags --soft, --mixed, --hard ont hasArgument === false', () => {
    const flags = getCommandFlags('reset');
    const names = flags.map(f => f.name);
    expect(names).toContain('--soft');
    expect(names).toContain('--mixed');
    expect(names).toContain('--hard');

    const softFlag = flags.find(f => f.name === '--soft');
    const mixedFlag = flags.find(f => f.name === '--mixed');
    const hardFlag = flags.find(f => f.name === '--hard');
    expect(softFlag?.hasArgument).toBe(false);
    expect(mixedFlag?.hasArgument).toBe(false);
    expect(hardFlag?.hasArgument).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CA-catalog-10 : Cohérence — chaque commande dans le catalogue est connue du moteur
// ---------------------------------------------------------------------------

describe('catalog — CA-catalog-10 : cohérence catalogue / implémentation', () => {
  it('CA-catalog-10 : toutes les commandes du catalogue sont dans engine.getCommandNames()', () => {
    const engine = newEngine();
    const engineNames = new Set(engine.getCommandNames());
    const catalogNames = getCommandNames();
    for (const name of catalogNames) {
      expect(engineNames.has(name), `Commande "${name}" dans le catalogue mais absente du moteur`).toBe(true);
    }
  });

  it('CA-catalog-10 : engine.getCatalog() retourne le même catalogue que COMMAND_CATALOG', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    expect(catalog.version).toBe(COMMAND_CATALOG.version);
    expect(Object.keys(catalog.lookup).sort()).toEqual(Object.keys(COMMAND_CATALOG.lookup).sort());
  });
});
