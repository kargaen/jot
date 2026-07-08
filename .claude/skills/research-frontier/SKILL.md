---
name: research-frontier
description: >-
  Load WHEN choosing an ambitious direction or judging whether an idea could genuinely
  advance Jot beyond ordinary product work — "what should we push on", "where can Jot
  lead", "is this novel enough to pursue", "could this beat the state of the art", framing
  an honest open problem, or turning a hunch into a falsifiable research milestone. A
  curated set of HONEST open problems, each anchored to an asset that already exists in
  this repo, with the first three concrete steps and a pass/fail milestone. NOT for routine
  feature work or bug-fixing — for that use change-control (workflow) and the roadmap.
---

# Research frontier — where Jot could honestly advance the state of the art

Jot is a small, calm task app. It is **not** a research lab, and nothing in this file is a
result yet. This skill exists so that when someone asks "where could we lead?" the answer is
grounded in an asset that already exists in the repo, not in wishful thinking.

**Read this first — the honesty contract:**

- Every frontier here is **OPEN** or **CANDIDATE**. None is solved.
- A frontier is only worth pursuing if it is anchored to a **real existing asset** (a file
  you can open today). The asset is the unfair advantage; the frontier is the unbuilt part.
- **No claim is a result until its falsifiable milestone is met and reproduced.** That bar is
  owned by `research-methodology` (root-cause / proof discipline), `validation-and-qa` (what
  counts as evidence and which gate decides), and `external-positioning` (what you're allowed
  to say out loud). This skill picks the target; those three decide when you've hit it.
- Do not invent numbers. When a frontier needs a baseline, the first step is always to
  **measure it**, using the tools in `diagnostics-and-tooling`.

If a request is really just a feature or a bug, this is the wrong skill — stop and use
`change-control` + the roadmap. Use this skill only when the question is genuinely "is this
direction ambitious *and* real, and how would we know if it worked?"

---

## How each frontier is structured

For every frontier below:

- **Why current SOTA falls short** — the honest gap in how this is usually done.
- **Jot's specific existing asset** — a real file/table already in the repo. This is what
  makes the problem tractable *here* and not just anywhere.
- **First 3 concrete steps IN THIS REPO** — each references a real path.
- **Falsifiable milestone** — "you have a result when…". If you can't fail it, it isn't one.
- **Status** — OPEN or CANDIDATE.

EXISTS vs UNBUILT is called out explicitly in each. Do not blur them.

---

## Frontier 1 — Capture latency: "faster than the thought"

The North Star in `README.md` (§Product Philosophy 1) is that capture should feel *faster
than the thought it is trying to save*. That is a perceptual claim. Nobody has turned it into
a defended, measured budget across desktop / mobile / widget.

**Why current SOTA falls short.** Most task apps quote a single "fast" number (often just the
local keystroke-to-render), and hide network/persist cost behind a spinner or an
eventually-consistent sync that can silently drop a write. "Feels instant" is asserted, rarely
measured end-to-end (keystroke → durably persisted), and almost never held at p95 *under
injected failure*. The interesting, honest question is: what is the perceptual budget, and can
capture stay under it at the tail while never losing a write?

**Jot's specific existing asset (EXISTS).**
- `src/utils/observability/timing.ts` — an in-memory ring buffer with `time(label, fn)` and
  `getTimingStats()` returning p50/p95/max per label. No deps, safe to call anywhere.
- It is **already wired into the capture path**: `src/router/Capture.route.tsx` wraps the save
  in `time("save", () => capture.saveDraft(...))`. So a "save" distribution already exists on
  device.
- `scripts/measure-db-latency.ts` (`npm run measure:db`) produces p50/p95/max per DB op
  (`create`, `load`, `ping(1row)`, …) against the real Supabase project.
- Optimistic UI already exists in a limited form — e.g. `src/hooks/useDashboard.ts`
  (`handleReopen` drops the row before the server confirms). This is **UI-level optimism, not a
  durable offline mutation queue** (the `store/` layer is deliberately deferred — see
  `src/store/README.md`).

**UNBUILT (the frontier).** A single measured **capture-to-durably-persisted** number per
surface (desktop / mobile / widget), a defended perceptual budget, and proof the budget holds
at p95 with **zero lost writes** when the network/DB is made to fail.

