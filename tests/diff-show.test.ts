/**
 * Tests : git diff & git show (spec 42).
 * Boîte noire via execute() + tests unitaires du moteur pur (diffSides) pour les
 * cas non atteignables sans `git rm` / octets nuls (fichier supprimé, binaire).
 */

import { describe, it, expect } from 'vitest';
import { replay, newEngine } from './helpers';
import { diffSides, isBinary, type DiffSide } from '@/core/diff';

/** Vrai si une ligne est une ligne de contenu SUPPRIMÉ (`-x`), pas l'en-tête `---`. */
const isDeletedContent = (l: string) => /^-[^-]/.test(l);
/** Vrai si une ligne est une ligne de contenu AJOUTÉ (`+x`), pas l'en-tête `+++`. */
const isAddedContent = (l: string) => /^\+[^+]/.test(l);

function repoWithTwoVersions() {
  // C0 (file.txt:v0) ← C1 (HEAD, file.txt:v1)
  return replay([
    'git init',
    'write file.txt "v0"',
    'git add file.txt',
    'git commit -m "C0"',
    'write file.txt "v1"',
    'git add file.txt',
    'git commit -m "C1"',
  ]);
}

describe('git diff — working tree vs index', () => {
  it('CA-diff-show-01 : aucun changement → sortie vide', () => {
    const engine = repoWithTwoVersions();
    const r = engine.execute('git diff');
    expect(r.exitCode).toBe(0);
    expect(r.output.length).toBe(0);
  });

  it('CA-diff-show-02 : fichier modifié (non stagé)', () => {
    const engine = repoWithTwoVersions();
    engine.execute('write file.txt "v1-modified"');
    const r = engine.execute('git diff');
    expect(r.exitCode).toBe(0);
    expect(r.output[0]).toContain('diff --git a/file.txt b/file.txt');
    expect(r.output).toContain('--- a/file.txt');
    expect(r.output).toContain('+++ b/file.txt');
    expect(r.output).toContain('-v1');
    expect(r.output).toContain('+v1-modified');
    expect(r.output.some((l) => l.startsWith('@@'))).toBe(true);
  });

  it('CA-diff-show-07 : fichier ajouté (untracked) → pas de ligne supprimée', () => {
    const engine = replay([
      'git init',
      'write a.txt "content"',
      'git add a.txt',
      'git commit -m "C0"',
      'write b.txt "new file content"',
    ]);
    const r = engine.execute('git diff');
    expect(r.exitCode).toBe(0);
    expect(r.output[0]).toContain('diff --git a/b.txt b/b.txt');
    expect(r.output).toContain('new file mode 100644');
    expect(r.output).toContain('+new file content');
    expect(r.output.some(isDeletedContent)).toBe(false);
  });
});

describe('git diff --staged / --cached', () => {
  function repoStaged() {
    const engine = repoWithTwoVersions();
    engine.execute('write file.txt "v1-staged"');
    engine.execute('git add file.txt');
    return engine;
  }

  it('CA-diff-show-03 : index vs HEAD', () => {
    const r = repoStaged().execute('git diff --staged');
    expect(r.exitCode).toBe(0);
    expect(r.output[0]).toContain('diff --git a/file.txt b/file.txt');
    expect(r.output).toContain('-v1');
    expect(r.output).toContain('+v1-staged');
  });

  it('CA-diff-show-04 : --cached identique à --staged', () => {
    const a = repoStaged().execute('git diff --staged').output;
    const b = repoStaged().execute('git diff --cached').output;
    expect(b).toEqual(a);
  });
});

