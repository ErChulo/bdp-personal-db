import { createWriteStream } from 'node:fs';
import { mkdir, stat, truncate } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface CsvFixtureOptions {
  path: string;
  rows: number;
  columns?: string[];
}

export async function writeCsvFixture(options: CsvFixtureOptions): Promise<{ path: string; bytes: number; rows: number }> {
  const columns = options.columns ?? ['id', 'name', 'score'];
  await mkdir(dirname(options.path), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(options.path, { encoding: 'utf8' });
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.write(`${columns.join(',')}\n`);
    for (let i = 1; i <= options.rows; i++) {
      const values = columns.map((column) => valueForColumn(column, i));
      if (!stream.write(`${values.join(',')}\n`)) {
        stream.once('drain', () => undefined);
      }
    }
    stream.end();
  });

  const info = await stat(options.path);
  return { path: options.path, bytes: info.size, rows: options.rows };
}

export async function writeOversizedSparseFixture(path: string, byteLength: number): Promise<{ path: string; bytes: number }> {
  await mkdir(dirname(path), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(path);
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.write('id,name\n');
    stream.write('1,oversized\n');
    stream.write(Buffer.alloc(1), (error) => {
      if (error) reject(error);
      else stream.end();
    });
  });
  const info = await stat(path);
  if (info.size < byteLength) await truncate(path, byteLength);
  const finalInfo = await stat(path);
  return { path, bytes: finalInfo.size };
}

export function buildLargeMetricsInsertSql(tableName: string, rows: number): string {
  return `
WITH RECURSIVE seq(x) AS (
  VALUES(1)
  UNION ALL
  SELECT x + 1 FROM seq WHERE x < ${rows}
)
INSERT INTO ${tableName} (id, score, label)
SELECT x, x % 100, 'row-' || x FROM seq;
`.trim();
}

function valueForColumn(column: string, row: number): string {
  if (column === 'id') return String(row);
  if (column === 'score') return String((row * 17) % 100);
  if (column === 'active') return row % 2 === 0 ? 'true' : 'false';
  return `${column}-${row}`;
}
