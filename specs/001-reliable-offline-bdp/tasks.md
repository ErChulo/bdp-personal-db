# Tasks: Reliable Offline BDP

**Input**: Design documents from `/specs/001-reliable-offline-bdp/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: Required for persistence, offline packaging, and cross-section journeys.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Tooling and scaffolding needed before feature work lands.

- [ ] T001 Add the browser test runner, config, and package scripts in `package.json` and `playwright.config.ts`
- [ ] T002 [P] Create shared browser test helpers and large-fixture utilities in `tests/helpers/browser.ts` and `tests/fixtures/large-files.ts`
- [X] T003 [P] Add the workspace module scaffold and shared runtime types in `src/workspace/types.ts`, `src/workspace/errors.ts`, and `src/workspace/operations.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core runtime coordination that every user story depends on.

- [X] T004 Implement the exclusive writer lease, takeover flow, and tab ownership state in `src/workspace/lease.ts` and `src/shell/store.ts`
- [X] T005 Add operation registry and busy-state tracking for query, mutation, import, export, backup, and restore in `src/workspace/operations.ts` and `src/shell/StatusBar.tsx`
- [X] T006 [P] Wire read-only shell affordances and ownership feedback into the persistent chrome in `src/shell/AppNavigation.tsx`, `src/shell/StatusBar.tsx`, and `src/App.tsx`
- [X] T007 Implement atomic SQL persistence primitives, exact-bytes rehydration, and rollback recovery hooks in `src/adapters/sqlStore.ts`, `src/adapters/sqlAdapter.ts`, and `src/adapters/sql.worker.ts`
- [X] T008 Implement shared file-size, checksum, and staging helpers for import and restore flows in `src/importExport/csv.ts`, `src/importExport/json.ts`, `src/importExport/sqlDump.ts`, `src/importExport/sqliteFile.ts`, and `src/importExport/bdpArchive.ts`

**Checkpoint**: The workspace can now coordinate ownership, report busy state, and support durable storage work without cross-story collisions.

---

## Phase 3: User Story 1 - Trust Durable SQL Work (Priority: P1)

**Goal**: Create, open, mutate, reload, and revisit SQL databases without losing durable state.

**Independent Test**: Create a database, define a table, insert and modify rows, navigate away, reload, and verify the exact stored database bytes, schema, records, and active selection are preserved.

- [ ] T009 [P] [US1] Add regression coverage for SQL rehydration, reload durability, empty-database fallback prevention, and a first-database create/table/query browser drill that completes within 90 seconds in `tests/sqlAdapterPersistence.test.ts` and `tests/browser/sql-durable.spec.ts`
- [ ] T010 [US1] Add multi-tab write-ownership regression coverage in `tests/browser/multi-tab.spec.ts` and `tests/sqlAdapterPersistence.test.ts`
- [X] T011 [US1] Replace any silent empty-database substitution with exact stored-byte loading and actionable missing/corrupt errors in `src/adapters/sqlAdapter.ts` and `src/adapters/sqlStore.ts`
- [X] T012 [US1] Implement fenced SQL mutation commit, strict revision checking, and worker rollback on persistence failure in `src/adapters/sqlAdapter.ts`, `src/adapters/sql.worker.ts`, and `src/workspace/lease.ts`
- [X] T013 [US1] Persist and restore the active SQL selection, schema view, and query entry state in `src/shell/store.ts`, `src/sections/SqlManager.tsx`, `src/sections/Query.tsx`, and `src/sections/Dashboard.tsx`
- [X] T014 [US1] Surface durable SQL errors and recovery actions in the SQL manager, query view, and status bar in `src/sections/SqlManager.tsx`, `src/sections/Query.tsx`, and `src/shell/StatusBar.tsx`

**Checkpoint**: SQL databases survive navigation and reload without substitution, and write success only reports after durable commit.

---

## Phase 4: User Story 2 - Navigate Every Workflow (Priority: P1)

**Goal**: Move between Dashboard and every primary section using visible controls without getting trapped.

**Independent Test**: Open each primary section with pointer controls and return to Dashboard from each section without reloading or using a shortcut.

