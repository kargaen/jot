# Task View Components

Reusable task-domain views belong here.

Current note:
- `CreateTask`, `TaskRow`, `TaskDetail`, and `LogbookRow` were moved here to make the task surface visible in the tree.

When wiring happens:
- Update imports from `src/components/*` and the earlier `src/views/tasks/*` path.
- `TaskDetail.view.tsx` has started moving toward a hook/controller split, but it is not yet a purely presentational surface.
