# Shared Models

Shared frontend data contracts currently live here.

Current note:
- `index.ts` was moved from `src/types/index.ts` to make the model layer more visible.

When wiring happens:
- Update all imports that still reference `src/types/index.ts`.
- Consider splitting the large shared index into smaller domain model files once imports are rewired.
