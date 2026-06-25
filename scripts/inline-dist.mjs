#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'dist');
const indexPath = resolve(root, 'index.html');

if (!existsSync(indexPath)) {
  throw new Error('dist/index.html is missing; run the build first.');
}

let html = readFileSync(indexPath, 'utf8');

html = html.replace(
  /<link\b([^>]*rel="stylesheet"[^>]*)href="([^"]+)"([^>]*)>/g,
  (_match, before, href, after) => {
    const file = resolve(root, href);
    const css = readFileSync(file, 'utf8');
    return `<style${before}${after}>${css}</style>`;
  },
);

html = html.replace(
  /<link\b([^>]*rel="modulepreload"[^>]*)href="([^"]+)"([^>]*)>/g,
  '',
);

html = html.replace(
  /<script\b([^>]*)type="module"([^>]*)src="([^"]+)"([^>]*)>\s*<\/script>/g,
  (_match, before, middle, src, after) => {
    const file = resolve(root, src);
    const js = readFileSync(file, 'utf8');
    return `<script type="module">${js}</script>`;
  },
);

if (/<(?:script|link)\b[^>]*(?:src|href)="\.\//.test(html)) {
  throw new Error('Inlining failed; index.html still references external build assets.');
}

writeFileSync(indexPath, html);
console.log('dist/index.html was inlined into a single self-contained HTML document.');
