/**
 * Tests Phase 8 : git push
 * Spec : docs/specs/37-push.md
 * CA-push-01..13
 *
 * Stratégie (mono-client) :
 *   - clone public-repo → local aligne sur origin (3 commits C0←C1←C2)
 *   - "ahead" : commit local après clone
 *   - "non-fast-forward" : clone + reset --hard HEAD~1 + nouveau commit
 *     → local diverge d'origin/main (origin reste au tip C2)
 *
 * Principe : boîte noire via execute() + snapshot().
 */

import { describe, it, expect } from 'vitest';
import { newEngine, replay } from './helpers';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

/** Clone public-repo, puis crée un commit supplémentaire → ahead 1. */
function cloneAndAddCommit() {
  const engine = newEngine();
  engine.execute('git clone public-repo');
  engine.execute('write extra.txt "new local content"');
  engine.execute('git add extra.txt');
  engine.execute('git commit -m "local extra commit"');
  return engine;
}

/**
 * Clone public-repo, recule d'un commit, puis crée un commit différent
 * → divergence avec origin (non-fast-forward situation).
 */
function cloneAndDiverge() {
  const engine = newEngine();
  engine.execute('git clone public-repo');
  // Reculer d'un commit : main recule, origin/main reste au tip
  engine.execute('git reset --hard HEAD~1');
  // Créer un commit différent → diverge
  engine.execute('write diverged.txt "diverged content"');
  engine.execute('git add diverged.txt');
  engine.execute('git commit -m "diverged commit"');
  return engine;
}

// ---------------------------------------------------------------------------
// CA-push-01 : Push simple fast-forward
// ---------------------------------------------------------------------------

