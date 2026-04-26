# Attachments Spike

## Goal

Validate whether Jot should support lightweight task attachments without turning the app into a document manager.

## Product Constraints

- Attachments should support short-horizon task work, not long-term archive behavior.
- The default experience should stay simple for most users.
- Storage cost and sync complexity must stay bounded.
- Links should remain the lightest-weight option for most cases.

## Recommended v1 Scope

- Support attachments on tasks only.
- Limit to a small set of file types first:
  - images
  - PDFs
  - plain text / markdown
- Limit attachment size to `5 MB` per file.
- Limit count to `3 attachments` per task.
- Show attachments as a compact list under the task notes/link area.

## Storage Approach

Recommended path:

- Store file metadata in Postgres:
  - `id`
  - `task_id`
  - `user_id`
  - `filename`
  - `mime_type`
  - `size_bytes`
  - `storage_path`
  - `created_at`
- Store file bytes in Supabase Storage.
- Use per-user or per-area storage paths, for example:
  - `task-attachments/<user_id>/<task_id>/<attachment_id>-<filename>`

Why this path:

- keeps binary data out of the main relational tables
- uses existing Supabase infrastructure
- is easy to enforce with RLS and storage policies
- gives a clean future upgrade path for larger plans

## Sync / UX Notes

- Desktop and mobile should upload in the background and show:
  - uploading
  - uploaded
  - failed
- Attachments should be optional and secondary.
- Links should still be visible first when present, because they are cheaper and faster.
- Opening an attachment should use the native opener plugin.

## Risks

- Storage and bandwidth costs rise quickly if limits are loose.
- Mobile upload UX gets messy with flaky connections.
- Rich previews can create a lot of UI and implementation weight.
- Shared spaces raise permission questions for who can read or remove files.

## Suggested Rules

- Only task owners and authorized area members can access the file.
- Deleting a task should delete attachment metadata and storage objects.
- Closing/completing a task should not delete attachments automatically.
- No inline image gallery or heavy preview system in the first version.

## Recommendation

If we build this, start as a deliberately constrained feature:

- task-only
- small files
- very low limits
- open/download only
- no rich preview stack

That would let Jot test the value of attachments without fighting the product’s core simplicity.
