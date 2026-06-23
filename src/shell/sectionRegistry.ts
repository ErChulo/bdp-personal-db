import type { SectionId } from './store';

export interface SectionDef {
  id: SectionId;
  label: string;
  fkey: string;
  hint?: string;
}

export const SECTIONS: SectionDef[] = [
  { id: 'dashboard', label: 'Dashboard', fkey: 'F1' },
  { id: 'sql', label: 'SQL Manager', fkey: 'F2' },
  { id: 'nosql', label: 'NoSQL Manager', fkey: 'F3' },
  { id: 'query', label: 'Query', fkey: 'F4' },
  { id: 'import', label: 'Import', fkey: 'F5' },
  { id: 'export', label: 'Export', fkey: 'F6' },
  { id: 'reports', label: 'Reports', fkey: 'F7' },
  { id: 'keygen', label: 'Key Gen', fkey: 'F8' },
  { id: 'search', label: 'Search', fkey: 'F10' },
  { id: 'backup', label: 'Backup / Snapshot', fkey: '' },
  { id: 'schemaDiff', label: 'Schema Diff', fkey: '' },
];
