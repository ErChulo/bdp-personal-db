/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SqlExecResult, SqlTableInfo } from '../utils/schema';
import { sha256Hex } from '../utils/digest';
import { sqlStore } from './sqlStore';
import { isSealedBytes, sealBytes, unsealBytes } from '../security/vault';
import SqlWorker from './sql.worker.ts?worker&inline';

let _worker: Worker | null = null;
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
const loaded = new Set<string>();
const loading = new Map<string, Promise<void>>();

function spawn(): Worker {
  const w = new SqlWorker();
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
    if (_worker === w) {
      _worker = null;
      loaded.clear();
      loading.clear();
    }
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

async function ensureLoaded(dbId: string): Promise<void> {
  if (loaded.has(dbId)) return;
  const inFlight = loading.get(dbId);
  if (inFlight) return inFlight;

  const task = (async () => {
    const record = await sqlStore.read(dbId);
    if (!record) throw new Error(`Database ${dbId} is missing or corrupt in local storage`);
    const decoded = await unsealBytes(record.bytes);
    await call({ type: 'import', dbId, bytes: decoded.bytes });
    loaded.add(dbId);
    if (!decoded.encrypted && !isSealedBytes(record.bytes)) {
      await persist(dbId, { ...record, bytes: decoded.bytes });
    }
  })().finally(() => loading.delete(dbId));

  loading.set(dbId, task);
  return task;
}

async function exportBytes(dbId: string): Promise<Uint8Array<ArrayBuffer>> {
  const res = await call<{ bytes: Uint8Array }>({ type: 'export', dbId });
  const arr = new Uint8Array(new ArrayBuffer(res.bytes.byteLength));
  arr.set(res.bytes);
  return arr;
}

async function persist(dbId: string, previousRecord?: Awaited<ReturnType<typeof sqlStore.read>>): Promise<void> {
  const before = previousRecord ?? (await sqlStore.read(dbId));
  if (!before) throw new Error(`Database ${dbId} is missing or corrupt in local storage`);

  const bytes = await exportBytes(dbId);
  const sealed = await sealBytes(bytes);
  const next = {
    ...before,
    bytes: sealed,
    updatedAt: Date.now(),
    revision: before.revision + 1,
    checksum: await sha256Hex(sealed),
  };

  try {
    await sqlStore.commit(dbId, async (current) => {
      if (!current) throw new Error(`Database ${dbId} is missing or corrupt in local storage`);
      if (current.revision !== before.revision) throw new Error(`Database ${dbId} changed while saving`);
      return next;
    });
  } catch (error) {
    await call({ type: 'import', dbId, bytes: before.bytes });
    loaded.add(dbId);
    throw error;
  }
}

export const sqlAdapter = {
  async create(dbId: string, schemaSql?: string): Promise<void> {
    await call({ type: 'create', dbId, schemaSql });
    loaded.add(dbId);
  },
  async importBytes(dbId: string, bytes: Uint8Array): Promise<void> {
    await call({ type: 'import', dbId, bytes });
    loaded.add(dbId);
  },
  async export(dbId: string): Promise<Uint8Array<ArrayBuffer>> {
    await ensureLoaded(dbId);
    return exportBytes(dbId);
  },
  async drop(dbId: string): Promise<void> {
    if (loaded.has(dbId)) await call({ type: 'drop', dbId });
    loaded.delete(dbId);
    loading.delete(dbId);
  },
  async vacuum(dbId: string): Promise<void> {
    await ensureLoaded(dbId);
    await call({ type: 'vacuum', dbId });
    await persist(dbId);
  },
  async schema(dbId: string): Promise<{ tables: SqlTableInfo[] }> {
    await ensureLoaded(dbId);
    const res = await call<{ schema: { tables: SqlTableInfo[] } }>({ type: 'schema', dbId });
    return res.schema;
  },
  async exec(dbId: string, sql: string): Promise<SqlExecResult> {
    await ensureLoaded(dbId);
    const res = await call<{ result: SqlExecResult }>({ type: 'exec', dbId, sql });
    if (mayMutate(sql)) await persist(dbId);
    return res.result;
  },
  async run(dbId: string, sql: string, params: unknown[] = []): Promise<SqlExecResult> {
    await ensureLoaded(dbId);
    const res = await call<{ result: SqlExecResult }>({ type: 'run', dbId, sql, params });
    await persist(dbId);
    return res.result;
  },
  async listTables(dbId: string): Promise<string[]> {
    const res = await this.exec(dbId, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    return res.rows.map((r) => String(r[0]));
  },
};

function mayMutate(sql: string): boolean {
  const normalized = sql
    .replace(/--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\//g, '')
    .toUpperCase();
  return normalized.split(';').some((statement) => {
    const value = statement.trim();
    if (!value) return false;
    if (/^(SELECT|EXPLAIN)\b/.test(value)) return false;
    if (/^PRAGMA\b/.test(value) && !value.includes('=')) return false;
    return true;
  });
}
