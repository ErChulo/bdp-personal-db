import { describe, it, expect } from 'vitest';
import { computeColumnStats, describeSourceResult, formatCountLabel, formatSourceLabel, numericStats } from '../src/reports/aggregations';

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

  it('computes stats for 10,000 rows within one second', () => {
    const rows: unknown[][] = Array.from({ length: 10_000 }, (_, i) => [`row-${i + 1}`, i + 1, i % 2 === 0 ? 'even' : 'odd']);
    const started = performance.now();
    const stats = computeColumnStats('score', 1, rows);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(1000);
    expect(stats.count).toBe(10_000);
    expect(stats.numeric?.max).toBe(10_000);
  });

  it('formats deterministic source and count labels', () => {
    expect(formatSourceLabel({ kind: 'sql', name: 'metrics' })).toBe('SQL · metrics');
    expect(formatCountLabel(1, 'row')).toBe('1 row');
    expect(formatCountLabel(2, 'row')).toBe('2 rows');
    expect(describeSourceResult({ kind: 'nosql', name: 'inventory' }, 3, 'document')).toBe('3 documents from NoSQL · inventory');
  });
});
