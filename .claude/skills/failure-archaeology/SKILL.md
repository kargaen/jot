---
name: failure-archaeology
description: >-
  The Chronicle of settled battles in Jot — every major investigation, dead end, rejected fix, and
  revert, so no one re-fights a war that is already won. LOAD THIS BEFORE investigating a bug that
  smells familiar, or before attempting any fix in the RLS, auth/JWT, CI pipeline, Android/native,
  widget, or capture/NLP areas. Triggers: "has this been seen before", "why was this done this way",
  "why is this policy shaped like that", "don't re-fight", "was this fix already tried", checking
  whether a fix was tried and rejected, understanding a past revert, a 42P17/42501 RLS error, an
  auth.uid() null in CI, "App not installed" on Android, hardware-back closing the app, a widget
  launch landing on the wrong screen, tap-through/ghost-click on mobile, #project capture dropping a
  tag, or a Tauri RC build failing on version mismatch.
---

# Failure Archaeology — The Jot Chronicle

Every entry below traces to a real commit on this repo. If a symptom here matches what you are
seeing, **stop and read the entry before you touch anything** — the fix (or the reason a tempting
fix was rejected) is already recorded. Re-deriving it costs days and risks reverting a hard-won
correction.

Each entry: **Symptom → Root cause → Evidence → Fix/Status → Do-not-repeat.**

Siblings (do not duplicate their content):
- **reference-rls-and-postgres** — the *theory* of why RLS behaves this way (SECURITY DEFINER,
  policy re-checks, initplan). This file is the *history*; that file is the *mechanism*.
- **research-methodology** — the evidence discipline (direct SQL repro, probes) that produced the
  proofs cited here.
- **debugging-playbook** — live triage of a *new* incident. Come here first to check it isn't an
  old one; go there when it's genuinely new.

---

## Area 1 — RLS (Row-Level Security)

### 1.1 `42P17` infinite recursion in area/project/task policies
- **Symptom:** Any query touching `areas`/`projects`/`tasks` errors with Postgres `42P17`
  (infinite recursion detected in policy for relation ...).
- **Root cause:** The collaboration MVP migration (`20260427000000_collaboration_mvp.sql`) added
  `can_access_area` / `can_access_project` / `can_access_task` helpers **without SECURITY DEFINER**.
  A policy that calls a non-DEFINER helper re-enters the same policy on the table the helper queries
  → recursion.
- **Evidence:** `20260428000000_collaboration_fix.sql` first patched it; commit **8fd01ee** re-applies
  `SECURITY DEFINER` on all three helpers idempotently because a partial-deployment RC could still be
  missing the 0428 patch. See the 8fd01ee message.
- **Fix/Status:** SETTLED. Helpers are `STABLE SECURITY DEFINER`. The re-apply is idempotent by design.
- **Do-not-repeat:** Never add or rewrite an access helper that a policy calls without
  `SECURITY DEFINER`. If you write a new `can_access_*`, it must be `SECURITY DEFINER`. Do not
  "simplify" by inlining the helper's subquery into the policy either — that reintroduces the recursion.

### 1.2 `42501` on `INSERT ... RETURNING` (but bare INSERT is fine)
- **Symptom:** Creating a task/area/project fails with `42501` (new row violates RLS / permission
  denied) **only when the insert has a RETURNING clause** — which the app always does to read the row
  back. A bare `INSERT` with no RETURNING succeeds. `INSERT ... WITH CHECK` passes and
  `auth.uid() = user_id` is true, yet it still fails.
- **Root cause:** Postgres applies the **SELECT** policy to the rows produced by RETURNING. The SELECT
  policies used `can_access_*(id)` — STABLE SECURITY DEFINER helpers that **re-query the same table by
  id**. During `INSERT ... RETURNING` the just-inserted row is not yet visible in the helper's snapshot
  → the SELECT check returns false → 42501. `feedback` (SELECT policy = `true`) was unaffected, which is
  why only some tables broke.
- **Evidence:** Commit **f926bd3**, proven by a direct SQL repro (bare insert OK, `INSERT...RETURNING`
  → 42501). Fix landed in `20260624000000_fix_select_rls_returning.sql`.
