/**
 * Tests Phase 7 : git clone
 * Spec : docs/specs/35-clone.md
 * CA-clone-01..04, CA-clone-06..10, CA-clone-12
 *
 * NOTE — CA omises :
 *   CA-clone-05 (HEAD détachée dans source) : le catalogue prédéfini ne contient
 *     aucun dépôt avec HEAD détachée (`weird-repo` absent). Omis.
 *
 * Principe : boîte noire via execute() + snapshot().
 */

import { describe, it, expect } from 'vitest';
import { newEngine, replay } from './helpers';

// ---------------------------------------------------------------------------
// CA-clone-01 : Clone simple de public-repo
// ---------------------------------------------------------------------------

describe('git clone — CA-clone-01 : clone simple public-repo', () => {
  it('CA-clone-01 : exitCode 0, remote origin créé, branche main locale, HEAD sur main', () => {
    const engine = newEngine();
    const result = engine.execute('git clone public-repo');

    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();

    // Dépôt initialisé
    expect(snap.initialized).toBe(true);

    // HEAD sur main (symbolique)
    expect(snap.head.type).toBe('branch');
    expect((snap.head as { type: 'branch'; name: string }).name).toBe('main');

    // Branche locale main existe
    expect('main' in snap.branches).toBe(true);
    expect(snap.branches['main']).toBeTruthy();

    // Remote origin présent dans snapshot.remotes
    expect(snap.remotes).toBeDefined();
    expect(snap.remotes!['origin']).toBeDefined();

    // remoteTrackingRefs.origin.main posé
    expect(snap.remoteTrackingRefs).toBeDefined();
    expect(snap.remoteTrackingRefs!['origin']).toBeDefined();
    expect(snap.remoteTrackingRefs!['origin']!['main']).toBeTruthy();

    // La ref de suivi origin/main === branche locale main
    expect(snap.remoteTrackingRefs!['origin']!['main']).toBe(snap.branches['main']);
  });
});

// ---------------------------------------------------------------------------
// CA-clone-02 : Clone avec plusieurs branches (collab-repo)
// ---------------------------------------------------------------------------

describe('git clone — CA-clone-02 : clone collab-repo avec branches multiples', () => {
  it('CA-clone-02 : remoteTrackingRefs a main et develop, seule main locale', () => {
    const engine = newEngine();
    const result = engine.execute('git clone collab-repo');

    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();

    // Tracking refs distantes : main ET develop
    expect(snap.remoteTrackingRefs).toBeDefined();
    expect(snap.remoteTrackingRefs!['origin']!['main']).toBeTruthy();
    expect(snap.remoteTrackingRefs!['origin']!['develop']).toBeTruthy();

    // Seule branche locale main créée
    expect('main' in snap.branches).toBe(true);
    expect('develop' in snap.branches).toBe(false);

    // HEAD sur main
    expect(snap.head.type).toBe('branch');
    expect((snap.head as { type: 'branch'; name: string }).name).toBe('main');

    // Upstream de main pointe origin/main
    expect(snap.tracking).toBeDefined();
    expect(snap.tracking!['main']?.upstream).toEqual({ remote: 'origin', branch: 'main' });
  });
});

// ---------------------------------------------------------------------------
// CA-clone-03 : Objets copiés correctement
// ---------------------------------------------------------------------------

