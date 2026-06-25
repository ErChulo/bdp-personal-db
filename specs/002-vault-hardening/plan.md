# Implementation Plan: Local Vault Hardening

**Branch**: `002-vault-hardening` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-vault-hardening/spec.md`

## Summary

Add a local vault boundary around BDP so SQL and NoSQL data are encrypted at rest, the app opens in a locked state until the user unlocks it with a passphrase, and a deliberate reset path exists for vault retirement. The feature stays fully local and offline-capable; it does not introduce any remote recovery, login, or synchronization service.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Node.js 20 for build tooling  
**Primary Dependencies**: Vite 6.4, sql.js 1.14, Dexie 4, Zustand 5, WebCrypto API, IndexedDB, Cache Storage  
**Storage**: IndexedDB for encrypted SQL bytes, encrypted NoSQL data, and vault metadata; Cache Storage for offline assets; localStorage only for non-sensitive UI preferences and lock state hints  
**Testing**: Vitest/jsdom for vault and adapter contracts; Playwright/Chromium for lock, unlock, reset, reload, and offline journeys  
**Target Platform**: Current Chromium-based desktop browser served over localhost or HTTPS; production is not supported through `file://`  
**Project Type**: Static, client-only progressive web application  
**Performance Goals**: Unlock should feel immediate for normal vault sizes; locking should be instant; encryption/decryption work must not block visible UI flows  
**Constraints**: No runtime backend or remote recovery; no plaintext fallback when a vault exists; wrong passphrases and corrupted payloads must fail explicitly; app remains offline-capable after the first successful HTTP load  
**Scale/Scope**: One browser profile and vault at a time, with existing SQL databases and NoSQL collections migrated into protected storage

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Local-first — PASS**: The feature remains browser-local, with no network service required for vault setup, unlock, or data access.
- **Durability — PASS**: Successful writes are still committed before success is reported; unlock must rehydrate the prior stored state rather than substituting empties.
- **Recovery — PASS**: The spec defines explicit reset/wipe behavior and states that forgotten passphrases are not bypassed silently.
- **Navigation/accessibility — PASS**: Locked, unlocked, and reset flows require visible controls, keyboard access, and explicit error states.
- **Executable proof — PASS**: The feature will carry unit and browser regressions for locked startup, unlock, reload, corruption handling, and reset behavior.

No constitution exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/002-vault-hardening/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── vault-lock.md
│   ├── vault-reset.md
│   └── vault-migration.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── adapters/
├── security/
├── sections/
├── shell/
├── styles/
├── utils/
├── workers/
└── workspace/

tests/
├── browser/
├── fixtures/
└── helpers/
```

**Structure Decision**: Keep the single-page browser app and add a dedicated `src/security/` boundary for vault setup, unlock, lock, migration, and encrypted persistence helpers. Existing sections and adapters will call through that boundary rather than duplicating protection logic in each feature view.

## Complexity Tracking

No constitution violations or exceptional complexity are approved.

