# Quickstart: Validate Reliable Offline BDP

## Prerequisites

- Node.js 20 and dependencies already installed
- Current Chromium available for browser tests
- At least 1.5 GiB free browser-origin storage for the generated large-file scenario

## Quality gates

```bash
npm run typecheck
npm test
npm run build
npm run test:browser
```

Serve the production artifact, not the Vite development server:

```bash
npm run serve
```

Open `http://127.0.0.1:4173/`.

## Recommended workflow

1. Start on Dashboard and create or select a SQL database or NoSQL collection.
2. Use Query, Reports, Search, and Schema Diff to inspect local data.
3. Use Import and Export for bounded file-based data movement.
4. Use Backup / Snapshot for a full portable archive.
5. Keep an eye on the status bar: writable vs read-only tab ownership, offline readiness, and update prompts are all visible there.
6. If the app shows a newer build is ready, finish the current operation, then accept the reload prompt.

## Core durability drill

1. Create SQL database `drills` and table `scores(id INTEGER PRIMARY KEY, name TEXT, score INTEGER)`.
2. Insert `(1, 'Ada', 91)` and `(2, 'Linus', 88)` in Query.
3. Visit Dashboard, Reports, and SQL Manager; return with visible navigation.
4. Reload and run `SELECT * FROM scores ORDER BY id`.
5. Confirm the database name, schema, two rows, values, and active selection survived.
6. Repeat the automated journey 25 times; no trial may substitute an empty database.

## Existing-destination import drill

1. Import compatible CSV columns `id,name,score` into `scores`; confirm preview and append.
2. Import a CSV with `id,name,grade`; confirm a schema mismatch and zero changes.
3. Cancel a large compatible import during parsing; reload and confirm zero imported rows.

## Multi-tab drill

1. Open two tabs at the same origin. Confirm one is writable and the other clearly read-only.
2. Attempt mutation in the reader; it must remain disabled/rejected.
3. Choose `Take over`, confirm it, and verify the first tab immediately loses write capability.
4. Close the owner and verify the remaining tab can explicitly acquire ownership.

## Backup/restore drill

1. Create two SQL databases and one document collection, then create a full backup.
2. Change one existing dataset so its original ID/name will collide.
3. Restore the backup. Confirm existing content is unchanged and the restored collision has a new ID and `restored` suffix.
4. Export and compare schemas, counts, and representative values.
5. Corrupt one archive entry and verify restore commits nothing.

## Offline and update drill

1. Load the served production app once and wait for service-worker activation.
2. Put Chromium offline and reload; open every section and perform local create/query/export/backup actions.
3. Build and serve a changed version while an import is active. Confirm no reload prompt or activation occurs.
4. When the operation finishes, confirm the prompt appears. Decline once and keep working; accept later and verify one controlled reload with all data intact.

## 500 MiB drill

Generate a deterministic 500 MiB CSV/NDJSON fixture during the browser test. Verify bounded preview, progress, cancellation, responsive navigation, successful commit, and reload. Generate a one-byte-larger fixture and verify rejection occurs before any read or durable change. Do not commit either fixture.

## Responsive and accessible drill

At 360 px and 1440 px, visit all 11 primary sections. Confirm every control is reachable, Dashboard is one visible action away, focus is visible, active navigation is programmatically identified, and reduced-motion mode suppresses nonessential spinner/transition animation.
