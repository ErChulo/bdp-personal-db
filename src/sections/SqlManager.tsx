import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../shell/store';
import { sqlAdapter } from '../adapters/sqlAdapter';
import { sqlStore } from '../adapters/sqlStore';
import type { SqlTableInfo } from '../utils/schema';
import { renderAsciiTable } from '../utils/asciiTable';
import { uid } from '../utils/schema';
import { CodeEditor } from '../components/CodeEditor';

type Tab = 'schema' | 'data' | 'indexes' | 'settings';

export function SqlManager() {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSchema, setNewSchema] = useState('CREATE TABLE example (id INTEGER PRIMARY KEY, name TEXT);');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [schema, setSchema] = useState<SqlTableInfo[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [rowsData, setRowsData] = useState<{ columns: string[]; rows: unknown[][]; total: number } | null>(null);
  const sqlDbs = useAppStore((s) => s.sqlDbs);
  const activeId = useAppStore((s) => s.activeSqlDbId);
  const activeTable = useAppStore((s) => s.activeSqlTable);
  const tab = useAppStore((s) => s.sqlManagerTab);
  const ownership = useAppStore((s) => s.ownership);
  const setActive = useAppStore((s) => s.setActiveSqlDb);
  const setActiveTable = useAppStore((s) => s.setActiveSqlTable);
  const setTab = useAppStore((s) => s.setSqlManagerTab);
  const upsert = useAppStore((s) => s.upsertSqlDb);
  const remove = useAppStore((s) => s.removeSqlDb);
  const pushRecent = useAppStore((s) => s.pushRecent);
  const beginOperation = useAppStore((s) => s.beginOperation);
  const endOperation = useAppStore((s) => s.endOperation);

  const activeName = useMemo(() => sqlDbs.find((d) => d.id === activeId)?.name ?? null, [sqlDbs, activeId]);
  const canWrite = ownership.status === 'writable';

  useEffect(() => {
    if (!activeId || tab === 'settings') return;
    setError(null);
    setBusy(true);
    sqlAdapter
      .schema(activeId)
      .then(({ tables }) => {
        setSchema(tables);
        if (!activeTable && tables[0]) setActiveTable(tables[0].name);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }, [activeId, tab, activeTable]);

  useEffect(() => {
    if (!activeId || !activeTable || tab !== 'data') return;
    setBusy(true);
    setError(null);
    const offset = page * pageSize;
    const sql = `SELECT * FROM ${quoteIdent(activeTable)} LIMIT ${pageSize} OFFSET ${offset}`;
    sqlAdapter
      .exec(activeId, sql)
      .then((r) => {
        const total = schema.find((t) => t.name === activeTable)?.rowCount ?? 0;
        setRowsData({ columns: r.columns, rows: r.rows, total });
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }, [activeId, activeTable, page, pageSize, tab, schema]);

  async function handleCreate() {
    setError(null); setInfo(null);
    if (!canWrite) return setError('This tab is read-only. Take over write access before creating a SQL DB.');
    const name = newName.trim();
    if (!name) return setError('name is required');
    const id = 'sql_' + uid();
    try {
      setBusy(true);
      beginOperation('mutation');
      await sqlAdapter.create(id, newSchema.trim() || undefined);
      const bytes = await sqlAdapter.export(id);
      const now = Date.now();
      await sqlStore.write(id, { bytes, name, createdAt: now, updatedAt: now, revision: 1, checksum: '' });
      upsert({ id, name, createdAt: now, updatedAt: now });
      setInfo(`created '${name}'`);
      setCreating(false);
      setNewName('');
      setNewSchema('CREATE TABLE example (id INTEGER PRIMARY KEY, name TEXT);');
      pushRecent(`created SQL DB "${name}"`);
      endOperation('mutation');
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      endOperation('mutation', message);
      return;
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!importFile) return;
    if (!canWrite) return setError('This tab is read-only. Take over write access before importing a SQL DB.');
    setError(null); setInfo(null); setBusy(true);
    try {
      beginOperation('import');
      const bytes = new Uint8Array(await importFile.arrayBuffer());
      const id = 'sql_' + uid();
      await sqlAdapter.importBytes(id, bytes);
      const now = Date.now();
      const name = importFile.name.replace(/\.(sqlite|db)$/i, '');
      await sqlStore.write(id, { bytes, name, createdAt: now, updatedAt: now, revision: 1, checksum: '' });
      upsert({ id, name, createdAt: now, updatedAt: now });
      setInfo(`imported ${importFile.name}`);
      pushRecent(`imported SQL DB "${importFile.name}"`);
      endOperation('import');
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      endOperation('import', message);
      return;
    } finally {
      setBusy(false); setImportFile(null);
    }
  }

  async function handleDelete() {
    if (!activeId || !activeName) return;
    if (!canWrite) return setError('This tab is read-only. Take over write access before deleting a SQL DB.');
    if (!confirm(`Delete SQL DB "${activeName}"? This cannot be undone (export first if you want to preserve).`)) return;
    try {
      setBusy(true);
      beginOperation('mutation');
      await sqlAdapter.drop(activeId);
      await sqlStore.remove(activeId);
      remove(activeId);
      pushRecent(`deleted SQL DB "${activeName}"`);
      setInfo(`deleted ${activeName}`);
      setActiveTable(null);
      endOperation('mutation');
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      endOperation('mutation', message);
      return;
    } finally {
      setBusy(false);
    }
  }

  async function handleVacuum() {
    if (!activeId) return;
    if (!canWrite) return setError('This tab is read-only. Take over write access before vacuuming a SQL DB.');
    setBusy(true); setError(null);
    try {
      beginOperation('mutation');
      await sqlAdapter.vacuum(activeId);
      const bytes = await sqlAdapter.export(activeId);
      const rec = (await sqlStore.read(activeId));
      const now = Date.now();
      await sqlStore.write(activeId, {
        bytes,
        name: rec?.name ?? 'unknown',
        createdAt: rec?.createdAt ?? now,
        updatedAt: now,
        revision: (rec?.revision ?? 0) + 1,
        checksum: '',
      });
      setInfo('vacuum complete');
      endOperation('mutation');
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      endOperation('mutation', message);
      return;
    }
    finally { setBusy(false); }
  }

  async function handleExport() {
    if (!activeId || !activeName) return;
    try {
      beginOperation('export');
      const blobBytes = await sqlAdapter.export(activeId);
      triggerDownload(new Blob([blobBytes], { type: 'application/octet-stream' }), `${activeName}.sqlite`);
      setInfo('exported');
      pushRecent(`exported SQL DB "${activeName}"`);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      endOperation('export', message);
      return;
    }
    endOperation('export');
  }

  return (
    <div className="section-body">
      <div className="section-header">
        <h1>SQL Manager</h1>
        <span className="fkey">F2</span>
        <span style={{ flex: 1 }} />
      </div>
      <div className="split section-content" style={{ padding: 0 }}>
        <div className="list-pane">
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <button className="btn-primary" onClick={() => setCreating(true)} disabled={!canWrite}>+ New SQL DB</button>{' '}
            <label className="btn-row" style={{ display: 'inline-block' }}>
              <input
                id="sql-importFile"
                name="importFile"
                type="file"
                accept=".sqlite,.db"
                style={{ display: 'none' }}
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
              <button disabled={!canWrite} onClick={(e) => (e.currentTarget.previousElementSibling as HTMLInputElement).click()}>
                ↑ Import .sqlite
              </button>
            </label>
          </div>
          {sqlDbs.length === 0 && (
            <div style={{ padding: 12, color: 'var(--fg-muted)' }}>no SQL DBs yet</div>
          )}
          {sqlDbs.map((d) => (
            <div
              key={d.id}
              className={'item' + (d.id === activeId ? ' active' : '')}
              onClick={() => { setActive(d.id); setTab('schema'); setPage(0); }}
            >
              <div>{d.name}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{new Date(d.updatedAt).toLocaleDateString()}</div>
            </div>
          ))}
          {creating && (
            <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
              <label htmlFor="sql-newName">name</label>
              <input id="sql-newName" name="newName" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="my-db" style={{ width: '100%' }} />
              <div style={{ display: 'block', marginTop: 6 }}>initial schema (optional)</div>
              <CodeEditor
                id="sql-newSchema"
                name="newSchema"
                ariaLabel="initial schema"
                value={newSchema}
                onChange={setNewSchema}
                language="sql"
                minHeight={96}
                placeholder="CREATE TABLE example (id INTEGER PRIMARY KEY, name TEXT);"
              />
              <div className="btn-row" style={{ marginTop: 6 }}>
                <button className="btn-primary" disabled={busy || !canWrite} onClick={handleCreate}>create</button>
                <button onClick={() => setCreating(false)}>cancel</button>
              </div>
            </div>
          )}
          {importFile && (
            <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
              <div>file: {importFile.name}</div>
              <div className="btn-row" style={{ marginTop: 6 }}>
                <button className="btn-primary" disabled={busy || !canWrite} onClick={handleImport}>import</button>
                <button onClick={() => setImportFile(null)}>cancel</button>
              </div>
            </div>
          )}
        </div>
        <div className="detail-pane">
          {!activeId && <div style={{ color: 'var(--fg-muted)' }}>← select or create a SQL DB</div>}
          {activeId && (
            <>
              <div style={{ marginBottom: 8 }}>
                <strong style={{ color: 'var(--accent)' }}>{activeName}</strong>{' '}
                <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>· {schema.length} tables</span>
              </div>
              {error && <div className="banner danger">{error}</div>}
              {info && <div className="banner ok">{info}</div>}
              <div className="tabs">
                <button className={tab === 'schema' ? 'active' : ''} onClick={() => setTab('schema')}>Schema</button>
                <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}>Data</button>
                <button className={tab === 'indexes' ? 'active' : ''} onClick={() => setTab('indexes')}>Indexes</button>
                <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Settings</button>
              </div>
              <div className="tab-body">
                {busy && <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>busy…</div>}
                {tab === 'schema' && <SchemaTable tables={schema} activeTable={activeTable} setActiveTable={setActiveTable} />}
                {tab === 'data' && (
                  <DataTab
                    table={activeTable}
                    setTable={setActiveTable}
                    tables={schema}
                    data={rowsData}
                    page={page}
                    setPage={setPage}
                    pageSize={pageSize}
                  />
                )}
                {tab === 'indexes' && <IndexesTab tables={schema} />}
                {tab === 'settings' && (
                  <div className="btn-row">
                    <button className="btn-primary" onClick={handleExport}>export .sqlite</button>
                    <button disabled={!canWrite || busy} onClick={handleVacuum}>vacuum</button>
                    <button className="btn-danger" disabled={!canWrite || busy} onClick={handleDelete}>delete</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function quoteIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

function SchemaTable({ tables, activeTable, setActiveTable }: { tables: SqlTableInfo[]; activeTable: string | null; setActiveTable: (s: string) => void }) {
  if (!tables.length) return <div style={{ color: 'var(--fg-muted)' }}>no tables yet</div>;
  return (
    <div>
      <div className="tag-row" style={{ marginBottom: 10 }}>
        {tables.map((t) => (
          <button
            key={t.name}
            className={t.name === activeTable ? 'btn-primary' : ''}
            onClick={() => setActiveTable(t.name)}
          >
            {t.name} ({t.rowCount})
          </button>
        ))}
      </div>
      {activeTable && (() => {
        const t = tables.find((x) => x.name === activeTable);
        if (!t) return null;
        return (
          <table className="ascii">
            <thead>
              <tr><th>#</th><th>column</th><th>type</th><th>pk</th><th>not null</th><th>default</th></tr>
            </thead>
            <tbody>
              {t.columns.map((c, i) => (
                <tr key={c.name}>
                  <td>{i}</td>
                  <td>{c.name}</td>
                  <td>{c.type || '—'}</td>
                  <td>{c.pk ? '✓' : ''}</td>
                  <td>{c.notnull ? '✓' : ''}</td>
                  <td>{c.dflt ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })()}
    </div>
  );
}

function DataTab(props: { table: string | null; setTable: (s: string) => void; tables: SqlTableInfo[]; data: { columns: string[]; rows: unknown[][]; total: number } | null; page: number; setPage: (p: number) => void; pageSize: number }) {
  if (!props.table) return <div style={{ color: 'var(--fg-muted)' }}>no table selected</div>;
  const total = props.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / props.pageSize));
  return (
    <div>
      <div style={{ marginBottom: 8, color: 'var(--fg-muted)', fontSize: 12 }}>
        {props.table} · page {props.page + 1} / {pages} · {total} rows
      </div>
      <pre style={{ background: 'var(--bg-elev)', padding: 10, overflow: 'auto', maxHeight: 360, border: '1px solid var(--border)' }}>
        {props.data ? renderAsciiTable(props.data.columns, props.data.rows) : '(loading)'}
      </pre>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button disabled={props.page <= 0} onClick={() => props.setPage(props.page - 1)}>← prev</button>
        <button disabled={props.page + 1 >= pages} onClick={() => props.setPage(props.page + 1)}>next →</button>
      </div>
    </div>
  );
}

function IndexesTab({ tables }: { tables: SqlTableInfo[] }) {
  const all = tables.flatMap((t) => t.indexes.map((i) => ({ table: t.name, name: i.name, unique: i.unique })));
  if (!all.length) return <div style={{ color: 'var(--fg-muted)' }}>no indexes</div>;
  return (
    <table className="ascii">
      <thead>
        <tr><th>table</th><th>index</th><th>unique</th></tr>
      </thead>
      <tbody>
        {all.map((i) => (
          <tr key={`${i.table}.${i.name}`}>
            <td>{i.table}</td>
            <td>{i.name}</td>
            <td>{i.unique ? '✓' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
