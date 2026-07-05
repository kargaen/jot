---
name: reference-rls-and-postgres
description: >-
  Domain-theory reference for Postgres Row-Level Security AS JOT USES IT. Load
  WHENEVER work touches Supabase RLS, policies, migrations under supabase/migrations/,
  auth.uid()/auth.email(), the collaboration/sharing access model (areas → projects →
  tasks, area_members), the can_access_area/can_access_project/can_access_task helpers,
  SECURITY DEFINER functions, or Conduit's service-role boundary. Load on the errors
  42501 ("new row violates row-level security policy" / "insufficient privilege") and
  42P17 ("infinite recursion detected in policy"). Load for questions like "why does my
  insert fail", "why does .insert().select() fail but a bare insert works", "RLS policy",
  "USING vs WITH CHECK", "INSERT RETURNING 42501", "auth.uid is null in CI", "SECURITY
  DEFINER", "can_access_area recursion", or any time you are WRITING or REVIEWING an RLS
  migration in this repo. Read this BEFORE editing a policy — the traps here have already
  cost this project four fix migrations.
---

# RLS & Postgres — the domain pack for Jot

This is the Postgres/RLS theory a mid-level engineer (or Sonnet-class model) is most
likely to be missing, taught **as it actually plays out in Jot's schema**. Every policy,
helper, and error quoted here is copied from the repo, not invented. Jot's entire
multi-tenant + collaboration security model lives in Row-Level Security — get a policy
wrong and users either leak each other's data or cannot create a task at all. This project
has already shipped **four** corrective RLS migrations. Read this before touching a fifth.

The canonical files:

- `supabase/migrations/20260405000000_rls_and_area_id.sql` — the original per-user isolation policies.
- `supabase/migrations/20260427000000_collaboration_mvp.sql` — sharing model + the three `can_access_*` helpers (this is where the trouble started).
- `supabase/migrations/20260428000000_collaboration_fix.sql` — adds `SECURITY DEFINER` (fixes 42P17).
- `supabase/migrations/20260621100000_fix_rls_task_creation.sql` — idempotent re-apply of DEFINER + widen `tasks_insert` for inbox rows.
- `supabase/migrations/20260623000000_fix_tasks_update_rls.sql` — same inbox widening for `tasks_update`.
- `supabase/migrations/20260624000000_fix_select_rls_returning.sql` — **the crown jewel** (commit `f926bd3`): fixes 42501 on `INSERT ... RETURNING`.
- `supabase/migrations/20260701120000_perf_rls_initplan_and_fk_indexes.sql` — wraps `auth.uid()` as `(select auth.uid())` + FK indexes.
- `supabase/tests/rls.test.sql` — pgTAP tests that pin all of the above.

---

## 1. RLS fundamentals, defined once

**Row-Level Security (RLS)** is a Postgres feature that filters which *rows* of a table a
query may see or modify, based on the current session. It is enabled per-table:

```sql
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;   -- from 20260405
```

Once enabled, **every** row access is denied unless a *policy* allows it. Policies are
boolean SQL expressions attached to a table for a command (`SELECT`/`INSERT`/`UPDATE`/`DELETE`
or `ALL`). There are two clause types, and the single most common RLS mistake is confusing
them:

- **`USING (...)`** — the **read/visibility** predicate. Evaluated against rows *already in
  the table* to decide whether the current user may **see** them (SELECT) or is **allowed to
  target** them (the row-being-modified check of UPDATE/DELETE). If `USING` is false for a
  row, that row is simply *invisible* — no error, it just isn't there.
- **`WITH CHECK (...)`** — the **write** predicate. Evaluated against the **new/proposed row**
  to decide whether an `INSERT` or `UPDATE` may write it. If `WITH CHECK` is false, the write
  is **rejected with error 42501**.

Rule of thumb as used throughout Jot:

| Command | `USING` checks… | `WITH CHECK` checks… |
| --- | --- | --- |
| SELECT | the row being read | (n/a) |
| INSERT | (n/a) | the row being written |
| UPDATE | the existing row (may I target it?) | the resulting row (may I write it?) |
| DELETE | the row being deleted | (n/a) |

You can see all four in the original `tasks` policies:

```sql
-- 20260405000000_rls_and_area_id.sql
CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "tasks_insert" ON tasks FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "tasks_update" ON tasks FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tasks_delete" ON tasks FOR DELETE USING (user_id = auth.uid());
```

