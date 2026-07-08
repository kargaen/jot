import type { Area, Project, TaskWithTags } from "../shared";
import { isInbox } from "./taskVisibility";

export interface TaskProjectGroup {
  key: string;
  label: string;
  color: string;
  /** null identifies the synthetic "No Project" leaf. */
  projectId: string | null;
  tasks: TaskWithTags[];
}

export interface TaskAreaGroup {
  key: string;
  label: string;
  color: string;
  /** null identifies the synthetic "No Area" bucket. */
  areaId: string | null;
  projectGroups: TaskProjectGroup[];
}

const NO_GROUP_COLOR = "var(--text-quaternary)";

function projectGroupsFor(areaProjects: Project[], open: TaskWithTags[]): TaskProjectGroup[] {
  const groups: TaskProjectGroup[] = [];
  for (const project of areaProjects) {
    const projectTasks = open.filter((t) => t.project_id === project.id);
    if (projectTasks.length > 0) {
      groups.push({ key: `project-${project.id}`, label: project.name, color: project.color, projectId: project.id, tasks: projectTasks });
    }
  }
  return groups;
}

/**
 * Groups open tasks into an Area -> Project -> Task hierarchy. Shared by the
 * mobile All/Space/Project screens and the desktop All view so both platforms
 * present identical grouping (see ARCHITECTURE.md "Desktop / mobile logic
 * sharing"). Tasks with a project are grouped under that project's own area
 * (task.area_id is ignored once a task has a project, matching the existing
 * inference convention used by Space.route.tsx and dashboard.controller). A
 * project with no area, and a task with neither project nor area, both fall
 * into a synthetic "No Area" bucket (itself with a "No Project" leaf) so
 * nothing is silently dropped from the grouped view.
 */
export function groupTasksByAreaAndProject(
  tasks: TaskWithTags[],
  areas: Area[],
  projects: Project[],
): TaskAreaGroup[] {
  const open = tasks.filter((t) => t.status === "todo");
  const areaGroups: TaskAreaGroup[] = [];

  for (const area of areas) {
    const areaProjects = projects.filter((p) => p.area_id === area.id && p.status === "active");
    const projectGroups = projectGroupsFor(areaProjects, open);

    const areaDirect = open.filter((t) => t.area_id === area.id && isInbox(t));
    if (areaDirect.length > 0) {
      projectGroups.push({ key: `noproject-${area.id}`, label: "No Project", color: NO_GROUP_COLOR, projectId: null, tasks: areaDirect });
    }

    if (projectGroups.length > 0) {
      areaGroups.push({ key: `area-${area.id}`, label: area.name, color: area.color, areaId: area.id, projectGroups });
    }
  }

  const unassignedProjects = projects.filter((p) => p.area_id === null && p.status === "active");
  const noAreaGroups = projectGroupsFor(unassignedProjects, open);

  const bareTasks = open.filter((t) => !t.area_id && isInbox(t));
  if (bareTasks.length > 0) {
    noAreaGroups.push({ key: "noproject-none", label: "No Project", color: NO_GROUP_COLOR, projectId: null, tasks: bareTasks });
  }

  if (noAreaGroups.length > 0) {
    areaGroups.push({ key: "area-none", label: "No Area", color: NO_GROUP_COLOR, areaId: null, projectGroups: noAreaGroups });
  }

  return areaGroups;
}
