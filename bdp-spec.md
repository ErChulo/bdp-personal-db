# BDP — Rebuild Spec

> **Status:** Draft (interview-driven). All major decisions captured. Open questions and risks are listed at the end.
> **Replacement for:** The Daytona-hosted instance that was stuck "working" for 3+ hours. Code lives in the local directory `/home/herick/Documents/freebuff/bdp` (currently empty).

---

## 1. Motivation

The previously deployed BDP instance at `https://5173-…daytonaproxy01.net` became unresponsive after extended use and could not be unblocked. The source code lives on a remote Daytona workspace that cannot ship a working build. The user wants a clean rebuild — same product intent, new implementation, all files delivered locally.

**Definition of done for the spec itself:** A future agent (or the user) can read this document and implement BDP without re-asking the questions above.

---

## 2. Product Summary

**BDP** — *Personal Database Management System*. A single-user, browser-only desktop-quality tool that lets one person:

- Create, open, edit, and delete multiple personal databases (SQL and NoSQL — same UI).
- Run ad-hoc queries against any database and inspect results.
- Import & export data in common formats without leaving the app.
- Generate cryptographic / identifier keys for use in stored records.
- Inspect data with per-column summary reports.
- Search across every loaded database from one field.
- Snapshot, compare, and restore databases.

The deployed target reproduced a retro-terminal feel. The rebuild preserves that feel at **medium intensity** (no scanlines / flicker, just dark base + monospace + retro palette).

---

## 3. Stack & Constraints

| Layer | Decision | Rationale |
|---|---|---|
| Bundler / dev server | **Vite** (port 5173) | Matches the deployed instance; familiar HMR. |
| Language | **TypeScript** (strict) | Required for a data-tool of this complexity. |
| Framework | **React 18** | Mature global-hotkey/modal/palette patterns; matches "React + TS" choice. |
| Persistence | **100% client-side** | Each user explicitly asked to **stay 100% client-side** after the Daytona incident. |
| SQL engine | **sql.js** (SQLite compiled to WASM) | Already in deployed version; runs in a worker. |
| NoSQL engine | **Dexie.js** wrapping IndexedDB | Already in deployed version; clean async API. |
| Files / blobs | **OPFS / IndexedDB** | Same storage layer; avoids localStorage quota. |
| State management | **Zustand** (small) or React Context + reducer | Pick Zustand for less boilerplate. |
| Routing | None (keyboard-driven SPA with a single registry) | No need for `react-router` — nav is by section. |
| Styling | **CSS variables + module CSS** (no Tailwind) | The retro-terminal aesthetic fits a hand-tuned system. |
| Testing | **Vitest** for core layers; UI untested | User choice. |
| Build target | Static site (deployable to any CDN, runnable via `npm run dev`) | Single-port local-only experience remains possible. |

**Hard constraints:**
- No backend. No remote calls. No analytics. **Offline-capable** after first load.
- Lua/Postgres/Snowflake/etc. out of scope. Stick with SQLite-flavored SQL + IndexedDB docs.
- No login, no signup. Single user, single device, single browser profile.

---

## 4. Delivery

- **Output directory:** `/home/herick/Documents/freebuff/bdp` (currently empty).
- `npm install && npm run dev` boots the app at `http://localhost:5173`.
- `npm run build` produces a static site in `dist/`. Open `dist/index.html` directly or serve from any static host.
- All source, configs, README, .gitignore, and Vitest setup included in the repo.
- No deployment step required from the user. (Re-deployment to Daytona is *out of scope for the rebuild* but the build output is portable.)

---

## 5. Information Architecture

### 5.1 Keyboard map (F-keys)

| Key | Section | Type |
|---|---|---|
| **F1** | Dashboard | Read-only overview |
| **F2** | SQL Manager | Create/open/edit SQL DBs |
| **F3** | NoSQL Manager | Create/open/edit NoSQL collections |
| **F4** | Query | Ad-hoc SQL runner against the active DB |
| **F5** | Import | Drop-in / pick files to ingest |
| **F6** | Export | Render and download selected DB contents |
| **F7** | Reports | Per-column data summaries |
| **F8** | Key Gen | UUIDs, ULIDs, hex tokens, AES keys |
| **F9** | (reserved) | Future: Saved Queries (deferred — not selected as a new section) |
| **F10** | Search | Full-text across all loaded DBs |
| **Ctrl/Cmd+K** | Command palette | Jump-to / run actions (always available) |
| **Ctrl/Cmd+,** | Settings | Theme switcher, layout profiles, reset |

