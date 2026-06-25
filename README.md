# BDP — Personal Database Management System

[![CI](https://github.com/ErChulo/bdp-personal-db/actions/workflows/ci.yml/badge.svg)](https://github.com/ErChulo/bdp-personal-db/actions/workflows/ci.yml)
[![Deploy GitHub Pages](https://github.com/ErChulo/bdp-personal-db/actions/workflows/pages.yml/badge.svg)](https://github.com/ErChulo/bdp-personal-db/actions/workflows/pages.yml)

BDP is a single-user, local-first database studio that runs entirely in the browser. It is designed for private work on SQL and NoSQL data without installing a desktop app or running a backend.

It supports:

- SQL databases backed by `sql.js`
- NoSQL collections backed by Dexie / IndexedDB
- import / export / backup workflows
- search, reports, schema diff, and key generation
- offline use from a self-contained HTML bundle or GitHub Pages
- a vault screen for protecting the browser profile with a passphrase

## What, where, who, how, why

| Question | Answer |
|---|---|
| What | A browser-based personal database manager for SQL and NoSQL work. |
| Where | In modern browsers, from GitHub Pages, from `dist/index.html`, or from a local static preview server. |
| Who | One person at a time. It is built for private, local use in a single browser profile. |
| How | React + Vite UI, `sql.js` for SQLite, Dexie for IndexedDB collections, Web Workers for heavy work, service worker caching for hosted builds, and a single-file offline bundle for air-gapped use. |
| Why | To let you inspect, shape, import, export, and practice database work without installing server software or depending on a networked backend. |

## Badges

The repository currently has these workflow badges:

- CI
- Deploy GitHub Pages

If you want more later, the next sensible additions are coverage, release, and size badges.

## Build and run

### Prerequisites

- Node.js 20 or newer
- npm

### Install

```bash
npm ci
```

This installs the exact lockfile versions. It is the right command for reproducible local builds and CI.

### Validate

```bash
npm run typecheck
npm test
```

Typecheck runs the full TypeScript project without emitting JS. `npm test` runs the Vitest suite.

### Build

```bash
npm run build
```

This does three things:

1. compiles TypeScript,
2. builds the Vite app,
3. inlines the final bundle into `dist/index.html` and verifies that the offline artifact has no external asset references.

The build output is intended to be usable offline.

### Serve locally

```bash
npm run serve
```

This serves the built `dist/` folder on `http://127.0.0.1:4173` by default.

### Open the standalone offline file

After building, you can open `dist/index.html` directly from disk. This is the no-server path.

## GitHub Pages deployment

This repository publishes the app with GitHub Actions.

1. Push to `main`.
2. GitHub Actions runs the CI workflow and the Pages deployment workflow.
3. When the Pages workflow finishes successfully, open the published Pages URL.

If you are setting the repository up for the first time:

1. Open the repository on GitHub.
2. Go to `Settings`.
3. Open `Pages`.
4. Under `Build and deployment`, set `Source` to `GitHub Actions`.
5. Push to `main`.

The app is still local-first. GitHub Pages only hosts the static files.

## First use

1. Open the app from GitHub Pages or from `dist/index.html`.
2. Let the app finish loading.
3. Create or unlock the vault if prompted.
4. Create one small SQL database and one small NoSQL collection.
5. Run a drill from the lists below.
6. Refresh once if you are using the hosted version and it shows an update prompt.
7. Keep using the same browser profile if you want local data to persist.

Do not use a private window if you expect persistence. Clearing site data will remove the local workspace.

## Keyboard shortcuts

| Key | Action |
|---|---|
| F1 | Dashboard |
| F2 | SQL Manager |
| F3 | NoSQL Manager |
| F4 | Query |
| F5 | Import |
| F6 | Export |
| F7 | Reports |
| F8 | Key Gen |
| F10 | Search |
| Ctrl/Cmd+K | Command Palette |
| ? | Cheat-sheet from the Dashboard |
| Ctrl/Cmd+Enter | Run the current SQL query |

## Core features

### SQL Manager

- create, open, import, inspect, export, vacuum, and delete SQLite databases
- run SQL in the Query panel
- view tables and schema details
- work with local blobs in the browser

### NoSQL Manager

- create collections with typed fields
- insert, edit, delete, and filter documents
- store everything in IndexedDB through Dexie
- keep collection metadata local to the profile

### Import and export

- CSV
- JSON
- NDJSON
- SQL dumps
- native SQLite files
- `.bdp` archive round-trips

### Reports and search

- column statistics
- histograms
- full-text search across loaded data
- schema diff for SQL databases

### Key generation

- UUID v1
- UUID v4
- UUID v7
- ULID
- hex tokens
- AES key material

### Offline and privacy behavior

- no backend
- no analytics
- no remote database connections
- offline-ready hosted build
- single-file offline artifact for local use

## Architecture

```text
React 19 UI
├── Zustand state
├── sql.js in a Web Worker
├── Dexie 4 on IndexedDB
├── Custom search indexer in a Web Worker
├── Crypto helpers for key generation
├── Service worker for hosted offline caching
└── Inlined standalone build for file:// use
```

Storage is local:

- `IndexedDB` for SQL database blobs, NoSQL collections, and workspace state
- `localStorage` for lightweight UI preferences and history

## Repository layout

- `src/App.tsx` — top-level workspace and startup / vault flow
- `src/shell/` — navigation, status bar, store, keyboard handling, command palette
- `src/sections/` — each app panel
- `src/adapters/` — SQL and NoSQL persistence layers
- `src/importExport/` — archive and file format handling
- `src/search/` — indexing and search logic
- `src/security/` — vault and lock/reset helpers
- `scripts/` — build and verification scripts
- `tests/` — Vitest and browser checks

## Drills: SQL

Use these in order if you want a smooth learning path.

### Beginner drills

1. Create a new SQL database.
2. Create one table with an `id`, a text field, and a numeric field.
3. Insert three rows.
4. Run a `SELECT *` query.
5. Filter with `WHERE`.
6. Sort with `ORDER BY`.
7. Limit the result set with `LIMIT`.

### Intermediate drills

8. Add a second table.
9. Create a relationship in your own schema using matching IDs.
10. Run a `JOIN`.
11. Update one row and verify the change.
12. Delete one row and confirm it is gone.
13. Export the database as a SQL dump.
14. Import that dump into a new database and compare the result.

### Practical drills

15. Import a CSV file into a table.
16. Import a native SQLite file and inspect the schema.
17. Vacuum the database and verify the DB still opens.
18. Use Search to find a value across loaded databases.
19. Use Reports to inspect `count`, `distinct`, `min`, `max`, and `mean`.
20. Use Schema Diff to compare two SQLite databases.

### Stress and recovery drills

21. Load a larger table and test scrolling, filtering, and pagination.
22. Make a backup archive.
23. Delete the source database.
24. Restore from the backup archive.
25. Re-run the same query after restore and compare the result.
26. Close and reopen the app to verify persistence.

## Drills: NoSQL

### Beginner drills

1. Create a new NoSQL collection.
2. Define fields with different types, such as string, number, boolean, date, and json.
3. Insert three documents.
4. Edit one field and save.
5. Delete one document and verify the count changes.

### Intermediate drills

6. Add a nested JSON field.
7. Filter documents by a typed field.
8. Sort a collection by a numeric field.
9. Duplicate a document and change one field.
10. Export the collection to JSON or NDJSON.
11. Import the same data back into a new collection.

### Practical drills

12. Create a collection that models tasks, notes, or contacts.
13. Run Search across NoSQL data.
14. Check Reports on a collection-like dataset.
15. Review the field summary and confirm the typed field list is correct.
16. Rename a field in your own data model and re-import the transformed data.

### Stress and recovery drills

17. Load a larger NoSQL dataset and test scrolling and search.
18. Verify the UI stays usable with many records.
19. Export the dataset to a `.bdp` archive.
20. Restore that archive into a clean profile.
21. Close and reopen the browser profile to confirm persistence.

## Mixed drills

1. Import a small CSV into SQL, then mirror it into NoSQL.
2. Compare the same concept in both stores.
3. Use Search to find one record in each.
4. Use Reports on the SQL version and compare the shape with the NoSQL version.
5. Export both and validate that the data round-trips.

## Testing

```bash
npm run typecheck
npm test
npm run build
npm run security:sql-injection
npm run security:privacy
```

Those checks cover the current implementation gates for types, unit behavior, offline build correctness, SQL injection checks, and privacy-oriented network review.

## Notes on browser behavior

- The first load on GitHub Pages may take a moment while the service worker installs.
- The standalone `dist/index.html` file does not need a server.
- If a browser keeps showing stale UI, hard refresh once or clear site data for the app origin.
- Use the same browser profile if you want local data to remain available.

## Engineering conventions

- Keep the app local-first.
- Prefer plain, explicit UI states over hidden behavior.
- Avoid introducing remote dependencies unless the feature clearly needs them.
- Keep new colors and theme tokens in CSS variables.

## License

Internal / personal use.
