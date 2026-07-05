---
name: diagnostics-and-tooling
description: MEASURE, don't eyeball. Load when you need a real number or a real pass/fail instead of a guess — "how slow is the DB", "p50/p95 latency", capture feels slow, "how do I see logs", app_logs, log levels, "check RLS access" / "why is INSERT failing", 42501, RLS ladder, "is my signed-in user actually allowed", widget looks stale / widget sync diagnostic, "review a mobile screen without building Android", Button gallery, instrumentation, the timing ring buffer, or before optimizing/claiming anything is fixed.
---

# Diagnostics & tooling — measure, don't eyeball

Jot ships small, purpose-built diagnostics. Each turns a vibe ("it feels slow",
"the widget is stale", "RLS is broken") into a number or a named failing layer.
**Run the tool before you theorize.** A guessed cause wastes more time than a
30-second measurement.

Golden rule: never optimize, never claim a fix, and never write "should be fine"
until you have a reading from the matching tool below.

---

## 1. DB latency — `npm run measure:db`

**Source:** `scripts/measure-db-latency.ts` · **In-app twin:** `src/utils/observability/timing.ts`

**What it measures:** end-to-end latency of the app's real Supabase operations,
using the same `@supabase/supabase-js` client and the same queries the app runs.
It signs in a test user and times each op over N iterations (`MEASURE_ITER`,
default 20), then prints per-op p50 / p95 / max.

