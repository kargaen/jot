-- Projects are scoped to spaces. Backfill older standalone projects and
-- prevent new null area_id values at the database boundary.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas(id) ON DELETE RESTRICT;

WITH users_needing_area AS (
  SELECT DISTINCT p.user_id
  FROM projects p
  WHERE p.area_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM areas a
      WHERE a.user_id = p.user_id
    )
)
INSERT INTO areas (name, color, user_id)
SELECT 'Personal', '#6B7280', user_id
FROM users_needing_area;

UPDATE projects p
SET area_id = (
  SELECT a.id
  FROM areas a
  WHERE a.user_id = p.user_id
  ORDER BY a.sort_order NULLS LAST, a.created_at, a.id
  LIMIT 1
)
WHERE p.area_id IS NULL;

ALTER TABLE projects
  ALTER COLUMN area_id SET NOT NULL;
