/** `.bdp` archive format (version 1):
 *   manifest.json
 *   sql/<dbId>.sqlite      ← per SQL DB
 *   nosql/<colId>.jsonl    ← one document per line
 *
 * Round-trip: Import into Backup section rebuilds IndexedDB-owned data
 * identically. Export is symmetric.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type ArchiveKind = 'sql' | 'nosql';

export interface ArchiveManifestV1 {
  formatVersion: 1;
  createdAt: number;
  exportOrigin: string;
  items: ArchiveManifestItem[];
}

export interface ArchiveManifestItem {
  kind: ArchiveKind;
  id: string;
  name: string;
  fields?: string[];
  bytes: number;
}

export interface ArchiveExtract {
  manifest: ArchiveManifestV1;
  files: Record<string, Uint8Array>;
}

export function buildArchive(input: {
  items: (Omit<ArchiveManifestItem, 'bytes'> & {
    data: Uint8Array;
  })[];
  origin?: string;
}): Uint8Array {
  const items: ArchiveManifestItem[] = input.items.map((it) => ({
    kind: it.kind,
    id: it.id,
    name: it.name,
    fields: it.fields,
    bytes: it.data.byteLength,
  }));
  const manifest: ArchiveManifestV1 = {
    formatVersion: 1,
    createdAt: Date.now(),
    exportOrigin: input.origin ?? 'bdp',
    items,
  };
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
  };
  for (const it of input.items) {
    if (it.kind === 'sql') files[`sql/${it.id}.sqlite`] = it.data;
    else files[`nosql/${it.id}.jsonl`] = it.data;
  }
  return zipSync(files, { level: 6 });
}

export function readArchive(bytes: Uint8Array): ArchiveExtract {
  const files = unzipSync(bytes);
  if (!files['manifest.json']) throw new Error('bdp archive missing manifest.json');
  const manifest = JSON.parse(strFromU8(files['manifest.json'])) as ArchiveManifestV1;
  if (manifest.formatVersion !== 1) {
    throw new Error(`unsupported bdp archive format version: ${manifest.formatVersion}`);
  }
  return { manifest, files };
}
