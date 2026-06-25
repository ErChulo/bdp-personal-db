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
    indexDoc(idx, { id: '1', text: 'database management system', source: { kind: 'sql', dbId: 'db-1', tableOrCollection: 'tables', row: null } });
    indexDoc(idx, { id: '2', text: 'database design principles', source: { kind: 'nosql', dbId: 'col-1', tableOrCollection: 'notes', row: null } });
    indexDoc(idx, { id: '3', text: 'random unrelated content', source: { kind: 'sql', dbId: 'db-2', tableOrCollection: 'other', row: null } });
    const results = queryIdx(idx, 'database');
    expect(results[0].docId).toBe('1');
    expect(new Set(results.map((r) => r.docId))).toEqual(new Set(['1', '2']));
    expect(results[0].sourceLabel).toBe('SQL · tables');
  });

  it('round-trips serialization', () => {
    const idx = createIndex();
    indexDoc(idx, { id: 'a', text: 'alpha beta', source: { kind: 'sql', dbId: 'db-1', tableOrCollection: 'alpha', row: null } });
    indexDoc(idx, { id: 'b', text: 'beta gamma', source: { kind: 'nosql', dbId: 'col-1', tableOrCollection: 'beta', row: null } });
    const ser = serializeIdx(idx);
    const back = deserializeIdx(ser);
    expect(queryIdx(back, 'beta').length).toBe(2);
    expect(queryIdx(back, 'beta')[1].sourceLabel).toBe('NoSQL · beta');
  });

  it('handles a 10k-document index quickly enough for local search', () => {
    const idx = createIndex();
    const started = performance.now();
    for (let i = 0; i < 10_000; i++) {
      indexDoc(idx, {
        id: `doc-${i}`,
        text: `alpha beta row-${i} gamma`,
        source: { kind: 'sql', dbId: 'db-1', tableOrCollection: 'metrics', row: null },
      });
    }
    const hits = queryIdx(idx, 'row-9999');
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(1000);
    expect(hits[0]?.docId).toBe('doc-9999');
    expect(hits[0]?.sourceLabel).toBe('SQL · metrics');
  });
});
