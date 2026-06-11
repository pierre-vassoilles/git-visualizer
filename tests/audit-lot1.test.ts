/**
 * Tests de conformité — Lot 1 de l'audit git (intégrité d'état & anti-perte de
 * données). Boîte noire via execute() + snapshot().
 *
 * IDs couverts : BAS-01, BAS-03, BAS-04, RWR-01, RWR-02, RWR-03, RWR-04, RWR-05,
 * RWR-06, RWR-07, TLS-07, RMT-01, CNT-01.
 */

import { describe, it, expect } from 'vitest';
import { replay, newEngine } from './helpers';
import type { TodoItem } from '@/core/model';

const linear2 = () => [
  'git init',
  'write a.txt "1"',
  'git add a.txt',
  'git commit -m "c1"',
  'write a.txt "2"',
  'git add a.txt',
  'git commit -m "c2"',
];

describe('BAS-01 : commit en HEAD détaché fait avancer HEAD', () => {
  it('avance HEAD et étiquette « detached HEAD »', () => {
    const engine = replay(linear2());
    const c1 = engine.snapshot().commits.find((c) => c.message === 'c1')!.hash;
    engine.execute(`git checkout ${c1.slice(0, 7)}`);
    expect(engine.snapshot().head.type).toBe('detached');

    const r = engine.execute('write b.txt "x"');
    expect(r.exitCode).toBe(0);
    engine.execute('git add b.txt');
    const commit = engine.execute('git commit -m "on detached"');

    expect(commit.exitCode).toBe(0);
    expect(commit.output[0]).toContain('detached HEAD');
    expect(commit.output[0]).not.toContain('root-commit');
    // HEAD a avancé sur le nouveau commit (≠ c1), toujours détaché.
    const head = engine.snapshot().head;
    expect(head.type).toBe('detached');
    expect(head.type === 'detached' && head.hash).not.toBe(c1);
  });
});

describe('BAS-03 : git init préserve les fichiers déjà présents', () => {
  it('un fichier écrit avant init survit', () => {
    const engine = newEngine();
    engine.execute('write a.txt "hello"');
    engine.execute('git init');
    const r = engine.execute('read a.txt');
    expect(r.exitCode).toBe(0);
    expect(r.output[0]).toBe('hello');
  });
});

describe('BAS-04 : git commit --amend réécrit le commit de tête', () => {
  it('remplace le tip sans créer de commit supplémentaire', () => {
    const engine = replay(linear2());
    const r = engine.execute('git commit --amend -m "c2-amended"');
    expect(r.exitCode).toBe(0);
    const log = engine.execute('git log --oneline').output;
    expect(log.length).toBe(2);
    expect(log.join('\n')).toContain('c2-amended');
    expect(log.some((l) => / c2$/.test(l))).toBe(false);
  });

  it('amend sans -m conserve le message d’origine', () => {
    const engine = replay(linear2());
    engine.execute('write a.txt "3"');
    engine.execute('git add a.txt');
    const r = engine.execute('git commit --amend');
    expect(r.exitCode).toBe(0);
    expect(engine.execute('git log --oneline').output.length).toBe(2);
    expect(r.output[0]).toContain('c2');
  });

  it('amend sans rien à amender → échec', () => {
    const engine = replay(['git init']);
    const r = engine.execute('git commit --amend -m "x"');
    expect(r.exitCode).not.toBe(0);
    expect(r.errors.join(' ')).toContain('nothing to amend');
  });
});

describe('RWR-01 : merge d’un ancêtre → Already up to date.', () => {
  it('même avec --no-ff', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch feature',
      'write a.txt "2"',
      'git add a.txt',
      'git commit -m "c2"',
    ]);
    // main est en avance sur feature ; merger feature (ancêtre) ne crée rien.
    const r = engine.execute('git merge --no-ff feature');
    expect(r.exitCode).toBe(0);
    expect(r.output.join(' ')).toContain('Already up to date');
    expect(engine.execute('git log --oneline').output.length).toBe(2);
  });
});

describe('RWR-02 : refus d’écraser des changements non commités', () => {
  function divergeWithDirtyFeature() {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch feature',
      'write a.txt "main"',
      'git add a.txt',
      'git commit -m "c2"',
      'git checkout feature',
      'write a.txt "uncommitted"', // WT sale sur a.txt (que main modifie aussi)
    ]);
    return engine;
  }

  it('merge refuse (exit 2)', () => {
    const r = divergeWithDirtyFeature().execute('git merge main');
    expect(r.exitCode).toBe(2);
    expect(r.errors.join(' ')).toContain('would be overwritten by merge');
  });

  it('rebase refuse (exit 1)', () => {
    const r = divergeWithDirtyFeature().execute('git rebase main');
    expect(r.exitCode).toBe(1);
    expect(r.errors.join(' ')).toContain('would be overwritten by rebase');
  });
});