describe('git diff — avec commits/branches', () => {
  function repoThree() {
    return replay([
      'git init',
      'write file.txt "v0"',
      'git add file.txt',
      'git commit -m "C0"',
      'write file.txt "v1"',
      'git add file.txt',
      'git commit -m "C1"',
      'write file.txt "v2"',
      'git add file.txt',
      'git commit -m "C2"',
    ]);
  }

  it('CA-diff-show-05 : git diff <commit> (WT vs ancien commit)', () => {
    const engine = repoThree();
    engine.execute('write file.txt "v2-modified"');
    const c0 = engine.execute('git rev-parse HEAD~2').output[0]!;
    const r = engine.execute(`git diff ${c0}`);
    expect(r.exitCode).toBe(0);
    expect(r.output.join('\n')).toContain('diff --git a/file.txt');
    expect(r.output).toContain('-v0');
    expect(r.output).toContain('+v2-modified');
  });

  it('CA-diff-show-06 : git diff <c1> <c2>', () => {
    const engine = repoThree();
    const c0 = engine.execute('git rev-parse HEAD~2').output[0]!;
    const c2 = engine.execute('git rev-parse HEAD').output[0]!;
    const r = engine.execute(`git diff ${c0} ${c2}`);
    expect(r.exitCode).toBe(0);
    expect(r.output[0]).toContain('diff --git a/file.txt');
    expect(r.output).toContain('-v0');
    expect(r.output).toContain('+v2');
  });

  it('CA-diff-show-18 : git diff HEAD~1 HEAD', () => {
    const r = repoThree().execute('git diff HEAD~1 HEAD');
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain('-v1');
    expect(r.output).toContain('+v2');
  });

  it('CA-diff-show-19 : git diff <branch> (WT courant vs branche)', () => {
    const engine = replay([
      'git init',
      'write file.txt "base"',
      'git add file.txt',
      'git commit -m "base"',
      'git checkout -b feature',
      'write file.txt "feature"',
      'git add file.txt',
      'git commit -m "feat"',
      'git checkout -',
      'write file.txt "main"',
      'git add file.txt',
      'git commit -m "main"',
    ]);
    const r = engine.execute('git diff feature');
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain('-feature');
    expect(r.output).toContain('+main');
  });
});

describe('git diff — pathspec', () => {
  function repoThreeFiles() {
    const engine = replay([
      'git init',
      'write a.txt "A"',
      'write b.txt "B"',
      'write dir/c.txt "C"',
      'git add a.txt',
      'git add b.txt',
      'git add dir/c.txt',
      'git commit -m "C1"',
    ]);
    engine.execute('write a.txt "A-modified"');
    engine.execute('write b.txt "B-modified"');
    engine.execute('write dir/c.txt "C-modified"');
    return engine;
  }

  it('CA-diff-show-09 : -- a.txt dir/ limite aux chemins', () => {
    const r = repoThreeFiles().execute('git diff -- a.txt dir/');
    const joined = r.output.join('\n');
    expect(r.exitCode).toBe(0);
    expect(joined).toContain('diff --git a/a.txt');
    expect(joined).toContain('diff --git a/dir/c.txt');
    expect(joined).not.toContain('b.txt');
  });

  it('CA-diff-show-10 : pathspec inexistant → succès silencieux', () => {
    const r = repoThreeFiles().execute('git diff -- nonexistent.txt');
    expect(r.exitCode).toBe(0);
    expect(r.output.length).toBe(0);
  });
});

describe('git diff — multi-hunks', () => {
  it('CA-diff-show-20 : deux modifications éloignées → 2 hunks', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\n');
    const engine = replay([
      'git init',
      `write file.txt "${lines}"`,
      'git add file.txt',
      'git commit -m "C1"',
    ]);
    const modified = Array.from({ length: 20 }, (_, i) => {
      if (i === 2) return 'line3-CHANGED';
      if (i === 14) return 'line15-CHANGED';
      return `line${i + 1}`;
    }).join('\n');
    engine.execute(`write file.txt "${modified}"`);
    const r = engine.execute('git diff');
    expect(r.exitCode).toBe(0);
    const hunks = r.output.filter((l) => l.startsWith('@@'));
    expect(hunks.length).toBeGreaterThanOrEqual(2);
    expect(r.output).toContain('-line3');
    expect(r.output).toContain('+line3-CHANGED');
    expect(r.output).toContain('-line15');
    expect(r.output).toContain('+line15-CHANGED');
  });
});

describe('git diff — erreurs', () => {
  it('CA-diff-show-15 : commit inexistant → 128', () => {
    const r = repoWithTwoVersions().execute('git diff nosuchcommit');
    expect(r.exitCode).toBe(128);
    expect(r.errors[0]).toContain('unknown revision');
  });

  it('CA-diff-show-17 : dépôt non initialisé → 128', () => {
    const r = newEngine().execute('git diff');
    expect(r.exitCode).toBe(128);
    expect(r.errors[0]).toContain('not a git repository');
  });
});