- [ ] T015 [P] [US2] Add navigation and responsive journey coverage in `tests/browser/navigation.spec.ts` and `tests/browser/responsive.spec.ts`
- [ ] T016 [P] [US2] Rework the persistent navigation shell and active-section affordances in `src/shell/AppNavigation.tsx`, `src/shell/StatusBar.tsx`, and `src/styles/app.css`
- [ ] T017 [US2] Add visible Dashboard return paths, section headers, and active-state markers to every primary workflow view in `src/sections/Dashboard.tsx`, `src/sections/SqlManager.tsx`, `src/sections/NosqlManager.tsx`, `src/sections/Query.tsx`, `src/sections/ImportPanel.tsx`, `src/sections/ExportPanel.tsx`, `src/sections/Reports.tsx`, `src/sections/KeyGen.tsx`, `src/sections/SearchPanel.tsx`, `src/sections/Backup.tsx`, and `src/sections/SchemaDiff.tsx`
- [ ] T018 [US2] Add reduced-motion-aware loading treatment and a sleeker waiting spinner in `src/App.tsx`, `src/styles/theme.css`, and `src/styles/app.css`
- [ ] T019 [US2] Fix the import and backup flows so users can return to prior sections without losing context in `src/sections/ImportPanel.tsx`, `src/sections/Backup.tsx`, and `src/sections/ExportPanel.tsx`

**Checkpoint**: Every primary section is visibly reachable, and the shell remains navigable at desktop and narrow widths.

---

## Phase 5: User Story 3 - Work Without Internet Access (Priority: P2)

**Goal**: Load the production app once, disconnect from the internet, reload, and keep using local features.

**Independent Test**: Serve the production build, go offline, reload, and complete local create/query/export/backup actions without external requests or blank screens.

- [ ] T020 [P] [US3] Add offline, service-worker, and local-file startup coverage in `tests/browser/offline.spec.ts` and `tests/browser/update.spec.ts`
- [X] T021 [US3] Replace install-time `skipWaiting` with idle-gated update messaging in `vite.config.ts`, `src/App.tsx`, and `src/shell/StatusBar.tsx`
- [X] T022 [US3] Add a client-side update coordinator for ready, prompt, confirm, and reload states in `src/workspace/update.ts` and `src/shell/store.ts`
- [X] T023 [US3] Add the unsupported local-file explanation and offline startup copy in `index.html`, `src/App.tsx`, and `README.md`
- [X] T024 [US3] Verify that build output stays relative and fully precached for offline serving in `vite.config.ts`, `scripts/verify-dist.mjs`, and `tests/browser/offline.spec.ts`

**Checkpoint**: The installed build keeps working offline after first load, and updates wait for idle operations plus explicit reload confirmation.

---

## Phase 6: User Story 4 - Move and Recover Data Safely (Priority: P2)

**Goal**: Preview, import, export, back up, and restore data without overwriting unrelated state.

**Independent Test**: Import supported files, export committed datasets, create a full backup, restore into a clean workspace, and verify collisions preserve existing data while restored copies get new identities.

- [X] T025 [P] [US4] Add import, export, backup, and restore regression coverage in `tests/csv.test.ts`, `tests/json.test.ts`, `tests/sqlDump.test.ts`, `tests/bdpArchive.test.ts`, and `tests/browser/import-backup.spec.ts`
- [X] T026 [US4] Implement streaming intake and the 500 MB preflight cap for CSV, JSON array, NDJSON, SQL dump, and SQLite files in `src/importExport/csv.ts`, `src/importExport/json.ts`, `src/importExport/sqlDump.ts`, and `src/importExport/sqliteFile.ts`
- [X] T027 [US4] Replace destructive existing-destination import with schema-compatible append validation in `src/sections/ImportPanel.tsx`, `src/importExport/csv.ts`, `src/importExport/json.ts`, and `src/importExport/sqlDump.ts`
- [X] T028 [US4] Expand backup archive validation with manifest digests, relative-path checks, and full dataset coverage in `src/importExport/bdpArchive.ts` and `src/sections/Backup.tsx`
- [X] T029 [US4] Implement collision-safe restore planning, rename allocation, and rollback journaling in `src/importExport/bdpArchive.ts`, `src/adapters/sqlStore.ts`, `src/adapters/nosqlAdapter.ts`, and `src/sections/Backup.tsx`
- [X] T030 [US4] Require explicit confirmation before deleting SQL databases or document collections in `src/sections/SqlManager.tsx`, `src/sections/NosqlManager.tsx`, and `src/shell/store.ts`
- [ ] T031 [US4] Thread source naming, export completeness, and partial-failure reporting through the export and backup UI in `src/sections/ExportPanel.tsx`, `src/sections/Backup.tsx`, and `src/importExport/bdpArchive.ts`

