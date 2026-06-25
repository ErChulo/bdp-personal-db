# Vault Lock Contract

## Purpose

Define the locked and unlocked behavior of the local vault.

## Required Behavior

- The app must open in a locked state when no active unlock session exists.
- The app must refuse to render readable SQL or NoSQL data while locked.
- A correct passphrase must unlock the vault and restore the previous workspace state.
- An incorrect passphrase must not change stored data or reveal any decrypted payload.
- Reloading the page must return the app to the locked state.

