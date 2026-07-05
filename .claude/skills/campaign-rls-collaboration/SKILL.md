---
name: campaign-rls-collaboration
description: WHEN to load — a live RLS/collaboration access bug that you must fix end-to-end without a security regression. Triggers "insert/select fails under sharing", "42501 / 42P17 in collaboration", "new row violates row-level security policy", "area_members access broken", "shared project not visible", "INSERT...RETURNING fails but bare insert works", "auth.uid() is null". A decision-gated procedure from repro → root cause → ranked fix → validated promotion. Load this when debugging-playbook has already pointed at RLS and the fix is non-trivial (a policy/helper/migration change, not a one-line typo). For non-RLS bugs, or to decide whether RLS is even the cause, use debugging-playbook first.
---

# Campaign: Fix an RLS / Collaboration Access Failure (safely)

You are fixing a Row-Level Security bug in Jot's collaboration surface (shared areas /
shared projects) **without breaking read-back, sharing, or isolation**. The failure modes
here have bitten this repo repeatedly (see the RLS saga in `failure-archaeology` and the
theory in `reference-rls-and-postgres`). A wrong fix does not just fail — it can silently
**leak other users' rows**. Treat every step as gated: observe, branch, and do not skip.

**Prime directives (violating any = stop and re-read):**

1. The fix routes **through** RLS, never around it. The ONLY sanctioned RLS bypass in Jot
   is Conduit (`supabase/functions/conduit/index.ts`), and only with explicit `user_id`
   scoping. See `change-control` → Conduit.
2. Migrations are **append-only**. You never edit a shipped migration; you add a newer one.
3. This campaign lands as a database change and MUST pass through `change-control`'s
   migration gate. It is not "done" until measured green (Phase 4), not eyeballed.
4. One migration file, one focused change. Do not refactor unrelated policies in passing.

---

## PHASE 0 — Preconditions (do not start the campaign without these)

**0.1 Bring up the local Supabase stack (schema = all migrations, seeded test data):**

```
npm run db:prepare:e2e
```

This runs `db:start` → `db:reset` → `db:env:e2e` → `db:seed:e2e` (see `package.json`). It
starts the local stack, applies every migration in `supabase/migrations/` in filename
order, writes `.env.e2e.local` from `npx supabase status -o env`, and seeds test data.

- **Gate 0.1:** the command exits 0 and `npx supabase status` lists the API + DB as
  running (DB on `127.0.0.1:54322` per `supabase/config.toml`). If it fails, this is an
  environment problem, not an RLS bug — fix the stack first (see `build-and-env`).

**0.2 Test-user credentials.** The layer-accurate repro scripts sign in as a real user.
Export the four vars the scripts read (verified in `scripts/rls-ladder.ts` and
`scripts/ci-integration-test.ts`):

```
VITE_SUPABASE_URL              # local API URL (from supabase status)
VITE_SUPABASE_PUBLISHABLE_KEY  # local publishable/anon key (from supabase status)
SUPABASE_TEST_USER_NAME        # email of a seeded/confirmed test user
SUPABASE_TEST_USER_PASSWORD    # its password
```

**0.3 Raw SQL console.** You need to run policy-level SQL by hand. Connect psql to the
local DB (Supabase CLI local default credentials):

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

- **Gate 0.3:** `SELECT auth.uid();` returns `NULL` here (psql is the `postgres`
  superuser, not an authenticated end user). That is expected — psql is for **inspecting
  policies/helpers and running role-switched repros** (Phase 1/2), not for reproducing the
  end-user JWT path. The JWT path is reproduced with the ladder script (Phase 1).

---

## PHASE 1 — Reproduce at the lowest layer, then branch

Do **both** a script repro (real JWT stack) and a SQL repro (role-switched), because they
discriminate different root causes.

**1.1 Script repro — the RLS ladder.** Run the dependency-ordered diagnostic; it stops at
the FIRST failing rung and names the broken layer (verified from `scripts/rls-ladder.ts`
header):

