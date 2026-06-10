/**
 * Liens partageables (spec 59).
 *
 * Module PUR (pas d'import Vue) : encode une `ExportedSession` (spec 58) dans une
 * chaîne base64url compacte (gzip + base64url), et décode/valide l'inverse. La
 * session est transportée dans le fragment d'URL (`#session=...`) → 100 % client,
 * aucun aller-retour serveur. La validation et le rejeu réutilisent la spec 58.
 */

import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';
import { type ExportedSession, validateExportedSession } from './export-import';

// ---------------------------------------------------------------------------
// Seuils de taille (caractères de la chaîne encodée)
// ---------------------------------------------------------------------------

export type SessionSize = 'ok' | 'warning' | 'error';

const WARN_THRESHOLD = 1500;
const MAX_THRESHOLD = 2000;

/**
 * Classe la taille du lien encodé :
 * - `ok` (< 1500) : lien généré sans avertissement
 * - `warning` (1500–2000) : lien très long, confirmer
 * - `error` (> 2000) : trop grand pour une URL → refuser (utiliser export/import)
 */
export function checkSessionSize(encoded: string): SessionSize {
  if (encoded.length > MAX_THRESHOLD) return 'error';
  if (encoded.length >= WARN_THRESHOLD) return 'warning';
  return 'ok';
}

// ---------------------------------------------------------------------------
// base64url (sans dépendance ; btoa/atob disponibles navigateur + Node)
// ---------------------------------------------------------------------------

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(encoded: string): Uint8Array {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  // Restaurer le padding `=` (longueur multiple de 4).
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Encode / decode
// ---------------------------------------------------------------------------

/** `base64url(gzip(JSON(session)))`. Compact et sûr pour une URL. */
export function encodeSession(session: ExportedSession): string {
  const json = JSON.stringify(session);
  const compressed = gzipSync(strToU8(json));
  return bytesToBase64url(compressed);
}

/**
 * Inverse de `encodeSession`. Renvoie `null` si le décodage échoue (base64url ou
 * gzip corrompu, JSON invalide) OU si la session ne passe pas la validation
 * (schéma/version/intégrité, spec 58). Ne lance jamais.
 */
export function decodeSession(encoded: string): ExportedSession | null {
  try {
    const bytes = base64urlToBytes(encoded);
    const json = strFromU8(gunzipSync(bytes));
    const parsed: unknown = JSON.parse(json);
    const result = validateExportedSession(parsed);
    return result.ok ? result.session : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

/** Construit le lien partageable : `<baseUrl>#session=<encoded>`. */
export function buildShareLink(baseUrl: string, session: ExportedSession): string {
  return `${baseUrl}#session=${encodeSession(session)}`;
}

/**
 * Extrait la valeur du paramètre `session` d'un fragment d'URL. Ignore les autres
 * paramètres/hashtags (CA-share-14). `hash` peut commencer par `#` ou non.
 */
export function getEncodedFromHash(hash: string): string | null {
  const frag = hash.startsWith('#') ? hash.slice(1) : hash;
  for (const part of frag.split('&')) {
    if (part.startsWith('session=')) {
      const value = part.slice('session='.length);
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/**
 * Récupère la session encodée dans le fragment d'URL (ou `null`). `hash` est
 * injectable pour les tests ; par défaut `window.location.hash`.
 */
export function getSessionFromUrl(hash?: string): ExportedSession | null {
  const h = hash ?? (typeof window !== 'undefined' ? window.location.hash : '');
  const encoded = getEncodedFromHash(h);
  if (encoded === null) return null;
  return decodeSession(encoded);
}
