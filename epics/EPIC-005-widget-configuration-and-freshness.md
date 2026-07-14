# EPIC-005: Widget configuration & freshness feedback

**Status:** draft
**Created:** 2026-07-12
**Architecture baseline:** 7d0178c

**Source:** migrated from `ROADMAP.md` (deleted by the governance cleanup):

> Add widget configuration. Let users choose which spaces feed Pulse and how Quick Capture
> should behave.

> Improve widget freshness feedback. Show last refresh timing and clearer stale states when
> Android delays updates.

Context verified 2026-07-12: both widgets are live — `QuickCaptureWidget` (1×1) and the
resizable `PulseWidget` — registered in the tracked Android project
(`src-tauri/gen/android/app/src/main/AndroidManifest.xml`), fed by
`services/sync/widgetSync.service.ts` → Rust `widget_sync::sync_widget_db`.

---

## 1. BDD — User Flows

### Flow 1: Choose what feeds Pulse

```gherkin
Given a user with multiple spaces
When they configure the Pulse widget
Then they can choose which spaces contribute tasks to it
And the widget reflects the choice after the next sync
```

### Flow 2: Staleness is visible

```gherkin
Given Android has delayed widget updates
When the user looks at the Pulse widget
Then the widget shows when it was last refreshed
And a clearly stale state is distinguishable from an empty one
```

**Out of scope for this epic:**
- New widget types; iOS widgets.
- Changing the sync mechanism itself (the outbox/sync path stays as-is).

---

## 2. Function Call Signatures

*(deferred to revision 2)*

---

## 3. TDD — Testing Strategy

Authority: the widget-sync diagnostic in `diagnostics-and-tooling` pins sync payload
correctness; per-space filtering reuses the task-visibility predicates in `src/models/tasks/`
as the membership authority. Kotlin-side rendering: TBD (device verification is manual — see
"not tested").

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | sync payload space-filtering | task-visibility predicates | TBD | exact |
| 2 | last-refresh timestamp in payload | TBD at revision 2 | TBD | exact |

### What is deliberately not tested

On-device widget rendering and Android OS scheduling behaviour — manual smoke-test per the
release flow, not an automated suite.

---

## 4. Checklist

```md
[ ] 1. Revision 2 of this epic: config storage decision (Q1) + slices — done when
       epic-review returns approved
```

---

## 5. Summary

### Architecture impact

- [x] Amends Description sections: §2 (if a config surface is added)
- [ ] No change to ARCHITECTURE.md expected
- [ ] Requires a Constitution change

### North star deviation

§0 pending; interim README north star: "defaults matter more than configuration." This epic
adds configuration — justified as the 10% layer after defaults, but the default (all spaces
feed Pulse) must remain good without touching it. Named plainly so it isn't silent.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Where does widget config live (localStorage prefs vs. synced table)? | All slices | Revision 2 |

### New capability

None — configurability of an existing surface.
