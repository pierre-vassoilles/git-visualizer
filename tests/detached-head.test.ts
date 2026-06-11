/**
 * Tests Phase 2 : HEAD détaché — scénarios transverses
 * Spec : docs/specs/09-model-phase2.md
 *
 * Couvre :
 * - snapshot.head.type === 'detached'
 * - git status affiche "HEAD detached at"
 * - git log suit le commit détaché
 * - sortie / retour sur une branche depuis HEAD détaché
 * - déterminisme avec branches et tags
 */

import { describe, it, expect } from 'vitest';
import { replay } from './helpers';
import type { GitEngine } from '@/core/engine';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

function engineWithThreeCommits(): { engine: GitEngine; hashes: string[] } {
  const engine = replay(['git init']);
  for (let i = 1; i <= 3; i++) {
    engine.execute(`write file.txt "version ${i}"`);
    engine.execute('git add file.txt');
    engine.execute(`git commit -m "commit ${i}"`);
  }
  const snap = engine.snapshot();
  // hashes[0] = commit 3 (HEAD), hashes[1] = commit 2, hashes[2] = commit 1
  const hashes = snap.commits.map((c) => c.hash);
  return { engine, hashes };
}

// ---------------------------------------------------------------------------
// snapshot.head.type === 'detached'
// ---------------------------------------------------------------------------

describe('HEAD détaché — snapshot.head.type', () => {
  it('snapshot.head.type est "branch" initialement', () => {
    const engine = replay(['git init', 'write f.txt "x"', 'git add f.txt', 'git commit -m "c"']);
    const snap = engine.snapshot();
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') {
      expect(snap.head.name).toBe('main');
    }
  });

  it('snapshot.head.type === "detached" après checkout <hash>', () => {
    const { engine, hashes } = engineWithThreeCommits();
    engine.execute(`git checkout ${hashes[1]}`);

    const snap = engine.snapshot();
    expect(snap.head.type).toBe('detached');
    if (snap.head.type === 'detached') {
      expect(snap.head.hash).toBe(hashes[1]);
    }
  });

  it('snapshot.head.type === "detached" après switch --detach <hash>', () => {
    const { engine, hashes } = engineWithThreeCommits();
    engine.execute(`git switch --detach ${hashes[2]}`);

    const snap = engine.snapshot();
    expect(snap.head.type).toBe('detached');
    if (snap.head.type === 'detached') {
      expect(snap.head.hash).toBe(hashes[2]);
    }
  });

  it('snapshot.head.type revient à "branch" après checkout main depuis HEAD détaché', () => {
    const { engine, hashes } = engineWithThreeCommits();
    engine.execute(`git checkout ${hashes[1]}`);
    engine.execute('git checkout main');

    const snap = engine.snapshot();
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') {
      expect(snap.head.name).toBe('main');
    }
  });
});

// ---------------------------------------------------------------------------
// git status affiche "HEAD detached at"
// ---------------------------------------------------------------------------

