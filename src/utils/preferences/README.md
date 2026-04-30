# Preference Utils

Small preference and local-storage helpers live here.

Current note:
- `hiddenAreas.ts` came from the old `tasks.ts` helper file because its strongest current identity is preference persistence.

When wiring happens:
- Update imports from `src/lib/tasks.ts`.
- Re-evaluate whether visibility filters should stay here or move fully into `models` once the last legacy re-exports are removed.
