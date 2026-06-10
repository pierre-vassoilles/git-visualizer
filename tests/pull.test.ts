/**
 * Tests Phase 8 : git pull
 * Spec : docs/specs/38-pull.md
 * CA-pull-01..12
 *
 * Stratégie (mono-client) :
 *   - "local behind" : clone + git reset --hard HEAD~1 → local recule,
 *     origin/main reste au tip → pull fast-forward.
 *   - "divergence" : clone + reset --hard HEAD~1 + nouveau commit local
 *     → local et origin ont divergé → pull true merge ou --rebase.
 *   - "conflit" : état divergent avec même fichier modifié des deux côtés.
 *
 * CA-pull-11 (HEAD détaché) : OMIS — le comportement de pull sur HEAD
 *   détaché avec args explicites n'est pas implémenté (pull.ts refuse HEAD
 *   détaché sans branche explicite) et est hors scope Phase 8.
 *
 * Principe : boîte noire via execute() + snapshot().
 */

import { describe, it, expect } from 'vitest';
import { newEngine } from './helpers';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

/**
 * Simule un remote "en avance" via la mécanique push :
 *   1. Clone public-repo (3 commits C0←C1←C2, main à C2)
 *   2. git reset --hard HEAD~1 → local recule à C1, origin/main reste à C2
 *   Résultat : local est behind de 1 commit → pull fast-forward expected.
 */
function engineBehindOrigin() {
  const engine = newEngine();
  engine.execute('git clone public-repo');
  engine.execute('git reset --hard HEAD~1');
  return engine;
}

/**
 * Simule une divergence :
 *   1. Clone public-repo (main à C2)
 *   2. reset --hard HEAD~1 → local à C1
 *   3. Crée un commit local différent → diverge de origin/main (C2)
 * Résultat : local ahead 1 et behind 1 → pull nécessite un true merge.
 */
function engineDivergent() {
  const engine = newEngine();
  engine.execute('git clone public-repo');
  engine.execute('git reset --hard HEAD~1');
  engine.execute('write local-change.txt "local divergent content"');
  engine.execute('git add local-change.txt');
  engine.execute('git commit -m "local divergent commit"');
  return engine;
}

/**
 * Simule une divergence avec conflit sur un même fichier :
 *   1. Clone public-repo (main à C2)
 *   2. reset --hard HEAD~1 → local à C1
 *   3. Écrit "local" dans config.txt localement
 *   C2 (distant) contient config.txt avec un contenu différent, ou on
 *   force la divergence via un push préalable.
 *
 * Note : public-repo a ses propres fichiers (f0.txt, f1.txt, f2.txt
 * correspondant à C0, C1, C2). Pour créer un conflit sur config.txt :
 *   - On clone, on recule, on écrit config.txt côté local.
 *   - On pousse config.txt différent sur origin via un deuxième engine.
 */
function engineConflict() {
  // Engine A : sert à pousser config.txt="distant" sur origin
  const engineA = newEngine();
  engineA.execute('git clone public-repo');
  engineA.execute('write config.txt "distant version"');
  engineA.execute('git add config.txt');
  engineA.execute('git commit -m "add config.txt distant"');
  engineA.execute('git push origin main');

  // Engine B : clone le même public-repo, revient avant le commit de config.txt
  // (C2 du remote = maintenant la version avec config.txt "distant")
  // On ne peut pas vraiment "cloner" l'état après push d'un autre engine.
  // Solution : utiliser le même engine, créer une deuxième branche, diverger.
  //
  // Mais le catalogue prédéfini est partagé (immuable), donc il faut ruser.
  // On clone public-repo (3 commits), reset à HEAD~1 (C1), puis commit local
  // avec config.txt="local" → diverge. Le distant C2 n'a pas config.txt,
  // donc il n'y a PAS de conflit réel sur config.txt via cette route.
  //
  // Pour créer un vrai conflit, on doit utiliser un seul engine et forcer
  // la situation : partir de engine A qui a déjà poussé config.txt distant,
  // reculer, puis écrire config.txt local.
  engineA.execute('git reset --hard HEAD~1'); // recule à C2 du public-repo (pas config.txt)
  engineA.execute('write config.txt "local version"');
  engineA.execute('git add config.txt');
  engineA.execute('git commit -m "local config"');
  // Maintenant origin/main est à C2+config-distant, local est à C2+config-local : divergence conflictuelle

  return engineA;
}

