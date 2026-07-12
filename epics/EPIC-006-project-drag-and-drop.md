# EPIC-006: Project drag-and-drop across spaces and ordering

**Status:** draft
**Created:** 2026-07-12
**Architecture baseline:** 7d0178c

**Source:** migrated from `ROADMAP.md` (deleted by the governance cleanup):

> Add project drag-and-drop across spaces and within ordering. This should feel excellent and
> safe, not merely powerful.

Note: project **merge** via drag-and-drop shipped already (roadmap marked it done); this epic
is the remaining cross-space move and manual ordering.

---

## 1. BDD — User Flows

### Flow 1: Move a project to another space

```gherkin
Given a user with projects in more than one space
When they drag a project onto another space
Then the project and its tasks move to that space after a confirmation
And collaborators' access follows the destination space's sharing rules
```

### Flow 2: Reorder projects

```gherkin
Given a space with several projects
When the user drags a project to a new position
Then the order persists across restarts and devices
```

**Out of scope for this epic:**
- Task-level drag-and-drop.
- Changing merge behaviour (already shipped).

---

## 2. Function Call Signatures

*(deferred to revision 2)*

---

## 3. TDD — Testing Strategy

Authority: the RLS collaboration model (`reference-rls-and-postgres`) pins what a cross-space
move must do to access rows — this is the "safe, not merely powerful" part. Ordering: TBD
(persistence shape undecided, Q1).

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | project move + access recalculation | RLS access matrices | collaboration fixtures | exact |
| 2 | order persistence | TBD | TBD | exact |

### What is deliberately not tested

Drag gesture physics/animation feel — manual review.

---

## 4. Checklist

```md
[ ] 1. Revision 2 of this epic: ordering persistence decision (Q1) + slices — done when
       epic-review returns approved
```

---

## 5. Summary

### Architecture impact

- [x] Amends Description sections: §2 (if an ordering column/migration is added)
- [ ] No change to ARCHITECTURE.md expected
- [ ] Requires a Constitution change

### North star deviation

§0 pending; interim README north star: structure "should clarify work, not bury it" — no
deviation, provided the confirmation step from the merge feature carries over to moves.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Ordering persistence: position column vs. ordered list per space? | Flow 2 slices | Revision 2 |
| Q2 | What happens to area-member access on cross-space move of a shared project? | Flow 1 slices | Revision 2 |

### New capability

None — manipulation affordances for existing structure.