**First 3 concrete steps IN THIS REPO.**
1. Baseline the desktop/mobile path: run `npm run measure:db` (`scripts/measure-db-latency.ts`)
   for the DB round-trip, and read `getTimingStats()` for the `"save"` label already emitted by
   `src/router/Capture.route.tsx`. Record p50/p95/max — do not average.
2. Define the perceptual budget as an explicit constant with a cited rationale (the classic
   ~100 ms "feels instant" threshold is a defensible starting hypothesis, not a fact about
   Jot). Put it where the capture path can assert against it; keep the number in one place.
3. Instrument the widget path, which is currently **uninstrumented**: the native capture lands
   in `capture_queue` (`src-tauri/src/services/capture_outbox.rs`) and is drained by
   `drainCaptureOutbox()` in `src/services/sync/widgetSync.service.ts`. Add timing around the
   drain→create hop so the widget surface has its own distribution.

**Falsifiable milestone (you have a result when…).** On a fixed device and a fixed capture
corpus, capture-to-persisted p95 is **at or below the stated budget on all three surfaces**,
**and** an injected-failure run (kill the network / force the DB call to fail mid-capture)
shows **zero lost and zero duplicated tasks** across N trials, reproduced twice. If any surface
misses the budget at p95, or a single write is lost, the result is negative — report it as such.

**Status: OPEN.**

---

## Frontier 2 — Local-first correctness: provably conflict-free capture

Jot already writes captures in three places that must reconcile: the native widget outbox, the
widget snapshot DB, and Supabase. Today reconciliation is plumbed but **not proven**.

**Why current SOTA falls short.** "Local-first" and "offline-first" are marketing words far
more often than they are proofs. Most apps test the happy path (go offline, come back, it
mostly syncs) and never adversarially interleave a widget capture, an in-app edit, and a server
round-trip to show that no task is lost or duplicated. The hard part is not the storage — it's a
stated conflict model plus a test that tries to break it.

**Jot's specific existing asset (EXISTS).**
- `src-tauri/src/services/capture_outbox.rs` — `take_capture_outbox` reads **and atomically
  clears** `capture_queue` (read-all-then-DELETE in one connection), returning items oldest-first.
- `src-tauri/src/services/widget_sync.rs` — `sync_widget_db` writes the `pulse_tasks` snapshot
  inside a single transaction (`DELETE` then re-insert, `tx.commit()`) so a widget never reads a
  half-written state, and writes `last_sync_ms` to `widget_meta`.
- `src/services/sync/widgetSync.service.ts` — the TS side: `drainCaptureOutbox()` and
  `syncWidgets()` (fire-and-forget, Android-only, errors logged not thrown).
- The Rust already has `test:rust` (`cargo test --manifest-path src-tauri/Cargo.toml`) as a home
  for property/interleaving tests.

**UNBUILT (the frontier).** A written-down reconciliation **state machine** and **conflict
model**, and an adversarial test that interleaves the three writers and asserts no task is lost
or duplicated. Note two honest gaps in the current design to reason about: the outbox
read→DELETE is **not** transaction-wrapped (`conn.execute("DELETE …")` runs after the rows are
collected — a crash between create and delete could re-drain), and `syncWidgets()` swallows
errors by design.

**First 3 concrete steps IN THIS REPO.**
1. Enumerate the reconciliation state machine on paper first: the states a single capture passes
   through across `capture_queue` (outbox) → app create → Supabase → `pulse_tasks` (snapshot),
   citing the exact functions in `capture_outbox.rs`, `widget_sync.rs`, and
   `widgetSync.service.ts`. Identify every point a crash or offline window can occur.
2. Define the conflict model explicitly: what is the task identity key across the three stores,
   what "duplicate" and "lost" mean precisely, and what the intended win/merge rule is. Record it
   as prose next to the code before writing any test.
3. Write a property/interleaving test in the Rust suite (`test:rust`) that drives
   `take_capture_outbox` against a temp SQLite DB while simulating a re-drain after a partial
   failure, asserting the identity invariant. Start with the one race that already looks real:
   crash between "rows collected" and "DELETE FROM capture_queue".

**Falsifiable milestone (you have a result when…).** An adversarial interleaving test — widget
capture + in-app create + a forced mid-sync crash, run over many random interleavings — **passes
with no lost and no duplicated task**, reproduced on a clean checkout. If it finds a losing/duping
interleaving (the read→DELETE gap is a prime suspect), that finding *is* the result: a real
correctness bug, honestly reported, not a breakthrough.

