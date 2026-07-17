---
name: validation-and-qa
description: >-
  What counts as EVIDENCE in Jot — the test inventory, how to run each suite, how to add a
  test per layer, and which gate an acceptance decision hangs on. Load BEFORE claiming
  something works, before adding or running tests, or when deciding what evidence a change
  needs. Triggers: "how do I run the tests", "npm test", "test:nlp", "test:tasks",
  "test:rust", "test:ui", "test:all", "playwright", "e2e", "ci-integration-test",
  "rls.test.sql", "supabase test db", "what test proves this", "how do I add a test",
  "what's the CI gate", "acceptance criteria", "the golden / certified inventory",
  "#project.space test", "is this done".
---

# Validation & QA — what counts as evidence here

A change is not "done" because it looks right or typechecks. It is done when the suite that
owns its behavior turns green on purpose. This skill is the inventory of that evidence and
the discipline for using it. Read it before you assert a change works, before you add a
test, and before you decide a fix is finished.

The one rule under everything else: **evidence over eyeballing.** If you cannot name the
suite that proves your change, you have not finished the change. Tie this to
`change-control` (what you are allowed to touch) and `research-methodology` (how you form a
claim); this skill is where those land as a runnable command.

---

## 1. The test inventory

Every suite that exists, verbatim from `package.json` and the CI workflows. Commands are
`npm run …` unless shown otherwise. Run everything from the repo root.

| Suite | Command | Runner | Covers | A failure means |
|---|---|---|---|---|
| NLP report | `test:nlp` → `tsx tests/unit/services/nlp.test.ts` **&&** `tsx tests/unit/services/nlp-natural.test.ts` | tsx running the `.ts` file directly | `parseInput` correctness — dates, times, priority, projects, recurrence, language mode, DA/EN | Capture parsing regressed. **But note gating asymmetry below** — the first file reports, the second gates. |
| Task model + controller | `test:tasks` → `tsx tests/unit/models/task-models.test.ts` **&&** `tsx tests/unit/controllers/task-create-controller.test.ts` | tsx, custom `assertEqual` that `throw`s | Presentation/visibility model helpers; create-task save orchestration (project resolution, fallback) | A model/controller invariant broke; the file exits non-zero and stops the `&&` chain. |
| All code tests | `test:code` (this is what **`npm test`** runs) | = `test:nlp && test:tasks` | Everything above | Some unit suite failed. This is the fast local gate. |
| Rust | `test:rust` → `cargo test --manifest-path src-tauri/Cargo.toml` | cargo/Rust test harness | Native Tauri-side logic (`src-tauri/src/services/…`) | Native code regressed. |
| E2E harness (default) | `test:ui` → `playwright test` (config `playwright.config.ts`) | Playwright + msedge/chromium | Desktop auth harness page (`auth-harness.html`) — mocked, no DB. Ignores `**/*.local.spec.ts`. | The auth UI surface broke, or the harness page failed to render. |
| E2E local-DB | `test:ui:local` (= `db:prepare:e2e` then `test:ui:local:raw`) → `playwright test --config playwright.local.config.ts` | Playwright against a **real local Supabase** | `local-db-harness.html` — seeds, reads, and writes a task into the local stack. Matches only `**/*.local.spec.ts`. | Real DB-backed UI flow broke, or the local stack/seed is wrong. |
| Full stack (remote) | `test:all` = `test:rust && test:code && test:ui` | mixed | Everything except the local-DB lane | A broad regression. Run before a big handoff. |
| Full stack (local) | `test:all:local` = `db:prepare:e2e && test:rust && test:code && test:ui:local:raw` | mixed | Same but with the real local-DB e2e lane | As above, DB path included. |
| CI CRUD integration | `npx tsx scripts/ci-integration-test.ts` | tsx, signs in a real user against the **live** Supabase project | Real RLS + JWT stack: create area/inbox/project tasks, complete, delete, SELECT isolation, identity probes | RLS or JWT propagation is broken against production schema. **This is the CI acceptance gate** (see §3). |
| RLS policy tests | `npx supabase test db` (runs `supabase/tests/rls.test.sql`) | pgTAP (`plan/lives_ok/throws_ok/is/finish`), 21 assertions, in a `BEGIN … ROLLBACK` txn | Postgres RLS directly: owner/other-user INSERT/UPDATE/DELETE/SELECT, `42501` denials, shared area/project membership | A policy allows or denies the wrong thing at the SQL layer. Not wired into CI — run manually. |

Cross-references: to actually launch the app and watch a change behave, that's
`run-and-operate` (the `run` skill), not a test suite. For DB latency evidence use
`measure:db` — see `diagnostics-and-tooling`.

---

## 2. The test style — tsx running files, custom asserts (NOT vitest/jest)