- **Fix/Status:** SETTLED. Each SELECT policy gained a **direct owner disjunct**
  `user_id = auth.uid()`, evaluated on the row's own column with **no table re-query**, so a
  just-inserted owned row reads back. Shared access via the helpers is preserved as the other disjunct.
- **Do-not-repeat:** Do NOT remove the `user_id = auth.uid()` disjunct from a SELECT policy thinking the
  `can_access_*` helper "already covers it" — it does not cover the RETURNING snapshot case. Do NOT try
  to fix this by dropping RETURNING from the app inserts; the policy is the correct layer.
- **Pipeline corollary (same commit):** f926bd3 also reordered the RC workflow so **migrate-db runs
  BEFORE integration-test**. Previously `migrate-db` depended on `integration-test`, so this very RLS
  fix could never deploy while the test it fixed was red — a deadlock. Do not reintroduce that
  dependency direction (see Area 2).

### 1.3 The "Revert Merge fix/rls-task-creation" — what was reverted and why
- **Symptom:** The RLS task-creation fix appeared to be reverted on master shortly after merging.
- **Root cause:** The migration file from **8fd01ee** was created at timestamp
  `20260621000000_fix_rls_task_creation.sql`, **colliding with `20260621000000_app_logs.sql`** already
  present on dev/master. The merge (`7c34725`) caused a duplicate-key error in
  `supabase_migrations.schema_migrations` on every RC build.
- **Evidence:** Commit **9b54ec8** ("Revert Merge fix/rls-task-creation into master", reverses 7c34725).
  Then **7acd9fd** renamed the file `20260621000000 → 20260621100000` to break the collision. Both files
  now coexist in `supabase/migrations/`.
- **Fix/Status:** SETTLED. The RLS logic was **not** the problem — the *timestamp* was. The content
  survives as `20260621100000_fix_rls_task_creation.sql`.
- **Do-not-repeat:** The revert was NOT a rejection of the RLS change. Do not "restore" it differently or
  assume the logic was bad. Migrations are append-only with **unique** timestamps — before adding one,
  `ls supabase/migrations/` and pick a timestamp no existing file uses (collisions surface only in CI).

### 1.4 RLS auth-initplan performance (`auth_rls_initplan`)
- **Symptom:** Supabase advisor flags `auth_rls_initplan`: `auth.uid()`/`auth.email()` re-evaluated per
  row instead of once per query on large scans.
- **Root cause:** Bare `auth.uid()` in a policy is treated as volatile-per-row.
- **Evidence:** Commit **572e5d6** (`20260701120000_perf_rls_initplan_and_fk_indexes.sql`) wraps them as
  `(select auth.uid())` across 23 policies (semantically identical) and adds covering indexes
  `tasks_area_id_idx`, `area_members_user_id_idx`.
- **Fix/Status:** SETTLED for initplan + FK indexes. **Explicitly deferred:**
  `multiple_permissive_policies` consolidation (semantic risk, needs device/session verification) and
  unused-index drops. See the 572e5d6 message.
- **Do-not-repeat:** Any *new* policy must use `(select auth.uid())`, not bare `auth.uid()`. Do NOT take
  on the deferred multiple-permissive-policies consolidation as a drive-by — it was consciously left
  because merging permissive policies can change access semantics.

*(Also present: `20260623000000_fix_tasks_update_rls.sql` — a tasks UPDATE-policy fix from the same era;
if an UPDATE denial appears, read that migration before editing the update policy.)*

---

## Area 2 — CI auth / JWT propagation (`auth.uid()` null in CI)

This was a long, multi-commit hunt. The whole chain is recorded so nobody restarts it. The scripts live
at `scripts/ci-integration-test.ts` (earlier `.mjs`).

### 2.1 `auth.uid()` is NULL inside the CI integration test
- **Symptom:** The CI CRUD/RLS integration test fails because `auth.uid()` evaluates to NULL server-side,
  so every RLS check denies — even though the same code path works in the real app.
