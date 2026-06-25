import { useEffect } from 'react';
import { useAppStore } from './store';
import { inspectOfflineReadiness, requestSkipWaiting } from '../workspace/update';
import { requestWorkspaceTakeover } from '../workspace/lease';

export function StatusBar({ onLockVault }: { onLockVault?: () => void }) {
  const section = useAppStore((s) => s.section);
  const sqlDbs = useAppStore((s) => s.sqlDbs);
  const nosql = useAppStore((s) => s.nosqlCollections);
  const activeSqlId = useAppStore((s) => s.activeSqlDbId);
  const activeNosqlId = useAppStore((s) => s.activeNosqlId);
  const estimate = useAppStore((s) => s.storageEstimate);
  const setEstimate = useAppStore((s) => s.setStorageEstimate);
  const setOwnership = useAppStore((s) => s.setOwnership);
  const ownership = useAppStore((s) => s.ownership);
  const updateState = useAppStore((s) => s.updateState);
  const offlineReadiness = useAppStore((s) => s.offlineReadiness);
  const setOfflineReadiness = useAppStore((s) => s.setOfflineReadiness);
  const operations = useAppStore((s) => s.operations);

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
  const canApplyUpdate = updateState.status !== 'reloading' && operations.activeCount === 0;

  function takeOver() {
    if (!confirm('Take over write access in this tab? Other open tabs become read-only for mutations.')) return;
    requestWorkspaceTakeover(setOwnership);
  }

  async function verifyOffline() {
    setOfflineReadiness(await inspectOfflineReadiness());
  }

  return (
    <div className="status-bar" role="status" aria-live="polite">
      <span className="brand">◉ BDP</span>
      <span className={`pill ${ownership.status === 'writable' ? 'online' : 'warn'}`}>
        {ownership.status === 'writable' ? 'WRITABLE' : 'READ-ONLY'}
      </span>
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
      {operations.activeCount > 0 && <span>busy {operations.activeCount}</span>}
      {operations.lastError && operations.activeCount === 0 && (
        <span title={operations.lastError} style={{ color: 'var(--danger)' }}>last error</span>
      )}
      {updateState.status !== 'current' && (
        <button
          className="pill"
          onClick={() => void requestSkipWaiting(updateState.buildId)}
          disabled={!canApplyUpdate}
          aria-label="Apply ready update"
        >
          update ready
        </button>
      )}
      <button
        className={`pill ${offlineReadiness.status === 'ready' || offlineReadiness.status === 'offline' ? 'online' : offlineReadiness.status === 'failed' ? 'danger' : 'offline'}`}
        onClick={() => void verifyOffline()}
        title={offlineReadiness.message ?? undefined}
        aria-label="Verify offline readiness"
      >
        {offlineReadiness.status === 'ready'
          ? 'offline ready'
          : offlineReadiness.status === 'offline'
            ? 'offline cache'
            : offlineReadiness.status === 'installing'
              ? 'offline installing'
              : offlineReadiness.status === 'unsupported'
                ? 'offline unsupported'
                : 'online only'}
      </button>
      {ownership.status !== 'writable' && (
        <button className="pill" onClick={takeOver} disabled={ownership.status === 'acquiring' || operations.activeCount > 0} title={ownership.message ?? undefined}>
          take over
        </button>
      )}
      {onLockVault && (
        <button className="pill" onClick={onLockVault} disabled={operations.activeCount > 0}>
          lock vault
        </button>
      )}
      {estimate && (
        <span>
          IDB {estimate.usageMB} / {estimate.quotaMB} MB ({used}%)
        </span>
      )}
      <span style={{ color: 'var(--fg-muted)' }}>v0.1</span>
    </div>
  );
}
