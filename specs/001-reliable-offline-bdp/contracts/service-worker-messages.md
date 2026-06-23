# Contract: Service Worker Updates

## Worker-to-client messages

### `UPDATE_READY`

Sent when a complete newer precache is installed and waiting.

```json
{ "type": "UPDATE_READY", "buildId": "content-derived-build-id" }
```

The client records the state but prompts only after the operation registry is idle.

### `ACTIVATED`

```json
{ "type": "ACTIVATED", "buildId": "content-derived-build-id" }
```

Clients normally reload from `controllerchange`; this message supports diagnostics.

## Client-to-worker messages

### `SKIP_WAITING`

```json
{ "type": "SKIP_WAITING", "buildId": "expected-build-id" }
```

Sent only after the user confirms reload and operations are still idle. A mismatched build ID is ignored.

## Lifecycle rules

- Install precaches all required relative application assets before declaring readiness.
- Install does not call `skipWaiting` automatically.
- User confirmation temporarily blocks new operations, sends `SKIP_WAITING`, and reloads once when the controller changes.
- Activation claims clients and removes only obsolete application caches after the new cache is complete.
- Cache cleanup never touches IndexedDB, localStorage workspace data, user files, or unrelated origin caches.
- If activation fails or times out, keep the current page usable and offer retry; never instruct the user to clear database storage.
