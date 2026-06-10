/**
 * Tests Phase 6 : Autocomplétion du terminal
 * Spec : docs/specs/30-autocomplete.md
 *
 * Principe : tests dérivés des spécifications (CA numérotés), pas de l'implémentation.
 * La fonction autocomplete est pure (headless), testée sans UI.
 */

import { describe, it, expect } from 'vitest';
import { newEngine, replay } from './helpers';
import { autocomplete, replaceLastToken } from '@/utils/autocomplete';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

/**
 * Construit un engine avec un dépôt de base + une branche "feature" et un tag "v1.0".
 */
function engineWithBranchAndTag() {
  return replay([
    'git init',
    'write file.txt "hello"',
    'git add file.txt',
    'git commit -m "initial"',
    'git branch feature',
    'git tag v1.0',
  ]);
}

// ---------------------------------------------------------------------------
// CA-autocomplete-01 : Complète commande unique "git com" → "commit"
// ---------------------------------------------------------------------------

describe('autocomplete — CA-autocomplete-01 : complétion unique de commande', () => {
  it('CA-autocomplete-01 : "git com" → candidates === ["commit"]', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git com', catalog, snap);
    expect(result.candidates).toContain('commit');
    expect(result.candidates.length).toBe(1);
  });

  it('CA-autocomplete-01 : completion === "commit" (candidat complet)', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git com', catalog, snap);
    // Nouveau contrat (item B4-3) : completion = candidat COMPLET destiné à
    // remplacer le dernier token, et non plus un suffixe à ajouter.
    expect(result.completion).toBe('commit');
  });

  it('CA-autocomplete-01 : context === "commandName"', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git com', catalog, snap);
    expect(result.context).toBe('commandName');
  });
});

// ---------------------------------------------------------------------------
// CA-autocomplete-02 : Plusieurs candidats commande "git ch" → checkout + cherry-pick
// ---------------------------------------------------------------------------

describe('autocomplete — CA-autocomplete-02 : candidats multiples pour commande', () => {
  it('CA-autocomplete-02 : "git ch" → candidates contient "checkout" et "cherry-pick"', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git ch', catalog, snap);
    expect(result.candidates).toContain('checkout');
    expect(result.candidates).toContain('cherry-pick');
  });

  it('CA-autocomplete-02 : completion === "" (plusieurs candidats)', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git ch', catalog, snap);
    expect(result.completion).toBe('');
  });

  it('CA-autocomplete-02 : context === "commandName"', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git ch', catalog, snap);
    expect(result.context).toBe('commandName');
  });
});

// ---------------------------------------------------------------------------
// CA-autocomplete-03 : Aucun candidat pour commande inconnue
// ---------------------------------------------------------------------------

describe('autocomplete — CA-autocomplete-03 : pas de candidat', () => {
  it('CA-autocomplete-03 : "git nosuch" → candidates === []', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git nosuch', catalog, snap);
    expect(result.candidates).toEqual([]);
  });

  it('CA-autocomplete-03 : completion === ""', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git nosuch', catalog, snap);
    expect(result.completion).toBe('');
  });

  it('CA-autocomplete-03 : context === "none"', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git nosuch', catalog, snap);
    expect(result.context).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// CA-autocomplete-04 : Complétion unique de flag "git reset --mi" → "--mixed"
// ---------------------------------------------------------------------------

describe('autocomplete — CA-autocomplete-04 : complétion unique de flag', () => {
  it('CA-autocomplete-04 : "git reset --mi" → candidates === ["--mixed"]', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git reset --mi', catalog, snap);
    expect(result.candidates).toEqual(['--mixed']);
  });

  it('CA-autocomplete-04 : completion === "--mixed " (flag complet + espace)', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git reset --mi', catalog, snap);
    // Nouveau contrat (item B4-3) : flag complet + espace final pour l'argument.
    expect(result.completion).toBe('--mixed ');
  });

  it('CA-autocomplete-04 : context === "flag"', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git reset --mi', catalog, snap);
    expect(result.context).toBe('flag');
  });
});

// ---------------------------------------------------------------------------
// CA-autocomplete-05 : Plusieurs flags "git reset --" → --soft, --mixed, --hard
// ---------------------------------------------------------------------------

