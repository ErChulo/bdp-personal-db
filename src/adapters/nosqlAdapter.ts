import Dexie, { type EntityTable } from 'dexie';
import type { NosqlDoc, NosqlFieldDef } from '../utils/schema';
import { isSealedText, requireSession, sealPlainObject, sealText, unsealPlainObject, unsealText } from '../security/vault';

/** All collection rows live in one IndexedDB-backed table, keyed by
 *  `${collectionId}:${docId}` so that we never need a per-collection
 *  schema upgrade when collections are added/removed at runtime.
 */
interface BdpRow {
  id: string;
  collection: string;
  data: string;
}

interface BdpIndexRow {
  id: string;
  collection: string;
  docId: string;
  field: string;
  value: string;
}

class BdpNoSqlDb extends Dexie {
  rows!: EntityTable<BdpRow, 'id'>;
  rowIndexes!: EntityTable<BdpIndexRow, 'id'>;
  meta!: EntityTable<{ key: string; value: unknown }, 'key'>;
  constructor() {
    super('bdp-nosql');
    this.version(1).stores({
      rows: 'id,collection',
      meta: 'key',
    });
    this.version(2).stores({
      rows: 'id,collection',
      rowIndexes: 'id,collection,[collection+docId],[collection+field+value],field,value',
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
    await dbp.meta.put({ key: `col_${meta.id}`, value: await sealPlainObject(meta) });
  },
  async getCollectionMeta(id: string): Promise<CollectionMetaRecord | undefined> {
    const row = await dbp.meta.get(`col_${id}`);
    if (row === undefined) return undefined;
    return (await unsealPlainObject<CollectionMetaRecord>(row.value)).value;
  },
  async listCollectionsMeta(): Promise<CollectionMetaRecord[]> {
    const rows = await dbp.meta.where('key').startsWith('col_').toArray();
    const out: CollectionMetaRecord[] = [];
    for (const row of rows) {
      const decoded = await unsealPlainObject<CollectionMetaRecord>(row.value);
      out.push(decoded.value);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
  async listCollectionIds(): Promise<string[]> {
    const rows = await dbp.meta.where('key').startsWith('col_').toArray();
    return rows.map((row) => row.key.slice(4)).sort((a, b) => a.localeCompare(b));
  },
  async removeCollection(id: string): Promise<void> {
    await dbp.transaction('rw', dbp.meta, dbp.rows, dbp.rowIndexes, async () => {
      await dbp.meta.delete(`col_${id}`);
      await dbp.rows.where('collection').equals(id).delete();
      await dbp.rowIndexes.where('collection').equals(id).delete();
    });
  },
  async sealCollection(collectionId: string): Promise<void> {
    const metaRow = await dbp.meta.get(`col_${collectionId}`);
    if (!metaRow) return;
    const metaEnvelope = typeof metaRow.value === 'string' ? metaRow.value : '';
    const docsRows = await dbp.rows.where('collection').equals(collectionId).toArray();
    const existingIndexRows = await dbp.rowIndexes.where('collection').equals(collectionId).toArray();
    const alreadySealed = isSealedText(metaEnvelope)
      && docsRows.every((row) => typeof row.data === 'string' && isSealedText(row.data))
      && existingIndexRows.every((row) => typeof row.value === 'string' && isSealedText(row.value));
    if (alreadySealed) return;

    const meta = (await unsealPlainObject<CollectionMetaRecord>(metaRow.value)).value;
    const docs = docsRows.length
      ? await Promise.all(docsRows.map(async (row) => (await unsealPlainObject<NosqlDoc>(row.data)).value))
      : [];
    const sealedMeta = await sealPlainObject(meta);
    const sealedRows = await Promise.all(docs.map(async (doc) => ({
      id: `${collectionId}:${String(doc.id)}`,
      collection: collectionId,
      data: await sealPlainObject(doc),
    })));
    const sealedIndexRows = meta.indexes.length
      ? (await Promise.all(docs.map(async (doc) => buildIndexRows(collectionId, meta, doc)))).flat()
      : [];
    await dbp.transaction('rw', dbp.meta, dbp.rows, dbp.rowIndexes, async () => {
      await dbp.meta.delete(`col_${collectionId}`);
      await dbp.rows.where('collection').equals(collectionId).delete();
      await dbp.rowIndexes.where('collection').equals(collectionId).delete();
      await dbp.meta.put({ key: `col_${collectionId}`, value: sealedMeta });
      if (sealedRows.length) await dbp.rows.bulkPut(sealedRows);
      if (sealedIndexRows.length) await dbp.rowIndexes.bulkPut(sealedIndexRows);
    });
  },

  async insertDocs(collectionId: string, docs: NosqlDoc[]): Promise<void> {
    if (!docs.length) return;
    const meta = await nosqlAdapter.getCollectionMeta(collectionId);
    const rows: BdpRow[] = await Promise.all(docs.map(async (d) => ({
      id: `${collectionId}:${String(d.id)}`,
      collection: collectionId,
      data: await sealPlainObject(d),
    })));
    const encryptedIndexRows = meta ? (await Promise.all(docs.map(async (doc) => buildIndexRows(collectionId, meta, doc)))).flat() : [];
    await dbp.transaction('rw', dbp.rows, dbp.rowIndexes, async () => {
      await Promise.all(docs.map((doc) => Promise.all([
        dbp.rows.delete(`${collectionId}:${String(doc.id)}`),
        dbp.rowIndexes.where('[collection+docId]').equals([collectionId, String(doc.id)]).delete(),
      ])));
      await dbp.rows.bulkPut(rows);
      if (encryptedIndexRows.length) await dbp.rowIndexes.bulkPut(encryptedIndexRows);
    });
  },
  async listDocs(
    collectionId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<NosqlDoc[]> {
    const all = await dbp.rows.where('collection').equals(collectionId).toArray();
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 50;
    const slice = all.slice(offset, offset + limit);
    const out: NosqlDoc[] = [];
    for (const row of slice) {
      out.push((await unsealPlainObject<NosqlDoc>(row.data)).value);
    }
    return out;
  },
  async countDocs(collectionId: string): Promise<number> {
    try {
      return await dbp.rows.where('collection').equals(collectionId).count();
    } catch {
      return 0;
    }
  },
  async deleteDoc(collectionId: string, docId: string): Promise<void> {
    await dbp.transaction('rw', dbp.rows, dbp.rowIndexes, async () => {
      await dbp.rows.delete(`${collectionId}:${String(docId)}`);
      await dbp.rowIndexes.where('[collection+docId]').equals([collectionId, String(docId)]).delete();
    });
  },
  async setCollectionIndexes(collectionId: string, indexes: string[]): Promise<void> {
    const meta = await nosqlAdapter.getCollectionMeta(collectionId);
    if (!meta) return;
    const next = { ...meta, indexes: [...new Set(indexes.map((s) => s.trim()).filter(Boolean))], updatedAt: Date.now() };
    await nosqlAdapter.upsertCollectionMeta(next);
    await nosqlAdapter.rebuildCollectionIndexes(collectionId);
  },
  async rebuildCollectionIndexes(collectionId: string): Promise<void> {
    const meta = await nosqlAdapter.getCollectionMeta(collectionId);
    if (!meta) return;
    await dbp.transaction('rw', dbp.rows, dbp.rowIndexes, async () => {
      await dbp.rowIndexes.where('collection').equals(collectionId).delete();
      if (!meta.indexes.length) return;
      const rows = await dbp.rows.where('collection').equals(collectionId).toArray();
      const nextIndexRows = (await Promise.all(
        rows.map(async (row) => buildIndexRows(collectionId, meta, (await unsealPlainObject<NosqlDoc>(row.data)).value)),
      )).flat();
      if (nextIndexRows.length) await dbp.rowIndexes.bulkPut(nextIndexRows);
    });
  },
  async queryDocs(
    collectionId: string,
    query: { field?: string; equals?: unknown; startsWith?: string; limit?: number; offset?: number } = {},
  ): Promise<NosqlDoc[]> {
    const meta = await nosqlAdapter.getCollectionMeta(collectionId);
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;
    const field = query.field?.trim();
    if (!field) return this.listDocs(collectionId, { limit, offset });
    const fieldDef = meta?.fields.find((f) => f.name === field);
    const indexed = meta?.indexes.includes(field) ?? false;
    const value = query.equals !== undefined ? query.equals : query.startsWith;
    if (indexed && fieldDef && value !== undefined) {
      const encoded = encodeIndexValue(fieldDef.type, value);
      if (encoded !== null) {
        const indexRows = await dbp.rowIndexes.where('collection').equals(collectionId).toArray();
        const matchedIds: string[] = [];
        for (const row of indexRows) {
          if (row.field !== field) continue;
          const stored = await unsealText(requireSession().key, row.value);
          const match = query.startsWith !== undefined ? stored.startsWith(encoded) : stored === encoded;
          if (match) matchedIds.push(row.docId);
        }
        const selectedIds = matchedIds.slice(offset, offset + limit);
        const rows = (await dbp.rows.bulkGet(selectedIds.map((docId) => `${collectionId}:${docId}`))).filter(Boolean) as BdpRow[];
        const docs: NosqlDoc[] = [];
        for (const row of rows) {
          docs.push((await unsealPlainObject<NosqlDoc>(row.data)).value);
        }
        return docs;
      }
    }
    const all = await dbp.rows.where('collection').equals(collectionId).toArray();
    const docs: NosqlDoc[] = [];
    for (const row of all) {
      docs.push((await unsealPlainObject<NosqlDoc>(row.data)).value);
    }
    return docs.filter((doc) => {
      if (query.equals !== undefined) return doc[field] === query.equals;
      if (query.startsWith !== undefined) return String(doc[field] ?? '').startsWith(query.startsWith);
      return true;
    }).slice(offset, offset + limit);
  },
};

async function buildIndexRows(collectionId: string, meta: CollectionMetaRecord, doc: NosqlDoc): Promise<BdpIndexRow[]> {
  const docId = String(doc.id);
  const fieldDefs = new Map(meta.fields.map((field) => [field.name, field] as const));
  const out: BdpIndexRow[] = [];
  for (const field of meta.indexes) {
    const def = fieldDefs.get(field);
    if (!def) continue;
    const encoded = encodeIndexValue(def.type, doc[field]);
    if (encoded === null) continue;
    out.push({
      id: `${collectionId}:${docId}:${field}:${encoded}`,
      collection: collectionId,
      docId,
      field,
      value: await sealText(requireSession().key, encoded),
    });
  }
  return out;
}

function encodeIndexValue(type: NosqlFieldDef['type'], value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (type === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? `n:${n}` : null;
  }
  if (type === 'boolean') return `b:${value ? 1 : 0}`;
  if (type === 'date') return `d:${String(value)}`;
  if (type === 'json') {
    try { return `j:${JSON.stringify(value)}`; } catch { return null; }
  }
  return `s:${String(value)}`;
}
