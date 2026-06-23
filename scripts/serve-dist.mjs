#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve(process.cwd(), 'dist');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

if (!existsSync(resolve(root, 'index.html'))) {
  console.error('dist/index.html is missing; run `npm run build` first.');
  process.exit(1);
}

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
  const candidate = resolve(root, `.${pathname}`);
  const insideRoot = candidate === root || candidate.startsWith(`${root}${sep}`);
  const file = insideRoot && existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : resolve(root, 'index.html');

  response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
  const revalidate = file.endsWith('index.html') || file.endsWith('sw.js');
  response.setHeader('Cache-Control', revalidate ? 'no-cache' : 'public, max-age=31536000, immutable');
  createReadStream(file).pipe(response);
}).listen(port, host, () => {
  console.log(`BDP available at http://${host}:${port}`);
});
