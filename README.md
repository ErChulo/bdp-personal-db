# BDP — Personal Database Management System [Work in progress]

[![CI](https://github.com/ErChulo/bdp-personal-db/actions/workflows/ci.yml/badge.svg)](https://github.com/ErChulo/bdp-personal-db/actions/workflows/ci.yml)

A 100% client-side, single-user database manager for the browser. Built per `bdp-spec.md`.

## Quickstart

```bash
npm ci              # requires the registry, or a previously populated npm cache
npm run dev         # http://localhost:5173
npm run typecheck   # tsc -b --noEmit
npm test            # vitest run
npm run build       # static build to dist/
npm run serve       # serve dist/ locally at http://127.0.0.1:4173
```

The production build uses relative asset URLs and precaches itself after the
first HTTP load, so reloads continue to work without a network connection.
Browsers do not support service workers from `file://`; use `npm run serve`
for a local offline copy. A cold `npm ci --offline` still requires a populated
npm cache because third-party packages are not vendored in this repository.

No backend, remote application calls, or analytics are used.

## GitHub Pages Offline Workflow

This is the office-safe path when you cannot install Node.js, Python,
PowerShell launchers, desktop apps, or local servers.

The repository publishes the production build to GitHub Pages through
`.github/workflows/pages.yml`. The app is still local-first: GitHub Pages only
serves the static files. Your databases stay in your browser's IndexedDB.

### One-time repository setup

1. Push this repository to GitHub.
2. In GitHub, open the repository `Settings`.
3. Open `Pages`.
4. Under `Build and deployment`, set `Source` to `GitHub Actions`.
5. Push to `main`, or run the `Deploy GitHub Pages` workflow manually from the
   repository `Actions` tab.
6. When the workflow finishes, open the Pages URL shown in the deploy summary.

For this repository, the expected URL shape is:

```text
https://erchulo.github.io/bdp-personal-db/
```

### First use at the office

1. Open the GitHub Pages URL while online.
2. Wait for the app to finish loading.
3. Refresh once while still online. This gives the service worker a chance to
   take control of the page after installation.
4. Bookmark the GitHub Pages URL.
5. Create a small test SQL DB and run a query.
6. Disconnect from the network or switch the browser offline.
7. Open the bookmark again.

Expected result: the app shell loads from the browser cache and your local data
is still present.

Use the same browser and browser profile. Clearing site data, using private
browsing, or switching browsers will remove or hide the local IndexedDB data.

## Keyboard

| Key | Action |
|---|---|
| **F1** | Dashboard |
| **F2** | SQL Manager |
| **F3** | NoSQL Manager |
| **F4** | Query |
| **F5** | Import |
| **F6** | Export |
| **F7** | Reports |
| **F8** | Key Gen |
| **F10** | Search |
| **Ctrl/Cmd+K** | Command Palette |
| **?** | Cheat-sheet (on Dashboard) |

Inside Query, **Ctrl/Cmd+Enter** runs the current SQL.

## What it does

- **SQL Manager (F2)** — create / open / import SQLite databases with sql.js running in a Web Worker.
- **NoSQL Manager (F3)** — declare collections with typed fields (string / number / boolean / date / json) on Dexie/IndexedDB.
- **Query (F4)** — write SQL against the active DB; results render as ASCII tables; history persisted.
- **Import (F5)** — accept `.csv`, `.json`, `.ndjson`, `.sql` dumps, native `.sqlite` files; dry-run preview before applying.
- **Export (F6)** — pick a DB and a format; CSV / JSON / NDJSON / SQL dump / `.bdp` archive.
- **Reports (F7)** — per-column `count / missing / distinct / min / max / mean / median / stddev / p25 / p75 / p95` plus ASCII or SVG histograms.
- **Key Gen (F8)** — UUID v1 / v4 / v7 (time-ordered), ULID, hex tokens, AES keys (offloaded to a worker).
- **Search (F10)** — full-text across every loaded DB. Build an inverted index lazily, then rank.
- **Backup / Schema Diff** — `.bdp` archive round-trips (sql blobs + JSONL); visualizer + diff for two SQL DBs.
- **Themes** — Mono Inverse / Amber / Green / Lilac; Compact / Standard / Focus layouts.
- **Command Palette** — Ctrl/Cmd+K, fuzzy jump + action registry.

## Architecture

```
React 19 (UI)
 ├── Zustand (UI state + recent + theme/layout + history)
 ├── sql.js (SQL, via Web Worker)
 ├── Dexie 4 (NoSQL, IndexedDB-backed)
 ├── fflate (.bdp = zip with manifest.json + sql blobs + nosql jsonl)
 ├── Custom FTS indexer (Web Worker)
 ├── Crypto worker (AES key generation)
 └── Vitest (core logic)
```

Storage lives in two places:
- `IndexedDB` — `bdp-sql` (sql blob per DB), `bdp-nosql` (Dexie), `bdp-meta` (UI state via zustand+localStorage).
- `localStorage` — `bdp-meta` (recent activity, theme/layout, query history).

## Files of interest

- `bdp-spec.md` — the full product spec.
- `src/App.tsx` — top-level section router.
- `src/shell/` — keyboard nav, status bar, command palette, store.
- `src/adapters/sql.*.ts` + `src/sections/SqlManager.tsx` — the SQL story.
- `src/adapters/nosqlAdapter.ts` + `src/sections/NosqlManager.tsx` — the NoSQL story.
- `src/importExport/bdpArchive.ts` — the round-trip archive format.
- `src/reports/aggregations.ts` — pure aggregation functions (covered by tests).
- `src/search/indexerCore.ts` — pure indexer functions (covered by tests).
- `src/keygen/uuid.ts` + `ulid.ts` — monotonic IDs (covered by tests).
- `tests/` — Vitest coverage for the core logic.

## Tested behaviour (Vitest)

| Module | What is verified |
|---|---|
| `csv` | BOM strip, delimiter auto-detect, type inference, round-trip |
| `json` | array + ndjson, line-precise errors |
| `sqlDump` | CREATE / INSERT, multi-table, IF NOT EXISTS, round-trip |
| `bdpArchive` | round-trip with sql blob + jsonl |
| `keygen` | UUID v4/v7 format, ULID monotonicity, hex lengths |
| `aggregations` | numericStats, column stats, top values |
| `searchIndexer` | tokenize, indexing, ranking, serialize round-trip |
| `asciiTable` | box-drawing, NULL handling |

## Conventions

- No `any` in app code (a few unguarded casts inside sql.worker.ts to satisfy sql.js typings).
- Theme tokens are CSS variables under `:root[data-theme=…]`. Don't introduce new colours inline.
- ASCII tables use `┌ ┐ └ ┘ ─ │ ┬ ┴ ├ ┤ ┼` consistently.
- Errors render in the red `banner danger` class; never silent.

Project governance and non-negotiable engineering principles are defined in
`.specify/memory/constitution.md`.

## Out of scope

- Multi-user / authentication / sync
- Remote DB connections (Postgres / MySQL / Mongo servers)
- Saved-queries library (deferred per `bdp-spec.md` §3 round 3)
- Backwards-compat with the broken Daytona instance — we don't migrate state

## License

Internal / personal use.
