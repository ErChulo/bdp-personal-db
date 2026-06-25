# Feature Specification: Reliable Offline BDP

**Feature Branch**: `N/A (existing repository; no branch hook configured)`

**Created**: 2026-06-22

**Status**: Draft

**Input**: User description: "Fix and complete BDP as a reliable offline personal database application."

## Clarifications

### Session 2026-06-22

- Q: When importing tabular data into an existing destination, what should happen? → A: Append when schema-compatible; otherwise reject without changes.
- Q: What should happen when restored data collides with an existing dataset? → A: Preserve existing data and restore a renamed copy with a new identity.
- Q: When a newer cached application build is ready, how should it activate? → A: Prompt for reload after all data operations are idle.
- Q: What maximum individual import or restore file size must BDP support? → A: 500 MB.
- Q: How should BDP handle the same workspace opened in multiple tabs? → A: One writable tab; other tabs are read-only with explicit takeover.
- Q: How should office users run the app when they cannot install software or run a local server? → A: The supported no-install workflow is HTTPS static hosting, such as GitHub Pages. The user opens the hosted app once while online, the service worker precaches local runtime assets, and future use works offline from the same browser profile. The app must show when offline installation is ready.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trust Durable SQL Work (Priority: P1)

As a user, I can create or import a SQL database, define tables, modify records,
move between sections, close or reload the application, and return to the exact
same database state.

**Why this priority**: Durable data is the central promise of a database tool.
Losing a table or substituting an empty database makes every other capability
unsafe to use.

**Independent Test**: Create a named database with a table and records, navigate
through Query and Dashboard, reload the application, and verify the database,
schema, records, and active selection remain available and queryable.

**Acceptance Scenarios**:

1. **Given** no SQL databases exist, **When** the user creates a database with an initial table, **Then** the database and table are visible immediately and after a page reload.
2. **Given** a stored SQL database, **When** the user executes statements that insert, update, delete, or alter data, **Then** the resulting state is durable before success is reported.
3. **Given** a stored SQL database that has not yet been opened in the current session, **When** the user views its schema or runs a query, **Then** the stored database is loaded rather than replaced by an empty database.
4. **Given** loading or persistence fails, **When** the operation completes, **Then** the user sees an actionable error and the application does not claim success.
5. **Given** another tab owns write access, **When** the user opens the workspace in an additional tab, **Then** the additional tab is read-only until the user explicitly takes over write access.

---

### User Story 2 - Navigate Every Workflow (Priority: P1)

As a user, I can move between Dashboard, managers, Query, Import, Export,
Reports, Search, Backup, Schema Diff, and Key Generation without becoming
trapped or needing to know keyboard shortcuts.

**Why this priority**: A feature is unusable when entering it removes the only
visible way back. Navigation must support discovery and recovery from mistakes.

**Independent Test**: Enter every primary section using pointer controls and
return to Dashboard from each section without reloading or using a shortcut.

**Acceptance Scenarios**:

1. **Given** any primary section is open, **When** the user uses visible navigation, **Then** they can reach Dashboard and every other primary section.
2. **Given** a section is active, **When** the shell renders, **Then** the active destination is visually and programmatically identified.
3. **Given** the viewport becomes narrow, **When** the user navigates the application, **Then** primary destinations and the current content remain operable without overlapping controls.
4. **Given** the user prefers reduced motion, **When** loading or navigation feedback appears, **Then** nonessential animation is suppressed.

---

### User Story 3 - Work Without Internet Access (Priority: P2)

As a user, I can load the installed production application from a local or
hosted HTTPS/HTTP address, disconnect from the internet, reload it, and continue
working with local databases and tools.

**Why this priority**: Offline operation and local data ownership distinguish
BDP from hosted database services.

**Independent Test**: Load the application once, disable external network
access, reload, then create, query, report on, export, and back up local data.

**Acceptance Scenarios**:

1. **Given** the production application completed one successful HTTP load and reports offline readiness, **When** internet access is unavailable and the page reloads, **Then** all runtime resources required by the application remain available.
2. **Given** the application is offline, **When** the user performs database or utility operations, **Then** no operation waits for or attempts to contact an external service.
3. **Given** the user opens the application directly as a local file, **When** browser security prevents execution, **Then** the page explains how to start the local application address instead of remaining blank.

---

### User Story 4 - Move and Recover Data Safely (Priority: P2)

As a user, I can preview and import supported data, export databases and
collections, create a complete backup, and restore it without silently
overwriting unrelated data.

**Why this priority**: In a local-only product, portable exports and verified
backups are the user's recovery mechanism.

**Independent Test**: Import representative tabular, document, and database
files; export them; create a full backup; restore into a clean workspace; and
compare names, schemas, record counts, and representative values.

