# Vault Migration Contract

## Purpose

Define how existing local data becomes protected after the feature is introduced.

## Required Behavior

- Existing readable local data must be migrated into encrypted storage after the user sets a vault passphrase.
- Migration must preserve data across reloads after a successful unlock.
- A failed migration must not leave the app in a half-protected state with unreadable or lost data.
- Encrypted data must remain usable offline after the first successful load.

