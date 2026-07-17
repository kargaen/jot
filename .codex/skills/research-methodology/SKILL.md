---
name: research-methodology
description: >-
  Load BEFORE claiming a bug is fixed or a hypothesis is true in Jot. Triggers:
  "how do I prove this", "is this the root cause", "how do I know my fix works",
  promoting an experimental change to prod, a fix that resolves the symptom but
  you can't say why, cargo-cult/coincidence worries, setting the evidence bar for
  an RLS/JWT/latency claim. The discipline that turns a hunch into an accepted
  result in this repo — one mechanism must explain ALL observations (including the
  ones that did NOT break), hypotheses predict outcomes before you run, and
  promotion routes through the CI gates, never "looks fixed".
---

# Research methodology: turning a hunch into an accepted result in Jot

This is about **evidence discipline**, not debugging tactics. Debugging finds a
plausible cause; this skill decides whether a cause is *accepted*. In Jot the
richest worked examples are the RLS `42501`/`42P17` saga and the CI `auth.uid()`
NULL / JWT-propagation saga. Every rule below is drawn from what those commits
actually did. Read them: `git show f926bd3`, `git show 8fd01ee`,
`git show 7dea614`, `git show 11817d4`, and the live tools they left behind
(`scripts/rls-ladder.ts`, `scripts/ci-integration-test.ts`,
`scripts/measure-db-latency.ts`, `supabase/tests/rls.test.sql`).

Do not treat "the error went away" as a result. An error going away is the
*weakest* possible evidence — it is equally consistent with a real fix and with
a coincidence that will regress. The bar is higher, and it is concrete.

---

## 1. The evidence bar: one mechanism explains ALL observations

A hypothesis is accepted only when a **single mechanism** accounts for every
observation you have — crucially including the **negative** ones: the things
that did *not* break. A mechanism that explains the failure but is silent about
why neighbouring things kept working is not finished; it is a guess wearing a
lab coat.

The canonical Jot example is the `42501`-on-`INSERT...RETURNING` root cause
(`git show f926bd3`, migration
`supabase/migrations/20260624000000_fix_select_rls_returning.sql`). One
mechanism explained **four** observations at once:

- **Why `INSERT...RETURNING` failed** — "PostgreSQL applies the SELECT policy to
  the row produced by a RETURNING clause." The SELECT policies used
  `can_access_*(id)`, STABLE SECURITY DEFINER helpers that **re-query the same
  table by id**; the just-inserted row "is not visible to the helper's own
  snapshot, so EXISTS(...) returns false and the RETURNING check fails -> 42501."
- **Why a bare `INSERT` (no RETURNING) succeeded** — no SELECT policy is applied
  when there is no returned row to re-check.
- **Why `feedback` was unaffected** — "feedback was unaffected because its SELECT
  policy is literally `true`" (no helper, no re-query).
- **Why it passed WITH CHECK anyway** — "even though the INSERT WITH CHECK was
  satisfied and `auth.uid() = user_id`." The insert *itself* was legal; only the
  read-back re-check failed.

That is the bar. The same mechanism predicts the fix and why it is minimal: add
a direct owner disjunct `user_id = auth.uid()` to each SELECT policy, "evaluated
against the candidate row's own column value (no table re-query)" — so an owner
can always read back a row they just inserted, while shared access still flows
through the `can_access_*` helpers.

**Contrast with a cargo-cult fix.** The tempting non-answers here were: make the
SELECT policy `USING (true)` (silences `42501`, destroys tenant isolation), or
route creation through a SECURITY DEFINER RPC (silences it, hides the real
policy bug, adds a bypass you now have to secure forever). Both make the symptom
vanish. Neither explains why `feedback` was fine or why the bare insert worked.
A fix that silences one observation while leaving the others unexplained has not
earned the word "root cause."

Checklist before you write "root cause" anywhere:

