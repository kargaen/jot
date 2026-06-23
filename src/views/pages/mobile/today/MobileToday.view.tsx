import type { CSSProperties } from "react";
import type { TaskWithTags } from "../../../../models/shared";
import { isDueToday, isOverdue, isUpcoming } from "../../../../models/tasks/taskVisibility";
import { friendlyDue } from "../../../../models/tasks/taskPresentation";
import MobileTaskRow from "../components/MobileTaskRow.view";

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
              {upcoming.length > 1 ? ` · +${upcoming.length - 1} more` : ""}
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
      {nextUpcoming ? <UpcomingPeek task={nextUpcoming} more={upcoming.length - 1} /> : null}
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
        <MobileTaskRow key={task.id} task={task} onComplete={onComplete} />
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