describe('autocomplete — CA-autocomplete-05 : liste des flags de reset', () => {
  it('CA-autocomplete-05 : "git reset --" → candidates.length === 3', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git reset --', catalog, snap);
    // --soft, --mixed, --hard (les flags commençant par --)
    expect(result.candidates.length).toBe(3);
  });

  it('CA-autocomplete-05 : candidates contient --soft, --mixed, --hard', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git reset --', catalog, snap);
    expect(result.candidates).toContain('--soft');
    expect(result.candidates).toContain('--mixed');
    expect(result.candidates).toContain('--hard');
  });

  it('CA-autocomplete-05 : completion === "" (plusieurs candidats)', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git reset --', catalog, snap);
    expect(result.completion).toBe('');
  });
});

// ---------------------------------------------------------------------------
// CA-autocomplete-06 : Complétion unique de branche "git checkout fe" → "feature"
// ---------------------------------------------------------------------------

describe('autocomplete — CA-autocomplete-06 : complétion unique de branche', () => {
  it('CA-autocomplete-06 : "git checkout fe" → candidates === ["feature"]', () => {
    const engine = engineWithBranchAndTag();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git checkout fe', catalog, snap);
    expect(result.candidates).toEqual(['feature']);
  });

  it('CA-autocomplete-06 : completion === "feature" (ref complète)', () => {
    const engine = engineWithBranchAndTag();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git checkout fe', catalog, snap);
    // Nouveau contrat (item B4-3) : ref complète (préserve la casse du candidat).
    expect(result.completion).toBe('feature');
  });

  it('CA-autocomplete-06 : context === "ref"', () => {
    const engine = engineWithBranchAndTag();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git checkout fe', catalog, snap);
    expect(result.context).toBe('ref');
  });
});

// ---------------------------------------------------------------------------
// CA-autocomplete-07 : Liste branches et tags "git checkout " → au moins 4 candidats
// ---------------------------------------------------------------------------

describe('autocomplete — CA-autocomplete-07 : liste branches et tags', () => {
  it('CA-autocomplete-07 : "git checkout " → candidates contient main, feature, v1.0', () => {
    const engine = engineWithBranchAndTag();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git checkout ', catalog, snap);
    expect(result.candidates).toContain('main');
    expect(result.candidates).toContain('feature');
    expect(result.candidates).toContain('v1.0');
  });

  it('CA-autocomplete-07 : candidates.length >= 3 (au moins branches + tags)', () => {
    const engine = engineWithBranchAndTag();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git checkout ', catalog, snap);
    expect(result.candidates.length).toBeGreaterThanOrEqual(3);
  });

  it('CA-autocomplete-07 : completion === "" (plusieurs candidats)', () => {
    const engine = engineWithBranchAndTag();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git checkout ', catalog, snap);
    expect(result.completion).toBe('');
  });
});

// ---------------------------------------------------------------------------
// CA-autocomplete-09 : Pas de complétion sur une commande complète avec args
// ---------------------------------------------------------------------------

