import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { sha256Hex } from '../utils/digest';

export type ArchiveKind = 'sql' | 'nosql';

export interface ArchiveManifestEntry {
  kind: ArchiveKind;
  id: string;
  name: string;
  path: string;
  byteLength: number;
  sha256: string;
  fields?: string[];
}

export interface ArchiveManifestV1 {
  formatVersion: 1;
  createdAt: number;
  exportOrigin: string;
  entries: ArchiveManifestEntry[];
}

export interface ArchiveExtract {
  manifest: ArchiveManifestV1;
  files: Record<string, Uint8Array>;
}

export interface TransferItemSummary {
  name: string;
  itemCount: number;
  byteLength: number;
  failedEntries: string[];
}

export interface TransferSummary {
  sourceCount: number;
  totalItems: number;
  totalBytes: number;
  failedEntries: string[];
  sources: TransferItemSummary[];
}

export async function buildArchive(input: {
  items: (Omit<ArchiveManifestEntry, 'byteLength' | 'path' | 'sha256'> & {
    data: Uint8Array;
  })[];
  origin?: string;
}): Promise<Uint8Array> {
  const entries = [];
  const files: Record<string, Uint8Array> = {};
  for (const item of input.items) {
    const path = item.kind === 'sql' ? `sql/${item.id}.sqlite` : `nosql/${item.id}.jsonl`;
    const sha256 = await sha256Hex(item.data);
    entries.push({
      kind: item.kind,
      id: item.id,
      name: item.name,
      fields: item.fields,
      path,
      byteLength: item.data.byteLength,
      sha256,
    } satisfies ArchiveManifestEntry);
    files[path] = item.data;
  }

  const manifest: ArchiveManifestV1 = {
    formatVersion: 1,
    createdAt: Date.now(),
    exportOrigin: input.origin ?? 'bdp',
    entries,
  };

  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return zipSync(files, { level: 6 });
}

export async function readArchive(bytes: Uint8Array): Promise<ArchiveExtract> {
  const files = unzipSync(bytes);
  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) throw new Error('bdp archive missing manifest.json');

  const parsed = JSON.parse(strFromU8(manifestBytes)) as Partial<ArchiveManifestV1> & {
    items?: ArchiveManifestEntry[];
  };
  const manifest = normalizeManifest(parsed);
  if (manifest.formatVersion !== 1) {
    throw new Error(`unsupported bdp archive format version: ${manifest.formatVersion}`);
  }

  const seen = new Set<string>();
  for (const entry of manifest.entries) {
    if (!isRelativePath(entry.path)) {
      throw new Error(`archive path must be relative: ${entry.path}`);
    }
    if (seen.has(entry.path)) {
      throw new Error(`duplicate archive path: ${entry.path}`);
    }
    seen.add(entry.path);
    const data = files[entry.path];
    if (!data) throw new Error(`missing archive entry: ${entry.path}`);
    if (data.byteLength !== entry.byteLength) {
      throw new Error(`length mismatch for ${entry.path}`);
    }
    const digest = await sha256Hex(data);
    if (digest !== entry.sha256) {
      throw new Error(`digest mismatch for ${entry.path}`);
    }
  }

  for (const key of Object.keys(files)) {
    if (key === 'manifest.json') continue;
    if (!seen.has(key)) throw new Error(`unexpected archive entry: ${key}`);
  }

  return { manifest, files };
}

export function summarizeTransfer(items: TransferItemSummary[]): TransferSummary {
  const normalized = items.filter((item) => item.name.trim().length > 0);
  return {
    sourceCount: normalized.length,
    totalItems: normalized.reduce((sum, item) => sum + item.itemCount, 0),
    totalBytes: normalized.reduce((sum, item) => sum + item.byteLength, 0),
    failedEntries: normalized.flatMap((item) => item.failedEntries.map((entry) => `${item.name}: ${entry}`)),
    sources: normalized,
  };
}

export function formatTransferSummary(kind: 'export' | 'backup' | 'restore', summary: TransferSummary): string {
  const nouns = kind === 'backup'
    ? `${summary.sourceCount} source${summary.sourceCount === 1 ? '' : 's'}`
    : `${summary.totalItems} item${summary.totalItems === 1 ? '' : 's'}`;
  const bytes = formatBytes(summary.totalBytes);
  const details = summary.sources
    .map((source) => `${source.name} [${source.itemCount} ${source.itemCount === 1 ? 'item' : 'items'} · ${formatBytes(source.byteLength)}]`)
    .join(', ');
  const base = kind === 'restore'
    ? `restored ${nouns} (${bytes})`
    : kind === 'backup'
      ? `snapshot created from ${nouns} (${bytes})`
      : `exported ${nouns} (${bytes})`;
  const detailText = details ? `: ${details}` : '';
  if (summary.failedEntries.length === 0) return `${base}${detailText}`;
  const failed = summary.failedEntries.join('; ');
  return `${base}${detailText}; failed: ${failed}`;
}

export function formatBytes(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`;
  const kb = byteLength / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb < 10 ? 1 : 0)} GB`;
}

function normalizeManifest(input: Partial<ArchiveManifestV1> & { items?: ArchiveManifestEntry[] }): ArchiveManifestV1 {
  const entries = Array.isArray(input.entries)
    ? input.entries
    : Array.isArray(input.items)
      ? input.items.map((entry) => ({
        // Backward-compatibility for the older archive tests and old build artifacts.
        ...entry,
        path: entry.path || (entry.kind === 'sql' ? `sql/${entry.id}.sqlite` : `nosql/${entry.id}.jsonl`),
        byteLength: entry.byteLength ?? (entry as any).bytes ?? 0,
        sha256: entry.sha256 ?? '',
      }))
      : [];
  return {
    formatVersion: Number(input.formatVersion ?? 1) as 1,
    createdAt: Number(input.createdAt ?? Date.now()),
    exportOrigin: String(input.exportOrigin ?? 'bdp'),
    entries,
  };
}

function isRelativePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('..') && !path.includes('\\');
}
