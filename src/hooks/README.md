# Hooks

React-facing hooks belong here.

Current note:
- `useAuth.tsx` was moved here because it behaves like a hook/context boundary, not a generic library helper.
- `useCreateTask.ts` now holds the React-facing task creation workflow so `CreateTask.view.tsx` can stay focused on rendering and UI-local interactions.
- `useTaskDetail.ts` now holds task-detail autosave, completion, subtask refresh, and assignee-loading workflow so `TaskDetail.view.tsx` no longer imports backend services directly.
- `useDashboard.ts` now owns dashboard data loading, derived task views, and core task/project mutation workflow so `Dashboard.view.tsx` is no longer the only place coordinating those concerns.

When wiring happens:
- Update all imports that still point at `src/lib/auth.tsx`.
- Keep hooks thin. They should adapt controllers and context to React, not become a second service layer.
