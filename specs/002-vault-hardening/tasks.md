# Tasks: Local Vault Hardening

**Input**: Design documents from `/specs/002-vault-hardening/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are required for vault setup/unlock, encrypted persistence, reset/wipe, offline behavior, and reload round-trips.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the shared vault modules and test scaffolding used by all stories

- [ ] T001 [P] Create `src/security/` module files for vault state, metadata, and encrypted payload helpers in `src/security/vault.ts`, `src/security/vaultStore.ts`, and `src/security/vaultTypes.ts`
- [ ] T002 [P] Add a unit test suite for vault key derivation and encrypt/decrypt round-trips in `tests/security/vaultCrypto.test.ts`
- [ ] T003 [P] Add a browser test scaffold for locked startup and unlock flow in `tests/browser/vault-lock.spec.ts`
- [ ] T004 [P] Add a browser test scaffold for confirmed reset/wipe behavior in `tests/browser/vault-reset.spec.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core security state and boot flow that all user stories depend on

- [ ] T005 Implement the vault security primitives and metadata lifecycle in `src/security/vault.ts` and `src/security/vaultStore.ts`
- [ ] T006 Implement the vault-gated app shell state and lock/setup screen in `src/App.tsx`, `src/shell/store.ts`, and `src/sections/VaultGate.tsx`
- [ ] T007 Wire app startup so SQL and NoSQL hydration does not run until the vault is unlocked in `src/App.tsx`
- [ ] T008 Add a shared lock-state signal and clear-session helper in `src/security/vault.ts`, `src/shell/store.ts`, and `src/App.tsx`

**Checkpoint**: Vault setup, locked startup, and unlock state are ready; user stories can now be completed and tested independently

---

## Phase 3: User Story 1 - Secure First Unlock (Priority: P1) 🎯 MVP

**Goal**: Require a passphrase before any data becomes readable and restore the workspace after a successful unlock

**Independent Test**: Open a fresh profile, confirm the lock/setup screen appears, set a passphrase, and verify the workspace becomes usable only after unlocking

### Tests for User Story 1 ⚠️

- [ ] T009 [P] [US1] Add an integration test for fresh-profile setup and first unlock in `tests/browser/vault-lock.spec.ts`
- [ ] T010 [P] [US1] Add a unit test for locked-state transitions and unlock session handling in `tests/security/vaultState.test.ts`

### Implementation for User Story 1

- [ ] T011 [P] [US1] Implement the vault setup form and unlock form in `src/sections/VaultGate.tsx`
- [ ] T012 [US1] Integrate the vault gate into app rendering and section hydration in `src/App.tsx`
- [ ] T013 [US1] Add visible lock/unlock status and keyboard-accessible actions in `src/shell/StatusBar.tsx` and `src/shell/AppNavigation.tsx`

**Checkpoint**: A new user can create a vault, unlock it, and reach the app shell without exposing readable data first

---

## Phase 4: User Story 2 - Encrypted Local Storage (Priority: P2)

**Goal**: Store SQL and NoSQL data only in encrypted form and restore it after unlock

**Independent Test**: Create data, reload the app, inspect browser storage, and verify the saved content is not readable without the passphrase

### Tests for User Story 2 ⚠️

- [ ] T014 [P] [US2] Add unit tests for encrypted SQL persistence and corruption handling in `tests/security/encryptedSqlStore.test.ts`
- [ ] T015 [P] [US2] Add unit tests for encrypted NoSQL persistence and corruption handling in `tests/security/encryptedNosqlStore.test.ts`
- [ ] T016 [P] [US2] Add a browser regression for reload persistence and unreadable browser storage in `tests/browser/vault-storage.spec.ts`

### Implementation for User Story 2

- [ ] T017 [US2] Encrypt SQL store writes and reads in `src/adapters/sqlStore.ts` and `src/adapters/sqlAdapter.ts`
- [ ] T018 [US2] Encrypt NoSQL collection metadata, documents, and indexes in `src/adapters/nosqlAdapter.ts`
- [ ] T019 [US2] Implement first-run migration from plaintext local storage into encrypted vault storage in `src/security/vaultMigration.ts` and `src/App.tsx`

**Checkpoint**: SQL and NoSQL content survives reload only in encrypted form and is restored after unlock

---

## Phase 5: User Story 3 - Locked Session Recovery (Priority: P3)

**Goal**: Allow the user to lock the vault intentionally and unlock again later without losing data

**Independent Test**: Unlock the app, lock it, confirm access is removed, then unlock again and verify the same data returns