**Acceptance Scenarios**:

1. **Given** a supported import file, **When** the user selects it, **Then** the application identifies the format and displays a bounded preview before committing changes.
2. **Given** an import targets existing data, **When** the user confirms it, **Then** only the disclosed destination is changed and unrelated databases remain intact.
3. **Given** a backup contains SQL and document data, **When** it is restored, **Then** all included datasets are available with their original content and no partial restore is reported as successful.
4. **Given** a restored dataset conflicts with an existing name or identity, **When** restore commits, **Then** the existing dataset remains unchanged and the restored dataset receives a new identity and a distinct visible name.
5. **Given** a malformed or unsupported file, **When** import or restore is attempted, **Then** the application reports the problem without modifying durable data.

---

### User Story 5 - Inspect and Use Local Data (Priority: P3)

As a user, I can inspect schemas and records, run queries, generate reports,
search loaded data, compare schemas, and generate identifiers and keys with
clear loading, empty, success, and error feedback.

**Why this priority**: These capabilities provide the value beyond storage once
the durability, navigation, and recovery foundations are trustworthy.

**Independent Test**: Populate representative SQL and document datasets, then
complete one successful operation in Query, Reports, Search, Schema Diff, and
Key Generation and verify each result and state message.

**Acceptance Scenarios**:

1. **Given** an active dataset, **When** the user invokes an analysis or search operation, **Then** results identify their source and present deterministic counts or values.
2. **Given** no compatible dataset is active, **When** the user opens a dependent tool, **Then** the empty state explains the prerequisite and provides a visible navigation path.
3. **Given** a long-running operation, **When** it is in progress, **Then** duplicate submission is prevented and progress or busy state is visible.

### Edge Cases

- Storage is unavailable, quota is exhausted, or a durable write transaction aborts.
- A stored database handle exists but its underlying bytes are missing or corrupt.
- The application reloads while a mutation, import, export, or restore is incomplete.
- Multiple statements contain both read-only and mutating operations.
- An import targets an existing table with incompatible columns or value types.
- An imported file is empty, larger than 500 MB, malformed, or mislabeled by extension.
- A backup contains duplicate names, duplicate identifiers, or only a subset of expected files.
- Cached application resources are from an older build during an update.
- An update becomes ready while a query, mutation, import, export, or restore is active.
- No datasets exist, a selected dataset was deleted, or a previous active selection is stale.
- Browser storage is cleared outside the application while the application remains open.
- The writable tab closes, crashes, or becomes unresponsive while another tab is read-only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let the user create, name, select, inspect, and delete multiple independent SQL databases.
- **FR-002**: A newly created SQL database MUST preserve its initial schema across section navigation, application closure, and page reload.
- **FR-003**: The system MUST load the complete stored state of a SQL database before any schema, query, report, search, export, or backup operation uses it.
- **FR-004**: The system MUST durably save every successful SQL mutation before displaying success.
- **FR-005**: The system MUST reject missing, corrupt, or unloadable database state with an actionable error and MUST NOT substitute an empty database.
- **FR-006**: The system MUST let the user create and manage document collections with declared fields and durable documents.
- **FR-007**: The system MUST provide visible persistent navigation to all primary sections and a visible return path to Dashboard from every section.
- **FR-008**: The system MUST retain keyboard navigation and command search as optional accelerators rather than required navigation paths.
- **FR-009**: Each data operation MUST expose applicable loading, empty, success, and error states and prevent conflicting duplicate submissions while busy.
- **FR-010**: The production application MUST reload and perform its local functionality without internet access after one successful HTTP load.
- **FR-011**: The application MUST explain the local HTTP startup requirement when opened through an unsupported local-file address.
- **FR-012**: The system MUST NOT transmit database contents, queries, reports, searches, backups, or generated secrets to an external service.
- **FR-013**: The system MUST support preview-before-commit imports for CSV, JSON arrays, newline-delimited JSON, SQL dumps, and SQLite database files.
- **FR-014**: Importing tabular data into an existing destination MUST append only when its schema is compatible; incompatible imports MUST be rejected before writing and MUST leave the destination unchanged.
- **FR-015**: Failed validation, import, or restore MUST leave previously durable data unchanged.
- **FR-016**: The system MUST export supported datasets into their documented portable formats with the displayed source name and complete committed contents.
- **FR-017**: A full backup MUST include every selected SQL database and document collection needed for an equivalent restore.
- **FR-018**: Restore MUST validate backup structure before committing and MUST report partial failure without claiming complete success.
- **FR-018a**: Restore name or identity collisions MUST preserve the existing dataset and create the restored dataset with a new identity and a distinct visible name.
- **FR-019**: Query results, reports, searches, and schema comparisons MUST identify their source dataset and distinguish no results from operation failure.
- **FR-020**: Destructive actions MUST identify affected data and require explicit user confirmation.
- **FR-021**: The interface MUST provide accessible names, visible keyboard focus, and operable pointer controls for all interactive elements.
- **FR-022**: The primary workflows MUST remain operable at viewport widths from 360 pixels through standard desktop sizes.
- **FR-023**: The system MUST honor reduced-motion preferences for nonessential loading and transition animation.
- **FR-024**: Application updates MUST not strand the user on an obsolete resource set or require clearing all stored database data.
- **FR-025**: A ready application update MUST wait until data operations are idle, notify the user, and activate only after the user confirms reload.
- **FR-026**: Import and restore MUST support individual files up to and including 500 MB; larger files MUST be rejected before any durable change.
- **FR-027**: Only one browser tab MAY mutate a workspace at a time; additional tabs MUST remain read-only, identify the current ownership state, and require explicit takeover before enabling mutations.
- **FR-028**: Write ownership MUST become recoverable when the owning tab closes or becomes unavailable without permitting simultaneous writers.

