# EPIC-001: Finish MVC boundary enforcement

**Status:** draft
**Created:** 2026-07-12
**Architecture baseline:** 7d0178c

**Source:** migrated from `REFACTOR_SUMMARY.md` (deleted by the governance cleanup). Only the
items verified still open against the code on 2026-07-12 were carried over; everything else in
that file was complete or superseded.

> Ensure no `src/views/**` module imports from `src/services/**`.
> Audit `src/services/backend/supabase.service.ts` for concerns that should be split by domain.
> Decide whether to keep the current consolidated backend service temporarily or split it.
> Extract mobile app orchestration into a dedicated hook such as `useMobileApp`. *(partially done — residual orchestration remains in the view)*
> Extract reminder-window orchestration into a dedicated hook such as `useReminderWindow`.
> Resolve the outstanding NLP status before final sign-off: either implement `#project.space` syntax fully, or explicitly remove/reclassify those tests.

---

## 1. BDD — User Flows

This epic is behaviour-preserving. The observable outcome is structural: the import graph obeys
the declared data-flow direction, with no user-visible change.

### Flow 1: Boundary violations are gone and stay gone

```gherkin
Given the declared data flow View → Hook → Controller → Service
When any module under src/views/** is inspected for imports
Then it imports no module under src/services/**
And an automated check fails the build if a new violation is introduced
```

### Flow 2: App behaviour is unchanged

```gherkin
Given the existing test suites pass before this epic starts
When every slice of this epic has landed
Then the same suites pass with no test weakened or removed
```

**Out of scope for this epic:**
- Any new user-facing feature or visual change.
- The `store/` decision itself (parked as Q1 — deciding state management is a Constitution-level
  human decision, not a slice).
- Rewrites of view internals beyond relocating the service calls behind hooks/controllers.

---

## 2. Function Call Signatures

*(deferred to revision 2)*

---

## 3. TDD — Testing Strategy

### Authority for correctness

| Function under test | Authority |
|---|---|
| Import-boundary check | `architecture/constitution/04-data-flow.md` — the verbatim prohibitions ("Views never import from `services/`…") |
| Relocated workflows (NLP settings, clipboard copy, widget sync debug, capture parse) | Legacy application output — behaviour before and after relocation must be identical; existing suites (`npm test`) pin it |
| `#project.space` NLP resolution | The gating suite `tests/unit/services/nlp-natural.test.ts`; decision on the cases is Q2 |

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | grep/lint gate: no `src/views/**` → `src/services/**` import | §4 data-flow prohibitions | the import graph itself | exact — zero matches |
| 2 | `npm test` (test:nlp + test:tasks) | legacy output | existing fixtures | exact |

### What is deliberately not tested

Visual appearance, render performance, and the internal shape of the extracted hooks — only
the boundary and the preserved behaviour are pinned.

---

## 4. Checklist

Known violations verified on 2026-07-12 (6 imports in 4 files):

```md
[ ] 1. Add an automated import-boundary check (script or lint rule) that fails on any
       src/views → src/services import — done when it fails against the current tree for
       exactly the 4 known files
[ ] 2. Relocate NLP language-mode load/save out of
       `src/views/pages/desktop/settings/Preferences.view.tsx` behind a hook/controller —
       done when the file has no services import and `npm test` passes
[ ] 3. Relocate clipboard copy out of `src/views/pages/mobile/app/MobileApp.view.tsx` —
       done when the file has no services import and `npm test` passes
[ ] 4. Relocate widget-sync debug, clipboard, and NLP settings calls out of
       `src/views/pages/mobile/settings/MobileSettings.view.tsx` — done when the file has
       no services import and `npm test` passes
[ ] 5. Relocate `parseInput` out of `src/views/pages/mobile/capture/MobileCapture.view.tsx`
       (capture parse belongs behind a hook) — done when the file has no services import
       and `npm test` passes
[ ] 6. Flip the check from item 1 to a hard gate (CI/local test entry) — done when the
       boundary check runs as part of the standard test command and passes
[ ] 7. Decide and record the fate of `src/services/backend/supabase.service.ts` (764 lines):
       split by domain (tasks/projects/areas/auth/realtime) or explicitly accept the
       consolidated module — done when the decision is recorded here and, if split, each
       extraction lands as its own slice appended below
[ ] 8. Extract remaining reminder-window orchestration into a `useReminderWindow` hook —
       done when `ReminderWindow.view.tsx` contains no workflow logic and `npm test` passes
[ ] 9. Resolve `#project.space` NLP cases: implement or reclassify — done when
       `npm run test:nlp` passes with no known-exception carve-out
```

---

## 5. Summary

### Architecture impact

- [x] Amends Description sections: §2 (repository structure — already being rewritten by the
  governance cleanup), §9b/§10 only if extraction changes file inventories named there
- [ ] No change to ARCHITECTURE.md expected
- [ ] Requires a Constitution change

### North star deviation

ARCHITECTURE.md §0 is not yet written. Interim authority is README's Development North Star
("keep the product lightweight in ceremony… preserve strong defaults"). This epic is invisible
to the product and erodes nothing; it enforces the already-declared §4 data-flow rule.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Does Jot ever get a client store (`src/store/` is deliberately empty)? | Nothing in this epic | Before any slice that wants global client state |
| Q2 | `#project.space` syntax: implement or drop the cases? | Item 9 only | Item 9 |

### New capability

None — behaviour-preserving enforcement of an existing rule.
