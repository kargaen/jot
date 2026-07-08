import { useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  label: string;
  /** Optional leading colour dot (area/project colour). */
  color?: string;
  /** Optional trailing count badge. */
  count?: number;
  /** Expanded by default; state is local (uncontrolled) so a fresh mount always starts expanded. */
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Token-driven collapsible section: a tappable header (dot + label + count +
 * chevron) that shows/hides its children. State lives in local component
 * state only — never persisted — so a fresh route mount is always expanded.
 */
export default function Collapsible({ label, color, count, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={styles.section}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        style={styles.header}
      >
        {color ? <span style={{ ...styles.dot, background: color }} /> : null}
        <span style={styles.label}>{label}</span>
        {count !== undefined ? <span style={styles.badge}>{count}</span> : null}
        <ChevronDown
          size={16}
          color="var(--text-tertiary)"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 150ms" }}
        />
      </button>
      {open ? children : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  section: {
    marginBottom: 4,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "10px 20px 6px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  },
  label: {
    flex: 1,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    background: "var(--surface-glass)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 10,
    padding: "1px 7px",
  },
  dot: {
    flexShrink: 0,
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
};
