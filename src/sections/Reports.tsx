import { useEffect, useState } from 'react';
import { useAppStore } from '../shell/store';
import { sqlAdapter } from '../adapters/sqlAdapter';
import { computeColumnStats, type ColumnStats, describeSourceResult, formatSourceLabel, formatCountLabel } from '../reports/aggregations';
import { histogramBins, renderHistogramAscii, renderHistogramSvg } from '../reports/histogram';
import { SectionStateBanner } from './SectionState';

export function Reports() {
  const PAGE_SIZE = 100;
  const sqlDbs = useAppStore((s) => s.sqlDbs);
  const nosql = useAppStore((s) => s.nosqlCollections);
  const activeSqlId = useAppStore((s) => s.activeSqlDbId);
  const beginOperation = useAppStore((s) => s.beginOperation);
  const endOperation = useAppStore((s) => s.endOperation);
  const [source, setSource] = useState<'sql' | 'nosql'>('sql');
  const [sqlId, setSqlId] = useState<string>('');
  const [colId, setColId] = useState<string>('');
  const [table, setTable] = useState<string>('');
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [stats, setStats] = useState<ColumnStats[]>([]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'loading' | 'empty' | 'success' | 'error' | 'info'; message: string }>({
    tone: 'empty',
    message: 'Pick a database and table or collection to load rows.',
  });
  const [histAscii, setHistAscii] = useState(true);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visibleRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => {
    setStats([]);
    setColumns([]); setRows([]); setTables([]); setTable('');
    setPage(0);
    setBusy(false);
    setBanner({ tone: 'empty', message: 'Pick a database and table or collection to load rows.' });
    if (source === 'sql') {
      const id = sqlId || activeSqlId || '';
      if (!id) return;
      setBanner({ tone: 'loading', message: 'Loading SQL tables…' });
      sqlAdapter.listTables(id)
        .then((next) => {
          setTables(next);
          setBanner(next.length ? { tone: 'info', message: 'Pick a table to compute a report.' } : { tone: 'empty', message: 'This database has no tables yet.' });
        })
        .catch((err) => setBanner({ tone: 'error', message: (err as Error).message }));
    } else if (colId) {
      sqlAdapter; void 0;
      // For NoSQL, treat as a synthetic single "documents" table with declared field names
      const col = nosql.find((c) => c.id === colId);
      if (!col) return;
      setTables([col.name]);
      setTable(col.name);
      setBanner({ tone: 'info', message: `Collection "${col.name}" selected. Pick a tab to compute a report.` });
    }
  }, [source, sqlId, activeSqlId, colId, nosql]);

  useEffect(() => {
    if (!table) {
      setColumns([]); setRows([]); setStats([]);
      setBusy(false);
      if (source === 'sql') {
        setBanner({ tone: 'empty', message: sqlId || activeSqlId ? 'Pick a SQL table to compute a report.' : 'Pick a database and table or collection to load rows.' });
      } else {
        setBanner({ tone: 'empty', message: colId ? 'Pick the collection name above to load rows.' : 'Pick a collection to compute a report.' });
      }
      return;
    }
    setBusy(true);
    setBanner({ tone: 'loading', message: `Computing ${source === 'sql' ? 'SQL' : 'NoSQL'} report…` });
    let operationError: string | undefined;
    beginOperation('query');
    (async () => {
      try {
        if (source === 'sql') {
          const id = sqlId || activeSqlId || '';
          if (!id) return;
          const r = await sqlAdapter.exec(id, `SELECT * FROM "${table}" LIMIT 10000`);
          setColumns(r.columns);
          setRows(r.rows);
          setStats(r.columns.map((c, i) => computeColumnStats(c, i, r.rows)));
          setPage(0);
          setBanner(r.rows.length
            ? { tone: 'success', message: describeSourceResult({ kind: 'sql', name: table }, r.rows.length, 'row') }
            : { tone: 'empty', message: `Query returned no rows from ${formatSourceLabel({ kind: 'sql', name: table })}.` });
        } else {
          const col = nosql.find((c) => c.id === colId);
          if (!col) return;
          const docs = await import('../adapters/nosqlAdapter').then((m) => m.nosqlAdapter.listDocs(col.id, { limit: 10000 }));
          const cols = ['id', ...col.fieldNames];
          const arr: unknown[][] = docs.map((d) => cols.map((c) => d[c]));
          setColumns(cols);
          setRows(arr);
          setStats(cols.map((c, i) => computeColumnStats(c, i, arr)));
          setPage(0);
          setBanner(arr.length
            ? { tone: 'success', message: describeSourceResult({ kind: 'nosql', name: col.name }, arr.length, 'document') }
            : { tone: 'empty', message: `Collection ${formatSourceLabel({ kind: 'nosql', name: col.name })} has no documents yet.` });
        }
      } catch (err) {
        operationError = (err as Error).message;
        setBanner({ tone: 'error', message: operationError });
      }
      finally {
        endOperation('query', operationError);
        setBusy(false);
      }
    })();
  }, [source, sqlId, activeSqlId, table, colId, nosql]);

  return (
    <div className="section-body">
      <div className="section-header">
        <h1>Reports · Data Summaries</h1>
        <span className="fkey">F7</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>stats use the full result set · preview paginates 100 rows · source rows are capped at 10,000</span>
      </div>
      <div className="section-content" aria-busy={busy}>
        <SectionStateBanner tone={banner.tone}>{banner.message}</SectionStateBanner>
        <div className="btn-row" style={{ marginBottom: 8 }}>
          <button className={source === 'sql' ? 'btn-primary' : ''} onClick={() => setSource('sql')}>SQL</button>
          <button className={source === 'nosql' ? 'btn-primary' : ''} onClick={() => setSource('nosql')}>NoSQL</button>
        </div>
        {source === 'sql' && (
          <>
            <label>DB <select id="reports-sqlId" name="sqlId" value={sqlId} onChange={(e) => setSqlId(e.target.value)} style={{ marginLeft: 6 }}>
              <option value="">— pick —</option>
              {sqlDbs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></label>{' '}
            <label>Table <select id="reports-table" name="table" value={table} onChange={(e) => setTable(e.target.value)} style={{ marginLeft: 6 }}>
              <option value="">— pick —</option>
              {tables.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></label>{' '}
            <button onClick={() => setHistAscii((v) => !v)}>{histAscii ? '→ SVG' : '→ ASCII'}</button>
          </>
        )}
        {source === 'nosql' && (
          <label>Collection <select id="reports-colId" name="colId" value={colId} onChange={(e) => setColId(e.target.value)} style={{ marginLeft: 6 }}>
            <option value="">— pick —</option>
            {nosql.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        )}
        <hr className="ascii" />
        {stats.length === 0 && <div style={{ color: 'var(--fg-muted)' }}>no data</div>}
        {stats.length > 0 && (
          <table className="ascii">
            <thead>
              <tr>
                <th>column</th><th>type</th><th>count</th><th>missing</th><th>distinct</th>
                {stats.some((s) => s.numeric) && <th>min · max · mean · median · stddev</th>}
                <th>top values</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td>{s.type}</td>
                  <td>{s.count}</td>
                  <td>{s.missing}</td>
                  <td>{s.distinct}</td>
                  {s.numeric && (
                    <td>
                      {fmt(s.numeric.min)} · {fmt(s.numeric.max)} · {fmt(s.numeric.mean)} · {fmt(s.numeric.median)} · {fmt(s.numeric.stddev)}
                    </td>
                  )}
                  <td style={{ fontSize: 11 }}>
                    {(s.topValues ?? []).slice(0, 5).map((tv) => (
                      <div key={tv.value}>{truncate(tv.value, 30)} ({tv.count})</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="btn-row" style={{ marginBottom: 8 }}>
              <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev page</button>
              <button disabled={page + 1 >= pageCount} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>Next page</button>
              <span style={{ color: 'var(--fg-muted)', fontSize: 12, alignSelf: 'center' }}>page {Math.min(page + 1, pageCount)} / {pageCount} · {formatCountLabel(rows.length, 'row')}</span>
            </div>
            <pre style={{ background: 'var(--bg-elev)', padding: 8, border: '1px solid var(--border)', overflow: 'auto' }}>
              {renderPreviewTable(columns, visibleRows)}
            </pre>
          </div>
        )}
        {stats.some((s) => s.numeric) && rows.length > 0 && columns.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h4 style={{ color: 'var(--accent)' }}>HISTOGRAMS (numeric)</h4>
            {stats.filter((s) => s.numeric).map((s) => {
              const idx = columns.indexOf(s.name);
              const vals = rows.map((r) => Number(r[idx])).filter((v) => Number.isFinite(v));
              const bins = histogramBins(vals, 20);
              return (
                <div key={s.name} style={{ marginBottom: 12 }}>
                  <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{s.name} · n={vals.length} · bins={bins.length}</div>
                  {histAscii ? (
                    <pre style={{ background: 'var(--bg-elev)', padding: 8, border: '1px solid var(--border)', overflow: 'auto' }}>
                      {renderHistogramAscii(bins)}
                    </pre>
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: renderHistogramSvg(bins) }} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10000) return n.toExponential(3);
  return n.toFixed(Math.min(6, Math.max(0, 4 - Math.floor(Math.log10(Math.max(1, Math.abs(n)))))));
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function renderPreviewTable(columns: string[], rows: unknown[][]): string {
  if (!columns.length) return '(no columns)';
  if (!rows.length) return '(no rows on this page)';
  return `${columns.join(' | ')}\n${rows
    .map((row) => row.map((value) => (value === null || value === undefined ? 'NULL' : String(value))).join(' | '))
    .join('\n')}`;
}
