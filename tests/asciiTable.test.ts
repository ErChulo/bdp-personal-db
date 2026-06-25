import { describe, it, expect } from 'vitest';
import { renderAsciiTable } from '../src/utils/asciiTable';

describe('asciiTable', () => {
  it('produces a unicode box around headers and rows', () => {
    const out = renderAsciiTable(['a', 'b'], [[1, 2], [3, 4]]);
    expect(out).toContain('┌');
    expect(out).toContain('│');
    expect(out).toContain('└');
    expect(out).toContain(' a ');
    expect(out).toContain(' 1 ');
    expect(out).toContain(' 4 ');
  });

  it('renders NULL for null/undefined', () => {
    const out = renderAsciiTable(['x'], [[null], [undefined]]);
    expect(out).toContain('NULL');
  });

  it('renders the first and last rows of a larger table', () => {
    const rows = Array.from({ length: 250 }, (_, i) => [i + 1, `row-${i + 1}`]);
    const out = renderAsciiTable(['id', 'label'], rows);
    expect(out).toContain('row-1');
    expect(out).toContain('row-250');
  });
});