```
npx tsx scripts/rls-ladder.ts
```

Rungs, in order: `0` env+client → `1` sign-in + JWT `sub == user.id` → `1b` identity probe
(reads back `create_area`'s row to learn what `auth.uid()` resolves to in the DB) → `2`
authenticated `SELECT` on `areas` → `3` authenticated `INSERT ... RETURNING` on `areas`.

**1.2 SQL repro — separate WITH CHECK from the RETURNING/SELECT re-check.** In psql,
role-switch to an authenticated user and compare a **bare INSERT** against **INSERT ...
RETURNING**. (Pattern mirrors `supabase/tests/rls.test.sql`'s `_as_user`.)

```sql
-- become an authenticated user (use a real seeded user id for :uid)
SELECT set_config('request.jwt.claims',
       json_build_object('sub', :'uid', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- (a) bare INSERT: exercises only INSERT WITH CHECK
INSERT INTO public.areas (user_id, name, color) VALUES (:'uid', 'repro bare', '#111111');

-- (b) INSERT ... RETURNING: ALSO re-checks the SELECT policy on the new row
INSERT INTO public.areas (user_id, name, color) VALUES (:'uid', 'repro ret', '#111111')
  RETURNING id;
```

### GATE 1 — read the observation, take the branch

| Observation | Meaning | Go to |
|---|---|---|
| **(a) bare INSERT succeeds, (b) RETURNING → `42501`** ("new row violates row-level security policy") | The **SELECT policy re-check trap**: RETURNING re-applies the SELECT policy, whose `can_access_*(id)` helper re-queries the table and cannot see the just-inserted row in its snapshot. | **Phase 3A** |
| **Any query → `42P17`** ("infinite recursion detected in policy for relation") | Helper recursion: a `can_access_*` helper is **missing `SECURITY DEFINER`**, so its internal query re-enters the same table's policy. | **Phase 3B** |
| **Ladder halts at rung `1b`**: `auth.uid()` in DB ≠ signed-in `user.id` (or is null) / rung `1` JWT `sub != user.id` | **Request identity is wrong** — the DB never sees you as the test user. `WITH CHECK (user_id = auth.uid())` can never pass. This is a **JWT/client** problem, **NOT an RLS-policy bug**. | **Phase 3C** |
| Bare INSERT AND RETURNING both succeed for the owner, but a **shared member** cannot see/insert | Sharing path (helper logic or membership `status`/`user_id`), not the owner path. | **Phase 2**, then 3A/3B by which check is false |
| Everything passes locally | Not reproduced at this layer. Do not "fix" blind — return to `debugging-playbook`; the bug may be app-layer, data-specific, or prod-only config. | — |

> The discriminating query for **3C vs 3A**: rung `1b` (identity probe). If identity is
> correct (`auth.uid() == user.id`) but RETURNING still 42501s, it is 3A, not 3C. Never
> apply a migration to fix a 3C problem — no policy change can make a null `auth.uid()`
> non-null.

---

## PHASE 2 — Localize: which table, which policy, which helper, which migration

**2.1 Dump the live policies for the suspect table** (psql):

```sql
SELECT policyname, cmd, qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'areas'   -- or projects / tasks / *_members
ORDER BY policyname;
```

**2.2 Dump the helper definitions** (confirm `SECURITY DEFINER` + `STABLE` are present):

```sql
SELECT proname, prosecdef AS is_security_definer, provolatile  -- 's' = STABLE
FROM pg_proc
WHERE proname IN ('can_access_area','can_access_project','can_access_task');
```

`prosecdef = true` and `provolatile = 's'` are what you want. `prosecdef = false` on any
of them explains a `42P17` (→ 3B).

**2.3 Confirm which migration last touched the policy/helper.** Search the migration
history (append-only, filename-ordered):

```
grep -rn "areas_select\|can_access_area\|tasks_select\|tasks_update" supabase/migrations/
```

Known-relevant migrations (verified): `20260427000000_collaboration_mvp.sql` (introduced
the helpers WITHOUT `SECURITY DEFINER` and the `can_access_*(id)` SELECT policies),
`20260428000000_collaboration_fix.sql` (added `SECURITY DEFINER`),
`20260621100000_fix_rls_task_creation.sql` (re-applied DEFINER idempotently + NULL/NULL
insert branch), `20260623000000_fix_tasks_update_rls.sql` (NULL/NULL update branch),
`20260624000000_fix_select_rls_returning.sql` (owner disjunct on SELECT — the 3A fix),
`20260701120000_perf_rls_initplan_and_fk_indexes.sql` (initplan `(select auth.uid())`).

- **Gate 2:** you can now name the exact `(table, policy or helper)` that is false and the
  migration that last defined it. If you cannot, do not proceed to a fix — re-run Phase 1.

---

## PHASE 3 — Solution menu (RANKED). Each fix carries a THEORY OBLIGATION.

**Theory obligation (mandatory before you write a line of SQL):** you must be able to state
*why the chosen fix flips every failing observation to pass AND does not flip any currently
passing negative (isolation) test to fail*. If you cannot explain why user B still cannot
see user A's rows after your change, you are not ready to apply it. The isolation negatives
live in `supabase/tests/rls.test.sql` (tests 5, 6, 10, 12, 16, 21) — your fix must keep
them green.

### 3A — Owner disjunct on the SELECT policy (the `f926bd3` / `20260624` pattern) — PREFERRED for the RETURNING trap

Add a direct owner disjunct to the SELECT policy so read-back is evaluated on the row's own
column, with no table re-query:

```sql
DROP POLICY IF EXISTS "areas_select" ON areas;
CREATE POLICY "areas_select" ON areas
  FOR SELECT USING (user_id = auth.uid() OR can_access_area(id));
```

(Apply to whichever of `areas_select` / `projects_select` / `tasks_select` reproduced.)

**Derivation (why it fixes ALL observations incl. negatives):**
- The RETURNING re-check evaluates the SELECT `USING` against the **candidate row itself**.
  `user_id = auth.uid()` reads the row's own `user_id` column — no snapshot, no re-query —
  so the just-inserted owner row passes immediately. 42501 on RETURNING disappears.
- Sharing is **untouched**: `OR can_access_area(id)` is still evaluated for rows the caller
  does not own, so accepted members still read shared rows (tests 18/20 stay green).
- Isolation is **preserved**: for a row user B neither owns nor is a member of, `user_id =
  auth.uid()` is false AND the helper is false → row filtered out (tests 12/16/21 stay
  green). The disjunct only *adds* the owner's own rows, which they were always entitled to.

This is the exact shape shipped in `20260624000000_fix_select_rls_returning.sql`. If a new
table hits the same trap, mirror it.

### 3B — `SECURITY DEFINER` + `STABLE` on the helper (the `8fd01ee` / `20260428` pattern) — for `42P17`

Re-declare the helper with `SECURITY DEFINER SET search_path = public` (keep `STABLE`):

```sql
CREATE OR REPLACE FUNCTION can_access_area(p_area_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM areas a WHERE a.id = p_area_id AND a.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM area_members am
                  WHERE am.area_id = p_area_id AND am.status = 'accepted'
                    AND am.user_id = auth.uid());
$$;
```

**Derivation (why it breaks the recursion):**
- Without `SECURITY DEFINER`, the helper runs as the calling role, so its internal
  `SELECT ... FROM areas` re-enters `areas`' RLS, whose SELECT policy calls the same
  helper → unbounded re-entry → Postgres aborts with `42P17`.
- `SECURITY DEFINER` runs the body as the function **owner**, which bypasses RLS on the
  internal queries — the recursion cycle is cut. `SET search_path = public` pins the schema
  so the definer context cannot be tricked into resolving a different table.
- Security is not weakened: the helper's own `WHERE ... auth.uid()` still scopes rows to the
  caller; DEFINER only removes the redundant policy re-entry, it does not remove the
  identity check. `STABLE` lets the planner cache it per-statement (correctness-neutral).
- This mirrors the idempotent re-apply in `20260428000000_collaboration_fix.sql` /
  `20260621100000_fix_rls_task_creation.sql`. If recursion recurs, the helper was
  re-created somewhere later WITHOUT the flag — find that migration in Phase 2.3.

### 3C — JWT / client fix (NOT a migration) — for null / wrong `auth.uid()`

If Gate 1 landed here, **do not touch the database.** The fix is in the client/auth wiring
(see the JWT-propagation saga in `failure-archaeology`; app auth in
`src/services/backend/`):
- Use a **single** `@supabase/supabase-js` client for auth *and* data so the in-memory
  session auto-attaches the Bearer token on every PostgREST request (this is exactly what
  `ci-integration-test.ts` does: `const db = authClient`).
- Ensure the `Authorization` header carries the **session** access token (not the bare
  anon/publishable key) on data calls; pin it in global headers if you construct a separate
  client.
- Use the correct keys: publishable/anon key for user CRUD, service-role only inside
  Conduit with explicit scoping.

**Derivation (why `auth.uid()` becomes non-null):** PostgREST derives `auth.uid()` from the
verified JWT `sub` claim on the request. If the request carries only the anon key (or an
expired/absent token), there is no authenticated `sub`, so `auth.uid()` is null and every
`user_id = auth.uid()` check fails. Attaching the live session token makes the DB resolve
the request as the signed-in user — verify with rung `1b` flipping to green.

### 3D — initplan wrap `(select auth.uid())` — perf, apply ALSO when touching a hot policy

When your 3A/3B change lands on a policy evaluated per-row on a hot path, wrap the auth
calls as `(select auth.uid())` / `(select auth.email())` so they evaluate **once per query**
(the `auth_rls_initplan` optimization), matching
`20260701120000_perf_rls_initplan_and_fk_indexes.sql`. It is semantically identical
(same value, evaluated once) — apply it as part of the same policy definition, not as a
separate correctness fix. Do NOT go re-wrap unrelated policies in the same migration.

### FENCED WRONG PATHS — explicitly forbidden (each has caused or would cause a regression)

- **Do NOT set a SELECT policy to `USING (true)`** to make the error go away. That makes the
  table world-readable to every authenticated user — it leaks other users' rows and fails
  the isolation negatives (tests 12/16/21). The RETURNING error is not telling you the
  policy is "too strict"; it is telling you the *re-check* needs an owner disjunct (3A).
- **Do NOT switch the app to the service-role key** to dodge RLS. Only Conduit may use the
  service-role key, and only with explicit `user_id` scoping as its security boundary
  (`change-control` → Conduit). Service-role in the app removes the access boundary
  entirely.
- **Do NOT edit a shipped migration in place.** Migrations are append-only; a past migration
  has already run on prod. Add a NEW timestamped migration that `DROP POLICY IF EXISTS` +
  `CREATE POLICY` (or `CREATE OR REPLACE FUNCTION`) — idempotent, so a partial-deploy RC
  self-heals.
- **Do NOT "fix" by deleting the helper** (or the `OR can_access_*` disjunct) to silence a
  failure without replacing the access check. That removes sharing (accepted members lose
  access, tests 18/20 go red) or removes isolation. Replace the check; never just remove it.

---

## PHASE 4 — Validate & promote (measured, then land through change-control)

Success is **measured against specific expected results**, never eyeballed. Run the ladder
from lowest layer upward; each must show its exact expected output.

**4.1 Re-run the lowest-layer repro — now passes.**

```
npx tsx scripts/rls-ladder.ts
```
- Expected: `✓ rung 0 … ✓ rung 3` and the final line `All rungs passed. The table-layer
  INSERT path is healthy.` (exit 0). If it still halts at a rung, your fix did not address
  the reproduced layer — return to Phase 3, do not patch again blind (`change-control`'s
  iteration limit; a third same-direction attempt is a rabbit hole).

**4.2 Run the pgTAP RLS policy suite** (documented in the file header of
`supabase/tests/rls.test.sql`):

```
npx supabase test db
```
- Expected: the plan of **21** tests all pass, including the sharing positives (17–20) and
  the isolation negatives (5, 6, 10, 12, 16, 21). A green owner path with a red negative
  means your fix leaked access — revert and reconsider (likely you hit a fenced wrong path).

**4.3 Run the full CRUD integration test** (same client/JWT stack as the app; verified
invocation from `release-candidate.yml`):

```
npx tsx scripts/ci-integration-test.ts
```
- Expected final line: `All tests passed.` (exit 0), including `create inbox task (null
  area, null project)`, `complete inbox task`, and `SELECT isolation (cannot see other
  users' tasks)`.

**4.4 Land it — append-only migration through the change-control gate.**
- Add ONE new migration `supabase/migrations/<UTCstamp>_<slug>.sql` (never edit a shipped
  one). Follow `change-control` for classification and the migration gate.
- Deployment order is load-bearing: the RC pipeline runs **`migrate-db` BEFORE
  `integration-test`** (`release-candidate.yml`; the ordering was itself the `f926bd3`
  fix — previously `migrate-db` depended on `integration-test`, so an RLS fix could never
  deploy while the test it fixed was red). Do not reorder those jobs.
- If your change establishes a new convention (e.g. "every SELECT policy carries an owner
  disjunct"), record it by reference in `ARCHITECTURE.md` per `docs-and-writing`, and write
  the commit message documenting root cause + derivation (mirror `f926bd3` / `8fd01ee`).

---

## When NOT to use this campaign

- **The bug is not RLS.** Auth-null at rung 1/1b, a serialization error (PostgrestError is
  not an `Error` instance), a frontend state bug, an NLP/parse bug, a Tauri/native bug →
  start at `debugging-playbook`; it decides the layer. This campaign assumes RLS is already
  confirmed.
- **You are not sure RLS is the cause.** Do the discrimination in `debugging-playbook`
  first; only enter here once Gate 1 lands on 3A or 3B.
- **A pure client/JWT fix (3C).** It is listed here for completeness and to stop you from
  writing a migration, but the actual change is app-layer — no migration, no policy edit.
- **General "how do I land a change" questions** → `change-control`. **RLS/Postgres theory
  questions** (why RETURNING re-checks SELECT, what SECURITY DEFINER does) →
  `reference-rls-and-postgres`. **Broader research/repro discipline** →
  `research-methodology`. **What green looks like / gates** → `validation-and-qa`.

---

## Provenance and maintenance

Verified against the repo on **2026-07-04** by direct Read/Grep/git. Every command, policy,
and expected observation was checked against source; re-verify before trusting if the repo
has moved.

Re-verify commands:
- Policies/helpers/fix shapes: read `supabase/migrations/20260427000000_collaboration_mvp.sql`,
  `20260428000000_collaboration_fix.sql`, `20260621100000_fix_rls_task_creation.sql`,
  `20260623000000_fix_tasks_update_rls.sql`, `20260624000000_fix_select_rls_returning.sql`,
  `20260701120000_perf_rls_initplan_and_fk_indexes.sql`.
- Repro/validation scripts + exact env vars and invocation: `scripts/rls-ladder.ts`,
  `scripts/ci-integration-test.ts`, `supabase/tests/rls.test.sql`.
- Local stack + ports: `package.json` (`db:prepare:e2e`), `supabase/config.toml`.
- CI job order (`migrate-db` before `integration-test`): `.github/workflows/release-candidate.yml`.
- The two canonical fix commits: `git show f926bd3` (SELECT owner disjunct + pipeline
  reorder), `git show 8fd01ee` (SECURITY DEFINER + NULL/NULL insert).
