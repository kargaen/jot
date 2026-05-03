# Dashboard Desktop View

This folder contains the main desktop dashboard surface.

Important wiring note:
- `Dashboard.view.tsx` is still one of the biggest mixed-responsibility files in the app.

When rewiring happens:
- Split loading, onboarding, sharing, and task orchestration into controllers/hooks first.
- Keep the visual shell here and move side effects outward.

Current progress:
- Dashboard data loading, derived task lists, and core task/project mutations now run through `useDashboard.ts` and `src/controllers/dashboard/dashboard.controller.ts`.
- The page still owns updater flow, reminder/window behavior, share-sheet UI, and several desktop-only interaction concerns.
