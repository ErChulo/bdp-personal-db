import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../shell/store';
import { sqlAdapter } from '../adapters/sqlAdapter';
import type { SqlTableInfo } from '../utils/schema';

interface Node { id: string; label: string; rows: number; }

export function SchemaDiff() {
  const sqlDbs = useAppStore((s) => s.sqlDbs);
  const collections = useAppStore((s) => s.nosqlCollections);
  const [leftId, setLeftId] = useState<string>('');
  const [rightId, setRightId] = useState<string>('');
  const [leftTables, setLeftTables] = useState<SqlTableInfo[]>([]);
  const [rightTables, setRightTables] = useState<SqlTableInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (leftId) sqlAdapter.schema(leftId).then((s) => setLeftTables(s.tables)).catch((e) => setError((e as Error).message));
    else setLeftTables([]);
  }, [leftId]);
  useEffect(() => {
    if (rightId) sqlAdapter.schema(rightId).then((s) => setRightTables(s.tables)).catch((e) => setError((e as Error).message));
    else setRightTables([]);
  }, [rightId]);

  const leftNodes: Node[] = useMemo(() => leftTables.map((t) => ({ id: t.name, label: t.name, rows: t.rowCount })), [leftTables]);
  const rightNodes: Node[] = useMemo(() => rightTables.map((t) => ({ id: t.name, label: t.name, rows: t.rowCount })), [rightTables]);

  const diff = useMemo(() => computeDiff(leftTables, rightTables), [leftTables, rightTables]);

  return (
    <div className="section-body">
      <div className="section-header">
        <h1>Schema Visualizer / Diff</h1>
        <span style={{ flex: 1 }} />
      </div>
      <div className="section-content">
        {error && <div className="banner danger">{error}</div>}
        <div className="btn-row" style={{ marginBottom: 10 }}>
          <label>left <select id="diff-left" name="leftId" value={leftId} onChange={(e) => setLeftId(e.target.value)} style={{ minWidth: 180 }}>
            <option value="">— pick a SQL DB —</option>
            {sqlDbs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select></label>
          <label>right <select id="diff-right" name="rightId" value={rightId} onChange={(e) => setRightId(e.target.value)} style={{ minWidth: 180 }}>
            <option value="">— pick a SQL DB —</option>
            {sqlDbs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select></label>
        </div>
        <hr className="ascii" />
        <h4 style={{ color: 'var(--accent)' }}>SCHEMA (left)</h4>
        {leftNodes.length === 0 ? <div style={{ color: 'var(--fg-muted)' }}>(no schema loaded)</div> :
          <SvgGraph nodes={leftNodes} accentVar="--accent" />}
        <hr className="ascii" />
        <h4 style={{ color: 'var(--accent-2)' }}>SCHEMA (right)</h4>
        {rightNodes.length === 0 ? <div style={{ color: 'var(--fg-muted)' }}>(no schema loaded)</div> :
          <SvgGraph nodes={rightNodes} accentVar="--accent-2" />}
        <hr className="ascii" />
        <h4 style={{ color: 'var(--accent-3)' }}>DIFF (left → right)</h4>
        {diff.length === 0 ? <div style={{ color: 'var(--fg-muted)' }}>(pick both sides to compare)</div> :
          <table className="ascii">
            <thead><tr><th>status</th><th>table</th><th>notes</th></tr></thead>
            <tbody>
              {diff.map((d) => (
                <tr key={d.table}>
                  <td style={{ color: statusColor(d.status) }}>{d.status.toUpperCase()}</td>
                  <td>{d.table}</td>
                  <td style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{d.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>}
        <hr className="ascii" />
        <div>
          <h4 style={{ color: 'var(--accent)' }}>NoSQL collections</h4>
          <ul>
            {collections.length === 0 && <li style={{ color: 'var(--fg-muted)' }}>(none)</li>}
            {collections.map((c) => (
              <li key={c.id}><strong>{c.name}</strong> · fields: {c.fieldNames.join(', ') || '(none)'}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function statusColor(s: 'added' | 'removed' | 'modified' | 'unchanged'): string {
  if (s === 'added') return 'var(--ok)';
  if (s === 'removed') return 'var(--danger)';
  if (s === 'modified') return 'var(--warn)';
  return 'var(--fg-muted)';
}

interface DiffRow { table: string; status: 'added' | 'removed' | 'modified' | 'unchanged'; notes: string; }

function computeDiff(a: SqlTableInfo[], b: SqlTableInfo[]): DiffRow[] {
  const aMap = new Map(a.map((t) => [t.name, t]));
  const bMap = new Map(b.map((t) => [t.name, t]));
  const all = new Set([...aMap.keys(), ...bMap.keys()]);
  const out: DiffRow[] = [];
  for (const name of all) {
    const left = aMap.get(name);
    const right = bMap.get(name);
    if (!left && right) {
      out.push({ table: name, status: 'added', notes: `${right.rowCount} rows · ${right.columns.length} cols` });
    } else if (left && !right) {
      out.push({ table: name, status: 'removed', notes: `${left.rowCount} rows · ${left.columns.length} cols` });
    } else if (left && right) {
      const lc = left.columns.map((c) => c.name + ':' + c.type).sort().join('|');
      const rc = right.columns.map((c) => c.name + ':' + c.type).sort().join('|');
      if (lc === rc && left.rowCount === right.rowCount) {
        out.push({ table: name, status: 'unchanged', notes: `${left.rowCount} rows · ${left.columns.length} cols` });
      } else {
        const notes = [];
        if (lc !== rc) notes.push('schema changed');
        if (left.rowCount !== right.rowCount) notes.push(`rows: ${left.rowCount} → ${right.rowCount}`);
        out.push({ table: name, status: 'modified', notes: notes.join(' · ') });
      }
    }
  }
  return out.sort((x, y) => x.table.localeCompare(y.table));
}

function SvgGraph({ nodes, accentVar }: { nodes: Node[]; accentVar: string }) {
  if (!nodes.length) return null;
  const colW = 200;
  const rowH = 24;
  const w = colW + 40;
  const h = nodes.length * rowH + 40;
  return (
    <svg width={w} height={h} style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', display: 'block' }}>
      {nodes.map((n, i) => (
        <g key={n.id} transform={`translate(20, ${20 + i * rowH})`}>
          <rect width={colW - 20} height={rowH - 4} fill="transparent" stroke={`var(${accentVar})`} />
          <text x={6} y={rowH - 12} fill={`var(${accentVar})`} fontSize={11} fontFamily="var(--font-mono)">{n.label}</text>
          <text x={colW - 70} y={rowH - 12} fill="var(--fg-muted)" fontSize={10} fontFamily="var(--font-mono)">{n.rows} r</text>
        </g>
      ))}
    </svg>
  );
}
