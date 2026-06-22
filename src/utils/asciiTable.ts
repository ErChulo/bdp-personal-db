/**
 * Render a result set as an ASCII-art table.
 * Pure function; consumed by Query, Reports, Import dry-run preview, etc.
 */
export function renderAsciiTable(columns: string[], rows: unknown[][]): string {
  if (columns.length === 0) return '(empty)';
  const widths = columns.map((c) => c.length);
  for (const row of rows) {
    for (let i = 0; i < columns.length; i++) {
      const v = row[i];
      const s = v === null || v === undefined ? 'NULL' : stringifyCell(v);
      if (s.length > widths[i]) widths[i] = s.length;
    }
  }
  const cap = widths.map((w) => '─'.repeat(w + 2));
  const top = `┌${cap.join('┬')}┐`;
  const sep = `├${cap.join('┼')}┤`;
  const bottom = `└${cap.join('┴')}┘`;
  const head = `│${columns.map((c, i) => ` ${c.padEnd(widths[i])} `).join('│')}│`;
  const body = rows
    .map((r) => `│${r.map((v, i) => ` ${(v === null || v === undefined ? 'NULL' : stringifyCell(v)).padEnd(widths[i])} `).join('│')}│`)
    .join('\n');
  return [top, head, sep, body, bottom].filter(Boolean).join('\n');
}

export function stringifyCell(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (v instanceof Uint8Array) return `<blob ${v.length}B>`;
  if (v instanceof Date) return v.toISOString();
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
