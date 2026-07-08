import type { CSSProperties } from "react";
import type { Area, Project, TaskWithTags } from "../../../../models/shared";
import { groupTasksByAreaAndProject } from "../../../../models/tasks/taskGrouping";
import Collapsible from "../../../components/ui/Collapsible.view";
import MobileTaskRow from "../components/MobileTaskRow.view";

interface Props {
  tasks: TaskWithTags[];
  areas: Area[];
  projects: Project[];
  loading: boolean;
  onComplete: (id: string) => void;
  onOpenTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  /** When set, area/project header labels navigate into that dedicated screen (collapse is a separate control). */
  onOpenArea?: (id: string) => void;
  onOpenProject?: (id: string) => void;
}

export default function MobileTasksView({ tasks, areas, projects, loading, onComplete, onOpenTask, onDeleteTask, onOpenArea, onOpenProject }: Props) {
  // Placeholder only on first load; reloads reconcile in place (no flash).
  if (loading && tasks.length === 0) {
    return <div style={styles.empty}>Loading...</div>;
  }

  const areaGroups = groupTasksByAreaAndProject(tasks, areas, projects);

  if (areaGroups.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={styles.emptyIcon}>✓</span>
        <span style={styles.emptyLabel}>No open tasks</span>
      </div>
    );
  }

  return (
    <div style={styles.list}>
      {areaGroups.map((areaGroup) => (
        <Collapsible
          key={areaGroup.key}
          label={areaGroup.label}
          color={areaGroup.color}
          onNavigate={areaGroup.areaId && onOpenArea ? () => onOpenArea(areaGroup.areaId!) : undefined}
        >
          {areaGroup.projectGroups.map((projectGroup) => (
            <div key={projectGroup.key} style={styles.projectLevel}>
              <Collapsible
                label={projectGroup.label}
                color={projectGroup.color}
                count={projectGroup.tasks.length}
                onNavigate={projectGroup.projectId && onOpenProject ? () => onOpenProject(projectGroup.projectId!) : undefined}
              >
                {projectGroup.tasks.map((task) => (
                  <MobileTaskRow
                    key={task.id}
                    task={task}
                    onComplete={onComplete}
                    onOpen={onOpenTask}
                    onDelete={onDeleteTask}
                    showGroupPill={false}
                  />
                ))}
              </Collapsible>
            </div>
          ))}
        </Collapsible>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  list: {
    padding: "16px 0 32px",
  },
  projectLevel: {
    paddingLeft: 16,
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
