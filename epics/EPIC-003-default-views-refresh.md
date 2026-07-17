# EPIC-003: Default views refresh (built-ins before saved views)

**Status:** closed
**Created:** 2026-07-12
**Architecture baseline:** 7cd9b17

**Source:** migrated from `ROADMAP.md` (deleted by the governance cleanup):

> Refresh the default views model. Explore a stronger built-in set of views that feels natural
> out of the box, then layer optional saved views on top for power users.

> Saved views: likely useful, but only after the built-in navigation feels complete without
> user setup.

---

## 1. BDD — User Flows

### Flow 1: Today includes urgent open work without a separate alarm surface

```gherkin
Given a signed-in user has visible open tasks due before today, due today, scheduled today, and due later
When they open Today
Then the overdue, due-today, and scheduled-today tasks are visible in that view
And the later task is not visible there
```

### Flow 2: Upcoming is future-looking only

```gherkin
Given a signed-in user has visible open tasks due before today, due today, scheduled today, and due later
When they open Upcoming
Then only the future dated task is visible in that view
And urgent work remains in Today instead of being duplicated into Upcoming
```

### Flow 3: Inbox is a first-class built-in view

```gherkin
Given a signed-in user has visible open tasks with no project and visible open tasks assigned to projects
When they open Inbox from the app's built-in navigation
Then only the no-project open tasks are visible in that view
And opening one of those tasks uses the same task-detail flow as the other built-in lists
```

### Flow 4: All remains the complete open-task escape hatch

```gherkin
Given a signed-in user has visible open tasks across dates, projects, spaces, and inbox
When they open All
Then every visible open task is visible in that view
And completed logbook tasks are not mixed into it
```

### Flow 5: Logbook stays separate from open work

```gherkin
Given a signed-in user has completed tasks and open tasks
When they open Logbook
Then completed tasks are visible there
And open tasks remain in Today, Upcoming, Inbox, All, project, or space views
```

**Out of scope for this epic:**
- Saved/custom views. The roadmap's ordering still applies: built-ins first, saved views only
  after built-in navigation feels complete.
- A standalone Overdue navigation tab. Overdue tasks are intentionally part of Today so Jot
  does not create a louder alarm surface for work that is already urgent.
- Desktop dashboard redesign. This epic targets the routed mobile app shell described in §10.
- Visual redesign of list rows, grouping, typography, or icons.

---

## 2. Function Call Signatures

```ts
function isInbox(task: Task): boolean;
```

**Not comprehensive.** This existing model predicate is the only cross-layer contract needed
for the missing Inbox view. Today, Upcoming, All, and Logbook already have route-level or
service-backed membership contracts; this epic pins their expected built-in navigation shape
rather than inventing new helpers.

---

## 3. TDD — Testing Strategy

### Authority for correctness

Built-in membership is pinned to current Jot model and routing contracts, not to a new product
heuristic:

- `architecture/description/10-routing-navigation.md` is the authority that mobile built-in
  screens are React Router route containers under `src/router/`, with route titles and header
  actions declared in `src/router/routes.tsx`.
- `architecture/constitution/08-desktop-mobile-logic-sharing.md` is the authority that shared
  task predicates and filters belong in `src/models/tasks/` rather than in platform views.
- The existing pure predicates in `src/models/tasks/taskVisibility.ts` are the legacy output
  authority for Today, Upcoming, and Inbox membership.
- The existing routed app shell in `src/router/AppShell.view.tsx` is the legacy navigation
  authority for which built-ins appear in bottom navigation; this epic changes that set only
  by replacing the currently unreachable Inbox route with a reachable Inbox nav item.

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | `isOverdue(task, today) || isDueToday(task, today)` | `src/models/tasks/taskVisibility.ts` legacy predicate output | inline fixture in `tests/unit/models/task-models.test.ts` | exact |
| 2 | `isUpcoming(task, today)` | `src/models/tasks/taskVisibility.ts` legacy predicate output | inline fixture in `tests/unit/models/task-models.test.ts` | exact |
| 3 | `isInbox(task)` | `src/models/tasks/taskVisibility.ts` legacy predicate output | inline fixture in `tests/unit/models/task-models.test.ts` | exact |
| 3 | app-shell built-in nav labels | `src/router/AppShell.view.tsx` current nav contract plus this epic's §1 Flow 3 | inline fixture in `tests/unit/models/app-shell-navigation.test.tsx` | exact |
| 3 | `/inbox` route task list membership | `architecture/description/10-routing-navigation.md` route-container pattern and `isInbox(task)` | inline fixture in `tests/unit/models/inbox-route.test.tsx` | exact |
| 4 | All route visible-task pass-through | `src/router/All.route.tsx` legacy route output | inline fixture in `tests/unit/models/all-route.test.tsx` | exact |
| 5 | Logbook route completed-task pass-through | `src/router/Logbook.route.tsx` legacy route output | inline fixture in `tests/unit/models/logbook-route.test.tsx` | exact |

### What is deliberately not tested

Visual styling, icon choice, row grouping, scroll position, animation, and saved-view behavior.
Those are either view polish or a later epic; this epic tests membership and built-in reachability.

---

## 4. Checklist

```md
[x] 1. Add Today/Upcoming/Inbox predicate coverage in `tests/unit/models/task-models.test.ts` — done when `npm run test:tasks` passes with explicit built-in membership expectations
[x] 2. Add AppShell navigation coverage in `tests/unit/models/app-shell-navigation.test.tsx` — done when it fails because Inbox is not reachable from built-in navigation
[x] 3. Add Inbox route membership coverage in `tests/unit/models/inbox-route.test.tsx` — done when it fails because `/inbox` does not render only no-project open tasks
[x] 4. Add All route membership coverage in `tests/unit/models/all-route.test.tsx` — done when it fails if All drops any visible open task or includes completed logbook tasks
[x] 5. Add Logbook route membership coverage in `tests/unit/models/logbook-route.test.tsx` — done when it fails if Logbook mixes open tasks into completed history
[x] 6. Implement missing Inbox route composition in `src/router/Inbox.route.tsx` — done when item 3 passes
[x] 7. Wire Inbox into protected routes in `src/router/routes.tsx` — done when item 3 passes through `/inbox` and the route declares the Inbox title
[x] 8. Add Inbox to built-in navigation in `src/router/AppShell.view.tsx` — done when item 2 passes and the bottom nav reaches `/inbox`
```

---

## 5. Summary

### Architecture impact

- [ ] No change to ARCHITECTURE.md expected
- [x] Amends Description sections: §10 (routing/navigation inventory: Inbox becomes a real routed built-in nav surface instead of a pending route)
- [ ] Requires a Constitution change

### North star deviation

The protected property is **"attention is opt-in, capture is not."** No: this epic keeps
attention opt-in by improving only user-selected navigation surfaces. It deliberately folds
overdue work into Today and defers saved/custom views, avoiding a louder global attention
mechanism while making capture-created inbox tasks easier to find.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| — | None. Saved/custom views remain out of scope and require a separately formulated epic if pursued. | — | — |

### New capability

Yes — Inbox becomes a reachable built-in routed view in the mobile app shell; saved/custom
views remain unintroduced.
