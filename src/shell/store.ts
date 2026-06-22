import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
  // SQL state
  sqlDbs: SqlDbHandle[];
  activeSqlDbId: string | null;
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

  // setters
  setSection: (s: SectionId) => void;
  setActiveSqlDb: (id: string | null) => void;
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
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      section: 'dashboard',
      sqlDbs: [],
      activeSqlDbId: null,
      nosqlCollections: [],
      activeNosqlId: null,
      theme: 'mono',
      layout: 'standard',
      paletteOpen: false,
      paletteQuery: '',
      recent: [],
      queryHistory: [],
      storageEstimate: null,

      setSection: (s) => set({ section: s }),
      setActiveSqlDb: (id) => set({ activeSqlDbId: id }),
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
    }),
    {
      name: 'bdp-meta',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        layout: state.layout,
        recent: state.recent.slice(0, 20),
        queryHistory: state.queryHistory.slice(0, 50),
      }),
    },
  ),
);

// Apply theme & layout to <html> attributes
export function applyChrome(theme: ThemeId, layout: LayoutId) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-layout', layout);
}
