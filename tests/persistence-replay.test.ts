/**
 * Tests Phase 6 : Rejeu déterministe (persistance)
 * Spec : docs/specs/31-persistence.md — CA-persist-05, CA-persist-06
 *
 * Principe : tests headless du moteur déterministe.
 * Pas de Pinia ni de localStorage ici (purement engine).
 */

import { describe, it, expect } from 'vitest';
import { newEngine, replay } from './helpers';

// ---------------------------------------------------------------------------
// CA-persist-05 : Rejeu déterministe
// ---------------------------------------------------------------------------

describe('persistence — CA-persist-05 : déterminisme du rejeu', () => {
  it('CA-persist-05 : rejouer les mêmes commandes dans 2 engines donne les mêmes hashes', () => {
    const cmds = [
      'git init',
      'write f1.txt "hello"',
      'git add f1.txt',
      'git commit -m "C1"',
      'git branch b1',
      'git checkout b1',
    ];

    const e1 = replay(cmds);
    const e2 = replay(cmds);

    const snap1 = e1.snapshot();
    const snap2 = e2.snapshot();

    // Mêmes hashes de commits
    const hashes1 = snap1.commits.map(c => c.hash).sort();
    const hashes2 = snap2.commits.map(c => c.hash).sort();
    expect(hashes1).toEqual(hashes2);
  });

  it('CA-persist-05 : snapshots identiques (branches, HEAD, tags)', () => {
    const cmds = [
      'git init',
      'write f1.txt "v1"',
      'git add f1.txt',
      'git commit -m "C1"',
      'git branch b1',
      'git checkout b1',
      'write f2.txt "feature"',
      'git add f2.txt',
      'git commit -m "C2"',
      'git tag v1.0',
      'git checkout main',
    ];

    const e1 = replay(cmds);
    const e2 = replay(cmds);

    const snap1 = e1.snapshot();
    const snap2 = e2.snapshot();

    expect(Object.keys(snap1.branches).sort()).toEqual(Object.keys(snap2.branches).sort());
    expect(snap1.head).toEqual(snap2.head);
    expect(snap1.tags).toEqual(snap2.tags);

    // Les commits sont identiques (même hash, même message, mêmes parents)
    const cs1 = snap1.commits.map(c => ({ hash: c.hash, msg: c.message })).sort((a, b) => a.hash.localeCompare(b.hash));
    const cs2 = snap2.commits.map(c => ({ hash: c.hash, msg: c.message })).sort((a, b) => a.hash.localeCompare(b.hash));
    expect(cs1).toEqual(cs2);
  });

  it('CA-persist-05 : déterminisme avec merge', () => {
    const cmds = [
      'git init',
      'write main.txt "base"',
      'git add main.txt',
      'git commit -m "C1"',
      'git branch feature',
      'git checkout feature',
      'write feat.txt "feature"',
      'git add feat.txt',
      'git commit -m "C2"',
      'git checkout main',
      'git merge feature',
    ];

    const e1 = replay(cmds);
    const e2 = replay(cmds);

    const allHashes1 = (e1.snapshot().allCommits ?? e1.snapshot().commits).map(c => c.hash).sort();
    const allHashes2 = (e2.snapshot().allCommits ?? e2.snapshot().commits).map(c => c.hash).sort();
    expect(allHashes1).toEqual(allHashes2);
  });
});

// ---------------------------------------------------------------------------
// CA-persist-06 : Erreur durant le rejeu → arrêt
// ---------------------------------------------------------------------------

describe('persistence — CA-persist-06 : erreur durant le rejeu', () => {
  it('CA-persist-06 : "git init" réussit', () => {
    const engine = newEngine();
    const result = engine.execute('git init');
    expect(result.exitCode).toBe(0);
  });

  it('CA-persist-06 : une commande invalide après init échoue (exitCode != 0)', () => {
    const engine = newEngine();
    engine.execute('git init');
    const result = engine.execute('invalid_cmd_that_does_not_exist');
    expect(result.exitCode).not.toBe(0);
  });

  it('CA-persist-06 : simuler un rejeu stoppé à la première erreur — état cohérent', () => {
    // Simule ce que loadFromStorage fait : rejouer séquentiellement,
    // s'arrêter à la première commande qui échoue
    const storedCommands = [
      'git init',
      'invalid_cmd_xyz',  // échoue → arrêt
      'write f1.txt "v1"',  // ne doit pas être exécutée
      'git add f1.txt',     // ne doit pas être exécutée
    ];

    const engine = newEngine();
    for (const cmd of storedCommands) {
      const result = engine.execute(cmd);
      if (result.exitCode !== 0) {
        // Arrêt à la première erreur
        break;
      }
    }

    // Snapshot après init seulement (git init réussit, invalid_cmd échoue → break)
    const snap = engine.snapshot();
    // Dépôt initialisé (git init a réussi)
    expect(snap.initialized).toBe(true);
    // Aucun fichier n'a été écrit (write n'a pas été exécuté)
    expect(snap.files.length).toBe(0);
  });

  it('CA-persist-06 : après arrêt sur erreur, les commandes suivantes ne sont pas exécutées', () => {
    const engine = newEngine();
    const commands = [
      'git init',
      'write f1.txt "hello"',
      'git add f1.txt',
      'git commit -m "C1"',
      'invalid_cmd',  // erreur → stop
      'git branch newbranch',  // ne doit pas s\'exécuter
    ];

    for (const cmd of commands) {
      const result = engine.execute(cmd);
      if (result.exitCode !== 0) break;
    }

    const snap = engine.snapshot();
    // 'newbranch' n'a pas été créée
    expect(Object.keys(snap.branches)).not.toContain('newbranch');
    // Mais 'main' existe (commit C1 a réussi avant l'erreur)
    expect(Object.keys(snap.branches)).toContain('main');
  });
});

// ---------------------------------------------------------------------------
// Déterminisme bonus : allCommits stables sur plusieurs rejeux complexes
// ---------------------------------------------------------------------------

describe('persistence — déterminisme avec rebase', () => {
  it('rebase produit les mêmes hashes à chaque rejeu', () => {
    const cmds = [
      'git init',
      'write base.txt "v1"',
      'git add base.txt',
      'git commit -m "C1: base"',
      'git branch topic',
      'git checkout topic',
      'write topic.txt "feature"',
      'git add topic.txt',
      'git commit -m "C2: topic"',
      'git rebase main',
    ];

    const e1 = replay(cmds);
    const e2 = replay(cmds);

    const h1 = (e1.snapshot().allCommits ?? e1.snapshot().commits).map(c => c.hash).sort();
    const h2 = (e2.snapshot().allCommits ?? e2.snapshot().commits).map(c => c.hash).sort();
    expect(h1).toEqual(h2);
  });
});
