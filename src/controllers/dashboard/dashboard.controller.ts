import type { Area, Project, Tag, TaskWithTags } from "../../models/shared";
import {
  closeProject,
  closeProjectAndCompleteTasks,
  closeProjectAndReleaseTasks,
  completeTask,
  createArea,
  deleteProject,
  fetchAllTasks,
  fetchAreas,
  fetchCompletionDates,
  fetchLogbookTasks,
  fetchProjects,
  fetchTags,
  getSession,
  mergeProjects,
  reorderProjects,
  reorderTasks,
  supabase,
  updateProject,
  updateTask,
} from "../../services/backend/supabase.service";
import { syncWidgets } from "../../services/sync/widgetSync.service";

export interface DashboardSnapshot {
  areas: Area[];
  projects: Project[];
  tags: Tag[];
  tasks: TaskWithTags[];
}

export interface DashboardLogbookSnapshot {
  tasks: TaskWithTags[];
  heatmapDates: string[];
}

export function dashboardErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return JSON.stringify(error);
}

export async function loadDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [areas, projects, tags, tasks] = await Promise.all([
    fetchAreas(),
    fetchProjects(),
    fetchTags(),
    fetchAllTasks(),
  ]);
  syncWidgets();
  return { areas, projects, tags, tasks };
}

export async function loadDashboardLogbook(): Promise<DashboardLogbookSnapshot> {
  const since = new Date();
  since.setDate(since.getDate() - 16 * 7);
  const [tasks, heatmapDates] = await Promise.all([
    fetchLogbookTasks(),
    fetchCompletionDates(since.toISOString()),
  ]);
  return { tasks, heatmapDates };
}

export function subscribeToDashboardTaskChanges(onChange: () => void) {
  const channel = supabase
    .channel("tasks-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function completeDashboardTask(taskId: string): Promise<void> {
  await completeTask(taskId);
}

export async function reorderDashboardTasks(
  updates: { id: string; sort_order: number }[],
): Promise<void> {
  await reorderTasks(updates);
}

export async function reorderDashboardProjects(
  updates: { id: string; sort_order: number }[],
): Promise<void> {
  await reorderProjects(updates);
}

export async function mergeDashboardProjects(
  sourceProjectId: string,
  targetProjectId: string,
): Promise<void> {
  await mergeProjects(sourceProjectId, targetProjectId);
}

export async function moveDashboardTask(
  taskId: string,
  projectId: string | null,
  areaId: string | null,
): Promise<void> {
  await updateTask(taskId, { project_id: projectId, area_id: areaId });
}

export async function moveDashboardProject(
  projectId: string,
  areaId: string,
): Promise<void> {
  await updateProject(projectId, { area_id: areaId });
}

export async function createDashboardArea(name: string): Promise<Area> {
  const session = await getSession();
  if (!session) throw new Error("SESSION_NOT_READY");
  return createArea(name.trim());
}

export async function deleteDashboardProject(projectId: string): Promise<void> {
  await deleteProject(projectId);
}

export async function closeDashboardProject(projectId: string): Promise<void> {
  await closeProject(projectId);
}

export async function closeDashboardProjectWithTasks(
  projectId: string,
  action: "complete" | "release",
): Promise<void> {
  if (action === "complete") {
    await closeProjectAndCompleteTasks(projectId);
    return;
  }
  await closeProjectAndReleaseTasks(projectId);
}
