---
name: architecture-contract
description: >
  Load this BEFORE adding or moving any code in Jot, to know where logic belongs and
  which imports are forbidden. Triggers: "where does this logic go", "can a view call a
  service", "can a controller import a view", "how does routing work here", "what's the
  layered route pattern", "why is the store empty", "is there a Zustand store", "what
  router does Jot use", "what are the MVC layers", "what's the data-flow direction",
  questions about system structure, dependency rules, invariants, or known weak points /
  the incomplete refactor. Also load when a plan implies touching more than one layer.
---

# Jot architecture contract

This is the map of how Jot is layered, which way data is allowed to flow, and where the
real structure diverges from the docs. Read it before you decide *where* new code goes.
It does not replace `CLAUDE.md` (the one-file/one-layer working discipline) or
`ARCHITECTURE.md`'s **Key Conventions** section — it points you at them and warns you
about the one part of `ARCHITECTURE.md` you must not trust.

## The single most important warning

**`ARCHITECTURE.md`'s "Full Tree" ASCII diagram (starting around line 21) is aspirational
and WRONG. Do not use it to locate anything.** It shows directories and files that do not
exist in the repo:

| Diagram claims | Reality (verified 2026-07-04) |
| --- | --- |
| `store/` with Zustand global state | `src/store/` contains **only `README.md`** — no store exists |
| `index.tsx` "TanStack Router / React Router root" | Routing is **`react-router-dom` `^7.18.0`** via `createBrowserRouter` in `src/router/routes.tsx`; no TanStack Router |
| `shared/` "code shared across all targets" | **No `src/shared/` directory exists** |
| `mobile/` top-level target dir | **No `src/mobile/` directory exists**; mobile views live under `src/views/pages/mobile/` |
| `Button/Button.tsx` component folders | Primitives are flat files: `src/views/components/ui/Button.view.tsx` |
| `src-tauri/src/models/` (Model layer) | **No such directory**; Rust has `lib.rs`, `main.rs`, `src/services/*.rs` |

By contrast, **`ARCHITECTURE.md`'s "Key Conventions" section (from line 248) IS accurate.**
When the tree and the conventions disagree, the conventions and the actual code win. Treat
the tree as historical intent, not documentation.

## The MVC layers as actually implemented

Verify with `find src -type f`. This is the real layout:

| Layer | Location | Holds | Verified files |
| --- | --- | --- | --- |
| **Model** | `src/models/`, `supabase/migrations/` (and Rust structs in `src-tauri/src/*.rs`) | Data shapes + pure domain predicates. No I/O. | `models/export/jotExport.ts`, `models/tasks/{taskCreation,taskPresentation,taskVisibility}.ts`, `models/tokens/apiToken.ts`, `models/shared/index.ts` |
| **View** | `src/views/`, plus `*.view.tsx` in `src/router/` | Render-first, props-in / callbacks-out. | `views/components/ui/{Button,Spinner,Toast,Toggle}.view.tsx`, `views/pages/{desktop,mobile}/**`, `router/AppShell.view.tsx`, `router/Splash.view.tsx` |
| **Controller** | `src/controllers/`, plus Tauri commands in `src-tauri/src/lib.rs` | Orchestration / business decisions. | `controllers/dashboard/dashboard.controller.ts`, `controllers/tasks/{exportTasks,saveCreateTask,taskDetail}.controller.ts`; Rust `#[tauri::command]` handlers live in `lib.rs` |
| **Hook** | `src/hooks/` | React glue between views and controllers/services. | `useAuth.tsx`, `useMobileApp.ts`, `useDashboard.ts`, `useCreateTask.ts`, `useTaskDetail.ts`, plus window/toast/preference hooks |
| **Service** | `src/services/`, plus Rust `src-tauri/src/services/*.rs` | I/O only: Supabase, Tauri, NLP, clipboard, sync. | `services/backend/{supabase,auth}.service.ts`, `services/capture/{nlp,nlpSettings}.service.ts`, `services/desktop/deepLinks.service.ts`, `services/sync/widgetSync.service.ts`, `services/tauri/clipboard.service.ts`; Rust `capture_outbox.rs`, `widget_sync.rs` |

