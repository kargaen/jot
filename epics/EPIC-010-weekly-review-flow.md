# EPIC-010: Weekly review & reset flow

**Status:** draft
**Created:** 2026-07-12
**Architecture baseline:** 7d0178c

**Source:** migrated from `ROADMAP.md` (deleted by the governance cleanup):

> Weekly review and reset flow. A lightweight ritual could help users clean up stale tasks and
> close loops without making Jot feel heavy.

---

## 1. BDD — User Flows

### Flow 1: A lightweight review closes loops

```gherkin
Given a user with stale tasks accumulated over a week
When they start the review flow
Then they are walked through stale items one at a time with complete/reschedule/drop choices
And finishing the review leaves no item untouched-by-decision
```

### Flow 2: The ritual stays optional

```gherkin
Given a user who never starts a review
When they use Jot normally
Then nothing nags them beyond whatever entry point the review has
```

**Out of scope for this epic:**
- Analytics/reporting on review habits.
- Any mandatory or scheduled interruption.

---

## 2. Function Call Signatures

*(deferred to revision 2)*

---

## 3. TDD — Testing Strategy

Authority: Q1 is answered (see §5) — the predicate is `isLingering` in
`src/models/tasks/taskAttention.ts`, pinned by `tests/unit/models/task-attention.test.ts`.
The review flow reuses it rather than defining a second notion of staleness.

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | `isLingering(task, today, thresholdDays)` | `tests/unit/models/task-attention.test.ts` | inline `LingeringCandidate` rows | exact |

### What is deliberately not tested

The tone/copy of the ritual.

---

## 4. Checklist

```md
[x] 1. Define "stale task" (human decision) — recorded in §5 Q1; predicate lives in
       src/models/tasks/taskAttention.ts and shipped 2026-08-07 as the Lingering bucket
[ ] 2. Revision 2: slices — done when epic-review returns approved
```

---

## 5. Summary

### Architecture impact

- [x] No change to ARCHITECTURE.md expected
- [ ] Amends Description sections
- [ ] Requires a Constitution change

### North star deviation

§0 pending; interim README north star: "help people finish, not just collect" — this epic is
that principle directly; the Flow 2 guard keeps it from becoming productivity theater.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| ~~Q1~~ | ~~Definition of stale~~ — **answered by the owner, 2026-08-07:** a task is stale ("lingering") when it is open, carries no `due_date` **and** no `scheduled_date`, and its `updated_at` is at least *N* days old, where *N* is a user setting defaulting to 7. Dated tasks are never stale — Overdue/Upcoming already own them. | — | Closed |

### New capability

Yes — a review surface, alluded to by README's "future review flows".
