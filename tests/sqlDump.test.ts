import { describe, it, expect } from 'vitest';
import { parseSqlDump, emitSqlDump } from '../src/importExport/sqlDump';

describe('sqlDump', () => {
  it('parses CREATE TABLE', () => {
    const sample = `
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER);
      INSERT INTO users (id, name, age) VALUES (1, 'alice', 30), (2, 'bob', 40);
      INSERT INTO users (id, name, age) VALUES (3, 'carol', 25);
    `;
    const dump = parseSqlDump(sample);
    expect(dump.tables.length).toBe(1);
    expect(dump.tables[0].name).toBe('users');
    expect(dump.tables[0].columns).toEqual(['id', 'name', 'age']);
    expect(dump.tables[0].rows.length).toBe(3);
    expect(dump.tables[0].rows[0]).toEqual(['1', 'alice', '30']);
  });

  it('parses multi-table dumps', () => {
    const sample = `
      CREATE TABLE a (id INTEGER);
      INSERT INTO a VALUES (1), (2);
      CREATE TABLE b (x TEXT);
      INSERT INTO b VALUES ('hello');
    `;
    const dump = parseSqlDump(sample);
    const names = dump.tables.map((t) => t.name).sort();
    expect(names).toEqual(['a', 'b']);
  });

  it('round-trips emit → parse with the same row count', () => {
    const original = [
      { name: 'people', columns: ['id', 'name'], rows: [['1', 'alice'], ['2', 'bob']] },
    ];
    const emitted = emitSqlDump(original);
    const parsed = parseSqlDump(emitted);
    expect(parsed.tables[0].rows.length).toBe(2);
    expect(parsed.tables[0].rows[1][1]).toBe('bob');
  });

  it('handles IF NOT EXISTS in CREATE', () => {
    const sample = `CREATE TABLE IF NOT EXISTS x (id INTEGER);`;
    const dump = parseSqlDump(sample);
    expect(dump.tables[0].name).toBe('x');
  });
});