Note: `src-tauri/src` has **no `models/` and no `commands/`/`controllers/` folder**. Rust
Tauri command handlers are defined in `lib.rs`; Rust background/I-O work is in `src/services/`.

## The one-direction data flow (invariant)

`ARCHITECTURE.md` Key Conventions defines the only permitted direction:

```
View  →  Hook  →  Controller  →  Service  →  (Supabase / Tauri / NLP)
```

Quoting the prohibitions verbatim from `ARCHITECTURE.md`:

> Views never import from `services/` or `store/` directly.
> Controllers never import from `views/`.
> Services never import from `controllers/`, `store/`, or `views/`.

Enforce these when placing new code. If a view needs data or an effect, it goes through a
hook; the hook calls a controller; the controller calls a service. Never short-circuit
upward (a service reaching into a controller) or sideways past a hook.

**Honest caveat — the view→service ban is not fully upheld yet.** `grep -rn "from '.*services" src/views`
currently finds 6 violations in 4 files: `views/pages/desktop/settings/Preferences.view.tsx`,
`views/pages/mobile/app/MobileApp.view.tsx`, `views/pages/mobile/settings/MobileSettings.view.tsx`,
`views/pages/mobile/capture/MobileCapture.view.tsx`. These are known refactor debt (see
"Known weak points"), not licence to add more. New views must obey the rule.

## The layered-route architecture (mobile)

Verify in `src/router/`. Mobile runs as a single-page app; the pattern is deliberately thin:

| Piece | File | Responsibility |
| --- | --- | --- |
| Layout owner | `AppLayout.route.tsx` | Owns the **single** `useMobileAppData(user?.id)` fetch, exposes it through `Outlet` context typed as `AppOutletContext` (`{ user, data, onComplete, notify }`). This is the one place app data is loaded. |
| Persistent frame | `AppShell.view.tsx` | The chrome: title on top, `<Outlet/>` in the middle, navbar on the bottom. Reads the deepest route's `handle: { title, exportTasks }` via `useMatches()` and pulls context via `useOutletContext()`. |
| Route containers | `Today/Upcoming/All/Logbook/Space/Project/Settings/Capture/Onboarding/TaskDetail.route.tsx`, `Index.route.tsx`, `Auth.route.tsx` | Thin wiring only: select the right slice of `AppOutletContext.data`, render a `views/pages/mobile/**` view. `routes.tsx` assembles them via `createBrowserRouter`. |

To add a header action, add a new `handle` key on the route and a render branch in
`AppShell.view.tsx` — do not thread props through every container.

**Desktop is different: it stays multi-window and route-free.** `src/App.tsx` branches on
`getCurrentWebviewWindow().label` (`windowLabel`) — `quick-capture`, `reminder*`, `task-*`,
`about`, and `main` — mounting a distinct top-level view per Tauri window instead of using
routes. `routes.tsx` also exposes `/_legacy` → `MobileApp` as a reference/legacy app; treat
it as a comparison surface, not the live path.

## Load-bearing invariants

Each is a rule the system depends on. Verify before you touch anything near it.

