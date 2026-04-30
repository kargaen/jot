import type { Project, TaskWithTags } from "../../types";

export function filterVisibleTasks(
  tasks: TaskWithTags[],
  projects: Project[],
  hiddenAreaIds: string[],
): TaskWithTags[] {
  const hiddenProjectIds = new Set(
    projects
      .filter((project) => !project.area_id || hiddenAreaIds.includes(project.area_id))
      .map((project) => project.id),
  );

  return tasks.filter((task) => {
    if (task.area_id && hiddenAreaIds.includes(task.area_id)) return false;
    if (task.project_id && hiddenProjectIds.has(task.project_id)) return false;
    return true;
  });
}

export function filterVisibleProjects(
  projects: Project[],
  hiddenAreaIds: string[],
): Project[] {
  return projects.filter((project) => project.area_id && !hiddenAreaIds.includes(project.area_id));
}
