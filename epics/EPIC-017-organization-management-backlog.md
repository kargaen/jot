# EPIC-017: Organization management backlog draft

**Status:** draft
**Created:** 2026-07-17
**Architecture baseline:** 77cf288

**Source:** owner backlog notes, 2026-07-17. This draft groups project/area creation, editing, grouping, and movement work.

---

## 1. BDD — User Flows

### Flow 1: Projects and areas are manageable where they are used

```gherkin
Given the user is editing a task or viewing an area/project list
When they type a new project name or click an area/project title
Then they can create or rename the organization object without leaving the flow
And validation or permission failures are shown without losing their input
```

### Flow 2: Project selectors reflect area structure

```gherkin
Given projects belong to areas and some areas may be hidden by user preference
When the user opens a project dropdown
Then projects are grouped by area
And hidden-area behavior follows the user's configured visibility rules
```

### Flow 3: Project movement and unprojected tasks have explicit homes

```gherkin
Given an area has projects and tasks that may not belong to a project
When the user navigates or drags projects
Then unprojected tasks have a named sidebar group
And projects can be moved to another area or space through a clear interaction
```

**Out of scope for this draft:**
- Recursive grouped main views; see EPIC-018.
- Windows startup; see EPIC-020.
- Full drag-and-drop implementation details already covered by EPIC-006 unless this draft later updates it.

---

## 2. Function Call Signatures

*(deferred to revision 2)*

Creation, rename, grouping, and drag-and-drop signatures should be chosen after inspecting current project/area services and EPIC-006.

---

## 3. TDD — Testing Strategy

### Authority for correctness

| Backlog item | Likely authority when promoted | Notes |
|---|---|---|
| Create project from dropdown | Existing project creation behavior plus owner UX decision | Must decide default area, duplicate handling, and permissions. |
| Inline rename area/project | Existing update behavior | Needs validation and failure-state coverage. |
| Project dropdown grouped by area | Existing area/project relationships and hidden-area preferences | Verify visibility rules rather than hard-coding assumptions. |
| Sidebar group for no-project tasks | Owner naming decision plus current area filtering behavior | Naming blocks implementation. |
| Project drag-and-drop | EPIC-006 and platform behavior | Inspect/update EPIC-006 before implementing new drag/drop work. |

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | TBD | existing create/update behavior | TBD | exact persisted state and failure preservation |
| 2 | TBD | existing relationships/preferences | TBD | exact grouping/visibility |
| 3 | TBD | EPIC-006 / owner naming decision | TBD | exact move or navigation outcome |

### What is deliberately not tested

This draft does not decide the unprojected-task label, default area for on-the-fly project creation, or whether drag-and-drop is desktop-only forever.

---

## 4. Checklist

Draft backlog items for later formulation:

```md
[ ] 1. Create projects from edit-task dropdowns — dropdowns such as project should allow typed creation because there is no easy project creation path. Reflection: high value but crosses creation UX, validation, duplicate handling, area assignment, and permissions. Complexity: M-L.

[ ] 2. Windows drag-and-drop for projects — drag a project from any task list view to the sidebar and drag a project to another area/space. Reflection: EPIC-006 already exists for project drag-and-drop; inspect and update that epic rather than creating competing scope. Complexity: L.

[ ] 3. Edit project and area names inline — clicking a title in an area/project list view should allow renaming. Reflection: natural management affordance; must handle collisions, sync failures, permissions, and whether rename is scoped to a space. Complexity: M.

[ ] 4. Group project dropdowns by area and respect hidden-area settings — selectors should show area grouping and likely hide projects in user-hidden areas. Reflection: correctness depends on the existing hidden-area preference model. Complexity: M.

[ ] 5. Add a sidebar group for tasks without a project inside areas — if an area has projects, unprojected tasks should be reachable through a named group; "No project" may be too vague. Reflection: owner naming decision needed; possible labels include "Area tasks", "Unfiled", or "Standalone tasks". Complexity: M.
```

---

## 5. Summary

### Architecture impact

- [ ] No change to ARCHITECTURE.md expected
- [x] Amends Description sections if implemented later: §10 routing/navigation; possibly §9b if reusable inline-edit/dropdown controls are introduced
- [ ] **Requires a Constitution change** — a human decision, blocks this epic until resolved

### North star deviation

§0 says: "attention is opt-in, capture is not." This group supports low-friction organization after capture. Drag-and-drop and selector grouping should remain optional organization tools, not barriers to capturing tasks.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | When creating a project from a task dropdown, which area is chosen by default? | Blocks item 1 | Before implementation |
| Q2 | What should the unprojected area group be called? | Blocks item 5 | Before implementation |
| Q3 | Should hidden areas hide projects in every selector, or only in default views? | Blocks item 4 | Before implementation |
| Q4 | Should EPIC-006 be updated instead of implementing drag-and-drop here? | Blocks item 2 | Before formulation |

### New capability

Yes — inline organization creation/editing and project movement expand project/area management beyond passive navigation.
