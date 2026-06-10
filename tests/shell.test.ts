/**
 * Tests du découpage de chaînes de commandes (`;` et `&&`) — src/utils/shell.ts.
 */
import { describe, it, expect } from 'vitest';
import { splitCommandChain } from '@/utils/shell';

describe('splitCommandChain', () => {
  it('ligne simple → un seul segment sans opérateur', () => {
    expect(splitCommandChain('git status')).toEqual([{ command: 'git status', operator: null }]);
  });

  it('découpe sur `;`', () => {
    const segs = splitCommandChain('git init ; git status');
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ command: 'git init ', operator: null });
    expect(segs[1]).toEqual({ command: ' git status', operator: ';' });
  });

  it('découpe sur `&&`', () => {
    const segs = splitCommandChain('git add a && git commit -m x');
    expect(segs).toHaveLength(2);
    expect(segs[1]!.operator).toBe('&&');
  });

  it("mélange `;` et `&&` en gardant l'opérateur précédent", () => {
    const segs = splitCommandChain('a && b ; c');
    expect(segs.map((s) => s.operator)).toEqual([null, '&&', ';']);
    expect(segs.map((s) => s.command.trim())).toEqual(['a', 'b', 'c']);
  });

  it('ne découpe PAS sur un séparateur entre guillemets doubles', () => {
    const segs = splitCommandChain('git commit -m "fix; bug && hack"');
    expect(segs).toHaveLength(1);
    expect(segs[0]!.command).toBe('git commit -m "fix; bug && hack"');
  });

  it('ne découpe PAS entre guillemets simples', () => {
    const segs = splitCommandChain("git commit -m 'a && b'");
    expect(segs).toHaveLength(1);
  });

  it("un `&` isolé n'est pas un séparateur", () => {
    const segs = splitCommandChain('write f.txt "a & b"');
    expect(segs).toHaveLength(1);
  });

  it('segments vides conservés (`;` final)', () => {
    const segs = splitCommandChain('git status ;');
    expect(segs).toHaveLength(2);
    expect(segs[1]!.command.trim()).toBe('');
  });

  it('chaîne de clear et git', () => {
    const segs = splitCommandChain('clear && git log');
    expect(segs.map((s) => s.command.trim())).toEqual(['clear', 'git log']);
    expect(segs[1]!.operator).toBe('&&');
  });
});
