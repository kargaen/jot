---
name: build-and-env
description: Load WHEN setting up Jot from a clean checkout or fixing a broken toolchain — "how do I build Jot", "what Node/Rust/Java/NDK version does Jot use", "cargo/tauri won't build", "RC build fails on Tauri version drift", "missing env vars", "Missing VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY throws at import", first-time environment setup, local Supabase for e2e, "db:start won't run", CI toolchain versions. This is the from-scratch environment runbook.
---

# Build & Environment — recreate Jot's dev environment from a clean checkout

You have an empty machine and a fresh clone of Jot. This file gets you to a building
frontend, a building Tauri desktop app, an optional Android APK, and a working local
Supabase stack. Every version and command below was re-verified against the repo (see
**Provenance and maintenance**). A wrong runbook is worse than none — if a fact looks
stale, re-verify it with the command listed at the bottom before trusting it.

Jot is a React 18 + Vite frontend inside a **Tauri v2** shell (Windows desktop installer +
Android APK), backed by **Supabase** (Postgres + RLS + Deno edge functions). TypeScript +
Rust. There is **no `.nvmrc`, no `rust-toolchain.toml`, and no `rust-version` pin** in
`Cargo.toml` — the authoritative version source is the CI workflow YAML, mirrored below.

## When NOT to use this skill

- **Running / releasing the app** (dev server, quick-capture window, RC/release pipeline
  mechanics, Android signing) → see the `run-and-operate` sibling.
- **The full catalogue of env vars and feature flags** and their semantics → see the
  `config-and-flags` sibling. This file lists only the vars you need to *boot* and *build*.
- **Writing or running the test suites** (unit via `tsx`, Playwright e2e, Rust, RLS ladder)
  → see the `validation-and-qa` sibling. This file only covers the environment those tests
  need to exist.
- **Deciding whether a change is allowed to land** (one-file/one-layer, migrations, gates)
  → see the `change-control` sibling.

This skill stops at "it builds and the local stack is up." It does not run product flows.

---

## 1. Toolchain matrix (exact versions, verified)

Install these before anything else. Where a version is a floating range or unpinned, that
is stated explicitly — do not substitute a guessed number.

| Tool | Version | Verified source | Notes |
| --- | --- | --- | --- |
| **Node.js** | **20** | `node-version: "20"` in both `.github/workflows/*.yml` | CI uses actions/setup-node@v4 with the major line "20". No `.nvmrc` exists; match Node 20.x. |
| **npm** | bundled with Node 20 | (no separate pin) | CI installs with `npm ci`. Use the npm that ships with your Node 20. |
| **Rust** | **stable** (unpinned) | `dtolnay/rust-toolchain@stable` in CI; no `rust-toolchain.toml`, no `rust-version` in `src-tauri/Cargo.toml` | Latest stable toolchain. Rust `tauri` crate resolves to **2.10.3** (`src-tauri/Cargo.lock`). |
| **Rust Android target** | **`aarch64-linux-android`** | `targets: aarch64-linux-android` in `release-candidate.yml` | Only needed for the Android APK build. Add via rustup. |
| **Java (JDK)** | **17** (Temurin distribution in CI) | `java-version: "17"`, `distribution: temurin` in `release-candidate.yml` | Android build only. JDK **17 exactly** — a newer JDK breaks the Gradle/AGP build. |
| **Android NDK** | **27.2.12479018** | `sdkmanager "ndk;27.2.12479018"` in `release-candidate.yml` | Android build only. Pinned to this NDK 27 revision; also sets `ANDROID_NDK_HOME`/`NDK_HOME`. |
| **Android SDK / cmdline-tools** | (SDK required; cmdline-tools `latest`) | CI uses `/usr/local/lib/android/sdk`, `cmdline-tools/latest` | Android build only. Provide a standard Android SDK; NDK is installed into it. |
| **Supabase CLI** | devDependency `supabase` **^2.98.0** (installed locally); CI invokes **`npx supabase@latest`** | `package.json` devDeps; `release-candidate.yml` uses `supabase@latest`; local `db:*` scripts call `npx supabase` | Local dev resolves the pinned devDependency via `npx supabase`. Requires **Docker** (see §4). |
| **Playwright** | `@playwright/test` **^1.59.1**, browser **chromium** | `package.json` devDeps; `playwright.config.ts` (`browserName: "chromium"`) | e2e only. After `npm install` you must download the browser (see §2). |
| **Tauri (npm)** | `@tauri-apps/api` **~2.10.0**, `@tauri-apps/cli` **^2.0.0** | `package.json` | The `~2.10.0` pin on `api` is load-bearing — see §5 known traps. |
| **Tauri (Rust)** | `tauri = "2"` (resolves 2.10.3) | `src-tauri/Cargo.toml` / `Cargo.lock` | Must stay compatible with the npm `api` line. |

