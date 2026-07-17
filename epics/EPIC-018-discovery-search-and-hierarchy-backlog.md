# EPIC-018: Discovery, search, and hierarchy backlog draft

**Status:** draft
**Created:** 2026-07-17
**Architecture baseline:** 77cf288

**Source:** owner backlog notes, 2026-07-17. This draft groups search, area/project overviews, undated task discovery, and recursive grouped views.

---

## 1. BDD — User Flows

### Flow 1: The user can find tasks intentionally

```gherkin
Given the user has tasks across areas, projects, dates, and hierarchy levels
When they search or open a discovery-oriented view
Then relevant tasks can be found without relying on due dates alone
And hidden areas/spaces follow the user's visibility expectations
```

### Flow 2: Area and project views show useful structure

```gherkin
Given the user opens an area or project view
When that view contains projects, tasks, or subtasks
Then the view communicates the next level of structure with summaries and bounded indentation
And deeper levels wait until the user opens the relevant task or project view
```

### Flow 3: Undated tasks are not forgotten

```gherkin
Given a task has no due date
When the user reviews work
Then the task appears in an intentional review or discovery surface
And Jot does not turn undated work into unwanted interruption
```

**Out of scope for this draft:**
- Project/area CRUD controls; see EPIC-017.
- Pulse row polish; see EPIC-016.
- Search index implementation details.

---

## 2. Function Call Signatures

*(deferred to revision 2)*

Search, hierarchy projection, and review surfaces need product decisions before contracts are stable.

---

## 3. TDD — Testing Strategy

### Authority for correctness

| Backlog item | Likely authority when promoted | Notes |
|---|---|---|
| Search | Owner-approved search scope and fixtures | Need to decide fields, ranking, filters, hidden-area behavior, and offline expectations. |
| Area project tiles | Current area/project/task relationships plus owner visual decision | Summaries must be defined before testing. |
| Nested-task visibility | Owner decision on default/toggle/setting behavior | Avoid implementing a hidden setting before the view model is settled. |
| Undated task discovery | North-star review behavior plus existing default views | Prefer opt-in review/default views over active reminders unless owner chooses otherwise. |
| Recursive grouped lists | Owner-approved hierarchy depth rules | Needs performance and interaction proof once concrete. |

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | TBD | owner-approved search/review examples | TBD | exact result set/order where defined |
| 2 | TBD | hierarchy rules | TBD | exact grouping/depth |
| 3 | TBD | review/default-view behavior | TBD | exact inclusion |

### What is deliberately not tested

This draft does not decide search ranking, summary metrics, view toggles, or notification behavior for undated tasks.

---

## 4. Checklist

Draft backlog items for later formulation:

```md
[ ] 1. Search function — search across tasks and likely organization metadata. Reflection: deceptively broad; decide scope, ranking, filters, shortcut, offline behavior, and hidden-area visibility before implementation. Complexity: L-XL.

[ ] 2. Area view project tiles and nested-task visibility — when clicking an area, show Projects as tiles with small summaries and decide whether tasks inside projects show directly under areas via toggle or setting. Reflection: product/navigation decision, not just a view tweak. Complexity: L.

[ ] 3. Prevent no-due-date tasks from getting lost — decide whether this is by design or needs a surfaced view/reminder. Reflection: important but sensitive; surfacing should probably be an Inbox/Unscheduled/review view rather than noisy reminders. Complexity: M-L.

[ ] 4. Show grouped recursive lists up to three levels — main view shows areas/projects/tasks; project view shows projects/tasks/subtasks one level, but not two levels until task view. Reflection: broad navigation/display model change with hierarchy, indentation, recursion limits, and performance implications. Complexity: XL.
```

---

## 5. Summary

### Architecture impact

- [ ] No change to ARCHITECTURE.md expected
- [x] Amends Description sections if implemented later: §10 routing/navigation; possibly §9b for new reusable hierarchy/list presentations
- [ ] **Requires a Constitution change** — a human decision, blocks this epic until resolved

### North star deviation

§0 says: "Jot decides what to show by the user's context, never by its own urgency." This group can support that by making discovery intentional, but undated-task surfacing and recursive grouped views can become noisy if they force global attention rather than chosen context.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Should search include hidden areas/spaces by default? | Blocks item 1 | Before search formulation |
| Q2 | Should nested project tasks show under areas by default, via toggle, or via user setting? | Blocks item 2 | Before hierarchy work |
| Q3 | Should undated tasks surface in a review/default view or via active reminders? | Blocks item 3 | Before implementation |
| Q4 | What summaries should project tiles show? | Blocks item 2 | Before implementation |

### New capability

Yes — search, discovery views, and recursive hierarchy browsing create new ways to find and traverse work.