**Rules:**
- F-keys switch sections **only when no text input has focus**, except inside Query (where F4 stays current).
- Browser default behavior of F5 (refresh) is preserved only if we explicitly avoid intercepting it. We *do* intercept F-keys; the user can press Ctrl+R for refresh.
- A persistent top status bar shows current section, active DB name, storage quota, and ON/OFFLINE indicator.

### 5.2 Section sub-views

Each section is a "panel" with a consistent header bar (title + F-key label + back-to-Dashboard button) and a content area sized to viewport.

---

## 6. Section Specs (F1–F10 + new)

### F1 — Dashboard
- Status block: ON/OFFLINE (always ONLINE — no real network), IndexedDB usage bar, count of SQL DBs and NoSQL collections, last activity timestamp.
- Quick actions: + New SQL DB, + New NoSQL collection, Open Backup, Theme switcher entry.
- Recent activity: last 20 actions (create/open/import/query/export/snapshot). Persisted under a small IndexedDB key.

### F2 — SQL Manager
- List of SQL databases (cards/rows): name, size, table count, last modified.
- "New SQL DB" wizard: name + optional initial schema as CREATE TABLE statements.
- "Open" → enters DB detail view with tabs: **Schema**, **Data**, **Indexes**, **Settings**.
- **Schema tab**: list of tables; clicking a table shows columns (name, type, PK?, NULL?, default) and indexes.
- **Data tab**: virtualized table view, page size 50, prev/next and "jump to row".
- **Settings tab**: rename, vacuum/optimize, delete (with confirm), export entry point.
- Backend: **sql.js** loaded inside a Web Worker. Each DB persisted as a single Uint8Array in IndexedDB after every commit.

### F3 — NoSQL Manager
- Same shape as F2 but for collections.
- Each **collection** owns explicit fields (declared at create time, mutable). Fields have types: `string`, `number`, `boolean`, `date`, `json`.
- **Schema tab**: fields list + composite indexes.
- **Data tab**: list-edit view per document.
- Backend: **Dexie.js**; one Dexie DB per app, with one table per NoSQL collection (`c_${id}`).

### F4 — Query
- A SQL-only editor (`<textarea>` with monospace + autocomplete on table/column names).
- "Run" button (also Ctrl/Cmd+Enter).
- **Result panel**: column headers, ASCII table, pagination, "Export these results".
- **History pane** on the right: last 50 queries (saved in IndexedDB under `__query_history`).
- Errors render in a red bar with line/col highlighting (show first error).
- Only runs against the **currently active** DB. Switching DB resets the editor only if the user consents.

### F5 — Import
- Drop zone + file picker. Multi-select supported.
- **Accepted formats** (per user choice):
  - **CSV** with header — auto-detect delimiter (`,` `;` `\t`), strip BOM, infer types (number/bool/date/null).
  - **JSON** array of objects.
  - **NDJSON** one object per line.
  - **SQL dump** — portable tokenizer; handles `CREATE TABLE` + `INSERT INTO ... VALUES (...)`; multi-row VALUES supported.
  - **`.sqlite` / `.db`** — read with sql.js, copy into a fresh managed DB.
- After parse, show a **dry-run preview** (first 10 rows + detected schema). User picks destination DB (existing or new) and starts the import.
- Streaming/chunked reads; progress bar; **cancel** supported at chunk boundaries.

### F6 — Export
- Source picker: select a DB (SQL or NoSQL). If SQL, select tables to include.
- **Accepted output formats** (per user choice):
  - **CSV** — one file per table, packaged in a `.zip` if multi-table.
  - **JSON / NDJSON** — both supported; one document per object, collection name as top-level key in JSON.
  - **SQL dump** — `CREATE TABLE` + `INSERT INTO ... VALUES (...)`, transactional wrapper.
  - **`.bdp` backup archive** — zip containing `manifest.json`, SQL DBs as `.sqlite` blobs, NoSQL collections as `.jsonl` files. Round-trips perfectly with the Backup section.
- Streaming writes go to the user's downloads folder via `Blob` + anchor click.

### F7 — Reports (Data Summaries)
- Active DB picker (or "all databases").
- For each numeric column: `count, missing, distinct, min, max, mean, median, stddev, p25/p75/p95`.
- For each string column: `count, missing, distinct, top-10 values with counts, avg length`.
- For each date column: `count, missing, min, max, range`.
- Per-column **distribution histogram** for numerics (default 20 bins, configurable).
- **Drill-down** from any cell into the rows contributing to it (runs an internal SQL query).
- "Render to ASCII / SVG" toggle for the histogram. Plain SVG works for share-screenshots; ASCII keeps the retro feel.
- Export the report as `.json`, `.csv` (one row per column/x-stat), or printable HTML (CSS-styled monospace).

