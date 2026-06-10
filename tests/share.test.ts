/**
 * Tests Phase B3 : liens partageables
 * Spec : docs/specs/59-shareable-links.md
 *
 * - Module pur (share.ts) : encode/decode (gzip+base64url), taille, parsing URL.
 * - Store (repo.ts) : generateShareableLink + chargement via importSession (réutilisé).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useRepoStore } from '@/stores/repo';
import { buildExportedSession } from '@/utils/export-import';
import {
  encodeSession,
  decodeSession,
  buildShareLink,
  getEncodedFromHash,
  getSessionFromUrl,
  checkSessionSize,
} from '@/utils/share';

// ---------------------------------------------------------------------------
// Module pur
// ---------------------------------------------------------------------------

describe('share (module pur, spec 59)', () => {
  it('CA-share-01 : encode en base64url (pas de / + =) et roundtrip', () => {
    const session = buildExportedSession(['git init', 'git add f', 'git commit -m "test"'], 1);
    const encoded = encodeSession(session);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/); // base64url pur
    expect(encoded).not.toMatch(/[/+=]/);
    expect(decodeSession(encoded)).toEqual(session);
  });

  it('CA-share-08 : roundtrip session grande + compression < 30 %', () => {
    const cmds: string[] = ['git init'];
    for (let i = 0; i < 100; i++) {
      cmds.push(`write f${i}.txt "contenu répétitif de la ligne numéro ${i}"`);
      cmds.push(`git add f${i}.txt`);
      cmds.push(`git commit -m "commit numéro ${i}"`);
    }
    const session = buildExportedSession(cmds, 1);
    const encoded = encodeSession(session);
    expect(decodeSession(encoded)).toEqual(session);
    // Taille compressée nettement inférieure au JSON brut (contenu très répétitif).
    const rawLength = JSON.stringify(session).length;
    expect(encoded.length).toBeLessThan(rawLength * 0.3);
  });

  it('CA-share-06 : base64url invalide / corrompu → null (pas d exception)', () => {
    expect(decodeSession('!!!not-base64!!!')).toBeNull();
    expect(decodeSession('abcd')).toBeNull(); // base64url valide mais pas du gzip
    expect(decodeSession('')).toBeNull();
  });

  it('CA-share-07 : JSON valide mais mauvais schéma → null', () => {
    // Encode un objet qui n'est PAS une ExportedSession valide.
    const fake = buildExportedSession(['x'], 1);
    const encoded = encodeSession(fake);
    // (sanity) le vrai décode bien
    expect(decodeSession(encoded)).not.toBeNull();
    // Un payload encodé d'un objet hors-schéma → null (testé via decode d'un encode
    // d'objet arbitraire cast).
    const bad = encodeSession({ version: '1.0', metadata: {}, commands: [] } as never);
    expect(decodeSession(bad)).toBeNull();
  });

  it('checkSessionSize : seuils ok / warning / error', () => {
    expect(checkSessionSize('a'.repeat(100))).toBe('ok');
    expect(checkSessionSize('a'.repeat(1500))).toBe('warning');
    expect(checkSessionSize('a'.repeat(1999))).toBe('warning');
    expect(checkSessionSize('a'.repeat(2001))).toBe('error');
  });

  it('buildShareLink : <baseUrl>#session=<encoded>', () => {
    const session = buildExportedSession(['git init'], 1);
    const link = buildShareLink('https://git-visualizer.app/', session);
    expect(link.startsWith('https://git-visualizer.app/#session=')).toBe(true);
  });

  it('CA-share-14 : getEncodedFromHash ignore les autres paramètres', () => {
    const session = buildExportedSession(['git init'], 1);
    const enc = encodeSession(session);
    expect(getEncodedFromHash(`#session=${enc}`)).toBe(enc);
    expect(getEncodedFromHash(`#foo=bar&session=${enc}`)).toBe(enc);
    expect(getEncodedFromHash(`#session=${enc}&other=1`)).toBe(enc);
    expect(getEncodedFromHash('#route=/home')).toBeNull();
    expect(getEncodedFromHash('')).toBeNull();
  });

  it('getSessionFromUrl : décode depuis un hash fourni', () => {
    const session = buildExportedSession(['git init', 'git add f'], 42);
    const link = buildShareLink('https://x/', session);
    const hash = link.slice(link.indexOf('#'));
    expect(getSessionFromUrl(hash)).toEqual(session);
    expect(getSessionFromUrl('#nothing=here')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

describe('store generateShareableLink (spec 59)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('CA-share-02 : génère un lien décodable reflétant la session', () => {
    const store = useRepoStore();
    store.execute('git init');
    store.execute('write f.txt "x"');
    store.execute('git add f.txt');
    store.execute('git commit -m "c1"');

    const { link, size } = store.generateShareableLink('https://git-visualizer.app/');
    expect(link).toContain('#session=');
    expect(size).toBe('ok');

    const hash = link.slice(link.indexOf('#'));
    const decoded = getSessionFromUrl(hash);
    expect(decoded).not.toBeNull();
    expect(decoded!.commands).toEqual(store.savedCommands);
  });

  it('CA-share-04/11 : un lien chargé via importSession reconstruit l état + localStorage', () => {
    // Session B encodée dans un lien.
    const builder = useRepoStore();
    builder.execute('git init');
    builder.execute('write b.txt "B"');
    builder.execute('git add b.txt');
    builder.execute('git commit -m "session B"');
    const before = builder.snapshot;
    const { link } = builder.generateShareableLink('https://x/');
    const decoded = getSessionFromUrl(link.slice(link.indexOf('#')))!;

    // Nouvelle session "locale" A, puis chargement du lien (URL prime).
    setActivePinia(createPinia());
    const store = useRepoStore();
    store.execute('git init');
    store.execute('write a.txt "A"');
    store.execute('git add a.txt');
    store.execute('git commit -m "session A locale"');

    store.importSession(decoded);

    // Session B chargée (mêmes commits/hashes), localStorage mis à jour.
    expect(store.snapshot.allCommits ?? store.snapshot.commits).toEqual(
      before.allCommits ?? before.commits,
    );
    const raw = JSON.parse(localStorage.getItem('git-visualizer:history')!);
    expect(raw.commands).toEqual(decoded.commands);
  });
});
