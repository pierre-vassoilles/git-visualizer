/**
 * Tests de `git log` — Phase 1.
 * Couvre : CA-log-01 à CA-log-10, plus cas limites.
 */

import { describe, expect, it } from 'vitest';
import { newEngine, replay } from './helpers';

/** Helper : joint l'output en string pour les assertions de contenu. */
function out(lines: string[]): string {
  return lines.join('\n');
}

describe('git log', () => {
  // -------------------------------------------------------------------------
  // CA-log-01 : Dépôt vierge, aucun commit
  // -------------------------------------------------------------------------
  describe('CA-log-01 : dépôt vierge, aucun commit', () => {
    it('CA-log-01 : exitCode === 1', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git log');
      expect(result.exitCode).toBe(1);
    });

    it('CA-log-01 : errors[0] contient "No commits yet"', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git log');
      expect(result.errors[0]).toContain('No commits yet');
    });

    it('CA-log-01 : output est vide', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git log');
      expect(result.output).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // CA-log-02 : Un commit unique
  // -------------------------------------------------------------------------
  describe('CA-log-02 : un seul commit', () => {
    it('CA-log-02 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write file.txt "hello"',
        'git add file.txt',
        'git commit -m "First commit"',
      ]);
      const result = engine.execute('git log');
      expect(result.exitCode).toBe(0);
    });

    it('CA-log-02 : output[0] commence par "commit " suivi d\'un hash 40 chars', () => {
      const engine = replay([
        'git init',
        'write file.txt "hello"',
        'git add file.txt',
        'git commit -m "First commit"',
      ]);
      const result = engine.execute('git log');
      expect(result.output[0]).toMatch(/^commit [0-9a-f]{40}$/);
    });

    it('CA-log-02 : output contient "Author: Unnamed <unnamed@example.com>"', () => {
      const engine = replay([
        'git init',
        'write file.txt "hello"',
        'git add file.txt',
        'git commit -m "First commit"',
      ]);
      const result = engine.execute('git log');
      expect(out(result.output)).toContain('Author: Unnamed <unnamed@example.com>');
    });

    it('CA-log-02 : output contient "Date:"', () => {
      const engine = replay([
        'git init',
        'write file.txt "hello"',
        'git add file.txt',
        'git commit -m "First commit"',
      ]);
      const result = engine.execute('git log');
      expect(out(result.output)).toContain('Date:');
    });

    it('CA-log-02 : output contient le message "First commit"', () => {
      const engine = replay([
        'git init',
        'write file.txt "hello"',
        'git add file.txt',
        'git commit -m "First commit"',
      ]);
      const result = engine.execute('git log');
      expect(out(result.output)).toContain('First commit');
    });
  });

  // -------------------------------------------------------------------------
  // CA-log-03 : Multiple commits
  // -------------------------------------------------------------------------
  describe('CA-log-03 : multiple commits', () => {
    it('CA-log-03 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write f.txt "a"',
        'git add f.txt',
        'git commit -m "First"',
        'write f.txt "b"',
        'git add f.txt',
        'git commit -m "Second"',
        'write f.txt "c"',
        'git add f.txt',
        'git commit -m "Third"',
      ]);
      const result = engine.execute('git log');
      expect(result.exitCode).toBe(0);
    });

    it('CA-log-03 : le premier commit affiché est "Third" (le plus récent)', () => {
      const engine = replay([
        'git init',
        'write f.txt "a"',
        'git add f.txt',
        'git commit -m "First"',
        'write f.txt "b"',
        'git add f.txt',
        'git commit -m "Second"',
        'write f.txt "c"',
        'git add f.txt',
        'git commit -m "Third"',
      ]);
      const result = engine.execute('git log');
      // Le premier bloc doit contenir "Third"
      const firstBlock = result.output.slice(0, 10).join('\n');
      expect(firstBlock).toContain('Third');
    });

    it('CA-log-03 : "Second" apparaît dans l\'output', () => {
      const engine = replay([
        'git init',
        'write f.txt "a"',
        'git add f.txt',
        'git commit -m "First"',
        'write f.txt "b"',
        'git add f.txt',
        'git commit -m "Second"',
        'write f.txt "c"',
        'git add f.txt',
        'git commit -m "Third"',
      ]);
      const result = engine.execute('git log');
      expect(out(result.output)).toContain('Second');
    });

    it('CA-log-03 : "First" apparaît dans l\'output', () => {
      const engine = replay([
        'git init',
        'write f.txt "a"',
        'git add f.txt',
        'git commit -m "First"',
        'write f.txt "b"',
        'git add f.txt',
        'git commit -m "Second"',
        'write f.txt "c"',
        'git add f.txt',
        'git commit -m "Third"',
      ]);
      const result = engine.execute('git log');
      expect(out(result.output)).toContain('First');
    });

    it('CA-log-03 : "Third" apparaît avant "First" dans l\'output', () => {
      const engine = replay([
        'git init',
        'write f.txt "a"',
        'git add f.txt',
        'git commit -m "First"',
        'write f.txt "b"',
        'git add f.txt',
        'git commit -m "Second"',
        'write f.txt "c"',
        'git add f.txt',
        'git commit -m "Third"',
      ]);
      const result = engine.execute('git log');
      const fullOutput = out(result.output);
      const posThird = fullOutput.indexOf('Third');
      const posFirst = fullOutput.indexOf('First');
      expect(posThird).toBeLessThan(posFirst);
    });
  });

  // -------------------------------------------------------------------------
  // CA-log-04 : Format --oneline avec un commit
  // -------------------------------------------------------------------------
  describe('CA-log-04 : format --oneline avec un commit', () => {
    it('CA-log-04 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
        'git commit -m "Initial"',
      ]);
      const result = engine.execute('git log --oneline');
      expect(result.exitCode).toBe(0);
    });

    it('CA-log-04 : output[0] contient un hash court (7 chars) et le message', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
        'git commit -m "Initial"',
      ]);
      const result = engine.execute('git log --oneline');
      expect(result.output[0]).toMatch(/^[0-9a-f]{7} .+/);
      expect(result.output[0]).toContain('Initial');
    });

    it('CA-log-04 : pas de ligne "Author:" dans --oneline', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
        'git commit -m "Initial"',
      ]);
      const result = engine.execute('git log --oneline');
      expect(out(result.output)).not.toContain('Author:');
    });

    it('CA-log-04 : pas de ligne "Date:" dans --oneline', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
        'git commit -m "Initial"',
      ]);
      const result = engine.execute('git log --oneline');
      expect(out(result.output)).not.toContain('Date:');
    });
  });

  // -------------------------------------------------------------------------
  // CA-log-05 : Format --oneline avec multiple commits
  // -------------------------------------------------------------------------
  describe('CA-log-05 : --oneline avec multiple commits', () => {
    it('CA-log-05 : exitCode === 0', () => {
      const engine = replay([
        'git init',
        'write f.txt "a"',
        'git add f.txt',
        'git commit -m "First"',
        'write f.txt "b"',
        'git add f.txt',
        'git commit -m "Second"',
        'write f.txt "c"',
        'git add f.txt',
        'git commit -m "Third"',
      ]);
      const result = engine.execute('git log --oneline');
      expect(result.exitCode).toBe(0);
    });

    it('CA-log-05 : output contient 3 lignes', () => {
      const engine = replay([
        'git init',
        'write f.txt "a"',
        'git add f.txt',
        'git commit -m "First"',
        'write f.txt "b"',
        'git add f.txt',
        'git commit -m "Second"',
        'write f.txt "c"',
        'git add f.txt',
        'git commit -m "Third"',
      ]);
      const result = engine.execute('git log --oneline');
      expect(result.output).toHaveLength(3);
    });

    it('CA-log-05 : output[0] contient "Third" (plus récent)', () => {
      const engine = replay([
        'git init',
        'write f.txt "a"',
        'git add f.txt',
        'git commit -m "First"',
        'write f.txt "b"',
        'git add f.txt',
        'git commit -m "Second"',
        'write f.txt "c"',
        'git add f.txt',
        'git commit -m "Third"',
      ]);
      const result = engine.execute('git log --oneline');
      expect(result.output[0]).toContain('Third');
    });

    it('CA-log-05 : output[1] contient "Second"', () => {
      const engine = replay([
        'git init',
        'write f.txt "a"',
        'git add f.txt',
        'git commit -m "First"',
        'write f.txt "b"',
        'git add f.txt',
        'git commit -m "Second"',
        'write f.txt "c"',
        'git add f.txt',
        'git commit -m "Third"',
      ]);
      const result = engine.execute('git log --oneline');
      expect(result.output[1]).toContain('Second');
    });

    it('CA-log-05 : output[2] contient "First" (plus ancien)', () => {
      const engine = replay([
        'git init',
        'write f.txt "a"',
        'git add f.txt',
        'git commit -m "First"',
        'write f.txt "b"',
        'git add f.txt',
        'git commit -m "Second"',
        'write f.txt "c"',
        'git add f.txt',
        'git commit -m "Third"',
      ]);
      const result = engine.execute('git log --oneline');
      expect(result.output[2]).toContain('First');
    });

    it('CA-log-05 : chaque ligne a le format "<SHORT_HASH> <message>"', () => {
      const engine = replay([
        'git init',
        'write f.txt "a"',
        'git add f.txt',
        'git commit -m "First"',
        'write f.txt "b"',
        'git add f.txt',
        'git commit -m "Second"',
        'write f.txt "c"',
        'git add f.txt',
        'git commit -m "Third"',
      ]);
      const result = engine.execute('git log --oneline');
      for (const line of result.output) {
        expect(line).toMatch(/^[0-9a-f]{7} .+/);
      }
    });
  });

  // -------------------------------------------------------------------------
  // CA-log-06 : Dépôt non initialisé
  // -------------------------------------------------------------------------
  describe('CA-log-06 : dépôt non initialisé', () => {
    it('CA-log-06 : exitCode === 128', () => {
      const engine = newEngine();
      const result = engine.execute('git log');
      expect(result.exitCode).toBe(128);
    });

    it('CA-log-06 : errors[0] contient "not a git repository"', () => {
      const engine = newEngine();
      const result = engine.execute('git log');
      expect(result.errors[0]).toContain('not a git repository');
    });
  });

  // -------------------------------------------------------------------------
  // CA-log-07 : Affichage de dates lisibles
  // -------------------------------------------------------------------------
  describe('CA-log-07 : affichage de dates lisibles', () => {
    it('CA-log-07 : output contient une ligne "Date: " au format lisible', () => {
      const engine = replay([
        'git init',
        'write file.txt "x"',
        'git add file.txt',
        'git commit -m "Dated commit"',
      ]);
      const result = engine.execute('git log');
      const dateLine = result.output.find(l => l.startsWith('Date:'));
      expect(dateLine).toBeDefined();
      // Format attendu : "Date:   <weekday> <month> <day> <HH:MM:SS> <year> +0000"
      expect(dateLine).toMatch(/Date:\s+\w{3} \w{3}\s+\d+ \d{2}:\d{2}:\d{2} \d{4} \+0000/);
    });
  });

  // -------------------------------------------------------------------------
  // CA-log-08 : Message multi-ligne en --oneline (première ligne seulement)
  // -------------------------------------------------------------------------
  describe('CA-log-08 : message multi-ligne en --oneline', () => {
    it('CA-log-08 : seule la première ligne du message est affichée', () => {
      const engine = replay([
        'git init',
        'write file.txt "content"',
        'git add file.txt',
        'git commit -m "First line\nSecond line\nThird line"',
      ]);
      const result = engine.execute('git log --oneline');
      expect(result.output[0]).toContain('First line');
      expect(result.output[0]).not.toContain('Second line');
      expect(result.output[0]).not.toContain('Third line');
    });
  });

  // -------------------------------------------------------------------------
  // CA-log-09 : Commits avec contenu différent, hashes différents
  // -------------------------------------------------------------------------
  describe('CA-log-09 : commits différents ont des hashes différents', () => {
    it('CA-log-09 : les deux commits ont des hashes différents', () => {
      const engine = replay([
        'git init',
        'write a.txt "first"',
        'git add a.txt',
        'git commit -m "First"',
        'write a.txt "second"',
        'git add a.txt',
        'git commit -m "Second"',
      ]);
      const snap = engine.snapshot();
      expect(snap.commits).toHaveLength(2);
      expect(snap.commits[0]?.hash).not.toBe(snap.commits[1]?.hash);
    });

    it('CA-log-09 : les deux commits sont listés avec leurs hashes', () => {
      const engine = replay([
        'git init',
        'write a.txt "first"',
        'git add a.txt',
        'git commit -m "First"',
        'write a.txt "second"',
        'git add a.txt',
        'git commit -m "Second"',
      ]);
      const snap = engine.snapshot();
      const result = engine.execute('git log');
      const fullOutput = out(result.output);
      expect(fullOutput).toContain(snap.commits[0]!.hash);
      expect(fullOutput).toContain(snap.commits[1]!.hash);
    });
  });

  // -------------------------------------------------------------------------
  // CA-log-10 : Hash court unique (7 caractères)
  // -------------------------------------------------------------------------
  describe('CA-log-10 : hash court de 7 caractères en --oneline', () => {
    it('CA-log-10 : chaque ligne commence par exactement 7 caractères hexadécimaux', () => {
      const engine = replay([
        'git init',
        'write f.txt "a"',
        'git add f.txt',
        'git commit -m "Commit 1"',
        'write f.txt "b"',
        'git add f.txt',
        'git commit -m "Commit 2"',
      ]);
      const result = engine.execute('git log --oneline');
      for (const line of result.output) {
        // Le hash court est exactement les 7 premiers chars, suivi d'un espace
        expect(line).toMatch(/^[0-9a-f]{7} /);
        // Vérification que le 8e caractère est un espace (pas un 8e hex)
        const parts = line.split(' ');
        expect(parts[0]).toHaveLength(7);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Cas limite supplémentaire : git log --oneline avec zéro commit
  // -------------------------------------------------------------------------
  describe('CAS LIMITE : git log --oneline sans commit', () => {
    it('exitCode === 1 et errors contient "No commits yet"', () => {
      const engine = replay(['git init']);
      const result = engine.execute('git log --oneline');
      expect(result.exitCode).toBe(1);
      expect(result.errors[0]).toContain('No commits yet');
    });
  });
});