**Status: OPEN.**

---

## Frontier 3 — NLP trustworthiness: deterministic parsing users can predict

`README.md` (Brilliant Basics; Guardrails) and `ROADMAP.md` commit Jot to **intentional,
single-language** natural-language capture and explicitly **against** mixed da/en parsing — and
implicitly against an LLM-in-the-loop that makes capture non-deterministic. The parser is
deterministic today. What's missing is a *number*.

**Why current SOTA falls short.** The industry reflex is to throw an LLM at capture parsing.
That buys recall but costs determinism, latency, offline capability, and explainability — the
same input can parse differently tomorrow, and you can't tell the user *why* it did what it did.
Jot's contrarian bet is that a deterministic, explainable, single-language parser can be *trusted
more* precisely because it is predictable. That bet is currently **unquantified** — there is no
published precision/recall, so "trustworthy" is an assertion.

**Jot's specific existing asset (EXISTS).**
- `src/services/capture/nlp.service.ts` — a fully deterministic, dependency-free parser:
  `parseInput`, `parseDate`, `parseRecurrence`, `parsePriority`, `parseProject`, with EN and DA
  keyword tables, a language-mode split (`parseDateEnglishOnly` / `parseDateDanishOnly` /
  auto), and a `consumed` field on every match — i.e. it **already records which span produced
  each field** (the raw material for an explanation trace).
- `src/services/capture/nlpSettings.service.ts` — the `en` / `da` / `auto` mode (localStorage
  `jot_nlp_language`), the mechanism enforcing the anti-mixed-language stance.
- `test:nlp` already exists (`tests/unit/services/nlp.test.ts` + `nlp-natural.test.ts`, run via
  tsx) — a home for a regression gate.

**UNBUILT (the frontier).** A **labeled corpus** (en + da) with gold field annotations,
**published precision/recall per field** (date, time, priority, project, recurrence) on that
fixed corpus, a machine-readable **"why did it parse this way" trace** built from the existing
`consumed` spans, and a **regression gate** in `test:nlp` that fails a PR when accuracy drops.

**First 3 concrete steps IN THIS REPO.**
1. Build a small labeled corpus as a fixture next to `tests/unit/services/nlp.test.ts`: raw input
   → expected fields, tagged by language. Start with a few dozen realistic captures per language;
   honesty about corpus size is part of the claim.
2. Add a scoring harness (invoked by `test:nlp`) that runs `parseInput` from
   `src/services/capture/nlp.service.ts` over the corpus and reports precision/recall per field.
   Report the numbers; do not tune the corpus to flatter the parser.
3. Surface the trace: every parser branch already returns `consumed` — expose it (a debug
   accessor, not new product UI — see the View Cleanliness rule) so a given capture can show
   *which substring set each field and why*.

**Falsifiable milestone (you have a result when…).** There is a **published precision/recall
number per field on a named, frozen corpus**, reproducible via `test:nlp`, **and** a regression
gate that fails when any field's score drops below the recorded baseline. The claim is only as
strong as the corpus — state its size and composition whenever you cite the number
(`external-positioning` owns how it may be phrased publicly). A low number is still a result.

**Status: OPEN.**

---

## Frontier 4 — Calm collaboration: sharing that stays invisible (CANDIDATE)

`README.md` Philosophy 4 asks that shared work "still feel human" — collaboration without the
managerial, punitive weight of enterprise PM tools. Jot enforces sharing with Postgres RLS
today. Whether RLS-enforced sharing can stay *perceptually invisible* is a real but softer,
less-certain question.

**Why current SOTA falls short.** Collaboration features usually announce themselves —
permission dialogs, role matrices, "who can see this" ceremony. The calm-software thesis is that
correct access control can be enforced rigorously underneath while staying nearly invisible in
the UI. This is harder to make falsifiable than the other three (it mixes a security property
with a perception claim), which is why it is a CANDIDATE, not OPEN with a crisp milestone.

**Jot's specific existing asset (EXISTS).**
- The collaboration RLS stack in `supabase/migrations/`: `area_members` and the
  `can_access_area` / `can_access_project` / `can_access_task` helpers, introduced in
  `20260427000000_collaboration_mvp.sql` and hardened across `20260428…_collaboration_fix.sql`,
  `20260624000000_fix_select_rls_returning.sql`, and `20260701120000_perf_rls_initplan_and_fk_indexes.sql`.
