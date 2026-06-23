import { SECTIONS } from './sectionRegistry';
import { useAppStore, type SectionId } from './store';

const ICONS: Record<SectionId, string> = {
  dashboard: '⌂',
  sql: '▤',
  nosql: '◇',
  query: '⌁',
  import: '↓',
  export: '↑',
  reports: '∿',
  keygen: '⌘',
  search: '⌕',
  backup: '◫',
  schemaDiff: '≠',
};

const GROUPS: Array<{ label: string; ids: SectionId[] }> = [
  { label: 'Workspace', ids: ['dashboard', 'sql', 'nosql', 'query'] },
  { label: 'Data movement', ids: ['import', 'export', 'backup'] },
  { label: 'Tools', ids: ['reports', 'search', 'schemaDiff', 'keygen'] },
];

export function AppNavigation() {
  const active = useAppStore((state) => state.section);
  const setSection = useAppStore((state) => state.setSection);
  const openPalette = useAppStore((state) => state.setPaletteOpen);

  return (
    <aside className="app-nav" aria-label="Primary navigation">
      <button className="nav-brand" onClick={() => setSection('dashboard')} aria-label="Open dashboard">
        <span className="nav-brand-mark">B</span>
        <span><strong>BDP</strong><small>local database studio</small></span>
      </button>

      <nav>
        {GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-group-label">{group.label}</div>
            {group.ids.map((id) => {
              const section = SECTIONS.find((candidate) => candidate.id === id);
              if (!section) return null;
              return (
                <button
                  key={id}
                  className={`nav-item${active === id ? ' active' : ''}`}
                  onClick={() => setSection(id)}
                  aria-current={active === id ? 'page' : undefined}
                >
                  <span className="nav-icon" aria-hidden="true">{ICONS[id]}</span>
                  <span>{section.label}</span>
                  {section.fkey && <kbd>{section.fkey}</kbd>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <button className="palette-trigger" onClick={() => openPalette(true)}>
        <span>Quick actions</span><kbd>⌘ K</kbd>
      </button>
    </aside>
  );
}

export function WorkspaceToolbar() {
  const section = useAppStore((state) => state.section);
  const setSection = useAppStore((state) => state.setSection);
  const definition = SECTIONS.find((candidate) => candidate.id === section);

  return (
    <div className="workspace-toolbar">
      {section !== 'dashboard' ? (
        <button className="back-button" onClick={() => setSection('dashboard')}>
          <span aria-hidden="true">←</span> Dashboard
        </button>
      ) : <span className="workspace-eyebrow">Overview</span>}
      <span className="workspace-path">/</span>
      <strong>{definition?.label ?? section}</strong>
    </div>
  );
}
