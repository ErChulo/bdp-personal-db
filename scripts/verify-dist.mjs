#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(process.cwd(), 'dist');
const indexPath = resolve(root, 'index.html');
const workerPath = resolve(root, 'sw.js');

if (!existsSync(indexPath) || !existsSync(workerPath)) {
  throw new Error('Offline build requires dist/index.html and dist/sw.js');
}

const html = readFileSync(indexPath, 'utf8');
if (/(?:src|href)="\/(?!\/)/.test(html)) {
  throw new Error('dist/index.html contains a root-absolute asset URL');
}

const worker = readFileSync(workerPath, 'utf8');
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk(root)
  .filter((file) => !file.endsWith('.map') && file !== workerPath);

for (const file of files) {
  const url = `./${relative(root, file).replaceAll('\\', '/')}`;
  if (!worker.includes(JSON.stringify(url))) {
    throw new Error(`${url} is missing from the offline precache`);
  }
}

const wasm = files.filter((file) => file.endsWith('.wasm'));
if (wasm.length !== 1) {
  throw new Error(`Expected exactly one WASM asset, found ${wasm.length}`);
}

console.log(`Offline artifact verified: ${files.length} precached files, ${wasm.length} WASM asset.`);
