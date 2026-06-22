/** Random hex token + AES key generation.
 *  Cannot AES-encrypt in pure browser code without `crypto.subtle` — but `crypto.subtle` is available offline.
 *  We use it to generate keys; never expose them to the main thread unless explicitly requested.
 */

const HEX = '0123456789abcdef';

export function randomHexToken(bits: number): string {
  const bytes = Math.ceil(bits / 8);
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let out = '';
  for (const b of arr) out += HEX[(b >> 4) & 0x0f] + HEX[b & 0x0f];
  return out.slice(0, Math.ceil(bits / 4));
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function generateAesKey(bits: 128 | 192 | 256, format: 'hex' | 'base64'): Promise<string> {
  const algo = { name: 'AES-CBC', length: bits };
  const subtle = crypto.subtle;
  const key = await subtle.generateKey(algo, true, ['encrypt', 'decrypt']);
  const raw = await subtle.exportKey('raw', key);
  const bytes = new Uint8Array(raw);
  if (format === 'hex') {
    let s = '';
    for (const b of bytes) s += HEX[(b >> 4) & 0x0f] + HEX[b & 0x0f];
    return s;
  }
  return toBase64(bytes);
}
