/**
 * Tests : git rm & git mv (spec 43).
 * Boîte noire via execute() + git status -s + read + snapshot.
 */

import { describe, it, expect } from 'vitest';
import { replay, newEngine } from './helpers';

/** Statut court d'un chemin dans `git status -s` (ex. "D ", "??", "A "). */
function shortStatusOf(engine: ReturnType<typeof newEngine>, path: string): string | null {
  // Format court : "XY <path>" → code = slice(0,2), chemin = slice(3). Parse
  // exact (pas de suffixe) pour éviter qu'un chemin en chevauche un autre.
  const out = engine.execute('git status -s').output;
  const line = out.find((l) => l.slice(3) === path);
  return line ? line.slice(0, 2) : null;
}

function wtHas(engine: ReturnType<typeof newEngine>, path: string): boolean {
  return engine.execute(`read ${path}`).exitCode === 0;
}

function repoWithFile() {
  return replay(['git init', 'write file.txt "hello"', 'git add file.txt', 'git commit -m "C1"']);
}

describe('git rm', () => {
  it("CA-rm-mv-01 : supprime du WT et de l'index (status D)", () => {
    const engine = repoWithFile();
    const r = engine.execute('git rm file.txt');
    expect(r.exitCode).toBe(0);
    expect(r.output.length).toBe(0);
    expect(wtHas(engine, 'file.txt')).toBe(false);
    expect(shortStatusOf(engine, 'file.txt')).toBe('D ');
  });

  it('CA-rm-mv-02 : suppression committable', () => {
    const engine = repoWithFile();
    engine.execute('git rm file.txt');
    const c = engine.execute('git commit -m "Remove file"');
    expect(c.exitCode).toBe(0);
    // Le nouveau HEAD n'a plus le fichier.
    expect(engine.execute('git show').output.join('\n')).toContain('-hello');
  });

  it('CA-rm-mv-03 : fichier modifié non stagé → refus (exit 1)', () => {
    const engine = repoWithFile();
    engine.execute('write file.txt "hello-modified"');
    const r = engine.execute('git rm file.txt');
    expect(r.exitCode).toBe(1);
    expect(r.errors.join(' ')).toContain('local modifications');
    expect(wtHas(engine, 'file.txt')).toBe(true);
  });

  it("CA-rm-mv-04 : -f force la suppression d'un fichier modifié", () => {
    const engine = repoWithFile();
    engine.execute('write file.txt "hello-modified"');
    const r = engine.execute('git rm -f file.txt');
    expect(r.exitCode).toBe(0);
    expect(wtHas(engine, 'file.txt')).toBe(false);
    expect(shortStatusOf(engine, 'file.txt')).toBe('D ');
  });

  it('CA-rm-mv-05 : --cached désindexe mais garde le WT (status ??)', () => {
    const engine = repoWithFile();
    const r = engine.execute('git rm --cached file.txt');
    expect(r.exitCode).toBe(0);
    expect(wtHas(engine, 'file.txt')).toBe(true);
    expect(engine.execute('read file.txt').output.join('')).toContain('hello');
    expect(shortStatusOf(engine, 'file.txt')).toBe('??');
  });

  it('CA-rm-mv-06 : -r supprime un répertoire récursivement', () => {
    const engine = replay([
      'git init',
      'write dir/a.txt "A"',
      'write dir/b.txt "B"',
      'write file.txt "root"',
      'git add dir/a.txt',
      'git add dir/b.txt',
      'git add file.txt',
      'git commit -m "C1"',
    ]);
    const r = engine.execute('git rm -r dir/');
    expect(r.exitCode).toBe(0);
    expect(wtHas(engine, 'dir/a.txt')).toBe(false);
    expect(wtHas(engine, 'dir/b.txt')).toBe(false);
    expect(wtHas(engine, 'file.txt')).toBe(true);
    expect(shortStatusOf(engine, 'dir/a.txt')).toBe('D ');
    expect(shortStatusOf(engine, 'dir/b.txt')).toBe('D ');
  });

  it('CA-rm-mv-07 : pathspec inexistant → 128', () => {
    const engine = repoWithFile();
    const r = engine.execute('git rm nonexistent.txt');
    expect(r.exitCode).toBe(128);
    expect(r.errors[0]).toContain('did not match any files');
    expect(wtHas(engine, 'file.txt')).toBe(true);
  });

  it('CA-rm-mv-15 : changements stagés différents de HEAD → refus (exit 1)', () => {
    const engine = repoWithFile();
    engine.execute('write file.txt "v2"');
    engine.execute('git add file.txt');
    const r = engine.execute('git rm file.txt');
    expect(r.exitCode).toBe(1);
    expect(r.errors.join(' ')).toContain('staged content');
    expect(wtHas(engine, 'file.txt')).toBe(true);
  });

  it('CA-rm-mv-16 : dépôt non initialisé → 128', () => {
    const r = newEngine().execute('git rm file.txt');
    expect(r.exitCode).toBe(128);
    expect(r.errors[0]).toContain('not a git repository');
  });

  it('intégration : git rm puis git diff --staged montre la suppression (lève la dette B1)', () => {
    const engine = repoWithFile();
    engine.execute('git rm file.txt');
    const r = engine.execute('git diff --staged');
    expect(r.exitCode).toBe(0);
    expect(r.output[0]).toContain('diff --git a/file.txt b/file.txt');
    expect(r.output).toContain('deleted file mode 100644');
    expect(r.output).toContain('-hello');
    expect(r.output.some((l) => /^\+[^+]/.test(l))).toBe(false);
  });

  it('CA-rm-mv-18 : supprime plusieurs fichiers', () => {
    const engine = replay([
      'git init',
      'write a.txt "A"',
      'write b.txt "B"',
      'write c.txt "C"',
      'git add a.txt',
      'git add b.txt',
      'git add c.txt',
      'git commit -m "C1"',
    ]);
    const r = engine.execute('git rm a.txt c.txt');
    expect(r.exitCode).toBe(0);
    expect(wtHas(engine, 'a.txt')).toBe(false);
    expect(wtHas(engine, 'c.txt')).toBe(false);
    expect(wtHas(engine, 'b.txt')).toBe(true);
  });
});