- [ ] List every observation, failing **and** passing (bare insert OK, feedback
      OK, RETURNING fails, WITH CHECK passed).
- [ ] State the single mechanism.
- [ ] Confirm the mechanism predicts each observation's sign (pass/fail) — not
      just the failure.
- [ ] Confirm the fix follows *from the mechanism*, and is the smallest change
      that does (a disjunct on one column, not a policy rewrite).

---

## 2. The hypothesis predicts the outcome BEFORE you run

Write down what you expect to observe — which error **code**, which rows visible,
which identity — *before* you execute the repro. A prediction you record only
after seeing the result is not evidence; it is a story. The value of the tools in
this repo is that they force the prediction to be specific and then contradict it
loudly when you are wrong.

Predict in the units the database actually speaks:

- **Postgres error codes, exactly.** `42501` = insufficient privilege / RLS
  violation. `42P17` = infinite recursion (a policy calling a non-`SECURITY
  DEFINER` helper that re-enters the same policy — see `git show 8fd01ee`). The
  pgTAP suite asserts the code literally: `supabase/tests/rls.test.sql` uses
  `throws_ok(... , '42501', ...)` for the unauthenticated insert and the
  cross-tenant insert, and `lives_ok(...)` for the legal ones. If you predicted
  `42501` and got `42P17`, your hypothesis is *wrong*, not "close."
- **Row identity, not just success.** `scripts/rls-ladder.ts` predicts a precise
  equality: the `create_area` RPC writes `user_id = auth.uid()`, so the returned
  row tells you "what `auth.uid()` actually resolve[s] to in the DB for THIS
  request." If `probedUid !== userId`, the ladder halts and names the layer:
  "the broken layer is JWT verification / request identity (PostgREST), NOT the
  policy or the grants."
- **Latency percentiles, not vibes.** `scripts/measure-db-latency.ts` "[turns]
  'the app feels slow' into p50/p95 numbers per operation." Predict a p95 budget
  before you run `npx tsx scripts/measure-db-latency.ts`; a number you only read
  after the fact cannot fail a prediction.

Reproduce at the **lowest layer that still shows the bug**, and predict there.
The `f926bd3` message records exactly this: "Verified by direct SQL repro: bare
insert OK, INSERT...RETURNING -> 42501." Raw SQL first, then the app. The tooling
ladder from lowest to highest: direct SQL / pgTAP (`supabase/tests/rls.test.sql`,
`npx supabase test db`) → `scripts/rls-ladder.ts` (stops at the first failing
rung) → `scripts/ci-integration-test.ts` (a real signed-in user, the same
`@supabase/supabase-js` client as the app).

---

## 3. The discriminating experiment

When two hypotheses both explain the failure, do not argue about them — design
one experiment whose outcome is **different** under each, and run it. The whole
`auth.uid()`-NULL-in-CI saga is a masterclass in this.

The competing hypotheses were **"the RLS policy is wrong"** vs. **"request
identity is wrong (the JWT never reaches Postgres as this user)."** Both produce
the identical surface symptom: `INSERT ... WITH CHECK (user_id = auth.uid())`
fails. Guessing at the policy would have been endless. Instead the commits built
experiments that *separate* the two:

- **The identity probe** (`git show 312ee03`, now permanent in both
  `rls-ladder.ts` rung 1b and `ci-integration-test.ts`). `create_area` is
  SECURITY DEFINER, so its success proves nothing about table-layer RLS — the
  code says so explicitly. It is used only to **read back the `user_id` the DB
  wrote**, which is literally `auth.uid()` for this request. Outcome that
  discriminates: `dbUid === userId` → identity is fine, look at the policy;
  `dbUid !== userId` → "WITH CHECK ... can never pass no matter what the client
  sends" → it was never a policy bug.
