/** JSON / NDJSON parsing for BDP imports and exports. */

export function parseJsonArray(text: string): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const data = JSON.parse(trimmed);
  if (!Array.isArray(data)) throw new Error('JSON must be an array of objects');
  return data.map((d) => {
    if (typeof d !== 'object' || d === null) throw new Error('each element must be an object');
    return d as Record<string, unknown>;
  });
}

export function parseNdjson(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch (err) {
      throw new Error(`NDJSON line ${i + 1}: ${(err as Error).message}`);
    }
  }
  return out;
}

export function inferSchema(rows: Record<string, unknown>[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r && typeof r === 'object') for (const k of Object.keys(r)) set.add(k);
  }
  return [...set];
}

export function arrayToJson(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, null, 2);
}

export function arrayToNdjson(rows: Record<string, unknown>[]): string {
  return rows.map((r) => JSON.stringify(r)).join('\n');
}

export function collectionToJson(rows: Record<string, unknown>[], collectionName?: string): string {
  const wrapped: Record<string, Record<string, unknown>[]> = {};
  if (collectionName) {
    wrapped[collectionName] = rows;
    return JSON.stringify(wrapped, null, 2);
  }
  return arrayToJson(rows);
}

export function collectionToNdjson(rows: Record<string, unknown>[]): string {
  return arrayToNdjson(rows);
}
