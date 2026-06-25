# Data Model: Local Vault Hardening

## Entities

### Vault

Represents the security boundary for the current browser profile.

Attributes:

- vaultId
- state: setup | locked | unlocked
- version
- salt
- createdAt
- updatedAt
- lastUnlockedAt

Relationships:

- Owns one unlock session at a time.
- Protects all encrypted SQL and NoSQL payloads.

### Unlock Session

Represents the temporary in-memory state created after a successful passphrase entry.

Attributes:

- sessionId
- startedAt
- expiresAt or lockAt
- derivedKey material reference in memory only

Relationships:

- Belongs to one vault.
- Grants read/write access to protected datasets until locked or reloaded.

### Protected SQL Store

Represents the encrypted payload for one SQL database.

Attributes:

- datasetId
- encryptedBytes
- iv
- checksum or integrity marker
- revision
- updatedAt

Relationships:

- Belongs to one vault.
- Hydrates the existing SQL adapter only after unlock.

### Protected NoSQL Store

Represents the encrypted payload for one NoSQL collection plus its metadata.

Attributes:

- collectionId
- encryptedMeta
- encryptedRows
- iv
- revision
- updatedAt

Relationships:

- Belongs to one vault.
- Hydrates the NoSQL adapter only after unlock.

### Reset Action

Represents a confirmed destructive operation that removes the vault and all protected payloads.

Attributes:

- actionId
- confirmedAt
- reason

Relationships:

- Targets a vault.
- Returns the app to setup state after completion.

## State Transitions

1. Setup
   - No vault exists yet.
   - User creates a passphrase.
   - Vault becomes locked until the first unlock completes.

2. Locked
   - Encrypted data may exist, but nothing is readable.
   - User must enter the passphrase to continue.

3. Unlocked
   - Protected datasets are available in memory for normal app usage.
   - Saving writes encrypted payloads back to storage.

4. Reset
   - Vault and encrypted data are removed.
   - App returns to the setup state.