| Invariant | Where | Why it must hold |
| --- | --- | --- |
| **`jotExport.ts` is the sole task serializer** | `src/models/export/jotExport.ts` | It is deliberately **import-free / dependency-free** so the same file runs unchanged in the app ("copy as JSON"), in the Conduit edge function, and under Deno. A second serialization format would fork the export contract. Do not add imports to it. |
| **Conduit's security is explicit `user_id` scoping, not RLS** | `supabase/functions/conduit/index.ts` | Conduit uses the **service-role key**, which *bypasses RLS*. Every query must `.eq("user_id", <token owner>)`. That scoping IS the boundary. See the `reference-rls-and-postgres` sibling for RLS itself. |
| **Design tokens SSOT** | `src/styles/global.css` (`:root`, `:root[data-theme="dark"]`, `@media prefers-color-scheme`) | All color/spacing/radius come from `var(--token)`. Never hardcode hex in a component. Primitives live in `src/views/components/ui/`. |
| **`task.icon` Lucide pipeline** | `suggestIcon` (`utils/presentation/icons.ts`) → `getTaskDetailIconComponent` (`hooks/useTaskDetail.ts`) → `TaskIcon.view.tsx` | `task.icon` stores a Lucide *name*; it is resolved to a component through this chain and rendered — never printed as text. |
| **Mobile/desktop sharing rule** | `src/models/tasks/` | Shared task predicates/sorts/visibility live in the model layer, used by both a desktop hook and a mobile view — never copy-pasted into each. |

## Known weak points (stated honestly — these are OPEN)

Do not oversell the architecture. Verify against `REFACTOR_SUMMARY.md` and the code.

- **The MVC refactor is incomplete.** `REFACTOR_SUMMARY.md` has many unchecked boxes. Notably the whole *Boundary Enforcement* section (`[ ]` "no `src/views/**` imports from `src/services/**`", etc.) is unfinished, matching the 6 live view→service imports above.
- **`useMobileApp` extraction not finished.** `REFACTOR_SUMMARY.md`'s mobile-app section is entirely unchecked (`[ ] Audit MobileApp.view.tsx`, `[ ] Extract mobile app orchestration into a hook`). `useMobileApp.ts` (~449 lines) exists but `MobileApp.view.tsx` still owns orchestration and still imports a service.
- **`supabase.service.ts` is a monolith (~764 lines), not split by domain.** It is the single backend I/O module; there is no per-domain service decomposition yet. Adding a query here is expected today, but know it is an unresolved size/cohesion problem.
- **`store/` is deliberately empty** (`README.md` only). Global client state is intentionally deferred. Do **not** add a store (or Zustand) on a whim — that is an architecture decision, not a code task. Stop and confirm first.
- **Doc drift.** The `ARCHITECTURE.md` tree diagram (above) is stale relative to code. The Key Conventions section is current. If you fix code that a convention describes, update the convention per `CLAUDE.md`'s "Documenting New Conventions" — reference by path, never copy.

## When NOT to use this / use which sibling instead

This skill tells you **where code goes and what may import what**. For anything deeper, use:

| You actually need… | Use sibling |
| --- | --- |
| RLS policy behavior, Postgres helpers, the 42P17 / 42501 saga, migration rules | `reference-rls-and-postgres` |
| Reproducing a failure, CI/auth/JWT/Android-signing/version-drift debugging | `debugging-playbook` |
| Branch model, release/RC workflows, review discipline, commit/PR rules | `change-control` |
| How to write docs, `ARCHITECTURE.md`/README conventions, SSOT-by-reference | `docs-and-writing` |

If the request is about *how a specific subsystem works internally* rather than *which
layer owns it*, this is the wrong skill — hand off above.

## Provenance and maintenance

- **Verified:** 2026-07-04 against the working tree (Read/Grep/`find`).
- **Re-verify before trusting this skill again** (drift is the failure mode here):
  - `find src -type f` — confirm the layer map; confirm `src/store/` is README-only and no `src/shared/` or `src/mobile/` exist.
  - `grep -n "react-router-dom" package.json` — confirm the router library/version.
  - `grep -rn "from '.*services" src/views` — recount the view→service violations (was 6 in 4 files; should trend to 0).
  - `wc -l src/services/backend/supabase.service.ts` — track the monolith (was ~764).
  - `grep -n "\[ \]" REFACTOR_SUMMARY.md` — re-read open refactor boxes.
  - `find src-tauri/src -type f` — confirm Rust has no `models/` and commands live in `lib.rs`.
- If any check disagrees with a claim above, fix this skill (reference the code, don't copy it) before relying on it.
