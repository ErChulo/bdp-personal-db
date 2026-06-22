import { describe, it, expect } from 'vitest';
import { parseCsv, serializeCsv, inferTypes } from '../src/importExport/csv';

describe('csv', () => {
  it('parses a simple CSV', () => {
    const { columns, rows } = parseCsv('a,b,c\n1,2,3\n4,5,6');
    expect(columns).toEqual(['a', 'b', 'c']);
    expect(rows).toEqual([
      { a: '1', b: '2', c: '3' },
      { a: '4', b: '5', c: '6' },
    ]);
  });

  it('strips UTF-8 BOM', () => {
    const { columns, rows } = parseCsv('\uFEFFname,age\n"Alice",30\n"Bob",40');
    expect(columns).toEqual(['name', 'age']);
    expect(rows[0]).toEqual({ name: 'Alice', age: '30' });
    expect(rows[1]).toEqual({ name: 'Bob', age: '40' });
  });

  it('handles escaped quotes and delimiters', () => {
    const { rows } = parseCsv('x,y\n"hello ""world""","a;b;c"');
    expect(rows[0]).toEqual({ x: 'hello "world"', y: 'a;b;c' });
  });

  it('round-trips serialize then parse', () => {
    const text = serializeCsv(['a', 'b'], [{ a: 1, b: 'x,y' }, { a: 2, b: '\n' }] as any);
    const { columns, rows } = parseCsv(text);
    expect(columns).toEqual(['a', 'b']);
    expect(rows[0].x ?? rows[0].a).toBe('1');
  });

  it('infers numeric/boolean/date/string types', () => {
    const { columns, inferred } = inferTypes(
      [
        { n: '1', flag: 'true', when: '2024-01-02', name: 'alice' },
        { n: '2', flag: 'false', when: '2024-01-03', name: 'bob' },
      ] as any,
      ['n', 'flag', 'when', 'name'],
    );
    expect(columns.find((c) => c.name === 'n')?.type).toBe('number');
    expect(columns.find((c) => c.name === 'flag')?.type).toBe('boolean');
    expect(columns.find((c) => c.name === 'when')?.type).toBe('date');
    expect(columns.find((c) => c.name === 'name')?.type).toBe('string');
    expect(inferred[0].n).toBe(1);
    expect(inferred[0].flag).toBe(true);
  });
});
