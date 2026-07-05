---
name: run-and-operate
description: WHEN to load — running, previewing, or releasing Jot. Triggers include "how do I run the app", "npm run dev", "preview a mobile screen without an Android build", "how do I cut a release", "RC build", "what does pushing to dev do", "release to master", "where do build artifacts go / where does the installer land", "Windows updater endpoint", "Android APK", "App not installed error", version bump / version sync / version:check, "workflow_dispatch a release". Load this for operating the running/shipping machinery — NOT for first-time environment setup (see build-and-env), NOT for env var meaning (see config-and-flags), NOT for the CI test suites themselves (see validation-and-qa).
---

# Run and Operate Jot

This is the runbook for **running Jot locally** and **shipping it**. It assumes the app already builds on your machine — if it does not, stop and do the environment setup in the **build-and-env** sibling skill first (Node 20, Rust stable, `.env.local`, Supabase CLI). This skill does not repeat setup.

The single source of truth for the app version is **`package.json`**. The single source of truth for the release process is **`RELEASE.md`**. Nothing below overrides those two files; if you find a contradiction, they win and this skill is stale — fix it (see Provenance).

---

## Command anatomy

Verified against `package.json` scripts and `src-tauri/tauri.conf.json` on 2026-07-04. Run everything from the repo root.

| Command | What it runs | When to use | Notes / gotchas |
|---|---|---|---|
| `npm run dev` | `vite` — browser dev server | Fast iteration on React views/hooks/controllers in a normal browser | Needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` or the Supabase service **throws at import** (`src/services/backend/supabase.service.ts`). Dummy values are enough to boot. Serves the harnesses too (see below). |
| `npm run dev:e2e` | `db:env:e2e` then `vite --mode e2e` | Run the app against the **local** Supabase stack | `db:env:e2e` = `node scripts/local-supabase-env.mjs`, which points env at the local stack. Bring the stack up first with `npm run db:start` / `npm run db:prepare:e2e` (owned by build-and-env). |
| `npm run preview` | `vite preview` | Preview a production `vite build` output locally | Build first (`npm run build`). |
| `npm run tauri dev` | `tauri` CLI `dev` (the `tauri` script is a bare passthrough to the `tauri` CLI) | Run the **desktop** app in the real Tauri shell (multi-window: main / quick-capture / about) | `tauri.conf.json` `beforeDevCommand` auto-runs `npm run dev` and waits on `http://localhost:1420`. Requires Rust stable. Desktop is multi-window via `windowLabel`, not routed. |
| `npm run tauri -- android build --apk` | Tauri Android APK build | Only needed to reproduce the CI Android build locally | Requires the full Android toolchain (JDK 17, NDK 27, Android SDK). CI does this for you — see the RC flow. |
| `npm run build` | `tsc && vite build` | Produce the frontend `dist/` (what Tauri bundles) | |
| `npm run version:sync -- <ver>` | `node scripts/sync-version.mjs <ver>` | **Human release step** — bump the version everywhere at once | Writes `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `docs/index.html`. See Production release. |
| `npm run version:check` | `sync-version.mjs --check` | Verify all version-bearing files agree; fails non-zero on drift | This is the gate the release workflow runs before building. |
| `npm run release:prepare` | `sync-version.mjs` (no `--check`) | Alias for a plain version sync | |

---

## 1. Running locally — three modes plus harnesses

**Browser (default, fastest):** `npm run dev`, open the printed localhost URL. This is the loop for view/hook/controller work.

**Local Supabase stack:** `npm run dev:e2e` runs Vite in `e2e` mode against the local database. Use it when you need real reads/writes/RLS locally rather than dummy env. Stack lifecycle (`db:start`, `db:reset`, `db:seed:e2e`, `db:prepare:e2e`) belongs to **build-and-env** — do not re-derive it here.

**Desktop (Tauri):** `npm run tauri dev`. This launches the Rust shell and, via `beforeDevCommand`, the Vite server underneath it. The desktop app is multi-window (`main`, `quick-capture`, `about` — see `tauri.conf.json` `app.windows`) and does **not** use the router; that is mobile-only.

### The visual mobile harness — review real mobile screens without an Android build

This is the intended way to eyeball a mobile screen quickly. Start `npm run dev`, then open **`mobile-harness.html`** at the dev server. It mounts the **real** mobile screens with mock data via `src/test-harness/mobileScreens.tsx` (it imports the actual `MobileToday/Upcoming/All/Logbook/Settings/Capture` views and the real `AppShell`). Because it imports the Supabase-backed layer, `VITE_SUPABASE_*` must be present (dummy values fine).

Query params it honors (verified in `mobileScreens.tsx`):

- `?theme=dark` or `?theme=light` — stamps `data-theme` on the document root, mirroring how the app themes. Review both.
- `?frame=shell` — mounts a single real screen full-bleed inside the actual `AppShell` frame at a phone viewport. Combine with `?tab=today|upcoming|all|logbook|capture|settings` to pick the screen. Default tab is `today`.
- Other `?frame=` values exist for specific checks (`shelldata`, `drill`, `splash`) and `?toast=1` overlays a toast. With no `frame`, it renders a gallery (Tasks / Capture / Button primitives) in phone bezels.

Two more harnesses exist for their own slices: **`auth-harness.html`** (`src/test-harness/authScreen.tsx`) and **`local-db-harness.html`** (`src/test-harness/localDbSmoke.tsx`). Same rule: open them against a running `npm run dev`. The mobile-harness convention is documented in `ARCHITECTURE.md` (Key Conventions → mobile view resolution / visual review); this skill only tells you how to drive it.

---

## 2. Release Candidate flow (push to `dev`)

Trigger: **any push to `dev`** runs `.github/workflows/release-candidate.yml`. It auto-builds and publishes a **pre-release** on the single reusable **`rc`** git tag, which is **deleted and recreated on every run** (so `rc` always points at the latest dev build). No version bump is needed for an RC — RELEASE.md is explicit about this.

Job DAG (verified job names and `needs:` in the workflow):

```
migrate-db  →  integration-test  →  build-rc  →  build-rc-android
(Apply         (CRUD              (Windows       (Build signed APK,
 Database       Integration        installer,     upload APK to the
 Migrations)    Tests)             publish to     rc release)
                                   the rc tag)
