-- EPIC-013: effort-based capacity planning.
-- A simple ordinal effort scale on tasks (light/medium/heavy), deliberately NOT time.
-- Nullable with no default: NULL means "no effort set", which is a meaningful state
-- (the task simply does not count toward a day's planned load). Mirrors the `priority`
-- column's CHECK pattern. No RLS/policy change — an added nullable column is covered by
-- the existing tasks policies.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS effort text
  CHECK (effort IN ('light', 'medium', 'heavy'));
