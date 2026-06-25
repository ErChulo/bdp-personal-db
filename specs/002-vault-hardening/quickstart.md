# Quickstart: Local Vault Hardening

1. Open the app in a fresh browser profile.
2. Create the vault passphrase when prompted.
3. Confirm the app unlocks and shows the existing SQL and NoSQL workspace.
4. Create or edit data normally; the app should keep writing encrypted local state.
5. Reload the page.
6. Confirm the vault starts locked again.
7. Enter the same passphrase and verify the prior data returns.
8. Use the lock control to return to the locked state without closing the browser.
9. If needed, use the wipe/reset control to delete the vault and return to first-run setup.

### Verification notes

- Locked views must not expose readable data.
- Failed unlock attempts must not alter stored content.
- Reset must be explicit and destructive.
- The app must still work after the browser goes offline once the local cache is installed.

