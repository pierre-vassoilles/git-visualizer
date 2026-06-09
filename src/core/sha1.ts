/**
 * SHA-1 pur TypeScript, sans dépendance npm.
 *
 * Implémentation standard FIPS 180-4.
 * Entrée : string (encodée en UTF-8 via TextEncoder).
 * Sortie : 40 caractères hexadécimaux.
 */

function rotl32(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function add32(...args: number[]): number {
  let result = 0;
  for (const v of args) {
    result = (result + v) >>> 0;
  }
  return result;
}

function toHex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}

export function sha1(input: string): string {
  // Encode as UTF-8 bytes
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const msgLen = data.length;

  // Pre-processing: padding to multiple of 64 bytes.
  // Append 0x80, zero bytes, then 8-byte big-endian bit-length.
  // Total padded length = msgLen + 1 + zeroPad + 8, where zeroPad makes total % 64 === 0.
  const extra = 64 - ((msgLen + 1 + 8) % 64);
  const paddedLen = msgLen + 1 + (extra === 64 ? 0 : extra) + 8;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[msgLen] = 0x80;

  // Write bit length as 64-bit big-endian at end (fits in 32 bits for typical inputs)
  const bitLen = msgLen * 8;
  const bitLenHigh = Math.floor(bitLen / 0x100000000);
  const bitLenLow = bitLen >>> 0;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenHigh, false);
  view.setUint32(paddedLen - 4, bitLenLow, false);

  // Initial hash values
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);

  // Process each 512-bit (64-byte) block
  for (let i = 0; i < paddedLen; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false);
    }
    for (let j = 16; j < 80; j++) {
      w[j] = rotl32(w[j - 3]! ^ w[j - 8]! ^ w[j - 14]! ^ w[j - 16]!, 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let j = 0; j < 80; j++) {
      let f: number;
      let k: number;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = add32(rotl32(a, 5), f, e, k, w[j]!);
      e = d;
      d = c;
      c = rotl32(b, 30);
      b = a;
      a = temp;
    }

    h0 = add32(h0, a);
    h1 = add32(h1, b);
    h2 = add32(h2, c);
    h3 = add32(h3, d);
    h4 = add32(h4, e);
  }

  return toHex32(h0) + toHex32(h1) + toHex32(h2) + toHex32(h3) + toHex32(h4);
}

/** Hash court : 7 premiers caractères. */
export function shortHash(hash: string): string {
  return hash.slice(0, 7);
}
