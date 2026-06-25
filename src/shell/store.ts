import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { beginOperation, createInitialWorkspaceOperationState, endOperation } from '../workspace/operations';
import type {
  WorkspaceOperationKind,
  WorkspaceOperationState,
  OfflineReadinessState,
  WorkspaceOwnershipState,
  WorkspaceUpdateState,
} from '../workspace/types';
import type { VaultState } from '../security/vaultTypes';

export type SectionId =
  | 'dashboard'
  | 'sql'
  | 'nosql'
  | 'query'
  | 'import'
  | 'export'
  | 'reports'
  | 'keygen'
  | 'search'
  | 'backup'
  | 'schemaDiff';

export type ThemeId = 'mono' | 'amber' | 'green' | 'lilac';
export type LayoutId = 'standard' | 'compact' | 'focus';

export interface SqlDbHandle {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface NosqlCollectionHandle {
  id: string;
  name: string;
  fieldNames: string[];
  createdAt: number;
  updatedAt: number;
}

interface AppState {
  // sections
  section: SectionId;
  lastSection: SectionId;
  // SQL state
  sqlDbs: SqlDbHandle[];
  activeSqlDbId: string | null;
  activeSqlTable: string | null;
  sqlManagerTab: 'schema' | 'data' | 'indexes' | 'settings';
  queryDraft: string;
  // NoSQL state
  nosqlCollections: NosqlCollectionHandle[];
  activeNosqlId: string | null;
  // theme/layout
  theme: ThemeId;
  layout: LayoutId;
  // ui
  paletteOpen: boolean;
  paletteQuery: string;
  recent: { id: string; label: string; ts: number }[];
  queryHistory: { id: string; sql: string; ts: number; dbId: string | null }[];
  // quota display
  storageEstimate: { usageMB: number; quotaMB: number } | null;
  // workspace coordination
  ownership: WorkspaceOwnershipState;
  updateState: WorkspaceUpdateState;
  offlineReadiness: OfflineReadinessState;
  operations: WorkspaceOperationState;
  vault: VaultState;

  // setters
  setSection: (s: SectionId) => void;
  setActiveSqlDb: (id: string | null) => void;
  setActiveSqlTable: (table: string | null) => void;
  setSqlManagerTab: (tab: AppState['sqlManagerTab']) => void;
  setQueryDraft: (sql: string) => void;
  upsertSqlDb: (h: SqlDbHandle) => void;
  removeSqlDb: (id: string) => void;
  setActiveNosql: (id: string | null) => void;
  upsertNosql: (h: NosqlCollectionHandle) => void;
  removeNosql: (id: string) => void;
  setTheme: (t: ThemeId) => void;
  setLayout: (l: LayoutId) => void;
  setPaletteOpen: (b: boolean) => void;
  setPaletteQuery: (q: string) => void;
  pushRecent: (label: string) => void;
  pushQuery: (sql: string, dbId: string | null) => void;
  setStorageEstimate: (e: { usageMB: number; quotaMB: number } | null) => void;
  setOwnership: (state: WorkspaceOwnershipState) => void;
  setUpdateState: (state: WorkspaceUpdateState) => void;
  setOfflineReadiness: (state: OfflineReadinessState) => void;
  beginOperation: (kind: WorkspaceOperationKind) => void;
  endOperation: (kind: WorkspaceOperationKind, error?: string) => void;
  setVaultState: (state: VaultState) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      section: 'dashboard',
      lastSection: 'dashboard',
      sqlDbs: [],
      activeSqlDbId: null,
      activeSqlTable: null,
      sqlManagerTab: 'schema',
      queryDraft: 'SELECT name FROM sqlite_master WHERE type="table";',
      nosqlCollections: [],
      activeNosqlId: null,
      theme: 'mono',
      layout: 'standard',
      paletteOpen: false,
      paletteQuery: '',
      recent: [],
      queryHistory: [],
      storageEstimate: null,
      ownership: { status: 'acquiring', tabId: '', writerEpoch: 0, message: null },
      updateState: { status: 'current', buildId: null, message: null },
      offlineReadiness: {
        status: 'online-only',
        controlled: false,
        cached: false,
        online: typeof navigator === 'undefined' ? true : navigator.onLine,
        message: 'Offline cache is not verified yet',
      },
      operations: createInitialWorkspaceOperationState(),
      vault: { phase: 'checking', hasVault: false, message: null },

