-- Fix RLS policies for task creation.
--
-- Two problems introduced by the collaboration MVP migration (20260427):
--
-- 1. Infinite recursion: can_access_area / can_access_project / can_access_task
--    query tables whose RLS policies call those same functions, causing
--    Postgres error 42P17 ("infinite recursion detected in policy for relation").
--    The SECURITY DEFINER flag tells Postgres to run the function as its owner
--    and skip RLS on the internal queries.  Migration 20260428 applied this fix
--    but only idempotently re-applying it here makes the RC resilient to
--    partial-deployment scenarios.
--
-- 2. Missing NULL/NULL path in tasks_insert: the policy requires either a
--    valid project_id or a valid area_id.  The app layer always resolves an
--    area before inserting, but inbox tasks and subtasks that reach the DB
--    before the resolver runs would be rejected.  Adding the third OR branch
--    is safe because user_id = auth.uid() already pins the row to the caller,
--    and tasks_select / tasks_update still enforce project/area access.

-- ── Re-apply SECURITY DEFINER helpers (idempotent; safe to re-run) ───────────

CREATE OR REPLACE FUNCTION can_access_area(p_area_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM areas a
    WHERE a.id = p_area_id AND a.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM area_members am
    WHERE am.area_id = p_area_id
      AND am.status = 'accepted'
      AND am.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION can_access_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project_id AND p.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project_id
      AND p.area_id IS NOT NULL
      AND can_access_area(p.area_id)
  ) OR EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.status = 'accepted'
      AND pm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION can_access_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = p_task_id
      AND (
        t.user_id = auth.uid()
        OR (t.area_id IS NOT NULL AND can_access_area(t.area_id))
        OR (t.project_id IS NOT NULL AND can_access_project(t.project_id))
      )
  );
$$;

-- ── Widen tasks_insert to accept NULL/NULL rows ───────────────────────────────

DROP POLICY IF EXISTS "tasks_insert" ON tasks;

CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      -- Task scoped to a project the caller can access
      (project_id IS NOT NULL AND can_access_project(project_id))
      -- Task scoped directly to an area the caller can access
      OR (project_id IS NULL AND area_id IS NOT NULL AND can_access_area(area_id))
      -- Inbox / subtask: no project or area yet; caller owns the row
      OR (project_id IS NULL AND area_id IS NULL)
    )
  );
