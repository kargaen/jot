# E2E Notes

Current scope:

- `auth-screen.spec.ts` exercises the desktop auth UI through a dedicated harness page.
- `local-db.local.spec.ts` exercises a real local-Supabase harness page and writes test data into the local stack.
- The harness keeps the first Playwright suite deterministic and visually debuggable while we build out broader coverage.

Planned next slices:

- Desktop onboarding for the first space / area.
- Dashboard task creation flow using the real `CreateTask.view.tsx` surface.
- Task row interactions such as complete, open, and detail navigation.
- Settings panels and their toggle/button coverage.
- Mobile harness coverage once the desktop flow is stable.

The long-term goal is full button and UI element coverage. The short-term goal is stable, inspectable Playwright runs that are easy to debug from VS Code.

Local DB path:

- Start the local Supabase stack with `npm run db:start`.
- Reset and seed the local fixtures with `npm run db:prepare:e2e`.
- Run the real local Playwright lane with `npm run test:ui:local`.

The local lane is separate from the lightweight harness lane so we can keep one fast path for visual component checks and one real integration path for database-backed UI flows.
