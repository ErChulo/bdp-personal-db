import { useAppStore, type ThemeId, type LayoutId } from '../shell/store';

const HOTKEYS: Array<[string, string, string]> = [
  ['F1', 'Dashboard', 'open dashboard'],
  ['F2', 'SQL Manager', 'manage SQL DBs'],
  ['F3', 'NoSQL Manager', 'manage NoSQL collections'],
  ['F4', 'Query', 'run SQL queries'],
  ['F5', 'Import', 'import CSV/JSON/SQL/sqlite/.bdp'],
  ['F6', 'Export', 'export to CSV/JSON/SQL/.bdp'],
  ['F7', 'Reports', 'per-column data summaries'],
  ['F8', 'Key Gen', 'UUIDs / ULIDs / hex / AES keys'],
  ['F10', 'Search', 'full-text search across DBs'],
  ['Ctrl/Cmd+K', 'Palette', 'fuzzy command palette'],
  ['?', 'Help', 'show this cheat-sheet'],
];

const THEMES: { id: ThemeId; label: string; swatch: string; bg: string; fg: string }[] = [
  { id: 'mono', label: 'Mono Inverse', swatch: '#5cf2d6', bg: '#0f1118', fg: '#e6e9f2' },
  { id: 'amber', label: 'Amber Phosphor', swatch: '#f7b955', bg: '#100c08', fg: '#f7b955' },
  { id: 'green', label: 'Green Phosphor', swatch: '#7cd87c', bg: '#07120c', fg: '#7cd87c' },
  { id: 'lilac', label: 'Lilac', swatch: '#e879f9', bg: '#14091a', fg: '#e2c8f7' },
];

const LAYOUTS: { id: LayoutId; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'compact', label: 'Compact' },
  { id: 'focus', label: 'Focus (hide chrome)' },
];

export function Dashboard() {
  const sqlDbs = useAppStore((s) => s.sqlDbs);
  const nosql = useAppStore((s) => s.nosqlCollections);
  const recent = useAppStore((s) => s.recent);
  const setSection = useAppStore((s) => s.setSection);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLayout = useAppStore((s) => s.setLayout);
  const theme = useAppStore((s) => s.theme);
  const layout = useAppStore((s) => s.layout);
  const estimate = useAppStore((s) => s.storageEstimate);

  return (
    <div className="section-body">
      <div className="section-header">
        <h1>Dashboard</h1>
        <span className="fkey">F1</span>
        <span style={{ flex: 1 }} />
      </div>
      <div className="section-content">
        <div className="cards">
          <div className="card" onClick={() => setSection('sql')}>
            <h3>◉ SQL Manager</h3>
            <div className="meta">{sqlDbs.length} {sqlDbs.length === 1 ? 'database' : 'databases'} · click to manage</div>
          </div>
          <div className="card" onClick={() => setSection('nosql')}>
            <h3>◇ NoSQL Manager</h3>
            <div className="meta">{nosql.length} {nosql.length === 1 ? 'collection' : 'collections'} · click to manage</div>
          </div>
          <div className="card" onClick={() => setSection('query')}>
            <h3>▶ Query</h3>
            <div className="meta">Run SQL against the active DB</div>
          </div>
          <div className="card" onClick={() => setSection('import')}>
            <h3>↓ Import</h3>
            <div className="meta">CSV / JSON / NDJSON / SQL dump / .sqlite / .bdp</div>
          </div>
          <div className="card" onClick={() => setSection('export')}>
            <h3>↑ Export</h3>
            <div className="meta">CSV / JSON / NDJSON / SQL dump / .bdp</div>
          </div>
          <div className="card" onClick={() => setSection('reports')}>
            <h3>Σ Reports</h3>
            <div className="meta">per-column min/max/avg/null/distinct/histograms</div>
          </div>
          <div className="card" onClick={() => setSection('keygen')}>
            <h3>⌬ Key Gen</h3>
            <div className="meta">UUID v1 / v4 / v7 · ULID · hex · AES</div>
          </div>
          <div className="card" onClick={() => setSection('search')}>
            <h3>? Search</h3>
            <div className="meta">full-text across all loaded DBs</div>
          </div>
          <div className="card" onClick={() => setSection('backup')}>
            <h3>∿ Backup</h3>
            <div className="meta">snapshot / restore .bdp archives</div>
          </div>
          <div className="card" onClick={() => setSection('schemaDiff')}>
            <h3>⫶ Schema Diff</h3>
            <div className="meta">visualise + diff two snapshots</div>
          </div>
        </div>

        <hr className="ascii" />

        <h3 style={{ color: 'var(--accent)', margin: '8px 0 4px' }}>RECENT ACTIVITY</h3>
        {recent.length === 0 ? (
          <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>no recent activity yet — try a quick action above.</div>
        ) : (
          <table className="ascii">
            <thead>
              <tr><th>When</th><th>Action</th></tr>
            </thead>
            <tbody>
              {recent.slice(0, 12).map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.ts).toLocaleString()}</td>
                  <td>{r.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <hr className="ascii" />

        <h3 style={{ color: 'var(--accent)', margin: '8px 0 4px' }}>THEME</h3>
        <div className="btn-row">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={t.id === theme ? 'btn-primary' : ''}
              onClick={() => setTheme(t.id)}
              title={`${t.bg} / ${t.fg}`}
            >
              ◼ {t.label}
            </button>
          ))}
        </div>

        <h3 style={{ color: 'var(--accent)', margin: '12px 0 4px' }}>LAYOUT</h3>
        <div className="btn-row">
          {LAYOUTS.map((l) => (
            <button key={l.id} className={l.id === layout ? 'btn-primary' : ''} onClick={() => setLayout(l.id)}>
              ▣ {l.label}
            </button>
          ))}
        </div>

        {estimate && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--fg-muted)' }}>
            Storage: {estimate.usageMB} MB used / {estimate.quotaMB} MB available
          </div>
        )}

        <hr className="ascii" />

        <h3 style={{ color: 'var(--accent)', margin: '8px 0 4px' }}>KEYBOARD CHEAT-SHEET <span className="fkey">?</span></h3>
        <table className="ascii" style={{ width: '100%' }}>
          <thead>
            <tr><th>Key</th><th>Action</th><th>Description</th></tr>
          </thead>
          <tbody>
            {HOTKEYS.map(([k, action, desc]) => (
              <tr key={k}>
                <td><kbd>{k}</kbd></td>
                <td>{action}</td>
                <td style={{ color: 'var(--fg-muted)' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
