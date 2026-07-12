# EPIC-013: Effort-based capacity planning

**Status:** active
**Created:** 2026-07-12
**Architecture baseline:** f774c93

**Source:** project owner, 2026-07-12 (north-star braindump, confirmed):

> the idea is borrowed from/heavily inspired by scrum, so without actually writing things like
> "fist of five" I want to borrow those principles. setting effort to a simple scale for each
> task (heavy, medium, light or something like that) that doesn't necessarily scale to an
> exact time, and then having a setting to adjust how many "points" the user expects to be
> able to complete in a day (might even have a per area setting for this?)

> it intentionally does not go into micromanagement mode by setting number of hours to a task
> but works like scrum planning with effort/points so you get a warning if you have too much
> for one day, so you can reschedule or plan around it early instead of being late or caught
> without warning.

Design principles carried from the source, binding on every slice:

- Effort is a **simple ordinal scale** (working labels: light / medium / heavy), never hours.
  The scale deliberately does not convert to time anywhere in the product or the schema.
- Scrum principles without scrum vocabulary — no "story points", "fist of five", "velocity"
  in any user-facing surface.
- Effort is **optional per task**. A task without effort behaves exactly as today.
- The payoff is the **early warning**: an over-capacity day is flagged when it becomes
  over-capacity, so the user can reschedule ahead of time — never a nag after the fact.

---

## 1. BDD — User Flows

### Flow 1: Set effort on a task

```gherkin
Given a user editing or capturing a task
When they set effort to light, medium, or heavy
Then the task carries that effort
And a task with no effort set behaves exactly as before this epic
```

### Flow 2: Daily capacity setting

```gherkin
Given a user in settings
When they adjust how many points they expect to complete in a day
Then that capacity is used to evaluate each day's planned load
And a sensible default applies for users who never touch the setting
```

### Flow 3: Early over-capacity warning

```gherkin
Given a day whose scheduled tasks' combined effort exceeds the user's capacity
When the user views that day (Today, Upcoming) or schedules the task that tips it over
Then a calm, non-blocking warning shows the day is overloaded
And the user can reschedule from there
And nothing blocks them from keeping the overloaded plan
```

### Flow 4: Capture stays instant

```gherkin
Given a user capturing a task by natural language
When they do not mention effort
Then capture completes exactly as fast as today with no new prompt or required field
```

### Flow 5: Per-area capacity *(added 2026-07-12, Q1 resolved yes)*

```gherkin
Given a user who set a capacity on a specific area (space)
When a day's tasks in that area exceed the area's capacity
Then the over-capacity warning names the area, even if the day's total is under the
     daily capacity
And areas without their own capacity count only toward the daily total
```

**Out of scope for this epic:**
- [~] ~~Per-**area** capacity (parked as Q1)~~ — pulled into scope 2026-07-12 by owner
  decision ("q1, per area weight, yes"); see Flow 5.
- Time tracking, hour estimates, or any effort→duration conversion — permanently out per §0,
  not just deferred.
- Velocity/burndown analytics and completion statistics.
- NLP parsing of effort from capture text — owner said yes in principle (2026-07-12); the
  concrete syntax is a proposal awaiting their reflection (Q3) and lands as its own slice
  only once confirmed.

---

## 2. Function Call Signatures

*(deferred to revision 2 — the effort enum and the day-load predicate are the two contracts
to pin first; both live in the model layer per §1/§4)*

---

## 3. TDD — Testing Strategy

### Authority for correctness

| Under test | Authority |
|---|---|
| Effort values and their ordering | This epic: the confirmed three-step ordinal scale |
| Day-load summation + over-capacity predicate | This epic's rule: sum of effort points of tasks scheduled/due that day, compared to capacity; pure function in the model layer, pinned by unit tests |
| No-effort tasks unchanged | Legacy application output — existing suites (`npm test`) must pass untouched |
| Point weights per effort level | Decided 2026-07-12 (Q2): **experimental and user-tweakable at runtime** — weights and capacities live in one editable config, so tuning needs no rebuild. Suggested starting values: light = 1, medium = 2, heavy = 4, daily capacity = 8 (non-linear like scrum scales, so "heavy" carries its hidden complexity; 8 ≈ two heavies, or one heavy + two medium + light chores). Tests pin the *predicate math against whatever config is set*, not the specific numbers. |

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | task model accepts optional effort | this epic | new unit fixtures in `tests/unit/models/` | exact |
| 2 | capacity preference load/save + default | this epic | new unit fixtures | exact |
| 3 | over-capacity predicate (config-driven) | this epic (§3 weights row) | new unit fixtures | exact |
| 4 | capture path unchanged | legacy output | existing NLP/task suites | exact |
| 5 | area-scoped load vs. area capacity | this epic (Flow 5) | new unit fixtures | exact |

