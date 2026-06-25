#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import initSqlJs from 'sql.js';

const wasmPath = resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm');
if (!existsSync(wasmPath)) {
  throw new Error('sql.js WASM asset is missing. Run `npm install` first.');
}

const SQL = await initSqlJs({
  locateFile: (file) => resolve(process.cwd(), 'node_modules/sql.js/dist', file),
});

const db = new SQL.Database();

const identifierPayloads = [
  'evil"; DROP TABLE safe;--',
  'evil""; DROP TABLE safe;--',
  'evil; DROP TABLE safe;--',
  'evil"--comment',
  'evil\nDROP TABLE safe;--',
  '  spaced name  ',
  'δοκιμή";DROP TABLE safe;--',
];

const valuePayloads = [
  `x'; DROP TABLE safe;--`,
  `"; DROP TABLE safe;--`,
  `line1\nline2`,
  `emoji 😈'; SELECT 1;--`,
  `0); DROP TABLE safe;--`,
];

const fuzzedIdentifierPayloads = fuzzPayloads(24, 'ident');
const fuzzedValuePayloads = fuzzPayloads(24, 'value');

for (const payload of identifierPayloads) {
  db.exec('DROP TABLE IF EXISTS safe;');
  db.exec('DROP TABLE IF EXISTS victim;');
  db.exec(`
    CREATE TABLE safe (id INTEGER PRIMARY KEY, body TEXT);
    CREATE TABLE ${quoteIdent(payload)} (id INTEGER PRIMARY KEY, body TEXT);
    INSERT INTO safe (id, body) VALUES (1, 'still here');
  `);

  db.exec(`SELECT * FROM ${quoteIdent(payload)};`);
  const safeRows = db.exec('SELECT * FROM safe;');

  assert.equal(safeRows.length, 1, `safe table missing after identifier payload ${JSON.stringify(payload)}`);
  assert.deepEqual(safeRows[0].values, [[1, 'still here']]);
  const tableNames = listTables(db);
  assert.ok(tableNames.includes('safe'), 'safe table should still exist');
  assert.ok(tableNames.includes(payload), `quoted table ${JSON.stringify(payload)} should exist as a literal identifier`);
}

for (const payload of valuePayloads) {
  db.exec('DROP TABLE IF EXISTS safe;');
  db.exec(`
    CREATE TABLE safe (id INTEGER PRIMARY KEY, body TEXT);
    INSERT INTO safe (id, body) VALUES (1, ${quoteValue(payload)});
  `);

  const safeRows = db.exec('SELECT * FROM safe;');
  assert.equal(safeRows.length, 1, `safe table missing after value payload ${JSON.stringify(payload)}`);
  assert.deepEqual(safeRows[0].values, [[1, payload]]);
}

for (const payload of fuzzedIdentifierPayloads) {
  db.exec('DROP TABLE IF EXISTS safe;');
  db.exec(`
    CREATE TABLE safe (id INTEGER PRIMARY KEY, body TEXT);
    CREATE TABLE ${quoteIdent(payload)} (id INTEGER PRIMARY KEY, body TEXT);
    INSERT INTO safe (id, body) VALUES (1, 'still here');
  `);
  db.exec(`SELECT * FROM ${quoteIdent(payload)};`);
  const safeRows = db.exec('SELECT * FROM safe;');
  assert.equal(safeRows.length, 1, `safe table missing after fuzzed identifier payload ${JSON.stringify(payload)}`);
}

for (const payload of fuzzedValuePayloads) {
  db.exec('DROP TABLE IF EXISTS safe;');
  db.exec(`
    CREATE TABLE safe (id INTEGER PRIMARY KEY, body TEXT);
    INSERT INTO safe (id, body) VALUES (1, ${quoteValue(payload)});
  `);
  const safeRows = db.exec('SELECT * FROM safe;');
  assert.equal(safeRows.length, 1, `safe table missing after fuzzed value payload ${JSON.stringify(payload)}`);
  assert.deepEqual(safeRows[0].values, [[1, payload]]);
}

console.log(`SQL injection check passed: ${identifierPayloads.length + fuzzedIdentifierPayloads.length} identifier payloads and ${valuePayloads.length + fuzzedValuePayloads.length} value payloads stayed contained.`);

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function quoteValue(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function listTables(database) {
  const result = database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return (result[0]?.values ?? []).map((row) => String(row[0]));
}

function fuzzPayloads(count, kind) {
  const out = [];
  let state = kind === 'ident' ? 0x6d2b79f5 : 0x9e3779b9;
  const alphabet = kind === 'ident'
    ? ['a', 'b', 'c', 'x', 'y', 'z', '"', ';', '-', '\n', ' ', "'", '_', '0', '1', 'δο', '😈']
    : ['a', 'b', 'c', 'x', 'y', 'z', '"', ';', '-', '\n', ' ', "'", '_', '0', '1', '[]', '😈'];
  for (let i = 0; i < count; i++) {
    state = xorshift32(state);
    const len = 4 + (state % 10);
    let s = kind === 'ident' ? 'fuzz_' : '';
    for (let j = 0; j < len; j++) {
      state = xorshift32(state);
      s += alphabet[state % alphabet.length];
    }
    if (kind === 'ident') {
      out.push(`"${s.replace(/"/g, '""')}"`);
    } else {
      out.push(s);
    }
  }
  return out;
}

function xorshift32(value) {
  let x = value | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}
