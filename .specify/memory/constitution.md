<!--
Sync Impact Report
- Version change: template (unratified) -> 1.0.0
- Added principles:
  - I. Local-First Is the Product
  - II. Data Durability Is Non-Negotiable
  - III. Fail Explicitly and Recover Safely
  - IV. Every Workflow Must Remain Navigable
  - V. Regressions Require Executable Proof
- Added sections: Product and Technical Constraints; Delivery and Review Gates
- Removed sections: none (template placeholders replaced)
- Templates:
  - ✅ .specify/templates/plan-template.md
  - ✅ .specify/templates/spec-template.md
  - ✅ .specify/templates/tasks-template.md
- Runtime guidance:
  - ✅ README.md
- Follow-up TODOs: none
-->
# BDP Constitution

## Core Principles

### I. Local-First Is the Product
BDP MUST perform its application work on the user's device. Database contents,
queries, indexes, backups, reports, and generated keys MUST NOT require an
application backend or transmit user data to a remote service. A production
build MUST remain usable without internet access after its first successful
HTTP load. Any new dependency on a network service requires a constitution
amendment, an explicit user-visible boundary, and a documented offline failure
mode. Local HTTP used to satisfy browser security requirements is not a backend.

Rationale: privacy, ownership, and disconnected operation are primary product
requirements rather than deployment conveniences.

### II. Data Durability Is Non-Negotiable
Any operation reported as successful MUST be durably written before success is
shown. SQL databases MUST rehydrate their exact stored bytes before schema,
query, report, search, export, or backup operations. No adapter may silently
replace missing or unloaded state with an empty database. Mutating operations
MUST persist their resulting state, and create/import/export/backup flows MUST
have round-trip coverage across navigation and page reloads.

Rationale: a database tool that loses or substitutes data has failed its core
contract, regardless of UI quality or feature breadth.

### III. Fail Explicitly and Recover Safely
Errors MUST be visible, actionable, and associated with the operation that
failed. Catch blocks MUST NOT conceal failures that can affect data integrity.
Destructive operations MUST require explicit confirmation and identify their
scope. Import and restore flows MUST validate before replacing durable state.
Users MUST have an export or backup path for stored data, and recovery behavior
MUST be documented for any operation capable of partial completion.

Rationale: local-only storage removes server-side recovery, so transparency and
user-controlled backups are mandatory safeguards.

### IV. Every Workflow Must Remain Navigable
Every section MUST provide a visible pointer-accessible route to Dashboard and
the other primary sections; keyboard shortcuts are enhancements, not the sole
navigation mechanism. New journeys MUST define loading, empty, success, and
error states. Interactive controls MUST have accessible names and keyboard
focus behavior. Layouts MUST remain operable at narrow desktop/mobile widths,
and reduced-motion preferences MUST be honored for nonessential animation.

Rationale: hidden keyboard-only exits and ambiguous state make otherwise valid
features unusable and caused direct failures in the original shell.

### V. Regressions Require Executable Proof
Bug fixes MUST include a regression test at the lowest level that proves the
failed contract, with browser/integration coverage when persistence or a user
journey crosses module boundaries. Every change MUST pass TypeScript checking,
the complete Vitest suite, a production build, and offline artifact validation.
Committed production artifacts MUST match the current source build. CI MUST run
the same gates used locally.

Rationale: compilation and isolated pure-function tests did not detect prior
data-loss and packaging failures; durable quality requires contract-level proof.

## Product and Technical Constraints

- The application is single-user and browser-based, using React and TypeScript.
- SQL execution runs through sql.js in a Web Worker; durable SQL bytes live in
  IndexedDB. NoSQL data uses Dexie/IndexedDB.
- Runtime assets, including workers and WASM, MUST be local, relatively
  addressable, and covered by the offline precache manifest.
- Browser security constraints MUST be stated accurately: production use is
  served from a local or hosted HTTP(S) origin, not `file://`.
- Sensitive database content MUST NOT be logged, included in telemetry, or sent
  over the network. BDP ships with no analytics.
- Performance work MUST preserve correctness. Any optimization that weakens
  persistence, validation, or error reporting is prohibited.
- Scope remains personal database management. Authentication, multi-user sync,
  and remote database connections require separate specifications.

## Delivery and Review Gates

Each feature specification MUST contain independently testable user journeys,
data lifecycle and recovery behavior, offline implications, and explicit
loading/empty/error states. Plans MUST pass every Constitution Check before
implementation and again after design. Tasks affecting storage or adapters MUST
include reload/round-trip regression coverage before UI polish.

Before handoff or merge, run:

```bash
npm run typecheck
npm test
npm run build
```

Reviewers MUST reject changes that can acknowledge success before persistence,
silently create substitute state, remove visible navigation, introduce an
undocumented network dependency, or omit a regression test for a repaired bug.

## Governance

This constitution overrides conflicting implementation habits, templates, and
feature-local decisions. Amendments MUST be proposed as documented changes that
state the motivation, compatibility impact, affected templates, and migration
work. Semantic versioning applies: MAJOR for incompatible principle removal or
redefinition, MINOR for a new principle or materially expanded obligation, and
PATCH for non-semantic clarification.

Every specification and implementation plan MUST record constitution compliance.
Any exception MUST be explicit in the plan's Complexity Tracking table, include
a rejected simpler alternative, and receive user approval before implementation.
Compliance is rechecked during review and whenever a data-loss, offline, or
navigation regression is discovered.

**Version**: 1.0.0 | **Ratified**: 2026-06-22 | **Last Amended**: 2026-06-22
