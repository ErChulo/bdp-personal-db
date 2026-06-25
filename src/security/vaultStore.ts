import type { VaultMeta } from './vaultTypes';

const DB_NAME = 'bdp-vault';
const DB_VERSION = 1;
const STORE = 'vault';
const KEY = 'meta';

class VaultDb {
  private db: Promise<IDBDatabase> | null = null;
  private memory: VaultMeta | null = null;

  private shouldUseLocalStorage(): boolean {
    return typeof location !== 'undefined' && location.protocol === 'file:';
  }

  open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined' || this.shouldUseLocalStorage()) {
      return Promise.reject(new Error('IndexedDB is not available'));
    }
    if (!this.db) {
      this.db = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.db;
  }

  async read(): Promise<VaultMeta | null> {
    if (this.shouldUseLocalStorage()) return this.readLocal();
    if (typeof indexedDB === 'undefined') return this.memory;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as VaultMeta | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async write(meta: VaultMeta): Promise<void> {
    if (this.shouldUseLocalStorage()) {
      this.writeLocal(meta);
      return;
    }
    if (typeof indexedDB === 'undefined') {
      this.memory = meta;
      return;
    }
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(meta, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(): Promise<void> {
    if (this.shouldUseLocalStorage()) {
      this.clearLocal();
      return;
    }
    if (typeof indexedDB === 'undefined') {
      this.memory = null;
      return;
    }
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private readLocal(): VaultMeta | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as VaultMeta) : null;
    } catch {
      return null;
    }
  }

  private writeLocal(meta: VaultMeta): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(meta));
    } catch {
      this.memory = meta;
    }
  }

  private clearLocal(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      this.memory = null;
    }
  }
}

const vaultDb = new VaultDb();

export const vaultStore = {
  read: () => vaultDb.read(),
  write: (meta: VaultMeta) => vaultDb.write(meta),
  clear: () => vaultDb.clear(),
  async exists(): Promise<boolean> {
    return Boolean(await vaultDb.read());
  },
};
