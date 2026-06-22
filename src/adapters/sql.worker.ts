/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import initSqlJs, { type SqlJsStatic, type Database } from 'sql.js';
// Vite `?url` import hands us a correct, hashed URL regardless of dev/prod.
// (Using self.location.href with a relative path inside the worker breaks
//  because Vite loads the worker from /src/adapters/sql.worker.ts, not /.)
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let SQL: SqlJsStatic | null = null;
const databases = new Map<string, Database>();

async function ensure(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  SQL = await initSqlJs({
    locateFile: (_file: string) => wasmUrl,
  });
  return SQL;
}

interface ExecMsg {
  type: 'exec';
  id: string;
  dbId: string;
  sql: string;
}
interface SchemaMsg {
  type: 'schema';
  id: string;
  dbId: string;
}
interface ImportBytesMsg {
  type: 'import';
  id: string;
  dbId: string;
  bytes: Uint8Array;
}
interface ExportMsg {
  type: 'export';
  id: string;
  dbId: string;
}
interface CreateMsg {
  type: 'create';
  id: string;
  dbId: string;
  schemaSql?: string;
}
interface DropMsg {
  type: 'drop';
  id: string;
  dbId: string;
}
interface VacuumMsg {
  type: 'vacuum';
  id: string;
  dbId: string;
}
interface RawExecMsg {
  type: 'run';
  id: string;
  dbId: string;
  sql: string;
  params?: unknown[];
}
type InMsg =
  | ExecMsg
  | SchemaMsg
  | ImportBytesMsg
  | ExportMsg
  | CreateMsg
  | DropMsg
  | VacuumMsg
  | RawExecMsg;

function getDb(SQL: SqlJsStatic, dbId: string): Database {
  let db = databases.get(dbId);
  if (!db) {
    db = new SQL.Database();
    databases.set(dbId, db);
  }
  return db;
}

async function handle(msg: InMsg) {
  try {
    const SQL = await ensure();
    switch (msg.type) {
      case 'create': {
        const db = new SQL.Database();
        if (msg.schemaSql) db.exec(msg.schemaSql);
        databases.set(msg.dbId, db);
        (self as any).postMessage({ id: msg.id, ok: true });
        return;
      }
      case 'import': {
        const db = new SQL.Database(msg.bytes);
        databases.set(msg.dbId, db);
        (self as any).postMessage({ id: msg.id, ok: true });
        return;
      }
      case 'export': {
        const db = databases.get(msg.dbId);
        if (!db) throw new Error(`db ${msg.dbId} not found`);
        const bytes = db.export();
        (self as any).postMessage({ id: msg.id, ok: true, bytes }, [bytes.buffer]);
        return;
      }
      case 'drop': {
        const db = databases.get(msg.dbId);
        if (db) {
          db.close();
          databases.delete(msg.dbId);
        }
        (self as any).postMessage({ id: msg.id, ok: true });
        return;
      }
      case 'vacuum': {
        const db = getDb(SQL, msg.dbId);
        db.exec('VACUUM');
        (self as any).postMessage({ id: msg.id, ok: true });
        return;
      }
      case 'schema': {
        const db = getDb(SQL, msg.dbId);
        const tablesStmt = db.exec(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        );
        const tables: any[] = [];
        const rows = tablesStmt[0]?.values ?? [];
        for (const [name] of rows) {
          const info = db.exec(`PRAGMA table_info(${quoteIdent(String(name))})`);
          const cols = (info[0]?.values ?? []).map((r: any[]) => ({
            name: String(r[1]),
            type: String(r[2] ?? ''),
            pk: Number(r[5] ?? 0),
            notnull: Number(r[3] ?? 0),
            dflt: r[4] === null ? null : String(r[4]),
          }));
          const ixInfo = db.exec(`PRAGMA index_list(${quoteIdent(String(name))})`);
          const idxs = (ixInfo[0]?.values ?? []).map((r: any[]) => ({
            name: String(r[1]),
            unique: Number(r[2] ?? 0),
          }));
          let rc = 0;
          try {
            const rcStmt = db.exec(`SELECT COUNT(*) FROM ${quoteIdent(String(name))}`);
            rc = Number(rcStmt[0]?.values?.[0]?.[0] ?? 0);
          } catch {
            rc = 0;
          }
          tables.push({ name: String(name), columns: cols, indexes: idxs, rowCount: rc });
        }
        (self as any).postMessage({ id: msg.id, ok: true, schema: { tables } });
        return;
      }
      case 'exec': {
        const db = getDb(SQL, msg.dbId);
        const start = performance.now();
        try {
          const out = db.exec(msg.sql);
          const result = (out[0] ?? { columns: [], values: [] });
          const rows = result.values ?? [];
          (self as any).postMessage({
            id: msg.id,
            ok: true,
            result: {
              columns: result.columns ?? [],
              rows,
              rowsAffected: 0,
              lastInsertRowid: null,
              error: null,
              durationMs: performance.now() - start,
            },
          });
          return;
        } catch (err) {
          (self as any).postMessage({
            id: msg.id,
            ok: false,
            error: (err as Error).message,
          });
          return;
        }
      }
      case 'run': {
        const db = getDb(SQL, msg.dbId);
        try {
          const stmt = db.prepare(msg.sql);
          stmt.bind((msg.params && msg.params.length ? msg.params : []) as unknown as import('sql.js').BindParams);
          stmt.step();
          const rowsAffected = db.getRowsModified();
          const lastInsert = (db.exec('SELECT last_insert_rowid()')[0]?.values?.[0]?.[0] ?? null) as
            | number
            | null;
          stmt.free();
          (self as any).postMessage({
            id: msg.id,
            ok: true,
            result: {
              columns: [],
              rows: [],
              rowsAffected,
              lastInsertRowid: lastInsert === null ? null : Number(lastInsert),
              error: null,
              durationMs: 0,
            },
          });
          return;
        } catch (err) {
          (self as any).postMessage({ id: msg.id, ok: false, error: (err as Error).message });
          return;
        }
      }
    }
  } catch (err) {
    (self as any).postMessage({ id: (msg as any).id, ok: false, error: (err as Error).message });
  }
}

function quoteIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

self.onmessage = (e: MessageEvent<InMsg>) => {
  void handle(e.data);
};
