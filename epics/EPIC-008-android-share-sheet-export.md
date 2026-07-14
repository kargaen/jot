# EPIC-008: Android share-sheet export

**Status:** draft
**Created:** 2026-07-12
**Architecture baseline:** 7d0178c

**Source:** migrated from `ROADMAP.md` (deleted by the governance cleanup):

> Android share-sheet export. "Copy as JSON" (clipboard) shipped as v1 for getting tasks out of
> Jot. A native Android share-sheet (save to Files, share to any app) needs a custom Tauri
> Kotlin plugin + FileProvider and is the natural next step.

---

## 1. BDD — User Flows

### Flow 1: Share exported tasks natively

```gherkin
Given a user on Android viewing an exportable task list
When they choose export
Then the Android share sheet opens with the JSON export as a shareable file
And they can save to Files or share to any installed app
```

**Out of scope for this epic:**
- New export formats — the single-serializer rule (§11a) holds; this epic changes transport,
  not content.
- iOS share sheet.

---

## 2. Function Call Signatures

*(deferred to revision 2)*

---

## 3. TDD — Testing Strategy

Authority: §11a's single-serializer rule — the shared payload must be byte-identical to what
`jotExport.ts` produces for "copy as JSON" (legacy output). The share-sheet handoff itself is
device-verified.

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | exported file content | `jotExport.ts` output (legacy parity) | existing export fixtures | byte-identical |

### What is deliberately not tested

The Android share-sheet UI and receiving apps — manual device smoke-test.

---

## 4. Checklist

```md
[ ] 1. Revision 2 of this epic: Kotlin plugin + FileProvider slices — done when epic-review
       returns approved (note: touching the tracked src-tauri/gen/android project is a
       change-control question to settle at review)
```

---

## 5. Summary

### Architecture impact

- [x] Amends Description sections: §11a/§2 (a second export *transport*, same serializer)
- [ ] No change to ARCHITECTURE.md expected
- [ ] Requires a Constitution change

### North star deviation

§0 pending; interim README north star: no deviation — getting tasks out fast is capture-trust
in reverse.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Custom Tauri Kotlin plugin vs. editing the generated Android project directly? | All slices | Revision 2 |

### New capability

None — new transport for the existing export.
