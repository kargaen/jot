import type { CSSProperties } from "react";
import { NavLink, Outlet, useMatches, useOutletContext } from "react-router-dom";
import { CalendarDays, List, Plus, Settings as SettingsIcon, Sun } from "lucide-react";

// Layout route for every surface that shows the persistent app frame.
// It renders the title (top), a scrollable Outlet (middle), and the navbar
// (bottom) once — child routes render only into the scrollable area and
// inherit this frame, so they never rebuild the title or navbar.
//
// Each child route declares its own title via `handle: { title }` in routes;
// the shell reads the deepest one through useMatches.
type RouteHandle = { title?: string };

const NAV: { to: string; label: string; Icon: typeof Sun }[] = [
  { to: "/today", label: "Today", Icon: Sun },
  { to: "/upcoming", label: "Upcoming", Icon: CalendarDays },
  { to: "/all", label: "All", Icon: List },
  { to: "/capture", label: "Capture", Icon: Plus },
  { to: "/settings", label: "Settings", Icon: SettingsIcon },
];

export default function AppShell() {
  // Re-forward the layout's shared context down to the nav screens nested in
  // this frame's Outlet (null when mounted standalone, e.g. in the harness).
  const outletContext = useOutletContext();
  const matches = useMatches();
  const heading =
    [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title) as
      | { handle: RouteHandle }
      | undefined;

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <span style={styles.title}>{heading?.handle.title ?? ""}</span>
      </header>

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