### F8 — Key Gen
- Tabs:
  - **UUIDs** — v1, v4, v7 (time-ordered), bulk-generate count.
  - **ULIDs** — same as UUIDs but 26-char Crockford base32.
  - **Hex tokens** — bit-length (128/256/512), count.
  - **AES keys** — bit-length (128/192/256), output format (hex / base64). **Generate in a worker** so the key never touches the main thread long enough to be observed in profiler leaks.
- Copy each value, copy all, or download as `.txt` / `.json`.
- **Never persist** generated keys. No IndexedDB write here.

### F10 — Search (full-text across all loaded DBs)
- One input box; live results.
- Indexes: small inverted index per DB stored in IndexedDB. Built lazily on first import/insert/query; rebuilt automatically when a DB changes.
- Filters: by DB, by table/collection, by column/field, by date range.
- Results show: source DB → table → matched column → matched value snippet (with highlight), plus "jump to row".
- Indexing code lives in a worker (`search.worker.ts`).
- **Privacy**: searches are local. No remote calls.

### New: Backup / Snapshot
- Section reached via F1 or Ctrl/Cmd+K → "Backup".
- Lists existing snapshots (timestamp, source DB, size, label).
- "Create snapshot" wizard: source DB (or all), compression (zlib yes/no), label, optional note.
- "Restore" — picks a snapshot, runs danger-confirm flow, replaces the destination DB atomically.
- Format: `.bdp` zip (manifest + blobs/jsonl). Same as export's `.bdp` archive.
- Implemented atop **fflate** (small, fast, no natives) to keep WASM bundles small.

### New: Schema Visualizer / Diff
- Render a SQL DB as a directed graph: tables as nodes, foreign-key-like references inferred from column names (`_id`, `Id`, `UUID`) as dashed edges.
- For NoSQL, render a hierarchical tree: root = DB, children = collections, grandchildren = fields.
- **Diff view**: two snapshots side-by-side; rows colored: added / removed / modified / unchanged.
- Operations: export the visualizer layout as `.json` (for sharing), save pinned layouts.

### New: Command Palette (Ctrl/Cmd+K)
- Modal over any section.
- Two modes: **Jump** (go to a section / DB / collection) and **Action** (e.g. "Run last query", "Export active DB as SQL dump", "Switch to Amber theme").
- Fuzzy match on keys + labels + recent commands.
- Result list fully keyboard-navigable.
- Powered by a small local registry; no dynamic plugin loader.

### New: Themes / Layouts
- Built-in themes: **Amber Phosphor**, **Green Phosphor**, **Mono Inverse** (light text on near-black), **Lilac** (muted pink/violet, easy on the eyes).
- Theme switcher in F1 (Dashboard) and Ctrl/Cmd+, (Settings).
- Layout profiles: standard, compact, and focus (hides header bar).

---

## 7. Aesthetic System (Medium Retro)

- **Background:** `#0f1118` (near-black, slightly blue).
- **Palette accents:** muted cyan `#5cf2d6`, amber `#f7b955`, green `#7cd87c`, magenta `#e879f9`, red `#ff6f6f`.
- **Type:** `JetBrains Mono` (fallback `ui-monospace, SFMono-Regular, Menlo, Consolas`). Sizes 12 / 14 / 16 px only.
- **Borders:** 1px solid accent with low opacity. ASCII-art table rules (`┌ ┐ └ ┘ ─ │ ┬ ┴ ├ ┤ ┼`).
- **Cursors:** block cursor with subtle blink (≈600 ms).
- **No** scanlines. **No** flicker. **No** afterglow.
- **Motion budget:** ≤ 80 ms per transition. Scrollbars styled retro.
- Accessibility: high-contrast variants per theme; respects `prefers-reduced-motion` (cursor blink and palette switch happen instantly).

---

## 8. Data Model & Persistence Summary

```
IndexedDB ("bdp-meta")
  ├─ __meta                  (key/value: schema version, theme, layout, recent activity)
  ├─ __query_history         (array)
  ├─ __snapshots             (array of snapshot manifests)
  ├─ __search_index          (inverted index metadata)
  ├─ sql_dbs                 (id → { name, createdAt, updatedAt, bytes: Uint8Array })
  └─ nosql_dbs               (managed by Dexie — each DB is one Dexie database)

Dexie databases (one per collection group; or all in one with namespaced tables)
  └─ c_${collectionId}       (primary key auto, indexed declared fields)

Web Workers
  ├─ sql.worker.ts           (sql.js instance; receives queries + mutators)
  ├─ search.worker.ts        (FTS indexer)
  └─ crypto.worker.ts        (key generation; AES key derivation)
```

