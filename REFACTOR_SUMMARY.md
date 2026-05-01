# Refactor Summary

Date: 2026-05-01

This pass focused on making the folder structure in [ARCHITECTURE.md](./ARCHITECTURE.md) real in the running app, not just present on disk.

## Goal

The immediate goal was to stabilize the frontend after the folder moves into `src/models`, `src/views`, `src/controllers`, `src/services`, `src/hooks`, and `src/utils`.

Before this pass, the repo had already been partially reorganized, but many imports still pointed at the old layout such as `lib/`, `windows/`, `mobile/`, and older component paths. That meant the architecture existed conceptually, but the build and tests were still coupled to the pre-refactor structure.

## What Changed

### 1. The new folder structure became the source of truth

Updated imports so the app now resolves through the refactored module boundaries:

- `src/App.tsx`
- `src/main.tsx`
- `src/hooks/useAuth.tsx`
- `src/controllers/tasks/saveCreateTask.controller.ts`
- `src/models/tasks/*`
- `src/services/backend/supabase.service.ts`
- `src/services/capture/*`
- `src/services/desktop/deepLinks.service.ts`
- `src/services/sync/widgetSync.service.ts`
- `src/utils/preferences/hiddenAreas.ts`

This means the app now actively uses the new `hooks`, `services`, `utils`, `models`, and `views` directories instead of treating them like a parallel structure.

### 2. View/page imports were relinked to the new hierarchy

Updated the main task and app surfaces so they import from the current structure:

- `src/views/components/tasks/CreateTask.view.tsx`
- `src/views/components/tasks/TaskDetail.view.tsx`
- `src/views/components/tasks/TaskRow.view.tsx`
- `src/views/components/tasks/LogbookRow.view.tsx`
- `src/views/pages/desktop/capture/QuickCapture.view.tsx`
- `src/views/pages/desktop/dashboard/Dashboard.view.tsx`
- `src/views/pages/desktop/pulse/ReminderWindow.view.tsx`
- `src/views/pages/desktop/settings/Preferences.view.tsx`
- `src/views/pages/desktop/tasks/TaskDetailWindow.view.tsx`
- `src/views/pages/mobile/app/MobileApp.view.tsx`

This pass did not fully purify those views yet. It mainly repaired the wiring so the refactored tree compiles and runs.

### 3. Test paths and scripts were brought forward too

Updated `package.json` and the unit test imports so verification also follows the refactored structure:

- `tests/unit/services/nlp.test.ts`
- `tests/unit/services/nlp-natural.test.ts`
- `tests/unit/models/task-models.test.ts`
- `tests/unit/controllers/task-create-controller.test.ts`

The test commands now point at the real `tests/unit/...` files rather than the old top-level test paths.

## Why This Matters

This pass was mainly about restoring architectural integrity:

- The new folder layout now drives the app.
- Build and tests no longer depend on stale import paths.
- The codebase has a stable baseline for deeper refactoring.

Without this step, any follow-up cleanup would have been happening on top of a broken or ambiguous import graph.

## Validation

The following checks passed during this refactor:

- `npm run build`
- `npm run test`

Notes:

- The NLP suite still shows 2 failing cases labeled as proposed behavior, not as regressions from this pass.
- Those failures are for `#project.space` syntax that the tests explicitly mark as not yet implemented.

## Current Architectural State

The repo is now in a better transition state, but not yet at the final MVC target described in `ARCHITECTURE.md`.

What is true now:

- `models`, `services`, `views`, `controllers`, `hooks`, and `utils` are all active parts of the app.
- The app shell and major task surfaces compile through the new structure.
- Shared concerns such as auth, Supabase access, NLP, deep links, widget sync, theme handling, logging, and hidden-area preferences are imported from their new homes.

What is not true yet:

- Several views still contain orchestration logic that belongs in hooks/controllers.
- Some large pages are still acting as mixed view-controller modules.
- The tree is structurally aligned, but behavior boundaries still need tightening.

## Best Next Slice

The best next refactor slice is to make `CreateTask.view.tsx` genuinely view-first.

Right now it still owns too much of this workflow:

- raw capture input state
- NLP parsing lifecycle
- manual metadata editing state
- save orchestration
- project auto-creation behavior

Recommended next move:

1. Extract the `CreateTask` workflow into a dedicated hook such as `useCreateTask`.
2. Keep the save orchestration in a controller/service boundary.
3. Leave `CreateTask.view.tsx` focused on rendering props and firing callbacks.

After that, the next high-value targets are:

1. `src/views/components/tasks/TaskDetail.view.tsx`
2. `src/views/pages/desktop/dashboard/Dashboard.view.tsx`
3. `src/views/pages/mobile/app/MobileApp.view.tsx`
4. `src/views/pages/desktop/pulse/ReminderWindow.view.tsx`

## Worktree Notes

There is also an unrelated local change in `.vscode/tasks.json`.

That file was left as-is during this refactor and should be reviewed separately from the architecture work.
