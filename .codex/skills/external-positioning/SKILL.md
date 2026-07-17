---
name: external-positioning
description: >-
  Load WHEN working on anything that leaves Jot's boundary or is externally
  visible: the "Conduit API", "export tasks", "JotExport schema", a "personal
  API token" (jot_...), a "Home Assistant integration" or any third-party
  integration, "release channels" (rc vs stable, installers, APK, docs site),
  or public-facing docs/claims — including any question shaped like "what can
  we claim", "is this novel", "is this shipped". Use it before writing external
  claims, exposing a new HTTP surface, or describing Jot to the outside world.
---

# External-facing surfaces & positioning

This skill is the honest map of everything Jot exposes to the outside world, and
the bar you must clear before saying anything true about it. Jot is a small,
calm task app — not a research lab. Keep claims proportional. Unproven stays
labeled unproven.

Read this before you touch a boundary surface or write a word of external copy.
Verify against the code — the paths below are the source of truth, this document
is a guide to them.

## 1. The Conduit API — Jot's only external HTTP surface

`supabase/functions/conduit/index.ts` is the single HTTP endpoint external tools
use to read and add tasks. Two routes, both under `/conduit/tasks`:

- `GET /conduit/tasks` — extracts tasks and returns a JotExport v1 envelope
  (built via `serializeTasks`). Query params: `status` (default `todo`), `since`
  (updated-at lower bound), `project` (name or UUID, resolved per owner),
  `limit` (clamped 1–1000, default 200). Only top-level tasks (`parent_task_id`
  is null), ordered by `sort_order`.
- `POST /conduit/tasks` — inserts one task (`{...}`) or a batch
  (`{ "tasks": [...] }`, max 50). It mirrors the app's create-task semantics:
  project resolution by name **or** UUID, area fallback (`resolveAreaId` — uses
  the given area, else the owner's first area by `sort_order`, else creates a
  "Personal" area), and tag auto-create (`resolveTagIds` upserts on
  `user_id,name`). A task with a resolved project gets `area_id = null`;
  otherwise it falls back to an area. Returns the created tasks as JotExport v1
  with status 201.

### Auth and the security boundary — read this twice

Auth is a **personal API token**, not a JWT. Callers send
`Authorization: Bearer jot_...`. The function is deployed with `verify_jwt=false`
(see `supabase/config.toml` `[functions.conduit]`) — the platform does not check
a JWT; the function verifies the token itself in `authenticate()` by SHA-256
hashing the presented token and matching a non-revoked row in `api_tokens`.

The function runs with the **service-role key**, which **bypasses RLS entirely**.
There is no Postgres safety net here. The comment at the top of the file states
the rule exactly:

> This function runs with the service role key, which bypasses RLS — every query
> below explicitly scopes `user_id` to the token's owner. That scoping IS the
> security boundary here.

So: every `supabase.from(...)` call in this file MUST carry `.eq("user_id",
userId)` (or otherwise constrain to the token owner). If you add a query without
that scope, you have handed one user another user's data. This is the opposite
posture from the rest of the app, where RLS is the enforcer — here your code is
the enforcer. For how RLS protects everything *outside* Conduit, see the
`reference-rls-and-postgres` sibling skill; do not conflate the two.

### Tokens

`src/models/tokens/apiToken.ts` generates `"jot_" + 32 random bytes`
(base64url), hashes it with SHA-256, and returns `{ plaintext, hash }`. Only the
hash is persisted (`api_tokens` table, migration
`supabase/migrations/20260702*_api_tokens.sql`; persisted via
`src/services/backend/supabase.service.ts`). The plaintext is shown to the user
once, at creation, and never stored or re-shown. The `api_tokens` table itself
carries normal owner-scoped RLS policies (`user_id = (select auth.uid())`) for
management from the app — that RLS is separate from the service-role Conduit
path.

### Example shape (verify the route before quoting it)

```sh
# read todo tasks
curl -H "Authorization: Bearer jot_XXXX" \
  "https://<project>.supabase.co/functions/v1/conduit/tasks?status=todo&limit=50"

# add a task
curl -X POST -H "Authorization: Bearer jot_XXXX" \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy milk","project":"Errands","tags":["shopping"]}' \
  "https://<project>.supabase.co/functions/v1/conduit/tasks"
```

Re-read `index.ts` `Deno.serve` handler before publishing any concrete URL or
param — the routing only checks that the path ends with `/tasks`.

## 2. JotExport v1 — the SSOT export contract

`src/models/export/jotExport.ts` owns the JotExport v1 schema (`JotExportV1`:
`format: "jot.export"`, `version: 1`, `exported_at`, `task_count`, `tasks[]`)
and the `serializeTasks` function. It is **deliberately dependency-free and
import-free** so the exact same module runs unchanged in the browser/WebView
(Vite) and in Deno (the Conduit edge function imports it by relative `.ts` path:
`../../../src/models/export/jotExport.ts`).

The rule: **every surface that exports or extracts tasks goes through this
module.** Today that is the in-app "copy as JSON" action and the Conduit
function. Never hand-roll a second serialization format — if the two surfaces
diverge, the contract is broken. If you need a new field on exported tasks, add
it here once; both surfaces inherit it. `serializeTasks` is pure and
deterministic when you pass `exportedAt`, which is what makes it testable.

Note `tiptapToText` flattens the TipTap/ProseMirror `description` JSON into
`description_text` so automation consumers don't parse the editor format.

## 3. Release channels — the external artifacts