**How to run (exact):**
```
npx tsx scripts/measure-db-latency.ts       # or: npm run measure:db
```
Required env (same set the CI integration test uses):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_TEST_USER_NAME`, `SUPABASE_TEST_USER_PASSWORD`.
Optional: `MEASURE_ITER=50` for a tighter distribution.

**How to READ the output** — a fixed-width table, columns `op n p50 p95 max (ms)`:
```
op                  n      p50      p95      max  (ms)
login                5      210      260      280
getSession           1        1        1        1
load                20       90      140      190
ping(1row)          20       40       70       95
create              20       55       90      120
complete            20       50       80      110
delete              20       48       75      100
```
- `load` is the app's four parallel dashboard queries (areas/projects/tags/tasks).
- `ping(1row)` is a single-row round trip — the raw network+RLS floor. If `load`
  is only slightly above `ping(1row)`, the query is fine and latency is just RTT;
  if `load` is many times `ping`, the payload/joins are the cost.
- p95 is the number users feel. Watch the **gap** between p50 and p95: a wide gap
  means inconsistency (cold connections, RLS re-planning), not a uniformly slow op.

**What a BAD number looks like:** `ping(1row)` p50 > ~150ms points at network/region,
not code. A `create`/`complete`/`update` p95 that dwarfs `ping` after the perf
migration (`20260701 perf_rls_initplan_and_fk_indexes`) suggests an RLS policy is
re-querying per row or a covering index is missing — hand off to
`reference-rls-and-postgres` and `performance-and-proof-toolkit`.

**In-app equivalent (on-device, no script):** `time(label, fn)` in
`src/utils/observability/timing.ts` records each wrapped op into a 200-entry
in-memory ring buffer (`RING_MAX = 200`, oldest dropped) plus a `console.debug`.
Already wired around real ops: `load`, `complete`, `edit`, `delete`
(`src/hooks/useMobileApp.ts`), `save` (`src/router/Capture.route.tsx`),
`auth.signIn` / `auth.getSession` (`src/hooks/useAuth.tsx`). Aggregates come from
`getTimingStats()` (sorted by slowest p50). To measure a new op, wrap it in
`time("myLabel", () => ...)` — no network, no deps.

**Latency debug overlay:** Settings screen → **"Latency (debug)"** section
(`LatencyDebugSection` in `src/views/pages/mobile/settings/MobileSettings.view.tsx`).
Reads `getTimingStats()`. **Refresh** re-samples the ring; **Clear** calls
`clearTimings()`. Each row shows `label: p50 …ms · p95 …ms · max …ms · n=…`.
Empty until you exercise the app ("No measurements yet — use the app, then Refresh").
This reads the same ring the app populates live on the device — the way to get
real numbers off an Android build where you can't run the script.

---

## 2. Logging / observability — `logger` + `app_logs`

**Source:** `src/utils/observability/logger.ts` · **Table:** `supabase/migrations/20260621000000_app_logs.sql`

**What it does:** `logger.{debug,info,warn,error}(module, msg, data?)` fans a line
to three sinks:
1. **Browser DevTools** (F12) via `console.*`.
2. **Terminal** — fire-and-forget IPC `invoke("log_to_terminal", …)` to Rust `println`.
3. **Remote** — inserts into Supabase `app_logs`, but **only after**
   `configureRemoteLogging()` has been called. That happens on login
   (`src/hooks/useAuth.tsx`), so anonymous/pre-login logs never reach the table.

**Log levels:** the table and the level RPC use `debug | info | warning | error`
(note: the local API method is `warn`, stored as `warning` — see `toLogLevel`).
Remote transport drops anything below the user's effective floor. The floor is
`get_my_log_level()` (`get_my_log_level` RPC), **default `warning`**; elevate a
single user by inserting into `user_log_overrides`. RC builds force `debug`
client-side without hitting the RPC.

**Where logs go / how to query them:** `app_logs` has **no SELECT policy** — the
INSERT policy only lets an authenticated user write rows tagged with their own
`user_id`. So logs are **write-only from the app and readable only with the
service role** (Supabase dashboard SQL editor, or the Supabase MCP
`execute_sql`). Typical query:
```sql
select created_at, level, version, user_id, message, details
from app_logs
where level in ('warning','error')       -- or user_id = '<uuid>'
order by created_at desc
limit 100;
```
The table self-prunes: a trigger keeps ~the newest 50 000 rows (fires every 100th
insert), so "old" logs disappearing is by design, not data loss.

**What a BAD result looks like:** table empty while the app is clearly running →
either no user is logged in (remote transport not configured) or every message is
below the `warning` floor. To capture `debug`/`info` from a specific user, add a
`user_log_overrides` row for them; don't lower the global default.

---

## 3. RLS verification — the ladder, the SQL suite, and the live probe

Three complementary tools. Pick by the question you're answering. Deep RLS theory
(SECURITY DEFINER, the 42501 INSERT…RETURNING saga, initplan perf) lives in
`reference-rls-and-postgres`; this section is only "which tool, how to run, how to
read it."

### 3a. `scripts/rls-ladder.ts` — "which layer is broken?"

**What it checks:** a strict, dependency-ordered ladder for the classic **42501
INSERT failure on `areas`**. Execution **stops at the first failing rung**, and
that rung names the broken layer. Rungs:
- **0** — env vars present + client constructed.
- **1** — test user signs in → real session; asserts JWT `sub` == `user.id`.
- **1b** — *identity probe*: calls `create_area` (SECURITY DEFINER), reads back the
  row's `user_id` = whatever `auth.uid()` resolved to **in the DB for this
  request**. If that ≠ the signed-in id, the broken layer is **JWT verification /
  request identity (PostgREST)**, not the policy or grants — and it halts here.
- **2** — authenticated `SELECT` on `areas` succeeds.
- **3** — authenticated `INSERT` into `areas` (explicit `user_id`); on failure it
  prints the **full** error object (`code`, `message`, `details`, `hint`).

**How to run (exact — verified from the script header):**
```
npx tsx scripts/rls-ladder.ts
```
Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_TEST_USER_NAME`, `SUPABASE_TEST_USER_PASSWORD` (same four as measure:db).

**How to READ it:** every passing rung prints `✓ rung N …`. On failure you get
`✗ FIRST FAILING RUNG: <rung>` + detail + `Ladder halted.` The rung number is the
diagnosis — fix that layer before rerunning. All rungs passing → the table-layer
INSERT path is healthy (the ladder self-cleans its probe/insert rows).

### 3b. `supabase/tests/rls.test.sql` — "do the policies enforce isolation?"

pgTAP suite (`SELECT plan(21)`): seeds two deterministic users A and B, switches
to the `authenticated` role with each user's JWT `sub`, and asserts INSERT/UPDATE/
DELETE/SELECT succeed on own rows and are denied on the other user's rows.

**How to run (exact — from the file header):**
```
npx supabase test db
```
This is the exhaustive, offline (local DB) proof of cross-user isolation; the
ladder is the fast online "who's broken right now" probe. Green = all 21 policy
assertions hold.

