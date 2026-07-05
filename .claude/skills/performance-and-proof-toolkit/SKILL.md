---
name: performance-and-proof-toolkit
description: >-
  The first-principles ANALYSIS methods for making a performance or correctness
  CLAIM in Jot — "prove it, don't just install it." Load BEFORE optimizing or
  before asserting anything is faster/fixed/correct: "is this actually faster",
  "p50/p95", "measure before and after", "prove the RLS is O(1) not O(n)",
  "EXPLAIN this query", "is my optimistic update correct", "why is this slow",
  "did my index help", deriving a bound instead of guessing, or when a reviewer
  asks "how do you KNOW". Recipes with worked examples from this repo's history;
  every one carries a proof obligation. Sibling of diagnostics-and-tooling (the
  tools), research-methodology (the evidence bar), reference-rls-and-postgres
  (initplan theory), validation-and-qa.
---

# Performance & Proof Toolkit

The house rule: **a number without a baseline is not evidence, and a fix without
a mechanism is not a root cause.** This skill is the set of analysis recipes that
turn "it feels faster" / "I think this fixes it" into a claim you can defend.

Each recipe is: **Method · When to use · Steps · Worked example (real Jot
history) · How you KNOW (the proof obligation).** Where a step needs a live DB or
device this skill cannot reach, it is labelled **RECIPE (cannot run here)** and
gives you the exact command.

This skill is about the *derivation and measurement mechanics*. For the tools
themselves see `diagnostics-and-tooling`; for the general evidence bar and
lowest-layer reproduction discipline see `research-methodology`; for RLS/Postgres
theory see `reference-rls-and-postgres`.

---

## Recipe 1 — Latency measurement: p50/p95, before AND after

**Method.** Never claim "faster" from one sample. Measure a distribution of the
operation against the real dependency, record the baseline, apply the change,
re-measure the same way, and report p50 **and** p95 with n for both.

**When to use.** "The app feels slow", "is this actually faster", "did the index
help", capture latency, any perf claim.

