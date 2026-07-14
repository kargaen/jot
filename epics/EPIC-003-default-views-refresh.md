# EPIC-003: Default views refresh (and saved views after)

**Status:** draft
**Created:** 2026-07-12
**Architecture baseline:** 7d0178c

**Source:** migrated from `ROADMAP.md` (deleted by the governance cleanup):

> Refresh the default views model. Explore a stronger built-in set of views that feels natural
> out of the box, then layer optional saved views on top for power users.

> Saved views: likely useful, but only after the built-in navigation feels complete without
> user setup.

---

## 1. BDD — User Flows

### Flow 1: Built-in views feel complete without setup

```gherkin
Given a new user with a handful of captured tasks
When they open the app's built-in views (Today, Upcoming, Inbox, All, Logbook, …)
Then overdue, due-today, inbox, and project work are each clearly visible somewhere
And no configuration step was required to get there
```

**Out of scope for this epic:**
- Saved/custom views. The roadmap's own ordering applies: built-ins first, saved views only
  after built-in navigation feels complete. Saved views become their own epic when this closes.

---

## 2. Function Call Signatures

*(deferred to revision 2)*

---

## 3. TDD — Testing Strategy

Authority: TBD — this epic starts as product exploration; the authority for "which views" is a
human decision to be recorded here before implementation. Task-visibility predicates in
`src/models/tasks/taskVisibility.ts` pin per-view membership once views are chosen.

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | per-view membership predicates | TBD (view set undecided) | TBD | exact |

### What is deliberately not tested

Visual design of the views.

---

## 4. Checklist

```md
[ ] 1. Decide and record the target built-in view set (human decision) — done when
       recorded in this epic and §1 is updated with one flow per view
[ ] 2. Revision 2: test map + slice checklist — done when epic-review returns approved
```

---

## 5. Summary

### Architecture impact

- [x] Amends Description sections: §10 (routing — new/renamed routes)
- [ ] No change to ARCHITECTURE.md expected
- [ ] Requires a Constitution change

### North star deviation

§0 pending; interim README north star: "Clarity beats flexibility… a smaller number of
well-chosen views is better than infinite setup." This epic is that principle applied; saved
views deferred is the guard against eroding it.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Which views make the built-in set? | All implementation | Item 1 |

### New capability

None beyond rearranged navigation.
