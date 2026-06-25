import { useEffect, useRef, useState } from 'react';
import { StatusBar } from './shell/StatusBar';
import { KeyboardNav } from './shell/KeyboardNav';
import { CommandPalette } from './shell/CommandPalette';
import { AppNavigation, WorkspaceToolbar } from './shell/AppNavigation';
import { useAppStore, applyChrome } from './shell/store';
import { VaultGate } from './sections/VaultGate';
import { inspectVault, lockVault, setupVault, unlockVault } from './security/vault';
import { migrateVaultData } from './security/vaultMigration';
import { clearVaultData } from './security/vaultReset';
import { sqlStore } from './adapters/sqlStore';
import { nosqlAdapter } from './adapters/nosqlAdapter';
import { startWorkspaceLease } from './workspace/lease';
import { setupOfflineReadinessListeners, setupUpdateListeners } from './workspace/update';
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
import coquiLogo from './assets/coqui-negro.jpg';
import type { ReactNode } from 'react';
import type { SectionId } from './shell/store';

export function App() {
  const [ready, setReady] = useState(false);
  const [mountedSections, setMountedSections] = useState<SectionId[]>(['dashboard']);
  const leaseCleanup = useRef<null | (() => void)>(null);
  const section = useAppStore((s) => s.section);
  const vault = useAppStore((s) => s.vault);
  const theme = useAppStore((s) => s.theme);
  const layout = useAppStore((s) => s.layout);
  const setOwnership = useAppStore((s) => s.setOwnership);
  const setUpdateState = useAppStore((s) => s.setUpdateState);
  const setOfflineReadiness = useAppStore((s) => s.setOfflineReadiness);
  const setVaultState = useAppStore((s) => s.setVaultState);

  useEffect(() => {
    applyChrome(theme, layout);
  }, [theme, layout]);

  useEffect(() => {
    const stop = setupUpdateListeners(setUpdateState);
    return stop;
  }, [setUpdateState]);

  useEffect(() => {
    const stop = setupOfflineReadinessListeners(setOfflineReadiness);
    return stop;
  }, [setOfflineReadiness]);

  useEffect(() => {
    leaseCleanup.current = startWorkspaceLease(setOwnership);
    return () => {
      leaseCleanup.current?.();
      leaseCleanup.current = null;
    };
  }, [setOwnership]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const phase = await inspectVault();
        if (cancelled) return;
        if (phase === 'setup') {
          clearWorkspaceState();
          setVaultState({ phase: 'setup', hasVault: false, message: 'Create a passphrase to secure this vault.' });
        } else {
          clearWorkspaceState();
          setVaultState({ phase: 'locked', hasVault: true, message: 'Enter your passphrase to unlock the vault.' });
        }
      } catch {
        if (!cancelled) {
          clearWorkspaceState();
          setVaultState({ phase: 'error', hasVault: false, message: 'Unable to read vault metadata.' });
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [setVaultState]);

  useEffect(() => {
    if (vault.phase !== 'unlocked') return;
    setMountedSections((state) => {
      if (state.includes(section)) return state;
      return [...state, section];
    });
  }, [section, vault.phase]);
  const visibleSections = mountedSections.includes(section)
    ? mountedSections
    : [...mountedSections, section];

  function clearWorkspaceState() {
    useAppStore.setState({
      sqlDbs: [],
      activeSqlTable: null,
      sqlManagerTab: 'schema',
      queryDraft: '',
      nosqlCollections: [],
      paletteOpen: false,
      paletteQuery: '',
      recent: [],
      queryHistory: [],
    });
  }

  async function hydrateWorkspaceData() {
    const sqlList = await sqlStore.listAll();
    const sqlSet = useAppStore.getState().setActiveSqlDb;
    const sqlUpsert = useAppStore.getState().upsertSqlDb;
    const persistedSqlId = useAppStore.getState().activeSqlDbId;
    for (const meta of sqlList) sqlUpsert({ id: meta.id, name: meta.name, createdAt: meta.createdAt, updatedAt: meta.updatedAt });
    if (persistedSqlId && sqlList.some((db) => db.id === persistedSqlId)) {
      sqlSet(persistedSqlId);
    } else {
      sqlSet(sqlList[0]?.id ?? null);
      if (!sqlList[0]) useAppStore.getState().setActiveSqlTable(null);
    }

    const cols = await nosqlAdapter.listCollectionsMeta();
    const persistedNosqlId = useAppStore.getState().activeNosqlId;
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
  }

  async function openVault(passphrase: string, setup: boolean) {
    if (setup) {
      await setupVault(passphrase);
    } else {
      await unlockVault(passphrase);
    }
    await migrateVaultData();
    clearWorkspaceState();
    await hydrateWorkspaceData();
    setVaultState({ phase: 'unlocked', hasVault: true, message: null });
    setReady(true);
  }

  async function handleSetupVault(passphrase: string) {
    await openVault(passphrase, true);
  }

  async function handleUnlockVault(passphrase: string) {
    await openVault(passphrase, false);
  }

  async function handleLockVault() {
    lockVault();
    clearWorkspaceState();
    setVaultState({
      phase: vault.hasVault ? 'locked' : 'setup',
      hasVault: vault.hasVault,
      message: vault.hasVault ? 'Vault locked.' : 'Create a passphrase to secure this vault.',
    });
  }

  async function handleResetVault() {
    await clearVaultData();
    clearWorkspaceState();
    setVaultState({ phase: 'setup', hasVault: false, message: 'Create a passphrase to secure this vault.' });
    setReady(true);
  }

  if (!ready || vault.phase === 'checking') {
    return (
      <div className="app" aria-busy="true">
        <StartupOverlay />
      </div>
    );
  }

  if (vault.phase !== 'unlocked') {
    return (
      <div className="app" aria-busy="true">
        <VaultGate
          mode={vault.phase === 'setup' ? 'setup' : 'locked'}
          message={vault.message}
          onSetup={handleSetupVault}
          onUnlock={handleUnlockVault}
          onReset={handleResetVault}
        />
      </div>
    );
  }

  return (
    <div className="app" aria-busy={!ready}>
      <StatusBar onLockVault={handleLockVault} />
      <div className="workspace-shell">
        <AppNavigation onLockVault={handleLockVault} />
        <div className="workspace-stage">
          <WorkspaceToolbar />
          <main className="workspace-content">
            <KeyboardNav>
              {visibleSections.map((id) => (
                <div
                  key={id}
                  className="workspace-panel"
                  hidden={section !== id}
                  aria-hidden={section !== id}
                >
                  {renderSection(id)}
                </div>
              ))}
            </KeyboardNav>
          </main>
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}

function renderSection(section: SectionId): ReactNode {
  switch (section) {
    case 'dashboard':
      return <Dashboard />;
    case 'sql':
      return <SqlManager />;
    case 'nosql':
      return <NosqlManager />;
    case 'query':
      return <Query />;
    case 'import':
      return <ImportPanel />;
    case 'export':
      return <ExportPanel />;
    case 'reports':
      return <Reports />;
    case 'keygen':
      return <KeyGen />;
    case 'search':
      return <SearchPanel />;
    case 'backup':
      return <Backup />;
    case 'schemaDiff':
      return <SchemaDiff />;
    default:
      return null;
  }
}

function StartupOverlay() {
  return (
    <div className="startup-overlay" role="status" aria-live="polite">
      <div className="startup-panel">
        <img src={coquiLogo} alt="" className="startup-logo" />
        <div className="startup-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="startup-copy">
          <strong>BDP</strong>
          <span>CONNECTING TO LOCAL WORKSPACE</span>
          <em>workspace is initializing</em>
          <small style={{ color: 'var(--fg-muted)', lineHeight: 1.4 }}>
            After the initial load, use the Dashboard or left navigation to reach SQL, NoSQL, Query, Import, Export, Reports, Search, Backup, Schema Diff, and Key Gen.
          </small>
        </div>
        <div className="startup-rail" aria-hidden="true" />
      </div>
    </div>
  );
}
