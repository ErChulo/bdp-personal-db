/// <reference lib="webworker" />

import type { NosqlDoc } from '../utils/schema';

interface RunReq {
  id: string;
  type: 'run';
  docs: NosqlDoc[];
  code: string;
  meta: { collectionId: string; collectionName: string; fields: string[] };
}

type Req = RunReq;

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, type } = e.data;
  try {
    if (type !== 'run') return;
    const { docs, code, meta } = e.data;
    const fn = new Function(
      'docs',
      'meta',
      `
        'use strict';
        ${code}
      `,
    ) as (docs: NosqlDoc[], meta: RunReq['meta']) => unknown;
    const output = fn(docs, meta);
    const rows = normalizeResult(output);
    (self as any).postMessage({ id, ok: true, rows, total: rows.length });
  } catch (err) {
    (self as any).postMessage({ id, ok: false, error: (err as Error).message });
  }
};

function normalizeResult(output: unknown): NosqlDoc[] {
  if (!Array.isArray(output)) {
    if (output && typeof output === 'object') return [output as NosqlDoc];
    if (output === null || output === undefined) return [];
    return [{ id: 'value', value: output } as NosqlDoc];
  }
  return output
    .filter((item): item is NosqlDoc => Boolean(item) && typeof item === 'object')
    .map((item, index) => ({
      ...(item as NosqlDoc),
      id: (item as NosqlDoc).id ?? `row_${index + 1}`,
    }));
}
