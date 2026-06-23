import { useEffect } from 'react';
import { useAppStore, type SectionId } from './store';

const FKEY_MAP: Record<string, SectionId> = {
  F1: 'dashboard',
  F2: 'sql',
  F3: 'nosql',
  F4: 'query',
  F5: 'import',
  F6: 'export',
  F7: 'reports',
  F8: 'keygen',
  F10: 'search',
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

export function KeyboardNav({ children }: { children: React.ReactNode }) {
  const setSection = useAppStore((s) => s.setSection);
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Modifier keys for the palette
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      // ? opens in-app help
      if (e.key === '?' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setSection('dashboard');
        // dashboard renders the help block
        return;
      }
      // F-keys (don't fire while typing in inputs)
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Escape') {
        setSection('dashboard');
        return;
      }
      if (e.key.startsWith('F') && FKEY_MAP[e.key]) {
        // F5 has a browser default (refresh). We override but provide Ctrl+R as alternative.
        e.preventDefault();
        setSection(FKEY_MAP[e.key]);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSection, setPaletteOpen]);

  return <>{children}</>;
}