**Steps.**
1. Have the env the script needs (same four as the CI integration test):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_TEST_USER_NAME`,
   `SUPABASE_TEST_USER_PASSWORD`. Optional `MEASURE_ITER` (default 20).
2. Run the **baseline** on the unchanged code: `npm run measure:db`
   (= `tsx scripts/measure-db-latency.ts`). Save the table.
3. It prints a per-op table `op / n / p50 / p95 / max (ms)` for `login`,
   `getSession`, `load` (the app's four parallel queries), `ping(1row)` (isolates
   raw round-trip from payload size), `create`, `complete`, `delete`. See
   `scripts/measure-db-latency.ts`.
4. Apply your change. Re-run. Compare the **same rows** baseline-vs-after.
5. For on-device / in-app latency, read the ring-buffer aggregates instead:
   `getTimingStats()` in `src/utils/observability/timing.ts` returns
   `{label, count, p50, p95, max}` per label from the last `RING_MAX = 200`
   entries; the Latency panel in `src/views/pages/mobile/settings/MobileSettings.view.tsx`
   renders them (Refresh calls `getTimingStats()`, Clear calls `clearTimings()`).
   App ops are wrapped with `time("label", () => …)` (e.g. `time("complete", …)`,
   `time("load.tasks", …)` in `src/hooks/useMobileApp.ts`).

**Worked example (real).** The latency instrumentation was built in three commits:
`2379eaf` "Add latency timing utility (ring buffer + p50/p95 stats)" created
`timing.ts`; `ba3404d` "Instrument DB ops with timing + add Latency debug overlay"
wired `time(...)` into the ops and added the Settings panel; `baf18ce` "Add
measure:db latency script (p50/p95 per op)" created the offline measurement
harness. Note the percentile is a nearest-rank pick, not interpolation —
`percentile(sorted, p) = sorted[floor(p * len)]` (clamped), identical in both
`timing.ts` and the script, so in-app and offline numbers are comparable.

**How you KNOW (proof obligation).** Report **p50 AND p95 with n**, for **before
and after**, for the **same op**, measured the **same way**. A single sample, a
mean without a tail, or an "after" with no "before" does not discharge the
obligation. p95 is mandatory because tail latency is what "feels slow."

---

## Recipe 2 — RLS cost reasoning (auth initplan + FK covering indexes)

**Method.** Derive *why* a policy is O(rows) vs O(1) from how Postgres evaluates
it, then confirm with `EXPLAIN (ANALYZE)`. Two independent wins:
(a) **initplan** — wrapping a `STABLE` auth call as a scalar subquery lets the
planner evaluate it **once per query** (an InitPlan) instead of **once per row**;
(b) **FK covering index** — an unindexed foreign key forces a sequential scan
where an index gives an index scan.

**When to use.** "Prove the RLS is O(1) not O(n)", "why is this list query slow",
before/after adding an index, reviewing an RLS policy for scale.

**The initplan mechanism, precisely.**
- `auth.uid()` is `STABLE` (constant within one statement) but the planner still
  re-invokes it **per candidate row** when it appears bare in a `USING`/`WITH
  CHECK` expression. On a scan of N rows that is N calls.
- Rewritten as `(select auth.uid())`, the planner hoists it into an **InitPlan**
  computed once and reused — O(1) calls per query. It is **semantically
  identical** (the migration header says exactly this). This is the Supabase
  advisor's `auth_rls_initplan` finding.
- FK covering indexes: a policy/join filtering on `tasks.area_id` or
  `area_members.user_id` with no index on that column scans the whole table. The
  matching index turns that into an index scan.

**Steps.**
1. Get the plan **before** (RECIPE — needs a live DB / `mcp__supabase__execute_sql`):
   ```sql
   EXPLAIN (ANALYZE, BUFFERS)
   SELECT * FROM tasks WHERE status = 'todo' ORDER BY sort_order;
   ```
   Run it as the authenticated role so RLS policies actually apply (e.g. via the
   PostgREST path the app uses, or `SET LOCAL role authenticated` + the request
   JWT GUCs). Look for `Seq Scan` and a per-row `Filter` invoking `auth.uid()`.
2. Apply the rewrite / index (in a new append-only migration; never edit a
   shipped one).
3. Re-run the same `EXPLAIN (ANALYZE)`. Confirm the auth call moved to an
   `InitPlan` line and/or `Seq Scan` became `Index Scan`, and actual rows/time
   dropped.

**Worked example (real).** Migration
`supabase/migrations/20260701120000_perf_rls_initplan_and_fk_indexes.sql`
(commit `572e5d6` "Phase 4: RLS auth-initplan wrap + FK covering indexes") does
both. Its header states the intent: *"wrap auth.<fn>() in RLS policies so they
evaluate once per query (auth_rls_initplan), + covering indexes for unindexed
FKs. auth.uid()/auth.email() -> (select ...) is semantically identical."* It adds
`create index if not exists tasks_area_id_idx on public.tasks (area_id)` and
`area_members_user_id_idx on public.area_members (user_id)`, then `alter policy`
on every policy to replace bare `auth.uid()`/`auth.email()` with
`(select auth.uid())`/`(select auth.email())` — e.g. `tasks_select` becomes
`using (((user_id = (select auth.uid())) OR can_access_task(id)))`. Note the
`can_access_*(id)` helpers remain: the initplan win is on the direct-owner
disjunct; the helper cost is a separate axis (see `reference-rls-and-postgres`).

**How you KNOW (proof obligation).** Either produce `EXPLAIN (ANALYZE)` before/after
showing the InitPlan hoist and/or Seq→Index change with lower actual time, **or**
cite the initplan mechanism precisely (per-row vs once-per-query evaluation of a
STABLE function) — not just "we wrapped it in a select." Asserting O(1) without
one of these is a guess.

---

## Recipe 3 — Optimistic-mutation correctness (the state machine)

**Method.** Model an optimistic mutation as a three-state machine —
**apply-locally → await server → {commit | revert}** — and enumerate the failure
interleavings. Prove each interleaving either commits or restores the exact prior
state, with **no lost write** and **no clobbered concurrent mutation**.

**When to use.** "Is my optimistic update correct", adding instant-feedback UI,
rapid-tap / burst mutation bugs, "did I lose a write."

**Steps (the proof procedure).**
1. Identify the local apply and what state it captures for rollback.
2. Identify the reconcile-on-failure path — is it *per-item* or a *full reload*?
   A full reload during other in-flight mutations clobbers them.
3. Enumerate interleavings: single success, single failure, two overlapping
   mutations where one fails, a burst of N.
4. For each, show the end state equals either the committed value or the precise
   prior value, and that side-effects (widget sync) fire once, not per-item.

**Worked example (real).** Commit `c37da0a` "Phase 2: optimistic mutations (drop
blocking full refetch)" replaced the blocking 4-query `refresh()` with immediate
local updates in `src/hooks/useMobileApp.ts`. Its rationale is the correctness
argument itself: *"No task write has server side-effects (only trigger is
updated_at), so local state is authoritative."* That premise is what *licenses*
optimism — verify it before copying the pattern to a write that DOES have server
side-effects.

Commit `1987cfa` "Harden rapid mutations: per-item revert + coalesced widget
sync" fixed the concurrency hole. Two mechanisms, both in `useMobileApp.ts`:
- **Per-item revert.** `markComplete` snapshots nothing global; on failure it
  reverts *only that id*: `setTasks((prev) => prev.map((t) => (t.id === id ? {
  ...t, status: "todo", completed_at: null } : t)))`. `editTask` captures
  `const prior = tasks.find(t => t.id === id)` and on failure restores exactly
  that row; `removeTask` captures `removed` and re-inserts only if absent. The
  commit body: *"revert only that task instead of reloading the whole list (which
  could clobber other in-flight optimistic completes during rapid taps)."*
- **Coalesced widget sync (debounce).** `scheduleSync()` uses a trailing 400ms
  timer — `if (syncTimer.current) clearTimeout(...); syncTimer.current =
  setTimeout(() => { void syncWidgets(); }, 400)` — so a burst of mutations fires
  **one** trailing `syncWidgets()`.

Interleaving check, worked: tap A then B, A's server call fails. A's failure
reverts only A (row-level `map` on `id === A`); B's optimistic state is a
different id and is untouched → B is not clobbered. Both scheduled syncs collapse
to one trailing call. Prior state for A is restored exactly (`todo`,
`completed_at: null`). No lost write. That is the obligation discharged.

**How you KNOW (proof obligation).** Enumerate the failure interleavings and show
each is handled: revert restores the prior state *for that item only*, concurrent
optimistic updates survive, and no write is lost. A blanket "reload everything on
error" fails this obligation the moment two mutations overlap — which is exactly
the bug `1987cfa` closed. `archiveProject` still uses a full `await refresh()` on
failure; that is safe only because projects aren't mutated in rapid bursts —
document that assumption if you extend it.

---

## Recipe 4 — Lowest-layer reproduction as proof

**Method.** Prove a claim at the lowest layer that can carry it, then move up.
Raw SQL / `EXPLAIN` before the app; a unit test before an e2e. The lower the
layer, the fewer confounds, so the stronger the evidence.

**When to use.** Before blaming (or crediting) the app for something that might be
a DB, RLS, or query-planner fact; before an e2e when a unit test would isolate it.

**Steps.**
1. Ask: what is the smallest surface that reproduces this? A `select` in
   `mcp__supabase__execute_sql` or the RLS ladder proves an RLS fact without React
   in the way. `scripts/rls-ladder.ts` and `scripts/ci-integration-test.ts` are
   the SQL/CRUD-level probes.
2. Reproduce there first. If it reproduces, the app is not the cause.
3. Only then reproduce up the stack (unit → controller → e2e/Playwright).

**Worked example (real).** The perf work follows this shape: RLS cost is proven at
the SQL layer (`EXPLAIN`, Recipe 2 / migration `20260701...`), latency at the
supabase-js layer offline (`measure:db`, Recipe 1) — *before* attributing feel to
the UI. The measurement harness deliberately isolates layers: `ping(1row)`
separates raw round-trip from `load` payload size (`measure-db-latency.ts`).

**How you KNOW (proof obligation).** State which layer carries the proof and why
it is the lowest one that can. This overlaps `research-methodology`'s evidence
bar — go there for the general reproduction discipline; here the point is that
*measurement/derivation belongs as low as possible.*

---

## Recipe 5 — The general proof obligation

Every perf or correctness claim must state three things. If any is missing, it is
not yet a claim — it is a guess.

1. **What was measured or derived** — the concrete quantity (p50/p95 with n, an
   `EXPLAIN` plan, an enumerated state-machine proof).
2. **The baseline** — the before-number or the prior state. A number with no
   baseline is not evidence.
3. **The mechanism** — *why* the result holds (once-per-query initplan, index scan
   vs seq scan, per-item revert). A fix with no mechanism is not a root cause; it
   may be coincidence or a masked symptom.

Worked contrast from this repo: "we wrapped auth in a select and it's O(1)" fails
(2) and (3) until you show the before/after `EXPLAIN` **or** cite per-row vs
once-per-query evaluation. "Optimistic completes feel instant" fails (1) and (3)
until you show p50/p95 from `measure:db`/`getTimingStats()` **and** the
side-effect-free premise that licenses optimism (`c37da0a`).

---

## When NOT to use this

- **Trivially correct, non-measurable one-liners** (a copy tweak, a token swap) —
  there is no perf/correctness claim to discharge. Don't manufacture a benchmark.
- **You just need a tool, not a claim** — to *find* a number or run a probe, go to
  `diagnostics-and-tooling`. Come here when you must *defend* the number.
- **The question is theory, not a claim about this change** — for RLS/Postgres
  mechanics in the abstract use `reference-rls-and-postgres`; for the general
  evidence bar use `research-methodology`.
- **No live DB / device available** — you can still discharge Recipe 2 by citing
  the mechanism, and Recipe 3 by enumerating interleavings on the code, but do not
  *claim measured numbers* you didn't measure. Label derived-vs-measured honestly.
- **Micro-optimizing before there is a baseline** — measure first (Recipe 1). An
  optimization with no before-number cannot be shown to help.

---

## Provenance and maintenance

Authored 2026-07-04 against verified repo state. Worked examples trace to real
commits and files; **no invented numbers** — every quantity here is described as
*how to obtain it*, never asserted.

Re-verify before trusting:
- Commits: `git show -s --format='%h %s' 2379eaf ba3404d baf18ce 572e5d6 c37da0a 1987cfa`
- Files: `scripts/measure-db-latency.ts`, `src/utils/observability/timing.ts`
  (ring buffer + `getTimingStats` p50/p95), `src/hooks/useMobileApp.ts`
  (`scheduleSync`, `markComplete`/`editTask`/`removeTask` reverts),
  `src/views/pages/mobile/settings/MobileSettings.view.tsx` (Latency panel).
- Migration: `supabase/migrations/20260701120000_perf_rls_initplan_and_fk_indexes.sql`
- Script wiring: `grep -n measure:db package.json`
- Live-DB recipes (Recipe 2 `EXPLAIN`) are RECIPE-only here; run against a real
  Supabase project via `mcp__supabase__execute_sql` or `supabase db` as the
  authenticated role.

Siblings: `diagnostics-and-tooling` (the tools), `research-methodology` (evidence
bar + reproduction), `reference-rls-and-postgres` (initplan/policy theory),
`validation-and-qa` (test layers). Reference them; do not duplicate.