Official install pages (do not copy brittle shell installers — follow the vendor docs):

- Rust / rustup: https://www.rust-lang.org/tools/install
- Tauri v2 prerequisites (per-OS system deps, Android setup): https://v2.tauri.app/start/prerequisites/
- Android Studio / SDK & NDK: https://developer.android.com/studio
- Supabase CLI: https://supabase.com/docs/guides/local-development
- Node.js: https://nodejs.org/en/download

---

## 2. Install order + build commands

Run from the repo root. Do **one** thing at a time and confirm it before the next.

1. **Install JS dependencies** (uses the lockfile):
   - Local dev: `npm install`
   - Reproducible/CI-style: `npm ci`
2. **Download the Playwright browser** (only if you will run e2e). Playwright ships its own
   browser binary separately from the npm package; follow
   https://playwright.dev/docs/browsers to download chromium after install.
3. **Build the frontend**: `npm run build` — this is exactly `tsc && vite build` (verified in
   `package.json`). It typechecks first, then emits static assets to `dist/`, which is what
   Tauri bundles (`frontendDist: "../dist"` in `src-tauri/tauri.conf.json`).
4. **Build the Tauri desktop app**: the npm script `tauri` maps to the Tauri CLI (`"tauri":
   "tauri"`). Invoke subcommands with `npm run tauri -- <args>`, e.g. `npm run tauri -- build`
   for the desktop installer. `beforeBuildCommand` in `tauri.conf.json` is `npm run build`, so
   Tauri builds the frontend for you as part of a bundle. For local dev, `npm run tauri -- dev`
   runs `beforeDevCommand` (`npm run dev`) against `devUrl` `http://localhost:1420`.
   (Launching/running specifics live in the `run-and-operate` sibling.)
5. **Build the Android APK** (optional; needs §1 Android tools + Java 17 + NDK 27): the exact
   CI command is `npm run tauri -- android build --apk` (verified in `release-candidate.yml`).
   Signing and versionCode handling are release concerns — see `run-and-operate`.
6. **Rust build in isolation** (to debug native issues without the full bundle):
   - `cargo check` / `cargo build` with `--manifest-path src-tauri/Cargo.toml` (CI runs
     `cargo check` in `working-directory: src-tauri`).
   - Rust tests: `npm run test:rust` = `cargo test --manifest-path src-tauri/Cargo.toml`.

Do not add or upgrade dependencies as a side effect of getting a build green. If a build
needs a dependency change, that is its own change under `change-control`.

---

## 3. Environment variables needed to boot and build

The frontend **throws at module import** if the two required `VITE_SUPABASE_*` vars are
absent. `src/services/backend/supabase.service.ts` (verified) does:

```
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env");
```

