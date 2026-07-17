# 10. Routing & navigation

Client routing lives in `src/router/` and uses React Router (`react-router-dom`); the tree is defined in `src/router/routes.tsx` and mounted for mobile in `src/App.tsx` (desktop stays multi-window via the Tauri `windowLabel` switch — it has no routes). The route tree is the single source of truth for paths and titles.

The protected app uses a **layered layout route** so the persistent frame is built once:

- `AppShell.view.tsx` is the presentational frame — title (top), scrollable `<Outlet/>` (middle), navbar (bottom), always visible. Child surfaces render only into the Outlet and never rebuild the title or navbar. Each route declares its title via `handle: { title }`, which the shell reads with `useMatches`; `title` may be a string or a `(ctx, params) => string` resolver for dynamic titles (e.g. a project/space name resolved from the shared context).
- `AppLayout.route.tsx` is the layout route element: it owns the single `useMobileAppData` fetch and hands it to children through the Outlet context (`AppOutletContext`). Screens read it with `useOutletContext<AppOutletContext>()` — one fetch shared across routes, not one per screen.
- **Route containers** are named `*.route.tsx` (e.g. `Today.route.tsx`, `Upcoming.route.tsx`, `Inbox.route.tsx`): thin composition that reads shared data/params, wires callbacks (navigate, complete), and renders a `views/pages/.../*.view.tsx`. Views stay presentational; containers do the wiring.

The current app is kept verbatim at `/_legacy` as a working reference during the port; `/` now resolves into the routed app via `Index.route.tsx`, with `/_legacy` still available as the comparison surface until the port is fully retired.

The built-in mobile nav includes Today, Upcoming, Inbox, Logbook, All, Capture, and Settings; Inbox is the no-project open-task route and uses the same task-list presentation as All. Nav routes may opt into a header action by declaring `handle: { exportTasks: (ctx, params) => TaskWithTags[] }` alongside `title`; `AppShell.view.tsx` renders a clipboard icon that serializes and copies the resolver's result when present. This is the general pattern for any future per-screen header action, not just export — add a new `handle` key + a matching render branch in `AppShell`, don't build a one-off header per screen.
