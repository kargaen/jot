# EPIC-002: Task attachments v1

**Status:** draft
**Created:** 2026-07-12
**Architecture baseline:** 7d0178c

**Source:** migrated verbatim in substance from `ATTACHMENTS_SPIKE.md` and `ROADMAP.md`
("Attachments as a monetizable feature — start with low limits and strong defaults, then decide
whether higher limits belong in a premium tier"), both deleted by the governance cleanup.

The spike's recommendation, quoted:

> If we build this, start as a deliberately constrained feature: task-only, small files, very
> low limits, open/download only, no rich preview stack.

Constraints carried over from the spike:

- Attachments on tasks only; images, PDFs, plain text/markdown first.
- 5 MB per file, 3 attachments per task.
- Metadata in Postgres (`id, task_id, user_id, filename, mime_type, size_bytes, storage_path,
  created_at`); bytes in Supabase Storage under `task-attachments/<user_id>/<task_id>/…`.
- Only task owners and authorized area members can access a file.
- Deleting a task deletes attachment metadata and storage objects; completing a task does not.
- No inline gallery or preview stack in v1; links stay the lighter-weight first option.

---

## 1. BDD — User Flows

### Flow 1: Attach a file to a task

```gherkin
Given a signed-in user viewing a task they own
When they attach a file within the type and size limits
Then the file appears in a compact list under the task's notes/link area
And upload state is visible as uploading, uploaded, or failed
```

### Flow 2: Limits are enforced

```gherkin
Given a task that already has 3 attachments
When the user tries to attach a fourth, or a file over 5 MB
Then the attachment is refused with a clear message
And nothing is uploaded
```

### Flow 3: Access follows task access

```gherkin
Given a task in a shared area
When an authorized area member opens the task
Then they can open/download its attachments
And a user without access to the task cannot fetch the file
```

**Out of scope for this epic:**
- Rich previews, inline galleries, and thumbnails.
- Attachments on projects, spaces, or comments.
- Premium-tier limit raising (parked as Q2).

---

## 2. Function Call Signatures

*(deferred to revision 2)*

---

## 3. TDD — Testing Strategy

### Authority for correctness

| Under test | Authority |
|---|---|
| Access rules | `reference-rls-and-postgres` conventions + the existing `can_access_task` helper family; RLS suite pins allowed/denied matrices |
| Limit enforcement | This epic's stated limits (5 MB, 3 per task) — exact |
| Cascade on task delete | TBD — fixture to be written at formulation revision 2 |

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1–3 | TBD at revision 2 | above | TBD | exact |

### What is deliberately not tested

Upload progress UI timing; storage-cost accounting.

---

## 4. Checklist

Stub — to be broken into slices at formulation revision 2, migration-first
(metadata table + RLS + storage policy before any UI).

```md
[ ] 1. Revision 2 of this epic: signatures, test map fixtures, and slice checklist —
       done when epic-review returns approved
```

---

## 5. Summary

### Architecture impact

- [x] Amends Description sections: §2 (new storage surface), likely a new Description section
  for the attachments boundary
- [ ] No change to ARCHITECTURE.md expected
- [ ] Requires a Constitution change

### North star deviation

§0 pending; interim README north star: "lightweight does not mean shallow… details should feel
available, not mandatory." A constrained, task-only attachment list fits; an unconstrained media
feature would not. The spike's low limits are the guard.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Storage-cost ceiling before this ships to all users? | Implementation start | Revision 2 |
| Q2 | Do higher limits become a premium tier? | Nothing in v1 | Post-v1 |

### New capability

Yes — first binary-file storage surface in Jot (Supabase Storage), named here deliberately.
