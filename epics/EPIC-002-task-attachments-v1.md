# EPIC-002: Paste files into tasks v1

**Status:** active
**Created:** 2026-07-12
**Architecture baseline:** ebc458b

**Source:** revised 2026-07-17 from the migrated attachments spike plus owner direction: the
first attachment path is paste-into-task, with explicit user feedback for rejected files and
for images resized on the fly.

The v1 shape is deliberately constrained:

- Attachments on tasks only.
- The primary action is pasting files while a task detail is open.
- Images, PDFs, plain text, and Markdown are accepted first.
- 5 MB maximum stored size per attachment; 3 attachments maximum per task.
- Non-image files over 5 MB are rejected before upload and the user is told the maximum.
- Image files over 5 MB are resized client-side before upload; if resizing brings the stored
  image to 5 MB or below, upload continues and the user is told the image was resized.
- If an image is still over 5 MB after resizing, it is rejected and the user is told the maximum.
- V1 image resizing uses browser-native canvas APIs, no new runtime dependency, a 2048 px longest-edge target, and JPEG quality steps until the output is 5 MB or less.
- Metadata lives in Postgres (`id, task_id, user_id, filename, mime_type, size_bytes,
  storage_path, created_at`); bytes live in Supabase Storage under
  `task-attachments/<user_id>/<task_id>/…`.
- Only task owners and authorized area members can open/download a file.
- Deleting a task deletes attachment metadata and storage objects; completing a task does not.
- No inline gallery or rich preview stack in v1; attachments render as a compact list of links.

---

## 1. BDD — User Flows

### Flow 1: Paste an allowed file into a task

```gherkin
Given a signed-in user is editing a task they can access
When they paste a PDF, text file, Markdown file, or image whose stored size is at most 5 MB
Then the file uploads without leaving the task detail
And the file appears in a compact attachment list under the task's notes/link area
And the user can see whether the upload is uploading, uploaded, or failed
```

### Flow 2: Reject a pasted non-image that is too large

```gherkin
Given a signed-in user is editing a task they can access
When they paste a non-image file larger than 5 MB
Then the file is not uploaded
And the user is notified that the file is too large and the maximum is 5 MB
```

### Flow 3: Resize a pasted image that is too large

```gherkin
Given a signed-in user is editing a task they can access
When they paste an image larger than 5 MB that can be resized to 5 MB or less
Then Jot resizes the image before upload
And the resized image uploads as the task attachment
And the user is notified that the image was resized
```

### Flow 4: Reject a pasted image that remains too large

```gherkin
Given a signed-in user is editing a task they can access
When they paste an image larger than 5 MB that still exceeds 5 MB after resizing
Then the file is not uploaded
And the user is notified that the resized image is still too large and the maximum is 5 MB
```

### Flow 5: Enforce the per-task attachment count

```gherkin
Given a task already has 3 attachments
When the user pastes another file
Then the file is not uploaded
And the user is notified that a task can have at most 3 attachments
```

### Flow 6: Access follows task access

```gherkin
Given a task in a shared area has an attachment
When an authorized area member opens the task
Then they can open/download its attachments
And a user without access to the task cannot fetch attachment metadata or bytes
```

### Flow 7: Task deletion removes attachments

```gherkin
Given a task has attachments
When the task is deleted
Then its attachment metadata is removed
And its stored attachment objects are removed
```

**Out of scope for this epic:**
- Drag-and-drop upload, file-picker upload, and attaching files during quick capture; paste into
  an open task is the first surface.
- Rich previews, inline galleries, thumbnails, OCR, image annotation, or media playback.
- Attachments on projects, spaces, comments, or subtasks independently from their task detail.
- Premium-tier limit raising.
- Cross-device background upload queues; a failed paste upload can be retried by pasting again.

---

## 2. Function Call Signatures

```ts
type TaskAttachmentPasteDecision =
  | { kind: "accept"; file: File; notice: null }
  | { kind: "resize-image"; file: File; notice: "resized-image" }
  | { kind: "reject"; reason: "too-large" | "image-still-too-large" | "too-many" | "unsupported-type"; maxBytes?: number; maxCount?: number };

export async function preparePastedTaskAttachment(input: {
  file: File;
  existingAttachmentCount: number;
  maxBytes: number;
  maxAttachments: number;
}): Promise<TaskAttachmentPasteDecision>;
```

Guarantees: the function never returns an uploadable file larger than `maxBytes`, never allows
more than `maxAttachments`, attempts client-side resize only for image MIME types, uses no new
runtime dependency, and returns a user-notice reason for every rejected or resized paste.

```ts
export async function uploadTaskAttachment(input: {
  taskId: string;
  file: File;
}): Promise<TaskAttachment>;
```

Guarantees: the function stores bytes and metadata for one task attachment and returns the
metadata needed by the task detail attachment list.

---

## 3. TDD — Testing Strategy

### Authority for correctness

| Under test | Authority |
|---|---|
| Paste file classification and limits | This epic's v1 limits: 5 MB stored size, 3 attachments per task, accepted MIME families image/PDF/plain text/Markdown — exact |
| Image resize decision | This epic's rule: oversized images are resized before upload; resized output must be at most 5 MB or rejected — exact |
| User notices | §1 flows: too large, maximum size, maximum count, and resized-image notices must be observable — exact |
| Metadata and access rules | `reference-rls-and-postgres` conventions plus the existing `can_access_task` helper family; RLS suite pins allowed/denied matrices |
| Storage object lifecycle | Supabase Storage object path convention in this epic plus task-delete cascade requirement — exact |