- **The Authorization-header probe** (`git show 4416389`, `git show b566a45`).
  `ci-integration-test.ts` monkey-patches `globalThis.fetch` to log
  "Authorization ends with: ...`<last 12 chars>`" for each PostgREST call, and
  decodes the JWT to print `role`/`sub`. This distinguishes "client attached the
  anon key" from "client attached the user's session token" — a *token
  transport* fault, invisible from the policy layer. The fixes that followed
  (`git show 7dea614` "explicit Authorization header for all DB calls";
  `git show 11817d4` "Pin access token in global headers") were chosen *because*
  the probe localized the fault to transport, not policy.

The rung structure of `scripts/rls-ladder.ts` is discrimination made systematic:
env → sign-in → **identity** → SELECT → INSERT, each rung depending on the last,
"execution stops at the FIRST failing rung, and that rung names the broken
layer." Design your experiments so a single run points at one layer, not a fog.

**Adversarial refutation.** Once you have a mechanism, actively try to break it.
The pgTAP suite is refutation institutionalized: it does not just assert the
happy path — it asserts the cross-tenant insert *throws* `42501`, that a forged
`user_id` throws, that user B's DELETE on A's row is "silently ignored ... RLS
filtered it out," and that shared access works only *after* an accepted invite.
If your mechanism is real, write the test that would fail if it were false, and
watch it pass. Assign someone (or Sonnet) to attack the claim before prod does.

---

## 4. The idea lifecycle in this repo

An idea is not "done" when it works on your machine. It is done when it has
travelled the whole path or been explicitly retired. The path:

1. **Hunch** — "creates fail with `42501`."
2. **Repro at the lowest layer** — direct SQL: bare insert OK,
   `INSERT...RETURNING` → `42501` (`f926bd3`).
3. **Root-cause hypothesis that explains ALL observations** — §1's SELECT-policy
   re-check mechanism, accounting for the passing cases too.
4. **Fix behind the smallest change** — one owner disjunct per SELECT policy in a
   new append-only migration; no policy rewrite, no RPC bypass.
5. **Verify via the relevant CI gate** — `ci-integration-test.ts` exercises the
   exact regression (inbox task with null area + null project; complete;
   project-anchored; SELECT isolation) as a real signed-in user; pgTAP asserts
   the codes. Promotion is *through the gate*.
6. **Document** — in the commit message (the `f926bd3` and `8fd01ee` messages are
   the primary record) and, if the change establishes a convention, in
   `ARCHITECTURE.md` per CLAUDE.md's "Documenting New Conventions." Reference the
   file that owns the truth; do not paste policy SQL into a doc.
7. **Or retire the idea explicitly** — `git show 572e5d6` (Phase 4 perf) does
   exactly this in its own message: "Deferred: multiple_permissive_policies
   consolidation (semantic risk, needs device/session verification) and
   unused-index drops." A deferred idea is named and parked, not silently
   dropped.

Promotion routes through the gates, never through "looks fixed" — this is a
change-control contract, and the pipeline enforces it structurally. `f926bd3`
**reordered** the RC pipeline so `migrate-db` runs **before** `integration-test`
(`needs: migrate-db`), because "Previously migrate-db depended on
integration-test, so this very RLS fix could never deploy while the test it fixes
was failing." The gate order *is* the evidence order: apply schema, then prove it
with a real user. See the **change-control** sibling for the promotion mechanics;
this skill only sets the standard the gate is enforcing.

---

## 5. Where good ideas historically came from

Not from cleverness — from three cheap habits, repeated:

