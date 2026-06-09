/**
 * Helpers partagés pour les tests Phase 1.
 */

import { GitEngine } from '@/core/engine';

/** Fabrique un GitEngine vierge. */
export function newEngine(): GitEngine {
  return new GitEngine();
}

/**
 * Rejoue une liste de commandes sur un engine et renvoie l'engine.
 * Pratique pour amener le dépôt dans un état de départ connu.
 */
export function replay(commands: string[]): GitEngine {
  const engine = newEngine();
  for (const cmd of commands) {
    engine.execute(cmd);
  }
  return engine;
}
