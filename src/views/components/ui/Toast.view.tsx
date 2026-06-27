import type { CSSProperties, ReactNode } from "react";

// Fixed bottom-of-screen status toast (success tone). Renders above the navbar.
// Message on the left, optional badge on the right (e.g. a running count).
export default function Toast({ message, badge }: { message: ReactNode; badge?: ReactNode }) {
  return (
    <div style={styles.toast} role="status">
      <span style={styles.message}>{message}</span>
      {badge != null ? <span style={styles.badge}>{badge}</span> : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  toast: {
    position: "fixed",
    bottom: "calc(76px + env(safe-area-inset-bottom))",
    left: 16,
    right: 16,
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 14px",
    borderRadius: "var(--radius-lg)",
    background: "var(--success-soft)",
    border: "1px solid var(--success)",
    boxShadow: "var(--shadow-lg)",
    backdropFilter: "blur(8px)",
  },
  message: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--success-strong)",
    lineHeight: 1.3,
  },
  badge: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 700,
    color: "var(--success-strong)",
    background: "var(--success-soft)",
    borderRadius: "var(--radius-md)",
    padding: "2px 8px",
  },
};
