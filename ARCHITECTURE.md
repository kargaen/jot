# Jot — Project Folder Structure

### React · Tauri · Supabase · Rust · TypeScript · MVC

---

## Architecture Philosophy

The MVC split in Jot maps to three clear layers:

| Layer          | Where it lives                                                              | Responsibility                                                                        |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Model**      | `src/models/`, `src-tauri/src/models/`, `supabase/migrations/`, `shared/`   | Shape of data — TypeScript interfaces, Zod schemas, Rust structs, SQL schema          |
| **View**       | `src/views/`                                                                | Pure presentation — React components that receive props and emit events, nothing else |
| **Controller** | `src/controllers/`, `src-tauri/src/commands/`, `src-tauri/src/controllers/` | Business logic — orchestrates models, calls services, drives view state               |

Services (`src/services/`) sit beneath the controller layer and handle all I/O: Supabase queries, Tauri `invoke()` bridges, and NLP parsing. Controllers call services; views never call services directly.

---

## Full Tree

```
jot/
│
├── src/                                   # React / TypeScript frontend
│   ├── main.tsx                           # Entry point
│   ├── App.tsx                            # Root component, router mount
│   │
│   │── models/                            # [MODEL] TypeScript data contracts
│   │   ├── index.ts                       # Barrel export
│   │   ├── task.model.ts                  # Task interface + Zod schema
│   │   ├── space.model.ts                 # Space interface + Zod schema
│   │   ├── project.model.ts               # Project interface + Zod schema
│   │   ├── user.model.ts                  # User / auth model
│   │   └── pulse.model.ts                 # Pulse / daily-focus model
│   │
│   ├── views/                             # [VIEW] Pure presentational components
│   │   ├── components/                    # Reusable UI atoms & molecules
│   │   │   │
│   │   │   ├── ui/                        # Design-system primitives (no domain logic)
│   │   │   │   ├── Button/
│   │   │   │   │   ├── Button.tsx
│   │   │   │   │   └── Button.module.css
│   │   │   │   ├── Input/
│   │   │   │   ├── Modal/
│   │   │   │   ├── Badge/
│   │   │   │   ├── Tooltip/
│   │   │   │   └── index.ts               # Barrel
│   │   │   │
│   │   │   ├── task/                      # Task-domain view components
│   │   │   │   ├── TaskItem.view.tsx      # Single task row (props-in / callbacks-out)
│   │   │   │   ├── TaskList.view.tsx      # Sorted/grouped task list
│   │   │   │   ├── TaskDetail.view.tsx    # Expanded task panel
│   │   │   │   └── TaskForm.view.tsx      # Create / edit form (controlled)
│   │   │   │
│   │   │   ├── space/
│   │   │   │   ├── SpacePicker.view.tsx
│   │   │   │   └── SpaceSidebar.view.tsx
│   │   │   │
│   │   │   ├── project/
│   │   │   │   ├── ProjectCard.view.tsx
│   │   │   │   └── ProjectList.view.tsx
│   │   │   │
│   │   │   ├── capture/
│   │   │   │   ├── QuickCapture.view.tsx  # Single-line global capture bar
│   │   │   │   ├── CaptureModal.view.tsx  # Expanded capture (desktop shortcut)
│   │   │   │   └── ParsePreview.view.tsx  # NLP parse result preview chips
│   │   │   │
│   │   │   └── pulse/
│   │   │       ├── PulsePanel.view.tsx    # Today's focus surface
│   │   │       └── PulseItem.view.tsx
│   │   │
│   │   └── pages/                         # Route-level page views
│   │       ├── InboxPage.view.tsx         # Uncategorized / new tasks
│   │       ├── TodayPage.view.tsx         # Pulse / due-today view
│   │       ├── ProjectPage.view.tsx       # Single project detail
│   │       ├── SpacePage.view.tsx         # Space overview
│   │       ├── SearchPage.view.tsx        # Global search results
│   │       └── SettingsPage.view.tsx
│   │
│   ├── controllers/                       # [CONTROLLER] Orchestration & business logic
│   │   ├── task.controller.ts             # Create, update, complete, archive tasks
│   │   ├── space.controller.ts            # Switch, create, manage spaces
│   │   ├── project.controller.ts          # Project CRUD, member management
│   │   ├── capture.controller.ts          # NLP parse → task creation pipeline
│   │   ├── pulse.controller.ts            # Build today's focus list, surface ordering
│   │   └── sync.controller.ts             # Optimistic updates, conflict resolution
│   │
│   ├── hooks/                             # Thin React wrappers over controllers
│   │   ├── useTask.ts                     # useTask() → { tasks, create, complete, ... }
│   │   ├── useSpace.ts
│   │   ├── useProject.ts
│   │   ├── useCapture.ts                  # Binds QuickCapture → capture.controller
│   │   ├── usePulse.ts
│   │   ├── useSync.ts                     # Realtime subscription lifecycle
│   │   └── useKeyboardShortcuts.ts        # Global hotkey bindings
│   │
│   ├── services/                          # I/O boundary — called by controllers only
│   │   ├── supabase/
│   │   │   ├── client.ts                  # Supabase client singleton
│   │   │   ├── tasks.service.ts           # DB queries for tasks
│   │   │   ├── spaces.service.ts
│   │   │   ├── projects.service.ts
│   │   │   ├── users.service.ts
│   │   │   └── realtime.service.ts        # Supabase Realtime channel setup
│   │   │
│   │   ├── tauri/
│   │   │   ├── bridge.ts                  # Typed invoke() wrapper factory
│   │   │   ├── tasks.bridge.ts            # invoke("create_task", ...) etc.
│   │   │   ├── notifications.bridge.ts    # Native notification calls
│   │   │   └── window.bridge.ts           # Focus, minimise, quick-capture window
│   │   │
│   │   └── nlp/
│   │       ├── parser.ts                  # Tokenise + classify raw capture string
│   │       └── rules.ts                   # Deterministic date / priority / project rules
│   │
│   ├── store/                             # Global client state (Zustand)
│   │   ├── index.ts                       # Store composition
│   │   ├── task.store.ts                  # Tasks slice
│   │   ├── space.store.ts                 # Active space, space list
│   │   ├── project.store.ts
│   │   └── ui.store.ts                    # Modal state, sidebar open, theme
│   │
│   ├── router/
│   │   ├── index.tsx                      # TanStack Router / React Router root
│   │   └── routes.ts                      # Route definitions + lazy imports
│   │
│   ├── styles/
│   │   ├── tokens.css                     # Design tokens (color, spacing, radius, type)
│   │   ├── reset.css
│   │   └── globals.css
│   │
│   └── utils/                             # Pure, stateless helper functions
│       ├── date.ts                        # Formatting, relative-time, due-soon checks
│       ├── sort.ts                        # Task / project sort strategies
│       ├── format.ts                      # Title case, truncation, etc.
│       └── platform.ts                    # isTauri(), isMobile(), isDesktop()
│
│
├── src-tauri/                             # Tauri / Rust desktop shell
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/                      # Tauri v2 permission declarations
│   │   └── default.json
│   ├── icons/
│   └── src/
│       ├── main.rs                        # Binary entry, Tauri builder setup
│       ├── lib.rs                         # Library root, command registration
│       │
│       ├── models/                        # [MODEL] Rust data structs (serde in/out)
│       │   ├── mod.rs
│       │   ├── task.rs                    # Task struct, impl
│       │   ├── space.rs
│       │   ├── project.rs
│       │   └── user.rs
│       │
│       ├── commands/                      # Tauri #[tauri::command] handlers
│       │   ├── mod.rs                     # register_commands() fn
│       │   ├── tasks.rs                   # create_task, update_task, delete_task
│       │   ├── spaces.rs
│       │   ├── projects.rs
│       │   ├── capture.rs                 # parse_capture_string command
│       │   └── notifications.rs           # schedule_reminder, cancel_reminder
│       │
│       ├── controllers/                   # [CONTROLLER] Rust business logic
│       │   ├── mod.rs
│       │   ├── task_controller.rs         # Orchestrates model + persistence
│       │   ├── space_controller.rs
│       │   └── sync_controller.rs         # Local cache write-through logic
│       │
│       ├── services/                      # Rust-side I/O
│       │   ├── mod.rs
│       │   ├── db.rs                      # SQLite (offline cache via sqlx)
│       │   └── supabase.rs                # REST / realtime calls from Rust layer
│       │
│       └── utils/
│           ├── mod.rs
│           ├── nlp.rs                     # Rust-side fast NLP for offline capture
│           └── errors.rs                  # Unified AppError type
│
│
├── supabase/                              # [MODEL] Database schema + backend logic
│   ├── config.toml
│   ├── seed.sql
│   ├── migrations/
│   │   ├── 20240101_01_init.sql           # users, auth setup
│   │   ├── 20240101_02_spaces.sql
│   │   ├── 20240101_03_projects.sql
│   │   └── 20240101_04_tasks.sql          # tasks, recurrence, priority, due_date
│   └── functions/                         # Edge functions (Deno)
│       ├── notify/
│       │   └── index.ts                   # Push notification dispatch
│       └── nlp-enhance/
│           └── index.ts                   # Optional server-side parse enrichment
│
│
├── mobile/                                # Mobile target overrides
│   ├── android/                           # Tauri Android shell (or Capacitor)
│   ├── ios/                               # Tauri iOS shell
│   └── src/
│       ├── widgets/                       # Home-screen / lock-screen widgets
│       │   └── QuickCaptureWidget/
│       │       ├── widget.tsx             # Widget UI
│       │       └── widget.controller.ts   # Widget-specific capture logic
│       └── overrides/                     # Mobile-first view replacements
│           ├── CaptureBar.mobile.view.tsx # Replaces desktop CaptureBar
│           └── PulsePanel.mobile.view.tsx
│
│
├── shared/                                # Code shared across all targets
│   ├── types/
│   │   └── index.ts                       # Common TS types (TaskStatus, Priority, etc.)
│   ├── constants/
│   │   └── index.ts                       # APP_NAME, MAX_TITLE_LENGTH, etc.
│   └── validation/
│       └── schemas.ts                     # Zod schemas — single source of truth,
│                                          # mirrored by Rust serde structs
│
│
├── tests/
│   ├── unit/
│   │   ├── models/                        # Schema validation, model transforms
│   │   ├── controllers/                   # Controller logic, mocked services
│   │   └── services/                      # Service calls, mocked Supabase client
│   ├── integration/
│   │   └── supabase/                      # Against local Supabase instance
│   └── e2e/
│       ├── desktop/                       # Playwright / Tauri driver
│       └── mobile/                        # Detox or Appium
│
│
├── .github/
│   └── workflows/
│       ├── ci.yml                         # Lint, typecheck, unit tests
│       ├── release-desktop.yml            # Tauri build → Windows NSIS + MSI
│       └── release-mobile.yml             # Tauri Android/iOS builds
│
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── README.md
```

