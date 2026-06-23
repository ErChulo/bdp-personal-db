import { useEffect, useRef, useState } from 'react';
import { StatusBar } from './shell/StatusBar';
import { KeyboardNav } from './shell/KeyboardNav';
import { CommandPalette } from './shell/CommandPalette';
import { AppNavigation, WorkspaceToolbar } from './shell/AppNavigation';
import { useAppStore, applyChrome } from './shell/store';
import { sqlStore } from './adapters/sqlStore';
import { nosqlAdapter } from './adapters/nosqlAdapter';
import { startWorkspaceLease } from './workspace/lease';
import { setupUpdateListeners } from './workspace/update';
import { Dashboard } from './sections/Dashboard';
import { SqlManager } from './sections/SqlManager';
import { NosqlManager } from './sections/NosqlManager';
import { Query } from './sections/Query';
import { ImportPanel } from './sections/ImportPanel';
import { ExportPanel } from './sections/ExportPanel';
import { Reports } from './sections/Reports';
import { KeyGen } from './sections/KeyGen';
import { SearchPanel } from './sections/SearchPanel';
import { Backup } from './sections/Backup';
import { SchemaDiff } from './sections/SchemaDiff';

export function App() {
  const [ready, setReady] = useState(false);
  const leaseCleanup = useRef<null | (() => void)>(null);
  const section = useAppStore((s) => s.section);
  const theme = useAppStore((s) => s.theme);
  const layout = useAppStore((s) => s.layout);
  const setOwnership = useAppStore((s) => s.setOwnership);
  const setUpdateState = useAppStore((s) => s.setUpdateState);

  useEffect(() => {
    applyChrome(theme, layout);
  }, [theme, layout]);

  useEffect(() => {
    const stop = setupUpdateListeners(setUpdateState);
    return stop;
  }, [setUpdateState]);

  useEffect(() => {
    leaseCleanup.current = startWorkspaceLease(setOwnership);
    return () => {
      leaseCleanup.current?.();
      leaseCleanup.current = null;
    };
  }, [setOwnership]);

  // Hydrate the SQL/NoSQL handle lists on app start so DBs persist across reloads.
  useEffect(() => {
    let cancelled = false;
    const startedAt = performance.now();
    (async () => {
      try {
        const sqlList = await sqlStore.listAll();
        const sqlSet = useAppStore.getState().setActiveSqlDb;
        const sqlUpsert = useAppStore.getState().upsertSqlDb;
        const persistedSqlId = useAppStore.getState().activeSqlDbId;
        if (cancelled) return;
        for (const meta of sqlList) sqlUpsert({ id: meta.id, name: meta.name, createdAt: meta.createdAt, updatedAt: meta.updatedAt });
        if (persistedSqlId && sqlList.some((db) => db.id === persistedSqlId)) {
          sqlSet(persistedSqlId);
        } else {
          sqlSet(sqlList[0]?.id ?? null);
          if (!sqlList[0]) useAppStore.getState().setActiveSqlTable(null);
        }

        const cols = await nosqlAdapter.listCollectionsMeta();
        const persistedNosqlId = useAppStore.getState().activeNosqlId;
        if (cancelled) return;
        for (const c of cols) {
          useAppStore.getState().upsertNosql({
            id: c.id,
            name: c.name,
            fieldNames: c.fields.map((f) => f.name),
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          });
        }
        if (persistedNosqlId && cols.some((c) => c.id === persistedNosqlId)) {
          useAppStore.getState().setActiveNosql(persistedNosqlId);
        } else {
          useAppStore.getState().setActiveNosql(cols[0]?.id ?? null);
        }
      } catch {
        // non-fatal — the app still works without handles; users can re-import
      } finally {
        // Avoid a one-frame flash while keeping real initialization visible.
        const remaining = Math.max(0, 420 - (performance.now() - startedAt));
        await new Promise((resolve) => setTimeout(resolve, remaining));
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="app" aria-busy={!ready}>
      {!ready && <StartupOverlay />}
      <StatusBar />
      <div className="workspace-shell">
        <AppNavigation />
        <div className="workspace-stage">
          <WorkspaceToolbar />
          <main className="workspace-content">
            <KeyboardNav>
              {section === 'dashboard' && <Dashboard />}
              {section === 'sql' && <SqlManager />}
              {section === 'nosql' && <NosqlManager />}
              {section === 'query' && <Query />}
              {section === 'import' && <ImportPanel />}
              {section === 'export' && <ExportPanel />}
              {section === 'reports' && <Reports />}
              {section === 'keygen' && <KeyGen />}
              {section === 'search' && <SearchPanel />}
              {section === 'backup' && <Backup />}
              {section === 'schemaDiff' && <SchemaDiff />}
            </KeyboardNav>
          </main>
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}

function StartupOverlay() {
  return (
    <div className="startup-overlay" role="status" aria-live="polite">
      <div className="startup-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="startup-copy">
        <strong>BDP</strong>
        <span>CONNECTING TO LOCAL WORKSPACE</span>
      </div>
    </div>
  );
}
