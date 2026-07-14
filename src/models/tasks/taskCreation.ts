import type { CreateTaskInput } from "../../services/backend/supabase.service";
import type { Project, Task } from "../shared";

export interface TaskCreationDraft {
  title: string;
  projectId?: string | null;
  projectName?: string;
  areaId?: string | null;
  parentTaskId?: string | null;
  description?: Record<string, unknown> | null;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: Task["priority"];
  effort?: Task["effort"];
  recurrenceRule?: string | null;
  tagIds?: string[];
}

export interface TaskProjectResolution {
  matchedProject: Project | null;
  suggestedProject: string | null;
}

export function resolveTaskProjectSelection(
  projects: Project[],
  rawProjectName: string,
): TaskProjectResolution {
  const projectName = rawProjectName.trim();
  if (!projectName) {
    return { matchedProject: null, suggestedProject: null };
  }

  const matchedProject =
    projects.find((project) => project.name.toLowerCase() === projectName.toLowerCase()) ?? null;

  return {
    matchedProject,
    suggestedProject: matchedProject ? null : projectName,
  };
}

export function buildCreateTaskInput(
  draft: TaskCreationDraft,
  resolvedProjectId: string | null,
  icon: string | null,
): CreateTaskInput {
  return {
    title: draft.title.trim(),
    parentTaskId: draft.parentTaskId ?? null,
    projectId: resolvedProjectId,
    areaId: draft.areaId ?? null,
    icon,
    description: draft.description ?? null,
    dueDate: draft.dueDate ?? null,
    dueTime: draft.dueTime ?? null,
    priority: draft.priority ?? "none",
    effort: draft.effort ?? null,
    recurrenceRule: draft.recurrenceRule ?? null,
    tagIds: draft.tagIds ?? [],
  };
}
