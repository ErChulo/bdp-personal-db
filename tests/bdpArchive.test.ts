import { describe, it, expect } from 'vitest';
import { buildArchive, readArchive, formatBytes, formatTransferSummary, summarizeTransfer } from '../src/importExport/bdpArchive';
import { strFromU8, strToU8, zipSync } from 'fflate';

describe('bdpArchive', () => {
  it('round-trips a manifest + SQL blob + JSONL', async () => {
    const sqlBytes = strToU8('SQLite format 3\0fake-sqlite-payload');
    const jsonl = '{"id":"1","name":"alice"}\n{"id":"2","name":"bob"}';
    const zip = await buildArchive({
      items: [
        { kind: 'sql', id: 'db1', name: 'users', data: sqlBytes },
        { kind: 'nosql', id: 'col1', name: 'contacts', fields: ['name'], data: strToU8(jsonl) },
      ],
    });
    expect(zip.byteLength).toBeGreaterThan(0);
    const { manifest, files } = await readArchive(zip);
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.entries.length).toBe(2);
    expect(files['manifest.json']).toBeTruthy();
    expect(strFromU8(files['sql/db1.sqlite'])).toContain('SQLite format 3');
    expect(strFromU8(files['nosql/col1.jsonl'])).toContain('"alice"');
  });

  it('rejects archives with wrong format', async () => {
    const manifest = strToU8(JSON.stringify({
      formatVersion: 99,
      createdAt: 0,
      exportOrigin: 'x',
      entries: [],
    }));
    const bad = zipSync({ 'manifest.json': manifest });
    await expect(readArchive(new Uint8Array(bad))).rejects.toThrow(/unsupported bdp archive format version/);
  });

  it('summarizes transfer batches with source names and failures', () => {
    const summary = summarizeTransfer([
      { name: 'orders', itemCount: 3, byteLength: 1024, failedEntries: [] },
      { name: 'contacts', itemCount: 1, byteLength: 1536, failedEntries: ['table "audit": permission denied'] },
    ]);
    expect(summary.sourceCount).toBe(2);
    expect(summary.totalItems).toBe(4);
    expect(summary.totalBytes).toBe(2560);
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatTransferSummary('backup', summary)).toContain('orders');
    expect(formatTransferSummary('backup', summary)).toContain('failed: contacts: table "audit": permission denied');
  });
});