So `.env.local` **must** hold at least these two — dummy values are fine for a build or for
the visual mobile harness (which only needs the vars to *exist*). The committed `.env.local`
already contains dummy values (verified):

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=dummy-anon-key-for-harness-screenshots-only
```

**Frontend vars actually read from `import.meta.env`** (verified by grep of `src/`):

- `VITE_SUPABASE_URL` — **required** (throws if missing).
- `VITE_SUPABASE_PUBLISHABLE_KEY` — **required** (throws if missing); this is the anon key,
  passed as the Supabase client's anon key.
- `VITE_AUTH_REDIRECT_URL` — auth redirect target (optional at boot; consumed by auth flow).
- `VITE_E2E_TEST_EMAIL` / `VITE_E2E_TEST_PASSWORD` — read only by the local-DB smoke harness
  (`src/test-harness/localDbSmoke.tsx`); generated into `.env.e2e.local` (see §4).

Note: `VITE_SUPABASE_ANON_KEY` is **written** into the generated `.env.e2e.local` by
`scripts/local-supabase-env.mjs`, but the app code reads the anon key via
`VITE_SUPABASE_PUBLISHABLE_KEY`, not `VITE_SUPABASE_ANON_KEY`. Don't rely on the latter in
app code.

**Scripts / CI / edge-function vars** (verified in `scripts/` and `supabase/functions/`):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — `scripts/ci-integration-test.ts`.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — `scripts/measure-db-latency.ts`,
  `scripts/rls-ladder.ts`, `scripts/local-supabase-env.mjs`, edge functions (`conduit`,
  `send-space-invite`; these are injected by the Supabase runtime for deployed functions).
- `SUPABASE_TEST_USER_NAME`, `SUPABASE_TEST_USER_PASSWORD` — the signed-in test user for CI
  integration / RLS scripts.

**About `.env.e2e.example`:** it is *not* a filled-in template — it is a comment file
explaining that the real working file is `.env.e2e.local` (git-ignored), populated
automatically from `npx supabase status -o env` by `npm run db:env:e2e`. Do not hand-author
`.env.e2e.local`; generate it (see §4). The authoritative, exhaustive env/flag catalogue
lives in the `config-and-flags` sibling — this section is only the boot/build minimum.

---

## 4. Local Supabase stack for e2e

The e2e tests and the DB-latency/RLS scripts run against a **local** Supabase stack, which
runs in Docker. **Docker must be installed and running** — `npx supabase start` launches the
Postgres/GoTrue/etc. containers; without Docker it fails. Supabase CLI docs:
https://supabase.com/docs/guides/local-development

npm scripts (verified in `package.json`):

- `npm run db:start` → `npx supabase start` — boots the local stack (Docker).
- `npm run db:reset` → `npx supabase db reset` — drops and re-applies all migrations from
  `supabase/migrations/` (append-only, filename order) to the fresh local DB.
- `npm run db:env:e2e` → `node scripts/local-supabase-env.mjs` — reads `npx supabase status`
  and writes `.env.e2e.local` (API URL + anon key + service-role key + generated test-user
  email/password), which the e2e frontend (`vite --mode e2e`) and seed script consume.
- `npm run db:seed:e2e` → `node scripts/seed-local-test-data.mjs` — creates the test user via
  the service-role admin client and seeds deterministic fixture rows (areas/projects/tags/
  tasks with fixed UUIDs).
- `npm run db:prepare:e2e` → runs **all four in order**: `db:start && db:reset && db:env:e2e
  && db:seed:e2e`. This is the one-shot "give me a working local backend" command.

`npm run dev:e2e` first runs `db:env:e2e`, then `vite --mode e2e` so the app points at the
local stack. Running the e2e Playwright suite is owned by `validation-and-qa`.

---

## 5. Known traps (verified)

- **Tauri npm/Rust version drift breaks RC builds.** `@tauri-apps/api` is pinned to
  **`~2.10.0`** on purpose. Installing `@tauri-apps/plugin-opener` once floated `api` to
  2.11.1 while the Rust `tauri` crate was 2.10.3, and Tauri's build **rejects** that mismatch.
  Fixed in commit **06fe17e** ("align Tauri versions (pin @tauri-apps/api to 2.10.x)"). If you
  bump any `@tauri-apps/*` package, confirm `@tauri-apps/api` still resolves to 2.10.x and
  matches the Rust `tauri` crate (`src-tauri/Cargo.lock`, currently 2.10.3). Do **not** widen
  this pin casually.
- **Missing `VITE_SUPABASE_*` throws at import** (not at runtime call). A build/dev/harness
  session dies immediately with `Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY`
  if `.env.local` lacks them. Dummy values satisfy the guard for builds and the visual harness.
- **Android build is version-sensitive: Java 17 + NDK 27.2.12479018 exactly.** A newer JDK or
  a different NDK revision breaks the Gradle/Android-Gradle-Plugin/Tauri-Android build. Match
  the CI versions in §1; these are the only combination proven to build.
- **Docker required for the local stack.** `db:start`/`db:prepare:e2e` silently depend on a
  running Docker daemon.

---

## Provenance and maintenance

- Verified: **2026-07-04** against the repo working tree (not memory).
- Primary sources: `.github/workflows/release-candidate.yml`, `.github/workflows/release.yml`,
  `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`,
  `.env.local`, `.env.e2e.example`, `src/services/backend/supabase.service.ts`,
  `scripts/local-supabase-env.mjs`, `scripts/seed-local-test-data.mjs`, `playwright.config.ts`.
- Re-verify commands (run before trusting a version here):
  - `grep -n "node-version" .github/workflows/*.yml`
  - `grep -n "java-version\|ndk;\|targets:" .github/workflows/release-candidate.yml`
  - `cat src-tauri/Cargo.toml` and `grep -A1 '^name = "tauri"$' src-tauri/Cargo.lock`
  - `grep -n '"@tauri-apps/api"\|"@playwright/test"\|"supabase"' package.json`
  - `grep -n "VITE_SUPABASE\|Missing VITE" src/services/backend/supabase.service.ts`
  - `sed -n '1,32p' package.json` (the `scripts` block — build/db/test commands)
  - `git show --stat 06fe17e` (the Tauri version-pin fix)
- There is **no** `.nvmrc` and **no** `rust-toolchain.toml`/`rust-version` pin; if one is added
  later it becomes the authority and this matrix must be updated to reference it.
