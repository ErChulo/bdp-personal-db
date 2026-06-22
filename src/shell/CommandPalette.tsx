import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, type SectionId, type ThemeId, type LayoutId } from './store';

interface PaletteEntry {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useAppStore((s) => s.paletteOpen);
  const close = () => useAppStore.getState().setPaletteOpen(false);
  const query = useAppStore((s) => s.paletteQuery);
  const setQuery = useAppStore((s) => s.setPaletteQuery);

  const jumpTo = (s: SectionId) => () => {
    useAppStore.getState().setSection(s);
    close();
  };

  const setTheme = (t: ThemeId) => () => {
    useAppStore.getState().setTheme(t);
    close();
  };

  const setLayout = (l: LayoutId) => () => {
    useAppStore.getState().setLayout(l);
    close();
  };

  const runLastQuery = () => {
    const h = useAppStore.getState().queryHistory[0];
    if (h) {
      useAppStore.getState().setSection('query');
      window.dispatchEvent(new CustomEvent('bdp:load-history', { detail: h }));
      close();
    } else {
      useAppStore.getState().setSection('query');
      close();
    }
  };

  const entries: PaletteEntry[] = useMemo(
    () => [
      { id: 'j-dash', label: 'Open Dashboard', hint: 'F1', run: jumpTo('dashboard') },
      { id: 'j-sql', label: 'Open SQL Manager', hint: 'F2', run: jumpTo('sql') },
      { id: 'j-nosql', label: 'Open NoSQL Manager', hint: 'F3', run: jumpTo('nosql') },
      { id: 'j-q', label: 'Open Query', hint: 'F4', run: jumpTo('query') },
      { id: 'j-imp', label: 'Open Import', hint: 'F5', run: jumpTo('import') },
      { id: 'j-exp', label: 'Open Export', hint: 'F6', run: jumpTo('export') },
      { id: 'j-rep', label: 'Open Reports', hint: 'F7', run: jumpTo('reports') },
      { id: 'j-key', label: 'Open Key Gen', hint: 'F8', run: jumpTo('keygen') },
      { id: 'j-search', label: 'Open Search', hint: 'F10', run: jumpTo('search') },
      { id: 'j-bak', label: 'Open Backup', hint: '', run: jumpTo('backup') },
      { id: 'j-diff', label: 'Open Schema Diff', hint: '', run: jumpTo('schemaDiff') },
      { id: 'a-runlast', label: 'Run last query', hint: 'action', run: runLastQuery },
      { id: 't-mono', label: 'Theme: Mono Inverse', hint: 'theme', run: setTheme('mono') },
      { id: 't-amber', label: 'Theme: Amber Phosphor', hint: 'theme', run: setTheme('amber') },
      { id: 't-green', label: 'Theme: Green Phosphor', hint: 'theme', run: setTheme('green') },
      { id: 't-lilac', label: 'Theme: Lilac', hint: 'theme', run: setTheme('lilac') },
      { id: 'l-std', label: 'Layout: Standard', hint: 'layout', run: setLayout('standard') },
      { id: 'l-cmp', label: 'Layout: Compact', hint: 'layout', run: setLayout('compact') },
      { id: 'l-foc', label: 'Layout: Focus', hint: 'layout', run: setLayout('focus') },
    ],
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.label.toLowerCase().includes(q) || e.hint.toLowerCase().includes(q),
    );
  }, [entries, query]);

  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      // tiny defer so the input is mounted
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true">
        <header>◉ COMMAND PALETTE · Ctrl/Cmd+K</header>
        <input
          ref={inputRef}
          id="palette-query"
          name="paletteQuery"
          aria-label="Command palette search"
          className="palette"
          placeholder="Type to filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIdx((i) => Math.max(0, i - 1));
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              const item = filtered[activeIdx];
              if (item) item.run();
            }
          }}
        />
        <ul className="results">
          {filtered.length === 0 && <li>— no matches —</li>}
          {filtered.map((e, i) => (
            <li
              key={e.id}
              className={i === activeIdx ? 'active' : ''}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => e.run()}
            >
              <span className="key">{e.hint}</span>
              <span style={{ flex: 1 }}>{e.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