**`auth.uid()`** is a Supabase-provided SQL function that returns the current user's UUID by
reading the `sub` claim out of the request's JWT (specifically
`request.jwt.claims ->> 'sub'`). **`auth.email()`** does the same for the email claim.
When there is **no valid JWT**, `auth.uid()` returns **NULL** — so every `user_id = auth.uid()`
predicate is false and the user can touch nothing. This is by design; see §5 for the NULL trap.

**The two Supabase keys, and why the distinction is a security boundary:**

- **anon / publishable key** — what the app and normal integration tests use. Requests carry
  the signed-in user's JWT, `auth.uid()` resolves, and **RLS is fully enforced**.
- **service-role key** — a privileged key that **BYPASSES RLS entirely**. Any query it makes
  ignores every policy. It exists for trusted server-side code (migrations, the pgTAP
  `service_role` fixtures, and Jot's **Conduit** edge function).

Because service-role bypasses RLS, the moment you use it you have **turned RLS off** and must
re-implement the tenant boundary by hand. Jot does exactly this in `functions/conduit/index.ts`:
it uses `SUPABASE_SERVICE_ROLE_KEY` and therefore **every** query explicitly appends
`.eq("user_id", userId)` where `userId` is resolved from the API token's owner. The file says
it plainly:

```
// ... user_id to the token's owner. That scoping IS the security boundary here.
```

> **This is the ONLY sanctioned place in Jot where RLS is bypassed.** Never reach for the
> service-role key to "get around" a failing policy elsewhere. If an insert is failing, the
> answer is a correct policy (see §3/§6), not a privilege escalation. Routing app CRUD around
> RLS would silently delete the multi-tenant boundary.

---

## 2. The collaboration model and the three helper functions

Jot's data hierarchy (`supabase/migrations/20260401000000_core_schema.sql`):

- **areas** — top-level container, owned via `areas.user_id`.
- **projects** — belong to an area (`projects.area_id`, `ON DELETE RESTRICT`) and owned via `projects.user_id`.
- **tasks** — may anchor to a `project_id`, an `area_id`, both, or **neither** (an "inbox" task); owned via `tasks.user_id`.

Sharing is layered on top by two membership tables: **`area_members`** and **`project_members`**
(added in `20260427`). A row with `status = 'accepted'` and a matching `user_id` grants a second
user access to that area/project — and, transitively, to the projects and tasks inside it.

Encoding "can this user touch this row?" inline in every policy would be unreadable, so
`20260427` centralised the logic into three helper functions. Their **current, correct**
definitions (from `20260428`, re-applied idempotently in `20260621100000`):

```sql
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
```

`can_access_project` additionally allows access when the project's area is accessible, or the
caller is an accepted `project_members` row:

```sql
CREATE OR REPLACE FUNCTION can_access_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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
```

`can_access_task` grants access if the caller owns the task, or can access its area, or its project:

```sql
CREATE OR REPLACE FUNCTION can_access_task(p_task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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
```

### Why these MUST be `SECURITY DEFINER` (the 42P17 story)

A Postgres function runs by default as `SECURITY INVOKER`: internal queries run **with the
caller's privileges**, so they are **themselves subject to RLS**. Now trace the loop:

1. A query does `SELECT ... FROM tasks`.
2. The `tasks_select` policy is `USING (can_access_task(id))`.
3. `can_access_task` runs `SELECT 1 FROM tasks WHERE ...`.
4. That inner `SELECT` on `tasks` **re-triggers the `tasks_select` policy**…
5. …which calls `can_access_task` again → **infinite recursion**.

Postgres detects this and raises **`42P17` — "infinite recursion detected in policy for
relation"**. This is exactly what the `20260427` MVP shipped, because it defined the helpers
**without** `SECURITY DEFINER`.

**`SECURITY DEFINER`** makes the function run with the privileges of its **owner** (a
superuser-ish role), and crucially, its **internal queries bypass RLS**. Step 4 no longer
re-triggers the policy, the recursion is broken, and the function still returns the right
answer because it filters on `auth.uid()` explicitly. Fixed in `20260428` / commit `8fd01ee`:

```sql
-- 20260428000000_collaboration_fix.sql
-- Fix recursive RLS: mark all three access helpers as SECURITY DEFINER
-- so they bypass row-level security when querying internally.
```

**`STABLE`** matters too: it tells the planner the function returns the same result within a
single statement for the same arguments, so Postgres may cache/optimise its evaluation instead
of calling it per-row unpredictably. All three helpers are declared `STABLE SECURITY DEFINER`.

Two non-negotiable companions to `SECURITY DEFINER` in this repo, both present on every helper:

- **`SET search_path = public`** — a DEFINER function with an attacker-controllable search_path
  is a classic privilege-escalation vector. Pinning it closes that hole. Always include it.
- The function filters on `auth.uid()` **itself**. DEFINER bypasses RLS, so if the body forgot
  to scope to the caller it would happily leak every row. The security moved from the RLS engine
  *into the function body* — so the body must be correct.

---

## 3. The `INSERT ... RETURNING` trap (the crown jewel — commit `f926bd3`)

This is the single most valuable, least-obvious thing in this pack. Internalise it.

**Symptom:** `.insert().select()` / `.upsert().select()` (and every app create flow, since the
client reads back the new row) fails with:

```
new row violates row-level security policy for table "tasks"   -- error 42501
```

…**even though** the `INSERT WITH CHECK` was satisfied and `auth.uid() = user_id`. A **bare**
`INSERT` with no `RETURNING` **succeeds**. The `feedback` table was immune because its SELECT
policy was literally `true`.

**Root cause — the fact almost nobody knows:** *Postgres applies the table's `SELECT`/`USING`
policy to the rows produced by a `RETURNING` clause.* An `INSERT ... RETURNING` is an insert
**plus a read-back**, and the read-back is gated by `tasks_select`.

After the collaboration MVP the SELECT policies were:

```sql
areas_select    USING (can_access_area(id))
projects_select USING (can_access_project(id))
tasks_select    USING (can_access_task(id))
```

Those helpers are `STABLE SECURITY DEFINER` functions that **re-query the same table by id**
(`SELECT 1 FROM tasks WHERE t.id = p_task_id ...`). During `INSERT ... RETURNING`, the
just-inserted row **is not visible to the helper's own snapshot** — so `EXISTS(...)` returns
**false**, the RETURNING visibility check fails, and the whole statement errors `42501`. The
`WITH CHECK` had already passed; the failure is on the *read-back*, which is why a bare insert
was fine. The commit verified this with a direct SQL repro: bare insert OK, `INSERT ... RETURNING`
→ `42501`.

### The fix pattern (memorise this)

**Every `SELECT` policy must include a direct owner disjunct that reads the row's OWN column,
with no table re-query.** Add `user_id = auth.uid()` as an `OR` branch in front of the helper:

```sql
-- 20260624000000_fix_select_rls_returning.sql  (commit f926bd3)

-- BEFORE (broken for INSERT...RETURNING):
--   CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (can_access_task(id));

-- AFTER:
DROP POLICY IF EXISTS "areas_select" ON areas;
CREATE POLICY "areas_select" ON areas
  FOR SELECT USING (user_id = auth.uid() OR can_access_area(id));

DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (user_id = auth.uid() OR can_access_project(id));

DROP POLICY IF EXISTS "tasks_select" ON tasks;
CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (user_id = auth.uid() OR can_access_task(id));
```

Why this works: `user_id = auth.uid()` is evaluated against the **candidate row's own column
value** that the INSERT already has in hand — it does **not** re-query the table, so the
snapshot-visibility problem never arises. The owner can always read back a row they just
inserted, while **shared** access still flows through the `can_access_*` helper on the OR's
right side. This deliberately mirrors the pre-collaboration policy (`USING (user_id = auth.uid())`)
that always worked.

**Generalise it:** any SELECT (or UPDATE) policy whose predicate re-queries the table it is
defined on will break `RETURNING`. The direct-owner disjunct on the row's own column is the
antidote. This is now a Jot rule — see §6.

There is a second lesson baked into `f926bd3`: the CI pipeline was reordered so `migrate-db`
runs **before** `integration-test`. Previously `migrate-db` depended on `integration-test`, so
this very fix could never deploy while the test it fixed was red — a deadlock. (Details live in
the change-control and failure-archaeology siblings.)

---

## 4. The initplan performance pattern (`20260701`)

`auth.uid()` is a function call. In a naive policy, Postgres may evaluate it **once per row**
scanned — on a 10k-row table that is 10k redundant JWT parses. Wrapping the call in a scalar
subquery, `(select auth.uid())`, lets the planner hoist it into an **InitPlan**: it is computed
**once per statement** and the constant reused for every row. The result is identical; only the
evaluation count changes.

`20260701120000_perf_rls_initplan_and_fk_indexes.sql` rewrites every policy this way with
`ALTER POLICY`. Representative lines:

```sql
alter policy "tasks_select" on public.tasks
  using (((user_id = (select auth.uid())) OR can_access_task(id)));

alter policy "areas_insert" on public.areas
  with check ((user_id = (select auth.uid())));

alter policy "area_members_invitee_select" on public.area_members
  using ((invited_email = (select auth.email())));
```

Supabase's own linter flags the un-wrapped form as the **`auth_rls_initplan`** advisory — this
migration exists to clear it. The comment at the top states the invariant:
`auth.uid()/auth.email() -> (select ...) is semantically identical.`

**FK covering indexes.** The same migration adds indexes for foreign keys that had none:

```sql
create index if not exists tasks_area_id_idx on public.tasks (area_id);
create index if not exists area_members_user_id_idx on public.area_members (user_id);
```

This matters *specifically because of RLS*: the `can_access_*` helpers filter on `area_id`,
`project_id`, and membership `user_id` on every access check. Without covering indexes those
`EXISTS` sub-selects become sequential scans, and since the helpers fire for every row of every
shared query, the cost compounds. Unindexed FKs also slow cascade deletes. At scale, RLS turns
"nice to have" indexes into "required."

---

## 5. Postgres error-code cheat sheet (as seen in Jot)

| Code | Postgres text | In Jot it means | First thing to check |
| --- | --- | --- | --- |
| **42501** | `insufficient_privilege` / `new row violates row-level security policy for table "X"` | A `WITH CHECK` failed **or** a `RETURNING`/SELECT read-back was blocked. | Did WITH CHECK pass but SELECT policy lacks the owner disjunct? (§3) Is `auth.uid()` NULL? (below) |
| **42P17** | `infinite recursion detected in policy for relation "X"` | A policy calls a helper that re-queries the same table **without** `SECURITY DEFINER`. | Are all `can_access_*` helpers `SECURITY DEFINER`? (§2) |

**Reading them:** `42501` is the RLS/permission code — it is thrown by `WITH CHECK` rejections
**and** by `RETURNING` visibility failures, which is why the same code covers both "you can't
write that" and the far subtler INSERT-RETURNING trap. `42P17` is unambiguous: recursion, almost
always a missing `SECURITY DEFINER`.

**The `auth.uid()` NULL trap.** When the JWT is missing, expired, or not propagated to Postgres,
`auth.uid()` is NULL, so `user_id = auth.uid()` is false and inserts fail with `42501` even
though the client sent a real `user_id`. The pgTAP suite pins this as its very first test:

```sql
-- rls.test.sql, test 1
DO $$ BEGIN SET LOCAL ROLE anon; END $$;
SELECT throws_ok(
  $$INSERT INTO public.tasks (id, user_id, title, status, priority)
    VALUES ('c0000001-0000-4000-8000-000000000099',
            'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
            'Unauthenticated task', 'todo', 'none')$$,
  '42501', NULL,
  'unauthenticated request (anon role) cannot insert a task'
);
```

In CI this surfaced as a whole class of "JWT propagation" bugs (single client for auth+data so
the session token auto-attaches; pin the access token in global headers; note that
`PostgrestError` is **not** an `Error` instance). Those war stories live in the
failure-archaeology and debugging-playbook siblings — don't re-derive them here.

**Reproducing at the lowest layer.** The fastest way to distinguish the INSERT-RETURNING trap
from a plain WITH-CHECK failure is raw SQL: run a **bare** `INSERT` (no `RETURNING`) and an
`INSERT ... RETURNING *` as the same authenticated role. If the bare insert succeeds and the
RETURNING form throws `42501`, it is the §3 trap — a SELECT policy missing its owner disjunct.
`rls.test.sql` exercises the JWT-switching pattern (`_as_user(uid)` sets `request.jwt.claims`
and `SET LOCAL ROLE authenticated`; `_as_service()` switches to `service_role` to bypass RLS
for fixtures).

---

## 6. Rules of the road — writing an RLS migration in Jot

Follow every one of these; each maps to a bug this project already paid for.

1. **Append-only, chronological.** Migrations are never edited after they land. Add a new
   timestamped file (`YYYYMMDDHHMMSS_description.sql`); do not modify an existing one. The
   collaboration fixes are four *new* files, not edits to `20260427`.
2. **Idempotent re-apply.** Assume the file may run twice (partial-deployment RCs happen). Use
   `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` before `CREATE POLICY`,
   `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. `20260621100000` re-applies the
   `20260428` DEFINER fix on purpose, for exactly this reason.
3. **Direct-owner disjunct on every SELECT policy.** `USING (user_id = auth.uid() OR can_access_*(id))`
   — never `USING (can_access_*(id))` alone, or you reintroduce the §3 `INSERT ... RETURNING`
   42501.
4. **Helpers are `STABLE SECURITY DEFINER SET search_path = public`** and must filter on
   `auth.uid()` internally. No exceptions — omitting DEFINER gives you 42P17 (§2).
5. **Wrap auth functions:** write `(select auth.uid())` / `(select auth.email())`, not the bare
   call, to satisfy the `auth_rls_initplan` advisory (§4).
6. **Index the FKs your policies filter on.** If a new helper or policy filters on a new foreign
   key, add its covering index in the same migration.
7. **Keep INSERT/UPDATE/SELECT consistent.** When you widen what can be written, widen what can
   be read/updated to match — the inbox (`project_id IS NULL AND area_id IS NULL`) gap had to be
   patched in `tasks_insert` (`20260621100000`) *and* `tasks_update` (`20260623000000`); a task
   you can insert but not complete is a broken feature.
8. **Test at three layers before calling it done:**
   - `supabase/tests/rls.test.sql` (pgTAP, `npx supabase test db`) — policy-level, deterministic, includes the anon-NULL and shared-access cases.
   - `scripts/rls-ladder.ts` — the RLS verification ladder.
   - `scripts/ci-integration-test.ts` — real signed-in-user CRUD against Supabase, run in the RC pipeline **after** `migrate-db`.
9. **Never bypass RLS to make a policy problem "go away."** Service-role is only for Conduit's
   token-scoped path (§1). If a policy is fighting you, fix the policy.

Migrations are also gated by the repo's change-control discipline (RC pipeline ordering, one
concern per migration). That process is owned by the **change-control** sibling — defer to it
rather than restating pipeline mechanics here.

---

## When NOT to use this skill

- **Non-RLS Postgres schema work** (adding a plain column, a check constraint, a trigger with
  no policy interaction) — you don't need the collaboration theory; just follow the append-only
  + idempotent conventions from §6.1–6.2.
- **Frontend/controller auth-state questions** ("why is the user logged out in the UI") — that
  is client session handling, not database RLS.
- **The full chronological war-story narrative** of the RLS saga (who fixed what, when, and the
  CI deadlock) — that is **failure-archaeology**. This skill teaches the *theory and current
  correct patterns*; it does not re-tell the timeline.
- **Executing the collaboration RLS fix as a step-by-step procedure** — that is
  **campaign-rls-collaboration**.
- **General "how do I debug this error" methodology** — that is **debugging-playbook**; this
  skill gives you the two error codes' meanings, not the general debugging loop.

## Sibling skills (cross-reference, don't duplicate)

- **change-control** — migration gating, RC pipeline order, one-concern-per-migration.
- **failure-archaeology** — the full chronicle of the RLS saga and the CI auth/JWT-propagation bugs.
- **campaign-rls-collaboration** — the executable, step-by-step fix procedure for the collaboration RLS work.
- **debugging-playbook** — general reproduce-isolate-fix loop; pairs with the §5 error codes.

---

## Provenance and maintenance

- **Verified:** 2026-07-04, by direct Read of every cited migration, `supabase/tests/rls.test.sql`,
  `supabase/functions/conduit/index.ts`, and `git show f926bd3` / `git show 8fd01ee`. All SQL in
  this file is quoted from the repo as of that date — nothing is invented.
- **This is a reference over living code.** If a policy here ever disagrees with the migrations,
  **the migrations win** — re-verify and update this file.
- **Re-verify commands:**
  - `ls supabase/migrations` — confirm the migration set (this pack reflects up to `20260702060000_api_tokens`).
  - `git show f926bd3` — the INSERT...RETURNING 42501 fix (§3).
  - `git show 8fd01ee` — the 42P17 / SECURITY DEFINER fix (§2).
  - `git log --oneline -- supabase/migrations` — spot any RLS migration newer than `20260701120000` that this pack has not yet absorbed.
