/** Helpers for importing/exporting native SQLite files via sql.js. */

export function isProbablySqlite(bytes: Uint8Array): boolean {
  // SQLite magic header: "SQLite format 3\0"
  if (bytes.length < 16) return false;
  const sig = String.fromCharCode(...bytes.slice(0, 15));
  return sig === 'SQLite format 3';
}

export async function readSqliteFile(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}
