# 8. Desktop / mobile logic sharing

Views are always platform-specific — rendering differs too much to share. Everything beneath the view layer should be shared by default:

| Layer | Share? | Rationale |
|---|---|---|
| `models/` — interfaces, predicates, sort/filter functions | **Yes, always** | Pure functions with no platform dependency |
| `services/` — Supabase queries, sync | **Yes, always** | I/O is the same regardless of platform |
| `hooks/` — data hooks (`useMobileAppData`, `useDashboard`) | **Partially** — extract shared predicates/selectors into `models/`, keep platform-specific orchestration separate | Hooks own UI lifecycle and cannot be shared wholesale |
| `controllers/` | **Yes** where logic is platform-agnostic | Avoid duplicating business rules |
| `views/` | **No** — always platform-specific | Rendering and interaction patterns differ |

Concrete rule: if the same predicate, filter, or sort function appears in both a desktop hook and a mobile view, it belongs in `src/models/tasks/` as a pure exported function. Neither the desktop hook nor the mobile view should own the rule — the model does.