```

What each job does:

- **migrate-db** — `supabase link` then `db push --linked --yes --include-all` to apply all migrations to the live project, then **deploys the `conduit` edge function**. It is deliberately **outside** the shared build concurrency group, so a newer `dev` push never cancels a migration mid-flight.
- **integration-test** — runs `scripts/ci-integration-test.ts` (real signed-in-user CRUD against Supabase, exercising RLS). The test suite itself is owned by **validation-and-qa**.
- **build-rc** — on `windows-latest`: builds the frontend, deletes the old `rc` release+tag, then uses `tauri-action` to build the Windows installer and publish it to tag `rc` as a pre-release.
- **build-rc-android** — on `ubuntu-latest`: installs the Android toolchain, writes the release keystore from secrets, verifies it fail-fast, bumps `versionCode`, builds the signed APK, and uploads it to the same `rc` release.

**Why `migrate-db` runs BEFORE `integration-test` (do not "fix" this):** the integration tests exercise RLS against the live DB, so the schema must be current first. Earlier the dependency was inverted (`migrate-db` needed `integration-test`), which created a deadlock: an RLS migration that fixed a failing test could never deploy, because the very test it fixed was red and blocked the migration. This is the same 42501-on-`INSERT...RETURNING` pipeline-ordering fix documented in the RLS history — see the **diagnostics-and-tooling** sibling for the full failure archaeology.

---

## 3. Production release flow (`dev` → `master`)

Branch model (RELEASE.md): `feature/*` → PR into `dev` (RC on every push) → `master` (production). Feature branches never release.

The human release steps — quoting RELEASE.md, these are **the person's git commands, never run them yourself**:

1. Bump the version everywhere: `npm run version:sync -- <version>` (e.g. `1.0.3`). This rewrites `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `docs/index.html` in one shot (`scripts/sync-version.mjs`).
2. Stage + commit those files (`git add … && git commit -m "Release v<version>"`).
3. Merge `dev` into `master` (or push the version commit to `master`) and `git push origin master`.

On push to `master` (or a `v*` tag), `.github/workflows/release.yml` runs:

- **validate** — `npm run version:check` gate (fails on any version drift), builds the frontend, decides whether to release/deploy.
- **build-windows** — builds and uploads the Windows **installer and updater artifacts** to a GitHub Release tagged **`v<version>`** (skipped if the tag already exists).
- **deploy-pages** — syncs the website version and deploys **`docs/`** to GitHub Pages.

**`workflow_dispatch`:** you can trigger `release.yml` manually and pass a `version` input (plus `publish_release` / `deploy_pages` toggles); it runs `version:sync` for you, so no local commit is required. RELEASE.md also notes both workflows accept a `workflow_dispatch` version input.

Note (updated 2026-07-04): a push to `master` auto-releases when the `v<version>` tag does **not** yet exist — bump the version, push `master`, and installers + the GitHub Release are cut; if the tag already exists the release is **skipped** so the same version is never re-released. A `v*` tag push or a `workflow_dispatch` with `publish_release=true` also releases. (This branch of `release.yml`'s decision logic was previously commented out and has been re-enabled.) Treat `release.yml` as the source of truth if this changes.

---

## 4. Where output lands

- **Windows installer + updater artifacts** — `bundle` in `tauri.conf.json` has `targets: "all"`, NSIS `installMode: "both"`, WiX, and `createUpdaterArtifacts: true`. RC installers attach to the `rc` pre-release; production installers attach to the `v<version>` release. The desktop **updater endpoint** is `https://github.com/kargaen/jot/releases/latest/download/latest.json` (see `plugins.updater.endpoints`), signed with the `plugins.updater.pubkey` minisign key — so only non-prerelease `v*` releases feed auto-updates.
- **Android APK** — built only in the RC pipeline and **uploaded to the `rc` GitHub release** (`gh release upload rc … --clobber`). There is no production Android release wired up yet; RELEASE.md notes that when `master` starts building Android it must reuse the same keystore and a higher `versionCode` scheme.
- **Website** — `docs/` → GitHub Pages, on `master` / dispatch.

---

## 5. Android install reality (read before touching signing)

From RELEASE.md, verified against `release-candidate.yml`:

- The release keystore exists **only** in GitHub secrets: `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`. The RC workflow decodes them into `src-tauri/gen/android/keystore.jks` + `key.properties`; `build.gradle.kts` signs release builds with it and falls back to the debug key locally when `key.properties` is absent.
- **`versionCode = 1000002 + run_number`** — strictly increasing so every RC installs over the previous one. Base `1000002` is Tauri's derivation of version `1.0.2`.
- Android requires that an update be signed with the **same key** as the installed app. If the keystore secret is ever lost or replaced, the signature changes and existing installs **cannot update** — every device sees **"App not installed"** and must **uninstall and reinstall once**. Keep the keystore backup safe. The "Verify release keystore" CI step fails fast if the secret is mistyped, so you don't burn 5 minutes into a cryptic Gradle error.

---

## When NOT to use this skill

- First-time environment setup (Node/Rust/Supabase CLI, `.env.local` creation) → **build-and-env**.
- What a specific env var *means* or which flags gate behavior → **config-and-flags**.
- Writing or debugging the CI test suites (`ci-integration-test.ts`, `rls-ladder.ts`, Playwright, unit tests) → **validation-and-qa**.
- Diagnosing an RLS failure, JWT/`auth.uid()` propagation, or reading the failure archaeology → **diagnostics-and-tooling**.
- Making a code change → obey `CLAUDE.md` (one file, one MVC layer) and `ARCHITECTURE.md`. This skill operates the machine; it does not authorize edits.

Also: **never run the release git commands or `version:sync` yourself.** Those are the human's release actions. You may explain and verify them.

---

## Provenance and maintenance

Verified 2026-07-04 against the repo at HEAD. If anything below drifts, the source files win — update this skill.

Re-verify commands:

- `sed -n '1,80p' .github/workflows/release-candidate.yml` — RC trigger, job DAG, migrate-db-before-integration-test ordering.
- `sed -n '1,120p' .github/workflows/release.yml` — production trigger, `workflow_dispatch` inputs, version:check gate, artifacts, Pages.
- `grep -n '"' package.json` — the exact `scripts` (dev, dev:e2e, tauri, version:sync, version:check) and the version SSOT.
- `sed -n '1,120p' scripts/sync-version.mjs` — the five files version:sync rewrites and the docs CTA check.
- `sed -n '1,90p' src-tauri/tauri.conf.json` — bundle targets, `createUpdaterArtifacts`, updater endpoint + pubkey, windows.
- `RELEASE.md` — branch model, RC semantics, Android signing / versionCode. **RELEASE.md and `package.json` are authoritative; this skill must never contradict them.**
