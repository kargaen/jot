import { useState } from "react";
import type { CSSProperties } from "react";
import type { Area, TaskWithTags } from "../../../../models/shared";
import { isDueToday, isOverdue, isUpcoming } from "../../../../models/tasks/taskVisibility";
import { friendlyDue } from "../../../../models/tasks/taskPresentation";
import {
  DEFAULT_EFFORT_CONFIG,
  dayCapacityStatus,
  type DayCapacityStatus,
  type EffortConfig,
} from "../../../../models/tasks/taskEffort";
import { randomRelax } from "../../../../utils/presentation/relax";
import TaskIcon from "../components/TaskIcon.view";
import MobileTaskList, { type TaskListGroup } from "../components/MobileTaskList.view";

interface Props {
  tasks: TaskWithTags[];
  loading: boolean;
  onComplete: (id: string) => void;
  onOpenTask: (id: string) => void;
  areas: Area[];
  effortConfig?: EffortConfig;
}

export default function MobileTodayView({ tasks, loading, onComplete, onOpenTask, areas, effortConfig }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [relax] = useState(randomRelax);

  const overdue = tasks.filter((t) => isOverdue(t, today));
  const dueToday = tasks.filter((t) => isDueToday(t, today));
  const upcoming = tasks.filter((t) => isUpcoming(t, today));
  const nextUpcoming = upcoming[0] ?? null;

  // Calm, non-blocking capacity nudge for today's plan (EPIC-013 Flow 3/5).
  const capacity = dayCapacityStatus(dueToday, effortConfig ?? DEFAULT_EFFORT_CONFIG);

  // Only show the placeholder on the first load (nothing yet). Reloads with
  // tasks already on screen reconcile in place (React key diff) — no flash.
  if (loading && tasks.length === 0) {
    return <div style={styles.empty}>Loading...</div>;
  }

  if (overdue.length === 0 && dueToday.length === 0) {
    return (
      <div style={styles.clear}>
        <img src={relax.image} alt="" style={styles.clearImage} />
        <span style={styles.clearTitle}>All clear for today</span>
        <span style={styles.clearQuote}>{relax.quote}</span>
        {nextUpcoming ? (
          <div style={styles.nextPeek}>
            <span style={styles.nextLabel}>Next</span>
            <span style={styles.nextTitle}>
              <TaskIcon name={nextUpcoming.icon} size={13} />{nextUpcoming.title}
            </span>
            <span style={styles.nextDate}>
              {friendlyDue(nextUpcoming.due_date ?? nextUpcoming.scheduled_date, nextUpcoming.due_time)}
              {upcoming.length > 1 ? ` · +${upcoming.length - 1} more` : ""}
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  const groups: TaskListGroup[] = [];
  if (overdue.length > 0) groups.push({ key: "overdue", label: "Overdue", tasks: overdue });
  if (dueToday.length > 0) groups.push({ key: "today", label: "Today", tasks: dueToday });

  return (
    <>
      {(capacity.overCapacity || capacity.overloadedAreas.length > 0) && (
        <CapacityNudge capacity={capacity} areas={areas} />
      )}
      <MobileTaskList groups={groups} onComplete={onComplete} onOpenTask={onOpenTask} areas={areas} />
      {nextUpcoming ? <UpcomingPeek task={nextUpcoming} more={upcoming.length - 1} /> : null}
    </>
  );
}

function CapacityNudge({ capacity, areas }: { capacity: DayCapacityStatus; areas: Area[] }) {
  const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? "an area";
  const message = capacity.overCapacity
    ? `Today looks full — ${capacity.load} of ${capacity.capacity} points planned. Consider moving something.`
    : `${capacity.overloadedAreas.map((a) => areaName(a.areaId)).join(", ")} looks full today.`;
  return (
    <div style={styles.nudge} role="status">
      <span style={styles.nudgeText}>{message}</span>
    </div>
  );
}

function UpcomingPeek({ task, more }: { task: TaskWithTags; more: number }) {
  const date = friendlyDue(task.due_date ?? task.scheduled_date, task.due_time);
  return (
    <div style={styles.peek}>
      <span style={styles.peekLabel}>Next up</span>
      <span style={styles.peekTitle}>
        <TaskIcon name={task.icon} size={13} />{task.title}
      </span>
      {date ? (
        <span style={styles.peekMeta}>
          {date}{more > 0 ? ` · +${more} more` : ""}
        </span>
      ) : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  nudge: {
    margin: "8px 20px 4px",
    padding: "10px 14px",
    borderRadius: 12,
    background: "var(--surface-glass)",
    border: "1px solid var(--surface-border-accent)",
  },
  nudgeText: {
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  },
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
  clear: {
    minHeight: "60dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "24px 28px",
  },
  clearImage: {
    width: "100%",
    maxWidth: 320,
    height: 180,
    objectFit: "cover",
    borderRadius: 18,
    marginBottom: 12,
  },
  clearTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  clearQuote: {
    fontSize: 13,
    color: "var(--text-tertiary)",
    textAlign: "center",
    lineHeight: 1.5,
    maxWidth: 280,
  },
  nextPeek: {
    marginTop: 16,
    padding: "12px 16px",
    borderRadius: 14,
    background: "var(--surface-glass)",
    border: "1px solid var(--surface-border-accent)",
    display: "flex",
    flexDirection: "column",
    gap: 3,
    maxWidth: 260,
    textAlign: "center",
  },
  nextLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    color: "var(--accent)",
  },
  nextTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  nextDate: {
    fontSize: 12,
    color: "var(--text-tertiary)",
  },
  peek: {
    margin: "12px 20px 24px",
    padding: "12px 16px",
    borderRadius: 14,
    background: "var(--surface-glass)",
    border: "1px solid var(--surface-border-accent)",
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  peekLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    color: "var(--accent)",
  },
  peekTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  peekMeta: {
    fontSize: 12,
    color: "var(--text-tertiary)",
  },
};
