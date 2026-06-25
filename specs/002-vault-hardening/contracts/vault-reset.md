# Vault Reset Contract

## Purpose

Define the deliberate wipe/reset behavior for vault retirement or forgotten passphrases.

## Required Behavior

- Reset requires an explicit user confirmation.
- Reset removes the vault and all encrypted local payloads.
- Reset returns the app to first-run setup state.
- Reset must not silently preserve decrypted material in storage.