### 3c. `scripts/ci-integration-test.ts` — "does a real signed-in user's full CRUD work?"

**What it does:** signs in the test user and runs the full CRUD cycle against the
real project (create area, inbox task with null area+project, complete, area- and
project-anchored tasks, delete, and a SELECT-isolation check that it cannot see
other users' rows). It intercepts `fetch` to log the exact `Authorization` header
suffix reaching PostgREST, and includes the same identity probe + a bare-insert
(no RETURNING) vs `.select()` split to localize a 42501 to the SELECT-after-insert
policy. This is the live end-to-end RLS+JWT gate the RC pipeline runs.

**How to run (exact — as invoked in `release-candidate.yml`):**
```
npx tsx scripts/ci-integration-test.ts
```
Env: same four vars as above (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_TEST_USER_NAME`,
`SUPABASE_TEST_USER_PASSWORD`).

**How to READ it:** `✓`/`✗` per step; it prints a final `All tests passed.` or
`N test(s) failed:` and **exits non-zero on any failure** (that's what fails CI).
`create area` passing but `create inbox task` failing points at the null-area RLS
regression path specifically. Run order matters historically: migrate-db runs
**before** this test in CI (see the 42501 saga in `reference-rls-and-postgres`).

---

## 4. Widget sync diagnostic — "why is the home-screen widget stale/empty?"

**Source:** `src/services/sync/widgetSync.service.ts` (`syncWidgetsDebug`) ·
Rust: `src-tauri/src/services/widget_sync.rs` (`sync_widget_db` command) ·
local DB: `jot_widget.db`

**What it measures:** Android home-screen widgets read today's + overdue tasks
from a **local** SQLite `jot_widget.db` that the app writes on task mutations /
foreground. If that write silently failed, the widget shows stale/empty data. The
diagnostic runs the sync **synchronously and returns a human-readable result** —
task counts + the DB path Rust wrote to, or the error string.

**How to run (exact):** Settings screen → **"Widget sync (debug)"** section
(`WidgetSyncDebugSection` in `.../settings/MobileSettings.view.tsx`) → tap
**"Run widget sync"**. This is Android-only; on desktop it returns
`not android (os=…)`.

**How to READ the result:**
- Success: `ok: N tasks (today X, overdue Y) → <path to jot_widget.db>`.
- Non-Android: `not android (os=windows)` — expected on desktop; the real sync is a
  no-op off Android by design (`syncWidgets` returns early).
- Failure: `error: <message>` — the Rust `sync_widget_db` invoke threw or a Supabase
  query errored.

**What a BAD result looks like:** `ok: 0 tasks …` while the app clearly has due/
overdue tasks → the payload query (in `buildPayload`) matched nothing: check that
tasks are `status = 'todo'` with `due_date <= today` **or** `scheduled_date = today`
with null `due_date` (the two queries the widget definition unions). A DB path that
looks wrong, or an `error:` string, points at the Rust `widget_sync` side or the
Android DB file, not at the task data. `not android` when you expected a real run
means you're testing on the wrong platform.

Note: both this section and the Latency section are marked `TEMP … Remove once
diagnosed` in the view — they are intentional on-device diagnostics, not shipped
product surface. Treat them as tools, and don't build product features on them.

---

## 5. Visual / UI diagnostics — review mobile screens without an Android build

**Source:** `mobile-harness.html` → `src/test-harness/mobileScreens.tsx`

**What it does:** renders the real mobile views + the `AppShell` frame + the Button
gallery in a desktop browser with mock data, so you can review layout, theming, and
scroll behavior **without building or deploying an APK**. It mounts the actual
screens (`MobileToday/Upcoming/All/Logbook/Capture/Settings`) through a real
`react-router-dom` memory router, so `useMatches` / `handle.title` / NavLink behave
as in production.

**How to run (exact):** start Vite, then open the harness page:
```
npm run dev
# then browse to:  http://localhost:5173/mobile-harness.html
```
**Requires `VITE_SUPABASE_*` present** (at least dummy values in `.env.local`) —
services throw at import if `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`
are missing, so the harness won't mount without them.

**URL params (verified in `mobileScreens.tsx`):**
- `?theme=dark` | `?theme=light` — stamps `data-theme` on `<html>` exactly like the
  app; review both themes.
- `?frame=shell` — full-bleed AppShell at phone size (fixed header + scrolling body
  + fixed nav); combine with `?tab=today|upcoming|all|logbook|capture|settings` to
  pick the screen. `?tab=settings` renders the real Settings (incl. the Latency /
  Widget-sync debug sections above).
- `?frame=shelldata` — context-flow probe (renders `CONTEXT_OK` when Outlet context
  reaches a nested screen).
- `?frame=drill` — project drill-down; dynamic title should resolve to `jot`.
- `?frame=splash` — the splash view.
- `?toast=1` (with `frame=shell`) — overlays a Toast to review it.
- No `frame` → the three side-by-side phone mockups (Tasks / Capture / **Button
  variants × sizes gallery**).

**What a BAD result looks like:** blank page / console throw about missing
`VITE_SUPABASE_*` → your `.env.local` lacks the two required vars. Hardcoded colors
that don't flip between `?theme=dark` and `?theme=light` → a view bypassed the
design tokens in `src/styles/global.css` (fix per `architecture-contract` styling
rules, not with a one-off hex). Screens are mock-data only — they prove layout/
theme/interaction, not real data or RLS (use §1–§4 for those).

---

## When NOT to use this skill

- **You already have the number / a red test.** Don't re-measure to feel busy —
  act on the reading. Go to `performance-and-proof-toolkit` (perf) or
  `reference-rls-and-postgres` (RLS fix).
- **The task is a code change, not a diagnosis.** Instrumentation is for finding
  the target, not for gold-plating. Add one `time()` wrapper if a hot path is
  genuinely unmeasured; don't sprinkle logging across a feature.
- **You need root-cause reasoning, not a reading.** Reproduction steps, bisecting a
  regression, and interpreting a stack trace → `debugging-playbook`.
- **You're gating a release / writing test assertions.** Test strategy, coverage,
  and QA sign-off → `validation-and-qa`. (This skill's `ci-integration-test.ts` and
  `rls.test.sql` are *diagnostics you can also run by hand*; the QA skill owns when
  they must pass.)
- **Deep RLS/Postgres theory or migration authoring.** → `reference-rls-and-postgres`.
- **Product/visual taste judgments.** The harness shows you the screen; whether it's
  *right* is an `architecture-contract` / product-taste call.

Do not add a new diagnostic script or overlay as a "while I'm here" side effect —
that crosses layers and violates the one-file/one-layer contract in `CLAUDE.md`.
Prefer the tools above; extend one only when explicitly asked.

---

## Provenance and maintenance

Verified against the repo on **2026-07-04** by direct Read/Grep of each tool's
source. Every command, env var, flag, and output format below was copied from the
code, not remembered. If you touch any of these files, re-verify and update this
skill in the same change (source-of-truth lives in the code; this doc only points
at it).

Re-verify commands:
```
# latency tool + in-app ring buffer + overlay
sed -n '1,60p' scripts/measure-db-latency.ts
cat src/utils/observability/timing.ts
grep -n "LatencyDebugSection\|getTimingStats\|clearTimings" src/views/pages/mobile/settings/MobileSettings.view.tsx

# logging + app_logs
cat src/utils/observability/logger.ts
cat supabase/migrations/20260621000000_app_logs.sql
grep -n "insertLog\|configureRemoteLogging\|get_my_log_level" src/services/backend/supabase.service.ts src/hooks/useAuth.tsx

# RLS trio (read headers for the exact run commands)
sed -n '1,40p' scripts/rls-ladder.ts
sed -n '1,12p' supabase/tests/rls.test.sql
sed -n '1,25p' scripts/ci-integration-test.ts
grep -n "ci-integration-test\|rls-ladder" .github/workflows/*.yml

# widget sync diagnostic
grep -n "syncWidgetsDebug\|WidgetSyncDebugSection\|sync_widget_db" src/services/sync/widgetSync.service.ts src/views/pages/mobile/settings/MobileSettings.view.tsx

# visual harness
cat mobile-harness.html
grep -n "frame\|theme\|tab\|createMemoryRouter" src/test-harness/mobileScreens.tsx

# npm entry point
grep -n "measure:db" package.json
```
