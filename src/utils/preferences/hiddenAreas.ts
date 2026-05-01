export {
  filterVisibleProjects,
  filterVisibleTasks,
} from "../../models/tasks/taskVisibility";

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
