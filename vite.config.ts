import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function offlineServiceWorker(): Plugin {
  return {
    name: 'bdp-offline-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = ['./index.html', ...Object.values(bundle)
        .map((entry) => `./${entry.fileName}`)
        .filter((file) => !file.endsWith('.map'))]
        .sort();
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const CACHE = ${JSON.stringify(`bdp-${version}`)};
const PRECACHE = ${JSON.stringify(files)};
const ROOT = new URL('./', self.location.href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((file) => new URL(file, ROOT).href)))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('bdp-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clients) => Promise.all(clients.map((client) => client.postMessage({ type: 'ACTIVATED', buildId: CACHE })))),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING' && (!event.data.buildId || event.data.buildId === CACHE)) {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === 'navigate';
  const isIndex = url.pathname.endsWith('/index.html');
  const isServiceWorker = url.pathname.endsWith('/sw.js');

  if (isNavigation || isIndex || isServiceWorker) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok && isIndex) {
          caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(async () => {
        if (isNavigation || isIndex) {
          const fallback = await caches.match(new URL('./index.html', ROOT).href);
          if (fallback) return fallback;
        }
        const cached = await caches.match(event.request);
        if (cached) return cached;
        throw new Error('Resource unavailable offline');
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(async () => {
      if (event.request.mode === 'navigate') {
        const fallback = await caches.match(new URL('./index.html', ROOT).href);
        if (fallback) return fallback;
      }
      throw new Error('Resource unavailable offline');
    })),
  );
});
`,
      });
    },
  };
}

export default defineConfig({
  // Keep every emitted URL relative so the build works under any directory.
  base: './',
  // public/sql-wasm was a redundant copy of the WASM imported with `?url`.
  publicDir: false,
  plugins: [react(), offlineServiceWorker()],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['sql.js'],
  },
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    sourcemap: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
