# 2. Full Tree

Verified EPIC-001 boundary-enforcement additions (2026-07-17): `scripts/check-view-service-imports.ts` owns the view→service import scan, `tests/unit/models/import-boundary.test.ts` gates it, and `package.json` exposes it through `test:boundaries` and the standard code test. Service-backed view behaviours now route through hooks: `src/hooks/usePreferences.ts`, `src/hooks/useMobileApp.ts`, `src/hooks/useMobileSettings.ts`, `src/hooks/useMobileCapture.ts`, and `src/hooks/useReminderWindowShell.ts`.

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
