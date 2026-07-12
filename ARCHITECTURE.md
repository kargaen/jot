# Jot — Project Folder Structure

### React · Tauri · Supabase · Rust · TypeScript · MVC

---

## §0 North Star

Written by the project owner, 2026-07-12: **attention is opt-in, capture is not.**
Full text in `architecture/constitution/00-north-star.md`. Every epic's §5 answers to it.

---

## Write Policy

Three content classes. This table is itself Constitution content.

| Class | Content | Written by | Agent may |
|---|---|---|---|
| **Constitution** | Principles, conventions, naming, agent working rules, branch model | Humans, by review | Cite. Never edit. |
| **Description** | Repository structure, current implementation, tech stack, API surface | `epic-closeout`, after a slice ships | Amend, reactively |
| **Deferred** | Open questions, "to be formalized later" | Nobody | Evict to an epic |

---

## Index

Section numbers never change once assigned. A letter suffix (`9a`, `9b`) marks a section that
was split from one that mixed classes — both halves trace to the same original heading.

| § | File | Class | Contains |
|---|---|---|---|
| 0 | `architecture/constitution/00-north-star.md` | Constitution | North star: attention is opt-in, capture is not |
| 1 | `architecture/constitution/01-architecture-philosophy.md` | Constitution | MVC layer model, service boundary rule |
| 2 | `architecture/description/02-repository-structure.md` | Description | Annotated folder tree (**known stale** — see Findings below) |
| 3 | `architecture/constitution/03-naming-conventions.md` | Constitution | File-naming table by artefact type |
| 4 | `architecture/constitution/04-data-flow.md` | Constitution | One-direction data flow, import prohibitions |
| 5 | `architecture/constitution/05-commenting-practice.md` | Constitution | When and how to comment |
| 6 | `architecture/description/06-shared-validation-boundary.md` | Description | Zod/Rust schema sync boundary (**possibly stale** — see Findings) |
| 7 | `architecture/description/07-mobile-view-resolution.md` | Description | `.mobile.view.tsx` override resolver (**possibly stale** — see Findings) |
| 8 | `architecture/constitution/08-desktop-mobile-logic-sharing.md` | Constitution | What layers share between desktop/mobile, and why |
| 9a | `architecture/constitution/09a-styling-design-tokens.md` | Constitution | Design tokens are SSOT; control-resolution order |
| 9b | `architecture/description/09b-styling-implementation-inventory.md` | Description | Current UI primitives, task-icon pipeline, visual-review harness |
| 10 | `architecture/description/10-routing-navigation.md` | Description | Router structure, layout route, route-container pattern |
| 11a | `architecture/constitution/11a-data-export-convention.md` | Constitution | Single-serializer rule for task export |
| 11b | `architecture/description/11b-conduit-api.md` | Description | Conduit HTTP API — endpoints, auth, security boundary |
| 25 | `architecture/25-change-history.md` | Neither (append-only) | Log of Description amendments |
| 26 | `architecture/constitution/26-branch-model.md` | Constitution | `dev`/`master`/`feature/*` roles, RC vs. release triggers |

---

## Findings from this migration (recorded, not fixed)

Per this migration's own rule — drift is a finding, not a fix — none of the following were
corrected. Content was moved verbatim.

- **§2 (repository structure) is known stale.** The installed `architecture-contract` skill
  already documents this independently, with specifics: no `src/store/` (Zustand) exists, no
  TanStack Router, no `src/shared/` directory, no top-level `src/mobile/` directory, and UI
  primitives are flat files (`Button.view.tsx`), not component folders. Treat §2 as historical
  intent, not current fact — the same caveat `architecture-contract` already states.
- **§6 (shared validation boundary) references `shared/validation/schemas.ts`.** No
  `src/shared/` directory exists per the same audit. This paragraph was previously believed
  accurate (the pre-shard document's "Key Conventions IS accurate" framing, per
  `architecture-contract`) but appears to share §2's staleness. Needs a decision: was this ever
  built, or is the paragraph itself fiction that never got removed?
- **§7 (mobile view resolution) references `utils/platform.ts`'s `isMobile()` resolver and a
  `.mobile.view.tsx` override mechanism.** The actual, verified mobile routing mechanism (this
  session's own work, and `architecture-contract`) is the `src/router/` + `AppLayout.route.tsx`
  + `*.route.tsx` pattern described in §10 — a completely different mechanism. §7 looks like
  leftover fiction from the same source as §2, not a second, parallel resolution path.

None of these were in scope to fix here — this migration moved prose, it did not audit it.
Route confirmed drift to a decision (fix the doc, or confirm the code should catch up to it).
