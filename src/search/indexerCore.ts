/** Inverted index for FTS — pure-ish (also used in the search worker). */

export interface IndexEntry {
  /** post-id -> { term: positions } */
  postings: Map<string, Map<string, number[]>>;
  /** term -> doc freq */
  docFreq: Map<string, number>;
  /** doc-id -> source metadata */
  sources: Map<string, IndexedSource>;
  totalDocs: number;
}

export function createIndex(): IndexEntry {
  return { postings: new Map(), docFreq: new Map(), sources: new Map(), totalDocs: 0 };
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'the', 'this', 'that',
  'of', 'to', 'in', 'on', 'for', 'is', 'are', 'was', 'were', 'be', 'it',
  'as', 'with', 'by', 'from',
]);

export function tokenize(s: string): string[] {
  const out: string[] = [];
  const re = /[\p{L}\p{N}_]+/gu;
  for (const m of s.toLowerCase().matchAll(re)) {
    if (m[0].length > 1 && !STOPWORDS.has(m[0])) out.push(m[0]);
  }
  return out;
}

export interface IndexedSource {
  kind: 'sql' | 'nosql';
  dbId: string;
  tableOrCollection: string;
}

export function formatIndexedSourceLabel(source: Pick<IndexedSource, 'kind' | 'tableOrCollection'>): string {
  return `${source.kind === 'sql' ? 'SQL' : 'NoSQL'} · ${source.tableOrCollection}`;
}

export function indexDoc(idx: IndexEntry, doc: IndexedDoc) {
  const { id: docId, text, source } = doc;
  const terms = tokenize(text);
  if (!terms.length) return;
  const map = new Map<string, number[]>();
  for (let i = 0; i < terms.length; i++) {
    const pos = map.get(terms[i]) ?? [];
    pos.push(i);
    map.set(terms[i], pos);
  }
  idx.postings.set(docId, map);
  idx.sources.set(docId, source);
  idx.totalDocs++;
  for (const t of map.keys()) idx.docFreq.set(t, (idx.docFreq.get(t) ?? 0) + 1);
}

export interface ScoredHit {
  docId: string;
  score: number;
  source: IndexedSource;
  sourceLabel: string;
}

export function queryIdx(idx: IndexEntry, q: string): ScoredHit[] {
  const terms = tokenize(q);
  if (!terms.length) return [];
  const scoreByDoc = new Map<string, number>();
  for (const t of terms) {
    const df = idx.docFreq.get(t) ?? 0;
    if (df === 0) continue;
    const idf = Math.log(1 + idx.totalDocs / df);
    for (const [docId, positions] of idx.postings) {
      if (!positions.has(t)) continue;
      const tf = positions.get(t)!.length;
      scoreByDoc.set(docId, (scoreByDoc.get(docId) ?? 0) + tf * idf);
    }
  }
  return [...scoreByDoc.entries()]
    .map(([docId, score]) => {
      const source = idx.sources.get(docId);
      if (!source) return null;
      return { docId, score, source, sourceLabel: formatIndexedSourceLabel(source) };
    })
    .filter((hit): hit is ScoredHit => hit !== null)
    .sort((a, b) => b.score - a.score);
}

export interface IndexedDoc {
  id: string;
  source: { kind: 'sql' | 'nosql'; dbId: string; tableOrCollection: string; row: unknown };
  text: string;
}

export function serializeIdx(idx: IndexEntry): string {
  // Compact JSON for persistence.
  const postings: Record<string, Record<string, number[]>> = {};
  for (const [docId, m] of idx.postings) {
    postings[docId] = Object.fromEntries(m);
  }
  return JSON.stringify({
    postings,
    docFreq: Object.fromEntries(idx.docFreq),
    sources: Object.fromEntries([...idx.sources.entries()].map(([docId, source]) => [docId, source])),
    totalDocs: idx.totalDocs,
  });
}

export function deserializeIdx(json: string): IndexEntry {
  const data = JSON.parse(json) as {
    postings: Record<string, Record<string, number[]>>;
    docFreq: Record<string, number>;
    sources: Record<string, IndexedSource>;
    totalDocs: number;
  };
  const idx = createIndex();
  idx.totalDocs = data.totalDocs;
  idx.docFreq = new Map(Object.entries(data.docFreq));
  idx.sources = new Map(Object.entries(data.sources));
  for (const [docId, m] of Object.entries(data.postings)) {
    const inner = new Map<string, number[]>();
    for (const [k, v] of Object.entries(m)) inner.set(k, v);
    idx.postings.set(docId, inner);
  }
  return idx;
}
