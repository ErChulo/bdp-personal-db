/** ULID (Crockford base32) — 26 chars: 10 chars timestamp + 16 chars randomness. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(ts: number): string {
  let s = '';
  let n = ts;
  for (let i = 9; i >= 0; i--) {
    const idx = n % 32;
    s = ALPHABET[idx] + s;
    n = Math.floor(n / 32);
  }
  return s;
}

let lastMs = 0;
let lastRand: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(10));
export function ulid(now = Date.now()): string {
  const ts = now;
  let rand: Uint8Array<ArrayBuffer>;
  if (ts === lastMs) {
    rand = new Uint8Array(new ArrayBuffer(10));
    rand.set(lastRand);
    for (let i = rand.length - 1; i >= 0; i--) {
      if (rand[i] === 255) {
        rand[i] = 0;
        continue;
      }
      rand[i]++;
      break;
    }
  } else {
    rand = new Uint8Array(new ArrayBuffer(10));
    crypto.getRandomValues(rand);
    lastRand = rand;
    lastMs = ts;
  }
  const time = encodeTime(ts);
  let random = '';
  for (let i = 0; i < 16; i++) {
    const byteIdx = Math.floor((i * 5) / 8);
    const bitIdx = (i * 5) % 8;
    let v = (rand[byteIdx] >> bitIdx) & 0x1f;
    if (bitIdx > 3 && byteIdx < rand.length - 1) {
      v |= (rand[byteIdx + 1] << (8 - bitIdx)) & 0x1f;
    }
    random += ALPHABET[v];
  }
  return time + random;
}