### Test map

| Flow | Function call | Authority | Fixture | Tolerance |
|---|---|---|---|---|
| 1–5 | `preparePastedTaskAttachment` | Epic limits and notice rules above | Inline synthetic `File`/`Blob` cases in `tests/unit/models/task-attachments.test.ts` | exact bytes and exact notice reason |
| 1, 6 | `uploadTaskAttachment` | Metadata and access rules above | SQL fixtures embedded in `supabase/tests/rls.test.sql` | exact rows and exact SQLSTATE |
| 7 | task-delete attachment cleanup | Storage object lifecycle above | SQL/storage fixtures embedded in `supabase/tests/rls.test.sql` | exact rows and exact object path prefix |
| 1, 6, 7 | storage upload/delete service functions | Supabase Storage object path convention and task attachment metadata contract above | Mocked Supabase storage/client cases in `tests/unit/services/task-attachments-service.test.ts` | exact bucket name, exact object path prefix, and exact metadata fields |
| 1–5 | `useTaskDetail` paste path | §1 observable flows | Component-level paste event cases in `tests/unit/controllers/task-attachments-controller.test.ts` | exact status label and exact notice message |

### What is deliberately not tested

Upload progress timing, visual pixel layout of the compact list, image perceptual quality after
resize, storage-cost accounting, and premium-tier behavior.

---

## 4. Checklist

```md
[x] 1. Add failing paste-limit tests in `tests/unit/models/task-attachments.test.ts` — done when oversized non-images, too-many attachments, accepted files, and unsupported files fail for the right reason
[x] 2. Implement paste-limit decision logic in `src/models/tasks/taskAttachmentPaste.ts` — done when item 1 passes
[x] 3. Add failing image-resize decision tests in `tests/unit/models/task-attachments.test.ts` — done when an oversized image expects a resized uploadable file and an unshrinkable image expects rejection
[x] 4. Implement image resize handling in `src/models/tasks/taskAttachmentPaste.ts` — done when item 3 passes without adding a runtime dependency
[ ] 5. Add failing attachment metadata/RLS tests in `supabase/tests/rls.test.sql` — done when task owner/shared-member allowed cases and unauthorized denied cases fail before the migration
[ ] 6. Add attachment metadata table, policies, and task-delete metadata cascade in `supabase/migrations/<timestamp>_task_attachments.sql` — done when item 5 passes locally
[ ] 7. Add failing storage-path and object-cleanup tests in `supabase/tests/rls.test.sql` — done when task delete leaves an object cleanup expectation failing before storage cleanup exists
[ ] 8. Add failing storage upload/delete service tests in `tests/unit/services/task-attachments-service.test.ts` — done when one upload and one delete-by-task-attachment-path case fail for the right reason
[ ] 8a. (added 2026-07-17) Add storage upload/delete service functions in `src/services/backend/supabase.service.ts` — done when item 8 passes
[ ] 9. Add attachment orchestration tests in `tests/unit/controllers/task-attachments-controller.test.ts` — done when paste accept, resize notice, rejection notice, upload failure, and refresh cases fail for the right reason
[ ] 10. Add task attachment controller functions in `src/controllers/tasks/taskAttachments.controller.ts` — done when item 9 passes
[ ] 11. Add hook-level paste state tests in `tests/unit/controllers/task-attachments-controller.test.ts` — done when uploading/uploaded/failed state and notice text are asserted from the task-detail paste path
[ ] 12. Wire attachment paste state into `src/hooks/useTaskDetail.ts` — done when item 11 passes
[ ] 13. Add compact attachment-list rendering tests in `tests/unit/controllers/task-attachments-controller.test.ts` — done when the view contract expects links plus upload state but no preview gallery
[ ] 14. Render the compact attachment list and paste target feedback in `src/views/components/tasks/TaskDetail.view.tsx` — done when item 13 passes and manual paste in the task detail shows the expected notice
```

---

## 5. Summary

### Architecture impact

- [ ] No change to ARCHITECTURE.md expected
- [x] Amends Description sections: §2 (new task attachment model/service/controller/view files,
  Supabase Storage surface, and attachment metadata migration) and §9b (task detail uses the
  existing toast/status-feedback pattern for paste notices)
- [ ] **Requires a Constitution change** — a human decision, blocks this epic until resolved

### North star deviation

The north star says: **"attention is opt-in, capture is not."** It also says capture must stay
"instant and natural-language" and that no feature may sit between the user and capture. This
epic does not change quick capture; paste attachments only work inside an already-open task
detail, and limits are enforced with immediate local feedback rather than a blocking upload
round trip. The trade is a larger task-detail surface, kept acceptable by task-only scope,
small limits, no preview gallery, and explicit rejection/resized notices.

### Open questions

| # | Question | Blocks | Decision needed by |
|---|---|---|---|
| Q1 | Should pasted HEIC/HEIF count as supported image input on platforms where the browser can decode it? | No v1 blocker; unsupported-type is acceptable | Post-v1 |
| Q2 | Do higher limits become a premium tier? | No v1 blocker | Post-v1 |

### New capability

Yes — this is Jot's first binary-file attachment surface and first Supabase Storage-backed user
content path.
