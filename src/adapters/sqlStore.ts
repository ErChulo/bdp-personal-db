/* eslint-disable @typescript-eslint/no-explicit-any */
import { sha256Hex } from '../utils/digest';

const DB_NAME = 'bdp-sql';
const DB_VERSION = 1;
const STORE = 'dbs';

export interface SqlDbRecord {
  bytes: Uint8Array;
  name: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
  checksum: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: any): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function normalizeRecord(record: SqlDbRecord | undefined, fallbackName = 'unknown'): Promise<SqlDbRecord | undefined> {
  if (!record || !record.bytes || record.bytes.byteLength === 0) return undefined;
  return {
    ...record,
    name: record.name || fallbackName,
    createdAt: record.createdAt || Date.now(),
    updatedAt: record.updatedAt || Date.now(),
    revision: Number.isFinite(record.revision) ? record.revision : 1,
    checksum: record.checksum || await sha256Hex(record.bytes),
  };
}

async function idbCommit<T>(key: string, updater: (current: SqlDbRecord | undefined) => Promise<SqlDbRecord | undefined>): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(key);
    req.onsuccess = () => {
      Promise.resolve(updater(req.result as SqlDbRecord | undefined))
        .then((next) => {
          if (next === undefined) {
            store.delete(key);
          } else {
            store.put(next, key);
          }
        })
        .catch((error: unknown) => {
          tx.abort();
          reject(error);
        });
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function idbGetAllKeys(): Promise<string[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const sqlStore = {
  async read(id: string): Promise<SqlDbRecord | undefined> {
    return normalizeRecord(await idbGet<SqlDbRecord>(id), id);
  },
  async write(id: string, record: SqlDbRecord): Promise<void> {
    const normalized = await normalizeRecord(record, record.name);
    if (!normalized) throw new Error(`Cannot persist empty SQL record for ${id}`);
    return idbSet(id, normalized);
  },
  async commit(id: string, updater: (current: SqlDbRecord | undefined) => Promise<SqlDbRecord | undefined>): Promise<void> {
    await idbCommit(id, updater);
  },
  async listAll(): Promise<{ id: string; name: string; createdAt: number; updatedAt: number }[]> {
    const keys = await idbGetAllKeys();
    const out: { id: string; name: string; createdAt: number; updatedAt: number }[] = [];
    for (const k of keys) {
      const rec = await idbGet<SqlDbRecord>(k);
      const normalized = await normalizeRecord(rec, k);
      if (!normalized) continue;
      out.push({ id: k, name: normalized.name, createdAt: normalized.createdAt, updatedAt: normalized.updatedAt });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
  async remove(id: string): Promise<void> {
    return idbDelete(id);
  },
};
