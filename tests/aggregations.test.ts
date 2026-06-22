import { describe, it, expect } from 'vitest';
import { computeColumnStats, numericStats } from '../src/reports/aggregations';

describe('aggregations', () => {
  it('numericStats computes min/max/median/percentiles', () => {
    const s = numericStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s.min).toBe(1);
    expect(s.max).toBe(10);
    expect(s.median).toBe(5.5);
    expect(s.p25).toBe(3.25);
    expect(s.p75).toBe(7.75);
    expect(s.p95).toBeCloseTo(9.55, 1);
  });

  it('computeColumnStats for a numeric column', () => {
    const rows: unknown[][] = [
      ['n', 1],
      ['n', 2],
      ['n', null],
      ['n', 3],
    ];
    const s = computeColumnStats('n', 1, rows);
    expect(s.type).toBe('number');
    expect(s.count).toBe(3);
    expect(s.missing).toBe(1);
    expect(s.numeric?.min).toBe(1);
    expect(s.numeric?.max).toBe(3);
    expect(s.numeric?.mean).toBe(2);
  });

  it('computeColumnStats for a string column yields top values', () => {
    const rows: unknown[][] = [
      ['name', 'alice'],
      ['name', 'bob'],
      ['name', 'alice'],
      ['name', null],
    ];
    const s = computeColumnStats('name', 1, rows);
    expect(s.type).toBe('string');
    expect(s.distinct).toBe(2);
    expect(s.topValues?.[0]).toEqual({ value: 'alice', count: 2 });
  });
});