      setSection: (s) =>
        set((state) => ({
          lastSection: state.section,
          section: s,
        })),
      setActiveSqlDb: (id) => set({ activeSqlDbId: id }),
      setActiveSqlTable: (table) => set({ activeSqlTable: table }),
      setSqlManagerTab: (tab) => set({ sqlManagerTab: tab }),
      setQueryDraft: (sql) => set({ queryDraft: sql }),
      upsertSqlDb: (h) =>
        set((state) => {
          const next = state.sqlDbs.filter((d) => d.id !== h.id);
          next.push(h);
          next.sort((a, b) => a.name.localeCompare(b.name));
          return { sqlDbs: next, activeSqlDbId: h.id };
        }),
      removeSqlDb: (id) =>
        set((state) => ({
          sqlDbs: state.sqlDbs.filter((d) => d.id !== id),
          activeSqlDbId: state.activeSqlDbId === id ? null : state.activeSqlDbId,
          activeSqlTable: state.activeSqlDbId === id ? null : state.activeSqlTable,
        })),
      setActiveNosql: (id) => set({ activeNosqlId: id }),
      upsertNosql: (h) =>
        set((state) => {
          const next = state.nosqlCollections.filter((d) => d.id !== h.id);
          next.push(h);
          next.sort((a, b) => a.name.localeCompare(b.name));
          return { nosqlCollections: next, activeNosqlId: h.id };
        }),
      removeNosql: (id) =>
        set((state) => ({
          nosqlCollections: state.nosqlCollections.filter((d) => d.id !== id),
          activeNosqlId: state.activeNosqlId === id ? null : state.activeNosqlId,
        })),
      setTheme: (t) => set({ theme: t }),
      setLayout: (l) => set({ layout: l }),
      setPaletteOpen: (b) => set({ paletteOpen: b, paletteQuery: b ? '' : '' }),
      setPaletteQuery: (q) => set({ paletteQuery: q }),
      pushRecent: (label) =>
        set((state) => ({
          recent: [{ id: crypto.randomUUID(), label, ts: Date.now() }, ...state.recent].slice(0, 50),
        })),
      pushQuery: (sql, dbId) =>
        set((state) => ({
          queryHistory: [
            { id: crypto.randomUUID(), sql, ts: Date.now(), dbId },
            ...state.queryHistory.filter((q) => q.sql !== sql),
          ].slice(0, 200),
        })),
      setStorageEstimate: (e) => set({ storageEstimate: e }),
      setOwnership: (state) => set({ ownership: state }),
      setUpdateState: (state) => set({ updateState: state }),
      setOfflineReadiness: (state) => set({ offlineReadiness: state }),
      beginOperation: (kind) =>
        set((state) => ({ operations: beginOperation(state.operations, kind) })),
      endOperation: (kind, error) =>
        set((state) => ({ operations: endOperation(state.operations, kind, error) })),
      setVaultState: (state) => set({ vault: state }),
    }),
    {
      name: 'bdp-meta',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        layout: state.layout,
        section: state.section,
        lastSection: state.lastSection,
        activeSqlDbId: state.activeSqlDbId,
        activeSqlTable: state.activeSqlTable,
        sqlManagerTab: state.sqlManagerTab,
        queryDraft: state.queryDraft,
        activeNosqlId: state.activeNosqlId,
        recent: state.recent.slice(0, 20),
        queryHistory: state.queryHistory.slice(0, 50),
        // Vault state is intentionally ephemeral and re-derived on startup.
      }),
    },
  ),
);

// Apply theme & layout to <html> attributes
export function applyChrome(theme: ThemeId, layout: LayoutId) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-layout', layout);
}
