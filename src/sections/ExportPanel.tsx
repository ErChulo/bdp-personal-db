import { useState } from 'react';
import { useAppStore } from '../shell/store';
import { sqlAdapter } from '../adapters/sqlAdapter';
import { nosqlAdapter } from '../adapters/nosqlAdapter';
import { serializeCsv } from '../importExport/csv';
import { collectionToJson, collectionToNdjson } from '../importExport/json';
import { emitSqlDump, type ParsedDumpTable } from '../importExport/sqlDump';
import { buildArchive, formatBytes, summarizeTransfer } from '../importExport/bdpArchive';
import { strToU8, zipSync } from 'fflate';

type Format = 'csv' | 'json' | 'ndjson' | 'sqldump' | 'bdp';

export function ExportPanel() {
  const sqlDbs = useAppStore((s) => s.sqlDbs);
  const collections = useAppStore((s) => s.nosqlCollections);
  const pushRecent = useAppStore((s) => s.pushRecent);
  const beginOperation = useAppStore((s) => s.beginOperation);
  const endOperation = useAppStore((s) => s.endOperation);
  const [source, setSource] = useState<'sql' | 'nosql'>('sql');
  const [sqlId, setSqlId] = useState<string>('');
  const [colId, setColId] = useState<string>('');
  const [format, setFormat] = useState<Format>('csv');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function run() {
    setError(null); setInfo(null); setBusy(true);
    let operationError: string | undefined;
    beginOperation('export');
    try {
      const sourceName = source === 'sql'
        ? (sqlDbs.find((d) => d.id === sqlId)?.name ?? 'SQL source')
        : (collections.find((c) => c.id === colId)?.name ?? 'NoSQL source');
      const failedEntries: string[] = [];
      let itemCount = 0;
      let payloadBytes = 0;
      if (source === 'sql') {
        if (!sqlId) throw new Error('pick a SQL DB');
        const dbName = sourceName || 'export';
        const schema = await sqlAdapter.schema(sqlId);
        const tableRows: ParsedDumpTable[] = [];
        for (const t of schema.tables) {
          if (t.columns.length === 0) continue;
          try {
            const r = await sqlAdapter.exec(sqlId, `SELECT * FROM "${t.name}"`);
            const rowsAsStr: string[][] = r.rows.map((row) => row.map((v) => (v === null || v === undefined ? '' : String(v))));
            tableRows.push({ name: t.name, columns: t.columns.map((c) => c.name), rows: rowsAsStr });
          } catch (err) {
            failedEntries.push(`table "${t.name}": ${(err as Error).message}`);
          }
        }
        itemCount = tableRows.length;
        if (tableRows.length === 0 && failedEntries.length > 0) {
          throw new Error(`no tables could be exported; failed: ${failedEntries.join('; ')}`);
        }
        if (format === 'csv') {
          payloadBytes = exportCsvMultiTable(dbName, tableRows);
          setInfo(buildExportInfo([{ name: dbName, itemCount, byteLength: payloadBytes, failedEntries }], format));
        } else if (format === 'json' || format === 'ndjson') {
          const obj: Record<string, unknown[]> = {};
          for (const t of tableRows) {
            obj[t.name] = t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i]])));
          }
          const out = format === 'json'
            ? JSON.stringify(obj, null, 2)
            : tableRows.map((t) => t.rows.map((r) => JSON.stringify(Object.fromEntries(t.columns.map((c, i) => [c, r[i]])))).join('\n')).join('\n');
          const blob = new Blob([out], { type: 'application/json' });
          payloadBytes = blob.size;
          triggerDownload(blob, `${dbName}.${format === 'json' ? 'json' : 'ndjson'}`);
          setInfo(buildExportInfo([{ name: dbName, itemCount, byteLength: payloadBytes, failedEntries }], format));
        } else if (format === 'sqldump') {
          const sql = emitSqlDump(tableRows);
          const blob = new Blob([sql], { type: 'application/sql' });
          payloadBytes = blob.size;
          triggerDownload(blob, `${dbName}.sql`);
          setInfo(buildExportInfo([{ name: dbName, itemCount, byteLength: payloadBytes, failedEntries }], format));
        } else if (format === 'bdp') {
          const rawBytes = await sqlAdapter.export(sqlId);
          const zip = await buildArchive({ items: [{ kind: 'sql', id: sqlId, name: dbName, data: rawBytes }] });
          const blob = new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
          payloadBytes = blob.size;
          triggerDownload(blob, `${dbName}.bdp`);
          setInfo(buildExportInfo([{ name: dbName, itemCount: 1, byteLength: payloadBytes, failedEntries }], format));
        }
      } else {
        if (!colId) throw new Error('pick a NoSQL collection');
        const meta = await nosqlAdapter.getCollectionMeta(colId);
        if (!meta) throw new Error('collection meta missing');
        const docs = await nosqlAdapter.listDocs(colId, { limit: 1_000_000 });
        itemCount = docs.length;
        if (format === 'csv') {
          const columns = ['id', ...meta.fields.map((f) => f.name)];
          const csvRows = docs.map((d) => Object.fromEntries(columns.map((c) => [c, String(d[c] ?? '')])));
          const out = serializeCsv(columns, csvRows);
          const blob = new Blob([out], { type: 'text/csv' });
          payloadBytes = blob.size;
          triggerDownload(blob, `${meta.name}.csv`);
          setInfo(buildExportInfo([{ name: meta.name, itemCount, byteLength: payloadBytes, failedEntries }], format));
        } else if (format === 'json' || format === 'ndjson') {
          const out = format === 'json' ? collectionToJson(docs, meta.name) : collectionToNdjson(docs);
          const blob = new Blob([out], { type: 'application/json' });
          payloadBytes = blob.size;
          triggerDownload(blob, `${meta.name}.${format === 'json' ? 'json' : 'ndjson'}`);
          setInfo(buildExportInfo([{ name: meta.name, itemCount, byteLength: payloadBytes, failedEntries }], format));
        } else if (format === 'sqldump') {
          const cols = ['id', ...meta.fields.map((f) => f.name)];
          const rows: string[][] = docs.map((d) => ['"' + String(d.id).replace(/"/g, '""') + '"', ...meta.fields.map((f) => {
            const v = d[f.name];
            if (v === null || v === undefined) return 'NULL';
            return "'" + String(v).replace(/'/g, "''") + "'";
          })]);
          const dump: ParsedDumpTable[] = [{ name: meta.name, columns: cols, rows }];
          const sql = emitSqlDump(dump);
          const blob = new Blob([sql], { type: 'application/sql' });
          payloadBytes = blob.size;
          triggerDownload(blob, `${meta.name}.sql`);
          setInfo(buildExportInfo([{ name: meta.name, itemCount, byteLength: payloadBytes, failedEntries }], format));
        } else if (format === 'bdp') {
          const jsonl = docs.map((d) => JSON.stringify(d)).join('\n');
          const zip = await buildArchive({
            items: [{ kind: 'nosql', id: colId, name: meta.name, fields: meta.fields.map((f) => f.name), data: strToU8(jsonl) }],
          });
          const blob = new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
          payloadBytes = blob.size;
          triggerDownload(blob, `${meta.name}.bdp`);
          setInfo(buildExportInfo([{ name: meta.name, itemCount: 1, byteLength: payloadBytes, failedEntries }], format));
        }
      }
      const label = `${sourceName} → ${format}`;
      pushRecent(`exported ${label}`);
      if (failedEntries.length > 0) {
        setError(`partial export: ${failedEntries.join('; ')}`);
      }
    } catch (err) {
      operationError = (err as Error).message;
      setError(operationError);
    } finally {
      endOperation('export', operationError);
      setBusy(false);
    }
  }

  return (
    <div className="section-body">
      <div className="section-header">
        <h1>Export</h1>
        <span className="fkey">F6</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>CSV · JSON · NDJSON · SQL · .bdp</span>
      </div>
      <div className="section-content">
        {error && <div className="banner danger">{error}</div>}
        {info && <div className="banner ok">{info}</div>}
        <div className="btn-row" style={{ marginBottom: 8 }}>
          <button className={source === 'sql' ? 'btn-primary' : ''} onClick={() => setSource('sql')}>SQL</button>
          <button className={source === 'nosql' ? 'btn-primary' : ''} onClick={() => setSource('nosql')}>NoSQL</button>
        </div>
        {source === 'sql' && (
          <label>source DB
            <select id="export-sqlId" name="sqlId" value={sqlId} onChange={(e) => setSqlId(e.target.value)} style={{ marginLeft: 6 }}>
              <option value="">— pick —</option>
              {sqlDbs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
        {source === 'nosql' && (
          <label>collection
            <select id="export-colId" name="colId" value={colId} onChange={(e) => setColId(e.target.value)} style={{ marginLeft: 6 }}>
              <option value="">— pick —</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <div className="btn-row" style={{ marginTop: 10 }}>
          {(['csv', 'json', 'ndjson', 'sqldump', 'bdp'] as Format[]).map((f) => (
            <button key={f} className={format === f ? 'btn-primary' : ''} onClick={() => setFormat(f)}>{labelOf(f)}</button>
          ))}
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn-primary" disabled={busy} onClick={run}>{busy ? 'exporting…' : '↑ Export'}</button>
        </div>
        <hr className="ascii" />
        <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>
          {source === 'sql' ? (
            <>
              <div>The export will include all tables in the selected SQL DB.</div>
              <div>CSV → zip of per-table files; JSON/NDJSON → keyed by table name; SQL → CREATE TABLE + INSERT INTO; .bdp → bdp round-trip archive.</div>
            </>
          ) : (
            <>
              <div>The export will include all documents in the selected NoSQL collection.</div>
              <div>CSV row per doc; JSON wraps in collection name; SQL encodes as a single table; .bdp → bdp round-trip archive.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function labelOf(f: Format): string {
  if (f === 'csv') return '↓ CSV';
  if (f === 'json') return '↓ JSON';
  if (f === 'ndjson') return '↓ NDJSON';
  if (f === 'sqldump') return '↓ SQL dump';
  return '↓ .bdp archive';
}

function buildExportInfo(items: { name: string; itemCount: number; byteLength: number; failedEntries: string[] }[], format: Format): string {
  const summary = summarizeTransfer(items);
  const prefix = summary.failedEntries.length > 0 ? 'partial export' : 'exported';
  const formatLabel = formatLabelFor(format);
  const details = summary.sources
    .map((item) => `${item.name} [${item.itemCount} ${itemCountLabel(item.itemCount)} · ${formatBytes(item.byteLength)}]`)
    .join(', ');
  const failures = summary.failedEntries.length ? `; failed: ${summary.failedEntries.join('; ')}` : '';
  return `${prefix} ${details} as ${formatLabel}${failures}`;
}

function formatLabelFor(format: Format): string {
  if (format === 'bdp') return '.bdp';
  if (format === 'sqldump') return 'SQL';
  return format.toUpperCase();
}

function itemCountLabel(itemCount: number): string {
  return itemCount === 1 ? 'item' : 'items';
}

function exportCsvMultiTable(dbName: string, tables: ParsedDumpTable[]): number {
  const files: Record<string, Uint8Array> = {};
  for (const t of tables) {
    const cols = t.columns;
    const escape = (v: string) => /[",\n\r\t]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    const header = cols.join(',');
    const body = t.rows.map((r) => r.map(escape).join(',')).join('\n');
    const text = body ? header + '\n' + body : header;
    files[`${t.name}.csv`] = strToU8(text);
  }
  const zip = zipSync(files, { level: 6 });
  const blob = new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
  triggerDownload(blob, `${dbName}.csv.zip`);
  return blob.size;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