describe('git push — CA-push-01 : push simple fast-forward', () => {
  it('CA-push-01 : exitCode 0 après push fast-forward', () => {
    const engine = cloneAndAddCommit();
    const result = engine.execute('git push origin main');
    expect(result.exitCode).toBe(0);
  });

  it('CA-push-01 : remote.refs.heads.main === hash local après push', () => {
    const engine = cloneAndAddCommit();
    const snapBefore = engine.snapshot();
    const localMainHash = snapBefore.branches['main'];

    engine.execute('git push origin main');

    const snap = engine.snapshot();
    // La branche distante doit avoir avancé au niveau local
    expect(snap.remotes!['origin']!.heads['main']).toBe(localMainHash);
  });

  it('CA-push-01 : remoteTrackingRefs.origin.main mis à jour après push', () => {
    const engine = cloneAndAddCommit();
    const snapBefore = engine.snapshot();
    const localMainHash = snapBefore.branches['main'];

    engine.execute('git push origin main');

    const snap = engine.snapshot();
    expect(snap.remoteTrackingRefs!['origin']!['main']).toBe(localMainHash);
  });

  it('CA-push-01 : output contient "main"', () => {
    const engine = cloneAndAddCommit();
    const result = engine.execute('git push origin main');
    const output = result.output.join('\n');
    expect(output).toContain('main');
  });

  it('CA-push-01 : tracking.main.ahead === 0 après push réussi', () => {
    const engine = cloneAndAddCommit();
    engine.execute('git push origin main');
    const snap = engine.snapshot();
    expect(snap.tracking?.['main']?.ahead ?? 0).toBe(0);
    expect(snap.tracking?.['main']?.behind ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CA-push-02 : Push création de branche distante
// ---------------------------------------------------------------------------

describe('git push — CA-push-02 : push création branche distante', () => {
  it('CA-push-02 : exitCode 0, output contient "[new branch]"', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    // Créer une branche locale feature inexistante en distant
    engine.execute('git checkout -b feature');
    engine.execute('write feat.txt "feature stuff"');
    engine.execute('git add feat.txt');
    engine.execute('git commit -m "feature commit"');

    const result = engine.execute('git push origin feature');
    expect(result.exitCode).toBe(0);
    expect(result.output.join('\n')).toContain('[new branch]');
  });

  it('CA-push-02 : remoteTrackingRefs.origin.feature créée après push', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    engine.execute('git checkout -b feature');
    engine.execute('write feat.txt "feature"');
    engine.execute('git add feat.txt');
    engine.execute('git commit -m "feature"');
    const snap1 = engine.snapshot();
    const featureHash = snap1.branches['feature'];

    engine.execute('git push origin feature');

    const snap = engine.snapshot();
    expect(snap.remoteTrackingRefs!['origin']!['feature']).toBe(featureHash);
  });

  it('CA-push-02 : remote.heads.feature === hash local après push', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    engine.execute('git checkout -b feature');
    engine.execute('write feat.txt "feature"');
    engine.execute('git add feat.txt');
    engine.execute('git commit -m "feature"');
    const featureHash = engine.snapshot().branches['feature'];

    engine.execute('git push origin feature');

    const snap = engine.snapshot();
    expect(snap.remotes!['origin']!.heads['feature']).toBe(featureHash);
  });
});

// ---------------------------------------------------------------------------
// CA-push-03 : Push avec -u (set-upstream)
// ---------------------------------------------------------------------------

describe('git push — CA-push-03 : push avec -u configure upstream', () => {
  it('CA-push-03 : exitCode 0 avec -u', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    engine.execute('git checkout -b newbranch');
    engine.execute('write nb.txt "nb"');
    engine.execute('git add nb.txt');
    engine.execute('git commit -m "nb commit"');

    const result = engine.execute('git push -u origin newbranch');
    expect(result.exitCode).toBe(0);
  });

  it('CA-push-03 : branchUpstream configuré après push -u', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    engine.execute('git checkout -b newbranch');
    engine.execute('write nb.txt "nb"');
    engine.execute('git add nb.txt');
    engine.execute('git commit -m "nb commit"');

    engine.execute('git push -u origin newbranch');

    const snap = engine.snapshot();
    expect(snap.branchUpstream?.['newbranch']).toEqual({ remote: 'origin', branch: 'newbranch' });
  });

  it('CA-push-03 : git push sans args fonctionne après -u', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    engine.execute('git checkout -b mybranch');
    engine.execute('write f.txt "v1"');
    engine.execute('git add f.txt');
    engine.execute('git commit -m "first"');
    engine.execute('git push -u origin mybranch');

    // Ajouter un nouveau commit puis push sans args
    engine.execute('write f.txt "v2"');
    engine.execute('git add f.txt');
    engine.execute('git commit -m "second"');
    const result = engine.execute('git push');
    expect(result.exitCode).toBe(0);
  });

  it('CA-push-03 : output mentionne "set up to track" après push -u', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    engine.execute('git checkout -b newbranch');
    engine.execute('write nb.txt "nb"');
    engine.execute('git add nb.txt');
    engine.execute('git commit -m "nb"');

    const result = engine.execute('git push -u origin newbranch');
    const output = result.output.join('\n');
    expect(output).toContain('set up to track');
  });
});

// ---------------------------------------------------------------------------
// CA-push-04 : Push sans upstream, pas d'argument
// ---------------------------------------------------------------------------

describe('git push — CA-push-04 : push sans upstream', () => {
  it('CA-push-04 : git push sans upstream → exitCode 128', () => {
    const engine = replay([
      'git init',
      'write f.txt "hello"',
      'git add f.txt',
      'git commit -m "init"',
    ]);
    const result = engine.execute('git push');
    expect(result.exitCode).toBe(128);
  });

  it('CA-push-04 : message contient "has no upstream branch"', () => {
    const engine = replay([
      'git init',
      'write f.txt "hello"',
      'git add f.txt',
      'git commit -m "init"',
    ]);
    const result = engine.execute('git push');
    const allMessages = [...result.errors, ...result.output].join('\n');
    expect(allMessages).toContain('has no upstream branch');
  });

  it('CA-push-04 : aucune modification après erreur sans upstream', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    // Créer une branche sans upstream
    engine.execute('git checkout -b orphan');
    engine.execute('write o.txt "orphan"');
    engine.execute('git add o.txt');
    engine.execute('git commit -m "orphan"');

    const snapBefore = engine.snapshot();
    engine.execute('git push');
    const snapAfter = engine.snapshot();

    expect(snapAfter.remoteTrackingRefs?.['origin']?.['orphan']).toBeUndefined();
    expect(snapAfter.remotes?.['origin']?.heads?.['orphan']).toBeUndefined();
    // branche locale inchangée
    expect(snapAfter.branches['orphan']).toBe(snapBefore.branches['orphan']);
  });
});

