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

Authority: "stale" needs a definition before anything can pin it (Q1) — the task-visibility
predicates in `src/models/tasks/` are where it would live as a pure predicate.

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | staleness predicate | recorded definition (Q1) | TBD | exact |

### What is deliberately not tested

The tone/copy of the ritual.

---

## 4. Checklist

```md
[ ] 1. Define "stale task" (human decision) — done when recorded here as a testable predicate
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
| Q1 | Definition of stale | Everything | Item 1 |

### New capability

Yes — a review surface, alluded to by README's "future review flows".