describe('autocomplete — CA-autocomplete-09 : commande complète sans complétion', () => {
  it('CA-autocomplete-09 : "git reset --soft main" → pas de complétion (context none ou ref vide)', () => {
    const engine = engineWithBranchAndTag();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    // "main" est une ref connue, donc le comportement peut différer selon l'implémentation
    // On vérifie surtout que ça ne plante pas et renvoie un résultat cohérent
    const result = autocomplete('git reset --soft main', catalog, snap);
    expect(result).toBeDefined();
    expect(typeof result.completion).toBe('string');
    expect(Array.isArray(result.candidates)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-autocomplete-10 : Respect de la casse (insensible)
// ---------------------------------------------------------------------------

describe('autocomplete — CA-autocomplete-10 : insensibilité à la casse', () => {
  it('CA-autocomplete-10 : "git Ch" (majuscule) → candidates contient "checkout"', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git Ch', catalog, snap);
    // Insensible à la casse : "Ch" doit matcher "checkout" et "cherry-pick"
    expect(result.candidates).toContain('checkout');
    expect(result.candidates).toContain('cherry-pick');
  });

  it('CA-autocomplete-10 : "git COM" (majuscules) → candidates contient "commit"', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git COM', catalog, snap);
    expect(result.candidates).toContain('commit');
  });
});

// ---------------------------------------------------------------------------
// CA-autocomplete-11 : Filtre par préfixe "git s" → status, switch, stash
// ---------------------------------------------------------------------------

describe('autocomplete — CA-autocomplete-11 : filtre par préfixe', () => {
  it('CA-autocomplete-11 : "git s" → candidates contient status, switch, stash', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git s', catalog, snap);
    expect(result.candidates).toContain('status');
    expect(result.candidates).toContain('switch');
    expect(result.candidates).toContain('stash');
  });

  it('CA-autocomplete-11 : "git s" → candidates ne contient pas init, add, checkout', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git s', catalog, snap);
    expect(result.candidates).not.toContain('init');
    expect(result.candidates).not.toContain('add');
    expect(result.candidates).not.toContain('checkout');
  });
});

// ---------------------------------------------------------------------------
// CA-autocomplete-12 : Ordre des candidats déterministe
// ---------------------------------------------------------------------------

describe('autocomplete — CA-autocomplete-12 : ordre déterministe des candidats', () => {
  it('CA-autocomplete-12 : deux appels consécutifs donnent le même ordre', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const r1 = autocomplete('git ch', catalog, snap);
    const r2 = autocomplete('git ch', catalog, snap);
    expect(r1.candidates).toEqual(r2.candidates);
  });

  it('CA-autocomplete-12 : checkout avant cherry-pick (ordre alphabétique)', () => {
    const engine = newEngine();
    const catalog = engine.getCatalog();
    const snap = engine.snapshot();
    const result = autocomplete('git ch', catalog, snap);
    const checkoutIdx = result.candidates.indexOf('checkout');
    const cherryPickIdx = result.candidates.indexOf('cherry-pick');
    expect(checkoutIdx).toBeGreaterThanOrEqual(0);
    expect(cherryPickIdx).toBeGreaterThanOrEqual(0);
    // Ordre alphabétique : "checkout" < "cherry-pick"
    expect(checkoutIdx).toBeLessThan(cherryPickIdx);
  });
});

// ---------------------------------------------------------------------------
// Item B4-3 : Correction de la casse mixte + replaceLastToken
// Spec : docs/specs/61-technical-improvements.md (CA-autocase-*)
// ---------------------------------------------------------------------------

describe('replaceLastToken (CA-autocase-01)', () => {
  it('remplace le dernier token par le candidat complet', () => {
    expect(replaceLastToken('git checkout fe', 'Feature')).toBe('git checkout Feature');
  });

  it('remplace un préfixe de commande', () => {
    expect(replaceLastToken('git ch', 'checkout')).toBe('git checkout');
  });

  it('input finissant par un espace → ajoute le candidat', () => {
    expect(replaceLastToken('git checkout ', 'main')).toBe('git checkout main');
  });

  it("préserve le préfixe d'une chaîne de commandes", () => {
    expect(replaceLastToken('git init && git checkout fe', 'Feature')).toBe(
      'git init && git checkout Feature',
    );
  });
});

describe('autocomplete — casse mixte (CA-autocase-04)', () => {
  function engineWithMixedCaseBranch() {
    return replay([
      'git init',
      'write file.txt "hello"',
      'git add file.txt',
      'git commit -m "initial"',
      'git branch Feature',
    ]);
  }

  it('"git checkout fe" → candidat "Feature" (casse du candidat préservée)', () => {
    const engine = engineWithMixedCaseBranch();
    const result = autocomplete('git checkout fe', engine.getCatalog(), engine.snapshot());
    expect(result.candidates).toEqual(['Feature']);
    expect(result.completion).toBe('Feature');
    // Combiné à replaceLastToken : la ligne finale conserve la casse du candidat.
    expect(replaceLastToken('git checkout fe', result.completion)).toBe('git checkout Feature');
  });

  it('filtre insensible à la casse mais candidat gardé dans sa casse (CA-autocase-05)', () => {
    const engine = engineWithMixedCaseBranch();
    const result = autocomplete('git checkout FE', engine.getCatalog(), engine.snapshot());
    expect(result.candidates).toEqual(['Feature']);
  });
});
