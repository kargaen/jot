import type { CSSProperties } from "react";

interface Props {
  label: string;
  color: string;
}

/**
 * Small colour-tinted label (area/project indicator, etc). Colour drives a
 * tint/border derived at render time (`${color}18` / `${color}35`) — the same
 * recipe already duplicated across CreateTask/TaskRow/tag chips, extracted
 * here as the one reusable version.
 */
export default function Pill({ label, color }: Props) {
  return <span style={{ ...styles.pill, color, background: `${color}18`, border: `1px solid ${color}35` }}>{label}</span>;
}

const styles: Record<string, CSSProperties> = {
  pill: {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    borderRadius: 4,
    padding: "1px 6px",
    whiteSpace: "nowrap",
    flexShrink: 0,
    maxWidth: 160,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
};
