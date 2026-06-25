import { useState } from "react";
import { projectColor, spaceColor } from "../../../utils/presentation/colors";
import { completionMessage } from "../../../utils/presentation/completionMessage";
import type { Area, Project, TaskWithTags } from "../../../models/shared";

function formatCompletedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    + " at " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function LogbookRow({
  task,
  projects,
  areas: _areas,
  onRestore,
}: {
  task: TaskWithTags;
  projects: Project[];
  areas: Area[];
  onRestore?: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const project = projects.find((p) => p.id === task.project_id);
  const areaId = task.area_id ?? project?.area_id ?? null;
  const color = areaId ? spaceColor(areaId) : "var(--border-strong)";

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "5px 14px",
        borderRadius: "var(--radius-md)",
      }}
    >
      {/* Space indicator — replaces the completion circle */}
      <span style={{
        width: 10, height: 10,
        borderRadius: 3,
        background: color,
        flexShrink: 0,
        marginTop: 4,
        opacity: 0.85,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}>
            {task.title}
          </span>
          {project && (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: projectColor(project.id),
              background: `${projectColor(project.id)}18`,
              border: `1px solid ${projectColor(project.id)}35`,
              borderRadius: 4, padding: "1px 6px",
              whiteSpace: "nowrap", flexShrink: 0,
            }}>
              {project.name}
            </span>
          )}
        </div>

        {/* Completion message */}
        <div style={{ marginTop: 1, fontSize: 11, color: "#16a34a", fontStyle: "italic" }}>
          {completionMessage(task.id)}
          {task.completed_at ? ` · ${formatCompletedAt(task.completed_at)}` : ""}
        </div>
      </div>

      {onRestore && (
        <button
          onClick={(e) => { e.stopPropagation(); onRestore(task.id); }}
          title="Restore to active list"
          style={{
            flexShrink: 0,
            alignSelf: "center",
            opacity: hover ? 1 : 0,
            pointerEvents: hover ? "auto" : "none",
            transition: "opacity 120ms",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--accent)",
            background: "var(--accent-light)",
            border: "1px solid var(--accent)",
            borderRadius: "var(--radius-sm)",
            padding: "3px 8px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          ↩ Restore
        </button>
      )}
    </div>
  );
}
