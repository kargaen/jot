import type { CSSProperties } from "react";
import type { Area, Project, TaskWithTags } from "../../../../models/shared";
import { isInbox } from "../../../../models/tasks/taskVisibility";
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

const NO_GROUP_COLOR = "var(--text-quaternary)";

interface ProjectGroup {
  key: string;
  label: string;
  color: string;
  onOpen?: () => void;
  tasks: TaskWithTags[];
}

interface AreaGroup {
  key: string;
  label: string;
  color: string;
  onOpen?: () => void;
  projectGroups: ProjectGroup[];
}

function projectGroupsFor(
  areaProjects: Project[],
  open: TaskWithTags[],
  onOpenProject?: (id: string) => void,
): ProjectGroup[] {
  const groups: ProjectGroup[] = [];
  for (const project of areaProjects) {
    const projectTasks = open.filter((t) => t.project_id === project.id);
    if (projectTasks.length > 0) {
      groups.push({
        key: `project-${project.id}`,
        label: project.name,
        color: project.color,
        onOpen: onOpenProject ? () => onOpenProject(project.id) : undefined,
        tasks: projectTasks,
      });
    }
  }
  return groups;
}

// Builds the Area -> Project -> Task hierarchy. Tasks with a project are
// grouped under that project's own area (task.area_id is ignored once a task
// has a project, matching the existing area/project inference convention
// used elsewhere, e.g. Space.route.tsx). A project with no area, and a task
// with neither project nor area, both fall into the synthetic "No Area"
// bucket so nothing is silently dropped from the list.
function buildAreaGroups(
  tasks: TaskWithTags[],
  areas: Area[],
  projects: Project[],
  onOpenArea?: (id: string) => void,
  onOpenProject?: (id: string) => void,
): AreaGroup[] {
  const open = tasks.filter((t) => t.status === "todo");
  const areaGroups: AreaGroup[] = [];

  for (const area of areas) {
    const areaProjects = projects.filter((p) => p.area_id === area.id && p.status === "active");
    const projectGroups = projectGroupsFor(areaProjects, open, onOpenProject);

    const areaDirect = open.filter((t) => t.area_id === area.id && isInbox(t));
    if (areaDirect.length > 0) {
      projectGroups.push({ key: `noproject-${area.id}`, label: "No Project", color: NO_GROUP_COLOR, tasks: areaDirect });
    }

    if (projectGroups.length > 0) {
      areaGroups.push({
        key: `area-${area.id}`,
        label: area.name,
        color: area.color,
        onOpen: onOpenArea ? () => onOpenArea(area.id) : undefined,
        projectGroups,
      });
    }
  }

  const unassignedProjects = projects.filter((p) => p.area_id === null && p.status === "active");
  const noAreaGroups = projectGroupsFor(unassignedProjects, open, onOpenProject);

  const bareTasks = open.filter((t) => !t.area_id && isInbox(t));
  if (bareTasks.length > 0) {
    noAreaGroups.push({ key: "noproject-none", label: "No Project", color: NO_GROUP_COLOR, tasks: bareTasks });
  }

  if (noAreaGroups.length > 0) {
    areaGroups.push({ key: "area-none", label: "No Area", color: NO_GROUP_COLOR, projectGroups: noAreaGroups });
  }

  return areaGroups;
}

export default function MobileTasksView({ tasks, areas, projects, loading, onComplete, onOpenTask, onDeleteTask, onOpenArea, onOpenProject }: Props) {
  // Placeholder only on first load; reloads reconcile in place (no flash).
  if (loading && tasks.length === 0) {
    return <div style={styles.empty}>Loading...</div>;
  }

  const areaGroups = buildAreaGroups(tasks, areas, projects, onOpenArea, onOpenProject);

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
          onNavigate={areaGroup.onOpen}
        >
          {areaGroup.projectGroups.map((projectGroup) => (
            <div key={projectGroup.key} style={styles.projectLevel}>
              <Collapsible
                label={projectGroup.label}
                color={projectGroup.color}
                count={projectGroup.tasks.length}
                onNavigate={projectGroup.onOpen}
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
