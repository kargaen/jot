# EPIC-012: E2E coverage expansion

**Status:** draft
**Created:** 2026-07-12
**Architecture baseline:** 7d0178c

**Source:** migrated from `tests/e2e/README.md`'s "Planned next slices" section (trimmed by the
governance cleanup; the file's operational content remains):

> Desktop onboarding for the first space / area.
> Dashboard task creation flow using the real `CreateTask.view.tsx` surface.
> Task row interactions such as complete, open, and detail navigation.
> Settings panels and their toggle/button coverage.
> Mobile harness coverage once the desktop flow is stable.
>
> The long-term goal is full button and UI element coverage.

---

## 1. BDD — User Flows

The flows under test are existing product behaviour; this epic adds the Playwright coverage
that pins them. One flow per planned suite:

### Flow 1: Onboarding is covered

```gherkin
Given a fresh user in the e2e harness
When the desktop onboarding suite runs
Then creating the first space/area is exercised end-to-end and asserted
```

### Flow 2: Task creation and row interactions are covered

```gherkin
Given the seeded local-DB e2e stack
When the dashboard suites run
Then task creation via the real CreateTask surface, complete, open, and detail navigation
     are each exercised and asserted
```

**Out of scope for this epic:**
- Mobile harness coverage — explicitly sequenced after desktop is stable (the source's own
  ordering); becomes new checklist items here when desktop items are ticked.
- Visual regression testing.

---

## 2. Function Call Signatures

*(not applicable — test suites)*

---

## 3. TDD — Testing Strategy

Authority: the running application is the authority (these tests *are* the pin). Lane
conventions come from `validation-and-qa`: harness lane for fast visual checks, local-DB lane
(`npm run test:ui:local`) for real integration.

### Test map

| Flow | Suite | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | onboarding spec | live app behaviour | local-DB seed | exact assertions |
| 2 | dashboard/task specs | live app behaviour | local-DB seed | exact assertions |

### What is deliberately not tested

Pixel-level appearance; Android device flows (separate manual smoke-test).

---

## 4. Checklist

```md
[ ] 1. Add desktop onboarding spec (first space/area) — done when it passes in the local lane
[ ] 2. Add dashboard task-creation spec via the real CreateTask surface — done when it passes
       in the local lane
[ ] 3. Add task-row interaction spec (complete, open, detail navigation) — done when it passes
       in the local lane
[ ] 4. Add settings toggle/button coverage spec — done when it passes in the local lane
```

---

## 5. Summary

### Architecture impact

- [x] No change to ARCHITECTURE.md expected
- [ ] Amends Description sections
- [ ] Requires a Constitution change

### North star deviation

§0 pending; no product change — coverage only.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | When is desktop "stable enough" to start the mobile harness items? | Mobile additions only | After items 1–4 |

### New capability

None.
