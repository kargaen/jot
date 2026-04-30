# Observability Utils

Logging and diagnostics helpers live here.

Current note:
- `logger.ts` was moved here from `lib` because it is infrastructure support, not domain logic.

When wiring happens:
- Update imports from `src/lib/logger.ts`.
- Consider centralizing log categories and typed event names once rewiring starts.
