import { describe, it, expect } from 'vitest';
import { tokenize, TokenizeError } from '@/core/tokenizer';

describe('tokenizer — cas nominaux (défaut = comportement parser)', () => {
  it('découpe sur les espaces', () => {
    expect(tokenize('git status')).toEqual(['git', 'status']);
  });

  it('fusionne les espaces consécutifs', () => {
    expect(tokenize('git    status')).toEqual(['git', 'status']);
  });

  it('input vide → aucun token', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('espaces uniquement → aucun token', () => {
    expect(tokenize('    ')).toEqual([]);
  });

  it('pas de token vide en fin de ligne (espace final fusionné)', () => {
    expect(tokenize('git checkout ')).toEqual(['git', 'checkout']);
  });
});

describe('tokenizer — guillemets doubles', () => {
  it('regroupe un argument entre guillemets', () => {
    expect(tokenize('git commit -m "hello world"')).toEqual(['git', 'commit', '-m', 'hello world']);
  });

  it('les guillemets ne sont pas inclus dans le token', () => {
    expect(tokenize('write a.txt "# Title"')).toEqual(['write', 'a.txt', '# Title']);
  });

  it('un token explicitement vide ("") est émis', () => {
    expect(tokenize('git branch ""')).toEqual(['git', 'branch', '']);
  });

  it('guillemet collé à du texte', () => {
    expect(tokenize('a"b c"d')).toEqual(['ab cd']);
  });
});

describe('tokenizer — guillemets simples (option allowSingleQuotes)', () => {
  it("par défaut, l'apostrophe est littérale", () => {
    expect(tokenize("git commit -m 'hi there'")).toEqual(['git', 'commit', '-m', "'hi", "there'"]);
  });

  it('avec allowSingleQuotes, regroupe', () => {
    expect(tokenize("git commit -m 'hi there'", { allowSingleQuotes: true })).toEqual([
      'git',
      'commit',
      '-m',
      'hi there',
    ]);
  });

  it("un guillemet double à l'intérieur de simples est littéral", () => {
    expect(tokenize(`echo 'a"b'`, { allowSingleQuotes: true })).toEqual(['echo', 'a"b']);
  });
});

describe('tokenizer — échappements (option allowEscapes)', () => {
  it('par défaut, le backslash est littéral et le " reste un délimiteur', () => {
    // Sans échappements : `\` est un caractère normal, `"` ouvre un guillemet.
    // 'a\"b' → 'a' + '\' + (guillemet ouvert) + 'b' → token "a\b".
    expect(tokenize('a\\"b')).toEqual(['a\\b']);
  });

  it('avec allowEscapes, \\" devient un guillemet littéral', () => {
    expect(tokenize('a\\"b', { allowEscapes: true })).toEqual(['a"b']);
  });

  it('avec allowEscapes, espace échappé reste dans le token', () => {
    expect(tokenize('a\\ b', { allowEscapes: true })).toEqual(['a b']);
  });

  it('avec allowEscapes, \\\\ devient un seul backslash', () => {
    expect(tokenize('a\\\\b', { allowEscapes: true })).toEqual(['a\\b']);
  });
});

describe('tokenizer — guillemet non fermé (option strict)', () => {
  it('par défaut, le reste est avalé dans le token', () => {
    expect(tokenize('git commit -m "unclosed')).toEqual(['git', 'commit', '-m', 'unclosed']);
  });

  it('en mode strict, lève une TokenizeError', () => {
    expect(() => tokenize('git commit -m "unclosed', { strict: true })).toThrow(TokenizeError);
  });

  it('en mode strict, une ligne bien formée ne lève rien', () => {
    expect(() => tokenize('git commit -m "ok"', { strict: true })).not.toThrow();
  });
});

describe('tokenizer — keepEmptyTokens (sémantique autocomplétion)', () => {
  it('émet un token vide en fin de ligne après un espace', () => {
    expect(tokenize('git checkout ', { keepEmptyTokens: true })).toEqual(['git', 'checkout', '']);
  });

  it('sans espace final, pas de token vide', () => {
    expect(tokenize('git ch', { keepEmptyTokens: true })).toEqual(['git', 'ch']);
  });

  it('input vide → un token vide', () => {
    expect(tokenize('', { keepEmptyTokens: true })).toEqual(['']);
  });
});
