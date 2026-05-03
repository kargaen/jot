# Refactor Summary

Definition of Done: this refactor is complete only when every unchecked item below is checked and the validation section passes without exceptions.

## 0. Baseline And Governance

- [x] Adopt `ARCHITECTURE.md` as the target structure and boundary contract.
- [x] Make the refactored directories active in the running app: `src/models`, `src/views`, `src/controllers`, `src/services`, `src/hooks`, `src/utils`.
- [x] Move verification scripts and tests onto the refactored paths.
- [ ] Keep this file as the single source of truth for refactor scope, progress, and completion.
- [ ] Update this file at the end of every refactor iteration.
- [ ] Keep comments aligned with the architecture rule: comment `why`, constraints, invariants, and cross-layer intent only.

## 1. Import Graph And Folder Activation

- [x] Remove stale imports that still depended on pre-refactor paths such as `lib/`, `windows/`, legacy `mobile/`, and old component locations.
- [x] Rewire `src/App.tsx` and `src/main.tsx` to the new structure.
- [x] Rewire auth, NLP, deep links, widget sync, preferences, and shared task-model imports to the new structure.
- [ ] Audit the full frontend import graph for any remaining references to deprecated locations.
- [ ] Remove or migrate any leftover compatibility imports once no consumers remain.

## 2. Boundary Rules Enforcement

- [ ] Ensure no `src/views/**` module imports from `src/services/**`.
- [ ] Ensure no `src/views/**` module imports from client store modules directly unless the file is intentionally acting as a hook/container and is moved accordingly.
- [ ] Ensure no `src/controllers/**` module imports from `src/views/**`.
- [ ] Ensure no `src/services/**` module imports from `src/controllers/**`, `src/views/**`, or client store modules.
- [ ] Ensure business logic lives in controllers and hooks rather than route/page view files.
- [ ] Ensure view components are render-first and callback-driven wherever practical.

## 3. Task Creation Surface

- [x] Extract `CreateTask` workflow state into `src/hooks/useCreateTask.ts`.
- [x] Keep create-task save orchestration in `src/controllers/tasks/saveCreateTask.controller.ts`.
- [x] Reduce `src/views/components/tasks/CreateTask.view.tsx` so it no longer owns NLP parsing and save orchestration directly.
- [ ] Finish turning `CreateTask.view.tsx` into a more prop-driven presentational surface.
- [ ] Move any remaining non-visual field-navigation or workflow behavior out of `CreateTask.view.tsx` if it proves reusable across capture surfaces.
- [ ] Verify all `CreateTask` consumers rely on the extracted boundary cleanly:
- [ ] `src/views/pages/desktop/capture/QuickCapture.view.tsx`
- [ ] `src/views/pages/desktop/dashboard/Dashboard.view.tsx`
- [ ] `src/views/components/tasks/TaskDetail.view.tsx`
- [ ] `src/views/pages/mobile/app/MobileApp.view.tsx`

## 4. Task Detail Surface

- [x] Extract task-detail workflow state into `src/hooks/useTaskDetail.ts`.
- [x] Introduce `src/controllers/tasks/taskDetail.controller.ts` for task-detail save, completion, assignee, and subtask orchestration.
- [x] Remove direct backend service imports from `src/views/components/tasks/TaskDetail.view.tsx`.
- [x] Move autosave scheduling, completion flow, assignee loading, subtask refresh, and editor save triggers behind the hook/controller boundary.
- [ ] Reduce remaining stateful UI mechanics inside `TaskDetail.view.tsx` where they can be shared or simplified.
- [ ] Decide whether inline select behavior stays as local view state or should become a reusable UI primitive.
- [ ] Decide whether task-window opening belongs in a dedicated desktop/window service boundary.
- [ ] Finish making `TaskDetail.view.tsx` primarily props + local display interactions.

## 5. Dashboard Surface

- [x] Audit `src/views/pages/desktop/dashboard/Dashboard.view.tsx` and list all mixed responsibilities still inside the view.
- [x] Extract dashboard data loading into a dedicated hook such as `useDashboard`.
- [x] Move dashboard task/project/area orchestration into controller modules where business decisions exist.
- [x] Extract dashboard-specific filtering, grouping, sorting, and derived display logic out of the view.
- [ ] Extract dashboard mutation flows out of the view:
- [x] task completion
- [x] task refresh/reload
- [x] project updates
- [x] area updates
- [ ] modal or side-panel orchestration
- [ ] Ensure the dashboard view becomes primarily composition of presentational task/project surfaces plus hook callbacks.
- [ ] Re-test `CreateTask` and `TaskRow` integration from the dashboard after extraction.

## 6. Mobile App Surface

- [ ] Audit `src/views/pages/mobile/app/MobileApp.view.tsx` for mixed view/controller responsibilities.
- [ ] Extract mobile app orchestration into a dedicated hook such as `useMobileApp`.
- [ ] Move mobile-specific task, capture, and navigation workflows behind hook/controller boundaries.
- [ ] Separate mobile-only derived state from JSX rendering concerns.
- [ ] Confirm mobile overrides remain thin deltas rather than duplicating desktop behavior unnecessarily.
- [ ] Re-test task creation, task editing, and navigation flows in the mobile surface after extraction.

## 7. Reminder And Pulse Surface

- [ ] Audit `src/views/pages/desktop/pulse/ReminderWindow.view.tsx` for workflow logic.
- [ ] Extract reminder-window orchestration into a dedicated hook such as `useReminderWindow`.
- [ ] Move reminder completion, loading, and window behavior decisions behind hook/controller boundaries.
- [ ] Check whether any pulse-specific logic belongs in a reusable pulse controller or hook shared with other reminder surfaces.

