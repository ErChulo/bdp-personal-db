import { useEffect } from 'react';
import { useAppStore } from './store';

export function StatusBar() {
  const section = useAppStore((s) => s.section);
  const sqlDbs = useAppStore((s) => s.sqlDbs);
  const nosql = useAppStore((s) => s.nosqlCollections);
  const activeSqlId = useAppStore((s) => s.activeSqlDbId);
  const activeNosqlId = useAppStore((s) => s.activeNosqlId);
  const estimate = useAppStore((s) => s.storageEstimate);
  const setEstimate = useAppStore((s) => s.setStorageEstimate);

  useEffect(() => {
    if (!navigator.storage || !navigator.storage.estimate) return;
    const update = async () => {
      try {
        const e = await navigator.storage.estimate();
        setEstimate({
          usageMB: Math.round(((e.usage ?? 0) / 1024 / 1024) * 100) / 100,
          quotaMB: Math.round(((e.quota ?? 0) / 1024 / 1024) * 100) / 100,
        });
      } catch {
        /* ignore */
      }
    };
    update();
    const id = setInterval(update, 8000);
    return () => clearInterval(id);
  }, [setEstimate]);

  const activeSqlName = sqlDbs.find((d) => d.id === activeSqlId)?.name ?? '—';
  const activeNosqlName = nosql.find((c) => c.id === activeNosqlId)?.name ?? '—';
  const used = estimate ? Math.min(100, Math.round((estimate.usageMB / Math.max(1, estimate.quotaMB)) * 100)) : 0;

  return (
    <div className="status-bar" role="status" aria-live="polite">
      <span className="brand">◉ BDP</span>
      <span className="pill online">ONLINE</span>
      <span>
        § <span style={{ color: 'var(--fg)' }}>{section}</span>
      </span>
      <span>
        SQL: <span style={{ color: 'var(--accent)' }}>{sqlDbs.length}</span> ({activeSqlName})
      </span>
      <span>
        NoSQL: <span style={{ color: 'var(--accent)' }}>{nosql.length}</span> ({activeNosqlName})
      </span>
      <span className="grow" />
      {estimate && (
        <span>
          IDB {estimate.usageMB} / {estimate.quotaMB} MB ({used}%)
        </span>
      )}
      <span style={{ color: 'var(--fg-muted)' }}>v0.1</span>
    </div>
  );
}
