import { useState } from 'react';
import { useAppStore } from '../shell/store';
import { sqlAdapter } from '../adapters/sqlAdapter';
import { sqlStore } from '../adapters/sqlStore';
import { nosqlAdapter, type CollectionMetaRecord } from '../adapters/nosqlAdapter';
import { buildArchive, readArchive } from '../importExport/bdpArchive';
import { ensureFileWithinLimit } from '../importExport/fileIntake';
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
  const ownership = useAppStore((s) => s.ownership);
  const beginOperation = useAppStore((s) => s.beginOperation);
  const endOperation = useAppStore((s) => s.endOperation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const canWrite = ownership.status === 'writable';

  async function snapshotAll() {
    setBusy(true); setError(null); setInfo(null);
    let operationError: string | undefined;
    beginOperation('backup');
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
      const zip = await buildArchive({ items, origin: 'bdp-backup' });
      const blob = new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${label.trim() || 'bdp-snapshot'}-${isoDate()}.bdp`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setInfo('snapshot created');
      pushRecent(`snapshot ${items.length} items → .bdp`);
    } catch (err) {
      operationError = (err as Error).message;
      setError(operationError);
    }
    finally {
      endOperation('backup', operationError);
      setBusy(false);
    }
  }

  async function restoreFromFile(file: File) {
    if (!canWrite) return setError('This tab is read-only. Take over write access before restoring data.');
    setBusy(true); setError(null); setInfo(null);
    const createdSql: string[] = [];
    const createdNosql: string[] = [];
    let failed = false;
    let operationError: string | undefined;
    beginOperation('restore');
    try {
      ensureFileWithinLimit(file, file.name);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const archive = await readArchive(bytes);
      const sqlNames = new Set(sqlDbs.map((db) => db.name));
      const colNames = new Set(collections.map((c) => c.name));

      // Validate all planned paths before making writes.
      for (const item of archive.manifest.entries) {
        if (item.kind === 'sql') {
          const fileName = item.path;
          const data = archive.files[fileName];
          if (!data) throw new Error(`missing ${fileName} in archive`);
        } else {
          const fileName = item.path;
          const data = archive.files[fileName];
          if (!data) throw new Error(`missing ${fileName} in archive`);
        }
      }

      // Restore SQL
      for (const item of archive.manifest.entries.filter((i) => i.kind === 'sql')) {
        const fileName = item.path;
        const data = archive.files[fileName];
        const newId = 'sql_' + uid();
        const name = nextRestoredName(sqlNames, item.name);
        sqlNames.add(name);
        await sqlAdapter.importBytes(newId, data);
        const now = Date.now();
        await sqlStore.write(newId, { bytes: new Uint8Array(data), name, createdAt: now, updatedAt: now, revision: 1, checksum: '' });
        createdSql.push(newId);
        upsertSql({ id: newId, name, createdAt: now, updatedAt: now });
      }
      // Restore NoSQL
      for (const item of archive.manifest.entries.filter((i) => i.kind === 'nosql')) {
        const fileName = item.path;
        const data = archive.files[fileName];
        const lines = strFromU8(data).split(/\n/).filter(Boolean);
        const docs = lines.map((l) => JSON.parse(l));
        const newId = 'col_' + uid();
        const name = nextRestoredName(colNames, item.name);
        colNames.add(name);
        const meta: CollectionMetaRecord = {
          id: newId,
          name,
          fields: (item.fields ?? Object.keys(docs[0] ?? {}).filter((k) => k !== 'id')).map((n) => ({ name: n, type: 'string' })),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          indexes: [],
        };
        await nosqlAdapter.upsertCollectionMeta(meta);
        await nosqlAdapter.insertDocs(newId, docs);
        createdNosql.push(newId);
        upsertCol({
          id: newId, name: meta.name, fieldNames: meta.fields.map((f) => f.name),
          createdAt: meta.createdAt, updatedAt: meta.updatedAt,
        });
      }
      const count = archive.manifest.entries.length;
      setInfo(`restored ${count} items from ${file.name}`);
      pushRecent(`restored ${count} items from ${file.name}`);
    } catch (err) {
      failed = true;
      operationError = (err as Error).message;
      setError(operationError);
    }
    finally {
      if (failed) {
        for (const id of createdSql) {
          try { await sqlStore.remove(id); } catch { /* ignore */ }
          try { await sqlAdapter.drop(id); } catch { /* ignore */ }
          removeSql(id);
        }
        for (const id of createdNosql) {
          try { await nosqlAdapter.removeCollection(id); } catch { /* ignore */ }
          removeCol(id);
        }
      }
      endOperation('restore', operationError);
      setBusy(false);
    }
  }

  async function wipeAll() {
    if (!canWrite) return setError('This tab is read-only. Take over write access before wiping data.');
    if (!confirm(`This will permanently delete all ${sqlDbs.length} SQL DBs and ${collections.length} NoSQL collections. Continue?`)) return;
    beginOperation('mutation');
    let operationError: string | undefined;
    for (const db of sqlDbs) {
      try { await sqlAdapter.drop(db.id); await sqlStore.remove(db.id); removeSql(db.id); } catch (err) { operationError = (err as Error).message; }
    }
    for (const c of collections) {
      try { await nosqlAdapter.removeCollection(c.id); removeCol(c.id); } catch (err) { operationError = (err as Error).message; }
    }
    if (operationError) setError(operationError);
    else setInfo('wiped all data');
    endOperation('mutation', operationError);
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
          <button className="btn-primary" disabled={busy} onClick={snapshotAll}>{busy ? '...' : 'Snapshot all DBs and collections'}</button>
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
            <button disabled={!canWrite || busy} onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement).click()}>Pick .bdp</button>
          </label>
          <div style={{ marginTop: 6, color: 'var(--fg-muted)', fontSize: 12 }}>
            Restore imports the archive's items as new DBs/collections with "(restored)" suffix. Existing data is preserved.
          </div>
        </div>
        <hr className="ascii" />
        <div>
          <h4 style={{ color: 'var(--danger)' }}>DANGER</h4>
          <button className="btn-danger" disabled={!canWrite || busy} onClick={wipeAll}>wipe all data</button>
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

function nextRestoredName(existing: Set<string>, desired: string): string {
  const base = desired.trim() || 'restored';
  if (!existing.has(base)) return base;
  for (let i = 1; i < 1000; i++) {
    const candidate = `${base} (restored ${i})`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base} (restored)`;
}
