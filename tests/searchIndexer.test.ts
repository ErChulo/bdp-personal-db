import { describe, it, expect } from 'vitest';
import { createIndex, indexDoc, queryIdx, tokenize, serializeIdx, deserializeIdx } from '../src/search/indexerCore';

describe('searchIndexer', () => {
  it('tokenizes lowercased words', () => {
    expect(tokenize('Hello, World! foo bar_foo123').sort()).toEqual(['bar_foo123', 'foo', 'hello', 'world']);
  });

  it('filters short and stopword tokens', () => {
    expect(tokenize('a an the and of to in is are it')).toEqual([]);
  });

  it('ranks more relevant docs higher', () => {
    const idx = createIndex();
    indexDoc(idx, '1', 'database management system');
    indexDoc(idx, '2', 'database design principles');
    indexDoc(idx, '3', 'random unrelated content');
    const results = queryIdx(idx, 'database');
    expect(results[0].docId).toBe('1');
    expect(new Set(results.map((r) => r.docId))).toEqual(new Set(['1', '2']));
  });

  it('round-trips serialization', () => {
    const idx = createIndex();
    indexDoc(idx, 'a', 'alpha beta');
    indexDoc(idx, 'b', 'beta gamma');
    const ser = serializeIdx(idx);
    const back = deserializeIdx(ser);
    expect(queryIdx(back, 'beta').length).toBe(2);
  });
});