// ---------------------------------------------------------------------------
// CA-push-05 : Push rejeté (non-fast-forward)
// ---------------------------------------------------------------------------

describe('git push — CA-push-05 : push rejeté non-fast-forward', () => {
  it('CA-push-05 : exitCode 1 pour push non-fast-forward', () => {
    const engine = cloneAndDiverge();
    const result = engine.execute('git push origin main');
    expect(result.exitCode).toBe(1);
  });

  it('CA-push-05 : messages contiennent "rejected" et "non-fast-forward"', () => {
    const engine = cloneAndDiverge();
    const result = engine.execute('git push origin main');
    const allMessages = [...result.output, ...result.errors].join('\n');
    expect(allMessages).toContain('rejected');
    expect(allMessages).toContain('non-fast-forward');
  });

  it('CA-push-05 : remote inchangé après push rejeté', () => {
    const engine = cloneAndDiverge();
    const snapBefore = engine.snapshot();
    const originMainBefore = snapBefore.remotes!['origin']!.heads['main'];

    engine.execute('git push origin main');

    const snapAfter = engine.snapshot();
    expect(snapAfter.remotes!['origin']!.heads['main']).toBe(originMainBefore);
  });

  it('CA-push-05 : remoteTrackingRefs.origin.main inchangé après push rejeté', () => {
    const engine = cloneAndDiverge();
    const snapBefore = engine.snapshot();
    const trackBefore = snapBefore.remoteTrackingRefs!['origin']!['main'];

    engine.execute('git push origin main');

    const snapAfter = engine.snapshot();
    expect(snapAfter.remoteTrackingRefs!['origin']!['main']).toBe(trackBefore);
  });
});

// ---------------------------------------------------------------------------
// CA-push-06 : Push force (--force)
// ---------------------------------------------------------------------------

describe('git push — CA-push-06 : push --force', () => {
  it('CA-push-06 : exitCode 0 avec --force sur non-ff', () => {
    const engine = cloneAndDiverge();
    const result = engine.execute('git push --force origin main');
    expect(result.exitCode).toBe(0);
  });

  it('CA-push-06 : remote mis à jour après --force', () => {
    const engine = cloneAndDiverge();
    const localHash = engine.snapshot().branches['main'];

    engine.execute('git push --force origin main');

    const snap = engine.snapshot();
    expect(snap.remotes!['origin']!.heads['main']).toBe(localHash);
  });

  it('CA-push-06 : remoteTrackingRefs.origin.main mis à jour après --force', () => {
    const engine = cloneAndDiverge();
    const localHash = engine.snapshot().branches['main'];

    engine.execute('git push --force origin main');

    const snap = engine.snapshot();
    expect(snap.remoteTrackingRefs!['origin']!['main']).toBe(localHash);
  });

  it('CA-push-06 : output mentionne "forced update"', () => {
    const engine = cloneAndDiverge();
    const result = engine.execute('git push --force origin main');
    const output = result.output.join('\n');
    expect(output).toContain('forced update');
  });
});

// ---------------------------------------------------------------------------
// CA-push-07 : Push distant inexistant
// ---------------------------------------------------------------------------

