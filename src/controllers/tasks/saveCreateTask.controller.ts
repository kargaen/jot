import { suggestIcon } from "../../lib/icons";
import type { CreateTaskInput } from "../../lib/supabase";
import type { Project, Task } from "../../types";
import {
  buildCreateTaskInput,
  resolveTaskProjectSelection,
  type TaskCreationDraft,
} from "../../models/tasks/taskCreation";

interface SaveCreateTaskDependencies {
  createProject: (name: string, areaId?: string | null) => Promise<Project>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
}

interface SaveCreateTaskRequest extends TaskCreationDraft {
  projects: Project[];
  canCreateProjectsAndTags?: boolean;
}

export interface SaveCreateTaskResult {
  task: Task;
  matchedProject: Project | null;
  suggestedProject: string | null;
  createdProject: Project | null;
}

export async function saveCreateTaskDraft(
  dependencies: SaveCreateTaskDependencies,
  request: SaveCreateTaskRequest,
): Promise<SaveCreateTaskResult> {
  const { matchedProject, suggestedProject } = resolveTaskProjectSelection(
    request.projects,
    request.projectName ?? "",
  );

  let resolvedProjectId = request.projectId ?? matchedProject?.id ?? null;
  let createdProject: Project | null = null;

  if (request.canCreateProjectsAndTags && !resolvedProjectId && suggestedProject) {
    createdProject = await dependencies.createProject(suggestedProject, request.areaId ?? null);
    resolvedProjectId = createdProject.id;
  }

  const task = await dependencies.createTask(
    buildCreateTaskInput(request, resolvedProjectId, suggestIcon(request.title.trim())),
  );

  return {
    task,
    matchedProject,
    suggestedProject,
    createdProject,
  };
}
