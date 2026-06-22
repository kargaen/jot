import type { Project, Task, TaskWithTags } from "../shared";

// ── Date-bucket predicates ────────────────────────────────────────────────────
// Pass today as "YYYY-MM-DD" so callers share the same reference point and
// these functions stay pure / testable without touching Date internals.

export function isOverdue(task: Task, today: string): boolean {
  return task.status === "todo" && !!task.due_date && task.due_date < today;
}

export function isDueToday(task: Task, today: string): boolean {
  return (
    task.status === "todo" &&
    (task.due_date === today || task.scheduled_date === today)
  );
}

export function isUpcoming(task: Task, today: string): boolean {
  const date = task.scheduled_date ?? task.due_date;
  return task.status === "todo" && !!date && date > today;
}

export function isInbox(task: Task): boolean {
  return task.status === "todo" && task.project_id === null;
}

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
