# EPIC-001: Finish MVC boundary enforcement

**Status:** closed
**Created:** 2026-07-12
**Architecture baseline:** 39f22b8

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
| Import-boundary check | `architecture/constitution/04-data-flow.md` — the verbatim prohibition: views never import from `services/` directly |
| Relocated desktop NLP language settings | Legacy application output — preferences still load, save, and display the same NLP language mode; `npm test` pins surrounding model/controller/NLP behaviour |
| Relocated mobile clipboard copy | Legacy application output — the mobile copy affordance still copies exactly the same text; `npm test` pins surrounding behaviour |
| Relocated mobile settings service calls | Legacy application output — widget debug sync, clipboard copy, and NLP mode controls preserve their current behaviour; `npm test` pins surrounding behaviour |
| Relocated mobile capture parse | Legacy application output — typing in capture produces the same parsed chips/draft values; `npm run test:nlp` pins parser output |
| Reminder-window orchestration extraction | Legacy application output — Pulse/reminder behaviour remains unchanged; `npm test` pins surrounding model/controller/NLP behaviour |
| `#project.space` NLP resolution | authority TBD — Q2 must choose implementation or reclassification before item 18 starts |

### Test map

| Checklist item | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | `tsx tests/unit/models/import-boundary.test.ts` | §4 data-flow prohibitions | current import graph | exact — fails while the known view→service imports remain |
| 2 | `tsx scripts/check-view-service-imports.ts` | §4 data-flow prohibitions | current import graph | exact — reports the four violating view files |
| 3 | `npm run test:boundaries` | item 1 + item 2 | current import graph | exact — non-zero while violations remain |
| 4 | `npm test` | package test graph | existing fixtures | exact — includes the boundary gate and existing code suites |
| 5–6 | `npm test` | legacy desktop preferences behaviour | existing fixtures | exact |
| 7–8 | `npm test` | legacy mobile app clipboard behaviour | existing fixtures | exact |
| 9–10 | `npm test` | legacy mobile settings behaviour | existing fixtures | exact |
| 11–12 | `TZ=UTC npm run test:nlp && npm test` | parser output + legacy mobile capture behaviour | existing NLP fixtures | exact |
| 13 | `npm test` | service-boundary decision recorded in this epic | this epic's §5 open questions | exact — Q1 no longer blocks implementation |
| 14–15 | `npm test` | legacy reminder-window behaviour | existing fixtures | exact |
| 16–17 | `npm test` | package test graph | existing fixtures | exact |
| 18 | `TZ=UTC npm run test:nlp` | authority TBD from Q2 | `#project.space` cases | exact — no known-exception carve-out |

### What is deliberately not tested

Visual appearance, render performance, and the internal shape of the extracted hooks/controllers
are not pinned. This epic only pins dependency direction and preserved observable behaviour.

---

## 4. Checklist

Known violations re-verified on 2026-07-17 (6 imports in 4 files). Items are split so each
implementation step names one file.

```md
[x] 1. Add the failing import-boundary test in `tests/unit/models/import-boundary.test.ts` —
       done when it fails for the right reason against the current tree
[x] 2. Implement the checker in `scripts/check-view-service-imports.ts` — done when item 1
       reports exactly the four known violating view files
[x] 3. Add `test:boundaries` in `package.json` — done when `npm run test:boundaries` runs the
       checker and fails against the current tree
[x] 4. Wire the boundary gate into `package.json`'s standard code test — done when `npm test`
       fails against the current tree before relocation begins
[x] 5. Move desktop NLP language-mode load/save behind `src/hooks/usePreferences.ts` — done
       when `npm test` passes after the hook exposes the same behaviour
[x] 6. Remove the NLP settings service import from
       `src/views/pages/desktop/settings/Preferences.view.tsx` — done when the file has no
       services import and `npm test` passes
[x] 7. Move mobile app clipboard copy behind `src/hooks/useMobileApp.ts` — done when `npm test`
       passes after the hook exposes the same copy behaviour
[x] 8. Remove the clipboard service import from
       `src/views/pages/mobile/app/MobileApp.view.tsx` — done when the file has no services
       import and `npm test` passes
[x] 9. Move mobile settings widget debug, clipboard, and NLP mode calls behind
       `src/hooks/useMobileSettings.ts` — done when `npm test` passes after the hook exposes
       the same behaviours
[x] 10. Remove the service imports from
        `src/views/pages/mobile/settings/MobileSettings.view.tsx` — done when the file has no
        services import and `npm test` passes
[x] 11. Move mobile capture parsing behind `src/hooks/useMobileCapture.ts` — done when
        `TZ=UTC npm run test:nlp` and `npm test` pass with unchanged parse output
[x] 12. Remove the NLP service import from
        `src/views/pages/mobile/capture/MobileCapture.view.tsx` — done when the file has no
        services import and `npm test` passes
[x] 13. Record the Q1 backend-service decision in `epics/EPIC-001-mvc-boundary-enforcement.md`
        — done when the decision is explicit and any resulting split is deferred to a new epic
[x] 14. Move reminder-window Tauri/window/localStorage orchestration behind
        `src/hooks/useReminderWindowShell.ts` — done when `npm test` passes with unchanged
        reminder behaviour
[x] 15. Remove remaining orchestration from
        `src/views/pages/desktop/pulse/ReminderWindow.view.tsx` — done when the view delegates
        shell workflow to the hook and `npm test` passes
[x] 16. Re-run the boundary gate via `scripts/check-view-service-imports.ts` — done when it
        reports zero view→service imports
[x] 17. Re-run the standard gate via `package.json` — done when `npm test` passes with the
        boundary check included
[x] 18. Resolve Q2 in `tests/unit/services/nlp.test.ts` — done when `#project.space` cases are
        either moved into the gating NLP suite or visibly reclassified, and
        `TZ=UTC npm run test:nlp` has no known-exception carve-out
```

---

## 5. Summary

### Architecture impact

- [x] Amends Description sections: §2 (repository structure/check tooling inventory) and §9b/§10
  only if extraction changes file inventories named there
- [ ] No change to ARCHITECTURE.md expected
- [ ] Requires a Constitution change

### North star deviation

No deviation from §0: "attention is opt-in, capture is not." This epic removes architectural
friction and service leakage from views without adding UI, ceremony, notifications, or
managerial time-tracking behaviour. It should make capture and settings safer to maintain while
staying invisible to the user.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | ~~Keep `src/services/backend/supabase.service.ts` consolidated for now, or split it by domain?~~ Resolved 2026-07-17: keep it consolidated temporarily; a future split needs a new epic. | — | — |
| Q2 | ~~`#project.space` syntax: implement or reclassify/drop the proposed cases?~~ Resolved 2026-07-17: reclassified out of the current NLP gate; no known-failing `#project.space` carve-out remains. | — | — |

### New capability

None — behaviour-preserving enforcement of an existing rule.
