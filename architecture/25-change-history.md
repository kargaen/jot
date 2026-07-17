# 25. Change History

Append-only. One row per Description amendment, added by `epic-closeout`. Never edited or
reordered.

| Date | Epic | Sections | What changed |
|---|---|---|---|
| 2026-07-10 | — | all | `ARCHITECTURE.md` sharded into `architecture/constitution/` and `architecture/description/` per the installed `architecture-shard` skill. Content moved verbatim; no behavior or fact changed. See root index for the section map. |
| 2026-07-12 | EPIC-013 | §2 (by reference) | Effort-based capacity planning shipped. Schema: nullable `tasks.effort` (`light`/`medium`/`heavy`) via `supabase/migrations/20260712000000_task_effort.sql`. New model module `src/models/tasks/taskEffort.ts` (config-driven `dayLoad`/`isOverCapacity`/`overCapacityAreas`/`dayCapacityStatus`; effort never converts to time per §0). New preference `src/utils/preferences/effortConfig.ts` (localStorage `jot_effort_config`). New capture-grammar token `+` (`parseEffort` in `nlp.service.ts`), joining `#`/`@`/`!`. §2's tree is pre-existing stale fiction (root Findings) — not hand-edited; these paths are the verified record. |
| 2026-07-14 | EPIC-014 | §11b (+ §11a clarified by owner) | Export & copy surface. `serializeTasks` now emits JotExport **v2** — empty/null fields omitted (`src/models/export/jotExport.ts`, `dropEmpty`), changing the Conduit response shape. New derived `renderMarkdown` presentation. New copy plumbing: `useCopyTasks.ts` hook, `views/components/ui/CopyTasksControl.view.tsx`, `src/utils/preferences/exportFormat.ts` (localStorage `jot_export_format`). Copy affordance (JSON/MD picker) extended from mobile-only to desktop Dashboard and subtask lists. |
| 2026-07-17 | EPIC-001 | §2 | MVC boundary enforcement shipped. Added `scripts/check-view-service-imports.ts`, `tests/unit/models/import-boundary.test.ts`, and `test:boundaries`; removed all direct `src/views/**` → `src/services/**` imports by routing the affected behaviours through hooks (`usePreferences`, `useMobileApp`, `useMobileSettings`, `useMobileCapture`, `useReminderWindowShell`). |