### What is deliberately not tested

Warning visual design and copy; how the user chooses to resolve an overloaded day.

---

## 4. Checklist

Stub-level ordering; slices to be finalized at revision 2 after Q2 is decided. Migration
first, model predicate second, surfaces last — one file per item when sliced.

```md
[x] 1. Decide point weights for light/medium/heavy (human decision, Q2) — done when
       recorded here. Recorded 2026-07-12: experimental + runtime-tweakable; suggested
       defaults light=1 / medium=2 / heavy=4, daily capacity 8 (see §3 authority table)
[x] 2. Add failing model test: optional effort on task shape + day-load predicate
       (predicate takes the weight/capacity config as an argument) — done when it fails
       for the right reason. Landed as `tests/unit/models/task-effort.test.ts`; observed
       red on assertions (expected 6, got 0) against a stub before the green step.
[ ] 3. Migration: nullable effort column on tasks — done when the schema change applies
       cleanly and RLS is untouched. (Also formally adds `effort` to the `Task` interface
       in `src/models/shared/index.ts`; the predicate reads `task.effort` structurally
       today, so this only makes the field first-class.)
[x] 4. Implement effort in the task model + day-load predicate in `src/models/tasks/` —
       done when test 2 passes. Landed as `src/models/tasks/taskEffort.ts`
       (`EffortLevel`, `EffortConfig`, `DEFAULT_EFFORT_CONFIG` = 1/2/4 cap 8,
       `taskEffortPoints`, `dayLoad`, `isOverCapacity`); done together with item 2 as one
       TDD slice, wired into `test:tasks`.
[ ] 5. Effort config preference (weights + daily capacity, editable defaults, load/save)
       with its own failing-then-passing test — done when the test passes
[ ] 6. Effort selector in the task editor surface — done when Flow 1 is exercisable and
       `npm test` passes
[ ] 7. Over-capacity warning in Today/Upcoming surfaces — done when Flow 3 is exercisable
       and `npm test` passes
[ ] 8. (added 2026-07-12) Per-area capacity: failing test for area-scoped load vs.
       area capacity, config extended with optional per-area entries — done when it fails
       for the right reason (slots after item 5)
[ ] 9. (added 2026-07-12) Implement per-area capacity in the predicate + warning naming
       the area — done when test 8 passes and Flow 5 is exercisable
[ ] 10. (added 2026-07-12) NLP effort token using `+` per Q3 (confirmed by owner
        2026-07-12): `+light +medium +heavy`, shorthands `+l +m +h`, Danish
        `+let +mellem +tung`. Done when the gating NLP suite covers it and passes.
```

---

## 5. Summary

### Architecture impact

- [x] Amends Description sections: §2 (schema/migration), possibly §9b if a new UI primitive
  (effort selector) is added
- [ ] No change to ARCHITECTURE.md expected
- [ ] Requires a Constitution change

### North star deviation

§0: "Planning stays at the effort altitude, not the hour altitude… warns early when a day
holds too much." This epic is that clause implemented. The deviation risk is inverted — the
epic must not *drift toward* hours or nagging; the out-of-scope list makes time conversion
permanently out, and Flow 3 requires the warning to be non-blocking.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | ~~Per-area capacity?~~ **Resolved 2026-07-12: yes, in scope** (Flow 5, items 8–9) | — | — |
| Q2 | ~~Point weights?~~ **Resolved 2026-07-12: experimental, runtime-tweakable; suggested defaults 1/2/4, capacity 8** (§3) | — | — |
| Q3 | ~~Effort token syntax?~~ **Resolved 2026-07-12: `+` prefix** — `+light +medium +heavy`, shorthands `+l +m +h`, Danish `+let +mellem +tung`. `+` is free in the grammar (`#`=project, `@`=date, `!`=priority) and stays reachable on mobile keyboards. Lands as item 10. | — | — |

### New capability

Yes — first planning/capacity feature; alluded to by §0's third clause, so named but aligned.
