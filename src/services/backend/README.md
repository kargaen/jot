# Backend Services

Backend-facing services belong here.

Current note:
- `supabase.service.ts` was moved here from the old generic `lib` folder.

When wiring happens:
- Update imports from `src/lib/supabase.ts`.
- Consider splitting this file into task, project, area, auth, and collaboration service modules.
