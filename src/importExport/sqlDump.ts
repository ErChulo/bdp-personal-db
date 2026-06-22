/** SQL dump tokenizer/parser + emitter.
 *  Handles `CREATE TABLE` and `INSERT INTO ... VALUES (...)`.
 *  Sufficient to round-trip BDP exports, parse `pg_dump --inserts`,
 *  `mysqldump`, and SQLite-style .sql dumps.
 */

export interface ParsedDumpTable {
  name: string;
  columns: string[];
  rows: string[][];
}

export interface ParsedDump {
  tables: ParsedDumpTable[];
}

/** A single token from the SQL dump tokenizer.
 *  - `kw`: keyword token (its textual content preserved, used for syntactic branching).
 *  - `ident`: identifier stripped of its surrounding quotes.
 *  - `str`: single-quoted string literal INCLUDING the surrounding quotes.
 *  - `num`: numeric / bare token.
 *  - `punct`: punctuation `(` `)` `,` `;`
 */
export type Tok =
  | { kind: 'kw';     value: string }
  | { kind: 'ident';  value: string }
  | { kind: 'str';    value: string }   // includes both quotes, e.g. "'alice'"
  | { kind: 'num';    value: string }
  | { kind: 'punct';  value: '(' | ')' | ',' | ';' };

function isKw(t: Tok | undefined, k: string): boolean {
  return !!t && t.kind === 'kw' && t.value.toUpperCase() === k;
}

const KEYWORDS = new Set([
  'CREATE', 'TABLE', 'INSERT', 'INTO', 'VALUES',
  'OR', 'REPLACE', 'IGNORE',
  'IF', 'NOT', 'EXISTS',
  'NULL',
  'TEMP', 'TEMPORARY', 'UNLOGGED',
  'CONSTRAINT', 'PRIMARY', 'UNIQUE', 'FOREIGN', 'KEY', 'INDEX', 'CHECK',
]);

/** A clean, state-machine tokenizer.
 *  Guaranteed to never emit an empty / no-op token: every iteration either
 *  pushes exactly one token or silently advances the cursor (whitespace,
 *  comments).
 */
function tokenize(sql: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];

    // Whitespace.
    if (/\s/.test(ch)) { i++; continue; }

    // Line comment `--` until end of line.
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    // Block comment `/* ... */`.
    if (ch === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // Punctuation that doubles as a structural delimiter.
    if (ch === '(' || ch === ')' || ch === ',' || ch === ';') {
      toks.push({ kind: 'punct', value: ch });
      i++;
      continue;
    }

    // Single-quoted string literal (with embedded `''` escape).
    if (ch === "'") {
      let buf = "'";
      i++;
      while (i < n) {
        const c = sql[i];
        if (c === "'") {
          if (sql[i + 1] === "'") { buf += "''"; i += 2; continue; }
          buf += "'"; i++; break;
        }
        buf += c; i++;
      }
      toks.push({ kind: 'str', value: buf });
      continue;
    }

    // Double-quoted or backtick identifier — quotes stripped from token value.
    if (ch === '"' || ch === '`') {
      const quote = ch;
      let buf = '';
      i++;
      while (i < n && sql[i] !== quote) {
        if (sql[i] === quote && sql[i + 1] === quote) { buf += quote; i += 2; continue; }
        buf += sql[i]; i++;
      }
      if (i < n) i++; // skip closing quote
      toks.push({ kind: 'ident', value: buf });
      continue;
    }

    // Word: scan until whitespace or punctuation.
    let j = i;
    while (j < n && !/[\s;(),'"\/`-]/.test(sql[j])) {
      // Stop at comment-open too.
      if (sql[j] === '-' && sql[j + 1] === '-') break;
      if (sql[j] === '/' && sql[j + 1] === '*') break;
      j++;
    }
    const word = sql.slice(i, j);
    if (word.length === 0) { i++; continue; }

    const upper = word.toUpperCase();
    if (KEYWORDS.has(upper)) {
      toks.push({ kind: 'kw', value: upper });
    } else if (/^-?\d+(\.\d+)?$/.test(word)) {
      toks.push({ kind: 'num', value: word });
    } else {
      toks.push({ kind: 'ident', value: word });
    }
    i = j;
  }
  return toks;
}

