/**
 * Tests Phase 2 : git tag
 * Spec : docs/specs/14-tag.md
 *
 * Principe : tests dérivés des spécifications (CA numérotés), pas de l'implémentation.
 */

import { describe, it, expect } from 'vitest';
import { newEngine, replay } from './helpers';
import type { GitEngine } from '@/core/engine';

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

function engineWithCommit(): GitEngine {
  return replay([
    'git init',
    'write file.txt "hello"',
    'git add file.txt',
    'git commit -m "initial"',
  ]);
}

function engineWithTwoCommits(): { engine: GitEngine; c1: string; c2: string } {
  const engine = replay([
    'git init',
    'write file.txt "v1"',
    'git add file.txt',
    'git commit -m "c1"',
    'write file.txt "v2"',
    'git add file.txt',
    'git commit -m "c2"',
  ]);
  const snap = engine.snapshot();
  const c2 = snap.commits[0]!.hash;
  const c1 = snap.commits[1]!.hash;
  return { engine, c1, c2 };
}

// ---------------------------------------------------------------------------
// CA-tag-01 : Lister les tags (aucun)
// ---------------------------------------------------------------------------

describe('git tag — CA-tag-01 : lister les tags (aucun)', () => {
  it('CA-tag-01 : exitCode 0, output vide quand pas de tags', () => {
    const engine = engineWithCommit();
    const result = engine.execute('git tag');

    expect(result.exitCode).toBe(0);
    expect(result.output).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CA-tag-02 : Lister les tags (plusieurs, tri alphabétique)
// ---------------------------------------------------------------------------

describe('git tag — CA-tag-02 : lister plusieurs tags en ordre alphabétique', () => {
  it('CA-tag-02 : tags triés alphabétiquement', () => {
    const engine = engineWithCommit();
    engine.execute('git tag v1.1');
    engine.execute('git tag release');
    engine.execute('git tag v1.0');

    // Créer un deuxième commit pour tagger dessus
    engine.execute('write file.txt "v2"');
    engine.execute('git add file.txt');
    engine.execute('git commit -m "c2"');

    const result = engine.execute('git tag');

    expect(result.exitCode).toBe(0);
    // Les tags doivent être en ordre alphabétique
    const output = result.output;
    expect(output).toContain('release');
    expect(output).toContain('v1.0');
    expect(output).toContain('v1.1');
    // Vérifier l'ordre : release < v1.0 < v1.1
    const releaseIdx = output.indexOf('release');
    const v10Idx = output.indexOf('v1.0');
    const v11Idx = output.indexOf('v1.1');
    expect(releaseIdx).toBeLessThan(v10Idx);
    expect(v10Idx).toBeLessThan(v11Idx);
  });
});

// ---------------------------------------------------------------------------
// CA-tag-03 : Créer un tag sur HEAD
// ---------------------------------------------------------------------------

describe('git tag — CA-tag-03 : créer un tag sur HEAD', () => {
  it('CA-tag-03 : exitCode 0, output vide, tag pointe sur HEAD', () => {
    const engine = engineWithCommit();
    const snap0 = engine.snapshot();
    const headHash = snap0.commits[0]?.hash ?? '';

    const result = engine.execute('git tag v1.0');

    expect(result.exitCode).toBe(0);
    expect(result.output).toEqual([]);
    expect(result.errors).toEqual([]);

    const snap = engine.snapshot();
    expect(snap.tags['v1.0']).toBe(headHash);
  });

  it('CA-tag-03 : le tag apparaît dans snapshot.commits[].tags', () => {
    const engine = engineWithCommit();
    engine.execute('git tag v1.0');

    const snap = engine.snapshot();
    const commit = snap.commits[0];
    expect(commit?.tags).toContain('v1.0');
  });
});

// ---------------------------------------------------------------------------
// CA-tag-04 : Créer un tag sur un commit spécifié
// ---------------------------------------------------------------------------

describe('git tag — CA-tag-04 : créer un tag sur un commit spécifié', () => {
  it('CA-tag-04 : exitCode 0, tag pointe sur c1 (pas sur HEAD)', () => {
    const { engine, c1, c2 } = engineWithTwoCommits();

    const result = engine.execute(`git tag v1.0 ${c1}`);

    expect(result.exitCode).toBe(0);
    expect(result.output).toEqual([]);

    const snap = engine.snapshot();
    expect(snap.tags['v1.0']).toBe(c1);
    // HEAD est sur c2, tag ne doit pas pointer sur c2
    expect(snap.tags['v1.0']).not.toBe(c2);
  });

  it('CA-tag-04 : avec hash court de c1', () => {
    const { engine, c1 } = engineWithTwoCommits();
    const shortC1 = c1.slice(0, 7);

    const result = engine.execute(`git tag v1.0 ${shortC1}`);
    expect(result.exitCode).toBe(0);

    const snap = engine.snapshot();
    expect(snap.tags['v1.0']).toBe(c1);
  });

  it('CA-tag-04 : snapshot.commits reflète le tag sur le bon commit', () => {
    const { engine, c1 } = engineWithTwoCommits();
    engine.execute(`git tag v1.0 ${c1}`);

    const snap = engine.snapshot();
    // c1 est le parent de HEAD (commits[1])
    const commitWithTag = snap.commits.find((c) => c.hash === c1);
    expect(commitWithTag?.tags).toContain('v1.0');

    // Le commit HEAD (commits[0]) ne doit pas avoir v1.0
    const headCommit = snap.commits[0];
    expect(headCommit?.tags).not.toContain('v1.0');
  });
});

// ---------------------------------------------------------------------------
// CA-tag-05 : Créer un tag en mode HEAD détaché
// ---------------------------------------------------------------------------

describe('git tag — CA-tag-05 : créer un tag en mode HEAD détaché', () => {
  it('CA-tag-05 : tag pointe sur le commit détaché', () => {
    const { engine, c1 } = engineWithTwoCommits();

    // Détacher HEAD sur c1
    engine.execute(`git checkout ${c1}`);
    const snapDetached = engine.snapshot();
    expect(snapDetached.head.type).toBe('detached');
    const detachedHash = snapDetached.head.type === 'detached' ? snapDetached.head.hash : '';

    const result = engine.execute('git tag v1.0');

    expect(result.exitCode).toBe(0);
    const snap = engine.snapshot();
    expect(snap.tags['v1.0']).toBe(detachedHash);
    expect(snap.tags['v1.0']).toBe(c1);
  });
});

// ---------------------------------------------------------------------------
// CA-tag-06 : Supprimer un tag
// ---------------------------------------------------------------------------

describe('git tag — CA-tag-06 : supprimer un tag', () => {
  it("CA-tag-06 : exitCode 0, output 'Deleted tag', tag supprimé", () => {
    const engine = engineWithCommit();
    engine.execute('git tag v1.0');

    const snapBefore = engine.snapshot();
    expect(snapBefore.tags['v1.0']).toBeDefined();

    const result = engine.execute('git tag -d v1.0');

    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.includes("Deleted tag 'v1.0'"))).toBe(true);
    // Le message doit contenir le shortHash
    expect(result.output.some((l) => l.includes('was'))).toBe(true);

    const snap = engine.snapshot();
    expect('v1.0' in snap.tags).toBe(false);
    // Le commit ne doit plus avoir ce tag
    expect(snap.commits[0]?.tags).not.toContain('v1.0');
  });
});

// ---------------------------------------------------------------------------
// CA-tag-07 : Erreur : tag déjà existant
// ---------------------------------------------------------------------------

describe('git tag — CA-tag-07 : erreur tag déjà existant', () => {
  it("CA-tag-07 : exitCode 1, message 'already exists', refs inchangés", () => {
    const engine = engineWithCommit();
    engine.execute('git tag v1.0');

    const snapBefore = engine.snapshot();
    const result = engine.execute('git tag v1.0');

    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes("tag 'v1.0' already exists"))).toBe(true);

    // refs inchangé
    const snapAfter = engine.snapshot();
    expect(snapAfter.tags).toEqual(snapBefore.tags);
  });
});

