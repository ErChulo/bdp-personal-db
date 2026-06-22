/**
 * Shared schema/data types between sql.js and Dexie.
 */
export interface SqlTableInfo {
  name: string;
  columns: { name: string; type: string; pk: number; notnull: number; dflt: string | null }[];
  indexes: { name: string; unique: number }[];
  rowCount: number;
}

export interface SqlExecResult {
  columns: string[];
  rows: unknown[][];
  rowsAffected: number;
  lastInsertRowid: number | null;
  error: string | null;
  /** wall-clock ms */
  durationMs: number;
}

export interface NosqlFieldDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'json';
}

export interface NosqlDoc {
  id: string;
  [k: string]: unknown;
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}
