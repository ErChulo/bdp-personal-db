#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = process.cwd();
const distHtml = resolve(root, 'dist/index.html');

const sourceFiles = walk(resolve(root, 'src'))
  .concat(walk(resolve(root, 'scripts')))
  .filter((file) => !file.endsWith('.map'));

const sourceViolations = [];
for (const file of sourceFiles) {
  if (file.endsWith('scripts/serve-dist.mjs')) continue;
  const text = readFileSync(file, 'utf8');
  const findings = [
    ...text.matchAll(/\b(fetch|WebSocket|XMLHttpRequest|sendBeacon|EventSource)\s*\(/g),
    ...text.matchAll(/https?:\/\/(?!127\.0\.0\.1|localhost|www\.w3\.org)\S+/g),
    ...text.matchAll(/wss?:\/\/(?!127\.0\.0\.1|localhost)\S+/g),
  ];
  if (findings.length) {
    sourceViolations.push(`${relative(root, file)}: ${findings.map((m) => m[0]).join(', ')}`);
  }
}

if (sourceViolations.length) {
  throw new Error(`Privacy audit failed in source files:\n${sourceViolations.join('\n')}`);
}

if (!existsSync(distHtml)) {
  throw new Error('dist/index.html is missing; run the build first.');
}

const html = readFileSync(distHtml, 'utf8');
const attrRefs = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map((m) => m[1]);
const externalRefs = attrRefs.filter((ref) =>
  /^(?:https?:|wss?:|\/\/)/i.test(ref) &&
  !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(ref),
);

if (externalRefs.length) {
  throw new Error(`Privacy audit failed: external asset references found in dist/index.html:\n${externalRefs.join('\n')}`);
}

console.log(`Privacy audit passed: ${sourceFiles.length} source files and dist/index.html contain no external network references in runtime surfaces.`);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return statSync(path).isFile() ? [path] : [];
  });
}