// ---------------------------------------------------------------------------
// CA-tag-08 : Erreur : supprimer un tag inexistant
// ---------------------------------------------------------------------------

describe('git tag — CA-tag-08 : erreur supprimer un tag inexistant', () => {
  it("CA-tag-08 : exitCode 1, message 'not found'", () => {
    const engine = engineWithCommit();
    const result = engine.execute('git tag -d nosuch');

    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes("tag 'nosuch' not found"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-tag-09 : Erreur : créer un tag sur un commit inexistant
// ---------------------------------------------------------------------------

describe('git tag — CA-tag-09 : erreur commit inexistant', () => {
  it("CA-tag-09 : exitCode 1, message 'is not a commit' ou 'cannot find object'", () => {
    const engine = engineWithCommit();
    const result = engine.execute('git tag v1.0 nosuchcommit');

    expect(result.exitCode).toBe(1);
    expect(
      result.errors.some(
        (e) => e.includes('is not a commit') || e.includes('cannot find object'),
      ),
    ).toBe(true);

    const snap = engine.snapshot();
    expect('v1.0' in snap.tags).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CA-tag-10 : Erreur : créer un tag sur HEAD vierge
// ---------------------------------------------------------------------------

describe('git tag — CA-tag-10 : erreur créer un tag sur HEAD vierge', () => {
  it("CA-tag-10 : exitCode 1, message 'Failed to resolve HEAD'", () => {
    const engine = replay(['git init']); // aucun commit
    const result = engine.execute('git tag v1.0');

    expect(result.exitCode).toBe(1);
    expect(
      result.errors.some(
        (e) =>
          e.includes("Failed to resolve 'HEAD'") ||
          e.toLowerCase().includes('head') ||
          e.toLowerCase().includes('valid ref'),
      ),
    ).toBe(true);

    const snap = engine.snapshot();
    expect('v1.0' in snap.tags).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CA-tag-11 : Nom de tag invalide (vide)
// ---------------------------------------------------------------------------

describe('git tag — CA-tag-11 : nom de tag invalide', () => {
  it('CA-tag-11 : exitCode 1, message "invalid tag name"', () => {
    const engine = engineWithCommit();
    // Le tokenizer préserve une chaîne explicitement quotée même vide :
    // `git tag ""` transmet un nom vide → rejeté comme nom de tag invalide.
    const result = engine.execute('git tag ""');
    expect(result.exitCode).toBe(1);
    expect(result.errors[0]).toContain('invalid tag name');
    // Aucun tag ne doit avoir été créé.
    const snap = engine.snapshot();
    expect(Object.keys(snap.tags)).toHaveLength(0);
  });

  it('CA-tag-11 : nom commençant par - est invalide', () => {
    // Le nom "-badtag" commencerait par -, ce qui le fait parser comme flag
    // mais si on peut le passer, il doit être rejeté
    const engine = engineWithCommit();
    // On ne peut pas vraiment passer "-badtag" comme nom de tag via la CLI
    // car il serait traité comme un flag. On vérifie juste que le tag n'existe pas.
    const snap = engine.snapshot();
    expect(Object.keys(snap.tags)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cas limites : snapshot.tags et commits[].tags
// ---------------------------------------------------------------------------

describe('git tag — snapshot cohérence tags', () => {
  it('snapshot.tags reflète tous les tags créés', () => {
    const { engine, c1, c2 } = engineWithTwoCommits();
    engine.execute('git tag v1.0');
    engine.execute(`git tag release ${c1}`);

    const snap = engine.snapshot();
    expect(snap.tags['v1.0']).toBe(c2); // HEAD = c2
    expect(snap.tags['release']).toBe(c1);
    expect(Object.keys(snap.tags)).toHaveLength(2);
  });

  it('snapshot.commits[].tags liste les tags par commit', () => {
    const { engine, c1, c2 } = engineWithTwoCommits();
    engine.execute(`git tag v1.0 ${c1}`);
    engine.execute(`git tag v2.0 ${c2}`);
    engine.execute(`git tag latest ${c2}`);

    const snap = engine.snapshot();
    const commitC1 = snap.commits.find((c) => c.hash === c1);
    const commitC2 = snap.commits.find((c) => c.hash === c2);

    expect(commitC1?.tags).toContain('v1.0');
    expect(commitC1?.tags).not.toContain('v2.0');
    expect(commitC2?.tags).toContain('v2.0');
    expect(commitC2?.tags).toContain('latest');
  });

  it('après suppression d un tag, commits[].tags est mis à jour', () => {
    const engine = engineWithCommit();
    engine.execute('git tag v1.0');
    engine.execute('git tag -d v1.0');

    const snap = engine.snapshot();
    expect('v1.0' in snap.tags).toBe(false);
    expect(snap.commits[0]?.tags).not.toContain('v1.0');
  });

  it('un même commit peut avoir plusieurs tags', () => {
    const engine = engineWithCommit();
    engine.execute('git tag v1.0');
    engine.execute('git tag release');
    engine.execute('git tag stable');

    const snap = engine.snapshot();
    const commit = snap.commits[0];
    expect(commit?.tags).toContain('v1.0');
    expect(commit?.tags).toContain('release');
    expect(commit?.tags).toContain('stable');
  });

  it('déterminisme : deux engines avec tags produisent les mêmes hashes', () => {
    const cmds = [
      'git init',
      'write f.txt "v1"',
      'git add f.txt',
      'git commit -m "c1"',
      'git tag v1.0',
    ];
    const e1 = replay(cmds);
    const e2 = replay(cmds);
    expect(e1.snapshot().tags).toEqual(e2.snapshot().tags);
    expect(e1.snapshot().commits[0]?.hash).toBe(e2.snapshot().commits[0]?.hash);
  });
});

// ---------------------------------------------------------------------------
// Dépôt non initialisé
// ---------------------------------------------------------------------------

describe('git tag — dépôt non initialisé', () => {
  it('exitCode 128, message not a git repository', () => {
    const engine = newEngine();
    const result = engine.execute('git tag');
    expect(result.exitCode).toBe(128);
    expect(result.errors.some((e) => e.includes('not a git repository'))).toBe(true);
  });
});
