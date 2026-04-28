-- Collaboration MVP: real shared access, project sharing, and optional task responsibility

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS responsible_user_id uuid,
  ADD COLUMN IF NOT EXISTS responsible_email text;

CREATE TABLE IF NOT EXISTS project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  user_id uuid,
  invited_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_email_key
  ON project_members (project_id, lower(invited_email));

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION can_access_area(p_area_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM areas a
    WHERE a.id = p_area_id
      AND a.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1
    FROM area_members am
    WHERE am.area_id = p_area_id
      AND am.status = 'accepted'
      AND am.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION can_access_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.id = p_project_id
      AND p.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.id = p_project_id
      AND p.area_id IS NOT NULL
      AND can_access_area(p.area_id)
  ) OR EXISTS (
    SELECT 1
    FROM project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.status = 'accepted'
      AND pm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION can_access_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tasks t
    WHERE t.id = p_task_id
      AND (
        t.user_id = auth.uid()
        OR (t.area_id IS NOT NULL AND can_access_area(t.area_id))
        OR (t.project_id IS NOT NULL AND can_access_project(t.project_id))
      )
  );
$$;

DROP POLICY IF EXISTS "tasks_select" ON tasks;
DROP POLICY IF EXISTS "tasks_insert" ON tasks;
DROP POLICY IF EXISTS "tasks_update" ON tasks;
DROP POLICY IF EXISTS "tasks_delete" ON tasks;

CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (can_access_task(id));

CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      (project_id IS NOT NULL AND can_access_project(project_id))
      OR (project_id IS NULL AND area_id IS NOT NULL AND can_access_area(area_id))
    )
  );

CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE USING (can_access_task(id))
  WITH CHECK (
    (
      (project_id IS NOT NULL AND can_access_project(project_id))
      OR (project_id IS NULL AND area_id IS NOT NULL AND can_access_area(area_id))
    )
    AND (responsible_user_id IS NULL OR responsible_email IS NOT NULL)
  );

CREATE POLICY "tasks_delete" ON tasks
  FOR DELETE USING (can_access_task(id));

DROP POLICY IF EXISTS "areas_select" ON areas;
DROP POLICY IF EXISTS "areas_insert" ON areas;
DROP POLICY IF EXISTS "areas_update" ON areas;
DROP POLICY IF EXISTS "areas_delete" ON areas;

CREATE POLICY "areas_select" ON areas
  FOR SELECT USING (can_access_area(id));

CREATE POLICY "areas_insert" ON areas
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "areas_update" ON areas
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "areas_delete" ON areas
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "projects_insert" ON projects;
DROP POLICY IF EXISTS "projects_update" ON projects;
DROP POLICY IF EXISTS "projects_delete" ON projects;

CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (can_access_project(id));

CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND area_id IS NOT NULL
    AND can_access_area(area_id)
  );

CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (can_access_project(id))
  WITH CHECK (
    area_id IS NOT NULL
    AND can_access_area(area_id)
  );

CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (
    user_id = auth.uid()
    OR area_id IN (SELECT id FROM areas WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "tags_select" ON tags;
DROP POLICY IF EXISTS "tags_insert" ON tags;
DROP POLICY IF EXISTS "tags_update" ON tags;
DROP POLICY IF EXISTS "tags_delete" ON tags;

CREATE POLICY "tags_select" ON tags
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM task_tags tt
      WHERE tt.tag_id = tags.id
        AND can_access_task(tt.task_id)
    )
  );

CREATE POLICY "tags_insert" ON tags
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "tags_update" ON tags
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "tags_delete" ON tags
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "task_tags_select" ON task_tags;
DROP POLICY IF EXISTS "task_tags_insert" ON task_tags;
DROP POLICY IF EXISTS "task_tags_delete" ON task_tags;

CREATE POLICY "task_tags_select" ON task_tags
  FOR SELECT USING (can_access_task(task_id));

CREATE POLICY "task_tags_insert" ON task_tags
  FOR INSERT WITH CHECK (can_access_task(task_id));

CREATE POLICY "task_tags_delete" ON task_tags
  FOR DELETE USING (can_access_task(task_id));

DROP POLICY IF EXISTS "area_members_owner_all" ON area_members;
DROP POLICY IF EXISTS "area_members_invitee_select" ON area_members;
DROP POLICY IF EXISTS "area_members_invitee_update" ON area_members;
DROP POLICY IF EXISTS "area_members_member_delete" ON area_members;
DROP POLICY IF EXISTS "area_members_accepted_select" ON area_members;

CREATE POLICY "area_members_owner_all" ON area_members
  FOR ALL USING (area_id IN (SELECT id FROM areas WHERE user_id = auth.uid()));

CREATE POLICY "area_members_invitee_select" ON area_members
  FOR SELECT USING (invited_email = auth.email());

CREATE POLICY "area_members_invitee_update" ON area_members
  FOR UPDATE USING (invited_email = auth.email())
  WITH CHECK (invited_email = auth.email());

CREATE POLICY "area_members_member_delete" ON area_members
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "area_members_accepted_select" ON area_members
  FOR SELECT USING (
    status = 'accepted'
    AND can_access_area(area_id)
  );

DROP POLICY IF EXISTS "project_members_owner_all" ON project_members;
DROP POLICY IF EXISTS "project_members_invitee_select" ON project_members;
DROP POLICY IF EXISTS "project_members_invitee_update" ON project_members;
DROP POLICY IF EXISTS "project_members_member_delete" ON project_members;
DROP POLICY IF EXISTS "project_members_accepted_select" ON project_members;

CREATE POLICY "project_members_owner_all" ON project_members
  FOR ALL USING (
    project_id IN (
      SELECT p.id
      FROM projects p
      LEFT JOIN areas a ON a.id = p.area_id
      WHERE p.user_id = auth.uid() OR a.user_id = auth.uid()
    )
  );

CREATE POLICY "project_members_invitee_select" ON project_members
  FOR SELECT USING (invited_email = auth.email());

CREATE POLICY "project_members_invitee_update" ON project_members
  FOR UPDATE USING (invited_email = auth.email())
  WITH CHECK (invited_email = auth.email());

CREATE POLICY "project_members_member_delete" ON project_members
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "project_members_accepted_select" ON project_members
  FOR SELECT USING (
    status = 'accepted'
    AND can_access_project(project_id)
  );
