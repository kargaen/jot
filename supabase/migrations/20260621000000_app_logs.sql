-- Observability: rolling log table, per-user level overrides, and level RPC.

CREATE TABLE app_logs (
  id         bigserial   PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  level      text        NOT NULL CHECK (level IN ('debug', 'info', 'warning', 'error')),
  version    text        NOT NULL,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  message    text        NOT NULL,
  details    jsonb
);

CREATE INDEX app_logs_created_at_idx ON app_logs (created_at DESC);
CREATE INDEX app_logs_user_id_idx    ON app_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX app_logs_level_idx      ON app_logs (level);

-- Prune oldest rows every 100 inserts, keeping the 50 000 newest.
-- Fires on every 100th row by id to avoid a full-count scan on each insert.
CREATE OR REPLACE FUNCTION app_logs_enforce_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.id % 100 = 0) THEN
    DELETE FROM app_logs
    WHERE id <= (
      SELECT id FROM app_logs ORDER BY id DESC OFFSET 49999 LIMIT 1
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_logs_cap
AFTER INSERT ON app_logs
FOR EACH ROW EXECUTE FUNCTION app_logs_enforce_cap();

-- Per-user log level overrides — managed directly via Supabase dashboard or service role.
-- Insert a row here to elevate a specific user above the default 'warning' floor.
CREATE TABLE user_log_overrides (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  min_level text NOT NULL CHECK (min_level IN ('debug', 'info', 'warning', 'error'))
);

-- Returns the effective minimum log level for the calling user.
-- Client calls this once on startup (after login) and caches the result.
-- RC builds override to 'debug' client-side without hitting this RPC.
CREATE OR REPLACE FUNCTION get_my_log_level()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT min_level FROM user_log_overrides WHERE user_id = auth.uid()),
    'warning'
  );
$$;

ALTER TABLE app_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_log_overrides ENABLE ROW LEVEL SECURITY;

-- Authenticated users may only insert rows tagged with their own user_id.
CREATE POLICY "insert own logs" ON app_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No SELECT policy on app_logs  → only service role (Supabase dashboard) can query logs.
-- No policies on user_log_overrides → only service role can add or remove overrides.
