# BDP — Personal Database Management System [Work in progress]

[![CI](https://github.com/ErChulo/bdp-personal-db/actions/workflows/ci.yml/badge.svg)](https://github.com/ErChulo/bdp-personal-db/actions/workflows/ci.yml)

A 100% client-side, single-user database manager for the browser. Built per `bdp-spec.md`.

## Quickstart

```bash
npm install         # also copies sql.js wasm into public/sql-wasm/
npm run dev         # http://localhost:5173
npm run typecheck   # tsc -b --noEmit
npm test            # vitest run
npm run build       # static build to dist/
```

That is the entire CLI surface. No backend, no remote calls, no analytics.

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

## Out of scope

- Multi-user / authentication / sync
- Remote DB connections (Postgres / MySQL / Mongo servers)
- Saved-queries library (deferred per `bdp-spec.md` §3 round 3)
- Backwards-compat with the broken Daytona instance — we don't migrate state

## License

Internal / personal use.
