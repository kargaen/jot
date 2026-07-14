# 25. Change History

Append-only. One row per Description amendment, added by `epic-closeout`. Never edited or
reordered.

| Date | Epic | Sections | What changed |
|---|---|---|---|
| 2026-07-10 | — | all | `ARCHITECTURE.md` sharded into `architecture/constitution/` and `architecture/description/` per the installed `architecture-shard` skill. Content moved verbatim; no behavior or fact changed. See root index for the section map. |
| 2026-07-12 | EPIC-013 | §2 (by reference) | Effort-based capacity planning shipped. Schema: nullable `tasks.effort` (`light`/`medium`/`heavy`) via `supabase/migrations/20260712000000_task_effort.sql`. New model module `src/models/tasks/taskEffort.ts` (config-driven `dayLoad`/`isOverCapacity`/`overCapacityAreas`/`dayCapacityStatus`; effort never converts to time per §0). New preference `src/utils/preferences/effortConfig.ts` (localStorage `jot_effort_config`). New capture-grammar token `+` (`parseEffort` in `nlp.service.ts`), joining `#`/`@`/`!`. §2's tree is pre-existing stale fiction (root Findings) — not hand-edited; these paths are the verified record. |
