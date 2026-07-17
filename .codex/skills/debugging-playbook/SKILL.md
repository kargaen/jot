---
name: debugging-playbook
description: >-
  Live-triage playbook for when Jot is broken and you need to move FAST — pick
  the discriminating experiment BEFORE you change code. Load me when you see:
  "insert fails / permission denied for table / 42501", "infinite recursion /
  42P17", "auth.uid() is null" (especially in CI), "RC build red / release-
  candidate failed", Android "App not installed", "widget stale / widget shows
  wrong tasks", "capture parsed the date/project/tag wrong", "task tap doesn't
  open the editor on device", "tests failing", "the app feels slow", or
  "Missing VITE_SUPABASE_* / throws at import". Symptom → most-likely cause →
  first check → discriminating experiment → the fix skill.
---

# Debugging playbook (live triage)

You are staring at a broken Jot app, build, or test and you have no context.
This page gets you from **symptom** to the **one experiment that tells you which
layer is actually broken**, then hands you off to the sibling skill that owns the
fix. It does not re-explain those fixes — it points at them.

## The golden rule: reproduce at the LOWEST layer first

Jot is a stack: raw SQL → Supabase client → controller → hook → view →
(desktop window | mobile route | Android WebView | home-screen widget). A bug
anywhere upstream masquerades as a bug everywhere downstream. Do not debug the
app when you can debug SQL. Do not debug an Android build when you can debug the
harness.

- **DB / RLS bug** → reproduce with raw SQL (`supabase/tests/rls.test.sql`,
  `scripts/rls-ladder.ts`) before you touch a controller.
- **Logic bug** → reproduce with a unit test (`npm run test:code`) before e2e.
- **Mobile UI bug** → reproduce in `mobile-harness.html` before an Android build.
- **"Feels slow"** → MEASURE (`npm run measure:db`, Latency debug overlay). Never
  eyeball latency; a p95 number ends the argument.

If you cannot reproduce a bug at a lower layer, that itself is a finding — it
tells you the bug lives in the layer you skipped.

## Second rule: is this a settled battle?

Several of these symptoms are scar tissue from fights that were already won and
documented. **Before you "fix" RLS, JWT propagation, the RC pipeline order, or
Tauri version drift, check `failure-archaeology`** to see whether you are about
to re-open a closed wound. Reverting a hard-won fix because it "looks wrong" is
the most expensive mistake available here.

---

## Triage table

