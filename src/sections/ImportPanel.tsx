import { useState } from 'react';
import { useAppStore } from '../shell/store';
import { parseCsv, inferTypes, type CsvInferred } from '../importExport/csv';
import { parseJsonArray, parseNdjson } from '../importExport/json';
import { parseSqlDump, dumpToForeignKeys } from '../importExport/sqlDump';
import { isProbablySqlite, readSqliteFile } from '../importExport/sqliteFile';
import { sqlAdapter } from '../adapters/sqlAdapter';
import { sqlStore } from '../adapters/sqlStore';
import { nosqlAdapter, type CollectionMetaRecord } from '../adapters/nosqlAdapter';
import { uid } from '../utils/schema';
import { renderAsciiTable } from '../utils/asciiTable';

type Parsed =
  | { kind: 'csv'; columns: string[]; rows: Record<string, string>[] }
  | { kind: 'json-ndjson' | 'json-array' | 'sqlDump'; lines: string[]; rows: Record<string, unknown>[] | null; tables?: { name: string; columns: string[]; rows: string[][] }[] }
  | { kind: 'sqlite'; bytes: Uint8Array };

export function ImportPanel() {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const sqlDbs = useAppStore((s) => s.sqlDbs);
  const collections = useAppStore((s) => s.nosqlCollections);
  const upsertSql = useAppStore((s) => s.upsertSqlDb);
  const upsertCol = useAppStore((s) => s.upsertNosql);
  const pushRecent = useAppStore((s) => s.pushRecent);
  const [importTarget, setImportTarget] = useState<'new-sql' | 'new-nosql' | string>('new-sql');
  const [newDbName, setNewDbName] = useState('');

  async function onFiles(files: FileList | null) {
    if (!files || !files[0]) return;
    setError(null); setInfo(null); setParsed(null);
    const file = files[0];
    try {
      if (/\.sqlite$|\.db$/i.test(file.name)) {
        const bytes = await readSqliteFile(file);
        setParsed({ kind: 'sqlite', bytes });
        return;
      }
      const text = await file.text();
      if (/\.csv$/i.test(file.name)) {
        const { columns, rows } = parseCsv(text);
        setParsed({ kind: 'csv', columns, rows });
        return;
      }
      if (/\.ndjson$/i.test(file.name)) {
        const rows = parseNdjson(text);
        setParsed({ kind: 'json-ndjson', lines: text.split(/\r?\n/).filter(Boolean).slice(0, 10), rows });
        return;
      }
      if (/\.json$/i.test(file.name)) {
        try {
          const rows = parseJsonArray(text);
          setParsed({ kind: 'json-array', lines: [text.slice(0, 200)], rows });
          return;
        } catch {
          const rows = parseNdjson(text);
          setParsed({ kind: 'json-ndjson', lines: text.split(/\r?\n/).filter(Boolean).slice(0, 10), rows });
          return;
        }
      }
      if (/\.sql$/i.test(file.name) || /\b(CREATE TABLE|INSERT INTO)\b/i.test(text)) {
        const dump = parseSqlDump(text);
        setParsed({ kind: 'sqlDump', lines: text.split(/\r?\n/).slice(0, 10), rows: null, tables: dump.tables });
        return;
      }
      setError('unrecognized file — try .csv, .json, .ndjson, .sql, .sqlite, .db');
    } catch (err) { setError((err as Error).message); }
  }

  function previewText(): string {
    if (!parsed) return '';
    if (parsed.kind === 'csv') {
      const { inferred } = inferTypes(parsed.rows, parsed.columns);
      return renderAsciiTable(parsed.columns, inferred.slice(0, 10).map((r) => parsed.columns.map((c) => r[c])));
    }
    if (parsed.kind === 'sqlite') return `(binary sqlite file ${parsed.bytes.byteLength} bytes)`;
    if (parsed.kind === 'json-array' || parsed.kind === 'json-ndjson') {
      const cols = parsed.rows && parsed.rows.length ? Object.keys(parsed.rows[0]) : [];
      const rows = (parsed.rows ?? []).slice(0, 10);
      return renderAsciiTable(cols, rows.map((r) => cols.map((c) => r[c] as unknown)));
    }
    if (parsed.kind === 'sqlDump' && parsed.tables?.length) {
      const t = parsed.tables[0];
      return renderAsciiTable(t.columns, t.rows.slice(0, 10));
    }
    return '(no preview)';
  }

  async function handleRun() {
    if (!parsed) return;
    setError(null); setInfo(null); setBusy(true);
    try {
      if (parsed.kind === 'sqlite') {
        const id = 'sql_' + uid();
        await sqlAdapter.importBytes(id, parsed.bytes);
        const now = Date.now();
        const name = newDbName.trim() || 'imported';
        await sqlStore.write(id, { bytes: parsed.bytes, name, createdAt: now, updatedAt: now });
        upsertSql({ id, name, createdAt: now, updatedAt: now });
        pushRecent(`imported SQL DB "${name}"`);
        setInfo(`imported ${parsed.bytes.byteLength} bytes`);
        setParsed(null); return;
      }
      if (parsed.kind === 'csv' || parsed.kind === 'json-array' || parsed.kind === 'json-ndjson') {
        const sourceInferred: CsvInferred[] = parsed.kind === 'csv'
          ? inferTypes(parsed.rows, parsed.columns).inferred
          : (parsed.rows ?? []).map((r) => r as unknown as CsvInferred);
        const sourceColumns: string[] = parsed.kind === 'csv'
          ? parsed.columns
          : (sourceInferred[0] ? Object.keys(sourceInferred[0]) : []);
        if (importTarget === 'new-sql' || sqlDbs.find((d) => d.id === importTarget)) {
          const dbId = importTarget === 'new-sql' ? 'sql_' + uid() : importTarget;
          await sqlAdapter.create(dbId, `CREATE TABLE data (${sourceColumns.map((c) => `"${c}" TEXT`).join(', ')});`);
          const chunkSize = 100;
          for (let i = 0; i < sourceInferred.length; i += chunkSize) {
            const chunk = sourceInferred.slice(i, i + chunkSize);
            const values = chunk.map((r) => '(' + sourceColumns.map((c) => sqlValue(r[c])).join(', ') + ')').join(', ');
            await sqlAdapter.run(dbId, `INSERT INTO data (${sourceColumns.map((c) => `"${c}"`).join(', ')}) VALUES ${values};`);
          }
          const now = Date.now();
          const bytes = await sqlAdapter.export(dbId);
          const name = importTarget === 'new-sql' ? (newDbName.trim() || 'imported-csv') : (sqlDbs.find((d) => d.id === dbId)?.name ?? 'updated');
          await sqlStore.write(dbId, { bytes, name, createdAt: now, updatedAt: now });
          if (importTarget === 'new-sql') {
            upsertSql({ id: dbId, name, createdAt: now, updatedAt: now });
            pushRecent(`imported CSV/JSON → SQL DB "${name}" (${sourceInferred.length} rows)`);
          } else {
            pushRecent(`appended ${sourceInferred.length} rows to SQL DB "${name}"`);
          }
          setInfo(`imported ${sourceInferred.length} rows`);
          setParsed(null); return;
        }
        const colId = 'col_' + uid();
        const meta: CollectionMetaRecord = {
          id: colId,
          name: newDbName.trim() || 'imported',
          fields: sourceColumns.map((c) => ({ name: c, type: 'string' })),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          indexes: [],
        };
        await nosqlAdapter.upsertCollectionMeta(meta);
        await nosqlAdapter.insertDocs(
          colId,
          sourceInferred.map((r) => ({ id: uid('doc'), ...r })),
        );
        upsertCol({ id: colId, name: meta.name, fieldNames: meta.fields.map((f) => f.name), createdAt: meta.createdAt, updatedAt: meta.updatedAt });
        pushRecent(`imported CSV/JSON → NoSQL collection "${meta.name}" (${sourceInferred.length} docs)`);
        setInfo(`imported ${sourceInferred.length} docs`);
        setParsed(null); return;
      }
      if (parsed.kind === 'sqlDump' && parsed.tables) {
        const dbId = importTarget === 'new-sql' ? 'sql_' + uid() : importTarget;
        await sqlAdapter.create(dbId);
        for (const t of parsed.tables) {
          const colDefs = t.columns.length ? t.columns.map((c) => `"${c}" TEXT`).join(', ') : '"__empty__" TEXT';
          await sqlAdapter.exec(dbId, `CREATE TABLE IF NOT EXISTS "${t.name}" (${colDefs});`);
          for (const stmt of dumpToForeignKeys([t])) {
            try { await sqlAdapter.exec(dbId, stmt); } catch { /* skip malformed */ }
          }
        }
        const now = Date.now();
        const bytes = await sqlAdapter.export(dbId);
        const name = importTarget === 'new-sql' ? (newDbName.trim() || 'imported-sql') : (sqlDbs.find((d) => d.id === dbId)?.name ?? 'updated');
        await sqlStore.write(dbId, { bytes, name, createdAt: now, updatedAt: now });
        if (importTarget === 'new-sql') {
          upsertSql({ id: dbId, name, createdAt: now, updatedAt: now });
          pushRecent(`imported SQL dump → "${name}" (${parsed.tables.length} tables)`);
        }
        setInfo(`imported ${parsed.tables.length} tables`);
        setParsed(null); return;
      }
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="section-body">
      <div className="section-header">
        <h1>Import</h1>
        <span className="fkey">F5</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Supported: CSV · JSON · NDJSON · .sql dump · .sqlite · .db</span>
      </div>
      <div className="section-content">
        <div className="banner" style={{ border: '1px dashed var(--accent)', padding: 14, textAlign: 'center', color: 'var(--accent)' }}
             onDragOver={(e) => e.preventDefault()}
             onDrop={(e) => { e.preventDefault(); void onFiles(e.dataTransfer.files); }}>
          drop a file here or pick one ↓ <span className="fkey" style={{ marginLeft: 6 }}>F5</span>
          <div style={{ marginTop: 8 }}>
            <label>
              <input id="import-file" name="importFile" type="file" style={{ display: 'none' }}
                accept=".csv,.json,.ndjson,.sql,.sqlite,.db,text/csv,application/json,application/octet-stream"
                onChange={(e) => void onFiles(e.target.files)} />
              <button className="btn-primary" onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement).click()}>
                Choose file…
              </button>
            </label>
          </div>
        </div>

        {error && <div className="banner danger">{error}</div>}
        {info && <div className="banner ok">{info}</div>}

        {parsed && (
          <>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <label htmlFor="import-target">target DB
                <select id="import-target" name="target" value={importTarget} onChange={(e) => setImportTarget(e.target.value)} style={{ marginLeft: 6 }}>
                  <option value="new-sql">+ new SQL DB</option>
                  <option value="new-nosql">+ new NoSQL collection</option>
                  {sqlDbs.map((d) => (<option key={d.id} value={d.id}>existing SQL: {d.name}</option>))}
                </select>
              </label>
              <label htmlFor="import-newDbName">name
                <input id="import-newDbName" name="newDbName" value={newDbName} onChange={(e) => setNewDbName(e.target.value)} style={{ marginLeft: 6, width: 200 }} placeholder="(optional)" />
              </label>
            </div>
            <div style={{ marginTop: 8, color: 'var(--fg-muted)', fontSize: 12 }}>detected format: <strong style={{ color: 'var(--accent)' }}>{parsed.kind}</strong> · preview (first 10 rows)</div>
            <pre style={{
              marginTop: 8, background: 'var(--bg-elev)', padding: 10, overflow: 'auto', maxHeight: 320,
              border: '1px solid var(--border)',
            }}>
              {previewText()}
            </pre>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn-primary" disabled={busy} onClick={handleRun}>{busy ? 'importing…' : '↓ Import'}</button>
              <button onClick={() => setParsed(null)}>cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function sqlValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'NULL';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Date) return "'" + v.toISOString() + "'";
  return "'" + String(v).replace(/'/g, "''") + "'";
}
