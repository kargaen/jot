import type { CSSProperties } from "react";
import type { TaskWithTags } from "../../../../models/shared";
import CompletionHeatmap from "../../../components/pulse/CompletionHeatmap.view";

interface Props {
  tasks: TaskWithTags[];
  loading: boolean;
  completionDates: string[];
}

interface DateGroup {
  key: string;
  label: string;
  tasks: TaskWithTags[];
}

function groupLabel(dateKey: string, today: string, yesterday: string): string {
  if (dateKey === today) return "Today";
  if (dateKey === yesterday) return "Yesterday";
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function buildGroups(tasks: TaskWithTags[]): DateGroup[] {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];

  const order: string[] = [];
  const byDate = new Map<string, TaskWithTags[]>();
  for (const task of tasks) {
    const date = (task.completed_at ?? "").split("T")[0];
    if (!date) continue;
    if (!byDate.has(date)) {
      byDate.set(date, []);
      order.push(date);
    }
    byDate.get(date)!.push(task);
  }
  return order.map((date) => ({
    key: date,
    label: groupLabel(date, today, yesterday),
    tasks: byDate.get(date)!,
  }));
}

export default function MobileLogbookView({ tasks, loading, completionDates }: Props) {
  const groups = buildGroups(tasks);

  return (
    <div>
      <div style={styles.heatmapWrap}>
        <CompletionHeatmap dates={completionDates} />
      </div>

      {loading && tasks.length === 0 ? (
        <div style={styles.emptyInline}>Loading…</div>
      ) : groups.length === 0 ? (
        <div style={styles.emptyInline}>No completed tasks yet</div>
      ) : (
        <div style={styles.list}>
          {groups.map((group) => (
            <div key={group.key} style={styles.section}>
              <div style={styles.sectionHeader}>{group.label}</div>
              {group.tasks.map((task) => (
                <div key={task.id} style={styles.row}>
                  <span style={styles.check}>✓</span>
                  <span style={styles.title}>
                    {task.icon ? `${task.icon} ` : ""}{task.title}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  list: {
    padding: "16px 0 32px",
  },
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
    padding: "8px 20px 6px",
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "10px 20px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  check: {
    flexShrink: 0,
    width: 20,
    height: 20,
    marginTop: 1,
    borderRadius: "50%",
    background: "#16a34a",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    color: "var(--text-tertiary)",
    textDecoration: "line-through",
    lineHeight: 1.3,
  },
  heatmapWrap: {
    padding: "0 16px",
    overflowX: "auto",
  },
  emptyInline: {
    padding: "28px 20px",
    textAlign: "center",
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
};
