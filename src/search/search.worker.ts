/// <reference lib="webworker" />
import { queryIdx, type ScoredHit, type IndexedDoc, deserializeIdx, serializeIdx, createIndex, indexDoc } from './indexerCore';

interface BuildReq {
  id: string;
  type: 'build';
  docs: IndexedDoc[];
}
interface SearchReq {
  id: string;
  type: 'search';
  q: string;
  serialized: string;
}
type Req = BuildReq | SearchReq;

let lastSerialized = '';

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, type } = e.data;
  try {
    if (type === 'build') {
      const idx = createIndex();
      for (const d of e.data.docs) indexDoc(idx, d);
      lastSerialized = serializeIdx(idx);
      (self as any).postMessage({ id, ok: true, serialized: lastSerialized });
      return;
    }
    if (type === 'search') {
      const idx = e.data.serialized ? deserializeIdx(e.data.serialized) : deserializeIdx(lastSerialized);
      const hits: ScoredHit[] = queryIdx(idx, e.data.q);
      (self as any).postMessage({ id, ok: true, hits, totalHits: hits.length });
      return;
    }
  } catch (err) {
    (self as any).postMessage({ id, ok: false, error: (err as Error).message });
  }
};