- `supabase/functions/send-space-invite/` (the invite path) and `supabase/tests/rls.test.sql`,
  `scripts/rls-ladder.ts` for access verification.
- **This stack has a rich, painful failure history** (42P17 recursion, 42501 on
  INSERT…RETURNING) — the domain theory lives in `reference-rls-and-postgres`. Do not re-derive
  it here.

**UNBUILT (the frontier).** A defensible definition of "invisible/calm" collaboration that is
*measurable* (e.g. steps/latency/interruptions added to a shared vs. solo flow), plus proof the
access model stays sound while the surface stays quiet.

**First 3 concrete steps IN THIS REPO.**
1. Before touching anything, load `reference-rls-and-postgres` — the access model has recursion
   and INSERT…RETURNING footguns; a naive change here regresses security.
2. Establish the correctness floor: extend `supabase/tests/rls.test.sql` / `scripts/rls-ladder.ts`
   so "member can see shared area, non-member cannot" is asserted and green *before* any UX work.
3. Turn "calm" into a metric: define a measurable proxy (added steps or added latency in a shared
   flow vs. the solo flow) rather than a vibe. Only then design the surface.

**Falsifiable milestone (you have a result when…).** A shared-flow experience meets a **stated,
measurable calm budget** (e.g. ≤ X added steps and ≤ Y ms vs. the solo flow) **while** the RLS
ladder proves access is exactly correct (members in, non-members out) with zero regressions.
Because the "calm" half is a chosen proxy, treat any result as provisional until the proxy itself
is validated. **This is the least certain frontier — say so when you cite it.**

**Status: CANDIDATE.**

---

## When NOT to use this skill

- **Routine feature work or a bug fix** — use `change-control` (the workflow contract) and
  `ROADMAP.md`. A roadmap item is not a research frontier.
- **You just want to prove one fix works** — that's `research-methodology` + `validation-and-qa`,
  not a frontier.
- **You need a measurement or a log**, not a direction — that's `diagnostics-and-tooling`.
- **You're writing anything user- or partner-facing about a claim** — that's
  `external-positioning`; it owns the claim bar and the wording.
- **The idea isn't anchored to a real asset in this repo** — then it isn't a Jot frontier yet.
  Don't add it here. A frontier with no existing file to stand on is a daydream.
- **You're tempted to state a result** — you may not, until its milestone is met *and reproduced*.
  Everything in this file stays labeled OPEN/CANDIDATE until then.

---

## Provenance and maintenance

- **Authored:** 2026-07-04, from a repo re-verification (README North Star, ROADMAP bets,
  `nlp.service.ts` / `nlpSettings.service.ts`, `widgetSync.service.ts`, `capture_outbox.rs`,
  `widget_sync.rs`, `timing.ts`, `measure-db-latency.ts`, collaboration migrations).
- Every frontier is deliberately labeled OPEN or CANDIDATE. If you promote one to a result,
  update its Status **and** cite the reproduced milestone evidence (per `research-methodology` /
  `validation-and-qa`) — a Status change with no linked evidence is invalid.
- **Re-verify the assets before trusting a step** (paths drift):
  - `sed -n '1,40p' src/utils/observability/timing.ts`
  - `grep -n 'time(\"save\"' src/router/Capture.route.tsx`
  - `grep -rn 'take_capture_outbox\|sync_widget_db' src-tauri/src/services/`
  - `grep -n 'drainCaptureOutbox\|syncWidgets' src/services/sync/widgetSync.service.ts`
  - `grep -n 'parseInput\|consumed\|languageMode' src/services/capture/nlp.service.ts`
  - `grep -rln 'can_access_area\|area_members' supabase/migrations/`
  - `npm run measure:db` (needs the Supabase env vars) · `npm run test:nlp` · `npm run test:rust`
- **Proof siblings:** turn each milestone into evidence with `performance-and-proof-toolkit`
  (latency p50/p95 + EXPLAIN proof recipes), `diagnostics-and-tooling` (obtain the raw numbers),
  and `research-methodology` (the evidence bar). A frontier claim is not a result until its
  falsifiable milestone is met and independently reproduced.
