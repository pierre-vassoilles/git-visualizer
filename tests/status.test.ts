/**
 * Tests de `git status` — Phase 1.
 * Couvre : CA-status-01 à CA-status-09, plus cas limites.
 */

import { describe, expect, it } from 'vitest';
import { newEngine, replay } from './helpers';

/** Helper : joint l'output en string pour les assertions de contenu. */
function out(lines: string[]): string {
  return lines.join('\n');
}

describe('git status', () => {
  // -------------------------------------------------------------------------
  // CA-status-01 : Dépôt vide, aucun fichier
  // -------------------------------------------------------------------------
  describe('CA-status-01 : dépôt vide, aucun fichier', () => {
    it('CA-status-01 : exitCode === 0', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git status');
      expect(result.exitCode).toBe(0);
    });

    it('CA-status-01 : output[0] contient "On branch main"', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git status');
      expect(result.output[0]).toContain('On branch main');
    });

    it('CA-status-01 : output contient "No commits yet"', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('No commits yet');
    });

    it('CA-status-01 : output contient "nothing added to commit"', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('nothing added to commit');
    });

    it('CA-status-01 : pas de section "Changes to be committed"', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git status');
      expect(out(result.output)).not.toContain('Changes to be committed');
    });

    it('CA-status-01 : pas de section "Untracked files"', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git status');
      expect(out(result.output)).not.toContain('Untracked files');
    });
  });

  // -------------------------------------------------------------------------
  // CA-status-02 : Fichiers untracked seulement
  // -------------------------------------------------------------------------
  describe('CA-status-02 : fichiers untracked seulement', () => {
    it('CA-status-02 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write file1.txt "a"',
        'write file2.txt "b"',
        'write nested/file3.txt "c"',
      ]);
      const result = engine.execute('git status');
      expect(result.exitCode).toBe(0);
    });

    it('CA-status-02 : output contient "Untracked files:"', () => {
      const engine = replay([
        'git init',
        'write file1.txt "a"',
        'write file2.txt "b"',
        'write nested/file3.txt "c"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('Untracked files:');
    });

    it('CA-status-02 : output contient "file1.txt"', () => {
      const engine = replay([
        'git init',
        'write file1.txt "a"',
        'write file2.txt "b"',
        'write nested/file3.txt "c"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('file1.txt');
    });

    it('CA-status-02 : output contient "file2.txt"', () => {
      const engine = replay([
        'git init',
        'write file1.txt "a"',
        'write file2.txt "b"',
        'write nested/file3.txt "c"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('file2.txt');
    });

    it('CA-status-02 : output contient "nested/file3.txt"', () => {
      const engine = replay([
        'git init',
        'write file1.txt "a"',
        'write file2.txt "b"',
        'write nested/file3.txt "c"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('nested/file3.txt');
    });

    it('CA-status-02 : pas de section "Changes to be committed"', () => {
      const engine = replay([
        'git init',
        'write file1.txt "a"',
        'write file2.txt "b"',
        'write nested/file3.txt "c"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).not.toContain('Changes to be committed');
    });

    it('CA-status-02 : pas de section "Changes not staged for commit"', () => {
      const engine = replay([
        'git init',
        'write file1.txt "a"',
        'write file2.txt "b"',
        'write nested/file3.txt "c"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).not.toContain('Changes not staged for commit');
    });
  });

  // -------------------------------------------------------------------------
  // CA-status-03 : Fichiers stagés (avant le premier commit)
  // -------------------------------------------------------------------------
  describe('CA-status-03 : fichiers stagés avant le premier commit', () => {
    it('CA-status-03 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write a.txt "a"',
        'write b.txt "b"',
        'git add a.txt b.txt',
      ]);
      const result = engine.execute('git status');
      expect(result.exitCode).toBe(0);
    });

    it('CA-status-03 : output contient "Changes to be committed:"', () => {
      const engine = replay([
        'git init',
        'write a.txt "a"',
        'write b.txt "b"',
        'git add a.txt b.txt',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('Changes to be committed:');
    });

    it('CA-status-03 : output contient "new file:   a.txt"', () => {
      const engine = replay([
        'git init',
        'write a.txt "a"',
        'write b.txt "b"',
        'git add a.txt b.txt',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('new file:   a.txt');
    });

    it('CA-status-03 : output contient "new file:   b.txt"', () => {
      const engine = replay([
        'git init',
        'write a.txt "a"',
        'write b.txt "b"',
        'git add a.txt b.txt',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('new file:   b.txt');
    });

    it('CA-status-03 : pas de section "Untracked files"', () => {
      const engine = replay([
        'git init',
        'write a.txt "a"',
        'write b.txt "b"',
        'git add a.txt b.txt',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).not.toContain('Untracked files');
    });
  });

  // -------------------------------------------------------------------------
  // CA-status-04 : Mix de staged et untracked
  // -------------------------------------------------------------------------
  describe('CA-status-04 : mix staged et untracked', () => {
    it('CA-status-04 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write staged.txt "staged"',
        'write untracked.txt "untracked"',
        'git add staged.txt',
      ]);
      const result = engine.execute('git status');
      expect(result.exitCode).toBe(0);
    });

    it('CA-status-04 : output contient "Changes to be committed:"', () => {
      const engine = replay([
        'git init',
        'write staged.txt "staged"',
        'write untracked.txt "untracked"',
        'git add staged.txt',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('Changes to be committed:');
    });

    it('CA-status-04 : output contient "new file:   staged.txt"', () => {
      const engine = replay([
        'git init',
        'write staged.txt "staged"',
        'write untracked.txt "untracked"',
        'git add staged.txt',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('new file:   staged.txt');
    });

    it('CA-status-04 : output contient "Untracked files:"', () => {
      const engine = replay([
        'git init',
        'write staged.txt "staged"',
        'write untracked.txt "untracked"',
        'git add staged.txt',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('Untracked files:');
    });

    it('CA-status-04 : output contient "untracked.txt"', () => {
      const engine = replay([
        'git init',
        'write staged.txt "staged"',
        'write untracked.txt "untracked"',
        'git add staged.txt',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('untracked.txt');
    });
  });

  // -------------------------------------------------------------------------
  // CA-status-05 : Fichier modifié après staging (unstaged modification)
  // -------------------------------------------------------------------------
  describe('CA-status-05 : fichier modifié après commit, non re-stagé', () => {
    it('CA-status-05 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write doc.md "v1"',
        'git add doc.md',
        'git commit -m "First"',
        'write doc.md "v2"',
      ]);
      const result = engine.execute('git status');
      expect(result.exitCode).toBe(0);
    });

    it('CA-status-05 : output contient "Changes not staged for commit:"', () => {
      const engine = replay([
        'git init',
        'write doc.md "v1"',
        'git add doc.md',
        'git commit -m "First"',
        'write doc.md "v2"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('Changes not staged for commit:');
    });

    it('CA-status-05 : output contient "modified:   doc.md"', () => {
      const engine = replay([
        'git init',
        'write doc.md "v1"',
        'git add doc.md',
        'git commit -m "First"',
        'write doc.md "v2"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('modified:   doc.md');
    });

    it('CA-status-05 : pas de section "Changes to be committed"', () => {
      const engine = replay([
        'git init',
        'write doc.md "v1"',
        'git add doc.md',
        'git commit -m "First"',
        'write doc.md "v2"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).not.toContain('Changes to be committed:');
    });
  });

  // -------------------------------------------------------------------------
  // CA-status-06 : Fichier modifié, stagé, puis remodifié
  // -------------------------------------------------------------------------
  describe('CA-status-06 : fichier modifié, stagé, puis remodifié', () => {
    it('CA-status-06 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write file.txt "original"',
        'git add file.txt',
        'git commit -m "Initial"',
        'write file.txt "modified"',
        'git add file.txt',
        'write file.txt "remodified"',
      ]);
      const result = engine.execute('git status');
      expect(result.exitCode).toBe(0);
    });

    it('CA-status-06 : output contient "Changes to be committed:"', () => {
      const engine = replay([
        'git init',
        'write file.txt "original"',
        'git add file.txt',
        'git commit -m "Initial"',
        'write file.txt "modified"',
        'git add file.txt',
        'write file.txt "remodified"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('Changes to be committed:');
    });

    it('CA-status-06 : output contient "modified:   file.txt" (version stagée)', () => {
      const engine = replay([
        'git init',
        'write file.txt "original"',
        'git add file.txt',
        'git commit -m "Initial"',
        'write file.txt "modified"',
        'git add file.txt',
        'write file.txt "remodified"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('modified:   file.txt');
    });

    it('CA-status-06 : output contient "Changes not staged for commit:"', () => {
      const engine = replay([
        'git init',
        'write file.txt "original"',
        'git add file.txt',
        'git commit -m "Initial"',
        'write file.txt "modified"',
        'git add file.txt',
        'write file.txt "remodified"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('Changes not staged for commit:');
    });
  });

  // -------------------------------------------------------------------------
  // CA-status-07 : Format court (-s)
  // -------------------------------------------------------------------------
  describe('CA-status-07 : format court (-s)', () => {
    it('CA-status-07 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write untracked.txt "u"',
        'write staged.txt "s"',
        'write modified.txt "m"',
        'git add staged.txt',
        'git add modified.txt',
        'git commit -m "base"',
        'write modified.txt "m2"',
      ]);
      const result = engine.execute('git status -s');
      expect(result.exitCode).toBe(0);
    });

    it('CA-status-07 : output contient "?? untracked.txt"', () => {
      const engine = replay([
        'git init',
        'write untracked.txt "u"',
        'write staged.txt "s"',
        'write modified.txt "m"',
        'git add staged.txt',
        'git add modified.txt',
        'git commit -m "base"',
        'write staged.txt "s2"',
        'git add staged.txt',
        'write modified.txt "m2"',
      ]);
      const result = engine.execute('git status -s');
      expect(out(result.output)).toContain('?? untracked.txt');
    });

    it('CA-status-07 : output contient "A  staged.txt" (new staged file)', () => {
      // Cas : nouveau fichier stagé (pas de commit précédent pour ce fichier)
      const engine = replay([
        'git init',
        'write staged.txt "s"',
        'git add staged.txt',
      ]);
      const result = engine.execute('git status -s');
      expect(out(result.output)).toContain('A  staged.txt');
    });

    it('CA-status-07 : output contient " M modified.txt" (modification unstaged)', () => {
      const engine = replay([
        'git init',
        'write modified.txt "original"',
        'git add modified.txt',
        'git commit -m "base"',
        'write modified.txt "changed"',
      ]);
      const result = engine.execute('git status -s');
      expect(out(result.output)).toContain(' M modified.txt');
    });
  });

  // -------------------------------------------------------------------------
  // CA-status-08 : Dépôt non initialisé
  // -------------------------------------------------------------------------
  describe('CA-status-08 : dépôt non initialisé', () => {
    it('CA-status-08 : exitCode === 128', () => {
      const engine = newEngine();
      const result = engine.execute('git status');
      expect(result.exitCode).toBe(128);
    });

    it('CA-status-08 : errors[0] contient "not a git repository"', () => {
      const engine = newEngine();
      const result = engine.execute('git status');
      expect(result.errors[0]).toContain('not a git repository');
    });
  });

  // -------------------------------------------------------------------------
  // CA-status-09 : Dépôt avec commits, état propre
  // -------------------------------------------------------------------------
  describe('CA-status-09 : dépôt avec commits, état propre', () => {
    it('CA-status-09 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
        'git commit -m "First"',
      ]);
      const result = engine.execute('git status');
      expect(result.exitCode).toBe(0);
    });

    it('CA-status-09 : output contient "On branch main"', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
        'git commit -m "First"',
      ]);
      const result = engine.execute('git status');
      expect(result.output[0]).toContain('On branch main');
    });

    it('CA-status-09 : output contient "nothing to commit, working tree clean"', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
        'git commit -m "First"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).toContain('nothing to commit, working tree clean');
    });

    it('CA-status-09 : pas de section "Changes to be committed"', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
        'git commit -m "First"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).not.toContain('Changes to be committed');
    });

    it('CA-status-09 : pas de section "Changes not staged"', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
        'git commit -m "First"',
      ]);
      const result = engine.execute('git status');
      expect(out(result.output)).not.toContain('Changes not staged');
    });
  });
});
