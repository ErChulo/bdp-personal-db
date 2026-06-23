import { useEffect, useState } from 'react';
import { useAppStore } from '../shell/store';
import { sqlAdapter } from '../adapters/sqlAdapter';
import { renderAsciiTable } from '../utils/asciiTable';

export function Query() {
  const sql = useAppStore((s) => s.queryDraft);
  const setSql = useAppStore((s) => s.setQueryDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<{ columns: string[]; rows: unknown[][]; durationMs: number } | null>(null);
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
          <div className="banner danger">No active SQL DB — open the SQL Manager (F2) and select or create a DB.</div>
        </div>
      </div>
    );
  }

  async function run() {
    if (busy) return;
    const mutation = mayMutateSql(sql);
    if (mutation && ownership.status !== 'writable') {
      setError('This tab is read-only. Take over write access before running SQL that changes data.');
      return;
    }
    setError(null); setNotice(null); setBusy(true);
    beginOperation(mutation ? 'mutation' : 'query');
    try {
      const r = await sqlAdapter.exec(activeSqlId!, sql);
      if (!r.columns.length) {
        setResult({ columns: [], rows: [], durationMs: r.durationMs });
        setNotice(`No result rows · ${r.durationMs.toFixed(1)} ms`);
      } else {
        setResult({ columns: r.columns, rows: r.rows, durationMs: r.durationMs });
      }
      pushQuery(sql, activeSqlId);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      setResult(null);
      endOperation(mutation ? 'mutation' : 'query', message);
      setBusy(false);
      return;
    }
    endOperation(mutation ? 'mutation' : 'query');
    setBusy(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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
        <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Ctrl/Cmd+Enter to run · NoSQL active: {activeNosqlName}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 10, padding: 12, height: '100%' }}>
        <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 0 }}>
          <label htmlFor="query-sql" style={{ display: 'none' }}>SQL editor</label>
          <textarea id="query-sql" name="sql" aria-label="SQL editor" value={sql} onChange={(e) => setSql(e.target.value)} onKeyDown={onKeyDown}
            style={{ minHeight: 140, fontFamily: 'var(--font-mono)' }} />
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn-primary" onClick={run} disabled={busy || (mayMutateSql(sql) && ownership.status !== 'writable')}>
              {busy ? 'running...' : 'Run (Ctrl/Cmd+Enter)'}
            </button>
            <button onClick={() => setSql('')}>clear</button>
          </div>
          {notice && <div className="banner" style={{ marginTop: 8 }}>{notice}</div>}
          {error && <div className="banner danger" style={{ marginTop: 8 }}>{error}</div>}
          <pre style={{
            marginTop: 8,
            background: 'var(--bg-elev)', padding: 10, overflow: 'auto',
            border: '1px solid var(--border)', minHeight: 100,
          }}>
            {result ? renderAsciiTable(result.columns, result.rows) : '(no result yet)'}
          </pre>
          {result && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-muted)' }}>
              {result.rows.length} rows · {result.durationMs.toFixed(1)} ms
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