### Constitution Requirements *(mandatory for storage or UI features)*

- **CR-001**: Success for a mutation occurs only after its complete resulting state is durably recoverable following navigation and reload.
- **CR-002**: All primary workflows remain functional without external network access after the initial production load; no external runtime dependency is permitted.
- **CR-003**: Every primary workflow defines loading, empty, success, error, partial-failure, and recovery behavior where applicable.
- **CR-004**: Every affected view provides visible pointer navigation, accessible names, keyboard focus, and a Dashboard return path.
- **CR-005**: Persistence repairs require tests proving stored-state loading and post-mutation durable writes; cross-section journeys require integration-level verification.

### Key Entities

- **SQL Database**: A user-named durable database with a stable identity, creation and modification timestamps, binary contents, tables, indexes, and records.
- **SQL Table**: A named structure within one SQL database containing columns, constraints, indexes, and records.
- **Document Collection**: A user-named durable collection with a stable identity, declared fields, indexes, timestamps, and documents.
- **Import Operation**: A pending or completed transformation from a user-selected file into a disclosed destination, with detected format, preview, validation result, and outcome.
- **Export Artifact**: A portable representation of a committed source dataset in a user-selected format.
- **Backup Archive**: A validated portable package containing selected SQL databases, document collections, and enough metadata for equivalent restoration.
- **Workspace Selection**: The currently active SQL database, collection, section, and related UI context; it references durable entities but does not replace their stored state.
- **Activity Record**: A local, non-sensitive description of a completed user action and its time, without database contents.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 25 consecutive create-modify-navigate-reload trials, 100% retain the expected database name, schema, record count, and representative values.
- **SC-002**: Users can reach Dashboard from every primary section with one visible action and reach any other primary section with no more than two visible actions.
- **SC-003**: After one successful production load, all primary sections open and all local data workflows complete during a test with external network access disabled.
- **SC-004**: Supported import-export round trips preserve dataset names, schema fields, record counts, and representative values in 100% of fixture-based trials.
- **SC-005**: A complete backup and clean-workspace restore preserves all included dataset names, schemas, record counts, and representative values in 100% of fixture-based trials.
- **SC-006**: A user can create a first database, create its table, insert records, and view query results in under 90 seconds using only visible controls and in-app guidance.
- **SC-007**: Reports for a 10,000-row numeric dataset present results within one second on the supported reference environment.
- **SC-008**: All primary workflows are operable at 360-pixel and 1440-pixel viewport widths with no unreachable controls or overlapping navigation.
- **SC-009**: Automated quality gates detect a missing durable write, an unloaded stored database, a root-absolute runtime asset, or an omitted offline runtime asset before release.
- **SC-010**: No handled data-integrity failure is silent; every injected storage, validation, import, and restore failure produces a visible operation-specific message.
- **SC-011**: Representative 500 MB import and restore fixtures complete without partial durable changes or an unresponsive interface on the supported reference environment.

## Assumptions

- BDP serves one user on one browser profile and does not synchronize between devices.
- Users access production through a local or hosted HTTP(S) address because browsers restrict advanced application features on local-file addresses.
- The supported browser provides local durable storage, background workers, cryptographic randomness, and offline resource caching.
- Authentication, multi-user collaboration, remote database connections, cloud synchronization, and server-managed recovery are outside this feature.
- The product remains installable and buildable with third-party packages obtained beforehand; a completely empty package cache is not considered an offline installation source.
- Existing user data must remain readable throughout application updates unless an explicit, tested migration is specified.
