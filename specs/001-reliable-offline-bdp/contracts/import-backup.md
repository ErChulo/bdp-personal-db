# Contract: Import, Export, Backup, and Restore

## File intake

- Supported imports: CSV, JSON array, NDJSON, SQL dump, and SQLite.
- Maximum individual import or restore file: `524,288,000` bytes inclusive.
- Oversized files fail with `FILE_TOO_LARGE` before reading, staging, or changing durable data.
- Detection uses signature/content where possible; extension is advisory.
- Preview is bounded by row and byte count and shows detected format, columns/types, destination, and warnings.

## Commit behavior

- New destination: validate full staged input, then create one new dataset.
- Existing destination: append only after normalized column/type compatibility succeeds. Otherwise return mismatch details and change nothing.
- SQL append runs in a SQL transaction and becomes visible only after exported bytes commit to IndexedDB.
- Cancellation or parser/worker/storage failure removes staging and leaves prior durable state unchanged.
- Progress reports bytes read and, where meaningful, records processed; controls remain operable and duplicate commit is disabled.

## Export

Export resolves the latest committed revision, identifies its source name, and streams the chosen portable representation. A failed or cancelled download does not mutate the source.

## Backup archive

- Archive contains one versioned manifest and only manifest-declared relative entry paths.
- Each entry declares identity, visible name, kind, byte length, and SHA-256 digest.
- Backup success means all selected committed datasets were read, archived, and finalized.
- Restore rejects unsupported versions, unsafe/duplicate paths, missing/extra entries, length mismatch, digest mismatch, malformed content, and oversized input before destination commit.

## Restore collisions and failure

- Existing datasets are never overwritten.
- Any ID or name collision assigns a new UUID and the first available `Name (restored N)`.
- All names/IDs are planned before committing.
- Before the first dataset commit, persist a restore journal and rollback material. Complete success is reported only when every planned entry commits.
- If a browser/storage failure interrupts the cross-store commit, report exactly which entries are temporarily present, block unrelated writes, and use the journal to remove them. Reload resumes rollback before normal use. The terminal failed state leaves pre-existing durable data unchanged and is never labeled complete.
