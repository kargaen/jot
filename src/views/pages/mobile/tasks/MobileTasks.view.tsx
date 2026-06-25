import type { CSSProperties } from "react";
import type { Area, Project, TaskWithTags } from "../../../../models/shared";
import { isInbox } from "../../../../models/tasks/taskVisibility";
import MobileTaskList, { type TaskListGroup } from "../components/MobileTaskList.view";

interface Props {
  tasks: TaskWithTags[];
  areas: Area[];
  projects: Project[];
  loading: boolean;
  onComplete: (id: string) => void;
  onOpenTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
}

function buildGroups(
  tasks: TaskWithTags[],
  areas: Area[],
  projects: Project[],
): TaskListGroup[] {
  const open = tasks.filter((t) => t.status === "todo");
  const groups: TaskListGroup[] = [];

  for (const area of areas) {
    const areaProjects = projects.filter((p) => p.area_id === area.id && p.status === "active");

    for (const project of areaProjects) {
      const projectTasks = open.filter((t) => t.project_id === project.id);
      if (projectTasks.length > 0) {
        groups.push({ key: `project-${project.id}`, label: project.name, color: project.color, tasks: projectTasks });
      }
    }

    const areaInbox = open.filter(
      (t) => t.area_id === area.id && isInbox(t),
    );
    if (areaInbox.length > 0) {
      groups.push({ key: `area-${area.id}`, label: area.name, color: area.color, tasks: areaInbox });
    }
  }

  const noArea = open.filter((t) => !t.area_id && isInbox(t));
  if (noArea.length > 0) {
    groups.push({ key: "inbox", label: "Inbox", color: "#888", tasks: noArea });
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
    <MobileTaskList
      groups={groups}
      onComplete={onComplete}
      onOpenTask={onOpenTask}
      onDeleteTask={onDeleteTask}
      showCount
    />
  );
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