describe('git show', () => {
  it('CA-diff-show-11 : git show HEAD → métadonnées + diff', () => {
    const engine = replay([
      'git init',
      'write file.txt "v0"',
      'git add file.txt',
      'git commit -m "C0"',
      'write file.txt "v1"',
      'git add file.txt',
      'git commit -m "Add file"',
    ]);
    const r = engine.execute('git show');
    expect(r.exitCode).toBe(0);
    const head = engine.execute('git rev-parse HEAD').output[0]!;
    expect(r.output[0]).toContain('commit');
    expect(r.output[0]).toContain(head);
    expect(r.output.some((l) => l.startsWith('Author:'))).toBe(true);
    expect(r.output.join('\n')).toContain('Add file');
    expect(r.output.join('\n')).toContain('diff --git');
    expect(r.output).toContain('-v0');
    expect(r.output).toContain('+v1');
  });

  it('CA-diff-show-12 : git show <commit>', () => {
    const engine = replay([
      'git init',
      'write file.txt "v0"',
      'git add file.txt',
      'git commit -m "C0"',
      'write file.txt "v1"',
      'git add file.txt',
      'git commit -m "Commit 1"',
      'write file.txt "v2"',
      'git add file.txt',
      'git commit -m "C2"',
    ]);
    const c1 = engine.execute('git rev-parse HEAD~1').output[0]!;
    const r = engine.execute(`git show ${c1}`);
    expect(r.exitCode).toBe(0);
    expect(r.output[0]).toContain(c1);
    expect(r.output.join('\n')).toContain('Commit 1');
    expect(r.output.join('\n')).toContain('diff --git');
    expect(r.output).toContain('-v0');
    expect(r.output).toContain('+v1');
  });

  it('CA-diff-show-13 : git show commit initial → diff vs arbre vide', () => {
    const engine = replay([
      'git init',
      'write file.txt "initial content"',
      'git add file.txt',
      'git commit -m "Initial"',
    ]);
    const c0 = engine.execute('git rev-parse HEAD').output[0]!;
    const r = engine.execute(`git show ${c0}`);
    expect(r.exitCode).toBe(0);
    expect(r.output[0]).toContain(c0);
    expect(r.output.join('\n')).toContain('Initial');
    expect(r.output.join('\n')).toContain('diff --git a/file.txt b/file.txt');
    expect(r.output).toContain('+initial content');
    expect(r.output.some(isDeletedContent)).toBe(false);
  });

  it('CA-diff-show-16 : git show sur dépôt vierge → 128', () => {
    const r = replay(['git init']).execute('git show');
    expect(r.exitCode).toBe(128);
    const msg = r.errors.join(' ');
    expect(msg.includes('does not have any commits yet') || msg.includes('unknown revision')).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Tests unitaires du moteur pur (diffSides) — cas non atteignables en boîte
// noire sans `git rm` (fichier supprimé) ni octets nuls (binaire).
// ---------------------------------------------------------------------------

describe('diffSides (pur) — cas spéciaux', () => {
  it('CA-diff-show-08 : fichier supprimé → en-tête deleted + lignes -', () => {
    const oldSide: DiffSide = {
      'file.txt': { content: 'content', hash: 'aaaaaaa', mode: '100644' },
    };
    const newSide: DiffSide = {};
    const { rawOutput, files } = diffSides(oldSide, newSide);
    expect(files[0]!.status).toBe('deleted');
    expect(rawOutput[0]).toContain('diff --git a/file.txt b/file.txt');
    expect(rawOutput).toContain('deleted file mode 100644');
    expect(rawOutput).toContain('-content');
    expect(rawOutput.some(isAddedContent)).toBe(false);
  });

  it('CA-diff-show-14 : fichier binaire → "Binary files ... differ"', () => {
    const oldSide: DiffSide = {
      'image.bin': { content: 'a\0b', hash: 'aaaaaaa', mode: '100644' },
    };
    const newSide: DiffSide = {
      'image.bin': { content: 'c\0d', hash: 'bbbbbbb', mode: '100644' },
    };
    const { rawOutput, files } = diffSides(oldSide, newSide);
    expect(files[0]!.binary).toBe(true);
    expect(rawOutput[0]).toContain('diff --git a/image.bin');
    const binLine = rawOutput.find((l) => l.includes('Binary files'));
    expect(binLine).toBeDefined();
    expect(binLine).toContain('differ');
  });

  it('isBinary détecte un octet nul', () => {
    expect(isBinary('a\0b')).toBe(true);
    expect(isBinary('hello')).toBe(false);
  });

  it('fichier ajouté (pur) → en-tête new file + @@ -0,0', () => {
    const { rawOutput } = diffSides(
      {},
      {
        'n.txt': { content: 'x\ny', hash: 'ccccccc', mode: '100644' },
      },
    );
    expect(rawOutput).toContain('new file mode 100644');
    expect(rawOutput.some((l) => l.startsWith('@@ -0,0'))).toBe(true);
    expect(rawOutput).toContain('+x');
    expect(rawOutput).toContain('+y');
  });
});
