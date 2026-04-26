import type { Project, TaskWithTags } from "../types";

/**
 * Reads the hidden-area IDs from localStorage.
 * Safe to call from any window (Dashboard, Pulse, etc.)
 */
export function loadHiddenAreas(): string[] {
  try { return JSON.parse(localStorage.getItem("jot_hidden_areas") ?? "[]"); }
  catch { return []; }
}

export function saveHiddenAreas(ids: string[]) {
  localStorage.setItem("jot_hidden_areas", JSON.stringify(ids));
}

/**
 * Filter tasks to only those in visible (non-hidden) areas.
 * A task is hidden if:
 *   - its own area_id is in hiddenAreaIds, OR
 *   - it belongs to a project whose area_id is in hiddenAreaIds
 */
export function filterVisibleTasks(
  tasks: TaskWithTags[],
  projects: Project[],
  hiddenAreaIds: string[],
): TaskWithTags[] {
  const hiddenProjectIds = new Set(
    projects
      .filter((p) => !p.area_id || hiddenAreaIds.includes(p.area_id))
      .map((p) => p.id),
  );
  return tasks.filter((t) => {
    if (t.area_id && hiddenAreaIds.includes(t.area_id)) return false;
    if (t.project_id && hiddenProjectIds.has(t.project_id)) return false;
    return true;
  });
}

/**
 * Filter projects to only those in visible (non-hidden) areas.
 * Projects without an area are considered invalid and hidden until repaired.
 */
export function filterVisibleProjects(
  projects: Project[],
  hiddenAreaIds: string[],
): Project[] {
  return projects.filter((p) => p.area_id && !hiddenAreaIds.includes(p.area_id));
}
