# Sync Services

Sync and replication-facing services belong here.

Current note:
- `widgetSync.service.ts` was moved here because it synchronizes app state into another surface.

When wiring happens:
- Update imports from `src/lib/widgetSync.ts`.
- Consider whether widgets, realtime sync, and offline cache sync should stay together or split into separate concerns.
