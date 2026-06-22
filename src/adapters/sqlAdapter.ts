/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SqlExecResult, SqlTableInfo } from '../utils/schema';

let _worker: Worker | null = null;
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function spawn(): Worker {
  const w = new Worker(new URL('./sql.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e) => {
    const { id, ok, error, ...rest } = e.data || {};
    const slot = pending.get(id);
    if (!slot) return;
    pending.delete(id);
    if (ok) slot.resolve(rest);
    else slot.reject(new Error(error || 'worker error'));
  };
  w.onerror = (err) => {
    // Worker crashed — reject pending calls and reset for next request.
    for (const slot of pending.values()) slot.reject(new Error(err.message || 'sql-worker crashed'));
    pending.clear();
    if (_worker === w) _worker = null;
  };
  return w;
}

function worker(): Worker {
  if (!_worker) _worker = spawn();
  return _worker;
}

function call<T = any>(msg: Omit<any, 'id'>): Promise<T> {
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker().postMessage({ ...msg, id });
  });
}

export const sqlAdapter = {
  async create(dbId: string, schemaSql?: string): Promise<void> {
    await call({ type: 'create', dbId, schemaSql });
  },
  async importBytes(dbId: string, bytes: Uint8Array): Promise<void> {
    await call({ type: 'import', dbId, bytes });
  },
  async export(dbId: string): Promise<Uint8Array<ArrayBuffer>> {
    const res = await call<{ bytes: Uint8Array }>({ type: 'export', dbId });
    // Re-wrap into a Uint8Array typed by ArrayBuffer so it fits `Blob`'s BlobPart.
    const arr = new Uint8Array(new ArrayBuffer(res.bytes.byteLength));
    arr.set(res.bytes);
    return arr;
  },
  async drop(dbId: string): Promise<void> {
    await call({ type: 'drop', dbId });
  },
  async vacuum(dbId: string): Promise<void> {
    await call({ type: 'vacuum', dbId });
  },
  async schema(dbId: string): Promise<{ tables: SqlTableInfo[] }> {
    const res = await call<{ schema: { tables: SqlTableInfo[] } }>({ type: 'schema', dbId });
    return res.schema;
  },
  async exec(dbId: string, sql: string): Promise<SqlExecResult> {
    const res = await call<{ result: SqlExecResult }>({ type: 'exec', dbId, sql });
    return res.result;
  },
  async run(dbId: string, sql: string, params: unknown[] = []): Promise<SqlExecResult> {
    const res = await call<{ result: SqlExecResult }>({ type: 'run', dbId, sql, params });
    return res.result;
  },
  async listTables(dbId: string): Promise<string[]> {
    const res = await this.exec(dbId, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    return res.rows.map((r) => String(r[0]));
  },
};