---

## Key Conventions

### Naming

| Artefact        | Convention             | Example                      |
| --------------- | ---------------------- | ---------------------------- |
| View component  | `Name.view.tsx`        | `TaskItem.view.tsx`          |
| Mobile override | `Name.mobile.view.tsx` | `CaptureBar.mobile.view.tsx` |
| Controller      | `domain.controller.ts` | `capture.controller.ts`      |
| Service         | `domain.service.ts`    | `tasks.service.ts`           |
| Tauri bridge    | `domain.bridge.ts`     | `notifications.bridge.ts`    |
| Store slice     | `domain.store.ts`      | `task.store.ts`              |
| Hook            | `useDomain.ts`         | `usePulse.ts`                |

### Data flow (strict, one direction)

```
View  →  Hook  →  Controller  →  Service  →  (Supabase / Tauri / NLP)
                      ↓
                    Store
                      ↓
                    View (re-render)
```

Views never import from `services/` or `store/` directly.  
Controllers never import from `views/`.  
Services never import from `controllers/`, `store/`, or `views/`.

### Commenting Practice

Prefer self-explanatory code over explanatory comments. Add comments only where they provide context the code itself cannot express quickly, such as architectural intent, non-obvious constraints, workflow invariants, edge-case reasoning, or why a particular approach was chosen. Do not add comments that merely restate what the next line of code already says. A small number of high-value comments is preferred over pervasive low-signal commentary.

