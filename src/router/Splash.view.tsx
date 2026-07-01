import type { CSSProperties } from "react";
import Spinner from "../views/components/ui/Spinner.view";

// Full-screen loading state shown while auth resolves or the first data load is
// in flight. Renders the app frame silhouette (title bar + navbar) rather than a
// bare spinner, so cold start reads as "the app is opening" instead of a blank
// wait. Mirrors AppShell's frame dimensions.
export default function Splash() {
  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.titleBar} />
      </header>

      <main style={styles.body}>
        <Spinner size={24} color="var(--text-tertiary)" />
      </main>

      <nav style={styles.nav}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={styles.navItem}>
            <div style={styles.navDot} />
            <div style={styles.navLabel} />
          </div>
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
  titleBar: {
    width: 128,
    height: 24,
    borderRadius: "var(--radius-md)",
    background: "var(--bg-secondary)",
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: "grid",
    placeItems: "center",
  },
  nav: {
    display: "flex",
    flexShrink: 0,
    borderTop: "1px solid var(--border-default)",
    background: "var(--surface-glass)",
    paddingBottom: "env(safe-area-inset-bottom)",
  },
  navItem: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    padding: "12px 0 10px",
  },
  navDot: {
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "var(--bg-secondary)",
  },
  navLabel: {
    width: 26,
    height: 7,
    borderRadius: 4,
    background: "var(--bg-secondary)",
  },
};