Jot ships through two channels plus a docs site:

- **`rc` prerelease (from `dev`)** — every push to `dev` runs
  `.github/workflows/release-candidate.yml` and publishes to a single reusable
  `rc` tag (deleted and recreated each run), marked pre-release. Produces the
  Windows installer and — RC-only so far — a signed **Android APK** uploaded to
  the `rc` release. There is **no production Android release yet**.
- **`v<version>` stable (from `master`)** — `.github/workflows/release.yml`.
  Produces the Windows installer + updater and a GitHub Release tagged
  `v<version>`, and deploys `docs/` to GitHub Pages.

### release.yml release logic (verified 2026-07-04)

In `release.yml` the `SHOULD_RELEASE` output is true when any of:

1. the ref is a **`v*` tag** push (the `push.tags: - "v*"` trigger), or
2. a **`workflow_dispatch`** run with `publish_release=true`, or
3. a **push to `master`** where the `v<version>` tag does **not** already exist:

```
elif [[ "${GITHUB_REF_NAME}" == "master" && "${TAG_EXISTS}" == "false" ]]; then
  SHOULD_RELEASE="true"
```

So a push to `master` with a bumped version cuts the release; if the tag already
exists the release is **skipped** (the same version is never re-released), while
`docs/` still deploys to Pages. This branch was previously commented out —
diverging from `RELEASE.md`'s prose — and was re-enabled 2026-07-04, so the code
and the doc now agree. When describing release behavior, trust `release.yml`.

Android signing details (self-signed keystore in GitHub secrets, versionCode =
`1000002 + run_number`, signature-drift "App not installed" trap) live in
`RELEASE.md` — accurate there; don't restate them into claims.

## 4. What's novel vs standard — be honest

Do not oversell. The stack is mostly conventional, and that's fine:

**Standard (claim nothing special):**

- Tauri v2 for cross-platform desktop/mobile shell.
- Supabase (Postgres + RLS + Deno edge functions) as backend.
- React 18 + Vite frontend in an MVC layering.

**Genuinely differentiated (defensible, still modest):**

- The **calm/fast capture philosophy** — "faster than the thought," strong
  defaults over configuration (see `README.md`). A product stance, not tech.
- **Single-language deterministic NLP** — Danish *or* English, mixed-language
  intentionally unsupported, no LLM dependency in the capture path. The anti-LLM
  determinism is the point.
- The **layered-route single-fetch pattern** — `AppLayout.route.tsx` owns one
  data fetch fanned out via outlet context (see `ARCHITECTURE.md` Key
  Conventions).
- The **dependency-free serializer shared app↔edge** (`jotExport.ts`, §2) — one
  contract, two runtimes, zero drift.

**Aspirational — RESEARCH / UNPROVEN, NOT shipped** (from `ROADMAP.md`, all
unchecked): Outlook integration research, email/mailbox-to-Jot capture research,
verified HTTPS app links / universal links, expanded deep-link routes. Label
these as research items every time. Do not describe them as capabilities, and do
not imply a timeline. See `research-frontier` for how live-but-unproven work is
tracked.

## 5. The reproducibility / claim bar

**No external claim ships without a named, runnable check behind it.** No claim
by eyeball, memory, or vibe. Before you assert a performance number, a
capability, or an integration works:

- **Latency / perf** → `npm run measure:db` (`scripts/measure-db-latency.ts`,
  p50/p95 per DB op). Quote its output, not a guess.
- **CRUD / RLS correctness** → `npx tsx scripts/ci-integration-test.ts` (real
  signed-in user against Supabase, the CI integration test).
- **Conduit behavior** → an actual `curl` against a deployed function with a
  real token (§1). If you can't reproduce the request, you can't claim the
  behavior.

If there is no command that reproduces the claim, the claim is not ready — either
build the check or downgrade the statement to "unproven." This ties directly to
`research-methodology` (how to design an honest measurement) and
`validation-and-qa` (which suites gate what). Reference those siblings for the
rigor; this skill just holds the line that external-facing statements are
gated by them.

## When NOT to use this

- Internal-only work that never crosses Jot's boundary — an in-app view, a
  controller, an internal model — is out of scope. Use the relevant MVC / layer
  skills instead.
- Deep RLS policy design or the collaboration recursion saga → that is
  `reference-rls-and-postgres`, not here. This skill only borrows the
  service-role boundary fact for Conduit.
- Deciding *whether* an experiment is worth running or how to measure it →
  `research-methodology` / `research-frontier`. This skill governs what you may
  *say* once something is proven, not the proving.
- Test-suite mechanics and gating → `validation-and-qa`.

## Provenance and maintenance

Verified against the repo on **2026-07-04** by direct Read/Grep of every path
cited. Re-verify before trusting this skill after any boundary change:

- Conduit routes, auth, service-role scoping: read
  `supabase/functions/conduit/index.ts` and `supabase/config.toml`
  `[functions.conduit]`.
- Token model: `src/models/tokens/apiToken.ts` +
  `supabase/migrations/20260702*_api_tokens.sql`.
- Export contract: `src/models/export/jotExport.ts` and `ARCHITECTURE.md`
  "Data export & the Conduit API".
- Release reality: read `.github/workflows/release.yml` (the `SHOULD_RELEASE`
  block) and `release-candidate.yml`; compare against `RELEASE.md` and flag any
  new divergence.
- Roadmap status: `ROADMAP.md` — re-check whether any "research" item has
  actually shipped before upgrading its language.
