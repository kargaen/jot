-- Personal API tokens for the Conduit API (supabase/functions/conduit).
-- Tokens are generated client-side; only the sha-256 hash is ever stored.

CREATE TABLE IF NOT EXISTS api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS api_tokens_user_id_idx ON api_tokens (user_id);

ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;

-- Users manage only their own tokens. Written with (select auth.uid()) so the
-- planner evaluates it once per statement, not once per row (see
-- 20260701120000_perf_rls_initplan_and_fk_indexes.sql for why this matters).
CREATE POLICY api_tokens_select ON api_tokens
  FOR SELECT
  USING ((user_id = (select auth.uid())));

CREATE POLICY api_tokens_insert ON api_tokens
  FOR INSERT
  WITH CHECK ((user_id = (select auth.uid())));

CREATE POLICY api_tokens_update ON api_tokens
  FOR UPDATE
  USING ((user_id = (select auth.uid())))
  WITH CHECK ((user_id = (select auth.uid())));
