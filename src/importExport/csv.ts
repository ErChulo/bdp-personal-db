/** CSV parser/serializer for BDP imports and exports.
 *  - Auto-detects delimiter: `,` `;` or `\t`
 *  - Strips UTF-8 BOM (`\uFEFF`)
 *  - Supports `"` quoted strings with `""` escapes
 *  - Provides lightweight type-inference for dry-run preview
 */

export type CsvRow = Record<string, string>;
export type CsvInferred = Record<string, string | number | boolean | null>;

function normalize(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectDelimiter(firstLine: string): string {
  const tab = (firstLine.match(/\t/g) ?? []).length;
  const semi = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  if (tab >= semi && tab >= comma && tab > 0) return '\t';
  if (semi > comma) return ';';
  return ',';
}

export function parseCsv(text: string): { columns: string[]; rows: CsvRow[] } {
  const raw = normalize(text);
  const lines: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      // support escaped "" inside quotes
      if (inQuote && raw[i + 1] === '"') {
        cur += '""';
        i++;
        continue;
      }
      inQuote = !inQuote;
      cur += ch;
      continue;
    }
    if (ch === '\n' && !inQuote) {
      lines.push(cur);
      cur = '';
      continue;
    }
    if (ch === '\r' && !inQuote) {
      // ignore; \n will handle
      continue;
    }
    cur += ch;
  }
  if (cur.length) lines.push(cur);
  if (!lines.length) return { columns: [], rows: [] };
  const delim = detectDelimiter(lines[0]);
  const split = (line: string): string[] => {
    const out: string[] = [];
    let buf = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          buf += '"';
          i++;
          continue;
        }
        inQ = !inQ;
        continue;
      }
      if (ch === delim && !inQ) {
        out.push(buf);
        buf = '';
        continue;
      }
      buf += ch;
    }
    out.push(buf);
    return out.map((s) => s.trim());
  };
  const head = split(lines[0]);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const parts = split(lines[i]);
    const rec: CsvRow = {};
    for (let j = 0; j < head.length; j++) rec[head[j]] = parts[j] ?? '';
    rows.push(rec);
  }
  return { columns: head, rows };
}

export function inferTypes(
  rows: CsvRow[],
  columns: string[],
): { columns: { name: string; type: 'number' | 'boolean' | 'date' | 'string' }[]; inferred: CsvInferred[] } {
  const sample = rows.slice(0, 100);
  const colTypes = columns.map((c) => {
    let numHits = 0;
    let boolHits = 0;
    let dateHits = 0;
    let nonEmpty = 0;
    for (const r of sample) {
      const v = r[c];
      if (v === undefined || v === null || v === '') continue;
      nonEmpty++;
      if (/^-?\d+(\.\d+)?$/.test(v)) numHits++;
      else if (/^(true|false)$/i.test(v)) boolHits++;
      else if (/^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v))) dateHits++;
    }
    let type: 'number' | 'boolean' | 'date' | 'string' = 'string';
    if (nonEmpty === 0) type = 'string';
    else if (numHits / nonEmpty > 0.8) type = 'number';
    else if (boolHits / nonEmpty > 0.8) type = 'boolean';
    else if (dateHits / nonEmpty > 0.8) type = 'date';
    return { name: c, type };
  });
  const inferred: CsvInferred[] = rows.map((r) => {
    const out: CsvInferred = {};
    for (const ct of colTypes) {
      const v = r[ct.name] ?? '';
      if (v === '') out[ct.name] = null;
      else if (ct.type === 'number') out[ct.name] = Number(v);
      else if (ct.type === 'boolean') out[ct.name] = /^true$/i.test(v);
      else if (ct.type === 'date') out[ct.name] = v;
      else out[ct.name] = v;
    }
    return out;
  });
  return { columns: colTypes, inferred };
}

export function serializeCsv(columns: string[], rows: CsvInferred[]): string {
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n\r\t]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const head = columns.join(',');
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(',')).join('\n');
  return body ? `${head}\n${body}` : head;
}
