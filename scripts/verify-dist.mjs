#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
if (/(?:src|href)="\.\//.test(html)) {
  throw new Error('dist/index.html still references external build assets');
}

if (!existsSync(workerPath)) {
  throw new Error('Offline build requires dist/sw.js');
}

console.log('Standalone offline artifact verified: dist/index.html has no external asset references.');