describe('git clone — CA-clone-03 : objets copiés', () => {
  it('CA-clone-03 : hashes identiques entre snapshot.remotes.origin et snapshot local', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');

    const snap = engine.snapshot();

    // Les commits du remote et du local partagent les mêmes hashes
    const remoteCommits = snap.remotes!['origin']!.allCommits;
    const localAllCommits = snap.allCommits!;

    // Tous les hashes du remote se retrouvent dans le local
    for (const rc of remoteCommits) {
      const found = localAllCommits.some((lc) => lc.hash === rc.hash);
      expect(found).toBe(true);
    }
  });

  it('CA-clone-03 : public-repo a exactement 3 commits', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');

    const snap = engine.snapshot();
    const remoteCommits = snap.remotes!['origin']!.allCommits;
    expect(remoteCommits.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// CA-clone-04 : Upstream posé correctement
// ---------------------------------------------------------------------------

describe('git clone — CA-clone-04 : upstream posé', () => {
  it('CA-clone-04 : snapshot.tracking[main].upstream = { remote: origin, branch: main }', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');

    const snap = engine.snapshot();

    expect(snap.tracking).toBeDefined();
    expect(snap.tracking!['main']).toBeDefined();
    expect(snap.tracking!['main']!.upstream).toEqual({ remote: 'origin', branch: 'main' });
  });
});

// ---------------------------------------------------------------------------
// CA-clone-06 : Erreur source inexistante
// ---------------------------------------------------------------------------

describe('git clone — CA-clone-06 : erreur source inexistante', () => {
  it('CA-clone-06 : git clone nosuchrepo → exitCode 128, message "not found"', () => {
    const engine = newEngine();
    const result = engine.execute('git clone nosuchrepo');

    expect(result.exitCode).toBe(128);
    expect(result.errors.some((e) => e.includes('not found'))).toBe(true);

    // Aucun dépôt créé
    const snap = engine.snapshot();
    expect(snap.initialized).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CA-clone-07 : Erreur dépôt déjà initialisé
// ---------------------------------------------------------------------------

describe('git clone — CA-clone-07 : erreur dépôt non vide', () => {
  it('CA-clone-07 : clone sur dépôt initialisé → exitCode 128, message "already exists"', () => {
    const engine = replay([
      'git init',
      'write f.txt "hello"',
      'git add f.txt',
      'git commit -m "init"',
    ]);

    const result = engine.execute('git clone public-repo');

    expect(result.exitCode).toBe(128);
    expect(result.errors.some((e) => e.includes('already exists'))).toBe(true);

    // Dépôt courant non modifié (toujours un commit)
    const snap = engine.snapshot();
    expect(snap.commits.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// CA-clone-08 : Snapshot expose origin
// ---------------------------------------------------------------------------

describe('git clone — CA-clone-08 : snapshot expose origin', () => {
  it('CA-clone-08 : snapshot.remotes.origin et remoteTrackingRefs après clone', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');

    const snap = engine.snapshot();

    // snapshot.remotes.origin expose des commits
    expect(snap.remotes).toBeDefined();
    expect(snap.remotes!['origin']).toBeDefined();
    expect(snap.remotes!['origin']!.allCommits.length).toBeGreaterThan(0);
    expect(snap.remotes!['origin']!.heads).toBeDefined();
    expect(snap.remotes!['origin']!.head).toBeDefined();

    // remoteTrackingRefs.origin.main = hash du tip
    const remoteMainHash = snap.remotes!['origin']!.heads['main'];
    expect(remoteMainHash).toBeTruthy();
    expect(snap.remoteTrackingRefs!['origin']!['main']).toBe(remoteMainHash);
  });
});

// ---------------------------------------------------------------------------
// CA-clone-09 : Commits accessibles via git log
// ---------------------------------------------------------------------------

describe('git clone — CA-clone-09 : commits accessibles via git log', () => {
  it('CA-clone-09 : git log --oneline affiche 3 commits depuis public-repo', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');

    const result = engine.execute('git log --oneline');

    expect(result.exitCode).toBe(0);
    // 3 commits dans public-repo
    expect(result.output.length).toBe(3);
  });

  it('CA-clone-09 : hashes courts identiques entre remote et local', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');

    const snap = engine.snapshot();
    const remoteShortHashes = snap.remotes!['origin']!.allCommits.map((c) => c.shortHash);
    const localShortHashes = snap.allCommits!.map((c) => c.shortHash);

    for (const rh of remoteShortHashes) {
      expect(localShortHashes).toContain(rh);
    }
  });
});

// ---------------------------------------------------------------------------
// CA-clone-10 : Graphe complet visible (collab-repo)
// ---------------------------------------------------------------------------

describe('git clone — CA-clone-10 : graphe complet collab-repo', () => {
  it('CA-clone-10 : allCommits contient 5 commits (C0+C1+C2+C3+C4)', () => {
    const engine = newEngine();
    engine.execute('git clone collab-repo');

    const snap = engine.snapshot();

    // collab-repo : C0 ← C1 ← C2 (main) ; C0 ← C3 ← C4 (develop) → 5 commits
    expect(snap.allCommits!.length).toBe(5);
  });

  it('CA-clone-10 : deux branches distantes visibles (main et develop)', () => {
    const engine = newEngine();
    engine.execute('git clone collab-repo');

    const snap = engine.snapshot();

    const remoteHeads = snap.remotes!['origin']!.heads;
    expect('main' in remoteHeads).toBe(true);
    expect('develop' in remoteHeads).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-clone-12 : Index et WT synchronisés
// ---------------------------------------------------------------------------

describe('git clone — CA-clone-12 : index et WT synchronisés', () => {
  it('CA-clone-12 : git status retourne "nothing to commit" après clone de public-repo', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');

    const result = engine.execute('git status');

    expect(result.exitCode).toBe(0);
    const output = result.output.join('\n');
    // "nothing to commit" ou "working tree clean"
    expect(output.includes('nothing to commit') || output.includes('working tree clean')).toBe(
      true,
    );
  });

  it('CA-clone-12 : les fichiers du WT correspondent au commit de HEAD', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');

    const snap = engine.snapshot();

    // Aucun fichier modifié ni untracked
    const nonClean = snap.files.filter((f) => f.status !== 'clean');
    expect(nonClean).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cas limites
// ---------------------------------------------------------------------------

describe('git clone — cas limites', () => {
  it('deux clones successifs de public-repo sont indépendants', () => {
    const e1 = newEngine();
    const e2 = newEngine();
    e1.execute('git clone public-repo');
    e2.execute('git clone public-repo');

    const snap1 = e1.snapshot();
    const snap2 = e2.snapshot();

    // Même structure
    expect(snap1.branches['main']).toBe(snap2.branches['main']);
    expect(snap1.allCommits!.length).toBe(snap2.allCommits!.length);
  });

  it('après clone, on peut faire un nouveau commit local', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');

    engine.execute('write newfile.txt "local change"');
    engine.execute('git add newfile.txt');
    const commitResult = engine.execute('git commit -m "local commit"');

    expect(commitResult.exitCode).toBe(0);

    const snap = engine.snapshot();
    // 4 commits maintenant (3 du remote + 1 local)
    expect(snap.allCommits!.length).toBe(4);
  });

  it('après clone, branche locale main est ahead de origin/main après commit', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');

    const snapBefore = engine.snapshot();
    const originMainHash = snapBefore.remoteTrackingRefs!['origin']!['main'];

    engine.execute('write extra.txt "extra"');
    engine.execute('git add extra.txt');
    engine.execute('git commit -m "extra commit"');

    const snapAfter = engine.snapshot();

    // Branche locale avancée
    expect(snapAfter.branches['main']).not.toBe(originMainHash);
    // Ref de suivi origin/main inchangée
    expect(snapAfter.remoteTrackingRefs!['origin']!['main']).toBe(originMainHash);

    // ahead = 1
    expect(snapAfter.tracking?.['main']?.ahead).toBe(1);
    expect(snapAfter.tracking?.['main']?.behind).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CA-clone-11 : branche par défaut ≠ main (feature-repo → develop)
// Valide le correctif M1 (isInitialized robuste à une branche par défaut non-main)
// ---------------------------------------------------------------------------

describe('git clone — CA-clone-11 : branche par défaut develop', () => {
  it('clone feature-repo crée la branche locale develop et un dépôt initialisé', () => {
    const engine = newEngine();
    const result = engine.execute('git clone feature-repo');
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    // Dépôt bien considéré comme initialisé malgré l'absence de branche `main`
    expect(snap.initialized).toBe(true);

    // HEAD sur develop, branche locale develop créée, pas de main locale
    expect(snap.head.type).toBe('branch');
    expect((snap.head as { type: 'branch'; name: string }).name).toBe('develop');
    expect('develop' in snap.branches).toBe(true);
    expect('main' in snap.branches).toBe(false);

    // main reste accessible en ref de suivi
    expect(snap.remoteTrackingRefs!['origin']!['develop']).toBeTruthy();
    expect(snap.remoteTrackingRefs!['origin']!['main']).toBeTruthy();

    // upstream de develop posé vers origin/develop
    expect(snap.tracking?.['develop']?.upstream).toEqual({ remote: 'origin', branch: 'develop' });
  });

  it('les commandes suivantes fonctionnent (dépôt reconnu comme initialisé)', () => {
    const engine = replay(['git clone feature-repo']);
    // git status ne doit pas répondre "not a git repository"
    const status = engine.execute('git status');
    expect(status.exitCode).toBe(0);
    expect(status.errors.join(' ')).not.toMatch(/not a git repository/i);
    // un second clone est bien refusé (dépôt non vide)
    const second = engine.execute('git clone public-repo');
    expect(second.exitCode).toBe(128);
  });
});
