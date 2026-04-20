import { useState } from "react";
import { projectColor } from "../lib/colors";
import type { Project, TaskWithTags } from "../types";


function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  if (iso === today) return "Today";
  if (iso === tomorrowStr) return "Tomorrow";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function TaskRow({
  task,
  projects,
  selected,
  draggable: isDraggable,
  onComplete,
  onClick,
}: {
  task: TaskWithTags;
  projects: Project[];
  selected?: boolean;
  draggable?: boolean;
  onComplete?: () => void;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const project = projects.find((p) => p.id === task.project_id);
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = task.due_date && task.due_date < today;
  const isDueToday = task.due_date === today;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "8px 14px",
        borderRadius: "var(--radius-md)",
        background: selected
          ? "var(--accent-light)"
          : hovered
            ? "var(--bg-primary)"
            : "transparent",
        transition: "background var(--transition)",
        cursor: isDraggable ? "grab" : onClick ? "pointer" : "default",
      }}
    >
      {isDraggable && (
        <span
          style={{
            width: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: hovered ? 0.5 : 0.15,
            transition: "opacity var(--transition)",
            cursor: "grab",
            flexShrink: 0,
            fontSize: 14,
            color: "var(--text-tertiary)",
            userSelect: "none",
          }}
        >
          ⠿
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onComplete?.();
        }}
        title="Mark complete"
        style={{
          width: 18,
          height: 18,
          marginTop: 1,
          borderRadius: "50%",
          flexShrink: 0,
          border: `2px solid ${
            task.priority === "high"
              ? "var(--priority-high)"
              : task.priority === "medium"
                ? "var(--priority-medium)"
                : "var(--border-strong)"
          }`,
          background: "transparent",
          cursor: "pointer",
          transition: "background var(--transition), border-color var(--transition)",
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {task.title}
          </div>
          {project && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: projectColor(project.id),
                background: `${projectColor(project.id)}18`,
                border: `1px solid ${projectColor(project.id)}35`,
                borderRadius: 4,
                padding: "1px 6px",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {project.name}
            </span>
          )}
        </div>

        {(task.due_date || task.tags.length > 0) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
            {task.due_date && (
              <span
                style={{
                  fontSize: 11,
                  color: isOverdue ? "var(--priority-high)" : isDueToday ? "var(--priority-medium)" : "var(--text-tertiary)",
                  fontWeight: isOverdue || isDueToday ? 500 : 400,
                }}
              >
                {isOverdue ? "⚠ " : ""}
                {formatDate(task.due_date)}
              </span>
            )}
            {task.tags.map((t) => (
              <span
                key={t.id}
                style={{ fontSize: 11, color: t.color, background: `${t.color}18`, borderRadius: 10, padding: "1px 6px", border: `1px solid ${t.color}30` }}
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
