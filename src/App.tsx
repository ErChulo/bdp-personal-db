import { useEffect } from 'react';
import { StatusBar } from './shell/StatusBar';
import { KeyboardNav } from './shell/KeyboardNav';
import { CommandPalette } from './shell/CommandPalette';
import { useAppStore, applyChrome } from './shell/store';
import { sqlStore } from './adapters/sqlStore';
import { nosqlAdapter } from './adapters/nosqlAdapter';
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
  const section = useAppStore((s) => s.section);
  const theme = useAppStore((s) => s.theme);
  const layout = useAppStore((s) => s.layout);

  useEffect(() => {
    applyChrome(theme, layout);
  }, [theme, layout]);

  // Hydrate the SQL/NoSQL handle lists on app start so DBs persist across reloads.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sqlList = await sqlStore.listAll();
        const sqlSet = useAppStore.getState().setActiveSqlDb;
        const sqlUpsert = useAppStore.getState().upsertSqlDb;
        if (cancelled) return;
        for (const meta of sqlList) sqlUpsert({ id: meta.id, name: meta.name, createdAt: meta.createdAt, updatedAt: meta.updatedAt });
        if (sqlList[0]) sqlSet(sqlList[0].id);

        const cols = await nosqlAdapter.listCollectionsMeta();
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
        if (cols[0]) useAppStore.getState().setActiveNosql(cols[0].id);
      } catch {
        // non-fatal — the app still works without handles; users can re-import
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="app">
      <StatusBar />
      <main className="section-content" style={{ overflow: 'hidden' }}>
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
      <CommandPalette />
    </div>
  );
}
