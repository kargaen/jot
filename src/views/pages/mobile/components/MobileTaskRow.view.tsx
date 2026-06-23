import type { CSSProperties } from "react";
import type { TaskWithTags } from "../../../../models/shared";
import { isOverdue } from "../../../../models/tasks/taskVisibility";
import { friendlyDue } from "../../../../models/tasks/taskPresentation";

interface Props {
  task: TaskWithTags;
  onComplete: (id: string) => void;
}

export default function MobileTaskRow({ task, onComplete }: Props) {
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
        <div style={styles.rowTitle}>
          {task.icon ? `${task.icon} ${task.title}` : task.title}
        </div>
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
};
