# Data Model: Reliable Offline BDP

## Durable entities

### SQL Database

- `id`: stable UUID
- `name`: non-empty display name, unique only for presentation convenience
- `bytes`: exact SQLite byte image; required and non-empty after creation
- `createdAt`, `updatedAt`: ISO timestamps
- `revision`: monotonically increasing integer
- `checksum`: SHA-256 of committed bytes

Invariant: metadata and bytes are written together. A reference without valid bytes is corrupt and must never open as an empty database.

### Document Collection

- `id`: stable UUID
- `name`: non-empty display name
- `fields`: ordered declarations of name, type, optionality, and index intent
- `documents`: records keyed by collection and document identity
- `createdAt`, `updatedAt`, `revision`

Invariant: a document commit validates declared fields and ownership fencing in the same Dexie transaction.

### Workspace Control

- `workspaceId`: stable local identity
- `writerEpoch`: monotonically increasing fencing token
- `writerTabId`: ephemeral UUID of current owner
- `claimedAt`, `heartbeatAt`: diagnostic timestamps, not the lock authority

Invariant: only the holder of both the Web Lock and current epoch may commit. Taking ownership increments the epoch atomically.

### Operation Record

- `id`, `kind`, `source`, `destination`
- `ownerTabId`, `writerEpoch`
- `phase`: `queued | reading | preview | validating | committing | succeeded | failed | cancelled`
- `bytesRead`, `totalBytes`, `rowsProcessed`
- `startedAt`, `finishedAt`
- `errorCode`, `recoveryMessage`

Only in-flight metadata is durable; file contents are staged separately. `succeeded` is legal only after durable commit. Reload converts abandoned nonterminal operations to `failed` with an interrupted recovery message.

### Staged Payload

- `operationId`, `sequence`, `payload`, `byteLength`
- `detectedFormat`, `validationDigest`

Chunks are temporary IndexedDB records. They are removed after commit, cancellation, failure, or stale-operation cleanup. Staging never appears as a user dataset.

### Restore Journal

- `operationId`, validated manifest digest, and planned destination IDs/names
- per-entry `pending | committed | rolled-back` state
- encrypted-neutral rollback snapshots/references for every destination affected by the operation

The journal is written before the first dataset commit. Failure starts rollback immediately; an interrupted rollback resumes before any later workspace mutation. The UI reports partial/recovering state until all entries are committed or all effects are removed.

### Backup Manifest

- `format`: `bdp-backup`
- `version`: positive supported integer
- `createdAt`
- `entries[]`: `id`, `name`, `kind`, archive path, byte length, SHA-256, schema metadata

All paths must be relative, normalized, unique, and declared by the manifest. Every entry validates before restore planning begins.

### Activity Record

- `id`, `kind`, `sourceId`, `summary`, `completedAt`

It contains no queries, rows, documents, generated secrets, or file content.

## Derived/session state

### Workspace Selection

The current section and selected SQL/collection IDs are preferences. Rehydration verifies references; stale IDs produce an explanatory empty state and never create replacement data.

### Ownership State

`acquiring | writable | read-only | takeover-requested | yielding | lost`. Any state except `writable` disables mutation controls. Loss during work causes the operation to fail its epoch check.

### Application Update State

`current | waiting-for-idle | ready-to-prompt | activation-requested | reloading | failed`. A waiting update does not activate during an operation and never clears user storage.

## State transitions

```text
Import: selected -> reading -> preview -> validating -> staged -> committing -> succeeded
                    |           |            |             |
                    +-----------+------------+-------------+-> failed/cancelled (no destination change)

Ownership: acquiring -> writable -> yielding -> read-only
                 \-> read-only -> takeover-requested -> writable (new epoch)

Update: current -> waiting-for-idle -> ready-to-prompt -> activation-requested -> reloading

Restore: validated -> journaled -> committing -> succeeded
                                  \-> rolling-back -> failed (no durable effects)
```

## Validation and collision rules

- File limit is checked from `File.size` before any read: inclusive maximum `524,288,000` bytes.
- Existing tabular destinations require the same normalized column set and compatible declared types; mismatch rejects the entire append.
- Restored ID or visible-name collisions preserve the existing entity, allocate a new UUID, and select the first free `Name (restored N)`.
- SQL mutation failure restores the worker from last committed bytes before the operation queue resumes.
- Deletion requires entity-scoped confirmation and commits before selection/activity state changes.
