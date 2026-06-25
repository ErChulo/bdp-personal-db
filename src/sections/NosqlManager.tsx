import { useEffect, useState, type KeyboardEvent } from 'react';
import { useAppStore } from '../shell/store';
import { nosqlAdapter, type CollectionMetaRecord } from '../adapters/nosqlAdapter';
import type { NosqlFieldDef, NosqlDoc } from '../utils/schema';
import { uid } from '../utils/schema';
import { SectionStateBanner } from './SectionState';
import { CodeEditor } from '../components/CodeEditor';

type Tab = 'fields' | 'data' | 'jobs';

const DEFAULT_JOB_CODE = `// Return an array of matching docs.
// Example:
// return docs.filter((doc) => String(doc.name ?? '').toLowerCase().includes('a')).slice(0, 100);
return docs;`;

const JOB_DRILLS = [
  {
    name: 'Prefix filter',
    code: `return docs.filter((doc) => String(doc.name ?? '').toLowerCase().startsWith('a'));`,
  },
  {
    name: 'Project fields',
    code: `return docs.map((doc) => ({ id: doc.id, name: doc.name ?? '', status: doc.status ?? 'n/a' }));`,
  },
  {
    name: 'Count by bucket',
    code: `const counts = new Map();\nfor (const doc of docs) {\n  const bucket = String(doc.status ?? 'unknown');\n  counts.set(bucket, (counts.get(bucket) ?? 0) + 1);\n}\nreturn [...counts.entries()].map(([status, count]) => ({ id: status, status, count }));`,
  },
] as const;

