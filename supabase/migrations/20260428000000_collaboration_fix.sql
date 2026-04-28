-- Fix recursive RLS: mark all three access helpers as SECURITY DEFINER
-- so they bypass row-level security when querying internally.

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