/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IndexedDoc, ScoredHit } from './indexerCore';

import SearchWorker from './search.worker.ts?worker&inline';

let _worker: Worker | null = null;
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (_worker) return _worker;
  _worker = new SearchWorker();
  _worker.onmessage = (e) => {
    const { id, ok, error, ...rest } = e.data || {};
    const slot = pending.get(id);
    if (!slot) return;
    pending.delete(id);
    if (ok) slot.resolve(rest);
    else slot.reject(new Error(error || 'worker error'));
  };
  return _worker;
}

function call<T = any>(msg: Omit<any, 'id'>): Promise<T> {
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...msg, id });
  });
}

export const searchClient = {
  async build(docs: IndexedDoc[]): Promise<{ serialized: string }> {
    return call({ type: 'build', docs });
  },
  async search(q: string, serialized: string): Promise<{ hits: ScoredHit[]; totalHits: number }> {
    return call({ type: 'search', q, serialized });
  },
};
