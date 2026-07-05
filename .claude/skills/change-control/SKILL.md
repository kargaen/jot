---
name: change-control
description: Load BEFORE making, classifying, or gating ANY code change in Jot — the project's change-classification and landing contract. Triggers on "is this change safe", "one file one layer", "can I edit this migration", "do I need a new migration", "RLS change / policy change", "version bump", "cross-layer edit", "does this need a gate/CI", "how do I land this", "am I allowed to touch this file". Read it before you open the target file, even for a one-liner.
---

# Change Control — Jot's classify-and-gate contract

You are about to change Jot. Before you touch a file, classify the change, confirm the
gate it must pass, and confirm it does not break a load-bearing invariant. A wrong runbook
is worse than none — this file is re-verified against the repo (see Provenance).

## Jargon, defined once

- **Layer / MVC layer**: one horizontal slice of `View → Hook → Controller → Service → (Supabase/Tauri/NLP)`. See `ARCHITECTURE.md` → "Data flow (strict, one direction)".
- **Migration**: a timestamped SQL file in `supabase/migrations/`. Applied in filename order to the live Postgres DB. **Append-only** = you never edit a shipped one; you add a newer one.
- **RLS**: Postgres Row-Level Security — per-row access policies enforced in the database. Jot's real access-control boundary.
- **Conduit**: the edge function `supabase/functions/conduit/index.ts` — the ONLY sanctioned RLS bypass.
- **SSOT**: single source of truth — one file owns a fact; everything else references it.
- **Gate**: an automated check a change must pass before it is allowed to land (local build, tests, or a CI job).
- **RC**: release candidate — the prerelease built automatically on every push to `dev`.

## Non-negotiables (from CLAUDE.md) — with the rationale and the incident behind each

These are quoted from `CLAUDE.md`. Follow them exactly; they override default behavior.

