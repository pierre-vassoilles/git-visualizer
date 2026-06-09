/**
 * Couche « shell » du terminal virtuel : découpe d'une ligne en commandes
 * chaînées par `;` (séquentiel inconditionnel) et `&&` (séquentiel conditionnel,
 * la suivante ne s'exécute que si la précédente a réussi).
 *
 * Fonction PURE (zéro import Vue/moteur), testable headless. La sémantique
 * d'exécution (court-circuit du `&&`) est appliquée par l'appelant (TerminalPanel)
 * à partir des `exitCode` renvoyés par le moteur.
 */

export type ChainOperator = '&&' | ';';

export interface ChainSegment {
  /** La commande brute du segment (espaces de bord non rognés). */
  readonly command: string;
  /**
   * L'opérateur qui PRÉCÈDE ce segment (null pour le premier segment).
   * - `'&&'` : n'exécuter que si le segment précédent a réussi.
   * - `';'`  : exécuter inconditionnellement.
   */
  readonly operator: ChainOperator | null;
}

/**
 * Découpe une ligne en segments séparés par `;` et `&&`, en ignorant les
 * séparateurs situés à l'intérieur de guillemets simples ou doubles.
 *
 * Les segments vides (ex. `;;` ou `;` final) sont conservés tels quels :
 * c'est à l'appelant de les ignorer (commande vide = no-op).
 *
 * @example
 *   splitCommandChain('git add . && git commit -m "a; b"')
 *   // → [ { command: 'git add . ', operator: null },
 *   //     { command: ' git commit -m "a; b"', operator: '&&' } ]
 */
export function splitCommandChain(line: string): ChainSegment[] {
  const segments: ChainSegment[] = [];
  let buf = '';
  let pendingOp: ChainOperator | null = null;
  let quote: '"' | "'" | null = null;

  let i = 0;
  while (i < line.length) {
    const ch = line[i]!;

    // À l'intérieur d'un guillemet : tout est littéral jusqu'au guillemet fermant.
    if (quote !== null) {
      buf += ch;
      if (ch === quote) quote = null;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      i++;
      continue;
    }

    if (ch === ';') {
      segments.push({ command: buf, operator: pendingOp });
      pendingOp = ';';
      buf = '';
      i++;
      continue;
    }

    if (ch === '&' && line[i + 1] === '&') {
      segments.push({ command: buf, operator: pendingOp });
      pendingOp = '&&';
      buf = '';
      i += 2;
      continue;
    }

    buf += ch;
    i++;
  }

  segments.push({ command: buf, operator: pendingOp });
  return segments;
}