## 8. Remaining Page-Level Mixed Modules

- [ ] Audit the remaining route/page views for mixed responsibilities:
- [ ] `src/views/pages/desktop/settings/Preferences.view.tsx`
- [ ] `src/views/pages/desktop/tasks/TaskDetailWindow.view.tsx`
- [ ] `src/views/pages/desktop/capture/QuickCapture.view.tsx`
- [ ] Any other route-level view that still fetches data, writes data, or coordinates cross-surface workflow directly
- [ ] For each mixed module found, either:
- [ ] extract a hook/controller boundary
- [ ] reduce it to a thin wrapper/composition view
- [ ] or explicitly document why the remaining local logic is view-local and acceptable

## 9. Hook Layer Completion

- [x] Move auth boundary into `src/hooks/useAuth.tsx`.
- [x] Introduce `useCreateTask.ts`.
- [x] Introduce `useTaskDetail.ts`.
- [ ] Introduce missing hooks required by the architecture where the workflow is non-trivial:
- [x] `useDashboard`
- [ ] `useMobileApp`
- [ ] `useReminderWindow` or equivalent pulse/reminder hook
- [ ] Any additional thin React adapters needed to keep large views from talking to services directly
- [ ] Ensure hooks stay thin adapters over controllers/context rather than becoming a second service layer.

## 10. Controller Layer Completion

- [x] Keep create-task orchestration in `saveCreateTask.controller.ts`.
- [x] Add `taskDetail.controller.ts` for task-detail orchestration.
- [ ] Audit task-domain business logic still embedded in views and move it into task controllers.
- [x] Add dashboard-specific controller functions where dashboard behavior contains business decisions rather than pure rendering concerns.
- [ ] Add reminder/pulse controller functions where reminder behavior contains business decisions rather than pure rendering concerns.
- [ ] Normalize controller naming so each controller clearly matches a domain workflow.
- [ ] Remove any controller duplication introduced during incremental extraction.

## 11. Service Layer Completion

- [ ] Audit `src/services/backend/supabase.service.ts` for concerns that should be split by domain as the architecture describes.
- [ ] Decide whether to keep the current consolidated backend service temporarily or split it into smaller domain services:
- [ ] tasks
- [ ] projects
- [ ] areas/spaces
- [ ] users/auth-related backend calls
- [ ] realtime
- [ ] If split, update controllers and hooks to consume the domain services from the new locations.
- [ ] Keep service modules focused on I/O and transport concerns only.
- [ ] Ensure service helpers do not grow business rules that belong in controllers or models.

## 12. Model And Utility Layer Completion

- [x] Activate `src/models/tasks/*` and shared model modules in live imports.
- [ ] Audit all task/project/area shaping logic and move domain transforms into models or pure utilities where appropriate.
- [ ] Keep formatting-only helpers in `src/utils/**`.
- [ ] Keep presentational mapping helpers in presentation-oriented model or utility modules only when they are not business logic.
- [ ] Ensure cross-layer validation/data-shape rules still align with the architecture guidance around shared schemas.

## 13. Component And UI Primitive Cleanup

- [ ] Audit `src/views/components/tasks/**` for any remaining orchestration leakage.
- [ ] Decide whether repeated inline UI patterns should become reusable primitives under `src/views/components/ui/**`.
- [ ] Standardize any repeated select/dropdown/field-row interaction patterns that emerged during the refactor.
- [ ] Ensure reusable task components accept data and callbacks rather than reaching outward for workflow concerns.

## 14. Documentation And Local Notes

- [x] Update `src/hooks/README.md` to reflect `useCreateTask.ts` and `useTaskDetail.ts`.
- [x] Update `src/views/components/tasks/README.md` to reflect the partial `TaskDetail` boundary cleanup.
- [ ] Update documentation when new hooks/controllers are introduced in later slices.
- [ ] Keep `ARCHITECTURE.md` aligned with the actual code structure if implementation decisions change.
- [ ] Remove stale progress notes from code-local README files when the refactor is complete.

## 15. Verification And Audit Gates

- [x] `npm run build` passes after the completed slices so far.
- [x] `npm run test` passes except for the explicitly proposed NLP cases.
- [ ] Add or update tests for each extracted hook/controller boundary where behavior was moved.
- [ ] Re-run `npm run build` after every remaining major slice.
- [ ] Re-run `npm run test` after every remaining major slice.
- [ ] Audit for architectural violations with targeted searches before marking the refactor complete:
- [ ] views importing services
- [ ] views importing store directly
- [ ] controllers importing views
- [ ] services importing controllers
- [ ] route-level pages still owning workflow logic that should sit in hooks/controllers
- [ ] Resolve the outstanding NLP status before final sign-off:
- [ ] either implement `#project.space` syntax fully
- [ ] or explicitly remove/reclassify those tests so the final test suite passes cleanly without “known refactor exceptions”

## 16. Final Completion Checklist

- [ ] Every active view either:
- [ ] is a presentational component
- [ ] or is a thin page/container whose workflow logic is delegated to hooks/controllers
- [ ] Every non-trivial React workflow runs through a dedicated hook boundary.
- [ ] Every non-trivial business workflow runs through a controller boundary.
- [ ] Services are I/O-only and no longer act as ad hoc business-logic containers.
- [ ] No active code depends on deprecated folder structure or legacy import paths.
- [ ] Build passes.
- [ ] Tests pass.
- [ ] This file reflects the final completed state with all boxes checked.
