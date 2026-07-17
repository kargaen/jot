# EPIC-019: Task attachments backlog draft

**Status:** draft
**Created:** 2026-07-17
**Architecture baseline:** 77cf288

**Source:** owner backlog notes, 2026-07-17. The owner explicitly called this an epic in itself: supporting blobs such as screenshots must not be treated as an afterthought.

---

## 1. BDD — User Flows

### Flow 1: Attach context to a task

```gherkin
Given the user has a screenshot or other blob that supports a task
When they add it to the task
Then the task preserves that supporting material
And the user can recognize, open, or remove it later
```

### Flow 2: Attachment support does not slow basic capture

```gherkin
Given the user is capturing a normal text task
When attachment support exists
Then text-only capture remains immediate
And upload/storage failures for attachments do not lose the text task
```

**Out of scope for this draft:**
- Import/export behavior for attachments.
- Exact storage provider, file limits, preview UI, sync policy, and security model.
- Deciding whether existing EPIC-002 fully covers this owner note.

---

## 2. Function Call Signatures

*(deferred to revision 2)*

Attachment contracts should be written only after reviewing EPIC-002 and the current storage/data model.

---

## 3. TDD — Testing Strategy

### Authority for correctness

| Backlog item | Likely authority when promoted | Notes |
|---|---|---|
| Add blob/screenshot to task | Existing task model plus attachment epic decisions | First step is to inspect EPIC-002 and decide whether this is covered or needs a follow-up. |
| Attachment failure recovery | Owner UX decision | Must prove the text task is not lost if blob upload fails. |
| Attachment access/security | Storage and sharing model | Needs RLS/security review if Supabase storage or shared areas are involved. |

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1 | TBD | EPIC-002 or follow-up attachment contract | TBD | exact metadata/storage state |
| 2 | TBD | capture behavior and failure examples | TBD | exact recovery state |

### What is deliberately not tested

This draft does not pin storage limits, MIME support, preview layout, export representation, or retention policy.

---

## 4. Checklist

Draft backlog items for later formulation:

```md
[ ] 1. Support blobs such as screenshots on tasks — allow dumping a screenshot or similar blob to support the task. Reflection: should be its own epic, or a review/update of EPIC-002 if that existing attachment epic already owns the behavior. Complexity: XL if storage, preview, upload, sync, and security are included.
```

---

## 5. Summary

### Architecture impact

- [ ] No change to ARCHITECTURE.md expected
- [x] Amends Description sections if implemented later: likely task data/storage descriptions and possibly §11 export behavior if attachments are exported
- [ ] **Requires a Constitution change** — a human decision, blocks this epic until resolved

### North star deviation

§0 says: "Capture is never more than a moment away." Attachment support is aligned only if text capture stays fast and attachment failures do not block or lose the task.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Does EPIC-002 already cover screenshot/blob support, or should this become a follow-up epic? | Yes | Before formulation |
| Q2 | What file types, size limits, previews, and storage/security guarantees are required for v1? | Yes | Before implementation |
| Q3 | Should attachments participate in export/share surfaces? | Blocks export-related work | Before export integration |

### New capability

Yes — task-level binary supporting material is a substantial new capability.
