/**
 * Autocomplétion du terminal Git.
 *
 * Fonction pure, zéro import Vue — testable headless via Vitest.
 * Consomme le CommandCatalog du core et le RepoSnapshot du store.
 */

import type { CommandCatalog } from '@/core/catalog';
import type { RepoSnapshot } from '@/core/engine';
import { tokenize } from '@/core/tokenizer';

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export interface AutocompleteResult {
  /**
   * Candidat COMPLET qui doit remplacer le dernier token de l'input (vide si 0
   * ou plusieurs candidats). Préserve la casse du candidat, pas celle tapée :
   * `fe` → `Feature`. À insérer via `replaceLastToken(input, completion)`.
   * Pour un flag unique, un espace final est inclus (ex. `--amend `).
   */
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
  // Délègue au tokenizer commun (src/core/tokenizer.ts). `keepEmptyTokens`
  // reproduit la sémantique d'autocomplétion : un espace en fin de ligne
  // produit un token vide (« nouvel argument en cours »).
  return tokenize(input, { keepEmptyTokens: true });
}

/**
 * Remplace le dernier token de `input` par `replacement` (complet), en
 * préservant tout le préfixe inchangé. Utilisé pour insérer un candidat de
 * complétion tout en conservant SA casse (et non celle tapée par l'utilisateur).
 *
 * @example
 *   replaceLastToken("git checkout fe", "Feature") // → "git checkout Feature"
 *   replaceLastToken("git ch", "checkout")         // → "git checkout"
 *   replaceLastToken("git checkout ", "main")      // → "git checkout main"
 */
export function replaceLastToken(input: string, replacement: string): string {
  // Le dernier token commence après le dernier espace non quoté. Comme nos
  // refs/commandes ne contiennent pas d'espaces, repérer le dernier espace
  // suffit ; un input finissant par un espace ⇒ on ajoute simplement le candidat.
  const lastSpace = input.lastIndexOf(' ');
  if (lastSpace === -1) {
    // Pas d'espace : tout l'input est le token (cas dégénéré, peu probable ici).
    return replacement;
  }
  return input.slice(0, lastSpace + 1) + replacement;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Retourne le candidat COMPLET si un seul correspond (casse préservée), sinon
 * la chaîne vide. Contrairement à un suffixe, ce candidat est destiné à
 * REMPLACER le dernier token (via `replaceLastToken`) — d'où la casse correcte
 * même quand l'utilisateur a tapé `fe` pour une branche `Feature`.
 */
function singleCompletion(candidates: string[]): string {
  return candidates.length === 1 ? candidates[0]! : '';
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
  if (tokens.length <= 2) {
    const prefix = tokens.length === 1 ? '' : tokens[1].toLowerCase();
    const allNames = Object.keys(catalog.lookup).sort();
    const candidates = allNames.filter(name => name.toLowerCase().startsWith(prefix));

    if (candidates.length === 0) {
      return NONE;
    }

    const completion = singleCompletion(candidates);
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

    // Candidat complet + espace final (prêt pour l'argument du flag).
    const single = singleCompletion(flagNames);
    const completion = single ? single + ' ' : '';
    return { completion, candidates: flagNames, context: 'flag' };
  }

  // --- Complétion de REF (branches / tags) ---
  const prefix = lastToken.toLowerCase();
  const allRefs = getCandidateRefs(snapshot);
  const candidates = allRefs.filter(ref => ref.toLowerCase().startsWith(prefix));

  if (candidates.length === 0) {
    return NONE;
  }

  const completion = singleCompletion(candidates);
  return { completion, candidates, context: 'ref' };
}