- Comment `why`, not `what`.
- Comment invariants, assumptions, and surprising behavior.
- Comment cross-layer or cross-domain decisions that would be hard to infer locally.
- Avoid line-by-line narration of obvious code.
- If a function needs many explanatory comments, prefer refactoring it into clearer names and smaller units first.

Comments should reduce future confusion, not decorate code.

### Shared validation boundary

`shared/validation/schemas.ts` holds Zod schemas that are the **single source of truth** for data shapes. The Rust `models/` structs must stay in sync with these schemas — any schema change is a cross-layer change.

### Mobile view resolution

At runtime, a small resolver in `utils/platform.ts` returns `isMobile()`. The router lazy-imports the `.mobile.view.tsx` override when it exists, falling back to the default `.view.tsx`. This keeps mobile surfaces as thin deltas, not full copies.

### Desktop / mobile logic sharing

Views are always platform-specific — rendering differs too much to share. Everything beneath the view layer should be shared by default:

| Layer | Share? | Rationale |
|---|---|---|
| `models/` — interfaces, predicates, sort/filter functions | **Yes, always** | Pure functions with no platform dependency |
| `services/` — Supabase queries, sync | **Yes, always** | I/O is the same regardless of platform |
| `hooks/` — data hooks (`useMobileAppData`, `useDashboard`) | **Partially** — extract shared predicates/selectors into `models/`, keep platform-specific orchestration separate | Hooks own UI lifecycle and cannot be shared wholesale |
| `controllers/` | **Yes** where logic is platform-agnostic | Avoid duplicating business rules |
| `views/` | **No** — always platform-specific | Rendering and interaction patterns differ |