export function NosqlManager() {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFields, setNewFields] = useState<NosqlFieldDef[]>([{ name: 'title', type: 'string' }]);
  const [tab, setTab] = useState<Tab>('fields');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [docs, setDocs] = useState<NosqlDoc[] | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [jobCode, setJobCode] = useState(DEFAULT_JOB_CODE);
  const [jobBusy, setJobBusy] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobInfo, setJobInfo] = useState<string | null>(null);
  const [jobRows, setJobRows] = useState<NosqlDoc[] | null>(null);
  const [jobColumns, setJobColumns] = useState<string[]>([]);
  const [jobTotal, setJobTotal] = useState(0);
  const [activeMeta, setActiveMeta] = useState<CollectionMetaRecord | null>(null);
  const [lookupField, setLookupField] = useState('');
  const [lookupMode, setLookupMode] = useState<'equals' | 'startsWith'>('equals');
  const [lookupValue, setLookupValue] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupInfo, setLookupInfo] = useState<string | null>(null);
  const [lookupRows, setLookupRows] = useState<NosqlDoc[] | null>(null);
  const [lookupColumns, setLookupColumns] = useState<string[]>([]);
  const collections = useAppStore((s) => s.nosqlCollections);
  const activeId = useAppStore((s) => s.activeNosqlId);
  const ownership = useAppStore((s) => s.ownership);
  const setActive = useAppStore((s) => s.setActiveNosql);
  const upsert = useAppStore((s) => s.upsertNosql);
  const remove = useAppStore((s) => s.removeNosql);
  const pushRecent = useAppStore((s) => s.pushRecent);
  const beginOperation = useAppStore((s) => s.beginOperation);
  const endOperation = useAppStore((s) => s.endOperation);

  const active = collections.find((c) => c.id === activeId);
  const canWrite = ownership.status === 'writable';
  const stateTone: 'loading' | 'empty' | 'success' | 'error' | 'info' =
    error ? 'error' :
    busy ? 'loading' :
    !active ? 'empty' :
    docs === null ? 'loading' :
    docs.length > 0 ? 'success' : 'empty';
  const stateMessage = error
    ? error
    : busy
      ? active ? `Loading "${active.name}"…` : 'Select or create a NoSQL collection.'
      : !active
        ? 'Select or create a NoSQL collection.'
        : docs === null
          ? `Loading documents from "${active.name}"…`
          : docs.length > 0
            ? `Loaded ${docs.length} document${docs.length === 1 ? '' : 's'} from "${active.name}".`
            : `Collection "${active.name}" is empty.`;

  useEffect(() => {
    if (!activeId) { setDocs(null); setSelectedDocId(null); setBusy(false); return; }
    setBusy(true); setError(null);
    setDocs(null);
    nosqlAdapter.listDocs(activeId, { limit: 50 })
      .then((rows) => {
        setDocs(rows);
        setSelectedDocId((current) => rows.some((d) => d.id === current) ? current : rows[0]?.id ?? null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }, [activeId]);

  useEffect(() => {
    if (!activeId) {
      setActiveMeta(null);
      return;
    }
    nosqlAdapter.getCollectionMeta(activeId)
      .then((meta) => {
        setActiveMeta(meta ?? null);
        setLookupField((current) => current && (meta?.fields.some((f) => f.name === current) ?? false)
          ? current
          : meta?.fields[0]?.name ?? '');
      })
      .catch(() => setActiveMeta(null));
  }, [activeId]);

  useEffect(() => {
    setJobRows(null);
    setJobColumns([]);
    setJobTotal(0);
    setJobError(null);
    setJobInfo(null);
    setLookupRows(null);
    setLookupColumns([]);
    setLookupError(null);
    setLookupInfo(null);
  }, [activeId]);

  async function handleCreate() {
    if (!canWrite) return setError('This tab is read-only. Take over write access before creating a collection.');
    const name = newName.trim();
    if (!name) return setError('name is required');
    try {
      setBusy(true);
      beginOperation('mutation');
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
      endOperation('mutation');
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      endOperation('mutation', message);
    } finally { setBusy(false); }
  }

  async function handleRename(name: string) {
    if (!activeId) return;
    if (!canWrite) return setError('This tab is read-only. Take over write access before renaming a collection.');
    beginOperation('mutation');
    const meta = await nosqlAdapter.getCollectionMeta(activeId);
    if (!meta) { endOperation('mutation'); return; }
    const next = { ...meta, name, updatedAt: Date.now() };
    try {
      await nosqlAdapter.upsertCollectionMeta(next);
      upsert({ id: next.id, name: next.name, fieldNames: next.fields.map((f) => f.name), createdAt: next.createdAt, updatedAt: next.updatedAt });
      setInfo(`renamed to '${name}'`);
      endOperation('mutation');
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      endOperation('mutation', message);
    }
  }

  async function handleDelete() {
    if (!activeId || !active) return;
    if (!canWrite) return setError('This tab is read-only. Take over write access before deleting a collection.');
    if (!confirm(`Delete NoSQL collection "${active.name}"? This cannot be undone.`)) return;
    try {
      setBusy(true);
      beginOperation('mutation');
      await nosqlAdapter.removeCollection(activeId);
      remove(activeId);
      setInfo(`deleted ${active.name}`);
      pushRecent(`deleted NoSQL collection "${active.name}"`);
      endOperation('mutation');
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      endOperation('mutation', message);
    }
    finally { setBusy(false); }
  }

  async function handleAddDoc() {
    if (!activeId || !active) return;
    if (!canWrite) return setError('This tab is read-only. Take over write access before adding documents.');
    const meta = await nosqlAdapter.getCollectionMeta(activeId);
    if (!meta) return;
    const doc: NosqlDoc = { id: uid('doc') };
    for (const f of meta.fields) {
      const raw = prompt(`Enter value for ${f.name} (${f.type})`, defaultFor(f.type));
      if (raw === null) return;
      doc[f.name] = coerce(raw, f.type);
    }
    try {
      beginOperation('mutation');
      await nosqlAdapter.insertDocs(activeId, [doc]);
      const docs2 = await nosqlAdapter.listDocs(activeId, { limit: 50 });
      setDocs(docs2);
      setInfo(`added document ${doc.id}`);
      pushRecent(`added doc to "${active.name}"`);
      endOperation('mutation');
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      endOperation('mutation', message);
    }
  }

  async function handleEditDoc(doc: NosqlDoc) {
    if (!activeId || !active) return;
    if (!canWrite) return setError('This tab is read-only. Take over write access before editing documents.');
    const meta = await nosqlAdapter.getCollectionMeta(activeId);
    if (!meta) return;
    const next: NosqlDoc = { id: doc.id };
    for (const f of meta.fields) {
      const current = doc[f.name];
      const raw = prompt(`Edit ${f.name} (${f.type})`, formatForPrompt(current, f.type));
      if (raw === null) return;
      next[f.name] = coerce(raw, f.type);
    }
    try {
      beginOperation('mutation');
      await nosqlAdapter.insertDocs(activeId, [next]);
      const docs2 = await nosqlAdapter.listDocs(activeId, { limit: 50 });
      setDocs(docs2);
      setSelectedDocId(next.id);
      setInfo(`updated document ${doc.id}`);
      pushRecent(`updated doc ${doc.id} in "${active.name}"`);
      endOperation('mutation');
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      endOperation('mutation', message);
    }
  }

  async function handleDeleteDoc(doc: NosqlDoc) {
    if (!activeId || !active) return;
    if (!canWrite) return setError('This tab is read-only. Take over write access before deleting documents.');
    if (!confirm(`Delete document "${doc.id}" from "${active.name}"?`)) return;
    try {
      beginOperation('mutation');
      await nosqlAdapter.deleteDoc(activeId, doc.id);
      const docs2 = await nosqlAdapter.listDocs(activeId, { limit: 50 });
      setDocs(docs2);
      setSelectedDocId((current) => (current === doc.id ? docs2[0]?.id ?? null : current));
      setInfo(`deleted document ${doc.id}`);
      pushRecent(`deleted doc ${doc.id} from "${active.name}"`);
      endOperation('mutation');
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      endOperation('mutation', message);
    }
  }

  async function handleRunJob() {
    if (!activeId || !active) return;
    setJobBusy(true);
    setJobError(null);
    setJobInfo('running job…');
    beginOperation('query');
    let operationError: string | undefined;
    try {
      const snapshot = await nosqlAdapter.listDocs(activeId);
      const { rows, total } = await runNosqlJob(snapshot, active, jobCode);
      const columns = deriveJobColumns(rows, active.fieldNames);
      setJobRows(rows);
      setJobColumns(columns);
      setJobTotal(total);
      setJobInfo(`${total} document${total === 1 ? '' : 's'} matched`);
    } catch (err) {
      operationError = (err as Error).message;
      setJobError(operationError);
      setJobInfo(null);
    } finally {
      endOperation('query', operationError);
      setJobBusy(false);
    }
  }

  function onJobKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleRunJob();
    }
  }

  async function handleUpdateIndexes(field: string, enable: boolean) {
    if (!activeId || !active) return;
    if (!canWrite) return setError('This tab is read-only. Take over write access before changing indexes.');
    beginOperation('mutation');
    try {
      const meta = await nosqlAdapter.getCollectionMeta(activeId);
      if (!meta) return;
      const next = enable
        ? [...new Set([...meta.indexes, field])]
        : meta.indexes.filter((entry) => entry !== field);
      await nosqlAdapter.setCollectionIndexes(activeId, next);
      const refreshed = await nosqlAdapter.getCollectionMeta(activeId);
      setActiveMeta(refreshed ?? null);
      setInfo(enable ? `indexed ${field}` : `removed index ${field}`);
      endOperation('mutation');
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      endOperation('mutation', message);
    }
  }

  async function handleIndexedLookup() {
    if (!activeId || !active) return;
    if (!lookupField) return setLookupError('Select a field first.');
    setLookupBusy(true);
    setLookupError(null);
    setLookupInfo('running indexed lookup…');
    beginOperation('query');
    let operationError: string | undefined;
    try {
      const rows = await nosqlAdapter.queryDocs(activeId, {
        field: lookupField,
        equals: lookupMode === 'equals' ? lookupValue : undefined,
        startsWith: lookupMode === 'startsWith' ? lookupValue : undefined,
        limit: 200,
      });
      setLookupRows(rows);
      setLookupColumns(deriveJobColumns(rows, active?.fieldNames ?? []));
      setLookupInfo(`${rows.length} document${rows.length === 1 ? '' : 's'} matched`);
    } catch (err) {
      operationError = (err as Error).message;
      setLookupError(operationError);
      setLookupInfo(null);
    } finally {
      endOperation('query', operationError);
      setLookupBusy(false);
    }
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
            <button className="btn-primary" onClick={() => setCreating(true)} disabled={!canWrite}>+ New Collection</button>
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
                  <button disabled={!canWrite} onClick={() => setNewFields((arr) => arr.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <div className="btn-row" style={{ marginTop: 4 }}>
                <button disabled={!canWrite} onClick={() => setNewFields((arr) => [...arr, { name: '', type: 'string' }])}>+ field</button>
              </div>
              <div className="btn-row" style={{ marginTop: 6 }}>
                <button className="btn-primary" disabled={busy || !canWrite} onClick={handleCreate}>create</button>
                <button onClick={() => setCreating(false)}>cancel</button>
              </div>
            </div>
          )}
        </div>
        <div className="detail-pane">
          <SectionStateBanner tone={stateTone}>{stateMessage}</SectionStateBanner>
          {info && <div className="banner ok">{info}</div>}
          {!active && <div style={{ color: 'var(--fg-muted)' }}>← select or create a NoSQL collection</div>}
          {active && (
            <>
              <div style={{ marginBottom: 8 }}>
                <strong style={{ color: 'var(--accent)' }}>{active.name}</strong>{' '}
                <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>· {active.fieldNames.length} fields</span>
              </div>
              <div className="tabs">
                <button className={tab === 'fields' ? 'active' : ''} onClick={() => setTab('fields')}>Fields</button>
                <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}>Data</button>
                <button className={tab === 'jobs' ? 'active' : ''} onClick={() => setTab('jobs')}>Jobs</button>
              </div>
              <div className="tab-body">
                {busy && <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>busy…</div>}
                {tab === 'fields' && (
                  <FieldsTab collectionId={active.id} onMessage={setInfo} canWrite={canWrite} onRefreshMeta={() => {
                    nosqlAdapter.getCollectionMeta(active.id).then((meta) => setActiveMeta(meta ?? null)).catch(() => setActiveMeta(null));
                  }} />
                )}
                {tab === 'data' && (
                  <div>
                    <div className="btn-row" style={{ marginBottom: 8 }}>
                      <button className="btn-primary" disabled={!canWrite || busy} onClick={handleAddDoc}>+ add document</button>
                      <button className="btn-danger" disabled={!canWrite || busy} onClick={handleDelete}>delete collection</button>
                    </div>
                    {docs === null ? (
                      <div style={{ color: 'var(--fg-muted)' }}>loading documents…</div>
                    ) : docs.length && active.fieldNames.length ? (
                      <table className="ascii" style={{ width: '100%', background: 'var(--bg-elev)', border: '1px solid var(--border)' }}>
                        <thead>
                          <tr>
                            <th>id</th>
                            {active.fieldNames.map((f) => <th key={f}>{f}</th>)}
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {docs.map((doc) => (
                            <tr key={doc.id} data-selected={selectedDocId === doc.id ? 'true' : 'false'}>
                              <td>{doc.id}</td>
                              {active.fieldNames.map((f) => <td key={f}>{formatCell(doc[f])}</td>)}
                              <td>
                                <div className="btn-row">
                                  <button disabled={!canWrite || busy} onClick={() => { setSelectedDocId(doc.id); void handleEditDoc(doc); }}>edit</button>
                                  <button className="btn-danger" disabled={!canWrite || busy} onClick={() => void handleDeleteDoc(doc)}>delete</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : <div style={{ color: 'var(--fg-muted)' }}>(empty collection)</div>}
                  </div>
                )}
                {tab === 'jobs' && (
                  <div>
                    <div style={{ color: 'var(--fg-muted)', fontSize: 12, marginBottom: 8 }}>
                      Pure JS query jobs run in a worker over a local snapshot. Indexed lookups use Dexie-backed field indexes for fast equality and prefix queries.
                    </div>
                    {jobError && <SectionStateBanner tone="error">{jobError}</SectionStateBanner>}
                    {jobInfo && !jobError && <SectionStateBanner tone={jobBusy ? 'loading' : jobRows?.length ? 'success' : 'info'}>{jobInfo}</SectionStateBanner>}
                    <div style={{ marginBottom: 12, padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elev)' }}>
                      <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--fg-muted)' }}>Indexed lookup helper</div>
                      <div className="btn-row">
                        <select id="nosql-lookup-field" name="lookupField" aria-label="Indexed field" value={lookupField} onChange={(e) => setLookupField(e.target.value)}>
                          {(activeMeta?.fields ?? active.fieldNames.map((name) => ({ name } as NosqlFieldDef))).map((field) => (
                            <option key={field.name} value={field.name}>{field.name}</option>
                          ))}
                        </select>
                        <select id="nosql-lookup-mode" name="lookupMode" aria-label="Lookup mode" value={lookupMode} onChange={(e) => setLookupMode(e.target.value as 'equals' | 'startsWith')}>
                          <option value="equals">equals</option>
                          <option value="startsWith">starts with</option>
                        </select>
                        <input
                          id="nosql-lookup-value"
                          name="lookupValue"
                          aria-label="Lookup value"
                          value={lookupValue}
                          onChange={(e) => setLookupValue(e.target.value)}
                          placeholder="Ada"
                        />
                        <button className="btn-primary" disabled={lookupBusy} onClick={() => void handleIndexedLookup()}>
                          {lookupBusy ? 'running…' : 'lookup'}
                        </button>
                        <button
                          disabled={!lookupField || lookupBusy || !(activeMeta?.indexes.includes(lookupField) ?? false)}
                          onClick={() => void handleUpdateIndexes(lookupField, false)}
                        >
                          remove index
                        </button>
                        <button
                          className="btn-primary"
                          disabled={!lookupField || lookupBusy || (activeMeta?.indexes.includes(lookupField) ?? false)}
                          onClick={() => void handleUpdateIndexes(lookupField, true)}
                        >
                          + index field
                        </button>
                      </div>
                      <div style={{ marginTop: 6, color: 'var(--fg-muted)', fontSize: 12 }}>
                        Indexed fields: {activeMeta?.indexes.length ? activeMeta.indexes.join(', ') : 'none'}
                      </div>
                    </div>
                    {lookupError && <SectionStateBanner tone="error">{lookupError}</SectionStateBanner>}
                    {lookupInfo && !lookupError && <SectionStateBanner tone={lookupBusy ? 'loading' : lookupRows?.length ? 'success' : 'info'}>{lookupInfo}</SectionStateBanner>}
                    {lookupRows && lookupColumns.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <table className="ascii" style={{ width: '100%', background: 'var(--bg-elev)', border: '1px solid var(--border)' }}>
                          <thead>
                            <tr>
                              {lookupColumns.map((c) => <th key={c}>{c}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {lookupRows.map((row, idx) => (
                              <tr key={row.id ?? idx}>
                                {lookupColumns.map((c) => <td key={c}>{formatCell(row[c])}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <CodeEditor
                      id="nosql-job-code"
                      name="jobCode"
                      ariaLabel="NoSQL job editor"
                      value={jobCode}
                      onChange={setJobCode}
                      onKeyDown={onJobKeyDown}
                      language="js"
                      minHeight={180}
                      placeholder="return docs.filter((doc) => doc.name === 'Ada');"
                    />
                    <div className="btn-row" style={{ marginTop: 8 }}>
                      <button className="btn-primary" disabled={jobBusy} onClick={() => void handleRunJob()}>
                        {jobBusy ? 'running…' : 'run job'}
                      </button>
                    </div>
                    <div style={{ marginTop: 8, color: 'var(--fg-muted)', fontSize: 12 }}>
                      {jobTotal > 0 ? `${jobTotal} matched document${jobTotal === 1 ? '' : 's'}` : 'No results yet.'}
                    </div>
                    <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elev)' }}>
                      <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--fg-muted)' }}>Drills</div>
                      <div className="btn-row">
                        {JOB_DRILLS.map((drill) => (
                          <button key={drill.name} onClick={() => setJobCode(drill.code)}>{drill.name}</button>
                        ))}
                      </div>
                    </div>
                    {jobRows && jobColumns.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <table className="ascii" style={{ width: '100%', background: 'var(--bg-elev)', border: '1px solid var(--border)' }}>
                          <thead>
                            <tr>
                              {jobColumns.map((c) => <th key={c}>{c}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {jobRows.slice(0, 100).map((row, idx) => (
                              <tr key={row.id ?? idx}>
                                {jobColumns.map((c) => <td key={c}>{formatCell(row[c])}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
                <hr className="ascii" />
                <div className="btn-row">
                  <button disabled={!canWrite || busy} onClick={() => {
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

function FieldsTab({ collectionId, onMessage, canWrite, onRefreshMeta }: { collectionId: string; onMessage: (s: string | null) => void; canWrite: boolean; onRefreshMeta: () => void }) {
  const [meta, setMeta] = useState<CollectionMetaRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    nosqlAdapter.getCollectionMeta(collectionId)
      .then((m) => setMeta(m ?? null))
      .catch((err) => setLoadError((err as Error).message))
      .finally(() => setLoading(false));
  }, [collectionId]);
  async function addField() {
    const name = prompt('field name?');
    if (!name || !meta) return;
    const type = (prompt('type? (string | number | boolean | date | json)', 'string') || 'string') as NosqlFieldDef['type'];
    const next = { ...meta, fields: [...meta.fields, { name, type }], updatedAt: Date.now() };
    await nosqlAdapter.upsertCollectionMeta(next);
    await nosqlAdapter.rebuildCollectionIndexes(meta.id);
    setMeta(next);
    onMessage(`added field ${name}`);
    useAppStore.getState().upsertNosql({
      id: meta.id, name: meta.name, fieldNames: next.fields.map((f) => f.name), createdAt: meta.createdAt, updatedAt: next.updatedAt,
    });
    onRefreshMeta();
  }
  async function removeField(idx: number) {
    if (!meta) return;
    const nextFields = meta.fields.filter((_, i) => i !== idx);
    const next = {
      ...meta,
      fields: nextFields,
      indexes: meta.indexes.filter((field) => nextFields.some((def) => def.name === field)),
      updatedAt: Date.now(),
    };
    await nosqlAdapter.upsertCollectionMeta(next);
    await nosqlAdapter.rebuildCollectionIndexes(meta.id);
    setMeta(next);
    useAppStore.getState().upsertNosql({
      id: meta.id, name: meta.name, fieldNames: next.fields.map((f) => f.name), createdAt: meta.createdAt, updatedAt: next.updatedAt,
    });
    onRefreshMeta();
  }
  if (loading) return <div style={{ color: 'var(--fg-muted)' }}>loading schema…</div>;
  if (loadError) return <SectionStateBanner tone="error">{loadError}</SectionStateBanner>;
  if (!meta) return <div style={{ color: 'var(--fg-muted)' }}>no schema</div>;
  return (
    <div>
      <button className="btn-primary" disabled={!canWrite} onClick={addField}>+ add field</button>
      <table className="ascii" style={{ marginTop: 8 }}>
        <thead><tr><th>#</th><th>name</th><th>type</th><th></th></tr></thead>
        <tbody>
          {meta.fields.map((f, i) => (
            <tr key={`${f.name}-${i}`}>
              <td>{i}</td>
              <td>{f.name}</td>
              <td>{f.type}</td>
              <td><button disabled={!canWrite} onClick={() => removeField(i)}>×</button></td>
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

function formatForPrompt(value: unknown, t: NosqlFieldDef['type']): string {
  if (value === null || value === undefined) return defaultFor(t);
  if (t === 'json') {
    try { return JSON.stringify(value); } catch { return '{}'; }
  }
  return String(value);
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

function deriveJobColumns(rows: NosqlDoc[], preferred: string[]): string[] {
  const columns = new Set<string>(['id', ...preferred]);
  for (const row of rows) {
    for (const key of Object.keys(row)) columns.add(key);
  }
  return [...columns];
}

async function runNosqlJob(docs: NosqlDoc[], active: { id: string; name: string; fieldNames: string[] }, code: string): Promise<{ rows: NosqlDoc[]; total: number }> {
  return new Promise((resolve, reject) => {
    const worker = new NosqlJobWorker();
    const id = crypto.randomUUID();
    const cleanup = () => worker.terminate();
    const onMessage = (event: MessageEvent) => {
      if (event.data?.id !== id) return;
      worker.removeEventListener('message', onMessage);
      cleanup();
      if (event.data.ok) resolve({ rows: event.data.rows as NosqlDoc[], total: event.data.total as number });
      else reject(new Error(event.data.error || 'job failed'));
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({
      id,
      type: 'run',
      docs,
      code,
      meta: { collectionId: active.id, collectionName: active.name, fields: active.fieldNames },
    });
  });
}
import NosqlJobWorker from '../workers/nosqlJob.worker.ts?worker&inline';
