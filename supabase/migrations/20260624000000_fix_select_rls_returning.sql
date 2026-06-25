-- Fix INSERT ... RETURNING failing with 42501 on areas / projects / tasks.
--
-- Symptom: any .insert().select() / .upsert().select() (and the app's create
-- flows) failed with
--   "new row violates row-level security policy for table ..."
-- even though the INSERT WITH CHECK was satisfied and auth.uid() = user_id.
--
-- Root cause: PostgreSQL applies the SELECT policy to the row produced by a
-- RETURNING clause. Since 20260427 (collaboration MVP) the SELECT policies were
--   areas_select    USING (can_access_area(id))
--   projects_select USING (can_access_project(id))
--   tasks_select    USING (can_access_task(id))
-- Those helpers are STABLE SECURITY DEFINER functions that re-query the SAME
-- table by id. During INSERT ... RETURNING the just-inserted row is not visible
-- to the helper's own snapshot, so EXISTS(...) returns false and the RETURNING
-- check fails -> 42501. A bare INSERT (no RETURNING) succeeds; feedback was
-- unaffected because its SELECT policy is literally `true`.
--
-- Fix: add a direct owner disjunct (user_id = auth.uid()) to each SELECT policy.
-- It is evaluated against the candidate row's own column value (no table
-- re-query), so the owner can always read back rows they just inserted, while
-- shared access continues to flow through the can_access_* helpers. This mirrors
-- the pre-collaboration policy (USING (user_id = auth.uid())) that worked.

-- ── AREAS ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "areas_select" ON areas;
CREATE POLICY "areas_select" ON areas
  FOR SELECT USING (user_id = auth.uid() OR can_access_area(id));

-- ── PROJECTS ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (user_id = auth.uid() OR can_access_project(id));

-- ── TASKS ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tasks_select" ON tasks;
CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (user_id = auth.uid() OR can_access_task(id));