### Tests for User Story 3 ⚠️

- [ ] T020 [P] [US3] Add a browser regression for manual lock and re-unlock in `tests/browser/vault-lock.spec.ts`
- [ ] T021 [P] [US3] Add a unit test that verifies lock clears the in-memory key and state in `tests/security/vaultState.test.ts`

### Implementation for User Story 3

- [ ] T022 [US3] Implement the manual lock action and session clear path in `src/security/vault.ts` and `src/shell/StatusBar.tsx`
- [ ] T023 [US3] Ensure unlock rehydrates the same workspace state without data loss in `src/App.tsx`, `src/adapters/sqlAdapter.ts`, and `src/adapters/nosqlAdapter.ts`

**Checkpoint**: The vault can be locked and unlocked repeatedly in the same browser profile

---

## Phase 6: User Story 4 - Offline-Only Posture (Priority: P2)

**Goal**: Keep the vault usable without remote services once the app has loaded locally

**Independent Test**: Launch the app once online, then go offline and confirm unlock and data access still work

### Tests for User Story 4 ⚠️

- [ ] T024 [P] [US4] Add a browser offline regression for unlocking and using the app without a network connection in `tests/browser/vault-offline.spec.ts`

### Implementation for User Story 4

- [ ] T025 [US4] Preserve the offline startup and cache-readiness messaging while locked in `src/workspace/update.ts` and `src/App.tsx`
- [ ] T026 [US4] Keep the lock/setup flow free of any runtime network dependency in `src/sections/VaultGate.tsx` and `src/security/vaultStore.ts`

**Checkpoint**: The app remains fully local and usable after the browser goes offline

---

## Phase 7: User Story 5 - Secure Reset Path (Priority: P3)

**Goal**: Provide a deliberate wipe/reset flow for retiring the vault or recovering from a forgotten passphrase

**Independent Test**: Confirm the wipe action removes the vault and returns the app to the initial setup state

### Tests for User Story 5 ⚠️

- [ ] T027 [P] [US5] Add a browser regression for confirmed reset and first-run recovery in `tests/browser/vault-reset.spec.ts`
- [ ] T028 [P] [US5] Add a unit test for vault wipe removing metadata and encrypted payloads in `tests/security/vaultReset.test.ts`

### Implementation for User Story 5

- [ ] T029 [US5] Implement the confirmed wipe/reset flow in `src/security/vaultReset.ts` and `src/sections/VaultGate.tsx`
- [ ] T030 [US5] Remove encrypted SQL and NoSQL payloads and return to setup state in `src/App.tsx`, `src/adapters/sqlStore.ts`, and `src/adapters/nosqlAdapter.ts`

**Checkpoint**: The vault can be retired explicitly without leaving behind readable data

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Feature-wide verification and cleanup

- [ ] T031 [P] Update `specs/002-vault-hardening/quickstart.md` and `specs/002-vault-hardening/contracts/` if implementation details shift during build-out
- [ ] T032 Run `npm run typecheck`, `npm test`, `npm run test:browser:e2e`, `npm run build`, and `git diff --check`
- [ ] T033 Verify the production build remains offline-capable after the vault changes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — blocks all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational phase
- **User Story 2 (P2)**: Can start after Foundational phase and depends on the vault state machine from Phase 2
- **User Story 3 (P3)**: Can start after Foundational phase and depends on the lock/unlock plumbing from Phase 2
- **User Story 4 (P2)**: Can start after Foundational phase and validates the same vault flow under offline conditions
- **User Story 5 (P3)**: Can start after Foundational phase and depends on the vault persistence model from US2

### Within Each User Story

- Tests must be written and failing before implementation
- Models and helpers before UI wiring
- Security state before adapter encryption
- Core implementation before integration
- Story complete before moving to the next priority

### Parallel Opportunities

- Setup tasks marked [P] can run in parallel
- Foundational tasks marked [P] can run in parallel when they touch different files
- Once Foundational is complete, user story tests can be written in parallel
- Different user stories can be worked on in parallel by different team members

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Stop and validate the locked startup and unlock journey

### Incremental Delivery

1. Complete Setup + Foundational
2. Add User Story 1 and validate the lock/unlock journey
3. Add User Story 2 and validate encrypted persistence
4. Add User Story 3 and validate repeated lock/unlock recovery
5. Add User Story 4 and validate offline use
6. Add User Story 5 and validate wipe/reset

---

## Notes

- [P] tasks = different files, no dependencies
- Each user story should be independently completable and testable
- Verify tests fail before implementing each story
- Commit after each logical group when practical