describe('git mv', () => {
  it('CA-rm-mv-08 : renomme un fichier (contenu préservé)', () => {
    const engine = repoWithFile();
    const r = engine.execute('git mv file.txt renamed.txt');
    expect(r.exitCode).toBe(0);
    expect(r.output.length).toBe(0);
    expect(wtHas(engine, 'file.txt')).toBe(false);
    expect(engine.execute('read renamed.txt').output.join('')).toContain('hello');
    // index : ancien supprimé (D), nouveau ajouté (A).
    expect(shortStatusOf(engine, 'file.txt')).toBe('D ');
    expect(shortStatusOf(engine, 'renamed.txt')).toBe('A ');
  });

  it('CA-rm-mv-09 : destination = répertoire → déplace dedans', () => {
    const engine = replay([
      'git init',
      'write file.txt "content"',
      'write dir/keep.txt "keep"',
      'git add file.txt',
      'git add dir/keep.txt',
      'git commit -m "C1"',
    ]);
    const r = engine.execute('git mv file.txt dir/');
    expect(r.exitCode).toBe(0);
    expect(wtHas(engine, 'file.txt')).toBe(false);
    expect(engine.execute('read dir/file.txt').output.join('')).toContain('content');
  });

  it('CA-rm-mv-10 : destination existe → refus (128)', () => {
    const engine = replay([
      'git init',
      'write a.txt "A"',
      'write b.txt "B"',
      'git add a.txt',
      'git add b.txt',
      'git commit -m "C1"',
    ]);
    const r = engine.execute('git mv a.txt b.txt');
    expect(r.exitCode).toBe(128);
    expect(r.errors[0]).toContain('destination exists');
    expect(wtHas(engine, 'a.txt')).toBe(true);
    expect(engine.execute('read b.txt').output.join('')).toContain('B');
  });

  it('CA-rm-mv-11 : -f écrase la destination', () => {
    const engine = replay([
      'git init',
      'write a.txt "A"',
      'write b.txt "B"',
      'git add a.txt',
      'git add b.txt',
      'git commit -m "C1"',
    ]);
    const r = engine.execute('git mv -f a.txt b.txt');
    expect(r.exitCode).toBe(0);
    expect(wtHas(engine, 'a.txt')).toBe(false);
    expect(engine.execute('read b.txt').output.join('')).toContain('A');
  });

  it('CA-rm-mv-12 : source inexistante → 128', () => {
    const engine = repoWithFile();
    const r = engine.execute('git mv nonexistent.txt target.txt');
    expect(r.exitCode).toBe(128);
    const msg = r.errors.join(' ');
    expect(msg.includes('not found in index') || msg.includes('bad source')).toBe(true);
  });

  it('CA-rm-mv-13 : source === destination → 128', () => {
    const engine = repoWithFile();
    const r = engine.execute('git mv file.txt file.txt');
    expect(r.exitCode).toBe(128);
    expect(r.errors[0]).toContain('source and destination the same');
  });

  it('CA-rm-mv-17 : dépôt non initialisé → 128', () => {
    const r = newEngine().execute('git mv a.txt b.txt');
    expect(r.exitCode).toBe(128);
    expect(r.errors[0]).toContain('not a git repository');
  });

  it('CA-rm-mv-20 : renommage committable, contenu identique après commit', () => {
    const engine = replay([
      'git init',
      'write file.txt "unique content"',
      'git add file.txt',
      'git commit -m "C1"',
    ]);
    engine.execute('git mv file.txt newname.txt');
    const c = engine.execute('git commit -m "rename"');
    expect(c.exitCode).toBe(0);
    // Le contenu est préservé (le hash du blob est identique par construction :
    // mv réutilise la même entrée d'index).
    expect(engine.execute('read newname.txt').output.join('')).toContain('unique content');
    expect(wtHas(engine, 'file.txt')).toBe(false);
  });
});

describe('git rm — conflit delete/modify (dette Phase 4, CA-rm-mv-19)', () => {
  it("merge d'une branche qui supprime un fichier modifié sur main → conflit", () => {
    const engine = replay([
      'git init',
      'write file.txt "initial"',
      'git add file.txt',
      'git commit -m "C0"',
      'git checkout -b feature',
      'git rm file.txt',
      'git commit -m "remove file"',
      'git checkout -',
      'write file.txt "modified"',
      'git add file.txt',
      'git commit -m "modify file"',
    ]);
    const r = engine.execute('git merge feature');
    // Le comportement exact (conflit vs résolution auto) est vérifié ici ;
    // la spec attend un conflit delete/modify.
    expect(r.exitCode).toBe(1);
    expect(engine.snapshot().operationState?.type).toBe('merging');
  });
});
