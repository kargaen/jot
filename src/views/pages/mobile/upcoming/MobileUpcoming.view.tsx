import type { CSSProperties } from "react";
import type { TaskWithTags } from "../../../../models/shared";
import { isUpcoming } from "../../../../models/tasks/taskVisibility";
import { friendlyDue } from "../../../../models/tasks/taskPresentation";
import MobileTaskRow from "../components/MobileTaskRow.view";

interface Props {
  tasks: TaskWithTags[];
  loading: boolean;
  onComplete: (id: string) => void;
  onOpenTask: (id: string) => void;
}

interface DateGroup {
  key: string;
  label: string;
  tasks: TaskWithTags[];
}

function buildGroups(tasks: TaskWithTags[], today: string): DateGroup[] {
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
  return order.map((date) => ({
    key: date,
    label: friendlyDue(date, null) || date,
    tasks: byDate.get(date)!,
  }));
}

export default function MobileUpcomingView({ tasks, loading, onComplete, onOpenTask }: Props) {
  const today = new Date().toISOString().split("T")[0];

  if (loading) {
    return <div style={styles.empty}>Loading...</div>;
  }

  const groups = buildGroups(tasks, today);

  if (groups.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={styles.emptyIcon}>→</span>
        <span style={styles.emptyLabel}>Nothing scheduled ahead</span>
      </div>
    );
  }

  return (
    <div style={styles.list}>
      {groups.map((group) => (
        <div key={group.key} style={styles.section}>
          <div style={styles.sectionHeader}>{group.label}</div>
          {group.tasks.map((task) => (
            <MobileTaskRow key={task.id} task={task} onComplete={onComplete} onOpen={onOpenTask} />
          ))}
        </div>
      ))}
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
};
