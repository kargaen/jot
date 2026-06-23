-- Fix tasks_update RLS policy to allow updating inbox tasks (no project, no area).
--
-- The previous migration (20260621100000) widened tasks_insert to accept rows
-- where both project_id and area_id are NULL, but left tasks_update requiring
-- at least one anchor.  Any task in the global inbox (or a subtask not yet
-- anchored) would therefore pass INSERT but fail UPDATE — meaning the user
-- could create the task but never complete or edit it.
--
-- Adding the third OR branch mirrors the insert policy: if the caller owns
-- the row (user_id = auth.uid()) and neither anchor is set, allow the update.

DROP POLICY IF EXISTS "tasks_update" ON tasks;

CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE
  USING (can_access_task(id))
  WITH CHECK (
    (
      (project_id IS NOT NULL AND can_access_project(project_id))
      OR (project_id IS NULL AND area_id IS NOT NULL AND can_access_area(area_id))
      OR (project_id IS NULL AND area_id IS NULL AND user_id = auth.uid())
    )
    AND (responsible_user_id IS NULL OR responsible_email IS NOT NULL)
  );
