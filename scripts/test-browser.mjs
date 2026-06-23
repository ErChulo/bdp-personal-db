#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';

function main() {
  if (!existsSync('dist/index.html')) {
    throw new Error('run npm run build before npm run test:browser');
  }
  if (!existsSync('dist/sw.js')) {
    throw new Error('offline service worker is missing from dist');
  }
  const html = readFileSync('dist/index.html', 'utf8');
  const worker = readFileSync('dist/sw.js', 'utf8');
  if (!html.includes('assets/index-') || !html.includes('assets/dexie-')) {
    throw new Error('dist/index.html does not look like the production bundle');
  }
  if (!worker.includes('PRECACHE') || !worker.includes('clients.claim')) {
    throw new Error('dist/sw.js does not look like the offline service worker');
  }
  console.log('Browser smoke verified.');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}

