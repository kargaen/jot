# EPIC-016: Pulse and list clarity backlog draft

**Status:** draft
**Created:** 2026-07-17
**Architecture baseline:** 77cf288

**Source:** owner backlog notes, 2026-07-17. This draft groups visual and interaction polish for Pulse and dense task lists.

---

## 1. BDD — User Flows

### Flow 1: Pulse emphasizes only useful counts

```gherkin
Given the user is looking at Pulse
When Today, Overdue, or Upcoming has a zero count
Then that label is visually faded
And non-zero groups retain normal emphasis
```

### Flow 2: Pulse task rows separate completion from editing

```gherkin
Given the user sees a task in Pulse
When they click the left completion dot
Then the task is completed
When they click the title or row content
Then the task opens for details or editing
```

### Flow 3: Long lists remain scannable

```gherkin
Given a task list has many rows or tasks with longer text
When the user scans the list
Then row boundaries, truncation, and project context make it easy to distinguish tasks without adding noise
```

**Out of scope for this draft:**
- New task data model fields.
- Global redesign of task rows.
- User settings unless a later slice proves one is necessary.

---

## 2. Function Call Signatures

*(deferred to revision 2)*

These are likely view-level changes; signatures are not useful until the affected components are inspected.

---

## 3. TDD — Testing Strategy

### Authority for correctness

| Backlog item | Likely authority when promoted | Notes |
|---|---|---|
| Faded zero counts | Component render expectation or visual review | Check only zero vs non-zero emphasis, not exact token values. |
| Project-colored chip | Existing project color semantics | Reuse current project color source; avoid duplicate color truth. |
| Pulse click targets | Existing task complete/edit behavior | Regression test should prove completion is only the dot and opening is title/content. |
| Dense-list readability | Visual review plus minimal component expectation | Start with margin/spacing before alternating backgrounds or settings. |

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | TBD | render expectation / visual review | TBD | exact class/state, visual review for appearance |
| 2 | TBD | existing complete/open behavior | TBD | exact event outcome |
| 3 | TBD | visual review | TBD | visual acceptance |

### What is deliberately not tested

This draft does not pin exact colors, spacing values, or ellipsis thresholds.

---

## 4. Checklist

Draft backlog items for later formulation:

```md
[ ] 1. Fade Pulse zero-count labels — Today, Overdue, and Upcoming colors should fade when count is zero. Reflection: small calmness polish; likely view-only if counts are already available. Complexity: S.

[ ] 2. Show a project-colored chip in Pulse tasks — include project name and color context on Pulse rows. Reflection: useful context, but should stay subtle and reuse existing project color semantics. Complexity: S-M depending on fetched task shape.

[ ] 3. Make Pulse title open details and left dot complete — clicking the task currently finishes it; completion should be restricted to the dot. Reflection: strong usability fix; test click targets carefully. Complexity: S-M.

[ ] 4. Improve long task-list readability — add alternating row background, spacing, or ellipsis; the existing white-row-on-gray treatment may only need a small margin below each task. Reflection: start with the smallest visible improvement and avoid settings until needed. Complexity: S.
```

---

## 5. Summary

### Architecture impact

- [ ] No change to ARCHITECTURE.md expected
- [x] Amends Description sections if implemented later: §9b styling implementation inventory if a reusable row/chip treatment is introduced
- [ ] **Requires a Constitution change** — a human decision, blocks this epic until resolved

### North star deviation

§0 says: "attention is opt-in, capture is not." This group supports calm review by reducing false emphasis and making lists easier to scan. Risk is low if project chips and row treatments stay subtle.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Does Pulse task data already include project name/color, or does the fetch path need expansion? | Blocks item 2 | Before implementation |
| Q2 | Should long task text always ellipsize, or only in compact/dense views? | Blocks item 4 | Before implementation |

### New capability

No major new capability; this is review/list interaction and visual clarity polish.
