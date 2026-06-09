/**
 * Tests Phase 6 (CA-catalog-10) : cohérence catalogue ↔ parser réel.
 *
 * Le catalogue (src/core/catalog.ts) et le dispatch du parser (src/core/parser.ts)
 * sont deux listes maintenues à la main. Ce test garantit l'invariant : toute commande
 * listée au catalogue est réellement dispatchée par le moteur (et ne retombe pas sur
 * « is not a git command »). Empêche durablement le flag/commande fantôme.
 */
import { describe, it, expect } from 'vitest';
import { newEngine } from './helpers';
import { getCommandNames } from '@/core/catalog';

/** write/read sont des utilitaires non-git : invoqués sans préfixe `git`. */
const NON_GIT_UTILS = new Set(['write', 'read']);

describe('Cohérence catalogue ↔ parser', () => {
  it('CA-catalog-10 : chaque commande du catalogue est dispatchée par le parser', () => {
    const names = getCommandNames();
    // Garde-fou : on a bien un catalogue non trivial
    expect(names.length).toBeGreaterThanOrEqual(19);

    for (const name of names) {
      const engine = newEngine();
      const input = NON_GIT_UTILS.has(name) ? name : `git ${name}`;
      const result = engine.execute(input);
      // La commande peut échouer pour une raison légitime (pas de dépôt, argument
      // manquant…), mais JAMAIS parce qu'elle est inconnue du parser.
      const joined = [...result.output, ...result.errors].join('\n');
      expect(joined, `commande catalogue "${name}" non dispatchée par le parser`).not.toMatch(
        /is not a git command/i,
      );
    }
  });
});
