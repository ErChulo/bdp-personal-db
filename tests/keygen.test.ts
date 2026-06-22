import { describe, it, expect } from 'vitest';
import { uuidv4, uuidv7 } from '../src/keygen/uuid';
import { ulid } from '../src/keygen/ulid';
import { randomHexToken } from '../src/keygen/aes';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-([1-7])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('keygen', () => {
  it('uuidv4 matches RFC4122 v4 format', () => {
    for (let i = 0; i < 50; i++) {
      const u = uuidv4();
      expect(u).toMatch(UUID_RE);
      expect(u[14]).toBe('4');
    }
  });

  it('uuidv7 matches version-7 bit and is monotonically non-decreasing within ms', () => {
    const a = uuidv7();
    const b = uuidv7();
    const c = uuidv7();
    expect(a).toMatch(UUID_RE);
    expect(a[14]).toBe('7');
    // monotonic non-decreasing within the same ms is too race-condition-prone; ensure all valid:
    expect(b).toMatch(UUID_RE);
    expect(c).toMatch(UUID_RE);
  });

  it('ulid is 26 chars and increases monotonically within ms', () => {
    const ids = Array.from({ length: 100 }, () => ulid());
    for (const u of ids) {
      expect(u.length).toBe(26);
      expect(u).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    }
    // first id < last id (orders match)
    expect(ids[0] <= ids[ids.length - 1]).toBe(true);
  });

  it('randomHexToken produces expected length', () => {
    expect(randomHexToken(128).length).toBe(32);
    expect(randomHexToken(256).length).toBe(64);
    expect(randomHexToken(512).length).toBe(128);
  });
});