There is **no test framework**. Unit tests are plain `.ts` files executed directly by `tsx`.
There is no `describe`, no `it`, no `expect`, no config, no runner discovery. A file is a
script: it runs top to bottom and signals failure by **exiting non-zero** — either by
`throw`ing or by calling `process.exit(1)`.

Two assertion patterns exist. Match the file you are editing.

**Pattern A — throwing `assertEqual`** (`task-models.test.ts`, `task-create-controller.test.ts`):

```ts
function assertEqual<T>(label: string, actual: T, expected: T) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${label}: expected ${right}, got ${left}`);
  }
}

assertEqual("sectionLabel today", sectionLabel("2026-04-30"), "Today");
// …last line prints a human tally, e.g.:
console.log("Task model tests passed: 10/10");
```

An uncaught `throw` makes `tsx` exit non-zero, which fails the `&&` chain and the build.

**Pattern B — count-and-`process.exit`** (`nlp-natural.test.ts`): iterate cases, increment a
`failed` counter on mismatch, then `if (failed > 0) process.exit(1)` at the end.

**Frozen time.** NLP and model tests replace `globalThis.Date` with a `MockDate` pinned to a
fixed instant (`2026-04-15T12:00:00Z` for NLP; `2026-04-30` for models) so relative-date math
is deterministic. Run NLP tests with `TZ=UTC` (the file header says so) so
`new Date(y, m, d)` is timezone-safe.

### The gating asymmetry you must know

`tests/unit/services/nlp.test.ts` (the big 20+-group suite) has its own colored runner that
**never calls `process.exit` and never throws** — it prints a `SUMMARY x/y passed` and exits
0 **even when cases fail.** It is a *report*, not a gate. It deliberately contains:

- **bug-documenting cases** (commented `BUG:`) that fail on purpose to pin known parser
  defects — "Failing tests document bugs … do not delete them",
- **`PROPOSED —` groups** for unbuilt features, expected to fail.

So `npm test` can print red NLP lines and still succeed. The *gating* NLP file is
`nlp-natural.test.ts` (Pattern B). When you touch NLP, read the printed summary with your
eyes; do not trust the exit code of `nlp.test.ts` alone.

### Adding a case

Append to the existing data array in the relevant file — do not restructure. For
`nlp.test.ts`, add a `{ input, expected, note? }` object to the right `TestGroup.cases`. For
the assert-style files, add another `assertEqual(...)` line and bump the printed tally.
Re-run the suite's command and read the output.

---

## 3. The CI gates — acceptance thresholds

The Release Candidate pipeline (`.github/workflows/release-candidate.yml`, trigger: push to
`dev`) is the automated acceptance gate. Jobs run in a strict `needs:` chain:

```
migrate-db  →  integration-test  →  build-rc  →  build-rc-android
```

- **migrate-db** applies Supabase migrations (`db push --linked --include-all`) and deploys
  the `conduit` edge function.
- **integration-test** runs `npx tsx scripts/ci-integration-test.ts` against the live DB.
  It `needs: migrate-db`. This ordering is load-bearing: migrations must land *before* the
  RLS test runs, or the very fix under test can never deploy. See the RLS-42501 story in
  `debugging-playbook` — that ordering was reversed once and deadlocked a fix.
- **build-rc / build-rc-android** only run if integration-test is green.

**"Green" for a merge to `dev` means: migrations apply cleanly AND the CRUD/RLS integration
test passes against the real Supabase project.** That is the whole automated bar.

**What CI does NOT run — so it is on you to run locally:**

- `npm test` / `test:code` (unit tests) — **not** in either workflow.
- `test:rust` — not run (`release.yml` runs `cargo check`, a compile check, not tests).
- `test:ui` / `test:ui:local` (Playwright) — not run in CI.
- `supabase test db` (`rls.test.sql`) — not run in CI.

`release.yml` (push to `master`) does a version check + `npm run build` (which is
`tsc && vite build`, so it *typechecks*) + release/publish. It runs no test suites.

Treat unit, Rust, Playwright, and pgTAP suites as **local acceptance gates you are
responsible for** before pushing to `dev`. CI will not catch a unit regression for you.

### Known open exception — `#project.space`

`nlp.test.ts` group *"PROPOSED — #project.space syntax (not yet implemented)"* fails by
design: the feature is unbuilt. Its status is **open, not passing-by-fiat.**
`REFACTOR_SUMMARY.md` lists it as an unresolved sign-off item:

> - [ ] either implement `#project.space` syntax fully
> - [ ] or explicitly remove/reclassify those tests so the final test suite passes cleanly
>   without "known refactor exceptions"

And: `- [x] npm run test passes except for the explicitly proposed NLP cases.` It "passes"
only because `nlp.test.ts` is non-gating (§2). Document this honestly: these cases are a
**candidate/open exception**, not accepted behavior. Do not close them by deleting the tests
without the explicit implement-or-reclassify decision above.

---

## 4. How to add a test, by layer