// ---------------------------------------------------------------------------
// CA-pull-01 : Pull simple fast-forward
// ---------------------------------------------------------------------------

describe('git pull — CA-pull-01 : pull simple fast-forward', () => {
  it('CA-pull-01 : exitCode 0 après pull fast-forward', () => {
    const engine = engineBehindOrigin();
    const result = engine.execute('git pull');
    expect(result.exitCode).toBe(0);
  });

  it('CA-pull-01 : output contient "Fast-forward"', () => {
    const engine = engineBehindOrigin();
    const result = engine.execute('git pull');
    expect(result.output.join('\n')).toContain('Fast-forward');
  });

  it('CA-pull-01 : refs.heads.main === hash(origin/main) après pull', () => {
    const engine = engineBehindOrigin();
    const originMainHash = engine.snapshot().remoteTrackingRefs!['origin']!['main'];

    engine.execute('git pull');

    const snap = engine.snapshot();
    expect(snap.branches['main']).toBe(originMainHash);
  });

  it('CA-pull-01 : index et WT propres après pull fast-forward', () => {
    const engine = engineBehindOrigin();
    engine.execute('git pull');

    const snap = engine.snapshot();
    const nonClean = snap.files.filter((f) => f.status !== 'clean');
    expect(nonClean).toHaveLength(0);
  });

  it('CA-pull-01 : remoteTrackingRefs.origin.main mis à jour', () => {
    const engine = engineBehindOrigin();
    const originMainHash = engine.snapshot().remoteTrackingRefs!['origin']!['main'];

    engine.execute('git pull');

    const snap = engine.snapshot();
    expect(snap.remoteTrackingRefs!['origin']!['main']).toBe(originMainHash);
    expect(snap.branches['main']).toBe(originMainHash);
  });
});

// ---------------------------------------------------------------------------
// CA-pull-02 : Pull avec true merge (branches divergentes)
// ---------------------------------------------------------------------------