- **Root cause (final):** The test used **separate** Supabase clients for auth and for data, so the
  signed-in session token was not attached to the data client's requests. The JS client's internal auth
  propagation also behaves differently in Node vs browser.
- **Evidence / the chain (in order of discovery):**
  - **df7163f** — use the **service-role key only for user lifecycle** (admin create/delete to bypass
    email confirmation); do **all CRUD with the anon key + the user's live JWT**, i.e. the app's exact path.
  - **7dea614** — set the JWT **explicitly in the global `Authorization` header** for all DB calls
    (Node-vs-browser propagation difference).
  - **11817d4** — **pin the access token** in global headers right after sign-in.
  - **6f1239c** — fix error serialization: **`PostgrestError` is not an `Error` instance**, so failures
    logged as `{}` and hid the real cause. Serialize the fields explicitly.
  - **358d810** — the resolution: **use a single Supabase client for auth + data** so the session token
    auto-attaches. This supersedes the manual header-pinning workarounds above.
  - Diagnostic-only commits (safe to ignore except as breadcrumbs): 097a958, 4416389, 6b36d36, ef69603,
    312ee03, de9efa9, ac9bf29.
- **Fix/Status:** SETTLED at **358d810**. The intermediate header-pinning commits were *steps*, not the
  final answer.
- **Do-not-repeat:** Keep **one** client for auth and data in the CI test. Do not re-split them. Use the
  service-role key *only* for user create/delete; never for CRUD (CRUD must mirror the app = anon key +
  JWT, so it actually exercises RLS). When a DB error logs as `{}`, remember PostgrestError isn't an Error.

### 2.2 Pipeline ordering deadlock
- **Symptom:** An RLS/auth fix can't ship because the test that gates the migrate step is the very test
  the migration fixes.
- **Root cause:** `migrate-db` depended on `integration-test`.
- **Evidence:** Reordered in **f926bd3** so **migrate-db runs before integration-test** in
  `release-candidate.yml`.
- **Do-not-repeat:** Migrations must deploy *before* the integration test runs against them. Never make
  migrate-db depend on integration-test again.

### 2.3 CI test polluting the world-readable `feedback` table
- **Symptom:** Diagnostic rows ("rls direct-insert probe", "rls explicit-user probe") appeared in every
  user's in-app feedback list.
- **Root cause:** The CI test inserted probe rows into `feedback` (SELECT policy = `true`, so
  world-readable) and its cleanup deletes were blocked by feedback's **missing DELETE policy**, so probes
  accumulated.
- **Evidence:** Commit **1ff971b** removed the leftover probes; the `feedback` table was later dropped
  entirely (see 5.2).
- **Do-not-repeat:** Never write CI diagnostics into a product table. If you need probes, use a throwaway
  row you can actually delete, or assert without persisting.

---

## Area 3 — Android / native shell

### 3.1 Hardware Back button closed the whole app — the full saga (one rejected fix)
- **Symptom:** Pressing Android hardware Back exited Jot instead of unwinding in-app navigation.
- **Root cause:** The native Back press never reached JS, so the router/webview could not handle it.
- **Evidence / evolution:**
  - **b7dedbb** (Fix #1) — first attempt: a `history.pushState` + `popstate` handler inside the
    then-monolithic `MobileApp.view.tsx` unwound menu/detail/tab one step per press. (Superseded when the
    app moved to react-router.)
  - **7b664de** — native `OnBackPressedCallback` forwards Back to `window.history.back()` in the WebView,
    else backgrounds the app. This is the real plumbing that made JS-side handling possible.
  - **13957a6** — added **press-again-to-exit** at the router root (Toast + second press within 2s).
    **This was REJECTED.**
  - **28a4242** — **reverses the double-tap**: single-press at root backgrounds the app in one press
    (`moveTaskToBack`), and uses React Router's `history.state.idx` (reliable regardless of launch
    source, incl. widget) instead of the unreliable `history.length`.