describe('git push — CA-push-07 : distant inexistant', () => {
  it('CA-push-07 : exitCode 128 pour remote inexistant', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    const result = engine.execute('git push nosuchremote main');
    expect(result.exitCode).toBe(128);
  });

  it('CA-push-07 : message contient "No remote named"', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    const result = engine.execute('git push nosuchremote main');
    const allMessages = [...result.errors, ...result.output].join('\n');
    expect(allMessages).toContain('No remote named');
  });

  it('CA-push-07 : aucune modification après erreur remote inexistant', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    const snapBefore = engine.snapshot();
    engine.execute('git push nosuchremote main');
    const snapAfter = engine.snapshot();
    expect(snapAfter.remoteTrackingRefs).toEqual(snapBefore.remoteTrackingRefs);
  });
});

// ---------------------------------------------------------------------------
// CA-push-08 : Push branche locale inexistante
// ---------------------------------------------------------------------------

describe('git push — CA-push-08 : branche locale inexistante', () => {
  it('CA-push-08 : exitCode 128 pour branche inexistante', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    const result = engine.execute('git push origin nosuchbranch');
    expect(result.exitCode).toBe(128);
  });

  it('CA-push-08 : message contient "not something we can push" ou "does not match"', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    const result = engine.execute('git push origin nosuchbranch');
    const allMessages = [...result.errors, ...result.output].join('\n');
    expect(
      allMessages.includes('not something we can push') ||
      allMessages.includes('does not match'),
    ).toBe(true);
  });

  it('CA-push-08 : aucune modification après erreur branche inexistante', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    const snapBefore = engine.snapshot();
    engine.execute('git push origin nosuchbranch');
    const snapAfter = engine.snapshot();
    expect(snapAfter.remoteTrackingRefs).toEqual(snapBefore.remoteTrackingRefs);
  });
});

// ---------------------------------------------------------------------------
// CA-push-09 : Push, tout déjà à jour
// ---------------------------------------------------------------------------

describe('git push — CA-push-09 : everything up-to-date', () => {
  it('CA-push-09 : exitCode 0 si déjà à jour', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    // Pas de nouveau commit : tout est aligné
    const result = engine.execute('git push origin main');
    expect(result.exitCode).toBe(0);
  });

  it('CA-push-09 : output contient "Everything up-to-date"', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    const result = engine.execute('git push origin main');
    expect(result.output.join('\n')).toContain('Everything up-to-date');
  });

  it('CA-push-09 : second push après premier push = still up-to-date', () => {
    const engine = cloneAndAddCommit();
    engine.execute('git push origin main');
    // Deuxième push
    const result = engine.execute('git push origin main');
    expect(result.exitCode).toBe(0);
    expect(result.output.join('\n')).toContain('Everything up-to-date');
  });
});

// ---------------------------------------------------------------------------
// CA-push-10 : Push n'affecte pas HEAD local ni branches autres
// ---------------------------------------------------------------------------

describe('git push — CA-push-10 : HEAD et branches locales inchangés', () => {
  it('CA-push-10 : HEAD toujours symbolique sur main après push', () => {
    const engine = cloneAndAddCommit();
    const headBefore = engine.snapshot().head;
    engine.execute('git push origin main');
    const headAfter = engine.snapshot().head;
    expect(headAfter).toEqual(headBefore);
  });

  it('CA-push-10 : branche develop locale inchangée après push origin main', () => {
    const engine = newEngine();
    engine.execute('git clone collab-repo');
    // Créer une branche locale develop
    engine.execute('git checkout -b develop');
    engine.execute('git checkout main');
    engine.execute('write extra.txt "extra"');
    engine.execute('git add extra.txt');
    engine.execute('git commit -m "extra"');
    const developHashBefore = engine.snapshot().branches['develop'];

    engine.execute('git push origin main');

    const snap = engine.snapshot();
    expect(snap.branches['develop']).toBe(developHashBefore);
  });
});

// ---------------------------------------------------------------------------
// CA-push-11 : Push force avec -f (alias court)
// ---------------------------------------------------------------------------

