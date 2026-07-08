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
  /**
   * When set, the dot+label becomes its own tap target that navigates
   * (e.g. drill into a dedicated screen) instead of toggling collapse — the
   * chevron stays a separate, always-present collapse toggle so neither
   * action shadows the other.
   */
  onNavigate?: () => void;
  children: ReactNode;
}

/**
 * Token-driven collapsible section: a header (dot + label + count + chevron)
 * that shows/hides its children. State lives in local component state only —
 * never persisted — so a fresh route mount is always expanded.
 */
export default function Collapsible({ label, color, count, defaultOpen = true, onNavigate, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={styles.section}>
      <div style={styles.header}>
        {onNavigate ? (
          <button type="button" onClick={onNavigate} style={styles.labelButton}>
            {color ? <span style={{ ...styles.dot, background: color }} /> : null}
            <span style={styles.label}>{label}</span>
          </button>
        ) : (
          <span style={styles.labelButton}>
            {color ? <span style={{ ...styles.dot, background: color }} /> : null}
            <span style={styles.label}>{label}</span>
          </span>
        )}
        {count !== undefined ? <span style={styles.badge}>{count}</span> : null}
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          style={styles.chevronButton}
        >
          <ChevronDown
            size={16}
            color="var(--text-tertiary)"
            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 150ms" }}
          />
        </button>
      </div>
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
    gap: 4,
    padding: "10px 20px 6px",
  },
  labelButton: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    padding: "2px 0",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  },
  chevronButton: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    padding: 0,
    background: "transparent",
    border: "none",
    cursor: "pointer",
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  badge: {
    flexShrink: 0,
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
