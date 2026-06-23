import type { CSSProperties } from "react";
import type { TaskWithTags } from "../../../../models/shared";
import { isOverdue, isDueToday, isUpcoming } from "../../../../models/tasks/taskVisibility";
import { friendlyDue } from "../../../../models/tasks/taskPresentation";

interface Props {
  tasks: TaskWithTags[];
  loading: boolean;
  onComplete: (id: string) => void;
}

export default function MobileTodayView({ tasks, loading, onComplete }: Props) {
  const today = new Date().toISOString().split("T")[0];

  const overdue = tasks.filter((t) => isOverdue(t, today));
  const dueToday = tasks.filter((t) => isDueToday(t, today));
  const upcoming = tasks.filter((t) => isUpcoming(t, today));
  const upcomingCount = upcoming.length;
  const nextUpcoming = upcoming[0] ?? null;

  if (loading) {
    return <div style={styles.empty}>Loading...</div>;
  }

  if (overdue.length === 0 && dueToday.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={styles.emptyIcon}>✓</span>
        <span style={styles.emptyLabel}>All clear for today</span>
        {nextUpcoming ? (
          <div style={styles.nextPeek}>
            <span style={styles.nextLabel}>Next</span>
            <span style={styles.nextTitle}>
              {nextUpcoming.icon ? `${nextUpcoming.icon} ` : ""}
              {nextUpcoming.title}
            </span>
            <span style={styles.nextDate}>
              {friendlyDue(nextUpcoming.due_date ?? nextUpcoming.scheduled_date, nextUpcoming.due_time)}
              {upcomingCount > 1 ? ` · +${upcomingCount - 1} more` : ""}
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={styles.list}>
      {overdue.length > 0 && (
        <Section label="Overdue" tasks={overdue} onComplete={onComplete} />
      )}
      {dueToday.length > 0 && (
        <Section label="Today" tasks={dueToday} onComplete={onComplete} />
      )}
      {nextUpcoming ? <UpcomingPeek task={nextUpcoming} more={upcomingCount - 1} /> : null}
    </div>
  );
}

function Section({ label, tasks, onComplete }: {
  label: string;
  tasks: TaskWithTags[];
  onComplete: (id: string) => void;
}) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>{label}</div>
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onComplete={onComplete} />
      ))}
    </div>
  );
}

function UpcomingPeek({ task, more }: { task: TaskWithTags; more: number }) {
  const date = friendlyDue(task.due_date ?? task.scheduled_date, task.due_time);
  return (
    <div style={styles.peek}>
      <span style={styles.peekLabel}>Next up</span>
      <span style={styles.peekTitle}>
        {task.icon ? `${task.icon} ` : ""}{task.title}
      </span>
      {date ? (
        <span style={styles.peekMeta}>
          {date}{more > 0 ? ` · +${more} more` : ""}
        </span>
      ) : null}
    </div>
  );
}

function TaskRow({ task, onComplete }: { task: TaskWithTags; onComplete: (id: string) => void }) {
  const today = new Date().toISOString().split("T")[0];
  const due = friendlyDue(task.due_date, task.due_time);
  const overdue = isOverdue(task, today);

  return (
    <div style={styles.row}>
      <button
        type="button"
        style={styles.checkButton}
        onClick={() => onComplete(task.id)}
        aria-label="Complete task"
      >
        <span style={styles.checkCircle} />
      </button>
      <div style={styles.rowBody}>
        <div style={styles.rowTitle}>{task.icon ? `${task.icon} ${task.title}` : task.title}</div>
        {due ? (
          <div style={{ ...styles.rowMeta, color: overdue ? "#b91c1c" : "var(--text-tertiary)" }}>
            {due}
          </div>
        ) : null}
        {task.project ? (
          <div style={styles.rowMeta}>{task.project.name}</div>
        ) : null}
      </div>
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
  checkButton: {
    flexShrink: 0,
    width: 24,
    height: 24,
    marginTop: 1,
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircle: {
    display: "block",
    width: 20,
    height: 20,
    borderRadius: "50%",
    border: "2px solid var(--border-default)",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: 500,
    color: "var(--text-primary)",
    lineHeight: 1.3,
  },
  rowMeta: {
    fontSize: 12,
    color: "var(--text-tertiary)",
    marginTop: 3,
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
