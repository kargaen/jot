import * as LucideIcons from "lucide-react";
import { getTaskDetailIconComponent } from "../../../../hooks/useTaskDetail";

// Renders a task's auto-derived Lucide icon as an inline SVG, or nothing if the
// icon name is missing/unknown. Never renders the raw icon name as text.
export default function TaskIcon({
  name,
  size = 15,
  color = "var(--text-tertiary)",
}: {
  name: string | null;
  size?: number;
  color?: string;
}) {
  const IconComponent = getTaskDetailIconComponent(name, LucideIcons);
  if (!IconComponent) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        verticalAlign: "-0.15em",
        marginRight: 6,
        flexShrink: 0,
        color,
      }}
    >
      <IconComponent size={size} />
    </span>
  );
}
