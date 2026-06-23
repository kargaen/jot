import type { CSSProperties } from "react";
import type { Area, Project, TaskWithTags } from "../../../../models/shared";
import { isInbox } from "../../../../models/tasks/taskVisibility";
import { friendlyDue } from "../../../../models/tasks/taskPresentation";

interface Props {
  tasks: TaskWithTags[];
  areas: Area[];
  projects: Project[];
  loading: boolean;
  onComplete: (id: string) => void;
}

interface TaskGroup {
  label: string;
  color: string;
  tasks: TaskWithTags[];
}

function buildGroups(
  tasks: TaskWithTags[],
  areas: Area[],
  projects: Project[],
): TaskGroup[] {
  const open = tasks.filter((t) => t.status === "todo");
  const groups: TaskGroup[] = [];

  for (const area of areas) {
    const areaProjects = projects.filter((p) => p.area_id === area.id && p.status === "active");

    for (const project of areaProjects) {
      const projectTasks = open.filter((t) => t.project_id === project.id);
      if (projectTasks.length > 0) {
        groups.push({ label: project.name, color: project.color, tasks: projectTasks });
      }
    }

    const areaInbox = open.filter(
      (t) => t.area_id === area.id && isInbox(t),
    );
    if (areaInbox.length > 0) {
      groups.push({ label: area.name, color: area.color, tasks: areaInbox });
    }
  }

  const noArea = open.filter((t) => !t.area_id && isInbox(t));
  if (noArea.length > 0) {
    groups.push({ label: "Inbox", color: "#888", tasks: noArea });
  }

  return groups;
}

export default function MobileTasksView({ tasks, areas, projects, loading, onComplete }: Props) {
  if (loading) {
    return <div style={styles.empty}>Loading...</div>;
  }

  const groups = buildGroups(tasks, areas, projects);

  if (groups.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={styles.emptyIcon}>✓</span>
        <span style={styles.emptyLabel}>No open tasks</span>
      </div>
    );
  }

  return (
    <div style={styles.list}>
      {groups.map((group) => (
        <TaskGroup key={group.label} group={group} onComplete={onComplete} />
      ))}
    </div>
  );
}

function TaskGroup({ group, onComplete }: { group: TaskGroup; onComplete: (id: string) => void }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <span style={{ ...styles.dot, background: group.color }} />
        <span style={styles.sectionLabel}>{group.label}</span>
        <span style={styles.badge}>{group.tasks.length}</span>
      </div>
      {group.tasks.map((task) => (
        <TaskRow key={task.id} task={task} onComplete={onComplete} />
      ))}
    </div>
  );
}

function TaskRow({ task, onComplete }: { task: TaskWithTags; onComplete: (id: string) => void }) {
  const due = friendlyDue(task.due_date, task.due_time);

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
        {due ? <div style={styles.rowMeta}>{due}</div> : null}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  list: {
    padding: "16px 0 32px",
  },
  section: {
    marginBottom: 4,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 20px 6px",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    color: "var(--text-tertiary)",
    flex: 1,
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    background: "var(--surface-glass)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 10,
    padding: "1px 7px",
  },
  dot: {
    flexShrink: 0,
    width: 8,
    height: 8,
    borderRadius: "50%",
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
};