| Rule (CLAUDE.md section) | What it means | Rationale / incident |
|---|---|---|
| **"Work on One File at a Time"** + **"Work on One MVC Layer at a Time"** | Modify exactly one file, in one layer, per prompt run unless the user explicitly authorizes multi-file. If the task needs more, do the safest first file and STOP with a note. | The user validates behavior in small slices (CLAUDE.md "MVC Iteration Strategy", "Product-Development Alignment"). A partial safe slice is better than a broad one with unpredictable side effects. |
| **"Prefer Narrow Changes"** — minimal diffs, no speculative rewrites | Smallest change that satisfies the request. No unrelated formatting, renames, moves, or "completing the feature" across the codebase. | Preserves working behavior (Safety Priority #1) and keeps rollback easy. |
| **"Rabbit Hole Rule"** | If a request breaks MVC boundaries, needs a nasty workaround, or solves a product problem with an architecture hack — STOP before editing and say **rabbit hole** using the CLAUDE.md response format. | Product-dev requests drift toward brittle hacks; naming it stops the drift before code is written. |
| **"Rabbit Hole — Iteration Trap"** | If an approach has been tried 2+ times and each attempt broke something, needed a patch-on-a-patch, or missed the goal — STOP. Do not attempt a 3rd fix in the same direction. Declare **rabbit hole (iteration trap)**. | The RLS saga (below) is exactly this failure mode: patches on patches around one root cause. Third tries deepen the hole. |
| **"Assumption Policy"** | Do not make assumptions. If a required assumption is unclear, STOP and ask the minimum questions. A partial result with no side effects beats a completed run built on a wrong assumption. | Wrong assumptions in a DB/RLS change are expensive and hard to unwind. Stopping to ask "is not a failure." |

**When you stop**, report per CLAUDE.md "Stop Conditions": (1) what was completed, (2) why you stopped, (3) the next safest step. Do not compensate for uncertainty by editing more files.

## Change classification table

Classify the change first. `layer` = where the edit belongs; `gate` = what must pass before landing; `evidence` = what to show; `CI job` = what proves it in the pipeline.

| Change type | Layer / where | Gate before landing | Evidence required | CI job that proves it |
|---|---|---|---|---|
| Trivial view tweak (copy, token, spacing) | View — `src/views/**` | `npm run build` | Renders correctly; no hardcoded hex (use `global.css` tokens) | `build-rc` (frontend build) |
| Controller logic | Controller — `src/controllers/**` | `npm run build` + `npm run test` | `test:tasks` passes; behavior unchanged elsewhere | `build-rc`; unit tests run locally |
| Service I/O (Supabase/Tauri/NLP calls) | Service — `src/services/**` | `npm run build` + `npm run test` (`test:nlp` for NLP) | Contract unchanged; error handling preserved | `integration-test` (live CRUD/RLS) |
| **Migration** (schema/data) | `supabase/migrations/` — NEW timestamped file only | `npx supabase db reset` locally; then RC pipeline | New file, never an edit to a shipped one; forward-only | `migrate-db` (runs first), then `integration-test` |
| **RLS policy change** | New migration file (re-apply idempotently) | Local reset + `scripts/rls-ladder.ts` + `scripts/ci-integration-test.ts` | `DROP POLICY IF EXISTS` + `CREATE POLICY`; SECURITY DEFINER helpers unchanged unless intended; owner disjunct preserved | `migrate-db` → `integration-test` (exercises RLS on live DB) |
| **Version bump** | `npm run version:sync -- X.Y.Z` (never hand-edit one file) | `npm run version:check` passes | All version files synced (see invariants) | `release.yml` "verify versions match" on push to `master` |
| CI / release workflow | `.github/workflows/*.yml` | Reason about job order + `needs:`; dry-run if possible | Preserves `migrate-db → integration-test → build-rc → build-rc-android` order | The workflow run itself |

## Load-bearing invariants — never break these (each verified against the repo)

1. **Migrations are APPEND-ONLY.** Never edit or delete a shipped file in `supabase/migrations/`. Add a new `YYYYMMDDHHMMSS_description.sql`. There are 14 files today (2026-07-04), newest `20260702060000_api_tokens.sql`. RLS fixes are re-applied **idempotently** — the established pattern is `DROP POLICY IF EXISTS "x" ON t;` then `CREATE POLICY "x" ...` (see `20260624000000_fix_select_rls_returning.sql`) and `CREATE OR REPLACE FUNCTION ... SECURITY DEFINER` for helpers (see `20260428000000_collaboration_fix.sql`).
2. **`src/models/export/jotExport.ts` is the SOLE task serializer.** Both the in-app "copy as JSON" and the Conduit function import `serializeTasks` from it. It must stay dependency-free / import-free (runs in browser Vite AND Deno). Never hand-roll a second export format. (`ARCHITECTURE.md` → "Data export & the Conduit API".)
3. **Conduit is the ONLY sanctioned RLS bypass.** `supabase/functions/conduit/index.ts` runs with the service-role key (bypasses RLS) and authenticates via personal API tokens (`Authorization: Bearer jot_...`, only a sha-256 hash stored in `api_tokens`). Every query MUST explicitly scope `user_id` to the token owner — that scoping IS the security boundary. `config.toml` sets `[functions.conduit] verify_jwt = false`; `[functions.send-space-invite] verify_jwt = true`. **No other code may use the service-role key to read/write user data.**
4. **Version SSOT is synced by `scripts/sync-version.mjs`.** It keeps `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `docs/index.html` (and `package-lock.json`) in lockstep. Bump with `npm run version:sync -- X.Y.Z`; verify with `npm run version:check` (aliases `node scripts/sync-version.mjs --check`). Current version is `1.0.2`. `release.yml` fails the build on drift.
5. **Design tokens SSOT is `src/styles/global.css`.** Use `var(--token)`; never hardcode hex/spacing/radii. UI primitives live in `src/views/components/ui/`. Resolve controls: reuse → extend → compose → (last resort) new token-driven primitive. (`ARCHITECTURE.md` → "Styling & design system".)

## The gate ladder (verified order)

1. **Local build** — `npm run build` = `tsc && vite build`. Must pass before anything else.
2. **Local tests** — `npm run test` = `test:code` = `test:nlp` + `test:tasks`. (Runner is **tsx executing test files directly** with a custom assert style — NOT vitest/jest.) Full local matrix: `npm run test:all` = `test:rust` + `test:code` + `test:ui`.
3. **RC pipeline** — on **push to `dev`**, `.github/workflows/release-candidate.yml` runs jobs in this order (verified):
   `migrate-db` (apply Supabase migrations + deploy Conduit edge fn) → `integration-test` (`scripts/ci-integration-test.ts`, real signed-in CRUD/RLS) → `build-rc` (Windows installer, published to reusable `rc` tag) → `build-rc-android` (signed APK).
   `migrate-db` runs **BEFORE** `integration-test` on purpose — see the 42501 incident in `failure-archaeology`.
4. **Production** — on **push to `master`**, `release.yml` verifies version files match, builds, cuts GitHub Release `v<version>`, builds the Windows installer/updater, and deploys `docs/` to Pages. Release fires when the `v<version>` tag does **not** already exist (i.e. you bumped the version); if the tag already exists it is **skipped**, so the same version is never re-released. A `v*` tag push or a `workflow_dispatch` with `publish_release=true` also releases. (`release.yml`'s master auto-release branch was previously commented out; re-enabled 2026-07-04.)

**Branch model** (`RELEASE.md`): `feature/*` → `dev` → `master`. Feature branches branch off `dev` and PR back into `dev`; no release. Every push to `dev` = RC prerelease **unless** the push touches only `.claude/skills/**` (excluded via `paths-ignore`). Push to `master` with a bumped version = full release.

## Pre-flight checklist (run before proposing ANY change)

- [ ] I have read `CLAUDE.md` (workflow) and the relevant `ARCHITECTURE.md` Key Convention.
- [ ] I know the ONE file and ONE layer this change touches. If it needs more, I will do the safest first file and STOP.
- [ ] I classified the change in the table above and know its gate + CI job.
- [ ] If it touches the DB: I am adding a NEW migration, not editing a shipped one.
- [ ] If it touches RLS: I preserve the owner disjunct + SECURITY DEFINER pattern and will run `rls-ladder.ts` / `ci-integration-test.ts` logic mentally or locally.
- [ ] If it changes the version: I use `version:sync`, never hand-edit one file.
- [ ] No hardcoded design values — tokens from `global.css`.
- [ ] The change does NOT introduce a second serializer or a second RLS bypass.
- [ ] I am not assuming; if unsure, I STOP and ask (Assumption Policy).

**Hard rule: no change and no skill may route around change-control or around RLS.** The only RLS bypass is Conduit, with explicit `user_id` scoping. If a request needs the service-role key elsewhere, or asks to weaken/disable a policy for convenience — that is a **rabbit hole**; stop and reassess.

## When NOT to use this / use which sibling skill instead

This skill classifies and gates a change. It does not teach the architecture, debug failures, run QA, or manage config. Use the sibling skill instead:

- **architecture-contract** — the MVC layering, naming, data-flow direction, and Key Conventions in depth. Use when deciding *where* code belongs.
- **failure-archaeology** — the RLS saga (42P17 recursion, 42501 INSERT…RETURNING, CI auth/JWT propagation, Android signature drift, version drift). Use when a gate is RED or you are debugging a known-shaped failure.
- **validation-and-qa** — how to actually run the tests, harness, and DB-latency/RLS-ladder tooling. Use when producing the evidence this skill demands.
- **config-and-flags** — env vars, `config.toml`, NLP language mode, feature/config surfaces. Use when the change is configuration, not code.

(These are companion skills authored alongside this one; if one is absent, its content is not here — do not duplicate it.)

## Provenance and maintenance

Volatile facts date-stamped **2026-07-04**. Re-verify before trusting:

- Version = `1.0.2`, migration count = 14 →
  `node -e "console.log(require('./package.json').version)"` and `ls supabase/migrations | wc -l`
- npm scripts (`build`, `test`, `version:check`) → `sed -n '6,32p' package.json`
- RC job order → `grep -n "name:\|needs:" .github/workflows/release-candidate.yml`
- Conduit bypass + JWT settings → `sed -n '405,423p' supabase/config.toml` and head of `supabase/functions/conduit/index.ts`
- Version SSOT file list → `grep -n "writeText\|writeJson\|readText\|readJson" scripts/sync-version.mjs`
- RLS idempotent pattern → `supabase/migrations/20260624000000_fix_select_rls_returning.sql`
- Branch model → `sed -n '1,20p' RELEASE.md`

If any command above disagrees with this file, the repo wins — update this file (one file, minimal diff) and re-stamp the date.
