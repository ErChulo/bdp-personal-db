# Contract: Workspace Operations

## Ownership

- On startup, request exclusive `bdp-workspace-writer` ownership without waiting.
- If unavailable, expose `read-only` status and disable every mutating control while keeping reads, navigation, and export available.
- `Take over` is explicit. It requests cooperative release first; forced takeover requires a second confirmation and advances the durable writer epoch.
- Every commit verifies tab identity and epoch. A stale writer receives `WRITE_OWNERSHIP_LOST` and commits nothing.

## SQL open/read

1. Resolve the database record by ID.
2. Reject `DATABASE_NOT_FOUND`, `DATABASE_BYTES_MISSING`, or `DATABASE_CORRUPT` visibly.
3. Initialize the worker from exact stored bytes.
4. Return schema/query results tagged with database ID, name, and revision.

Creating an empty worker database is permitted only for an explicit create operation.

## SQL mutation

1. Require writable ownership and register a busy operation.
2. Rehydrate current committed bytes/revision if the worker is stale.
3. Run statements transactionally in the serialized worker queue.
4. Export resulting bytes and checksum.
5. In one strict IndexedDB transaction, verify writer epoch and expected revision, then replace bytes and increment revision.
6. Emit success and activity only after transaction completion.

On any failure, commit nothing, reload the worker from the prior durable bytes, end busy state, and provide a recovery action. Duplicate submissions are disabled while the operation is active.

## Operation errors

Stable error codes include `READ_ONLY`, `WRITE_OWNERSHIP_LOST`, `STALE_REVISION`, `DATABASE_NOT_FOUND`, `DATABASE_BYTES_MISSING`, `DATABASE_CORRUPT`, `STORAGE_UNAVAILABLE`, `QUOTA_EXCEEDED`, `VALIDATION_FAILED`, `OPERATION_INTERRUPTED`, and `PERSISTENCE_FAILED`.

Messages identify the operation and affected dataset without logging data content.

## Update interlock

The operation registry is idle only when no query, mutation, import, export, backup, or restore is active. A ready application update may prompt only when idle. New operations are briefly blocked after the user confirms activation.