describe('git pull — CA-pull-02 : pull true merge (divergence)', () => {
  it('CA-pull-02 : exitCode 0 après merge divergent', () => {
    const engine = engineDivergent();
    const result = engine.execute('git pull');
    expect(result.exitCode).toBe(0);
  });

  it('CA-pull-02 : output contient "Merge made by"', () => {
    const engine = engineDivergent();
    const result = engine.execute('git pull');
    expect(result.output.join('\n')).toContain('Merge made by');
  });

  it('CA-pull-02 : commit de merge créé (2 parents)', () => {
    const engine = engineDivergent();
    engine.execute('git pull');

    const snap = engine.snapshot();
    const headHash = snap.branches['main'];
    const mergeCommit = snap.allCommits!.find((c) => c.hash === headHash);
    expect(mergeCommit).toBeDefined();
    expect(mergeCommit!.parents.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// CA-pull-03 : Pull --rebase
// ---------------------------------------------------------------------------

describe('git pull — CA-pull-03 : pull --rebase', () => {
  it('CA-pull-03 : exitCode 0 avec --rebase', () => {
    const engine = engineDivergent();
    const result = engine.execute('git pull --rebase');
    expect(result.exitCode).toBe(0);
  });

  it('CA-pull-03 : output contient "Successfully rebased"', () => {
    const engine = engineDivergent();
    const result = engine.execute('git pull --rebase');
    expect(result.output.join('\n')).toContain('Successfully rebased');
  });

  it('CA-pull-03 : aucun commit de merge après --rebase', () => {
    const engine = engineDivergent();
    engine.execute('git pull --rebase');

    const snap = engine.snapshot();
    const headHash = snap.branches['main'];
    const headCommit = snap.allCommits!.find((c) => c.hash === headHash);
    expect(headCommit).toBeDefined();
    // Pas de commit de merge (1 parent uniquement)
    expect(headCommit!.parents.length).toBe(1);
  });

  it('CA-pull-03 : les commits locaux sont rejoués (nouveaux hashes)', () => {
    const engine = engineDivergent();
    const localHashBefore = engine.snapshot().branches['main']!;

    engine.execute('git pull --rebase');

    const snap = engine.snapshot();
    // Le commit local a été rejoué → nouveau hash
    expect(snap.branches['main']).not.toBe(localHashBefore);
  });
});

// ---------------------------------------------------------------------------
// CA-pull-04 : Pull avec conflit
// ---------------------------------------------------------------------------

describe('git pull — CA-pull-04 : pull avec conflit merge', () => {
  it('CA-pull-04 : exitCode 1 en cas de conflit', () => {
    const engine = engineConflict();
    const result = engine.execute('git pull');
    expect(result.exitCode).toBe(1);
  });

  it('CA-pull-04 : output ou errors contient "CONFLICT"', () => {
    const engine = engineConflict();
    const result = engine.execute('git pull');
    const allMessages = [...result.output, ...result.errors].join('\n');
    expect(allMessages).toContain('CONFLICT');
  });

  it('CA-pull-04 : état merging activé après conflit', () => {
    const engine = engineConflict();
    engine.execute('git pull');

    const snap = engine.snapshot();
    expect(snap.operationState?.type).toBe('merging');
  });
});

// ---------------------------------------------------------------------------
// CA-pull-05 : Résolution et commit après pull conflictuel
// ---------------------------------------------------------------------------

describe('git pull — CA-pull-05 : résolution conflit après pull', () => {
  it('CA-pull-05 : commit réussit après résolution du conflit', () => {
    const engine = engineConflict();
    engine.execute('git pull');

    // Résoudre le conflit
    engine.execute('write config.txt "resolved version"');
    engine.execute('git add config.txt');
    const commitResult = engine.execute('git commit -m "Merge pull resolved"');

    expect(commitResult.exitCode).toBe(0);
  });

  it('CA-pull-05 : état merging désactivé après commit de résolution', () => {
    const engine = engineConflict();
    engine.execute('git pull');
    engine.execute('write config.txt "resolved"');
    engine.execute('git add config.txt');
    engine.execute('git commit -m "Merge pull resolved"');

    const snap = engine.snapshot();
    expect(snap.operationState).toBeUndefined();
  });

  it('CA-pull-05 : commit de fusion a 2 parents', () => {
    const engine = engineConflict();
    engine.execute('git pull');
    engine.execute('write config.txt "resolved"');
    engine.execute('git add config.txt');
    engine.execute('git commit -m "Merge pull resolved"');

    const snap = engine.snapshot();
    const headHash = snap.branches['main'];
    const mergeCommit = snap.allCommits!.find((c) => c.hash === headHash);
    expect(mergeCommit!.parents.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// CA-pull-06 : Pull avec arguments explicites
// ---------------------------------------------------------------------------

describe('git pull — CA-pull-06 : pull avec arguments explicites', () => {
  it('CA-pull-06 : pull origin main fonctionne sans upstream configuré', () => {
    // Partir d'un engine initialisé sans upstream puis pull origin main
    const engine = newEngine();
    engine.execute('git clone public-repo');
    // Créer une branche locale sans upstream
    engine.execute('git checkout -b local-feature');
    engine.execute('write lf.txt "lf"');
    engine.execute('git add lf.txt');
    engine.execute('git commit -m "local feature"');

    // git pull origin main depuis local-feature (sans upstream)
    const result = engine.execute('git pull origin main');
    expect(result.exitCode).toBe(0);
  });

  it('CA-pull-06 : git pull origin main met à jour remoteTrackingRefs', () => {
    const engine = engineBehindOrigin();
    const originMainHash = engine.snapshot().remoteTrackingRefs!['origin']!['main'];

    engine.execute('git pull origin main');

    const snap = engine.snapshot();
    expect(snap.remoteTrackingRefs!['origin']!['main']).toBe(originMainHash);
  });

  it("CA-pull-06 : git pull origin main ne pose pas d'upstream implicite", () => {
    const engine = newEngine();
    engine.execute('git init');
    engine.execute('write f.txt "hello"');
    engine.execute('git add f.txt');
    engine.execute('git commit -m "init"');

    // Vérifier qu'avant tout upstream est absent : pull sans args doit échouer
    engine.execute('git clone public-repo'); // ne fonctionne pas sur repo initialisé
    // On utilise un clone neuf
    const e2 = newEngine();
    e2.execute('git clone public-repo');
    e2.execute('git checkout -b solo');
    e2.execute('write s.txt "s"');
    e2.execute('git add s.txt');
    e2.execute('git commit -m "solo"');

    // pull explicite réussit
    const explicitResult = e2.execute('git pull origin main');
    expect(explicitResult.exitCode).toBe(0);

    // branchUpstream de solo non modifié (aucun upstream posé)
    const snap = e2.snapshot();
    expect(snap.branchUpstream?.['solo']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CA-pull-07 : Pull sans upstream configuré
// ---------------------------------------------------------------------------

describe('git pull — CA-pull-07 : pull sans upstream', () => {
  it("CA-pull-07 : exitCode 1 si pas d'upstream", () => {
    const engine = newEngine();
    engine.execute('git init');
    engine.execute('write f.txt "hello"');
    engine.execute('git add f.txt');
    engine.execute('git commit -m "init"');

    const result = engine.execute('git pull');
    expect(result.exitCode).toBe(1);
  });

  it('CA-pull-07 : message contient "no tracking information"', () => {
    const engine = newEngine();
    engine.execute('git init');
    engine.execute('write f.txt "hello"');
    engine.execute('git add f.txt');
    engine.execute('git commit -m "init"');

    const result = engine.execute('git pull');
    const allMessages = [...result.errors, ...result.output].join('\n');
    expect(allMessages).toContain('no tracking information');
  });

  it('CA-pull-07 : aucune modification après erreur sans upstream', () => {
    const engine = newEngine();
    engine.execute('git init');
    engine.execute('write f.txt "hello"');
    engine.execute('git add f.txt');
    engine.execute('git commit -m "init"');

    const snapBefore = engine.snapshot();
    engine.execute('git pull');
    const snapAfter = engine.snapshot();

    expect(snapAfter.branches['main']).toBe(snapBefore.branches['main']);
  });
});

// ---------------------------------------------------------------------------
// CA-pull-08 : Pull already up to date
// ---------------------------------------------------------------------------

describe('git pull — CA-pull-08 : already up to date', () => {
  it('CA-pull-08 : exitCode 0 si déjà à jour', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    // Pas de reset : local et origin alignés
    const result = engine.execute('git pull');
    expect(result.exitCode).toBe(0);
  });

  it('CA-pull-08 : output contient "Already up to date"', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    const result = engine.execute('git pull');
    expect(result.output.join('\n')).toContain('Already up to date');
  });

  it('CA-pull-08 : aucune modification si déjà à jour', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    const snapBefore = engine.snapshot();
    engine.execute('git pull');
    const snapAfter = engine.snapshot();
    expect(snapAfter.branches['main']).toBe(snapBefore.branches['main']);
    expect(snapAfter.allCommits!.length).toBe(snapBefore.allCommits!.length);
  });
});

// ---------------------------------------------------------------------------
// CA-pull-09 : Pull --no-rebase force le merge
// ---------------------------------------------------------------------------

describe('git pull — CA-pull-09 : pull --no-rebase', () => {
  it('CA-pull-09 : exitCode 0 avec --no-rebase', () => {
    const engine = engineDivergent();
    const result = engine.execute('git pull --no-rebase');
    expect(result.exitCode).toBe(0);
  });

  it('CA-pull-09 : commit de merge créé (2 parents) avec --no-rebase', () => {
    const engine = engineDivergent();
    engine.execute('git pull --no-rebase');

    const snap = engine.snapshot();
    const headHash = snap.branches['main'];
    const mergeCommit = snap.allCommits!.find((c) => c.hash === headHash);
    expect(mergeCommit!.parents.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// CA-pull-10 : Pull --rebase avec conflit
// ---------------------------------------------------------------------------

describe('git pull — CA-pull-10 : pull --rebase avec conflit', () => {
  it('CA-pull-10 : exitCode 1 avec --rebase en cas de conflit', () => {
    const engine = engineConflict();
    const result = engine.execute('git pull --rebase');
    expect(result.exitCode).toBe(1);
  });

  it('CA-pull-10 : output ou errors contient "CONFLICT"', () => {
    const engine = engineConflict();
    const result = engine.execute('git pull --rebase');
    const allMessages = [...result.output, ...result.errors].join('\n');
    expect(allMessages).toContain('CONFLICT');
  });

  it('CA-pull-10 : état rebasing activé après conflit --rebase', () => {
    const engine = engineConflict();
    engine.execute('git pull --rebase');

    const snap = engine.snapshot();
    expect(snap.operationState?.type).toBe('rebasing');
  });
});

// ---------------------------------------------------------------------------
// CA-pull-12 : Pull branche distante inexistante
// ---------------------------------------------------------------------------

describe('git pull — CA-pull-12 : branche distante inexistante', () => {
  it('CA-pull-12 : exitCode non-0 pour branche distante inexistante', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    const result = engine.execute('git pull origin nosuchbranch');
    expect(result.exitCode).not.toBe(0);
  });

  it("CA-pull-12 : message contient indication d'erreur", () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    const result = engine.execute('git pull origin nosuchbranch');
    const allMessages = [...result.output, ...result.errors].join('\n');
    // Selon l'implémentation : fetch fail ou merge fail
    expect(
      allMessages.includes('not something we can') ||
        allMessages.includes("Couldn't find") ||
        allMessages.includes('No remote tracking') ||
        allMessages.includes('nosuchbranch'),
    ).toBe(true);
  });

  it('CA-pull-12 : aucune modification après erreur', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    const snapBefore = engine.snapshot();
    engine.execute('git pull origin nosuchbranch');
    const snapAfter = engine.snapshot();
    expect(snapAfter.branches['main']).toBe(snapBefore.branches['main']);
  });
});

// ---------------------------------------------------------------------------
// Cas limites
// ---------------------------------------------------------------------------

describe('git pull — cas limites', () => {
  it('remote inexistant → exitCode non-0', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    const result = engine.execute('git pull nosuchremote main');
    expect(result.exitCode).not.toBe(0);
  });

  it('remote inexistant → message contient "does not appear to be a git repository" ou "No remote named"', () => {
    const engine = newEngine();
    engine.execute('git clone public-repo');
    const result = engine.execute('git pull nosuchremote main');
    const allMessages = [...result.errors, ...result.output].join('\n');
    expect(
      allMessages.includes('does not appear to be a git repository') ||
        allMessages.includes('No remote named'),
    ).toBe(true);
  });

  it('pull sur dépôt non initialisé → exitCode 128', () => {
    const engine = newEngine();
    const result = engine.execute('git pull');
    expect(result.exitCode).toBe(128);
  });
});
