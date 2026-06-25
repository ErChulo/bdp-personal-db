# Research: Local Vault Hardening

## Decision Summary

This feature will use a single local vault passphrase to protect all persisted application data. The passphrase is not synced, not sent anywhere, and not recoverable from a service. The unlock key exists only in memory for the active browser session.

## Key Decisions

### 1. One vault passphrase for the whole app

- Chosen because the app already behaves as one local workspace rather than a multi-user account system.
- This keeps the lock/unlock model simple and consistent across SQL and NoSQL data.
- It avoids per-database or per-collection key management overhead.

### 2. Encrypt local data before persistence

- SQL bytes and NoSQL documents will be stored only in encrypted form in browser persistence.
- The vault metadata itself must not contain plaintext data content.
- Unlocking will decrypt into memory only long enough to hydrate the app state.

### 3. Session key stays in memory

- The derived unlock key will not be written to durable storage.
- Reloading the page should always return to the locked state unless the user unlocks again.

### 4. Existing local data will be migrated

- Existing plaintext SQL and NoSQL payloads will be migrated into encrypted storage after the user sets a vault passphrase.
- Migration must be all-or-nothing for each dataset and must not leave a half-encrypted mix.

### 5. Reset means wipe, not recovery

- A forgotten passphrase is treated as unrecoverable without an external backup.
- The feature will provide a deliberate wipe/reset path that returns the app to first-run setup.
- No remote recovery, account, or escrow flow will be introduced.

## Rejected Alternatives

### Remote account recovery

Rejected because the product is intentionally local-only and the user explicitly wants no outside dependency.

### Per-database passphrases

Rejected because it adds complexity without improving the core protection boundary for a single-user workspace.

### OS keychain integration

Rejected for this iteration because it introduces platform-specific behavior and does not satisfy the need for a portable browser-only workflow.

