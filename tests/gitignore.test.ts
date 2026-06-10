/**
 * Tests de `.gitignore` (spec 44). CA-gitignore-01 à 14.
 */
import { describe, expect, it } from 'vitest';
import { replay } from './helpers';
import { parseGitignore, isIgnored } from '@/core/gitignore';

function statusOut(commands: string[]): string {
  const engine = replay(commands);
  const r = engine.execute('git status');
  return r.output.join('\n');
}

describe('.gitignore (spec 44)', () => {
  it('CA-gitignore-01 : glob simple *.log', () => {
    const out = statusOut([
      'git init',
      'write .gitignore "*.log"',
      'write file.txt "a"',
      'write debug.log "b"',
      'write app.log "c"',
    ]);
    expect(out).toContain('file.txt');
    expect(out).not.toContain('debug.log');
    expect(out).not.toContain('app.log');
  });

  it('CA-gitignore-02 : répertoire node_modules/', () => {
    const out = statusOut([
      'git init',
      'write .gitignore "node_modules/"',
      'write main.js "a"',
      'write node_modules/lodash/index.js "b"',
      'write node_modules/lodash/package.json "c"',
    ]);
    expect(out).toContain('main.js');
    expect(out).not.toContain('node_modules');
    expect(out).not.toContain('lodash');
  });

  it('CA-gitignore-03 : glob **/temp', () => {
    const out = statusOut([
      'git init',
      'write .gitignore "**/temp"',
      'write temp "1"',
      'write a/temp "2"',
      'write a/b/temp "3"',
      'write template "4"',
    ]);
    expect(out).toContain('template');
    expect(out).not.toMatch(/(^|\s)temp(\s|$)/m);
    expect(out).not.toContain('a/temp');
    expect(out).not.toContain('a/b/temp');
  });

  it('CA-gitignore-04 : négation avec !', () => {
    const out = statusOut([
      'git init',
      'write .gitignore "*.log\n!important.log"',
      'write debug.log "1"',
      'write important.log "2"',
      'write app.log "3"',
    ]);
    expect(out).not.toContain('debug.log');
    expect(out).not.toContain('app.log');
    expect(out).toContain('important.log');
  });

  it('CA-gitignore-05 : last match wins', () => {
    const out = statusOut([
      'git init',
      'write .gitignore "*.log\n!debug.log\n*.log"',
      'write debug.log "1"',
      'write app.log "2"',
    ]);
    expect(out).not.toContain('debug.log');
    expect(out).not.toContain('app.log');
  });

  it('CA-gitignore-06 : git add refuse les fichiers ignorés', () => {
    const engine = replay(['git init', 'write .gitignore "*.log"', 'write debug.log "x"']);
    const r = engine.execute('git add debug.log');
    expect(r.exitCode).toBe(1);
    expect(r.errors[0]).toContain('is ignored by one of your .gitignore files');
  });

  it('CA-gitignore-07 : git add -f force l’ajout', () => {
    const engine = replay(['git init', 'write .gitignore "*.log"', 'write debug.log "x"']);
    const r = engine.execute('git add -f debug.log');
    expect(r.exitCode).toBe(0);
    expect(engine.snapshot().indexPaths).toContain('debug.log');
  });

  it('CA-gitignore-08 : git add . ignore les fichiers ignorés', () => {
    const engine = replay([
      'git init',
      'write .gitignore "*.log"',
      'write file.txt "a"',
      'write debug.log "b"',
      'write app.log "c"',
    ]);
    engine.execute('git add .');
    const idx = engine.snapshot().indexPaths;
    expect(idx).toContain('file.txt');
    expect(idx).not.toContain('debug.log');
    expect(idx).not.toContain('app.log');
  });

  it('CA-gitignore-09 : fichier déjà suivi reste visible', () => {
    const out = statusOut([
      'git init',
      'write doc.txt "v1"',
      'git add doc.txt',
      'git commit -m "c1"',
      'write .gitignore "*.txt"',
      'write doc.txt "v2"',
    ]);
    expect(out).toContain('Changes not staged for commit');
    expect(out).toContain('doc.txt');
  });

  it('CA-gitignore-10 : commentaires et lignes vides ignorés', () => {
    const out = statusOut([
      'git init',
      'write .gitignore "# Build artifacts\n*.log\n\n# Deps\nnode_modules/"',
      'write debug.log "1"',
      'write node_modules/lodash "2"',
      'write src/app.js "3"',
    ]);
    expect(out).not.toContain('debug.log');
    expect(out).not.toContain('node_modules');
    expect(out).toContain('src/app.js');
  });

  it('CA-gitignore-11 : pattern littéral src/cache', () => {
    const out = statusOut([
      'git init',
      'write .gitignore "src/cache"',
      'write src/cache "1"',
      'write src/cache.txt "2"',
      'write src/main.ts "3"',
      'write cache "4"',
    ]);
    expect(out).toContain('src/cache.txt');
    expect(out).toContain('src/main.ts');
    expect(out).toContain('cache');
    // src/cache exact ne doit pas apparaître seul (mais src/cache.txt oui)
    const lines = out.split('\n').map((l) => l.trim());
    expect(lines).not.toContain('src/cache');
  });

  it('CA-gitignore-12 : pas de .gitignore → rien ignoré', () => {
    const out = statusOut([
      'git init',
      'write a.log "1"',
      'write node_modules "2"',
      'write file.txt "3"',
    ]);
    expect(out).toContain('a.log');
    expect(out).toContain('node_modules');
    expect(out).toContain('file.txt');
  });

  it('CA-gitignore-13 : git add -f . ajoute tout', () => {
    const engine = replay([
      'git init',
      'write .gitignore "*.log"',
      'write file.txt "a"',
      'write debug.log "b"',
    ]);
    engine.execute('git add -f .');
    const idx = engine.snapshot().indexPaths;
    expect(idx).toContain('file.txt');
    expect(idx).toContain('debug.log');
  });

  it('CA-gitignore-14 : négation ré-inclut sous un répertoire ignoré', () => {
    const out = statusOut([
      'git init',
      'write .gitignore "/build\n!/build/keep/"',
      'write build/artifact.o "1"',
      'write build/keep/data.txt "2"',
      'write src/main.ts "3"',
    ]);
    expect(out).not.toContain('build/artifact.o');
    expect(out).toContain('build/keep/data.txt');
    expect(out).toContain('src/main.ts');
  });

  describe('module pur', () => {
    it('parse ignore commentaires et vides', () => {
      const pats = parseGitignore('# c\n\n*.log\n');
      expect(pats).toHaveLength(1);
    });
    it('isIgnored basique', () => {
      const pats = parseGitignore('*.log');
      expect(isIgnored('a.log', pats)).toBe(true);
      expect(isIgnored('a.txt', pats)).toBe(false);
    });
  });
});