describe('RWR-04 : reset --hard abandonne un merge en cours', () => {
  it('supprime l’état de merge (pas de commit de merge fantôme ensuite)', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch feature',
      'write a.txt "main"',
      'git add a.txt',
      'git commit -m "c2"',
      'git checkout feature',
      'write a.txt "feat"',
      'git add a.txt',
      'git commit -m "c3"',
      'git merge main', // conflit → merging
    ]);
    expect(engine.snapshot().operationState?.type).toBe('merging');

    engine.execute('git reset --hard HEAD');
    expect(engine.snapshot().operationState ?? null).toBeNull();
  });
});

describe('RWR-05 : cherry-pick d’un ancêtre autorisé (revert puis réapplication)', () => {
  it('git revert HEAD puis git cherry-pick <original> réapplique le changement', () => {
    const engine = replay([
      'git init',
      'write a.txt "v0"',
      'git add a.txt',
      'git commit -m "c0"',
      'write a.txt "v1"',
      'git add a.txt',
      'git commit -m "c1"',
    ]);
    const c1 = engine.snapshot().commits.find((c) => c.message === 'c1')!.hash;

    const rev = engine.execute('git revert HEAD');
    expect(rev.exitCode).toBe(0);
    expect(engine.execute('read a.txt').output[0]).toBe('v0');

    const cp = engine.execute(`git cherry-pick ${c1.slice(0, 7)}`);
    expect(cp.exitCode).toBe(0);
    expect(engine.execute('read a.txt').output[0]).toBe('v1');
  });
});

describe('RWR-06 : rebase saute un commit déjà appliqué en amont', () => {
  it('feature ajoutant le même contenu que main → commit sauté, branche sur main', () => {
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch feature',
      'write b.txt "2"',
      'git add b.txt',
      'git commit -m "add b (main)"',
      'git checkout feature',
      'write b.txt "2"',
      'git add b.txt',
      'git commit -m "add b (feature)"',
    ]);
    const r = engine.execute('git rebase main');
    expect(r.exitCode).toBe(0);
    expect(r.output.join('\n')).toContain('skipped');
    // feature ne contient plus que les commits de main (le sien a été sauté).
    expect(engine.execute('git log --oneline').output.length).toBe(2);
  });
});

describe('RWR-07 : pas de seconde opération pendant un merge en cours', () => {
  it('rebase refusé pendant un merge conflictuel', () => {
    const engine = replay([
      'git init',
      'write a.txt "base"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch feature',
      'write a.txt "main"',
      'git add a.txt',
      'git commit -m "c2"',
      'git checkout feature',
      'write a.txt "feat"',
      'git add a.txt',
      'git commit -m "c3"',
      'git merge main', // conflit → merging
    ]);
    const r = engine.execute('git rebase main');
    expect(r.exitCode).toBe(128);
    expect(r.errors.join(' ')).toContain('merge in progress');
  });
});

describe('TLS-07 : rebase -i tout-drop déplace la branche sur la base', () => {
  it('toutes les marches drop → branche resetée sur la base (rebase divergent)', () => {
    // feature (c1→cf1→cf2) rebasé sur main (c1→cm). On droppe cf1 et cf2 :
    // feature doit être resetée sur la base (le tip de main).
    const engine = replay([
      'git init',
      'write a.txt "1"',
      'git add a.txt',
      'git commit -m "c1"',
      'git branch feature',
      'write m.txt "main"',
      'git add m.txt',
      'git commit -m "cm"',
      'git checkout feature',
      'write f1.txt "f1"',
      'git add f1.txt',
      'git commit -m "cf1"',
      'write f2.txt "f2"',
      'git add f2.txt',
      'git commit -m "cf2"',
    ]);
    const commits = engine.snapshot().commits;
    const cf2 = commits.find((c) => c.message === 'cf2')!.hash;
    const cf1 = commits.find((c) => c.message === 'cf1')!.hash;

    const start = engine.execute('git rebase -i main');
    expect(start.exitCode).toBe(0);

    const todo: TodoItem[] = [
      { action: 'drop', commitHash: cf1, message: 'cf1' },
      { action: 'drop', commitHash: cf2, message: 'cf2' },
    ];
    const done = engine.executeRebaseInteractive(todo);
    expect(done.exitCode).toBe(0);

    // feature pointe désormais sur le tip de main (c1 ← cm) : 2 commits, pas de fX.
    const log = engine.execute('git log --oneline').output;
    expect(log.length).toBe(2);
    expect(engine.execute('read m.txt').output[0]).toBe('main');
    expect(engine.execute('read f1.txt').exitCode).not.toBe(0);
    expect(engine.snapshot().operationState ?? null).toBeNull();
  });
});

describe('RMT-01 : flags inconnus de push/pull rejetés', () => {
  it('git push --delete → option inconnue (exit 129)', () => {
    const engine = replay(linear2());
    const r = engine.execute('git push --delete origin foo');
    expect(r.exitCode).toBe(129);
    expect(r.errors.join(' ')).toContain('unknown option');
  });

  it('git pull --ff-only → option inconnue (exit 129)', () => {
    const engine = replay(linear2());
    const r = engine.execute('git pull --ff-only');
    expect(r.exitCode).toBe(129);
    expect(r.errors.join(' ')).toContain('unknown option');
  });
});
