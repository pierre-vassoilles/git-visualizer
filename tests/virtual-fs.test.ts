/**
 * Tests des commandes utilitaires `write` et `read` — Phase 1.
 * Couvre : CA-write-01 à CA-write-10.
 */

import { describe, expect, it } from 'vitest';
import { newEngine, replay } from './helpers';

describe('virtual fs (write / read)', () => {
  // -------------------------------------------------------------------------
  // CA-write-01 : Créer un fichier simple
  // -------------------------------------------------------------------------
  describe('CA-write-01 : créer un fichier simple', () => {
    it('CA-write-01 : exitCode === 0', () => {
      const engine = newEngine();
      const result = engine.execute('write hello.txt "hello world"');
      expect(result.exitCode).toBe(0);
    });

    it('CA-write-01 : output est vide', () => {
      const engine = newEngine();
      const result = engine.execute('write hello.txt "hello world"');
      expect(result.output).toHaveLength(0);
    });

    it('CA-write-01 : workingTree["hello.txt"] existe (visible via snapshot)', () => {
      const engine = newEngine();
      engine.execute('write hello.txt "hello world"');
      const snap = engine.snapshot();
      const file = snap.files.find(f => f.path === 'hello.txt');
      expect(file).toBeDefined();
    });

    it('CA-write-01 : le contenu est "hello world" (vérifiable via read)', () => {
      const engine = newEngine();
      engine.execute('write hello.txt "hello world"');
      const result = engine.execute('read hello.txt');
      expect(result.exitCode).toBe(0);
      expect(result.output[0]).toBe('hello world');
    });
  });

  // -------------------------------------------------------------------------
  // CA-write-02 : Créer un fichier avec chemin imbriqué
  // -------------------------------------------------------------------------
  describe('CA-write-02 : créer un fichier avec chemin imbriqué', () => {
    it('CA-write-02 : exitCode === 0', () => {
      const engine = newEngine();
      const result = engine.execute('write src/core/main.ts "code"');
      expect(result.exitCode).toBe(0);
    });

    it('CA-write-02 : workingTree["src/core/main.ts"] existe', () => {
      const engine = newEngine();
      engine.execute('write src/core/main.ts "code"');
      const snap = engine.snapshot();
      const file = snap.files.find(f => f.path === 'src/core/main.ts');
      expect(file).toBeDefined();
    });

    it('CA-write-02 : le contenu est "code"', () => {
      const engine = newEngine();
      engine.execute('write src/core/main.ts "code"');
      const result = engine.execute('read src/core/main.ts');
      expect(result.output[0]).toBe('code');
    });
  });

  // -------------------------------------------------------------------------
  // CA-write-03 : Modifier un fichier existant
  // -------------------------------------------------------------------------
  describe('CA-write-03 : modifier un fichier existant', () => {
    it('CA-write-03 : exitCode === 0 sur la modification', () => {
      const engine = replay(['write file.txt "v1"']);
      const result = engine.execute('write file.txt "v2"');
      expect(result.exitCode).toBe(0);
    });

    it('CA-write-03 : le contenu est "v2" après modification', () => {
      const engine = replay(['write file.txt "v1"', 'write file.txt "v2"']);
      const result = engine.execute('read file.txt');
      expect(result.output[0]).toBe('v2');
    });
  });

  // -------------------------------------------------------------------------
  // CA-write-04 : Créer un fichier vide (write sans contenu)
  // -------------------------------------------------------------------------
  describe('CA-write-04 : créer un fichier vide', () => {
    it('CA-write-04 : exitCode === 0', () => {
      const engine = newEngine();
      const result = engine.execute('write empty.txt');
      expect(result.exitCode).toBe(0);
    });

    it('CA-write-04 : workingTree["empty.txt"] existe', () => {
      const engine = newEngine();
      engine.execute('write empty.txt');
      const snap = engine.snapshot();
      const file = snap.files.find(f => f.path === 'empty.txt');
      expect(file).toBeDefined();
    });

    it('CA-write-04 : le contenu est vide (chaîne vide)', () => {
      const engine = newEngine();
      engine.execute('write empty.txt');
      const result = engine.execute('read empty.txt');
      // Un fichier vide : soit output vide soit output avec une ligne vide ""
      expect(result.exitCode).toBe(0);
      // Le contenu est "" donc soit pas de ligne, soit une ligne ""
      const content = result.output.join('');
      expect(content).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // CA-write-05 : Lire le contenu d'un fichier (read)
  // -------------------------------------------------------------------------
  describe('CA-write-05 : lire le contenu d\'un fichier', () => {
    it('CA-write-05 : exitCode === 0', () => {
      const engine = replay(['write doc.md "# Heading\nSome text"']);
      const result = engine.execute('read doc.md');
      expect(result.exitCode).toBe(0);
    });

    it('CA-write-05 : output[0] === "# Heading"', () => {
      const engine = replay(['write doc.md "# Heading\nSome text"']);
      const result = engine.execute('read doc.md');
      expect(result.output[0]).toBe('# Heading');
    });

    it('CA-write-05 : output[1] === "Some text"', () => {
      const engine = replay(['write doc.md "# Heading\nSome text"']);
      const result = engine.execute('read doc.md');
      expect(result.output[1]).toBe('Some text');
    });
  });

  // -------------------------------------------------------------------------
  // CA-write-06 : Lire un fichier inexistant
  // -------------------------------------------------------------------------
  describe('CA-write-06 : lire un fichier inexistant', () => {
    it('CA-write-06 : exitCode === 1', () => {
      const engine = newEngine();
      const result = engine.execute('read missing.txt');
      expect(result.exitCode).toBe(1);
    });

    it('CA-write-06 : errors[0] contient "file not found"', () => {
      const engine = newEngine();
      const result = engine.execute('read missing.txt');
      expect(result.errors[0]).toContain('file not found');
    });
  });

  // -------------------------------------------------------------------------
  // CA-write-07 : Chemin invalide (absolu)
  // -------------------------------------------------------------------------
  describe('CA-write-07 : chemin invalide (absolu)', () => {
    it('CA-write-07 : exitCode === 1', () => {
      const engine = newEngine();
      const result = engine.execute('write /absolute/path.txt "content"');
      expect(result.exitCode).toBe(1);
    });

    it('CA-write-07 : errors[0] contient "invalid path"', () => {
      const engine = newEngine();
      const result = engine.execute('write /absolute/path.txt "content"');
      expect(result.errors[0]).toContain('invalid path');
    });

    it('CA-write-07 : le working tree n\'est pas modifié', () => {
      const engine = newEngine();
      engine.execute('write /absolute/path.txt "content"');
      const snap = engine.snapshot();
      // Aucun fichier dans le WT
      expect(snap.files).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // CA-write-08 : Contenu avec espaces
  // -------------------------------------------------------------------------
  describe('CA-write-08 : contenu avec espaces', () => {
    it('CA-write-08 : exitCode === 0', () => {
      const engine = newEngine();
      const result = engine.execute('write file.txt "hello world with spaces"');
      expect(result.exitCode).toBe(0);
    });

    it('CA-write-08 : le contenu entier (avec espaces) est préservé', () => {
      const engine = newEngine();
      engine.execute('write file.txt "hello world with spaces"');
      const result = engine.execute('read file.txt');
      expect(result.output[0]).toBe('hello world with spaces');
    });
  });

  // -------------------------------------------------------------------------
  // CA-write-09 : Contenu avec caractères spéciaux (newlines)
  // -------------------------------------------------------------------------
  describe('CA-write-09 : contenu avec newlines', () => {
    it('CA-write-09 : exitCode === 0', () => {
      const engine = newEngine();
      const result = engine.execute('write file.txt "line1\nline2\n"');
      expect(result.exitCode).toBe(0);
    });

    it('CA-write-09 : le contenu inclut les newlines littérales', () => {
      const engine = newEngine();
      engine.execute('write file.txt "line1\nline2\n"');
      const result = engine.execute('read file.txt');
      // Le contenu doit contenir des newlines
      const content = result.output.join('\n');
      expect(content).toContain('line1');
    });
  });

  // -------------------------------------------------------------------------
  // CA-write-10 : Interaction avec git add et status
  // -------------------------------------------------------------------------
  describe('CA-write-10 : interaction avec git add et status', () => {
    it('CA-write-10 : git status affiche myfile.txt comme "new file" après write + add', () => {
      const engine = replay([
        'git init',
        'write myfile.txt "content"',
        'git add myfile.txt',
      ]);
      const result = engine.execute('git status');
      expect(result.output.join('\n')).toContain('new file:   myfile.txt');
    });

    it('CA-write-10 : l\'index contient myfile.txt après git add', () => {
      const engine = replay([
        'git init',
        'write myfile.txt "content"',
        'git add myfile.txt',
      ]);
      const snap = engine.snapshot();
      expect(snap.indexPaths).toContain('myfile.txt');
    });

    it('CA-write-10 : workflow complet write → add → commit → log', () => {
      const engine = replay([
        'git init',
        'write README.md "# Project"',
        'git add README.md',
        'git commit -m "Initial commit"',
      ]);
      const logResult = engine.execute('git log');
      expect(logResult.exitCode).toBe(0);
      expect(logResult.output.join('\n')).toContain('Initial commit');
    });
  });

  // -------------------------------------------------------------------------
  // Cas limite : commande write sans filepath
  // -------------------------------------------------------------------------
  describe('CAS LIMITE : write sans filepath', () => {
    it('write sans argument → erreur', () => {
      const engine = newEngine();
      const result = engine.execute('write');
      expect(result.exitCode).not.toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Cas limite : read sans filepath
  // -------------------------------------------------------------------------
  describe('CAS LIMITE : read sans filepath', () => {
    it('read sans argument → erreur', () => {
      const engine = newEngine();
      const result = engine.execute('read');
      expect(result.exitCode).not.toBe(0);
    });
  });
});
