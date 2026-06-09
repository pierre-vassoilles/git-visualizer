/**
 * Autocomplétion du terminal Git.
 *
 * Fonction pure, zéro import Vue — testable headless via Vitest.
 * Consomme le CommandCatalog du core et le RepoSnapshot du store.
 */

import type { CommandCatalog } from '@/core/catalog';
import type { RepoSnapshot } from '@/core/engine';

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export interface AutocompleteResult {
  /** Texte à insérer après l'input courant (vide si 0 ou plusieurs candidats). */
  completion: string;
  /** Candidats possibles (pour affichage). */
  candidates: string[];
  /** Contexte de complétion. */
  context: 'commandName' | 'flag' | 'ref' | 'none';
}

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

/**
 * Découpe une chaîne en tokens en respectant les guillemets doubles.
 * Si l'input se termine par un espace (hors guillemets), le dernier token
 * est "" (l'utilisateur commence un nouvel argument).
 *
 * Exemples :
 *   "git commit -m \"msg\""  → ["git", "commit", "-m", "msg"]
 *   "git checkout "          → ["git", "checkout", ""]
 *   "git ch"                 → ["git", "ch"]
 */
export function tokenizeInput(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      // ne pas inclure les guillemets dans le token
    } else if (ch === ' ' && !inQuotes) {
      tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  // Ajoute le dernier token (peut être "" si l'input finit par un espace)
  tokens.push(current);

  return tokens;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Retourne le suffixe à insérer si un seul candidat correspond. */
function singleCompletion(prefix: string, candidates: string[]): string {
  if (candidates.length === 1) {
    return candidates[0].slice(prefix.length);
  }
  return '';
}

/** Retourne les noms de refs (branches + tags) triés alphabétiquement. */
function getCandidateRefs(snapshot: RepoSnapshot): string[] {
  const refs = [
    ...Object.keys(snapshot.branches),
    ...Object.keys(snapshot.tags),
  ];
  return refs.sort();
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Calcule l'autocomplétion pour la ligne courante du terminal.
 *
 * Règles :
 * - L'input contient toujours le préfixe "git" (ex: "git ch").
 * - Si l'input se termine par un espace, le token courant est "" (nouvel arg).
 * - Insensible à la casse (normalise en minuscule pour comparer).
 *
 * @param input   - Ligne courante (avec "git " au début, ex: "git ch").
 * @param catalog - Catalogue des commandes (depuis engine.getCatalog()).
 * @param snapshot - Snapshot réactif du dépôt.
 */
export function autocomplete(
  input: string,
  catalog: CommandCatalog,
  snapshot: RepoSnapshot,
): AutocompleteResult {
  const NONE: AutocompleteResult = { completion: '', candidates: [], context: 'none' };

  const tokens = tokenizeInput(input);

  // L'input doit commencer par "git" (token 0).
  if (tokens.length === 0 || tokens[0].toLowerCase() !== 'git') {
    return NONE;
  }

  // --- Complétion du NOM DE COMMANDE (token 1) ---
  // tokens = ["git"] ou ["git", "<prefix>"]
  if (tokens.length === 1 || (tokens.length === 2 && tokens[1] !== undefined)) {
    const prefix = tokens.length === 1 ? '' : tokens[1].toLowerCase();
    const allNames = Object.keys(catalog.lookup).sort();
    const candidates = allNames.filter(name => name.toLowerCase().startsWith(prefix));

    if (candidates.length === 0) {
      return NONE;
    }

    const completion = singleCompletion(prefix, candidates);
    return { completion, candidates, context: 'commandName' };
  }

  // tokens.length >= 3 : tokens = ["git", "<cmd>", ..., "<current>"]
  const cmdName = tokens[1].toLowerCase();
  const meta = catalog.lookup[cmdName];

  if (!meta) {
    return NONE;
  }

  const lastToken = tokens[tokens.length - 1];

  // --- Complétion de FLAG (dernier token commence par "-") ---
  if (lastToken.startsWith('-')) {
    const prefix = lastToken.toLowerCase();
    // Filtrer les flags dont le nom commence par le préfixe
    // Exclure les placeholders comme "<pathspec>", "[<ref>]", etc.
    const flagNames = meta.flags
      .map(f => f.name)
      .filter(name => name.startsWith('-') && name.toLowerCase().startsWith(prefix))
      .sort();

    if (flagNames.length === 0) {
      return NONE;
    }

    const suffix = singleCompletion(prefix, flagNames);
    // Ajoute un espace après le flag si complétion unique
    const completion = suffix ? suffix + ' ' : '';
    return { completion, candidates: flagNames, context: 'flag' };
  }

  // --- Complétion de REF (branches / tags) ---
  const prefix = lastToken.toLowerCase();
  const allRefs = getCandidateRefs(snapshot);
  const candidates = allRefs.filter(ref => ref.toLowerCase().startsWith(prefix));

  if (candidates.length === 0) {
    return NONE;
  }

  const completion = singleCompletion(prefix, candidates);
  return { completion, candidates, context: 'ref' };
}
