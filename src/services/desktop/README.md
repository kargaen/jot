# Desktop Services

Desktop-only or desktop-leaning integration services belong here.

Current note:
- `deepLinks.service.ts` was moved here because it is a platform boundary, not domain logic.

When wiring happens:
- Update imports from `src/lib/deepLinks.ts`.
- A future `window` or `notifications` bridge folder would fit naturally beside this file.
