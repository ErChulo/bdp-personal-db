import { describe, it, expect } from 'vitest';
import { parseJsonArray, parseNdjson, arrayToJson, arrayToNdjson, inferSchema } from '../src/importExport/json';

describe('json', () => {
  it('parses JSON arrays', () => {
    const rows = parseJsonArray(JSON.stringify([{ a: 1 }, { a: 2 }]));
    expect(rows.length).toBe(2);
    expect(rows[0].a).toBe(1);
  });

  it('rejects non-arrays', () => {
    expect(() => parseJsonArray('{"a":1}')).toThrow(/must be an array/);
  });

  it('parses NDJSON, line by line', () => {
    const text = '{"a":1}\n{"a":2}\n   \n{"a":3}';
    expect(parseNdjson(text).map((r) => r.a)).toEqual([1, 2, 3]);
  });

  it('throws on invalid NDJSON with line number', () => {
    expect(() => parseNdjson('{"a":1}\nNOT-JSON')).toThrow(/line 2/);
  });

  it('round-trips arrays', () => {
    const rows = [{ x: 1 }, { x: 2 }];
    expect(JSON.parse(arrayToJson(rows))[1].x).toBe(2);
    expect(arrayToNdjson(rows).split('\n')[1]).toBe('{"x":2}');
  });

  it('infers schemas from many rows', () => {
    expect(inferSchema([{ a: 1 }, { b: 2 }]).sort()).toEqual(['a', 'b']);
  });
});
