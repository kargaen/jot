import { spaceColor, projectColor } from "../lib/colors";
import type { Area, Project, TaskWithTags } from "../types";

const COMPLETION_MESSAGES = [
  "Executed with precision",
  "Future you is grateful",
  "One less thing standing between you and your goals",
  "That's what momentum looks like",
  "You showed up and delivered",
  "Done is a beautiful word",
  "Another one bites the dust",
  "Quietly unstoppable",
  "Consistency is the new talent — nice work",
  "You make it look easy",
  "That's exactly how it's done",
  "Small win, real progress",
  "Crossed off. Moving forward",
  "Effort acknowledged, result delivered",
  "The satisfaction of done",
  "You didn't wait for perfect — you just did it",
  "Checked. What's next?",
  "Tasks fear you",
  "Done before most people started",
  "This is what a good day is made of",
];

function completionMessage(taskId: string): string {
  let h = 5381;
  for (let i = 0; i < taskId.length; i++) h = ((h << 5) + h + taskId.charCodeAt(i)) >>> 0;
  return COMPLETION_MESSAGES[h % COMPLETION_MESSAGES.length];
}

function formatCompletedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    + " at " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function LogbookRow({
  task,
  projects,
  areas: _areas,
  onClick,
}: {
  task: TaskWithTags;
  projects: Project[];
  areas: Area[];
  onClick?: () => void;
}) {
  const project = projects.find((p) => p.id === task.project_id);
  const areaId = task.area_id ?? project?.area_id ?? null;
  const color = areaId ? spaceColor(areaId) : "var(--border-strong)";

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "5px 14px",
        cursor: onClick ? "pointer" : "default",
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
    </div>
  );
}
