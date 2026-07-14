import type { CSSProperties } from "react";
import type { Area, TaskWithTags } from "../../../../models/shared";
import { isUpcoming } from "../../../../models/tasks/taskVisibility";
import { friendlyDue } from "../../../../models/tasks/taskPresentation";
import {
  DEFAULT_EFFORT_CONFIG,
  isOverCapacity,
  type EffortConfig,
} from "../../../../models/tasks/taskEffort";
import MobileTaskList, { type TaskListGroup } from "../components/MobileTaskList.view";

interface Props {
  tasks: TaskWithTags[];
  loading: boolean;
  onComplete: (id: string) => void;
  onOpenTask: (id: string) => void;
  areas: Area[];
  effortConfig?: EffortConfig;
}

function buildGroups(tasks: TaskWithTags[], today: string, config: EffortConfig): TaskListGroup[] {
  const upcoming = tasks.filter((t) => isUpcoming(t, today));
  const order: string[] = [];
  const byDate = new Map<string, TaskWithTags[]>();
  for (const task of upcoming) {
    const date = task.due_date ?? task.scheduled_date;
    if (!date) continue;
    if (!byDate.has(date)) {
      byDate.set(date, []);
      order.push(date);
    }
    byDate.get(date)!.push(task);
  }
  return order.map((date) => {
    const dayTasks = byDate.get(date)!;
    const base = friendlyDue(date, null) || date;
    // Calm marker on days already over capacity, so overload is visible while planning ahead.
    const label = isOverCapacity(dayTasks, config) ? `${base} · full` : base;
    return { key: date, label, tasks: dayTasks };
  });
}

export default function MobileUpcomingView({ tasks, loading, onComplete, onOpenTask, areas, effortConfig }: Props) {
  const today = new Date().toISOString().split("T")[0];

  // Placeholder only on first load; reloads reconcile in place (no flash).
  if (loading && tasks.length === 0) {
    return <div style={styles.empty}>Loading...</div>;
  }

  const groups = buildGroups(tasks, today, effortConfig ?? DEFAULT_EFFORT_CONFIG);

  if (groups.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={styles.emptyIcon}>→</span>
        <span style={styles.emptyLabel}>Nothing scheduled ahead</span>
      </div>
    );
  }

  return <MobileTaskList groups={groups} onComplete={onComplete} onOpenTask={onOpenTask} areas={areas} />;
}

const styles: Record<string, CSSProperties> = {
  empty: {
    minHeight: "60dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    color: "var(--text-tertiary)",
  },
  emptyIcon: {
    fontSize: 32,
    color: "var(--accent)",
  },
  emptyLabel: {
    fontSize: 14,
    fontWeight: 500,
  },
};
