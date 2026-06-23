# Research: Reliable Offline BDP

## Decision 1: Retain the existing browser-only stack

**Decision**: Keep React, Vite, sql.js, Dexie, Zustand, and fflate. Add coordination and streaming boundaries around them.

**Rationale**: The failures are lifecycle and integrity defects, not evidence that the product needs a server or framework rewrite. Preserving the stack also preserves existing user data and the offline architecture.

**Alternatives rejected**: A server database breaks the local-first contract. Replacing sql.js or Dexie expands migration risk without fixing acknowledgement-before-persistence or destructive import behavior.

## Decision 2: Fenced exclusive write ownership

**Decision**: Acquire a same-origin exclusive Web Lock named `bdp-workspace-writer`. A tab that cannot acquire it with `ifAvailable` becomes visibly read-only. Takeover first asks the owner to release through `BroadcastChannel`; a confirmed forced takeover may use `steal`. Every writer also owns a monotonically increasing IndexedDB epoch, and each durable mutation verifies that epoch in its commit transaction.

**Rationale**: Web Locks coordinates tabs and workers on the same origin. The specification supports immediate availability checks and lock stealing, but explicitly warns that JavaScript in the former holder can continue after a stolen lock. The IndexedDB epoch is therefore a fencing token, not redundant state. See the [Web Locks specification](https://www.w3.org/TR/web-locks/).

**Alternatives rejected**: localStorage mutexes have race and crash-cleanup problems. Web Locks alone cannot fence code already executing after forced takeover. Silently allowing all tabs to write violates the clarified product contract.

## Decision 3: Durable commit is the mutation boundary

**Decision**: For SQL mutation, load exact durable bytes, mutate the worker database, export the result, then use a short IndexedDB `readwrite` transaction with strict durability to validate the ownership epoch and replace stored bytes. Announce success only after transaction completion. If persistence fails, reload the prior durable bytes into the worker before accepting further work.

**Rationale**: IndexedDB transactions are atomic; strict durability requests that completion follow persistence to durable media. Short transactions reduce abort and contention risk. See [Indexed Database API 3.0](https://www.w3.org/TR/IndexedDB/).

**Alternatives rejected**: Debounced background saves can acknowledge data that is later lost. Treating the worker as authoritative causes in-memory/durable divergence. Creating an empty database when bytes are missing conceals corruption.

## Decision 4: Stream large files and stage before commit

**Decision**: Reject `file.size > 524,288,000` before reading. Use `Blob.stream()`, incremental `TextDecoder` parsing, and worker messages for bounded preview, validation, progress, cancellation, and parsing of CSV, NDJSON, SQL dumps, and JSON arrays. Use fflate's streaming ZIP interfaces for backups. SQLite bytes still must be materialized for sql.js, but only in a worker after storage/memory preflight. No destination changes until validation completes.

**Rationale**: The browser File API exposes asynchronous streaming reads specifically suited to avoiding main-thread blocking; see the [File API specification](https://www.w3.org/TR/FileAPI/). Staging makes malformed, cancelled, oversized, or incompatible input a no-change result.

**Alternatives rejected**: `file.text()`, `arrayBuffer()` on the main thread, and synchronous ZIP APIs create multiple full-size copies and freeze the interface. Chunk-by-chunk live writes make rollback and preview-before-commit unreliable.

## Decision 5: Existing destinations append transactionally

**Decision**: Detect the destination schema before import. Normalize incoming columns and types, reject incompatibility with a specific mismatch list, and append compatible rows in a SQL transaction or Dexie transaction. Export and durably commit SQL bytes only after the append succeeds.

**Rationale**: This implements the clarified append-or-reject contract and removes the current destructive path that recreates an existing SQL database.

**Alternatives rejected**: Recreate/replace loses unrelated tables. Best-effort column coercion makes previews misleading. Row-at-a-time durable writes permit partial success.

## Decision 6: Collision-safe restore with a manifest

**Decision**: Version the backup manifest, include per-entry identity, name, kind, byte length, and SHA-256 digest, validate all entries before commit, and plan all collision renames first. Existing datasets remain untouched; restored collisions receive a new UUID and deterministic `Name (restored N)` label. Because current SQL and document data occupy separate IndexedDB databases, persist a restore journal and rollback material before cross-store commit. Failure or reload resumes rollback before later writes; the terminal failed state has no restore effects.

**Rationale**: A validated plan prevents late name/identity surprises and makes equivalent restores auditable.

**Alternatives rejected**: Overwrite violates the clarification. Silent skip produces an incomplete backup restore. Name-only collision checks miss identity conflicts.

## Decision 7: Controlled service-worker activation

**Decision**: Do not call `skipWaiting()` during install. A waiting worker causes an `UPDATE_READY` application state. After the operation registry is idle, show a reload prompt. On confirmation, post `SKIP_WAITING`; reload once on `controllerchange`. Activation claims clients and deletes only caches older than the newly installed complete cache.

**Rationale**: Separating installation from activation prevents a new worker from controlling pages that still run old chunks and implements the explicit user-confirmed update contract. The browser test will observe worker activation through Chromium; Playwright documents [service-worker inspection](https://playwright.dev/docs/service-workers).

**Alternatives rejected**: Immediate skip-waiting can mix resource generations during a mutation. Clearing all caches before the new cache is complete can strand offline users.

## Decision 8: Real-browser contract tests

**Decision**: Add Playwright Chromium tests using multiple pages in one persistent browser context for tabs, actual IndexedDB and workers for durability, and production-service-worker builds for offline/update tests. Generate the 500 MB fixture during the test and do not commit it.

**Rationale**: jsdom cannot prove service-worker, Web Lock, worker/WASM, reload, Cache Storage, or multi-page behavior. Playwright supports [multiple pages in one browser context](https://playwright.dev/docs/pages), matching same-profile tabs.

**Alternatives rejected**: Unit tests alone previously missed the cross-module failures. Manual-only testing is not a release gate and is difficult to repeat.

## Reference Environment

Acceptance performance is measured in current Chromium on a 4-core machine with 8 GiB RAM and at least 1.5 GiB free origin storage. Before a 500 MB operation the app estimates storage and memory pressure, refuses safely when capacity is insufficient, keeps controls responsive, and commits no partial durable state. The limit is inclusive and defined as 500 MiB (`524,288,000` bytes).
