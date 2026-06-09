/**
 * Tests Phase 6 : git help
 * Spec : docs/specs/28-help.md
 *
 * Principe : tests dérivés des spécifications (CA numérotés), pas de l'implémentation.
 */

import { describe, it, expect } from 'vitest';
import { newEngine, replay } from './helpers';

// ---------------------------------------------------------------------------
// CA-help-01 : Aide générale — git help
// ---------------------------------------------------------------------------

describe('git help — CA-help-01 : aide générale', () => {
  it('CA-help-01 : exitCode 0', () => {
    const engine = newEngine();
    const result = engine.execute('git help');
    expect(result.exitCode).toBe(0);
  });

  it('CA-help-01 : output contient "usage: git"', () => {
    const engine = newEngine();
    const result = engine.execute('git help');
    const combined = result.output.join('\n');
    expect(combined).toContain('usage: git');
  });

  it('CA-help-01 : output contient les catégories principales', () => {
    const engine = newEngine();
    const result = engine.execute('git help');
    const combined = result.output.join('\n');
    expect(combined).toMatch(/Initialisation/i);
    expect(combined).toMatch(/Fichiers|Index/i);
    expect(combined).toMatch(/Commits/i);
    expect(combined).toMatch(/Branches/i);
  });

  it('CA-help-01 : output contient des commandes listées (init, commit, branch au minimum)', () => {
    const engine = newEngine();
    const result = engine.execute('git help');
    const combined = result.output.join('\n');
    expect(combined).toContain('init');
    expect(combined).toContain('commit');
    expect(combined).toContain('branch');
  });

  it('CA-help-01 : output contient le pied de page "git help <command>"', () => {
    const engine = newEngine();
    const result = engine.execute('git help');
    const combined = result.output.join('\n');
    expect(combined).toMatch(/git help <command>/i);
  });

  it('CA-help-01 : aucune erreur', () => {
    const engine = newEngine();
    const result = engine.execute('git help');
    expect(result.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CA-help-02 : Variante git --help
// ---------------------------------------------------------------------------

describe('git help — CA-help-02 : variante --help', () => {
  it('CA-help-02 : exitCode 0', () => {
    const engine = newEngine();
    const result = engine.execute('git --help');
    expect(result.exitCode).toBe(0);
  });

  it('CA-help-02 : output similaire à git help (contient "usage: git")', () => {
    const engine = newEngine();
    const result = engine.execute('git --help');
    const combined = result.output.join('\n');
    expect(combined).toContain('usage: git');
  });

  it('CA-help-02 : output identique ou équivalent à git help', () => {
    const engine = newEngine();
    const r1 = engine.execute('git help');
    const r2 = engine.execute('git --help');
    // Les deux doivent contenir les mêmes sections clés
    const c1 = r1.output.join('\n');
    const c2 = r2.output.join('\n');
    expect(c1).toContain('usage: git');
    expect(c2).toContain('usage: git');
    // Même pied de page
    expect(c1).toMatch(/git help <command>/i);
    expect(c2).toMatch(/git help <command>/i);
  });
});

// ---------------------------------------------------------------------------
// CA-help-03 : Variante git sans arguments
// ---------------------------------------------------------------------------

describe('git help — CA-help-03 : git sans arguments', () => {
  it('CA-help-03 : exitCode 0', () => {
    const engine = newEngine();
    const result = engine.execute('git');
    expect(result.exitCode).toBe(0);
  });

  it('CA-help-03 : output contient une invite ou aide', () => {
    const engine = newEngine();
    const result = engine.execute('git');
    const combined = result.output.join('\n');
    expect(combined.length).toBeGreaterThan(0);
    // Doit afficher de l'aide (usage ou liste de commandes)
    expect(combined).toMatch(/usage|git|help/i);
  });
});

// ---------------------------------------------------------------------------
// CA-help-04 : Aide détaillée pour git help commit
// ---------------------------------------------------------------------------

describe('git help — CA-help-04 : aide détaillée git help commit', () => {
  it('CA-help-04 : exitCode 0', () => {
    const engine = newEngine();
    const result = engine.execute('git help commit');
    expect(result.exitCode).toBe(0);
  });

  it('CA-help-04 : section NAME avec description', () => {
    const engine = newEngine();
    const result = engine.execute('git help commit');
    const combined = result.output.join('\n');
    expect(combined).toContain('NAME');
    expect(combined).toContain('commit');
  });

  it('CA-help-04 : section SYNOPSIS', () => {
    const engine = newEngine();
    const result = engine.execute('git help commit');
    const combined = result.output.join('\n');
    expect(combined).toContain('SYNOPSIS');
    expect(combined).toContain('git commit');
  });

  it('CA-help-04 : section DESCRIPTION', () => {
    const engine = newEngine();
    const result = engine.execute('git help commit');
    const combined = result.output.join('\n');
    expect(combined).toContain('DESCRIPTION');
  });

  it('CA-help-04 : section OPTIONS avec option -m', () => {
    const engine = newEngine();
    const result = engine.execute('git help commit');
    const combined = result.output.join('\n');
    expect(combined).toContain('OPTIONS');
    expect(combined).toContain('-m');
  });

  it('CA-help-04 : section EXAMPLES avec au moins 1 exemple', () => {
    const engine = newEngine();
    const result = engine.execute('git help commit');
    const combined = result.output.join('\n');
    expect(combined).toContain('EXAMPLES');
    expect(combined).toContain('git commit');
  });

  it('CA-help-04 : section EXIT CODES', () => {
    const engine = newEngine();
    const result = engine.execute('git help commit');
    const combined = result.output.join('\n');
    expect(combined).toMatch(/EXIT CODES?/i);
  });

  it('CA-help-04 : aucune erreur', () => {
    const engine = newEngine();
    const result = engine.execute('git help commit');
    expect(result.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CA-help-05 : Aide pour plusieurs commandes différentes
// ---------------------------------------------------------------------------

describe('git help — CA-help-05 : aide pour log, branch, merge', () => {
  it('CA-help-05 : git help log — exitCode 0 et contient SYNOPSIS', () => {
    const engine = newEngine();
    const result = engine.execute('git help log');
    expect(result.exitCode).toBe(0);
    const combined = result.output.join('\n');
    expect(combined).toContain('SYNOPSIS');
    expect(combined).toContain('git log');
  });

  it('CA-help-05 : git help branch — exitCode 0 et contient SYNOPSIS', () => {
    const engine = newEngine();
    const result = engine.execute('git help branch');
    expect(result.exitCode).toBe(0);
    const combined = result.output.join('\n');
    expect(combined).toContain('SYNOPSIS');
    expect(combined).toContain('git branch');
  });

  it('CA-help-05 : git help merge — exitCode 0 et contient SYNOPSIS', () => {
    const engine = newEngine();
    const result = engine.execute('git help merge');
    expect(result.exitCode).toBe(0);
    const combined = result.output.join('\n');
    expect(combined).toContain('SYNOPSIS');
    expect(combined).toContain('git merge');
  });

  it('CA-help-05 : contenus distincts pour log, branch, merge', () => {
    const engine = newEngine();
    const rLog = engine.execute('git help log');
    const rBranch = engine.execute('git help branch');
    const rMerge = engine.execute('git help merge');
    // Chaque aide mentionne son propre nom de commande
    expect(rLog.output.join('\n')).toContain('log');
    expect(rBranch.output.join('\n')).toContain('branch');
    expect(rMerge.output.join('\n')).toContain('merge');
    // Les sorties ne sont pas identiques
    expect(rLog.output.join('\n')).not.toBe(rBranch.output.join('\n'));
    expect(rBranch.output.join('\n')).not.toBe(rMerge.output.join('\n'));
  });
});

// ---------------------------------------------------------------------------
// CA-help-06 : Commande inconnue
// ---------------------------------------------------------------------------

describe('git help — CA-help-06 : commande inconnue', () => {
  it('CA-help-06 : exitCode 1', () => {
    const engine = newEngine();
    const result = engine.execute('git help nosuchcommand');
    expect(result.exitCode).toBe(1);
  });

  it('CA-help-06 : errors contient "is not a git command"', () => {
    const engine = newEngine();
    const result = engine.execute('git help nosuchcommand');
    expect(result.errors.some(e => e.includes('is not a git command'))).toBe(true);
  });

  it('CA-help-06 : aucune modification à l\'état du dépôt', () => {
    const engine = replay([
      'git init',
      'write f.txt "hello"',
      'git add f.txt',
      'git commit -m "initial"',
    ]);
    const snapBefore = engine.snapshot();
    engine.execute('git help nosuchcommand');
    const snapAfter = engine.snapshot();
    expect(snapAfter.commits.length).toBe(snapBefore.commits.length);
    expect(Object.keys(snapAfter.branches)).toEqual(Object.keys(snapBefore.branches));
  });
});

// ---------------------------------------------------------------------------
// CA-help-07 : Format des catégories
// ---------------------------------------------------------------------------

describe('git help — CA-help-07 : format des catégories', () => {
  it('CA-help-07 : au moins 5 catégories visibles', () => {
    const engine = newEngine();
    const result = engine.execute('git help');
    const combined = result.output.join('\n');
    // Compter les catégories connues
    const categories = [
      'Initialisation',
      'Fichiers',
      'Commits',
      'Branches',
      'Fusion',
      'Outils',
      'Aide',
    ];
    const found = categories.filter(cat => combined.includes(cat));
    expect(found.length).toBeGreaterThanOrEqual(5);
  });

  it('CA-help-07 : commandes obligatoires présentes (init, add, status, commit, log, branch, checkout, merge, reset, help)', () => {
    const engine = newEngine();
    const result = engine.execute('git help');
    const combined = result.output.join('\n');
    const requiredCmds = ['init', 'add', 'status', 'commit', 'log', 'branch', 'checkout', 'merge', 'reset', 'help'];
    for (const cmd of requiredCmds) {
      expect(combined).toContain(cmd);
    }
  });
});

// ---------------------------------------------------------------------------
// CA-help-08 : Commande inconnue avec typo
// ---------------------------------------------------------------------------

describe('git help — CA-help-08 : typo dans la commande', () => {
  it('CA-help-08 : git help chckout — exitCode 1', () => {
    const engine = newEngine();
    const result = engine.execute('git help chckout');
    expect(result.exitCode).toBe(1);
  });

  it('CA-help-08 : git help chckout — errors contient "is not a git command"', () => {
    const engine = newEngine();
    const result = engine.execute('git help chckout');
    expect(result.errors.some(e => e.includes('is not a git command'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cas bonus : git help fonctionne même sans git init
// ---------------------------------------------------------------------------

describe('git help — fonctionne sans dépôt initialisé', () => {
  it('git help sans init — exitCode 0', () => {
    const engine = newEngine(); // aucun git init
    const result = engine.execute('git help');
    expect(result.exitCode).toBe(0);
  });

  it('git help commit sans init — exitCode 0', () => {
    const engine = newEngine();
    const result = engine.execute('git help commit');
    expect(result.exitCode).toBe(0);
  });
});