---

## 9. Error Handling Philosophy

- **No silent failures.** Every async operation shows a status. Even success.
- Errors render in a red ASCII banner with one line of remediation advice ("Try restarting the worker", "Quota exceeded — export and clean up", "Snapshot corrupted — restore from backup").
- After a worker crashes (sql.js OOM, etc.) the user gets a one-click "Restart worker" action and the bad input is recorded for inspection.
- IndexedDB quota issues are caught up-front before big imports; the user sees the remaining budget in MB and a suggestion to free space.

---

## 10. Testing Strategy (Vitest)

Coverage limited to **core logic**, not UI:

| Module | What to test |
|---|---|
| `sqlAdapter` | round-trip create / insert / select / delete, FK-less integrity, blob export/import parity |
| `nosqlAdapter` (`Dexie`) | CRUD, indexed field lookups, JSON round-trip |
| `importer/csv` | BOM, delimiter auto-detect, type inference, escape edge cases |
| `importer/json.ndjson` | array + line-by-line, schema inference |
| `importer/sqlDump` | multi-row VALUES, escaped quotes, transaction wrap |
| `importer/sqliteFile` | byte-for-byte fidelity to a `.sqlite` re-import via sql.js |
| `exporter/sqlDump` | produced SQL re-imports cleanly |
| `exporter/backupArchive` | `.bdp` round-trip: export → re-import via Backup → equal |
| `searchIndexer` | tokenization, ranking, filtering, diff after a mutation |
| `reports/aggregations` | min/max/mean/median/stddev/histogram with deterministic fixtures |
| `keygen/*` | UUID v4/v7 monotonicity, ULID monotonicity, AES key length |
| `backup/diff` | manifest equality, snapshot→restore parity |

UI flows are not in scope for tests. Manual smoke after each section completes is enough.

---

## 11. Out of Scope (Explicit Non-Goals)

- Authentication / multi-user.
- Sync / cloud / remote DB connections (Postgres, MySQL, Mongo servers).
- Realtime collaboration.
- Mobile-specific UX (desktop-class browser only).
- Plugin system / extension API.
- Plotting charts (histograms are ASCII / SVG only).
- Saved query library (deferred from Round 3 — `F9` reserved).
- Backwards compatibility with the broken Daytona instance. We don't migrate state.

---

## 12. Risks & Open Questions

| Risk | Mitigation |
|---|---|
| sql.js + Dexie + fflate + a JetBrains Mono webfont = bulky startup. | Lazy-import heavy libs after first interaction; webfont system fallback first. |
| IndexedDB quota ~ 1 GB in some browsers; large imports can OOM. | Pre-flight quota check on import; chunked writes; surface remaining MB. |
| sql.js in a single worker = only one big DB-wide mutation at a time. | Use cooperative scheduling; show a queue indicator on F4 / F2. |
| No `react-router` → modal/stack management is hand-rolled. | Use `@zag-js/store` patterns or a tiny `useSection` URL hash if dev needs deep links. |
| `.bdp` archive format needs versioning. | `manifest.json` carries `formatVersion: 1` and a list of supported features. |
| Search indexing over a 1M-row DB can be slow on first build. | Show progress; allow canceling the index; persist partial state. |

**Open questions left for future work:**

- Reserved F9 — Saved Queries. **Decision recorded as deferred.**
- "Active DB" model — global singleton, or per-tab? Default proposed here: global singleton with last-opened DB persisted.
- Whether to support CSV import into NoSQL collections (yes, by default: each CSV row becomes a document).
- Whether to expose a Pluggable driver adapter (Round 2 had this as an option; not selected as the primary mode).

---

## 13. Milestones / Build Order

The build order is ordered to fail fast on the riskiest parts first.

1. **M1 — Skeleton & shell** (1 session)
   Vite + React + TS bootstrap, dark theme, keyboard nav between sections (empty panels), status bar.
2. **M2 — SQL Manager core** (1–2 sessions)
   sql.js worker, create/open/delete DB, schema tab, data tab virtualized, IndexedDB persistence.
3. **M3 — NoSQL Manager core** (1–2 sessions)
   Dexie layer, collections, fields, list/edit data, schema tab.
4. **M4 — Import & Export** (1 session)
   CSV + JSON/NDJSON + SQL dump + `.sqlite`/`.bdp` archive. Streaming progress.
5. **M5 — Query** (1 session)
   Editor, history, result grid, Exec/Ctrl+Enter.