| # | Symptom | Most likely cause | First check (command / file) | Discriminating experiment | If confirmed → |
|---|---------|-------------------|------------------------------|---------------------------|----------------|
| 1 | INSERT fails with **42501** (`permission denied` / `new row violates row-level security`) even though the user owns the row | The **SELECT** policy is re-checked against rows returned by `INSERT … RETURNING`, and the SELECT policy calls a `can_access_*(id)` helper that re-queries the table — the new row isn't in its snapshot yet | `supabase/migrations/20260624000000_fix_select_rls_returning.sql` (the fix), and the SELECT policies in `20260427000000_collaboration_mvp.sql` | In raw SQL, run a **bare** `INSERT … ` (no RETURNING) vs `INSERT … RETURNING *` as the signed-in user. Bare passes, RETURNING throws 42501 ⇒ it's the SELECT-on-RETURNING trap, not the INSERT WITH CHECK | `reference-rls-and-postgres` (add a direct `user_id = (select auth.uid())` disjunct to the SELECT policy). Confirm it's not already fixed via `failure-archaeology` |
| 2 | **42P17** `infinite recursion detected in policy for relation …` | A `can_access_area/project/task(...)` helper is **missing `SECURITY DEFINER`**, so a policy that calls it re-enters RLS on the same table | Grep the helper definitions in `20260427000000_collaboration_mvp.sql` and the idempotent re-apply in `20260428000000_collaboration_fix.sql` | Check whether each helper is declared `SECURITY DEFINER STABLE`. Add it (idempotent) and re-run `scripts/rls-ladder.ts` — recursion clears at the rung that was failing | `reference-rls-and-postgres`; the SECURITY-DEFINER story is in `failure-archaeology` |
| 3 | **`auth.uid()` is NULL** (rows invisible, everything 42501, usually only in CI or a script) | JWT not propagated: wrong client (service-role vs anon), token not attached to the data client, or two separate clients for auth vs data | `scripts/rls-ladder.ts` rung 1b (**identity probe**: what does `auth.uid()` resolve to for THIS request vs the token's `sub`) | Log the `Authorization` header **suffix** (last chars only — never the whole token) on the failing request; compare service-role key vs publishable/anon key. Signed-in user CRUD MUST use the publishable key with the session attached, not the service-role key | `reference-rls-and-postgres` for the single-client pattern; `failure-archaeology` for the CI JWT saga. **Never "fix" this by switching CRUD to the service-role key — that routes around RLS** |
| 4 | **Release-candidate build is red** (push to `dev`) | Depends entirely on which job failed | `.github/workflows/release-candidate.yml`. Job order: `migrate-db` → `integration-test` → `build-rc` (Windows) → `build-rc-android` | Read the failing **job** log. `migrate-db`/`integration-test` red ⇒ DB/RLS (rows 1–3). `build-rc` red on Windows ⇒ frontend/`tsc`/Tauri desktop. `build-rc-android` red ⇒ signing/keystore (row 5). Also check Tauri version drift: `@tauri-apps/api` (`~2.10.0`) vs `@tauri-apps/cli` (`^2.0.0`) in `package.json` | DB jobs → rows 1–3 + `reference-rls-and-postgres`. Build jobs → `build-and-env` + `run-and-operate`. Note: `migrate-db` runs **before** `integration-test` on purpose — see `failure-archaeology`; do not reorder |
| 5 | Android **"App not installed"** on device | Signature / `versionCode` mismatch — the installed APK was signed with a different key (debug vs release, or a rotated keystore secret) | `RELEASE.md` (Android signing), the "Verify release keystore" step in `release-candidate.yml`, `src-tauri/gen/android/app/build.gradle.kts` | Uninstall the existing app, install once fresh. If it now installs ⇒ pure signature drift (expected once per device on a key change). If it still fails ⇒ APK unsigned / keystore secret wrong (`ANDROID_KEYSTORE_B64` / `_PASSWORD` / `ANDROID_KEY_ALIAS`) | `run-and-operate` / `build-and-env`. `versionCode` = `1000002 + run_number`, strictly increasing |
| 6 | **Widget stale / shows wrong tasks** on Android home screen | The local `jot_widget.db` wasn't refreshed: `widgetSync.service.ts` (TS) → `widget_sync.rs` (Rust) → SQLite the Kotlin widget reads | `src/services/sync/widgetSync.service.ts`, `src-tauri/src/services/widget_sync.rs`, and the **"Widget sync (debug)"** section in `src/views/pages/mobile/settings/MobileSettings.view.tsx` ("Run widget sync" button → `syncWidgetsDebug()`) | In mobile Settings, tap **Run widget sync**. If the widget updates ⇒ the sync path works and the trigger (post-mutation / foreground call) is missing. If it doesn't ⇒ the Rust/SQLite write or the Kotlin read is broken | `run-and-operate` for the native path; keep the fix on the correct side of the TS↔Rust↔Kotlin boundary |
| 7 | **Capture parsed wrong** (date, project, or tag extracted incorrectly) | NLP language mode mismatch (`auto`/`en`/`da`) or a punctuation edge case (e.g. `#project` with trailing periods). Mixed-language parsing is intentionally **not** supported | `src/services/capture/nlp.service.ts`, `src/services/capture/nlpSettings.service.ts` (`NLP_LANGUAGE_KEY = "jot_nlp_language"`, modes `en`/`da`/`auto`, default `auto`) | Run `npm run test:nlp` and add the failing phrase as a case. Then force the mode (`en` or `da`) and re-parse — if forcing fixes it, the bug is `auto` language detection, not the extractor | `validation-and-qa` (own the case in the NLP unit tests). Do not add mixed-language support — it's a deliberate guardrail |
| 8 | **Task tap doesn't open the editor** on device (works on desktop) | Known mobile interaction bug class: WebView touch hit-testing — the tapped element captured at `touchstart` doesn't resolve on-device; must re-resolve at release via `elementFromPoint` | `src/views/pages/mobile/components/MobileTaskRow.view.tsx` vs `src/views/components/tasks/TaskRow.view.tsx`; reference commit **53af81f** ("Fix task-title tap not opening editor on device") | Reproduce in `mobile-harness.html` first. Compare tap-vs-scroll / touchstart-vs-release handling against the 53af81f pattern (hit-test at release with `elementFromPoint`, don't trust the captured target) | `failure-archaeology` to confirm it's the same settled class before re-touching; keep the fix in the view layer |
| 9 | **App feels slow** | Unmeasured. Could be one slow DB op, not the whole app | `npm run measure:db` (`scripts/measure-db-latency.ts` → p50/p95/max per op) and the **"Latency (debug)"** overlay in `MobileSettings.view.tsx` (`getTimingStats()` from `src/utils/observability/timing.ts`) | Get p50/p95 **per operation**. One op with a high p95 ⇒ that query/index (check `20260701120000_perf_rls_initplan_and_fk_indexes.sql`). Uniformly high ⇒ network/auth, not a query | `diagnostics-and-tooling` for the measurement workflow; `reference-rls-and-postgres` if it's an initplan/FK-index issue |
| 10 | **Missing `VITE_SUPABASE_*`** / app or harness **throws at import** | `.env.local` absent or incomplete. The import-time guard requires **`VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`** (not `VITE_SUPABASE_ANON_KEY`) | `.env.local`; the guard in `src/services/backend/supabase.service.ts` | Add at least dummy values for the two required vars and re-run. If the import stops throwing ⇒ pure env gap. The harness needs these present too | `build-and-env` (env var inventory, dummy-value convention) |

---

## Fast commands (verified, copy exactly)

```bash
npm run test:code      # unit: NLP + tasks (tsx, custom assert — NOT vitest/jest)
npm run test:nlp       # just the NLP parser cases
npm run measure:db     # p50/p95/max per DB op (needs the 4 env vars below)
npx tsx scripts/rls-ladder.ts          # dependency-ordered RLS diagnostic; stops at first broken rung
npx tsx scripts/ci-integration-test.ts # full signed-in CRUD/RLS cycle (what CI runs)
```

`measure:db`, `rls-ladder.ts`, and `ci-integration-test.ts` all need the same four
env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_TEST_USER_NAME`, `SUPABASE_TEST_USER_PASSWORD`.

Raw-SQL RLS repro lives in `supabase/tests/rls.test.sql`. The mobile visual repro
(no Android build) is `mobile-harness.html` → `src/test-harness/mobileScreens.tsx`
(`?theme=dark|light`, `?frame=shell`); it also needs the `VITE_SUPABASE_*` vars.

---

## When NOT to use this skill

- **You already know the layer and just need the fix mechanics.** Go straight to
  the owning skill: `reference-rls-and-postgres`, `build-and-env`,
  `run-and-operate`, `validation-and-qa`, `diagnostics-and-tooling`.
- **You're asking "was this already fixed / why is it like this?"** →
  `failure-archaeology`, not here. This page triages *live* breakage; it does not
  narrate history.
- **Nothing is broken.** This is not a design or feature-planning page. For "how
  is X structured / where does X go", use `architecture-contract`.
- **You want to change behavior, not diagnose it.** Follow `CLAUDE.md` /
  `ARCHITECTURE.md` discipline (one file, one MVC layer) — triage first, then the
  right skill owns the change.

Never let triage tempt you into routing around RLS (e.g. switching signed-in CRUD
to the service-role key to "make the error go away"). The service-role bypass is
only ever legitimate inside Conduit, where user_id scoping is the security
boundary. Everywhere else, a 42501 is telling you the truth.

---

## Provenance and maintenance

- Authored 2026-07-04 against the live repo. Every command, path, migration name,
  and commit hash here was verified by direct Read/Grep on that date.
- Sibling skills referenced by name (`failure-archaeology`,
  `reference-rls-and-postgres`, `diagnostics-and-tooling`, `validation-and-qa`,
  `run-and-operate`, `build-and-env`) are the intended handoff targets; confirm a
  target exists in `.claude/skills/` before relying on it.
- **Re-verify before trusting this page** (paths and job order drift):
  - Scripts: `ls scripts/` (expect `measure-db-latency.ts`, `rls-ladder.ts`,
    `ci-integration-test.ts`) and `node -e "console.log(require('./package.json').scripts)"`.
  - Observability: `src/utils/observability/{logger.ts,timing.ts}` still export
    `getTimingStats` / `time`; the debug overlays still live in
    `src/views/pages/mobile/settings/MobileSettings.view.tsx`.
  - RLS: `ls supabase/migrations/` (the `20260624…fix_select_rls_returning` and
    `20260428…collaboration_fix` files are the load-bearing fixes) and
    `supabase/tests/rls.test.sql`.
  - CI: job order in `.github/workflows/release-candidate.yml`
    (`migrate-db` → `integration-test` → `build-rc` → `build-rc-android`) and the
    "Verify release keystore" step.
  - Mobile tap bug: `git show 53af81f` and
    `src/views/pages/mobile/components/MobileTaskRow.view.tsx`.
  - Tauri drift: `@tauri-apps/api` vs `@tauri-apps/cli` versions in `package.json`.
