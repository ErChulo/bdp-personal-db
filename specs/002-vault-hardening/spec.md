# Feature Specification: Local Vault Hardening

**Feature Branch**: `[002-vault-hardening]`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Add passphrase-based vault lock and at-rest encryption for all local BDP data, with an explicit offline-only startup posture"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Secure First Unlock (Priority: P1)

As a first-time or returning user, I must set or enter a vault passphrase before I can access any SQL or NoSQL data.

**Why this priority**: Without a vault lock, the application remains readable to anyone who can open the browser profile.

**Independent Test**: Open the app in a fresh browser profile, confirm the lock screen appears, set a passphrase, and verify that the workspace becomes usable only after successful unlock.

**Acceptance Scenarios**:

1. **Given** a fresh profile with no vault configured, **When** the app opens, **Then** it shows a locked setup screen and does not reveal any stored data.
2. **Given** an existing vault, **When** the user enters the correct passphrase, **Then** the app unlocks and restores the prior workspace state.

---

### User Story 2 - Encrypted Local Storage (Priority: P1)

As a user, I want all stored SQL and NoSQL data to remain encrypted while at rest so that browser storage inspection does not expose readable content.

**Why this priority**: Encryption at rest is the main barrier against casual access through local profile or storage inspection.

**Independent Test**: Create SQL and NoSQL data, reload the app, inspect the stored browser data, and confirm the contents are not readable without unlocking.

**Acceptance Scenarios**:

1. **Given** unlocked SQL and NoSQL data, **When** the app persists changes, **Then** the stored bytes remain unreadable in browser storage without the passphrase.
2. **Given** encrypted local data, **When** the app reloads without unlocking, **Then** it cannot render the dataset contents or pretend the data is empty.

---

### User Story 3 - Locked Session Recovery (Priority: P2)

As a user, I want to lock the vault intentionally and reopen it later in the same browser profile.

**Why this priority**: A manual lock gives control when I step away or share a machine briefly.

**Independent Test**: Unlock the app, lock it, confirm access is removed, then unlock again and verify the same data returns.

**Acceptance Scenarios**:

1. **Given** an unlocked session, **When** the user locks the vault, **Then** all data views return to a locked state.
2. **Given** a locked vault, **When** the correct passphrase is re-entered, **Then** the prior data and workspace return without data loss.

---

### User Story 4 - Offline-Only Posture (Priority: P2)

As a user, I want the app to stay local-only and refuse any runtime dependency on remote services.

**Why this priority**: The app is intended for personal use in a disconnected or tightly controlled environment.

**Independent Test**: Launch the app offline after first load and verify the vault still unlocks and data remains available.

**Acceptance Scenarios**:

1. **Given** the app has already been loaded once, **When** the browser is offline, **Then** the vault can still be unlocked and used.
2. **Given** a network outage or blocked external access, **When** the app opens, **Then** it does not require any external service to read or decrypt local data.

---

### User Story 5 - Secure Reset Path (Priority: P3)

As a user, I want a deliberate wipe/reset path in case I forget the passphrase or need to retire a vault.

**Why this priority**: A security lock needs a clearly defined recovery boundary to avoid ambiguous failure behavior.

**Independent Test**: Lock the vault, choose reset/wipe, confirm the app removes the vault and returns to initial setup.

**Acceptance Scenarios**:

1. **Given** a locked vault and a confirmed reset request, **When** the user proceeds, **Then** the vault is removed and the app returns to first-run setup.
2. **Given** a forgotten passphrase, **When** the user does not have an external backup, **Then** the vault remains inaccessible rather than silently bypassing protection.

### Edge Cases

- What happens if encrypted data is corrupted or the passphrase is wrong? The app must fail explicitly and keep the vault locked.
- What happens if a migration is interrupted mid-flight? The app must preserve the previous readable state or the prior encrypted state, not a half-migrated mix.
- What happens if the user opens the app in a new browser profile? The vault must not unlock without the correct passphrase.
- What happens if the browser storage is cleared? The app must return to first-run setup instead of fabricating data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST require a vault passphrase before any stored SQL or NoSQL dataset becomes readable.
- **FR-002**: The system MUST encrypt local data at rest before it is written to browser storage.
- **FR-003**: The system MUST decrypt local data only after a successful unlock in the same browser profile.
- **FR-004**: The system MUST provide a visible locked state on startup, after manual lock, and after page reload.
- **FR-005**: The system MUST support a deliberate reset/wipe flow that removes the locked vault and returns the app to initial setup.
- **FR-006**: The system MUST preserve data across reloads once unlocked, and successful unlock must restore the previously saved workspace state.
- **FR-007**: The system MUST fail explicitly on corrupted encrypted data, missing unlock material, or wrong passphrase input.
- **FR-008**: The system MUST keep the app usable without remote services after the first local load.
- **FR-009**: The system MUST prevent silent fallback to empty data when a vault exists but is still locked.
- **FR-010**: The system MUST provide accessible controls and labels for lock, unlock, and reset actions.
- **FR-011**: The system MUST include regression coverage proving locked startup, unlock, reload persistence, corruption handling, and reset behavior.

### Constitution Requirements *(mandatory for storage or UI features)*

- **CR-001**: Specify when successful mutations become durable and how reload round-trips are verified.
- **CR-002**: State offline behavior and identify every runtime network dependency, if any.
- **CR-003**: Define loading, empty, success, error, partial-failure, and recovery behavior.
- **CR-004**: Define visible pointer navigation and keyboard accessibility for every affected view.
- **CR-005**: Identify regression and integration tests required to prove the user journey.

### Key Entities *(include if feature involves data)*

- **Vault**: The local security boundary that controls whether stored data is readable; includes setup state, locked state, and passphrase-derived unlock state.
- **Protected Dataset**: SQL bytes and NoSQL documents stored in browser persistence, always represented as encrypted records when at rest.
- **Unlock Session**: The temporary in-memory state that allows the current browser session to access decrypted data until the user locks the vault or reloads.
- **Reset Action**: A deliberate wipe operation that removes the vault and returns the app to a first-run setup state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh profile opens into a locked setup state with no readable dataset content visible until a passphrase is entered.
- **SC-002**: After a successful unlock, all previously created SQL and NoSQL data is restored on reload in the same browser profile.
- **SC-003**: Browser storage inspection after saving data does not show plaintext dataset contents for the protected vault.
- **SC-004**: A manual lock returns the app to a blocked state within one user action and prevents further data access until unlock.
- **SC-005**: A confirmed reset removes the vault and returns the app to first-run setup without exposing stale readable data.
- **SC-006**: The app remains usable offline after first load, with unlock and data access still working in the disconnected browser session.

## Assumptions

- The feature is for a single local user and one browser profile at a time.
- A forgotten passphrase is treated as unrecoverable without an external backup.
- Existing SQL and NoSQL data may be migrated into encrypted storage on first unlock after the feature is enabled.
- Offline usage remains a required property; no remote recovery or account system will be introduced.

