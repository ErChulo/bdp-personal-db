#!/usr/bin/env node
/**
 * Copies the sql.js wasm into public/sql-wasm/ so Vite can serve it.
 * Run automatically after `npm install` via the "postinstall" hook.
 * Exits 1 loudly if the wasm file is missing.
 */
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'node_modules/sql.js/dist/sql-wasm.wasm');
const destDir = resolve(root, 'public/sql-wasm');
mkdirSync(destDir, { recursive: true });

if (!existsSync(src)) {
  console.error(`[copy-sqlwasm] FATAL: ${src} not found.`);
  console.error('[copy-sqlwasm]   Reinstall sql.js, or manually copy sql-wasm.wasm into public/sql-wasm/.');
  process.exit(1);
}

copyFileSync(src, resolve(destDir, 'sql-wasm.wasm'));
console.log(`[copy-sqlwasm] copied ${src} -> public/sql-wasm/sql-wasm.wasm`);

// Optional auxiliary files (best-effort).
for (const f of ['sql-asm.js', 'sql-wasm-debug.js']) {
  const aux = resolve(root, `node_modules/sql.js/dist/${f}`);
  if (existsSync(aux)) {
    copyFileSync(aux, resolve(destDir, f));
    console.log(`[copy-sqlwasm] copied ${aux} -> public/sql-wasm/${f}`);
  }
}
