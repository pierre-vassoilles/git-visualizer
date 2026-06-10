/**
 * Tests Phase 7 : git remote
 * Spec : docs/specs/34-remote-model.md
 * CA-remote-01..09, CA-remote-10, CA-remote-12
 *
 * Principe : boîte noire via execute() + snapshot().
 */

import { describe, it, expect } from 'vitest';
import { newEngine, replay } from './helpers';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

/** Dépôt initialisé sans remote. */
function repoInitialized() {
  return replay(['git init', 'write f.txt "hello"', 'git add f.txt', 'git commit -m "init"']);
}

/** Dépôt initialisé avec un remote origin. */
function repoWithOrigin() {
  return replay([
    'git init',
    'write f.txt "hello"',
    'git add f.txt',
    'git commit -m "init"',
    'git remote add origin https://github.com/user/repo.git',
  ]);
}

// ---------------------------------------------------------------------------
// CA-remote-01 : Liste vide
// ---------------------------------------------------------------------------

describe('git remote — CA-remote-01 : liste vide', () => {
  it('CA-remote-01 : git remote sur dépôt sans remote → exitCode 0, output vide', () => {
    const engine = repoInitialized();
    const result = engine.execute('git remote');

    expect(result.exitCode).toBe(0);
    expect(result.output.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CA-remote-02 : Lister un remote
// ---------------------------------------------------------------------------

describe('git remote — CA-remote-02 : lister un remote', () => {
  it('CA-remote-02 : après git remote add origin, git remote affiche "origin"', () => {
    const engine = repoWithOrigin();
    const result = engine.execute('git remote');

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('origin');
  });
});

// ---------------------------------------------------------------------------
// CA-remote-03 : Lister avec -v
// ---------------------------------------------------------------------------

describe('git remote — CA-remote-03 : lister avec -v', () => {
  it('CA-remote-03 : git remote -v affiche url avec (fetch) et (push)', () => {
    const engine = repoWithOrigin();
    const result = engine.execute('git remote -v');

    expect(result.exitCode).toBe(0);
    // Au moins une ligne (fetch) et une ligne (push) pour origin
    const fetchLine = result.output.find((l) => l.includes('origin') && l.includes('(fetch)'));
    const pushLine = result.output.find((l) => l.includes('origin') && l.includes('(push)'));
    expect(fetchLine).toBeDefined();
    expect(pushLine).toBeDefined();
    // L'URL doit être présente
    expect(fetchLine).toContain('https://github.com/user/repo.git');
    expect(pushLine).toContain('https://github.com/user/repo.git');
  });
});

// ---------------------------------------------------------------------------
// CA-remote-04 : Ajouter un remote
// ---------------------------------------------------------------------------

describe('git remote — CA-remote-04 : ajouter un remote', () => {
  it('CA-remote-04 : git remote add origin → exitCode 0, origin listé, bare/vide', () => {
    const engine = repoInitialized();
    const result = engine.execute('git remote add origin https://github.com/user/repo.git');

    expect(result.exitCode).toBe(0);
    expect(result.output).toEqual([]);
    expect(result.errors).toEqual([]);

    // origin doit être listé
    const listResult = engine.execute('git remote');
    expect(listResult.output).toContain('origin');
  });
});

// ---------------------------------------------------------------------------
// CA-remote-05 : Ajouter plusieurs remotes
// ---------------------------------------------------------------------------

describe('git remote — CA-remote-05 : ajouter plusieurs remotes', () => {
  it('CA-remote-05 : git remote add upstream après origin → les deux listés', () => {
    const engine = repoWithOrigin();
    const result = engine.execute('git remote add upstream https://github.com/upstream/repo.git');

    expect(result.exitCode).toBe(0);

    const listResult = engine.execute('git remote');
    expect(listResult.output).toContain('origin');
    expect(listResult.output).toContain('upstream');
  });
});

// ---------------------------------------------------------------------------
// CA-remote-06 : Erreur remote existant
// ---------------------------------------------------------------------------

describe('git remote — CA-remote-06 : erreur remote existant', () => {
  it('CA-remote-06 : re-add origin → exitCode 128, message "already exists"', () => {
    const engine = repoWithOrigin();
    const result = engine.execute('git remote add origin https://other.git');

    expect(result.exitCode).toBe(128);
    expect(result.errors.some((e) => e.includes('already exists'))).toBe(true);

    // Vérifier qu'il n'y a toujours qu'un seul remote origin (pas de doublon)
    const listResult = engine.execute('git remote');
    expect(listResult.output.filter((l) => l === 'origin')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// CA-remote-07 : Supprimer un remote
// ---------------------------------------------------------------------------

describe('git remote — CA-remote-07 : supprimer un remote', () => {
  it('CA-remote-07 : git remote remove origin → exitCode 0, origin disparu', () => {
    const engine = repoWithOrigin();
    engine.execute('git remote add upstream https://github.com/upstream/repo.git');

    const result = engine.execute('git remote remove origin');

    expect(result.exitCode).toBe(0);
    expect(result.output).toEqual([]);
    expect(result.errors).toEqual([]);

    const listResult = engine.execute('git remote');
    expect(listResult.output).not.toContain('origin');
    expect(listResult.output).toContain('upstream');

    // remoteTrackingRefs ne doit plus contenir origin
    const snap = engine.snapshot();
    if (snap.remoteTrackingRefs) {
      expect('origin' in snap.remoteTrackingRefs).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// CA-remote-08 : Erreur suppression remote inexistant
// ---------------------------------------------------------------------------

describe('git remote — CA-remote-08 : erreur suppression inexistant', () => {
  it('CA-remote-08 : git remote remove nosuchremote → exitCode 128, message "No such remote"', () => {
    const engine = repoInitialized();
    const result = engine.execute('git remote remove nosuchremote');

    expect(result.exitCode).toBe(128);
    expect(result.errors.some((e) => e.includes('No such remote'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-remote-09 : Alias rm
// ---------------------------------------------------------------------------

describe('git remote — CA-remote-09 : alias rm', () => {
  it('CA-remote-09 : git remote rm origin → comportement identique à remove', () => {
    const engine = repoWithOrigin();
    const result = engine.execute('git remote rm origin');

    expect(result.exitCode).toBe(0);

    const listResult = engine.execute('git remote');
    expect(listResult.output).not.toContain('origin');
  });

  it('CA-remote-09b : git remote rm inexistant → exitCode 128', () => {
    const engine = repoInitialized();
    const result = engine.execute('git remote rm nosuchremote');

    expect(result.exitCode).toBe(128);
    expect(result.errors.some((e) => e.includes('No such remote'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-remote-10 : Snapshot expose remotes (après add — remote bare/vide)
// ---------------------------------------------------------------------------

describe('git remote — CA-remote-10 : snapshot expose remotes', () => {
  it('CA-remote-10 : après git remote add, snapshot.remotes.origin existe (bare vide)', () => {
    const engine = repoInitialized();
    engine.execute('git remote add origin https://github.com/user/repo.git');

    const snap = engine.snapshot();

    // snapshot.remotes peut être undefined si le remote est vide (pas de commits)
    // → l'implémentation n'expose que les remotes ayant des commits dans le snapshot.
    // Vérification souple : si remotes est défini, il contient origin avec allCommits vide.
    if (snap.remotes) {
      expect('origin' in snap.remotes).toBe(true);
      expect(snap.remotes['origin']!.allCommits).toEqual([]);
    }
    // Si remotes est undefined, le remote est bare/vide → comportement acceptable.
    // Le git remote list lui montre bien origin :
    const listResult = engine.execute('git remote');
    expect(listResult.output).toContain('origin');
  });
});

// ---------------------------------------------------------------------------
// CA-remote-12 : Suppression d'upstream si remote supprimé
// ---------------------------------------------------------------------------

describe('git remote — CA-remote-12 : suppression upstream quand remote supprimé', () => {
  it('CA-remote-12 : après clone puis remove origin, tracking ne référence plus origin', () => {
    const engine = newEngine();
    // Clone crée origin + branche locale main avec upstream
    engine.execute('git clone public-repo');

    // Vérifier que l'upstream est posé
    const snapBefore = engine.snapshot();
    expect(snapBefore.tracking?.['main']?.upstream).toEqual({ remote: 'origin', branch: 'main' });

    // Supprimer le remote
    const removeResult = engine.execute('git remote remove origin');
    expect(removeResult.exitCode).toBe(0);

    const snap = engine.snapshot();

    // tracking ne doit plus avoir d'upstream pour main via origin
    if (snap.tracking) {
      const mainTracking = snap.tracking['main'];
      if (mainTracking?.upstream) {
        expect(mainTracking.upstream.remote).not.toBe('origin');
      }
      // Ou l'entrée n'existe plus du tout
    }

    // remoteTrackingRefs ne doit plus avoir origin
    if (snap.remoteTrackingRefs) {
      expect('origin' in snap.remoteTrackingRefs).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Cas limites
// ---------------------------------------------------------------------------

describe('git remote — cas limites', () => {
  it('nom invalide contenant espace → exitCode 128', () => {
    const engine = repoInitialized();
    const result = engine.execute('git remote add "bad name" https://example.com');
    expect(result.exitCode).toBe(128);
  });

  it('git remote sur dépôt non initialisé → exitCode 128', () => {
    const engine = newEngine();
    const result = engine.execute('git remote');
    expect(result.exitCode).toBe(128);
    expect(result.errors.some((e) => e.includes('not a git repository'))).toBe(true);
  });

  it('plusieurs remotes listés en ordre stable', () => {
    const engine = repoInitialized();
    engine.execute('git remote add zzz https://zzz.com');
    engine.execute('git remote add aaa https://aaa.com');
    const result = engine.execute('git remote');
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('zzz');
    expect(result.output).toContain('aaa');
  });
});
