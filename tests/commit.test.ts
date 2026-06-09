/**
 * Tests de `git commit` — Phase 1.
 * Couvre : CA-commit-01 à CA-commit-10, plus cas limites.
 */

import { describe, expect, it } from 'vitest';
import { newEngine, replay } from './helpers';

describe('git commit', () => {
  // -------------------------------------------------------------------------
  // CA-commit-01 : Premier commit
  // -------------------------------------------------------------------------
  describe('CA-commit-01 : premier commit', () => {
    it('CA-commit-01 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
      ]);
      const result = engine.execute('git commit -m "First commit"');
      expect(result.exitCode).toBe(0);
    });

    it('CA-commit-01 : output[0] contient "First commit"', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
      ]);
      const result = engine.execute('git commit -m "First commit"');
      expect(result.output[0]).toContain('First commit');
    });

    it('CA-commit-01 : un commit a été créé', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
        'git commit -m "First commit"',
      ]);
      const snap = engine.snapshot();
      expect(snap.commits).toHaveLength(1);
    });

    it('CA-commit-01 : le commit est de type "commit" (via snapshot)', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
        'git commit -m "First commit"',
      ]);
      const snap = engine.snapshot();
      // Le snapshot liste les commits avec leurs hashes
      expect(snap.commits[0]?.hash).toMatch(/^[0-9a-f]{40}$/);
    });

    it('CA-commit-01 : le commit n\'a pas de parents (commit racine)', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
        'git commit -m "First commit"',
      ]);
      const snap = engine.snapshot();
      expect(snap.commits[0]?.parents).toHaveLength(0);
    });

    it('CA-commit-01 : le message du commit est "First commit"', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
        'git commit -m "First commit"',
      ]);
      const snap = engine.snapshot();
      expect(snap.commits[0]?.message).toBe('First commit');
    });

    it('CA-commit-01 : refs.heads.main pointe vers le commit (via snapshot branches)', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
        'git commit -m "First commit"',
      ]);
      const snap = engine.snapshot();
      const commitHash = snap.commits[0]?.hash;
      expect(commitHash).toBeDefined();
      expect(snap.branches['main']).toBe(commitHash);
    });

    it('CA-commit-01 : l\'index reste aligné sur le commit (non vidé)', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
        'git commit -m "First commit"',
      ]);
      const snap = engine.snapshot();
      expect(snap.indexPaths).toEqual(['hello.txt']);
    });

    it('CA-commit-01 : output[0] contient "(root-commit)" pour le premier commit', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
      ]);
      const result = engine.execute('git commit -m "First commit"');
      expect(result.output[0]).toContain('root-commit');
    });
  });

  // -------------------------------------------------------------------------
  // CA-commit-02 : Deuxième commit (avec parent)
  // -------------------------------------------------------------------------
  describe('CA-commit-02 : deuxième commit avec parent', () => {
    it('CA-commit-02 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
        'git commit -m "First"',
        'write world.txt "world"',
        'git add world.txt',
      ]);
      const result = engine.execute('git commit -m "Add world file"');
      expect(result.exitCode).toBe(0);
    });

    it('CA-commit-02 : output[0] contient "Add world file"', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
        'git commit -m "First"',
        'write world.txt "world"',
        'git add world.txt',
      ]);
      const result = engine.execute('git commit -m "Add world file"');
      expect(result.output[0]).toContain('Add world file');
    });

    it('CA-commit-02 : deux commits dans l\'historique', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
        'git commit -m "First"',
        'write world.txt "world"',
        'git add world.txt',
        'git commit -m "Add world file"',
      ]);
      const snap = engine.snapshot();
      expect(snap.commits).toHaveLength(2);
    });

    it('CA-commit-02 : le second commit a 1 parent', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
        'git commit -m "First"',
        'write world.txt "world"',
        'git add world.txt',
        'git commit -m "Add world file"',
      ]);
      const snap = engine.snapshot();
      // snap.commits[0] est le plus récent
      expect(snap.commits[0]?.parents).toHaveLength(1);
    });

    it('CA-commit-02 : le parent du second commit est le premier commit', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
        'git commit -m "First"',
        'write world.txt "world"',
        'git add world.txt',
        'git commit -m "Add world file"',
      ]);
      const snap = engine.snapshot();
      const firstCommitHash = snap.commits[1]?.hash;
      const parentHash = snap.commits[0]?.parents[0];
      expect(parentHash).toBe(firstCommitHash);
    });

    it('CA-commit-02 : refs.heads.main pointe vers le nouveau commit', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
        'git commit -m "First"',
        'write world.txt "world"',
        'git add world.txt',
        'git commit -m "Add world file"',
      ]);
      const snap = engine.snapshot();
      expect(snap.branches['main']).toBe(snap.commits[0]?.hash);
    });

    it('CA-commit-02 : index aligné sur les deux fichiers après le second commit', () => {
      const engine = replay([
        'git init',
        'write hello.txt "hello"',
        'git add hello.txt',
        'git commit -m "First"',
        'write world.txt "world"',
        'git add world.txt',
        'git commit -m "Add world file"',
      ]);
      const snap = engine.snapshot();
      expect([...snap.indexPaths].sort()).toEqual(['hello.txt', 'world.txt']);
    });
  });

  // -------------------------------------------------------------------------
  // CA-commit-03 : Modification d'un fichier existant
  // -------------------------------------------------------------------------
  describe('CA-commit-03 : modification d\'un fichier existant', () => {
    it('CA-commit-03 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write file.txt "original"',
        'git add file.txt',
        'git commit -m "Initial"',
        'write file.txt "modified"',
        'git add file.txt',
      ]);
      const result = engine.execute('git commit -m "Modify file"');
      expect(result.exitCode).toBe(0);
    });

    it('CA-commit-03 : deux commits dans l\'historique', () => {
      const engine = replay([
        'git init',
        'write file.txt "original"',
        'git add file.txt',
        'git commit -m "Initial"',
        'write file.txt "modified"',
        'git add file.txt',
        'git commit -m "Modify file"',
      ]);
      const snap = engine.snapshot();
      expect(snap.commits).toHaveLength(2);
    });

    it('CA-commit-03 : refs.heads.main pointe vers le nouveau commit', () => {
      const engine = replay([
        'git init',
        'write file.txt "original"',
        'git add file.txt',
        'git commit -m "Initial"',
        'write file.txt "modified"',
        'git add file.txt',
        'git commit -m "Modify file"',
      ]);
      const snap = engine.snapshot();
      expect(snap.branches['main']).toBe(snap.commits[0]?.hash);
    });
  });

  // -------------------------------------------------------------------------
  // CA-commit-04 : Index vide, rien à committer
  // -------------------------------------------------------------------------
  describe('CA-commit-04 : index vide, rien à committer', () => {
    it('CA-commit-04 : exitCode === 1', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git commit -m "Rien"');
      expect(result.exitCode).toBe(1);
    });

    it('CA-commit-04 : errors[0] contient "no changes added to commit"', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git commit -m "Rien"');
      expect(result.errors[0]).toContain('no changes added to commit');
    });

    it('CA-commit-04 : aucun commit n\'est créé', () => {
      const engine = replay(['git init']);
      engine.execute('git commit -m "Rien"');
      const snap = engine.snapshot();
      expect(snap.commits).toHaveLength(0);
    });

    it('CAS LIMITE index vide : git commit après un premier commit sans nouvel add → échec', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
        'git commit -m "First"',
      ]);
      // L'index est maintenant vide ; un second commit doit échouer
      const result = engine.execute('git commit -m "Should fail"');
      expect(result.exitCode).toBe(1);
      expect(result.errors[0]).toContain('no changes added to commit');
    });
  });

  // -------------------------------------------------------------------------
  // CA-commit-05 : Message vide
  // -------------------------------------------------------------------------
  describe('CA-commit-05 : message vide', () => {
    it('CA-commit-05 : exitCode === 1', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
      ]);
      const result = engine.execute('git commit -m ""');
      expect(result.exitCode).toBe(1);
    });

    it('CA-commit-05 : errors[0] contient "message cannot be empty"', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
      ]);
      const result = engine.execute('git commit -m ""');
      expect(result.errors[0]).toContain('message cannot be empty');
    });

    it('CA-commit-05 : aucun commit n\'est créé', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
        'git commit -m ""',
      ]);
      const snap = engine.snapshot();
      expect(snap.commits).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // CA-commit-06 : Option -m manquante
  // -------------------------------------------------------------------------
  describe('CA-commit-06 : option -m manquante', () => {
    it('CA-commit-06 : exitCode === 1', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
      ]);
      const result = engine.execute('git commit');
      expect(result.exitCode).toBe(1);
    });

    it('CA-commit-06 : errors[0] contient "option \'-m\' is required"', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
      ]);
      const result = engine.execute('git commit');
      expect(result.errors[0]).toContain("-m' is required");
    });

    it('CA-commit-06 : aucun commit n\'est créé', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
        'git commit',
      ]);
      const snap = engine.snapshot();
      expect(snap.commits).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // CA-commit-07 : Multiple fichiers stagés dans un commit
  // -------------------------------------------------------------------------
  describe('CA-commit-07 : multiple fichiers stagés', () => {
    it('CA-commit-07 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write a.txt "A"',
        'write b.txt "B"',
        'write c.txt "C"',
        'git add a.txt b.txt c.txt',
      ]);
      const result = engine.execute('git commit -m "Three files"');
      expect(result.exitCode).toBe(0);
    });

    it('CA-commit-07 : un commit a été créé', () => {
      const engine = replay([
        'git init',
        'write a.txt "A"',
        'write b.txt "B"',
        'write c.txt "C"',
        'git add a.txt b.txt c.txt',
        'git commit -m "Three files"',
      ]);
      const snap = engine.snapshot();
      expect(snap.commits).toHaveLength(1);
    });

    it('CA-commit-07 : l\'index reste aligné sur les fichiers committés (non vidé)', () => {
      const engine = replay([
        'git init',
        'write a.txt "A"',
        'write b.txt "B"',
        'write c.txt "C"',
        'git add a.txt b.txt c.txt',
        'git commit -m "Three files"',
      ]);
      const snap = engine.snapshot();
      expect([...snap.indexPaths].sort()).toEqual(['a.txt', 'b.txt', 'c.txt']);
    });
  });

  // -------------------------------------------------------------------------
  // CA-commit-08 : Hash du commit est déterministe
  // -------------------------------------------------------------------------
  describe('CA-commit-08 : déterminisme du hash de commit', () => {
    it('CA-commit-08 : deux engines avec la même séquence produisent le même hash', () => {
      const commands = [
        'git init',
        'write file.txt "same content"',
        'git add file.txt',
        'git commit -m "Same message"',
      ];
      const engine1 = replay(commands);
      const engine2 = replay(commands);
      expect(engine1.snapshot().commits[0]?.hash).toBe(
        engine2.snapshot().commits[0]?.hash,
      );
    });

    it('CA-commit-08 : même contenu, même message → hash identique', () => {
      const run = () => {
        const engine = replay([
          'git init',
          'write hello.txt "hello world"',
          'git add hello.txt',
          'git commit -m "Initial"',
        ]);
        return engine.snapshot().commits[0]?.hash;
      };
      expect(run()).toBe(run());
    });
  });

  // -------------------------------------------------------------------------
  // CA-commit-09 : Dépôt non initialisé
  // -------------------------------------------------------------------------
  describe('CA-commit-09 : dépôt non initialisé', () => {
    it('CA-commit-09 : exitCode === 128', () => {
      const engine = newEngine();
      const result = engine.execute('git commit -m "msg"');
      expect(result.exitCode).toBe(128);
    });

    it('CA-commit-09 : errors[0] contient "not a git repository"', () => {
      const engine = newEngine();
      const result = engine.execute('git commit -m "msg"');
      expect(result.errors[0]).toContain('not a git repository');
    });
  });

  // -------------------------------------------------------------------------
  // CA-commit-10 : Multiple pathspecs puis commit avec fichier re-stagé
  // -------------------------------------------------------------------------
  describe('CA-commit-10 : multiple fichiers avec re-staging', () => {
    it('CA-commit-10 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write file1.txt "f1"',
        'write file2.txt "f2"',
        'write file3.txt "f3"',
        'git add file1.txt file2.txt file3.txt',
        'write file2.txt "f2-modified"',
        'git add file2.txt',
      ]);
      const result = engine.execute('git commit -m "All three with file2 modified"');
      expect(result.exitCode).toBe(0);
    });

    it('CA-commit-10 : le commit contient les trois fichiers', () => {
      const engine = replay([
        'git init',
        'write file1.txt "f1"',
        'write file2.txt "f2"',
        'write file3.txt "f3"',
        'git add file1.txt file2.txt file3.txt',
        'write file2.txt "f2-modified"',
        'git add file2.txt',
        'git commit -m "All three with file2 modified"',
      ]);
      const snap = engine.snapshot();
      expect(snap.commits).toHaveLength(1);
      // Après commit l'index est vide et le WT contient les 3 fichiers
      // On vérifie via git log + status que tout est propre
      const statusResult = engine.execute('git status');
      // Le WT est propre (les 3 fichiers dans le commit correspondent au WT)
      expect(statusResult.output.join('\n')).toContain('nothing to commit');
    });
  });
});
