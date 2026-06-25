import { useEffect, useState } from 'react';
import { uuidv4, uuidv7, uuidv1 } from '../keygen/uuid';
import { ulid } from '../keygen/ulid';
import { randomHexToken } from '../keygen/aes';
import { SectionStateBanner } from './SectionState';

type Kind = 'uuid-v4' | 'uuid-v7' | 'uuid-v1' | 'ulid' | 'hex' | 'aes';

export function KeyGen() {
  const [kind, setKind] = useState<Kind>('uuid-v7');
  const [count, setCount] = useState(10);
  const [hexBits, setHexBits] = useState(256);
  const [aesBits, setAesBits] = useState<128 | 192 | 256>(256);
  const [aesFormat, setAesFormat] = useState<'hex' | 'base64'>('hex');
  const [items, setItems] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const out: string[] = [];
      if (kind === 'uuid-v4') for (let i = 0; i < count; i++) out.push(uuidv4());
      if (kind === 'uuid-v7') for (let i = 0; i < count; i++) out.push(uuidv7());
      if (kind === 'uuid-v1') for (let i = 0; i < count; i++) out.push(uuidv1());
      if (kind === 'ulid') for (let i = 0; i < count; i++) out.push(ulid());
      if (kind === 'hex') for (let i = 0; i < count; i++) out.push(randomHexToken(hexBits));
      if (kind === 'aes') {
        // offload to worker so the key never sits in main thread memory long
        const results = await Promise.all(
          Array.from({ length: count }, () => generateAesInWorker(aesBits, aesFormat)),
        );
        for (const r of results) out.push(r);
      }
      setItems(out);
      setInfo(`generated ${out.length} ${kind} value${out.length === 1 ? '' : 's'}`);
    } catch (err) {
      setError((err as Error).message);
    }
    finally {
      setBusy(false);
    }
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(items.join('\n'));
      setError(null);
      setInfo('copied all to clipboard');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function downloadTxt() {
    const blob = new Blob([items.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${kind}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  useEffect(() => { setItems([]); setInfo(null); }, [kind]);
  useEffect(() => { setError(null); }, [kind]);
  const stateTone: 'loading' | 'empty' | 'success' | 'error' | 'info' =
    error ? 'error' :
    busy ? 'loading' :
    info ? 'success' :
    items.length ? 'success' : 'empty';
  const stateMessage = error
    ? error
    : busy
      ? 'Generating values…'
      : info
        ? info
        : items.length
          ? `${items.length} value${items.length === 1 ? '' : 's'} ready.`
          : 'Pick options and click generate.';

  return (
    <div className="section-body">
      <div className="section-header">
        <h1>Key Gen</h1>
        <span className="fkey">F8</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Nothing is persisted — purely transient — 1000 values max per batch.</span>
      </div>
      <div className="section-content">
        <SectionStateBanner tone={stateTone}>{stateMessage}</SectionStateBanner>
        <div className="btn-row">
          {(['uuid-v1', 'uuid-v4', 'uuid-v7', 'ulid', 'hex', 'aes'] as Kind[]).map((k) => (
            <button key={k} className={kind === k ? 'btn-primary' : ''} onClick={() => setKind(k)}>{labelOf(k)}</button>
          ))}
        </div>
        <div className="btn-row" style={{ marginTop: 10 }}>
          <label>count{' '}
            <input id="keygen-count" name="count" type="number" min={1} max={1000} value={count} onChange={(e) => setCount(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} style={{ width: 80 }} />
          </label>
          {kind === 'hex' && (
            <label>bits{' '}
              <select id="keygen-hexBits" name="hexBits" value={hexBits} onChange={(e) => setHexBits(Number(e.target.value))}>
                <option value={128}>128</option>
                <option value={192}>192</option>
                <option value={256}>256</option>
                <option value={512}>512</option>
              </select>
            </label>
          )}
          {kind === 'aes' && (
            <>
              <label>bits{' '}
                <select id="keygen-aesBits" name="aesBits" value={aesBits} onChange={(e) => setAesBits(Number(e.target.value) as 128 | 192 | 256)}>
                  <option value={128}>128</option>
                  <option value={192}>192</option>
                  <option value={256}>256</option>
                </select>
              </label>
              <label>format{' '}
                <select id="keygen-aesFormat" name="aesFormat" value={aesFormat} onChange={(e) => setAesFormat(e.target.value as 'hex' | 'base64')}>
                  <option value="hex">hex</option>
                  <option value="base64">base64</option>
                </select>
              </label>
            </>
          )}
          <button className="btn-primary" disabled={busy} onClick={() => void generate()}>{busy ? 'generating…' : 'generate'}</button>
          <button disabled={!items.length || busy} onClick={() => void copyAll()}>copy all</button>
          <button disabled={!items.length} onClick={downloadTxt}>download .txt</button>
        </div>
        <hr className="ascii" />
        <pre style={{
          background: 'var(--bg-elev)', padding: 10, overflow: 'auto', maxHeight: 360,
          border: '1px solid var(--border)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {items.length ? items.join('\n') : '(empty — pick options and click generate)'}
        </pre>
      </div>
    </div>
  );
}

function labelOf(k: Kind): string {
  if (k === 'uuid-v4') return 'UUID v4';
  if (k === 'uuid-v7') return 'UUID v7';
  if (k === 'uuid-v1') return 'UUID v1';
  if (k === 'ulid') return 'ULID';
  if (k === 'hex') return 'Hex';
  return 'AES';
}

function generateAesInWorker(bits: 128 | 192 | 256, format: 'hex' | 'base64'): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = new CryptoWorker();
    const id = crypto.randomUUID();
    const handler = (e: MessageEvent) => {
      if (e.data?.id !== id) return;
      w.removeEventListener('message', handler);
      w.terminate();
      if (e.data.ok) resolve(e.data.key);
      else reject(new Error(e.data.error));
    };
    w.addEventListener('message', handler);
    w.postMessage({ id, bits, format });
  });
}
import CryptoWorker from '../workers/crypto.worker.ts?worker&inline';
