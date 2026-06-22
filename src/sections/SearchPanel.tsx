import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../shell/store';
import { sqlAdapter } from '../adapters/sqlAdapter';
import { nosqlAdapter } from '../adapters/nosqlAdapter';
import { searchClient } from '../search/searchClient';
import type { IndexedDoc } from '../search/indexerCore';

interface IndexedMetaEntry { id: string; kind: 'sql' | 'nosql'; table: string; }

interface Hit {
  docId: string;
  score: number;
  meta: IndexedMetaEntry;
  snippet: string;
}

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indexedAt, setIndexedAt] = useState<number | null>(null);
  const [docMap, setDocMap] = useState<Map<string, IndexedMetaEntry>>(new Map());
  const serializedRef = useRef<string>('');
  const sqlDbs = useAppStore((s) => s.sqlDbs);
  const collections = useAppStore((s) => s.nosqlCollections);

  async function rebuildIndex() {
    setBusy(true); setError(null);
    try {
      const docs: IndexedDoc[] = [];
      const metaMap = new Map<string, IndexedMetaEntry>();
      let i = 0;
      for (const db of sqlDbs) {
        const { tables } = await sqlAdapter.schema(db.id);
        for (const t of tables) {
          const r = await sqlAdapter.exec(db.id, `SELECT * FROM "${t.name}" LIMIT 10000`);
          for (const row of r.rows) {
            const id = `${db.id}/${t.name}/${i++}`;
            const text = serializeRow(r.columns, row);
            docs.push({ id, source: { kind: 'sql', dbId: db.id, tableOrCollection: t.name, row }, text });
            metaMap.set(id, { id, kind: 'sql', table: `${db.name}/${t.name}` });
          }
        }
      }
      for (const c of collections) {
        const all = await nosqlAdapter.listDocs(c.id, { limit: 10000 });
        const fields = c.fieldNames;
        for (const doc of all) {
          const id = `${c.id}/${doc.id}`;
          const text = fields.map((f) => `${f}:${serialize(doc[f])}`).join(' ');
          docs.push({ id, source: { kind: 'nosql', dbId: c.id, tableOrCollection: c.name, row: doc }, text });
          metaMap.set(id, { id, kind: 'nosql', table: `${c.name}` });
        }
      }
      const built = await searchClient.build(docs);
      serializedRef.current = built.serialized;
      setDocMap(metaMap);
      setIndexedAt(Date.now());
      setInfo('index built');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runSearch() {
    if (!query.trim()) { setHits([]); return; }
    setBusy(true); setError(null);
    try {
      if (!serializedRef.current) {
        await rebuildIndex();
      }
      const { hits: raw } = await searchClient.search(query, serializedRef.current);
      const decorated: Hit[] = raw
        .map((h) => {
          const meta = docMap.get(h.docId);
          if (!meta) return null;
          const source = meta.kind === 'sql' ? h.docId.split('/')[1] : meta.table;
          return { docId: h.docId, score: h.score, meta, snippet: meta.kind === 'sql' ? `…${source}…` : `…${source}/${h.docId.split('/')[1]}…` };
        })
        .filter((x): x is Hit => x !== null);
      setHits(decorated);
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  const lastIndexedLabel = useMemo(() => indexedAt ? new Date(indexedAt).toLocaleTimeString() : 'never', [indexedAt]);

  return (
    <div className="section-body">
      <div className="section-header">
        <h1>Search</h1>
        <span className="fkey">F10</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>index: {lastIndexedLabel} · {docMap.size} indexed docs</span>
      </div>
      <div className="section-content">
        {error && <div className="banner danger">{error}</div>}
        <div className="btn-row" style={{ marginBottom: 10 }}>
          <input
            id="search-query"
            name="query"
            type="search"
            aria-label="Search across all databases"
            placeholder="search terms…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            style={{ flex: 1, fontSize: '14px' }}
          />
          <button className="btn-primary" onClick={runSearch} disabled={busy}>{busy ? 'searching…' : '▶ Search'}</button>
          <button onClick={rebuildIndex} disabled={busy}>{busy ? '…' : '∿ Rebuild index'}</button>
        </div>
        {hits.length === 0 ? (
          <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>no results yet</div>
        ) : (
          <table className="ascii">
            <thead>
              <tr><th>#</th><th>score</th><th>source</th><th>snippet</th></tr>
            </thead>
            <tbody>
              {hits.slice(0, 100).map((h, i) => (
                <tr key={h.docId}>
                  <td>{i + 1}</td>
                  <td>{h.score.toFixed(2)}</td>
                  <td>{h.meta.table}</td>
                  <td style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{h.snippet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function serializeRow(columns: string[], row: unknown[]): string {
  return columns.map((c, i) => `${c}:${serialize(row[i])}`).join(' ');
}

function serialize(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  try { return JSON.stringify(v); } catch { return String(v); }
}

function setInfo(_: string) { /* unused hook for future */ }
void setInfo;
