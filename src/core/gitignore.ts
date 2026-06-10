/**
 * Support de `.gitignore` (spec 44) — module PUR, testable headless.
 *
 * Le fichier `.gitignore` du working tree (créé via `write`) contient des
 * patterns, un par ligne. On les compile en une liste ordonnée puis on évalue
 * chaque chemin selon la règle Git « last matching pattern wins » (un pattern
 * de négation `!…` apparu après peut ré-inclure un chemin ignoré).
 *
 * Sous-ensemble supporté : globs `*` (hors `/`), `?` (un caractère hors `/`),
 * `**` (récursif), chemins littéraux, ancrage par `/`, répertoires `dir/`,
 * négation `!`, commentaires `#`, lignes vides. Les patterns invalides sont
 * traités comme littéraux (jamais d'exception), comme Git.
 */

import type { Repository } from './model';

export interface IgnorePattern {
  /** Pattern de négation (`!…`) → ré-inclut. */
  readonly negated: boolean;
  /** Pattern terminé par `/` → ne match que des répertoires. */
  readonly dirOnly: boolean;
  /** Regex compilée (ancrée sur le chemin complet). */
  readonly re: RegExp;
}

/** Échappe les métacaractères regex (hors ceux gérés par le glob). */
function escapeRegexChar(c: string): string {
  return c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/** Convertit un body de pattern glob en source de regex. */
function globToRegexSource(body: string): string {
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c === '*') {
      if (body[i + 1] === '*') {
        // `**`
        if (body[i + 2] === '/') {
          out += '(?:.*/)?'; // `**/` = zéro ou plusieurs répertoires
          i += 2;
        } else {
          out += '.*'; // `**` ailleurs
          i += 1;
        }
      } else {
        out += '[^/]*'; // `*` = tout sauf le séparateur
      }
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += escapeRegexChar(c);
    }
  }
  return out;
}

/** Compile une ligne de pattern en `IgnorePattern`, ou null si à ignorer. */
function compilePattern(rawLine: string): IgnorePattern | null {
  const line = rawLine.trim();
  if (line === '' || line.startsWith('#')) return null;

  let body = line;
  const negated = body.startsWith('!');
  if (negated) body = body.slice(1);

  const dirOnly = body.endsWith('/');
  if (dirOnly) body = body.slice(0, -1);

  let anchored = body.includes('/');
  if (body.startsWith('/')) {
    anchored = true;
    body = body.slice(1);
  }
  if (body === '') return null;

  const src = globToRegexSource(body);
  const full = anchored ? `^${src}$` : `^(?:.*/)?${src}$`;
  let re: RegExp;
  try {
    re = new RegExp(full);
  } catch {
    // Pattern invalide → littéral (jamais d'exception).
    re = new RegExp(`^${escapeRegexChar(body)}$`);
  }
  return { negated, dirOnly, re };
}

/** Parse le contenu d'un `.gitignore` en liste ordonnée de patterns. */
export function parseGitignore(content: string): IgnorePattern[] {
  const out: IgnorePattern[] = [];
  for (const line of content.split('\n')) {
    const p = compilePattern(line);
    if (p) out.push(p);
  }
  return out;
}

/** Préfixes-répertoires d'un chemin (`a/b/c` → ['a', 'a/b']). */
function ancestorDirs(path: string): string[] {
  const parts = path.split('/');
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    out.push(parts.slice(0, i).join('/'));
  }
  return out;
}

/**
 * Un chemin est-il ignoré par la liste de patterns ?
 * Règle « last match wins » : on parcourt dans l'ordre, le dernier pattern qui
 * matche fixe l'état (ignoré si positif, ré-inclus si négation).
 */
export function isIgnored(path: string, patterns: IgnorePattern[]): boolean {
  const ancestors = ancestorDirs(path);
  let ignored = false;
  for (const pat of patterns) {
    let matched = false;
    if (pat.dirOnly) {
      // Ne match que des répertoires → uniquement les ancêtres.
      matched = ancestors.some((a) => pat.re.test(a));
    } else {
      matched = pat.re.test(path) || ancestors.some((a) => pat.re.test(a));
    }
    if (matched) ignored = !pat.negated;
  }
  return ignored;
}

/** Charge les patterns depuis le `.gitignore` du working tree (vide si absent). */
export function loadIgnorePatterns(repo: Repository): IgnorePattern[] {
  const entry = repo.workingTree['.gitignore'];
  return entry ? parseGitignore(entry.content) : [];
}
