/**
 * Tokenizer unique du projet — découpe une ligne en tokens.
 *
 * Source de vérité partagée par :
 *  - `src/core/parser.ts` (dispatch des commandes git)
 *  - `src/utils/autocomplete.ts` (complétion Tab)
 *
 * C'est du parsing de **syntaxe** (guillemets, espaces, échappements), PAS
 * d'analyse sémantique (identification de commande, validation de flags) :
 * cette dernière reste dans `parser.ts`.
 *
 * Fonction pure, zéro effet de bord — testable headless.
 *
 * @example
 *   tokenize('git commit -m "hello world"')
 *   // → ['git', 'commit', '-m', 'hello world']
 *
 *   tokenize("git checkout ", { keepEmptyTokens: true })
 *   // → ['git', 'checkout', '']   (l'utilisateur commence un nouvel argument)
 */

export interface TokenizeOptions {
  /**
   * Traiter les guillemets simples `'…'` comme des délimiteurs de chaîne.
   * Défaut : `false` (un `'` est un caractère littéral, conforme au parsing
   * historique du projet).
   */
  allowSingleQuotes?: boolean;
  /**
   * Interpréter les séquences d'échappement `\"` / `\'` / `\\` (le caractère
   * suivant est pris littéralement). Défaut : `false`.
   */
  allowEscapes?: boolean;
  /**
   * Lever une `TokenizeError` si un guillemet n'est jamais refermé.
   * Défaut : `false` (le reste de la ligne est avalé silencieusement, conforme
   * au comportement historique).
   */
  strict?: boolean;
  /**
   * Émettre un token vide pour chaque espace non quoté ainsi qu'en fin de
   * ligne (sémantique d'autocomplétion : « l'utilisateur commence un nouvel
   * argument »). Défaut : `false` (les espaces consécutifs sont fusionnés,
   * sémantique du parser de commandes).
   */
  keepEmptyTokens?: boolean;
}

/** Erreur levée par `tokenize` en mode `strict` sur un guillemet non fermé. */
export class TokenizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenizeError';
  }
}

/**
 * Découpe `input` en tokens.
 *
 * Comportement par défaut (sans options) — identique au tokenizer historique
 * du parser :
 *  - guillemets doubles `"…"` : délimitent une chaîne (les guillemets ne sont
 *    pas inclus dans le token) ;
 *  - un token entre guillemets explicitement vides (`""`) est tout de même émis
 *    (ex. `git branch ""` doit pouvoir rejeter le nom vide comme le vrai Git) ;
 *  - espaces consécutifs fusionnés ; pas de token vide en fin de ligne.
 */
export function tokenize(input: string, options: TokenizeOptions = {}): string[] {
  const {
    allowSingleQuotes = false,
    allowEscapes = false,
    strict = false,
    keepEmptyTokens = false,
  } = options;

  const tokens: string[] = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  // Le token courant a-t-il été ouvert par des guillemets ? (pour émettre les
  // tokens explicitement vides même sans `keepEmptyTokens`.)
  let quoted = false;

  const inQuotes = () => inDouble || inSingle;

  const flush = (atSpace: boolean) => {
    // `atSpace` : on flush à cause d'un espace ; sinon : fin de ligne.
    if (keepEmptyTokens || current.length > 0 || quoted) {
      tokens.push(current);
      current = '';
      quoted = false;
    } else if (atSpace) {
      // rien à émettre (espaces consécutifs fusionnés)
    }
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;

    // Échappement : le caractère suivant est littéral.
    if (allowEscapes && ch === '\\' && i + 1 < input.length) {
      current += input[i + 1]!;
      i++;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      quoted = true;
      continue;
    }

    if (allowSingleQuotes && ch === "'" && !inDouble) {
      inSingle = !inSingle;
      quoted = true;
      continue;
    }

    if (ch === ' ' && !inQuotes()) {
      flush(true);
      continue;
    }

    current += ch;
  }

  if (strict && inQuotes()) {
    throw new TokenizeError('unterminated quote in input');
  }

  flush(false);

  return tokens;
}