Put the test where its layer lives; run the command that owns it. A fix is not done until
the matching suite proves it green (or, for a bug you are pinning, red on purpose with a
`note`).

| Layer | File to add to | Command to run |
|---|---|---|
| Model | `tests/unit/models/task-models.test.ts` — add an `assertEqual(...)`, bump the tally | `npm run test:tasks` |
| Controller | `tests/unit/controllers/task-create-controller.test.ts` — add an `assertEqual` / `await saveCreateTaskDraft(...)` block | `npm run test:tasks` |
| Service (NLP) | Correctness/bug case → `tests/unit/services/nlp.test.ts` (report); a case that must **gate** the build → `tests/unit/services/nlp-natural.test.ts` | `TZ=UTC npm run test:nlp` |
| Other service | No suite exists yet — prefer a pure model/controller test, or add a new `tsx`-run file and wire a script mirroring the `test:*` pattern. Flag this as a new convention (`change-control`) before inventing structure. | — |
| E2E (mocked UI) | `tests/e2e/*.spec.ts` using `@playwright/test` + `getByTestId` + the `debugStep` helper | `npm run test:ui` |
| E2E (real DB) | `tests/e2e/*.local.spec.ts` (the `.local` suffix routes it to the local config) | `npm run test:ui:local` (needs the local stack — §5) |
| RLS / SQL | `supabase/tests/rls.test.sql` — add a `throws_ok`/`lives_ok`/`is` and increment `plan(n)` | `npx supabase test db` |
| Live RLS/CRUD (CI-style) | `scripts/ci-integration-test.ts` — add a numbered CRUD block | `npx tsx scripts/ci-integration-test.ts` with env set (§5) |

**Acceptance discipline.** After a fix, run the suite for that layer and paste/read the
result before saying "done." "I changed X and it should work" is not evidence;
`test:tasks` printing `10/10` is. For anything touching RLS, the evidence is
`ci-integration-test.ts` and/or `rls.test.sql` going green — eyeballing a policy is exactly
how the 42501 saga happened (`debugging-playbook`).

---

## 5. Prerequisites for the DB-backed lanes

The local e2e Playwright lane (`test:ui:local`) and, for realistic local runs, the CRUD
integration script need a real Postgres:

- **Docker** running (Supabase local stack runs in containers).
- `npm run db:prepare:e2e` = `db:start` (`supabase start`) → `db:reset` → `db:env:e2e`
  (writes the git-ignored `.env.e2e.local` from `supabase status`, via
  `scripts/local-supabase-env.mjs`) → `db:seed:e2e` (seeds curated fixtures). The
  `local-db.local.spec.ts` test asserts against those exact fixtures (2 areas, 2 projects,
  "Seeded inbox task", "Seeded project task").
- The dev server needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` present or the
  app throws at import; the local e2e lane also reads `VITE_E2E_TEST_EMAIL` /
  `VITE_E2E_TEST_PASSWORD`. Setup/env details are owned by `run-and-operate` — follow that,
  don't duplicate it here.
- `scripts/ci-integration-test.ts` needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_TEST_USER_NAME`, `SUPABASE_TEST_USER_PASSWORD`. In CI these are secrets; locally
  it points at whatever project those vars name — mind that it writes and cleans up real rows.

Playwright itself auto-starts the dev server (`webServer` in the config, `reuseExistingServer:
true`) and uses the msedge channel headless. If msedge/browsers aren't installed, that's a
tooling gap — see `diagnostics-and-tooling`.

---

## When NOT to use this skill

- You just want to **run the app and watch a change** in the real UI — that's the `run`
  skill / `run-and-operate`, not a test suite.
- You're deciding **which files/layers you're allowed to touch** — that's `change-control`.
- You're **root-causing a specific failure** (RLS 42501, JWT-null, signature drift) — that's
  `debugging-playbook`; come back here only to pick the suite that reproduces it.
- You need **profiling/latency numbers**, not pass/fail — `measure:db` in
  `diagnostics-and-tooling`.
- You're forming or defending a **claim/hypothesis** in prose — `research-methodology` is the
  method; this skill is only where the claim gets a runnable proof.

---

## Provenance and maintenance

Verified 2026-07-04 by direct reads of `package.json`, all four unit test files, both
Playwright configs, `scripts/ci-integration-test.ts`, `supabase/tests/rls.test.sql`, both
`.github/workflows/*.yml`, and `REFACTOR_SUMMARY.md`. Facts here drift when scripts, configs,
or the CI pipeline change — re-verify before trusting:

```bash
grep -n test package.json                       # suite commands + the test:* graph
sed -n '1,40p' tests/unit/services/nlp.test.ts  # runner + assert style (confirm: tsx, custom, no framework)
sed -n '1,70p' .github/workflows/release-candidate.yml   # gate order: migrate-db → integration-test → build
```

If any command, path, or gate here no longer matches the repo, fix this file in the same
change — a wrong runbook is worse than none.