Concrete rule: if the same predicate, filter, or sort function appears in both a desktop hook and a mobile view, it belongs in `src/models/tasks/` as a pure exported function. Neither the desktop hook nor the mobile view should own the rule — the model does.

### Styling & design system

Design tokens are the **single source of truth** for color, radius, and shadow, and live as CSS variables in `src/styles/global.css` (`:root` for light; `:root[data-theme="dark"]` and the `prefers-color-scheme` block for dark). Components reference tokens via `var(--token)` — never hardcode hex/rgba in inline styles. Add or change a color in `global.css` only; because everything references the tokens, light/dark stay in sync automatically. (See `global.css` for the current token names.)

Reusable UI primitives live in `src/views/components/ui/` — e.g. `Button.view.tsx` (variants × sizes, `loading`/`disabled`/`fullWidth`), `Spinner.view.tsx`, `Toggle.view.tsx`, `Toast.view.tsx` (fixed bottom status toast, message + optional badge). Each component's own file is the source of truth for its props.

When you need a control, resolve it in this order (this is the concrete form of CLAUDE.md's "Avoid Custom Markup and Styling" principle):

1. **Reuse** an existing primitive in `src/views/components/ui/` that already does the job.
2. **Extend** that primitive — add a variant/size/prop — so the next caller benefits too.
3. **Compose** existing primitives + `var(--token)` styles.
4. **Custom, last resort only:** if none of the above fit, build a new token-driven primitive in `src/views/components/ui/` (never an inline one-off), and record it under **Key Conventions** per "Documenting New Conventions" in CLAUDE.md.

Never re-implement a button/input/spinner/toggle/chip inline when a primitive exists, and never copy a primitive's styles into a bespoke element.

Task icons are Lucide names stored on `task.icon`: auto-derived from the title by `suggestIcon` (`src/utils/presentation/icons.ts`), resolved to a component by `getTaskDetailIconComponent` (`src/hooks/useTaskDetail.ts`), and rendered through `src/views/pages/mobile/components/TaskIcon.view.tsx`. Always render an icon through that path — never print the icon name as text.

Visual review without an Android build: the browser harness `mobile-harness.html` → `src/test-harness/mobileScreens.tsx` mounts the real mobile screens and a `Button` gallery with mock data, honors `?theme=dark|light` to review both themes, and `?frame=shell` to review the `AppShell` layout full-bleed (`npm run dev`, then open the page). The harness needs the two `VITE_SUPABASE_*` env vars present (even dummy values in `.env.local`) or shared services throw at import.

### Routing & navigation

Client routing lives in `src/router/` and uses React Router (`react-router-dom`); the tree is defined in `src/router/routes.tsx` and mounted for mobile in `src/App.tsx` (desktop stays multi-window via the Tauri `windowLabel` switch — it has no routes). The route tree is the single source of truth for paths and titles.

The protected app uses a **layered layout route** so the persistent frame is built once:

- `AppShell.view.tsx` is the presentational frame — title (top), scrollable `<Outlet/>` (middle), navbar (bottom), always visible. Child surfaces render only into the Outlet and never rebuild the title or navbar. Each route declares its title via `handle: { title }`, which the shell reads with `useMatches`.
- `AppLayout.route.tsx` is the layout route element: it owns the single `useMobileAppData` fetch and hands it to children through the Outlet context (`AppOutletContext`). Screens read it with `useOutletContext<AppOutletContext>()` — one fetch shared across routes, not one per screen.
- **Route containers** are named `*.route.tsx` (e.g. `Today.route.tsx`, `Upcoming.route.tsx`): thin composition that reads shared data/params, wires callbacks (navigate, complete), and renders a `views/pages/.../*.view.tsx`. Views stay presentational; containers do the wiring.

The current app is kept verbatim at `/_legacy` as a working reference during the port; `/` redirects there until screens are migrated, then flips to `/today` and `/_legacy` is removed.