**Checkpoint**: Import and restore flows validate before commit, preserve unrelated data, and handle collisions with renamed copies.

---

## Phase 7: User Story 5 - Inspect and Use Local Data (Priority: P3)

**Goal**: Run queries, reports, searches, schema comparisons, and key generation with clear state feedback.

**Independent Test**: Populate representative SQL and document data, then complete one successful operation in Query, Reports, Search, Schema Diff, and Key Generation with visible loading, empty, success, and error states.

- [ ] T032 [P] [US5] Add behavior coverage for query, reporting, search, schema comparison, key generation, and a 10,000-row report performance check that completes within one second in `tests/aggregations.test.ts`, `tests/searchIndexer.test.ts`, `tests/asciiTable.test.ts`, `tests/keygen.test.ts`, and `tests/browser/local-tools.spec.ts`
- [ ] T033 [P] [US5] Implement document collection create/edit/delete durability and reload recovery in `src/adapters/nosqlAdapter.ts`, `src/sections/NosqlManager.tsx`, and `src/shell/store.ts`
- [ ] T034 [US5] Add section-level loading, empty-state, success, and error state plumbing in `src/sections/Query.tsx`, `src/sections/Reports.tsx`, `src/sections/SearchPanel.tsx`, `src/sections/SchemaDiff.tsx`, `src/sections/KeyGen.tsx`, and `src/sections/NosqlManager.tsx`
- [ ] T035 [US5] Thread deterministic source labels and result counts through reports and search in `src/reports/aggregations.ts`, `src/reports/histogram.ts`, `src/search/searchClient.ts`, and `src/search/indexerCore.ts`
- [X] T036 [US5] Improve query execution feedback, duplicate-submit blocking, and empty-dataset guidance in `src/sections/Query.tsx`, `src/shell/StatusBar.tsx`, and `src/shell/store.ts`

**Checkpoint**: All local analysis tools provide deterministic results and honest empty/error states.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening, documentation sync, and release validation.

- [ ] T037 [P] Re-run end-to-end browser coverage for reload, offline, multi-tab, import/restore, and responsive paths in `tests/browser/*.spec.ts`
- [ ] T038 Sync quickstart and in-app guidance with the final workflow in `specs/001-reliable-offline-bdp/quickstart.md`, `README.md`, and `src/App.tsx`
- [ ] T039 Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:browser`, then fix any failures in `package.json`, `scripts/verify-dist.mjs`, and `tests/browser/`

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 has no dependencies.
- Phase 2 depends on Phase 1 and blocks every user story.
- Phases 3 through 7 depend on Phase 2.
- Phase 8 depends on the required story work being complete.

### User Story Dependencies

- US1 is the first deliverable and establishes durable SQL behavior.
- US2 can proceed after the foundational shell work and does not depend on US1 internals.
- US3 depends on the update and offline coordination work but not on US4 or US5.
- US4 depends on the shared import/export staging and storage helpers.
- US5 depends on the shared shell and data-access foundations but remains independently testable.

### Within Each User Story

- Tests come before implementation where they exist.
- Shared primitives are created before features that consume them.
- Story completion should be validated before moving to the next story.

## Parallel Opportunities

- `T002`, `T003`, `T005`, and `T006` can move in parallel because they touch different files.
- `T009` and `T010` can be written together for US1 coverage.
- `T015` and `T016` can proceed in parallel for US2.
- `T020` can run alongside `T021`/`T022` planning because it only adds browser coverage.
- `T025` and `T026` can proceed in parallel for US4.
- `T031` and `T032` can proceed in parallel for US5.

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Deliver US1.
3. Stop and validate durable SQL reload behavior before expanding scope.

### Incremental Delivery

1. Ship SQL durability first.
2. Add navigation recovery next.
3. Add offline/update handling.
4. Add import, export, backup, and restore hardening.
5. Finish with local analysis tools and final regression proof.

### Parallel Team Strategy

1. One developer can work on the workspace and SQL foundation.
2. A second can work on the navigation shell and responsive styling.
3. A third can prepare offline/update and browser-test coverage.
4. A fourth can handle import/export/backup streaming and restore safety.