describe('HEAD détaché — git status', () => {
  it('git status affiche "HEAD detached at <shortHash>" en mode détaché', () => {
    const { engine, hashes } = engineWithThreeCommits();
    engine.execute(`git checkout ${hashes[1]}`);

    const result = engine.execute('git status');
    const shortH = hashes[1]!.slice(0, 7);

    expect(result.exitCode).toBe(0);
    expect(
      result.output.some((l) => l.toLowerCase().includes('head detached') && l.includes(shortH)),
    ).toBe(true);
  });

  it('git status affiche "On branch main" quand HEAD symbolique', () => {
    const engine = replay(['git init', 'write f.txt "x"', 'git add f.txt', 'git commit -m "c"']);
    const result = engine.execute('git status');
    expect(result.output.some((l) => l.includes('On branch main'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// git log suit le commit détaché
// ---------------------------------------------------------------------------

describe('HEAD détaché — git log', () => {
  it('git log depuis HEAD détaché sur commit 2 montre commits 2 et 1 (pas 3)', () => {
    const { engine, hashes } = engineWithThreeCommits();
    // commit 3 = hashes[0], commit 2 = hashes[1], commit 1 = hashes[2]
    engine.execute(`git checkout ${hashes[1]}`);

    const result = engine.execute('git log');
    expect(result.exitCode).toBe(0);

    // Le log doit contenir le message "commit 2" et "commit 1"
    expect(result.output.some((l) => l.includes('commit 2'))).toBe(true);
    expect(result.output.some((l) => l.includes('commit 1'))).toBe(true);
    // commit 3 ne doit pas être dans le log (hashes[0])
    expect(result.output.some((l) => l.includes('commit 3'))).toBe(false);
  });

  it('git log depuis HEAD détaché sur le premier commit ne montre qu un commit', () => {
    const { engine, hashes } = engineWithThreeCommits();
    const firstHash = hashes[2]!;
    engine.execute(`git checkout ${firstHash}`);

    const result = engine.execute('git log');
    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes('commit 1'))).toBe(true);
    expect(result.output.some((l) => l.includes('commit 2'))).toBe(false);
    expect(result.output.some((l) => l.includes('commit 3'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Retour sur une branche depuis HEAD détaché
// ---------------------------------------------------------------------------

describe('HEAD détaché — retour sur une branche', () => {
  it('checkout - depuis HEAD détaché revient sur la branche précédente', () => {
    const { engine, hashes } = engineWithThreeCommits();
    // Aller sur une nouvelle branche puis détacher
    engine.execute('git branch feature');
    engine.execute('git checkout feature');
    engine.execute(`git checkout ${hashes[1]}`);

    // HEAD est détaché, prevBranch = "feature" (Option A de la spec)
    const result = engine.execute('git checkout -');
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') {
      expect(snap.head.name).toBe('feature');
    }
  });

  it('switch - depuis HEAD détaché revient sur la branche précédente', () => {
    const { engine, hashes } = engineWithThreeCommits();
    engine.execute('git branch feat');
    engine.execute('git checkout feat');
    engine.execute(`git switch --detach ${hashes[2]}`);

    const result = engine.execute('git switch -');
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') {
      expect(snap.head.name).toBe('feat');
    }
  });

  it('création d une branche depuis HEAD détaché puis retour sur elle', () => {
    const { engine, hashes } = engineWithThreeCommits();
    engine.execute(`git checkout ${hashes[1]}`);
    engine.execute('git branch fromdetached');

    // La branche pointe sur le commit détaché
    const snap1 = engine.snapshot();
    const detachedHash = snap1.head.type === 'detached' ? snap1.head.hash : '';
    expect(snap1.branches['fromdetached']).toBe(detachedHash);

    // Basculer sur la nouvelle branche
    engine.execute('git checkout fromdetached');
    const snap2 = engine.snapshot();
    expect(snap2.head.type).toBe('branch');
    if (snap2.head.type === 'branch') {
      expect(snap2.head.name).toBe('fromdetached');
    }
  });
});

// ---------------------------------------------------------------------------
// Index et working tree mis à jour lors du détachement
// ---------------------------------------------------------------------------

describe('HEAD détaché — index et working tree', () => {
  it('working tree reflète le commit cible après détachement', () => {
    const engine = replay([
      'git init',
      'write file.txt "v1"',
      'git add file.txt',
      'git commit -m "c1"',
      'write file.txt "v2"',
      'git add file.txt',
      'git commit -m "c2"',
    ]);
    const snap0 = engine.snapshot();
    const c1 = snap0.commits[1]!.hash;

    // Détacher sur c1
    engine.execute(`git checkout ${c1}`);

    const snap = engine.snapshot();
    // file.txt doit être propre (WT = index = c1 = "v1")
    const f = snap.files.find((x) => x.path === 'file.txt');
    expect(f?.status).toBe('clean');
  });
});

// ---------------------------------------------------------------------------
// Déterminisme avec branches et tags
// ---------------------------------------------------------------------------

describe('HEAD détaché — déterminisme', () => {
  it('deux engines rejouant la même séquence avec branches et tags ont les mêmes hashes', () => {
    const cmds = [
      'git init',
      'write f.txt "v1"',
      'git add f.txt',
      'git commit -m "c1"',
      'git tag v1.0',
      'git branch feature',
      'write f.txt "v2"',
      'git add f.txt',
      'git commit -m "c2"',
      'git tag v2.0',
    ];
    const e1 = replay(cmds);
    const e2 = replay(cmds);
    const s1 = e1.snapshot();
    const s2 = e2.snapshot();
    expect(s1.commits.map((c) => c.hash)).toEqual(s2.commits.map((c) => c.hash));
    expect(s1.branches).toEqual(s2.branches);
    expect(s1.tags).toEqual(s2.tags);
    expect(s1.head).toEqual(s2.head);
  });

  it('deux engines avec checkout vers le même commit ont le même hash détaché', () => {
    const cmds = ['git init', 'write f.txt "v1"', 'git add f.txt', 'git commit -m "c1"'];
    const e1 = replay(cmds);
    const e2 = replay(cmds);

    const h1 = e1.snapshot().commits[0]!.hash;
    const h2 = e2.snapshot().commits[0]!.hash;
    expect(h1).toBe(h2);

    e1.execute(`git checkout ${h1}`);
    e2.execute(`git checkout ${h2}`);

    const s1 = e1.snapshot();
    const s2 = e2.snapshot();
    expect(s1.head).toEqual(s2.head);
  });
});

// ---------------------------------------------------------------------------
// HEAD détaché — invariants du modèle (spec 09-model-phase2.md)
// ---------------------------------------------------------------------------

describe('HEAD détaché — invariants modèle (spec 09)', () => {
  it('en mode symbolique : head.type=branch et name correspond à la branche courante', () => {
    const engine = replay(['git init', 'write f.txt "x"', 'git add f.txt', 'git commit -m "c"']);
    const snap = engine.snapshot();
    expect(snap.head.type).toBe('branch');
    if (snap.head.type === 'branch') {
      expect(snap.branches[snap.head.name]).toBeDefined();
    }
  });

  it('en mode détaché : head.type=detached et hash est dans commits', () => {
    const { engine, hashes } = engineWithThreeCommits();
    engine.execute(`git checkout ${hashes[1]}`);

    const snap = engine.snapshot();
    expect(snap.head.type).toBe('detached');
    if (snap.head.type === 'detached') {
      const commitHashes = snap.commits.map((c) => c.hash);
      expect(commitHashes).toContain(snap.head.hash);
    }
  });

  it('snapshot.branches inclut la branche par défaut vide (HEAD non-né)', () => {
    // Après `git init`, main existe mais est vide ("") : le snapshot doit
    // l'inclure. (Créer une autre branche avant le 1er commit est refusé — NAV-08.)
    const engine = replay(['git init']);
    const snap = engine.snapshot();
    expect('main' in snap.branches).toBe(true);
    expect(snap.branches['main']).toBe('');
  });
});
