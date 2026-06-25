import { useEffect, useState, type KeyboardEvent } from 'react';
import { useAppStore } from '../shell/store';
import { sqlAdapter } from '../adapters/sqlAdapter';
import { renderAsciiTable } from '../utils/asciiTable';
import { SectionStateBanner } from './SectionState';
import { CodeEditor } from '../components/CodeEditor';

export function Query() {
  const PAGE_SIZE = 100;
  const sql = useAppStore((s) => s.queryDraft);
  const setSql = useAppStore((s) => s.setQueryDraft);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ columns: string[]; rows: unknown[][]; durationMs: number } | null>(null);
  const [banner, setBanner] = useState<{ tone: 'loading' | 'empty' | 'success' | 'error' | 'info'; message: string } | null>({
    tone: 'empty',
    message: 'Run a query to see results.',
  });
  const [page, setPage] = useState(0);
  const history = useAppStore((s) => s.queryHistory);
  const pushQuery = useAppStore((s) => s.pushQuery);
  const ownership = useAppStore((s) => s.ownership);
  const beginOperation = useAppStore((s) => s.beginOperation);
  const endOperation = useAppStore((s) => s.endOperation);
  const activeSqlId = useAppStore((s) => s.activeSqlDbId);
  const activeNosqlId = useAppStore((s) => s.activeNosqlId);
  const sqlDbs = useAppStore((s) => s.sqlDbs);
  const collections = useAppStore((s) => s.nosqlCollections);
  const activeSqlName = sqlDbs.find((d) => d.id === activeSqlId)?.name ?? '—';
  const activeNosqlName = collections.find((c) => c.id === activeNosqlId)?.name ?? '—';
  const pageCount = result ? Math.max(1, Math.ceil(result.rows.length / PAGE_SIZE)) : 1;
  const visibleRows = result ? result.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ sql: string }>).detail;
      if (detail?.sql) setSql(detail.sql);
    };
    window.addEventListener('bdp:load-history', handler);
    return () => window.removeEventListener('bdp:load-history', handler);
  }, []);

  if (!activeSqlId) {
    return (
      <div className="section-body">
        <div className="section-header"><h1>Query</h1><span className="fkey">F4</span></div>
        <div className="section-content">
          <SectionStateBanner tone="error">No active SQL DB — open the SQL Manager (F2) and select or create a DB.</SectionStateBanner>
        </div>
      </div>
    );
  }

  async function run() {
    if (busy) return;
    const mutation = mayMutateSql(sql);
    if (mutation && ownership.status !== 'writable') {
      setBanner({ tone: 'error', message: 'This tab is read-only. Take over write access before running SQL that changes data.' });
      return;
    }
    setBanner({ tone: 'loading', message: 'Running query…' });
    setBusy(true);
    beginOperation(mutation ? 'mutation' : 'query');
    try {
      const r = await sqlAdapter.exec(activeSqlId!, sql);
      if (!r.columns.length) {
        setResult({ columns: [], rows: [], durationMs: r.durationMs });
        setBanner({ tone: 'empty', message: `No result rows · ${r.durationMs.toFixed(1)} ms` });
      } else {
        setResult({ columns: r.columns, rows: r.rows, durationMs: r.durationMs });
        setBanner({ tone: 'success', message: `Returned ${r.rows.length} row${r.rows.length === 1 ? '' : 's'} in ${r.durationMs.toFixed(1)} ms` });
      }
      setPage(0);
      pushQuery(sql, activeSqlId);
    } catch (err) {
      const message = (err as Error).message;
      setBanner({ tone: 'error', message });
      setResult(null);
      endOperation(mutation ? 'mutation' : 'query', message);
      setBusy(false);
      return;
    }
    endOperation(mutation ? 'mutation' : 'query');
    setBusy(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void run();
    }
  }

  return (
    <div className="section-body">
      <div className="section-header">
        <h1>Query · <span style={{ color: 'var(--accent)' }}>{activeSqlName}</span></h1>
        <span className="fkey">F4</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Ctrl/Cmd+Enter to run · previews page 100 rows at a time · NoSQL active: {activeNosqlName}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 10, padding: 12, height: '100%' }}>
        <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 0 }}>
          <CodeEditor
            id="query-sql"
            name="sql"
            ariaLabel="SQL editor"
            value={sql}
            onChange={setSql}
            onKeyDown={onKeyDown}
            language="sql"
            minHeight={140}
            placeholder="SELECT * FROM table;"
          />
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn-primary" onClick={run} disabled={busy || (mayMutateSql(sql) && ownership.status !== 'writable')}>
              {busy ? 'running...' : 'Run (Ctrl/Cmd+Enter)'}
            </button>
            <button onClick={() => setSql('')}>clear</button>
          </div>
          <div style={{ marginTop: 8 }}>
            {banner && <SectionStateBanner tone={banner.tone}>{banner.message}</SectionStateBanner>}
          </div>
          <pre style={{
            marginTop: 8,
            background: 'var(--bg-elev)', padding: 10, overflow: 'auto',
            border: '1px solid var(--border)', minHeight: 100,
          }}>
            {result ? renderAsciiTable(result.columns, visibleRows) : '(no result yet)'}
          </pre>
          {result && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-muted)' }}>
              {result.rows.length} rows · {result.durationMs.toFixed(1)} ms · page {Math.min(page + 1, pageCount)} / {pageCount}
            </div>
          )}
          {result && result.rows.length > PAGE_SIZE && (
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev page</button>
              <button disabled={page + 1 >= pageCount} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>Next page</button>
            </div>
          )}
        </div>
        <div style={{ overflow: 'auto', borderLeft: '1px solid var(--border)', paddingLeft: 10 }}>
          <h4 style={{ color: 'var(--accent)', marginTop: 0 }}>HISTORY</h4>
          {history.length === 0 && <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>(empty)</div>}
          {history.map((h) => (
            <div
              key={h.id}
              style={{ borderBottom: '1px solid var(--border)', padding: '6px 0', cursor: 'pointer' }}
              onClick={() => setSql(h.sql)}
            >
              <div style={{ color: 'var(--fg-muted)', fontSize: 11 }}>{new Date(h.ts).toLocaleString()}</div>
              <div style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.sql}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function mayMutateSql(sql: string): boolean {
  const normalized = sql
    .replace(/--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\//g, '')
    .toUpperCase();
  return normalized.split(';').some((statement) => {
    const value = statement.trim();
    if (!value) return false;
    if (/^(SELECT|EXPLAIN)\b/.test(value)) return false;
    if (/^PRAGMA\b/.test(value) && !value.includes('=')) return false;
    return true;
  });
}
