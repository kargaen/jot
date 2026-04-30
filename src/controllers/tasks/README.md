# Task Controllers

Task-related orchestration lives here.

Current note:
- `saveCreateTask.controller.ts` was moved here as the first explicit controller slice.

When wiring happens:
- Update imports from the old `src/controllers/tasks/saveCreateTask.ts` path.
- Consider splitting create, update, complete, and reorder flows into separate task controllers if this folder grows.
