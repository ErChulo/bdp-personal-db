/** UUID v1, v4, v7 generators. Pure JS — no dependencies. */

function hex(n: number, len: number): string {
  return n.toString(16).padStart(len, '0');
}

function fillRandom(bytes: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes));
  crypto.getRandomValues(out);
  return out;
}

/** UUID v4: random with bits 6-7 set to 0b10. */
export function uuidv4(): string {
  const b = fillRandom(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return format(b);
}

/** UUID v7: 48-bit unix-ms timestamp + random + version/variant bits. Time-ordered. */
let lastV7Ms = 0;
let lastV7Rand: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(10));
export function uuidv7(): string {
  const ts = Date.now();
  const out = new Uint8Array(new ArrayBuffer(16));
  // bytes 0–5: 48-bit big-endian timestamp in ms
  out[0] = (ts / 2 ** 40) & 0xff;
  out[1] = (ts / 2 ** 32) & 0xff;
  out[2] = (ts / 2 ** 24) & 0xff;
  out[3] = (ts / 2 ** 16) & 0xff;
  out[4] = (ts / 2 ** 8) & 0xff;
  out[5] = ts & 0xff;
  // monotonically increase within the same millisecond
  if (ts === lastV7Ms) {
    for (let i = lastV7Rand.length - 1; i >= 0; i--) {
      if (lastV7Rand[i] === 255) {
        lastV7Rand[i] = 0;
        continue;
      }
      lastV7Rand[i]++;
      break;
    }
    out.set(lastV7Rand, 6);
  } else {
    lastV7Rand = fillRandom(10);
    lastV7Ms = ts;
    out.set(lastV7Rand, 6);
  }
  // version 7
  out[6] = (out[6] & 0x0f) | 0x70;
  // variant 10xx
  out[8] = (out[8] & 0x3f) | 0x80;
  return format(out);
}

/** UUID v1: timestamp + node id (random per session). */
export function uuidv1(): string {
  const ts = Date.now();
  const node = fillRandom(6);
  // make it look like a MAC (set unicast bit)
  node[0] |= 0x01;
  const out = new Uint8Array(new ArrayBuffer(16));
  const tsLow = ((ts & 0xfffffff) * 10) + 0;
  out[0] = (tsLow >> 24) & 0xff;
  out[1] = (tsLow >> 16) & 0xff;
  out[2] = (tsLow >> 8) & 0xff;
  out[3] = tsLow & 0xff;
  const mid = (ts / 0x100000000) & 0xffff;
  out[4] = (mid >> 8) & 0xff;
  out[5] = mid & 0xff;
  out[6] = ((ts / 0x1000000000000) & 0x0f) | 0x10; // version 1
  out[7] = 0x80; // variant
  out.set(node, 8);
  return format(out);
}

function format(b: Uint8Array): string {
  return (
    hex(b[0], 2) +
    hex(b[1], 2) +
    hex(b[2], 2) +
    hex(b[3], 2) +
    '-' +
    hex(b[4], 2) +
    hex(b[5], 2) +
    '-' +
    hex(b[6], 2) +
    hex(b[7], 2) +
    '-' +
    hex(b[8], 2) +
    hex(b[9], 2) +
    '-' +
    hex(b[10], 2) +
    hex(b[11], 2) +
    hex(b[12], 2) +
    hex(b[13], 2) +
    hex(b[14], 2) +
    hex(b[15], 2)
  );
}
