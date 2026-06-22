import Dexie, { type EntityTable } from 'dexie';
import type { NosqlDoc, NosqlFieldDef } from '../utils/schema';

/** All collection rows live in one IndexedDB-backed table, keyed by
 *  `${collectionId}:${docId}` so that we never need a per-collection
 *  schema upgrade when collections are added/removed at runtime.
 */
interface BdpRow {
  id: string;
  collection: string;
  data: string;
}

class BdpNoSqlDb extends Dexie {
  rows!: EntityTable<BdpRow, 'id'>;
  meta!: EntityTable<{ key: string; value: unknown }, 'key'>;
  constructor() {
    super('bdp-nosql');
    this.version(1).stores({
      rows: 'id,collection',
      meta: 'key',
    });
  }
}

const dbp = new BdpNoSqlDb();

export interface CollectionMetaRecord {
  id: string;
  name: string;
  fields: NosqlFieldDef[];
  createdAt: number;
  updatedAt: number;
  indexes: string[];
}

export const nosqlAdapter = {
  db: dbp,

  async upsertCollectionMeta(meta: CollectionMetaRecord): Promise<void> {
    await dbp.meta.put({ key: `col_${meta.id}`, value: meta });
  },
  async getCollectionMeta(id: string): Promise<CollectionMetaRecord | undefined> {
    const row = await dbp.meta.get(`col_${id}`);
    return (row?.value as CollectionMetaRecord | undefined) ?? undefined;
  },
  async listCollectionsMeta(): Promise<CollectionMetaRecord[]> {
    const rows = await dbp.meta.where('key').startsWith('col_').toArray();
    return rows
      .map((r) => r.value as CollectionMetaRecord)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async removeCollection(id: string): Promise<void> {
    await dbp.meta.delete(`col_${id}`);
    await dbp.rows.where('collection').equals(id).delete();
  },

  async insertDocs(collectionId: string, docs: NosqlDoc[]): Promise<void> {
    if (!docs.length) return;
    const rows: BdpRow[] = docs.map((d) => ({
      id: `${collectionId}:${String(d.id)}`,
      collection: collectionId,
      data: JSON.stringify(d),
    }));
    await dbp.rows.bulkPut(rows);
  },
  async listDocs(
    collectionId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<NosqlDoc[]> {
    const all = await dbp.rows.where('collection').equals(collectionId).toArray();
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 50;
    const slice = all.slice(offset, offset + limit);
    return slice.map((r) => JSON.parse(r.data) as NosqlDoc);
  },
  async countDocs(collectionId: string): Promise<number> {
    try {
      return await dbp.rows.where('collection').equals(collectionId).count();
    } catch {
      return 0;
    }
  },
  async deleteDoc(collectionId: string, docId: string): Promise<void> {
    await dbp.rows.delete(`${collectionId}:${String(docId)}`);
  },
};