describe('git push — CA-push-11 : push -f (alias --force)', () => {
  it('CA-push-11 : exitCode 0 avec -f sur non-ff', () => {
    const engine = cloneAndDiverge();
    const result = engine.execute('git push -f origin main');
    expect(result.exitCode).toBe(0);
  });

  it('CA-push-11 : comportement identique à --force', () => {
    const engineF = cloneAndDiverge();
    const engineForce = cloneAndDiverge();

    const resultF = engineF.execute('git push -f origin main');
    const resultForce = engineForce.execute('git push --force origin main');

    expect(resultF.exitCode).toBe(resultForce.exitCode);

    const localHashF = engineF.snapshot().branches['main'];
    const localHashForce = engineForce.snapshot().branches['main'];
    // Les deux engines ont les mêmes commits donc même hash
    expect(
      engineF.snapshot().remotes!['origin']!.heads['main'],
    ).toBe(localHashF);
    expect(
      engineForce.snapshot().remotes!['origin']!.heads['main'],
    ).toBe(localHashForce);
  });
});

// ---------------------------------------------------------------------------
// CA-push-12 : Push --set-upstream configure upstream
// ---------------------------------------------------------------------------

describe('git push — CA-push-12 : push --set-upstream', () => {
  it('CA-push-12 : exitCode 0 avec --set-upstream', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    engine.execute('git checkout -b feature');
    engine.execute('write f.txt "feat"');
    engine.execute('git add f.txt');
    engine.execute('git commit -m "feat"');

    const result = engine.execute('git push --set-upstream origin feature');
    expect(result.exitCode).toBe(0);
  });

  it('CA-push-12 : branchUpstream configuré après --set-upstream', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    engine.execute('git checkout -b feature');
    engine.execute('write f.txt "feat"');
    engine.execute('git add f.txt');
    engine.execute('git commit -m "feat"');

    engine.execute('git push --set-upstream origin feature');

    const snap = engine.snapshot();
    expect(snap.branchUpstream?.['feature']).toEqual({ remote: 'origin', branch: 'feature' });
  });

  it('CA-push-12 : push fast-forward vers distant (création ou maj)', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    engine.execute('git checkout -b feature');
    engine.execute('write f.txt "feat"');
    engine.execute('git add f.txt');
    engine.execute('git commit -m "feat"');
    const featureHash = engine.snapshot().branches['feature'];

    engine.execute('git push --set-upstream origin feature');

    const snap = engine.snapshot();
    expect(snap.remotes!['origin']!.heads['feature']).toBe(featureHash);
  });
});

// ---------------------------------------------------------------------------
// CA-push-13 : Snapshot expose remotes mis à jour après push
// ---------------------------------------------------------------------------

describe('git push — CA-push-13 : snapshot.remotes reflète le push', () => {
  it('CA-push-13 : remotes.origin.allCommits contient le nouveau commit local', () => {
    const engine = cloneAndAddCommit();
    const localCommits = engine.snapshot().allCommits!;
    const newCommitHash = localCommits[0]!.hash; // le plus récent

    engine.execute('git push origin main');

    const snap = engine.snapshot();
    const remoteCommits = snap.remotes!['origin']!.allCommits;
    expect(remoteCommits.some((c) => c.hash === newCommitHash)).toBe(true);
  });

  it('CA-push-13 : remotes.origin.allCommits.length augmente après push', () => {
    const engine = cloneAndAddCommit();
    const countBefore = engine.snapshot().remotes!['origin']!.allCommits.length;

    engine.execute('git push origin main');

    const countAfter = engine.snapshot().remotes!['origin']!.allCommits.length;
    expect(countAfter).toBeGreaterThan(countBefore);
  });

  it('CA-push-13 : remotes.origin.heads.main pointe le nouveau commit', () => {
    const engine = cloneAndAddCommit();
    const localHash = engine.snapshot().branches['main'];

    engine.execute('git push origin main');

    const snap = engine.snapshot();
    expect(snap.remotes!['origin']!.heads['main']).toBe(localHash);
  });
});