/** Strip the surrounding single-quotes of a string-literal token.
 *  Un-escapes `''` -> `'`.
 */
function unquoteStr(t: Tok): string {
  if (t.kind !== 'str') return '';
  const v = t.value;
  if (v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'") {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  return v;
}

export function parseSqlDump(sql: string): ParsedDump {
  const toks = tokenize(sql);
  const tables: ParsedDumpTable[] = [];
  let i = 0;
  while (i < toks.length) {
    const cur = toks[i];

    // CREATE TABLE [IF NOT EXISTS] [TEMP|TEMPORARY|UNLOGGED] name (col-defs, ...);
    if (isKw(cur, 'CREATE') && isKw(toks[i + 1], 'TABLE')) {
      i += 2;
      while (isKw(toks[i], 'IF') || isKw(toks[i], 'NOT') || isKw(toks[i], 'EXISTS')) i++;
      while (isKw(toks[i], 'TEMP') || isKw(toks[i], 'TEMPORARY') || isKw(toks[i], 'UNLOGGED')) i++;
      const ident = toks[i];
      const name = ident && ident.kind === 'ident' ? ident.value : '';
      i++;
      // Optional column list.
      const cols: string[] = [];
      if (toks[i] && toks[i].kind === 'punct' && toks[i].value === '(') {
        const colList = readParenList(toks, i);
        i = colList.end; // position just past `)`
        for (const inner of colList.items) {
          if (inner.length === 0) continue;
          const firstTok = inner[0];
          if (firstTok.kind === 'kw' &&
              ['CONSTRAINT','PRIMARY','UNIQUE','FOREIGN','KEY','INDEX','CHECK'].includes(firstTok.value)) {
            continue;
          }
          const colName = firstTok.kind === 'ident' ? firstTok.value
                        : firstTok.kind === 'str'  ? unquoteStr(firstTok)
                        : '';
          if (colName) cols.push(colName);
        }
      }
      tables.push({ name, columns: cols, rows: [] });
      // Trailing `;`
      if (toks[i] && toks[i].kind === 'punct' && toks[i].value === ';') i++;
      continue;
    }

    // INSERT INTO name [(cols)] VALUES (row)[, (row)*];
    if (isKw(cur, 'INSERT') && isKw(toks[i + 1], 'INTO')) {
      i += 2;
      const ident = toks[i];
      const name = ident && ident.kind === 'ident' ? ident.value : '';
      i++;
      // Optional column list.
      let cols: string[] | null = null;
      if (toks[i] && toks[i].kind === 'punct' && toks[i].value === '(') {
        const colList = readParenList(toks, i);
        i = colList.end;
        cols = colList.items.map((inner) => {
          const f = inner[0];
          if (!f) return '';
          if (f.kind === 'ident') return f.value;
          if (f.kind === 'str') return unquoteStr(f);
          return f.value;
        });
      }
      // Expect VALUES keyword.
      if (!isKw(toks[i], 'VALUES')) {
        // Unknown form — skip to next `;`.
        while (i < toks.length && !(toks[i].kind === 'punct' && toks[i].value === ';')) i++;
        if (i < toks.length) i++;
        continue;
      }
      i++; // past VALUES

      let existing = tables.find((t) => t.name === name);
      if (!existing) {
        existing = { name, columns: cols ?? [], rows: [] };
        tables.push(existing);
      }
      if (cols === null) cols = existing.columns.slice();

      // Read one or more `(row)` tuples joined by `,`.
      while (toks[i] && toks[i].kind === 'punct' && toks[i].value === '(') {
        const tuple = readParenList(toks, i);
        i = tuple.end;
        const row: string[] = [];
        for (const cell of tuple.items) {
          if (cell.length === 0) { row.push(''); continue; }
          const f = cell[0];
          if (isKw(f, 'NULL')) { row.push(''); continue; }
          if (f.kind === 'str') { row.push(unquoteStr(f)); continue; }
          if (f.kind === 'num') { row.push(f.value); continue; }
          if (f.kind === 'ident') { row.push(f.value); continue; }
          row.push(f.value);
        }
        existing.rows.push(row);
        if (!(toks[i] && toks[i].kind === 'punct' && toks[i].value === ',')) break;
        i++; // past comma between tuples
      }
      if (toks[i] && toks[i].kind === 'punct' && toks[i].value === ';') i++;
      continue;
    }

    i++;
  }
  return { tables };
}

/** From position `start` which must point at `(`, read a balanced
 *  parenthesized token list and return:
 *    - `end`: the index just past the matching `)`.
 *    - `items`: array of token lists, one per comma-separated element
 *      (top-level commas only).
 */
function readParenList(toks: Tok[], start: number): { end: number; items: Tok[][] } {
  const items: Tok[][] = [];
  let i = start + 1; // past `(`
  let depth = 1;
  let current: Tok[] = [];
  const flush = () => { if (current.length > 0) { items.push(current); current = []; } };
  while (i < toks.length && depth > 0) {
    const t = toks[i];
    if (t.kind === 'punct') {
      if (t.value === '(') { depth++; current.push(t); i++; continue; }
      if (t.value === ')') {
        if (depth === 1) {
          flush();
          i++;
          break;
        }
        depth--; current.push(t); i++; continue;
      }
      if (t.value === ',' && depth === 1) {
        flush();
        i++; continue;
      }
    }
    current.push(t);
    i++;
  }
  return { end: i, items };
}

function quoteIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

export function emitSqlDump(tables: ParsedDumpTable[]): string {
  const out: string[] = ['BEGIN TRANSACTION;'];
  for (const t of tables) {
    out.push(`DROP TABLE IF EXISTS ${quoteIdent(t.name)};`);
    out.push(
      `CREATE TABLE ${quoteIdent(t.name)} (${t.columns
        .map((c) => `${quoteIdent(c)} TEXT`)
        .join(', ')});`,
    );
    if (t.rows.length === 0) continue;
    const chunkSize = 50;
    for (let i = 0; i < t.rows.length; i += chunkSize) {
      const chunk = t.rows.slice(i, i + chunkSize);
      const values = chunk
        .map((row) =>
          '(' +
          row
            .map((v) => {
              if (v === '' || v === null || v === undefined) return 'NULL';
              const s = String(v);
              return "'" + s.replace(/'/g, "''") + "'";
            })
            .join(', ') +
          ')',
        )
        .join(', ');
      out.push(
        `INSERT INTO ${quoteIdent(t.name)} (${t.columns.map(quoteIdent).join(', ')}) VALUES ${values};`,
      );
    }
  }
  out.push('COMMIT;');
  return out.join('\n');
}

/** Coerce parsed dump to a sequence of single-statement SQL strings,
 *  suitable for sql.js prepared execution.
 */
export function dumpToForeignKeys(tables: ParsedDumpTable[]): string[] {
  const stmts: string[] = [];
  for (const t of tables) {
    if (t.columns.length === 0 || t.rows.length === 0) continue;
    const cols = t.columns.map(quoteIdent).join(', ');
    const values = t.rows
      .map((row) =>
        '(' +
        row
          .map((v) => (v === '' || v === null || v === undefined ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'"))
          .join(', ') +
        ')',
      )
      .join(', ');
    stmts.push(`INSERT INTO ${quoteIdent(t.name)} (${cols}) VALUES ${values};`);
  }
  return stmts;
}
