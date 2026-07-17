import type { CSSProperties } from "react";
import { NavLink, Outlet, useMatches, useOutletContext } from "react-router-dom";
import { CalendarDays, History, Inbox, List, Plus, Settings as SettingsIcon, Sun } from "lucide-react";
import type { TaskWithTags } from "../models/shared";
import { useMessageToast } from "../hooks/useMessageToast";
import Toast from "../views/components/ui/Toast.view";
import CopyTasksControl from "../views/components/ui/CopyTasksControl.view";

// Layout route for every surface that shows the persistent app frame.
// It renders the title (top), a scrollable Outlet (middle), and the navbar
// (bottom) once — child routes render only into the scrollable area and
// inherit this frame, so they never rebuild the title or navbar.
//
// Each child route declares its own title via `handle: { title }` in routes;
// the shell reads the deepest one through useMatches. The title may be a string
// or a resolver (ctx, params) => string for dynamic titles (e.g. a project
// name); the resolver is typed at the route definition (ctx stays unknown here).
// Routes may also declare `handle: { exportTasks }` — a resolver returning the
// screen's task list — to opt into a header "copy as JSON" action. Same export
// controller/serializer TaskDetail uses, so every surface stays byte-identical.
type TitleResolver = (ctx: unknown, params: Record<string, string | undefined>) => string;
type ExportTasksResolver = (
  ctx: unknown,
  params: Record<string, string | undefined>,
) => TaskWithTags[];
type RouteHandle = { title?: string | TitleResolver; exportTasks?: ExportTasksResolver };

const NAV: { to: string; label: string; Icon: typeof Sun }[] = [
  { to: "/today", label: "Today", Icon: Sun },
  { to: "/upcoming", label: "Upcoming", Icon: CalendarDays },
  { to: "/inbox", label: "Inbox", Icon: Inbox },
  { to: "/logbook", label: "Logbook", Icon: History },
  { to: "/all", label: "All", Icon: List },
  { to: "/capture", label: "Capture", Icon: Plus },
  { to: "/settings", label: "Settings", Icon: SettingsIcon },
];

export default function AppShell() {
  // Re-forward the layout's shared context down to the nav screens nested in
  // this frame's Outlet (null when mounted standalone, e.g. in the harness).
  const outletContext = useOutletContext();
  const matches = useMatches();
  const match = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title);
  const rawTitle = (match?.handle as RouteHandle | undefined)?.title;
  const title =
    typeof rawTitle === "function" ? rawTitle(outletContext, match?.params ?? {}) : (rawTitle ?? "");

  const exportMatch = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.exportTasks);
  const exportTasks = (exportMatch?.handle as RouteHandle | undefined)?.exportTasks;
  const { message, showMessage } = useMessageToast();
  const exportableTasks = exportTasks ? exportTasks(outletContext, exportMatch?.params ?? {}) : null;

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <span style={styles.title}>{title}</span>
        {exportableTasks ? (
          <CopyTasksControl tasks={exportableTasks} onCopied={showMessage} />
        ) : null}
      </header>
      {message ? <Toast message={message} /> : null}

      <main style={styles.scroll}>
        <Outlet context={outletContext} />
      </main>

      <nav style={styles.nav}>
        {NAV.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} style={styles.navItem}>
            {({ isActive }) => {
              const color = isActive ? "var(--accent)" : "var(--text-secondary)";
              return (
                <>
                  <Icon size={20} color={color} />
                  <span style={{ ...styles.navLabel, color }}>{label}</span>
                </>
              );
            }}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    height: "100dvh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-primary)",
  },
  header: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px 12px",
    paddingTop: "calc(16px + env(safe-area-inset-top))",
    borderBottom: "1px solid var(--border-subtle)",
    background: "var(--bg-primary)",
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    color: "var(--text-primary)",
    letterSpacing: -0.3,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  nav: {
    display: "flex",
    flexShrink: 0,
    borderTop: "1px solid var(--border-default)",
    background: "var(--surface-glass)",
    backdropFilter: "blur(12px)",
    paddingBottom: "env(safe-area-inset-bottom)",
  },
  navItem: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    padding: "10px 0 8px",
    textDecoration: "none",
  },
  navLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 0.2,
  },
};