- **Read Postgres error codes precisely.** `42501` and `42P17` are different
  diseases and the fix for one is inert against the other. The recursion bug
  (`8fd01ee`: helpers "without SECURITY DEFINER, so any RLS policy that calls
  them recursively triggers Postgres error 42P17") and the RETURNING bug
  (`f926bd3`, `42501`) look similar from the app and are nothing alike underneath.
  The code is the first fork in the road.
- **Reproduce at the lowest layer.** Raw SQL before the app (`f926bd3`); the
  ladder before the full integration test; the single-client probe before
  theorizing about the framework. Every layer you remove removes a suspect.
- **Pipeline archaeology.** The most consequential fix in the whole saga was not
  SQL at all — it was noticing that the CI *dependency graph* made the fix
  undeployable (`migrate-db` gated behind the failing `integration-test`).
  Sometimes the bug is in the order of the gates. Read `.github/workflows/` as
  carefully as you read the migration.

The JWT saga also shows the *cost* of skipping §3: the fix churned through many
commits (`85d5631` → `df7163f` → `7dea614` → `b566a45` → `11817d4` → `4416389` →
`312ee03` → `de9efa9`) — anon-key vs service-role, raw fetch vs client, header
pinning — precisely because early attempts changed things before a discriminating
experiment had localized the layer. Once the identity/header probes existed, the
fault was named and the fix stuck. Build the probe first; it is cheaper than the
guesses it replaces. (CLAUDE.md's **Rabbit Hole — Iteration Trap** is the same
lesson as a workflow rule: after two failed same-direction fixes, stop and change
the *approach*, i.e. go build the discriminating experiment.)

---

## When NOT to use this skill

- **You have not reproduced anything yet.** Triage the symptom first — see the
  **debugging-playbook** sibling. This skill judges evidence; it does not
  generate the first repro.
- **The change has no runtime surface to observe** (docs, comments, pure
  renames). There is nothing to predict; the `verify` skill's own guidance says
  as much.
- **You just need the analysis recipe or the numbers**, not the standard for
  accepting a claim — use **performance-and-proof-toolkit** for the p50/p95 and
  advisor recipes, **validation-and-qa** for the evidence tooling itself.
- **This is a product-taste or UX judgment**, not an empirical one. No error code
  adjudicates "does capture feel instant"; that is a design call.

Do not use rigor as a stalling tactic either. The bar is "one mechanism explains
all observations," not "run every tool that exists." A `2`-line SQL repro that
predicts the right code can clear the bar; a hundred log lines that predict
nothing cannot.

---

## Sibling skills (cross-reference, do not duplicate)

- **failure-archaeology** — the full chronicle of the RLS and JWT cases,
  commit by commit. Go there for the *story*; this skill teaches the *method*.
- **debugging-playbook** — symptom → triage → first repro. Runs before this skill.
- **performance-and-proof-toolkit** — the p50/p95 and advisor analysis recipes
  (`measure:db`, `get_advisors`). This skill only says *predict a budget first*.
- **change-control** — promotion gates and the RC/release pipeline mechanics.
  This skill sets the evidence standard the gate enforces.
- **validation-and-qa** — the evidence tooling (`ci-integration-test.ts`,
  `rls-ladder.ts`, pgTAP) as instruments. This skill says *what a passing run
  proves*.

---

## Provenance and maintenance

- **Written:** 2026-07-04, against the repo state on that date.
- **Grounding commits (re-verify before trusting):**
  `git show f926bd3` (42501 INSERT...RETURNING root cause + pipeline reorder),
  `git show 8fd01ee` (42P17 recursion / SECURITY DEFINER),
  `git show 312ee03` (identity probe), `git show 4416389` & `git show b566a45`
  (Authorization-header probe), `git show 7dea614` & `git show 11817d4`
  (JWT-propagation fixes), `git show 572e5d6` (perf phase + explicit deferral).
- **Grounding files:** `scripts/rls-ladder.ts`, `scripts/ci-integration-test.ts`,
  `scripts/measure-db-latency.ts`, `supabase/tests/rls.test.sql`,
  `supabase/migrations/20260624000000_fix_select_rls_returning.sql`,
  `.github/workflows/release-candidate.yml`.
- **When the tools move:** if a probe, rung, or gate changes, re-read the file
  and update the quoted line here — a quote that has drifted from the code is
  exactly the cargo-cult this skill warns against. Reference the file by path;
  never copy its truth to live in two places (CLAUDE.md SSOT rule).