- **Fix/Status:** SETTLED at **28a4242**: single-press exit, `history.state.idx`-based root detection.
- **Do-not-repeat:** Do NOT re-add double-tap / press-again-to-exit — it was tried (13957a6) and
  removed for the current Android convention (single press backgrounds at root). Do NOT switch root
  detection back to `history.length` — it's unreliable when launched from a widget.

### 3.2 Content sliding under the status bar / gesture nav (safe-area insets no-op)
- **Symptom:** Mobile content rendered under the Android status bar / gesture nav; existing
  `env(safe-area-inset-*)` padding had no effect.
- **Root cause:** The viewport meta lacked `viewport-fit=cover`, so `env(safe-area-inset-*)` always
  resolved to `0`.
- **Evidence:** Commit **f3db3de** added `viewport-fit=cover` to `index.html` and inset padding to the
  full-screen `MobileTaskDetail` header/scroll (the tabbed shell already had inset-aware padding, which
  then took effect).
- **Fix/Status:** SETTLED.
- **Do-not-repeat:** If insets read as 0, the cause is almost always missing `viewport-fit=cover`, not the
  padding math. Don't hardcode pixel offsets for the status bar.

### 3.3 Tap-through / ghost-click when opening a task (two complementary layers)
- **Symptom:** Tapping a task row to open it also "clicked through" onto whatever control mounted under
  the finger in the freshly opened detail/sheet — an accidental double action.
- **Root cause:** After a tap, the browser fires a **synthesized compatibility mouse click** at the same
  point. Opening the detail re-renders the row away, so that ghost click lands on a newly mounted control.
