import { useEffect, useState } from 'react';
import { useAppStore } from '../shell/store';
import { nosqlAdapter, type CollectionMetaRecord } from '../adapters/nosqlAdapter';
import type { NosqlFieldDef, NosqlDoc } from '../utils/schema';
import { uid } from '../utils/schema';
import { renderAsciiTable } from '../utils/asciiTable';

type Tab = 'fields' | 'data';

export function NosqlManager() {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFields, setNewFields] = useState<NosqlFieldDef[]>([{ name: 'title', type: 'string' }]);
  const [tab, setTab] = useState<Tab>('fields');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [docs, setDocs] = useState<NosqlDoc[] | null>(null);
  const collections = useAppStore((s) => s.nosqlCollections);
  const activeId = useAppStore((s) => s.activeNosqlId);
  const setActive = useAppStore((s) => s.setActiveNosql);
  const upsert = useAppStore((s) => s.upsertNosql);
  const remove = useAppStore((s) => s.removeNosql);
  const pushRecent = useAppStore((s) => s.pushRecent);

  const active = collections.find((c) => c.id === activeId);

  useEffect(() => {
    if (!activeId) { setDocs(null); return; }
    setBusy(true); setError(null);
    nosqlAdapter.listDocs(activeId, { limit: 50 })
      .then(setDocs)
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }, [activeId]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return setError('name is required');
    try {
      setBusy(true);
      const id = 'col_' + uid();
      const meta: CollectionMetaRecord = {
        id,
        name,
        fields: newFields.filter((f) => f.name.trim()),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        indexes: [],
      };
      await nosqlAdapter.upsertCollectionMeta(meta);
      upsert({ id, name, fieldNames: meta.fields.map((f) => f.name), createdAt: meta.createdAt, updatedAt: meta.updatedAt });
      setInfo(`created '${name}'`);
      setCreating(false);
      setNewName('');
      setNewFields([{ name: 'title', type: 'string' }]);
      pushRecent(`created NoSQL collection "${name}"`);
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  async function handleRename(name: string) {
    if (!activeId) return;
    const meta = await nosqlAdapter.getCollectionMeta(activeId);
    if (!meta) return;
    const next = { ...meta, name, updatedAt: Date.now() };
    await nosqlAdapter.upsertCollectionMeta(next);
    upsert({ id: next.id, name: next.name, fieldNames: next.fields.map((f) => f.name), createdAt: next.createdAt, updatedAt: next.updatedAt });
    setInfo(`renamed to '${name}'`);
  }

  async function handleDelete() {
    if (!activeId || !active) return;
    if (!confirm(`Delete NoSQL collection "${active.name}"? This cannot be undone.`)) return;
    try {
      setBusy(true);
      await nosqlAdapter.removeCollection(activeId);
      remove(activeId);
      setInfo(`deleted ${active.name}`);
      pushRecent(`deleted NoSQL collection "${active.name}"`);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function handleAddDoc() {
    if (!activeId || !active) return;
    const meta = await nosqlAdapter.getCollectionMeta(activeId);
    if (!meta) return;
    const doc: NosqlDoc = { id: uid('doc') };
    for (const f of meta.fields) {
      const raw = prompt(`Enter value for ${f.name} (${f.type})`, defaultFor(f.type));
      if (raw === null) return;
      doc[f.name] = coerce(raw, f.type);
    }
    try {
      await nosqlAdapter.insertDocs(activeId, [doc]);
      const docs2 = await nosqlAdapter.listDocs(activeId, { limit: 50 });
      setDocs(docs2);
      setInfo(`added document ${doc.id}`);
      pushRecent(`added doc to "${active.name}"`);
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div className="section-body">
      <div className="section-header">
        <h1>NoSQL Manager</h1>
        <span className="fkey">F3</span>
        <span style={{ flex: 1 }} />
      </div>
      <div className="split section-content" style={{ padding: 0 }}>
        <div className="list-pane">
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <button className="btn-primary" onClick={() => setCreating(true)}>+ New Collection</button>
          </div>
          {collections.length === 0 && <div style={{ padding: 12, color: 'var(--fg-muted)' }}>no NoSQL collections yet</div>}
          {collections.map((c) => (
            <div key={c.id} className={'item' + (c.id === activeId ? ' active' : '')} onClick={() => setActive(c.id)}>
              <div>{c.name}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{c.fieldNames.length} fields · {new Date(c.updatedAt).toLocaleDateString()}</div>
            </div>
          ))}
          {creating && (
            <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
              <label htmlFor="nosql-newName">name</label>
              <input id="nosql-newName" name="newName" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="my-collection" style={{ width: '100%' }} />
              <div style={{ marginTop: 6 }}>fields</div>
              {newFields.map((f, i) => (
                <div key={i} className="btn-row" style={{ marginTop: 4 }}>
                  <input
                    id={`nosql-field-name-${i}`}
                    name={`field-name-${i}`}
                    aria-label={`field name ${i + 1}`}
                    value={f.name}
                    onChange={(e) => setNewFields((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <select
                    id={`nosql-field-type-${i}`}
                    name={`field-type-${i}`}
                    aria-label={`field type ${i + 1}`}
                    value={f.type}
                    onChange={(e) => setNewFields((arr) => arr.map((x, j) => (j === i ? { ...x, type: e.target.value as NosqlFieldDef['type'] } : x)))}
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                    <option value="date">date</option>
                    <option value="json">json</option>
                  </select>
                  <button onClick={() => setNewFields((arr) => arr.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <div className="btn-row" style={{ marginTop: 4 }}>
                <button onClick={() => setNewFields((arr) => [...arr, { name: '', type: 'string' }])}>+ field</button>
              </div>
              <div className="btn-row" style={{ marginTop: 6 }}>
                <button className="btn-primary" disabled={busy} onClick={handleCreate}>create</button>
                <button onClick={() => setCreating(false)}>cancel</button>
              </div>
            </div>
          )}
        </div>
        <div className="detail-pane">
          {!active && <div style={{ color: 'var(--fg-muted)' }}>← select or create a NoSQL collection</div>}
          {active && (
            <>
              <div style={{ marginBottom: 8 }}>
                <strong style={{ color: 'var(--accent)' }}>{active.name}</strong>{' '}
                <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>· {active.fieldNames.length} fields</span>
              </div>
              {error && <div className="banner danger">{error}</div>}
              {info && <div className="banner ok">{info}</div>}
              <div className="tabs">
                <button className={tab === 'fields' ? 'active' : ''} onClick={() => setTab('fields')}>Fields</button>
                <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}>Data</button>
              </div>
              <div className="tab-body">
                {busy && <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>busy…</div>}
                {tab === 'fields' && (
                  <FieldsTab collectionId={active.id} onMessage={setInfo} />
                )}
                {tab === 'data' && (
                  <div>
                    <div className="btn-row" style={{ marginBottom: 8 }}>
                      <button className="btn-primary" onClick={handleAddDoc}>+ add document</button>
                      <button className="btn-danger" onClick={handleDelete}>delete collection</button>
                    </div>
                    <pre style={{ background: 'var(--bg-elev)', padding: 10, overflow: 'auto', maxHeight: 360, border: '1px solid var(--border)' }}>
                      {docs && active.fieldNames.length
                        ? renderAsciiTable(['id', ...active.fieldNames], docs.map((d) => [d.id, ...active.fieldNames.map((f) => d[f])]))
                        : '(empty)'}
                    </pre>
                  </div>
                )}
                <hr className="ascii" />
                <div className="btn-row">
                  <button onClick={() => {
                    const newName = prompt('rename to', active.name);
                    if (newName) handleRename(newName);
                  }}>rename</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldsTab({ collectionId, onMessage }: { collectionId: string; onMessage: (s: string | null) => void }) {
  const [meta, setMeta] = useState<CollectionMetaRecord | null>(null);
  useEffect(() => {
    nosqlAdapter.getCollectionMeta(collectionId).then((m) => setMeta(m ?? null));
  }, [collectionId]);
  async function addField() {
    const name = prompt('field name?');
    if (!name || !meta) return;
    const type = (prompt('type? (string | number | boolean | date | json)', 'string') || 'string') as NosqlFieldDef['type'];
    const next = { ...meta, fields: [...meta.fields, { name, type }], updatedAt: Date.now() };
    await nosqlAdapter.upsertCollectionMeta(next);
    setMeta(next);
    onMessage(`added field ${name}`);
    useAppStore.getState().upsertNosql({
      id: meta.id, name: meta.name, fieldNames: next.fields.map((f) => f.name), createdAt: meta.createdAt, updatedAt: next.updatedAt,
    });
  }
  async function removeField(idx: number) {
    if (!meta) return;
    const next = { ...meta, fields: meta.fields.filter((_, i) => i !== idx), updatedAt: Date.now() };
    await nosqlAdapter.upsertCollectionMeta(next);
    setMeta(next);
    useAppStore.getState().upsertNosql({
      id: meta.id, name: meta.name, fieldNames: next.fields.map((f) => f.name), createdAt: meta.createdAt, updatedAt: next.updatedAt,
    });
  }
  if (!meta) return <div style={{ color: 'var(--fg-muted)' }}>no schema</div>;
  return (
    <div>
      <button className="btn-primary" onClick={addField}>+ add field</button>
      <table className="ascii" style={{ marginTop: 8 }}>
        <thead><tr><th>#</th><th>name</th><th>type</th><th></th></tr></thead>
        <tbody>
          {meta.fields.map((f, i) => (
            <tr key={`${f.name}-${i}`}>
              <td>{i}</td>
              <td>{f.name}</td>
              <td>{f.type}</td>
              <td><button onClick={() => removeField(i)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function defaultFor(t: NosqlFieldDef['type']): string {
  if (t === 'number') return '0';
  if (t === 'boolean') return 'false';
  if (t === 'date') return new Date().toISOString().slice(0, 10);
  if (t === 'json') return '{}';
  return '';
}

function coerce(raw: string, t: NosqlFieldDef['type']): unknown {
  if (t === 'number') {
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  }
  if (t === 'boolean') return /^true$/i.test(raw);
  if (t === 'date') return raw;
  if (t === 'json') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}
