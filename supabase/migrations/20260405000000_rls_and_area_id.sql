-- Migration: RLS policies for all tables + area_id on tasks
-- Idempotent: safe to re-run.

-- ─── TASKS ───────────────────────────────────────────────────────────────────
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "tasks: user isolation" ON tasks;
DROP POLICY IF EXISTS "tasks_select"          ON tasks;
DROP POLICY IF EXISTS "tasks_insert"          ON tasks;
DROP POLICY IF EXISTS "tasks_update"          ON tasks;
DROP POLICY IF EXISTS "tasks_delete"          ON tasks;

CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "tasks_insert" ON tasks FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "tasks_update" ON tasks FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tasks_delete" ON tasks FOR DELETE USING (user_id = auth.uid());

-- ─── AREAS ───────────────────────────────────────────────────────────────────
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "areas: user isolation" ON areas;
DROP POLICY IF EXISTS "areas_select"          ON areas;
DROP POLICY IF EXISTS "areas_insert"          ON areas;
DROP POLICY IF EXISTS "areas_update"          ON areas;
DROP POLICY IF EXISTS "areas_delete"          ON areas;

CREATE POLICY "areas_select" ON areas FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "areas_insert" ON areas FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "areas_update" ON areas FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "areas_delete" ON areas FOR DELETE USING (user_id = auth.uid());

-- ─── PROJECTS ────────────────────────────────────────────────────────────────
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects: user isolation" ON projects;
DROP POLICY IF EXISTS "projects_select"          ON projects;
DROP POLICY IF EXISTS "projects_insert"          ON projects;
DROP POLICY IF EXISTS "projects_update"          ON projects;
DROP POLICY IF EXISTS "projects_delete"          ON projects;

CREATE POLICY "projects_select" ON projects FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "projects_update" ON projects FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "projects_delete" ON projects FOR DELETE USING (user_id = auth.uid());

-- ─── TAGS ────────────────────────────────────────────────────────────────────
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tags: user isolation" ON tags;
DROP POLICY IF EXISTS "tags_select"          ON tags;
DROP POLICY IF EXISTS "tags_insert"          ON tags;
DROP POLICY IF EXISTS "tags_update"          ON tags;
DROP POLICY IF EXISTS "tags_delete"          ON tags;

CREATE POLICY "tags_select" ON tags FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "tags_insert" ON tags FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "tags_update" ON tags FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tags_delete" ON tags FOR DELETE USING (user_id = auth.uid());

-- ─── TASK_TAGS ───────────────────────────────────────────────────────────────
ALTER TABLE task_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_tags: user isolation" ON task_tags;
DROP POLICY IF EXISTS "task_tags_select"          ON task_tags;
DROP POLICY IF EXISTS "task_tags_insert"          ON task_tags;
DROP POLICY IF EXISTS "task_tags_delete"          ON task_tags;

CREATE POLICY "task_tags_select" ON task_tags
  FOR SELECT USING (task_id IN (SELECT id FROM tasks WHERE user_id = auth.uid()));

CREATE POLICY "task_tags_insert" ON task_tags
  FOR INSERT WITH CHECK (task_id IN (SELECT id FROM tasks WHERE user_id = auth.uid()));

CREATE POLICY "task_tags_delete" ON task_tags
  FOR DELETE USING (task_id IN (SELECT id FROM tasks WHERE user_id = auth.uid()));

-- ─── AREA_MEMBERS ────────────────────────────────────────────────────────────
ALTER TABLE area_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "area_members_owner"          ON area_members;
DROP POLICY IF EXISTS "area_members_invitee"        ON area_members;
DROP POLICY IF EXISTS "area_members_owner_all"      ON area_members;
DROP POLICY IF EXISTS "area_members_invitee_select" ON area_members;
DROP POLICY IF EXISTS "area_members_invitee_update" ON area_members;
DROP POLICY IF EXISTS "area_members_member_delete"  ON area_members;

-- Space owners have full control over their area's members
CREATE POLICY "area_members_owner_all" ON area_members
  FOR ALL USING (area_id IN (SELECT id FROM areas WHERE user_id = auth.uid()));

-- Invitees can see their own pending invites
CREATE POLICY "area_members_invitee_select" ON area_members
  FOR SELECT USING (invited_email = auth.email());

-- Invitees can accept (sets status + their user_id)
CREATE POLICY "area_members_invitee_update" ON area_members
  FOR UPDATE USING (invited_email = auth.email())
  WITH CHECK (invited_email = auth.email());

-- Accepted members can leave (delete their own row)
CREATE POLICY "area_members_member_delete" ON area_members
  FOR DELETE USING (user_id = auth.uid());
