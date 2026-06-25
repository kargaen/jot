import type { CSSProperties } from "react";
import type { Area, Project, TaskWithTags } from "../../../../models/shared";
import { isInbox } from "../../../../models/tasks/taskVisibility";
import MobileTaskRow from "../components/MobileTaskRow.view";

interface Props {
  tasks: TaskWithTags[];
  areas: Area[];
  projects: Project[];
  loading: boolean;
  onComplete: (id: string) => void;
  onOpenTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
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

export default function MobileTasksView({ tasks, areas, projects, loading, onComplete, onOpenTask, onDeleteTask }: Props) {
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
        <TaskGroup key={group.label} group={group} onComplete={onComplete} onOpenTask={onOpenTask} onDeleteTask={onDeleteTask} />
      ))}
    </div>
  );
}

function TaskGroup({ group, onComplete, onOpenTask, onDeleteTask }: { group: TaskGroup; onComplete: (id: string) => void; onOpenTask: (id: string) => void; onDeleteTask: (id: string) => void }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <span style={{ ...styles.dot, background: group.color }} />
        <span style={styles.sectionLabel}>{group.label}</span>
        <span style={styles.badge}>{group.tasks.length}</span>
      </div>
      {group.tasks.map((task) => (
        <MobileTaskRow key={task.id} task={task} onComplete={onComplete} onOpen={onOpenTask} onDelete={onDeleteTask} />
      ))}
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
