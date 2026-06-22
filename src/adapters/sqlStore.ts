/* eslint-disable @typescript-eslint/no-explicit-any */
const DB_NAME = 'bdp-sql';
const DB_VERSION = 1;
const STORE = 'dbs';

export interface SqlDbRecord {
  bytes: Uint8Array;
  name: string;
  createdAt: number;
  updatedAt: number;
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
    return idbGet<SqlDbRecord>(id);
  },
  async write(id: string, record: SqlDbRecord): Promise<void> {
    return idbSet(id, record);
  },
  async listAll(): Promise<{ id: string; name: string; createdAt: number; updatedAt: number }[]> {
    const keys = await idbGetAllKeys();
    const out: { id: string; name: string; createdAt: number; updatedAt: number }[] = [];
    for (const k of keys) {
      const rec = await idbGet<SqlDbRecord>(k);
      if (!rec) continue;
      out.push({ id: k, name: rec.name, createdAt: rec.createdAt, updatedAt: rec.updatedAt });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
  async remove(id: string): Promise<void> {
    return idbDelete(id);
  },
};
