import { useState } from 'react';
import { useAppStore } from '../shell/store';
import { sqlAdapter } from '../adapters/sqlAdapter';
import { sqlStore } from '../adapters/sqlStore';
import { nosqlAdapter, type CollectionMetaRecord } from '../adapters/nosqlAdapter';
import { buildArchive, readArchive } from '../importExport/bdpArchive';
import { uid } from '../utils/schema';
import { strFromU8 } from 'fflate';

export function Backup() {
  const sqlDbs = useAppStore((s) => s.sqlDbs);
  const collections = useAppStore((s) => s.nosqlCollections);
  const upsertSql = useAppStore((s) => s.upsertSqlDb);
  const removeSql = useAppStore((s) => s.removeSqlDb);
  const upsertCol = useAppStore((s) => s.upsertNosql);
  const removeCol = useAppStore((s) => s.removeNosql);
  const pushRecent = useAppStore((s) => s.pushRecent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [label, setLabel] = useState('');

  async function snapshotAll() {
    setBusy(true); setError(null); setInfo(null);
    try {
      const items: { kind: 'sql' | 'nosql'; id: string; name: string; fields?: string[]; data: Uint8Array }[] = [];
      for (const db of sqlDbs) {
        const bytes = await sqlAdapter.export(db.id);
        items.push({ kind: 'sql', id: db.id, name: db.name, data: bytes });
      }
      for (const c of collections) {
        const docs = await nosqlAdapter.listDocs(c.id, { limit: Number.MAX_SAFE_INTEGER });
        const text = docs.length ? docs.map((d) => JSON.stringify(d)).join('\n') : '';
        items.push({ kind: 'nosql', id: c.id, name: c.name, fields: c.fieldNames, data: textEncoder(text) });
      }
      const zip = buildArchive({ items, origin: 'bdp-backup' });
      const blob = new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${label.trim() || 'bdp-snapshot'}-${isoDate()}.bdp`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setInfo('snapshot created');
      pushRecent(`snapshot ${items.length} items → .bdp`);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function restoreFromFile(file: File) {
    setBusy(true); setError(null); setInfo(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const archive = readArchive(bytes);
      // Restore SQL
      for (const item of archive.manifest.items.filter((i) => i.kind === 'sql')) {
        const fileName = `sql/${item.id}.sqlite`;
        const data = archive.files[fileName];
        if (!data) throw new Error(`missing ${fileName} in archive`);
        const newId = 'sql_' + uid();
        await sqlAdapter.importBytes(newId, data);
        const now = Date.now();
        await sqlStore.write(newId, { bytes: new Uint8Array(data), name: item.name + ' (restored)', createdAt: now, updatedAt: now });
        upsertSql({ id: newId, name: item.name + ' (restored)', createdAt: now, updatedAt: now });
      }
      // Restore NoSQL
      for (const item of archive.manifest.items.filter((i) => i.kind === 'nosql')) {
        const fileName = `nosql/${item.id}.jsonl`;
        const data = archive.files[fileName];
        if (!data) throw new Error(`missing ${fileName} in archive`);
        const lines = strFromU8(data).split(/\n/).filter(Boolean);
        const docs = lines.map((l) => JSON.parse(l));
        const newId = 'col_' + uid();
        const meta: CollectionMetaRecord = {
          id: newId,
          name: item.name + ' (restored)',
          fields: (item.fields ?? Object.keys(docs[0] ?? {}).filter((k) => k !== 'id')).map((n) => ({ name: n, type: 'string' })),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          indexes: [],
        };
        await nosqlAdapter.upsertCollectionMeta(meta);
        await nosqlAdapter.insertDocs(newId, docs);
        upsertCol({
          id: newId, name: meta.name, fieldNames: meta.fields.map((f) => f.name),
          createdAt: meta.createdAt, updatedAt: meta.updatedAt,
        });
      }
      const count = archive.manifest.items.length;
      setInfo(`restored ${count} items from ${file.name}`);
      pushRecent(`restored ${count} items from ${file.name}`);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function wipeAll() {
    if (!confirm(`This will permanently delete all ${sqlDbs.length} SQL DBs and ${collections.length} NoSQL collections. Continue?`)) return;
    for (const db of sqlDbs) {
      try { await sqlAdapter.drop(db.id); await sqlStore.remove(db.id); removeSql(db.id); } catch { /* ignore */ }
    }
    for (const c of collections) {
      try { await nosqlAdapter.removeCollection(c.id); removeCol(c.id); } catch { /* ignore */ }
    }
    setInfo('wiped all data');
  }

  return (
    <div className="section-body">
      <div className="section-header">
        <h1>Backup / Snapshot</h1>
        <span style={{ flex: 1 }} />
      </div>
      <div className="section-content">
        {error && <div className="banner danger">{error}</div>}
        {info && <div className="banner ok">{info}</div>}
        <div>
          <h4 style={{ color: 'var(--accent)' }}>CREATE SNAPSHOT</h4>
          <label htmlFor="backup-label">label</label>{' '}
          <input id="backup-label" name="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="optional" style={{ width: 200 }} />{' '}
          <button className="btn-primary" disabled={busy} onClick={snapshotAll}>{busy ? '…' : '∿ Snapshot all DBs and collections'}</button>
          <div style={{ marginTop: 6, color: 'var(--fg-muted)', fontSize: 12 }}>
            Downloads a single <code>.bdp</code> archive containing all SQL DBs (as sqlite blobs) and all NoSQL collections (as JSONL).
          </div>
        </div>
        <hr className="ascii" />
        <div>
          <h4 style={{ color: 'var(--accent)' }}>RESTORE FROM .bdp</h4>
          <label className="btn-row" style={{ display: 'inline-block' }}>
            <input id="backup-restore-file" name="restoreFile" type="file" accept=".bdp,application/zip" style={{ display: 'none' }}
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) restoreFromFile(f); }} />
            <button onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement).click()}>↑ Pick .bdp</button>
          </label>
          <div style={{ marginTop: 6, color: 'var(--fg-muted)', fontSize: 12 }}>
            Restore imports the archive's items as new DBs/collections with "(restored)" suffix. Existing data is preserved.
          </div>
        </div>
        <hr className="ascii" />
        <div>
          <h4 style={{ color: 'var(--danger)' }}>DANGER</h4>
          <button className="btn-danger" onClick={wipeAll}>wipe all data</button>
        </div>
      </div>
    </div>
  );
}

function isoDate(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function textEncoder(s: string): Uint8Array {
  return s ? new TextEncoder().encode(s) : new Uint8Array(new ArrayBuffer(0));
}