6. **M6 — Reports** (1 session)
   Per-column aggregations; histogram (SVG + ASCII).
7. **M7 — Key Gen** (0.5 session)
   UUID/ULID/hex/AES worker.
8. **M8 — Search** (1 session)
   Indexer worker, live results, filters.
9. **M9 — Backup / Schema Diff** (1–2 sessions)
   `.bdp` round-trip; visualizer; diff view.
10. **M10 — Command Palette + Themes** (0.5 session)
    Palette, theme switcher, layout profiles.
11. **M11 — Vitest coverage** (overlaps each M-stage)
12. **M12 — Polish & docs** (1 session)
    README, in-app help (Ctrl+/ ), keyboard cheatsheet (`?`).

---

## 14. Acceptance Criteria

The rebuild is "done" when:

- `npm install && npm run dev` boots without errors on a fresh clone.
- All F1–F10 sections are reachable by their F-keys and Ctrl/Cmd+K palette.
- Two distinct SQL DBs can be created, populated via Import, queried, exported, and restored from a `.bdp` backup.
- A NoSQL collection with at least 200 documents can be created, fields can be added/removed, and full-text search returns ranked matches.
- Per-column Reports render with histograms for a 10k-row numeric column in under 300 ms (worker).
- Key Gen produces UUIDv7 / ULID sequences that are monotonically non-decreasing within the same millisecond.
- Vitest suite passes (`npm test`) on the modules listed in §10.
- No console errors on a clean open, except the documented source-map warnings from sql.js / fflate (acceptable).
- The README documents one happy-path tutorial: "From zero to first query in 90 seconds".

---

## 15. Source Layout (target tree)

```
/home/herick/Documents/freebuff/bdp/
├── README.md
├── SPEC.md                 (this file)
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── shell/
│   │   ├── StatusBar.tsx
│   │   ├── KeyboardNav.tsx
│   │   ├── CommandPalette.tsx
│   │   └── theme.css
│   ├── sections/
│   │   ├── Dashboard.tsx
│   │   ├── SqlManager.tsx
│   │   ├── NosqlManager.tsx
│   │   ├── Query.tsx
│   │   ├── Import.tsx
│   │   ├── Export.tsx
│   │   ├── Reports.tsx
│   │   ├── KeyGen.tsx
│   │   ├── Search.tsx
│   │   ├── Backup.tsx
│   │   └── SchemaDiff.tsx
│   ├── adapters/
│   │   ├── sqlAdapter.ts
│   │   ├── nosqlAdapter.ts
│   │   └── metaStore.ts
│   ├── importExport/
│   │   ├── csv.ts
│   │   ├── json.ts
│   │   ├── sqlDump.ts
│   │   ├── sqliteFile.ts
│   │   └── bdpArchive.ts
│   ├── reports/
│   │   ├── aggregations.ts
│   │   └── histogram.ts
│   ├── search/
│   │   └── indexerCore.ts
│   ├── keygen/
│   │   ├── uuid.ts
│   │   ├── ulid.ts
│   │   └── aes.ts
│   └── workers/
│       ├── sql.worker.ts
│       ├── search.worker.ts
│       └── crypto.worker.ts
└── tests/                  (Vitest)
    ├── sqlAdapter.test.ts
    ├── nosqlAdapter.test.ts
    ├── importers.test.ts
    ├── exporters.test.ts
    ├── reports.test.ts
    ├── keygen.test.ts
    ├── backup.test.ts
    └── searchIndexer.test.ts
```

---

## 16. One-paragraph recap for a hurried reader

> Rebuild BDP as a 100% client-side, single-user app: Vite + React + TypeScript + sql.js + Dexie, F1–F10 sections (Dashboard, SQL/NoSQL Mgrs, Query, Import, Export, Reports, Key Gen, Search) backed by a "medium retro" aesthetic, plus four new sections (Backup/Snapshot, Schema Visualizer/Diff, Command Palette, Themes). Import accepts CSV, JSON/NDJSON, SQL dump, and `.sqlite`/`.db`. Export produces CSV, JSON/NDJSON, SQL dump, and `.bdp` backup archives. Reports run per-column data summaries (min/max/mean/median/distinct/histogram). Key Gen handles UUIDs (v1/v4/v7), ULIDs, hex tokens, and AES keys in a worker. Search is full-text across all loaded DBs, lazily indexed. Vitest covers the core adapters, importers, exporters, reports, keygen, backup, and indexer — UI is untested. Output goes to `/home/herick/Documents/freebuff/bdp`, runnable via `npm install && npm run dev`, buildable via `npm run build`.