- **Evidence / two layers (both needed):**
  - **b2751ab** — `MobileTaskRow` calls `e.preventDefault()` on the tap's `touchend` to cancel the
    compatibility click.
  - **a120c62** (Fix #4) — the sheet card sets `pointer-events: none` for ~350ms after it opens, so the
    opening tap can't activate anything underneath.
- **Fix/Status:** SETTLED (two-layer defense).
- **Do-not-repeat:** Don't remove either layer thinking the other suffices — they cover different moments
  (cancel the ghost click vs. deafen the newly mounted target). This is a known WebView tap quirk, not a
  React event bug.

### 3.4 Task-title tap not opening the editor **on device** (but fine in browser)
- **Symptom:** In the "only the title opens edit" row, tapping the title did nothing on a real device; the
  checkmark still worked (separate `onClick`).
- **Root cause:** The tap handler trusted the **`touchstart`-captured target**, which does not resolve
  correctly on-device WebViews.
- **Evidence:** Commit **53af81f** re-resolves the tapped element at **release** via
  `document.elementFromPoint(releaseTouch.clientX, releaseTouch.clientY)` and drops the captured
  `tapTarget` ref in `MobileTaskRow.view.tsx`.
- **Fix/Status:** SETTLED.
- **Do-not-repeat:** For tap hit-testing in the WebView, resolve the element from the **release
  coordinates**, not the captured `touchstart` target. Don't debug this in a desktop browser — it
  reproduces only on-device.

### 3.5 "App not installed" — Android signature mismatch
- **Symptom:** Installing/updating an RC APK fails with "App not installed"; existing installs refuse to
  update.
- **Root cause:** RC APKs were signed with an **ephemeral debug key regenerated on every CI run**, so
  each build had a different signature — Android refuses to update across differing signatures.
- **Evidence:** Commit **505c915** — sign release builds with a **persistent keystore from repo secrets**
  (`ANDROID_KEYSTORE_B64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS`, written to
  `keystore.jks` + `key.properties`) and **bump `versionCode` per run** (`1000002 + github.run_number`)
  so updates always install. Commit **4421875** added a fail-fast **"Verify release keystore"** CI step
  (`keytool -list`) so a truncated/mistyped `ANDROID_KEYSTORE_B64` surfaces immediately instead of a
  cryptic Gradle error 5+ minutes into the build.
- **Fix/Status:** SETTLED. Keystore lives ONLY in GitHub secrets; local builds fall back to the debug key
  when `key.properties` is absent.
- **Do-not-repeat:** Never let CI generate a fresh signing key per run. The keystore must stay identical
  across all RCs. `versionCode` must be strictly increasing. If devices still show a mismatch after a key
  change, every device must uninstall + reinstall once (unavoidable when the signing identity changes).

### 3.6 Widget launch landing on the wrong screen (cold-start race)
- **Symptom:** Launching from the home-screen widget's Capture action intermittently stuck on the Today
  screen instead of opening Capture.
- **Root cause:** Cold start redirected to `/today` first, then `AppLayout` async-navigated to
  `/capture` — a race that sometimes lost.
- **Evidence:** Commit **208ba6c** added `src/router/Index.route.tsx`, a **deterministic index resolver**
  that consumes the pending launch action at `/` (via `invoke("take_mobile_launch_action")`) and
  redirects straight to `/capture | /all | /today` before any other navigation. Warm-start launches are
  still handled by `AppLayout`'s visibility effect.
- **Fix/Status:** SETTLED.
- **Do-not-repeat:** Don't resolve the widget launch action *after* an initial redirect — consume it once,
  at the index, before redirecting. Two navigations racing = flaky landing.

---

## Area 4 — Capture / NLP

### 4.1 `#project` capture dropped when the input contains a period
- **Symptom:** Input like `fix bug #Jot.` failed to capture the `#Jot` project; the tag was left in the
  title or ignored.
- **Root cause:** The `#project` regex could only terminate on whitespace-then-metadata or end-of-string.
  A period immediately after the tag left the lazy match with **no valid terminator**, so the project
  wasn't captured.
- **Evidence:** Commit **b3d7bd3** (Fix #9) — adds `\s*[.,;:!?]` as a valid terminator to the `parseProject`
  regex and strips spaces before punctuation in the cleaned title (`.replace(/\s+([.,;:!?])/g, "$1")`) in
  `src/services/capture/nlp.service.ts`. Regression tests added to `tests/unit/services/nlp.test.ts`
  (`fix bug #Jot.`, `#Jot fix the bug.`, `Call John. #Jot`). Note: `nlp.test.ts` is a *report*, not a
  gate (it never exits non-zero) — a NEW gating regression case belongs in `nlp-natural.test.ts`; see
  `validation-and-qa`'s gating-asymmetry note.
  - **Note:** **a3fbdc5** is the *identical* commit on the feature branch (`claude/jot-task-fixes-03xpbx`);
    **b3d7bd3** is the copy that landed on `dev`. Same content — not two separate fixes.
- **Fix/Status:** SETTLED.
- **Do-not-repeat:** When editing the `#project` regex, keep punctuation in the terminator lookahead, and
  keep the regression cases. Don't reintroduce a whitespace-only terminator.

### 4.2 Automatic icon derivation from titles surfaced as stray words
- **Symptom:** A Lucide keyword auto-derived from a task title leaked into the task list as a stray word
  (in stale builds).
- **Root cause:** Tasks auto-derived an icon keyword from the title at creation and re-derived it on title
  edits; the raw keyword could render as text.
- **Evidence:** Commit **b19b7fd** (Fix #5) removed the feature at its source: `saveCreateTask.controller.ts`
  passes `null` instead of `suggestIcon(...)`, `useTaskDetail.ts` stops re-deriving on edit, and the
  keyword map was deleted.
- **Fix/Status:** SETTLED — auto-derivation was **removed on purpose**, not disabled temporarily.
- **Do-not-repeat:** Do not re-add title→icon auto-derivation. Icons are set explicitly on `task.icon`; the
  presentation pipeline (`utils/presentation/icons.ts` → `useTaskDetail` → `TaskIcon.view.tsx`) renders the
  Lucide component, never the name as text (see ARCHITECTURE Key Conventions).

---

## Area 5 — Build / release

### 5.1 RC build broken by Tauri `@tauri-apps/api` vs Rust crate version drift
- **Symptom:** The RC build fails with a Tauri version-mismatch error.
- **Root cause:** Installing `@tauri-apps/plugin-opener` floated `@tauri-apps/api` up to **2.11.1** while the
  Rust `tauri` crate is **2.10.3**; Tauri's build rejects the JS/Rust API mismatch.
- **Evidence:** Commit **06fe17e** pinned `@tauri-apps/api` to **`~2.10.0`** in `package.json` /
  `package-lock.json` (resolves 2.10.1); `tauri-plugin-opener` 2.5.4 resolves compatibly against tauri
  2.10.3, so no Rust bump was needed.
- **Fix/Status:** SETTLED via pin.
- **Do-not-repeat:** Keep `@tauri-apps/api` pinned to the Rust `tauri` crate's minor (`~2.10.0`). Adding a
  Tauri plugin can silently float `@tauri-apps/api` up — after adding any `@tauri-apps/*` dep, verify the
  JS `api` version still matches the Rust crate before assuming the RC will build.

### 5.2 CI integration test polluted `feedback`; the table was then dropped
- **Symptom:** (See 2.3.) Diagnostic probe rows accumulated in the world-readable `feedback` table.
- **Root cause / resolution path:** In-app feedback was replaced by a link to GitHub issues (5c31dd1), the
  CI probes were removed (**1ff971b**), and the now-unused table was dropped in
  **71574ad** via `20260626000000_drop_feedback_table.sql` (`drop table if exists public.feedback cascade`).
- **Fix/Status:** SETTLED — `feedback` no longer exists.
- **Do-not-repeat:** Don't reference or re-create the `feedback` table. Feedback goes to GitHub issues.
  (Historical note: `feedback`'s SELECT policy was `true`, which is exactly why the CI-probe pollution in
  2.3 was visible to all users — a cautionary tale about world-readable tables.)

---

## When NOT to use this skill

- **A genuinely new bug with no match here.** Don't force-fit a live incident onto an old entry — use
  **debugging-playbook** for triage, then add a new entry here once it's settled.
- **You need the RLS *mechanism*, not the history** — read **reference-rls-and-postgres**.
- **Routine feature work** in an area with no scar tissue. This is a hazard map, not a tutorial; loading
  it for an unrelated view tweak is noise.
- **You want to change one of these settled decisions on purpose.** That's allowed — but read the entry
  first so you're overriding it knowingly, and update this file as part of the change.

---

## Provenance and maintenance

- **Compiled:** 2026-07-04, from the git history of this repo plus the verified ground-truth brief. Every
  entry cites a real commit SHA; nothing here is inferred without a commit behind it.
- **Uncertain / partial items** (verify before relying):
  - Issue-number ↔ commit mapping is only partially confirmed. Verified `Fix #N` commits: #1 (b7dedbb),
    #2 (1ff971b), #4 (a120c62), #5 (b19b7fd), #9 (b3d7bd3), #10 (f00b0c6), #11 (9bc8890). The ground-truth
    brief's labels "#3/#6" (safe-area) and "#8" (ghost-click) do **not** map to `Fix #N` commit subjects;
    the *fixes* are verified (f3db3de safe-area; b2751ab + a120c62 ghost/tap-through) but those exact
    issue numbers are unverified — verify via `git log --oneline | grep -iE "Fix #[0-9]"`.
- **Re-verify commands** (read-only):
  - `git show <sha>` for any entry (SHAs are inline above).
  - RLS: `git show 8fd01ee f926bd3 9b54ec8 7acd9fd 572e5d6`; `ls supabase/migrations/`.
  - CI/JWT: `git log --oneline | grep -iE "jwt|auth|ci|integration"`; `git show 358d810 df7163f 6f1239c`.
  - Android: `git show b7dedbb 7b664de 13957a6 28a4242 505c915 4421875 208ba6c 53af81f f3db3de`.
  - Capture: `git show b3d7bd3 b19b7fd`.
  - Build: `git show 06fe17e 71574ad 1ff971b`.
- **Maintenance rule:** When a new battle is *settled* (fix merged, root cause proven, or a fix
  consciously rejected/reverted), add an entry in the matching Area using the same
  Symptom → Root cause → Evidence → Fix/Status → Do-not-repeat shape, and cite the SHA. A war won but
  unrecorded will be re-fought.
