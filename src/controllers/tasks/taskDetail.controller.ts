import type { AssignablePerson, Tag, TaskWithTags } from "../../models/shared";
import {
  addTaskTag,
  completeTask,
  createTag,
  fetchAssignablePeople,
  fetchSubtasks,
  removeTaskTag,
  updateTask,
} from "../../services/backend/supabase.service";
import { normalizeTaskLink } from "../../models/tasks/taskPresentation";

export interface TaskDetailDraft {
  title: string;
  icon: string | null;
  projectId: string | null;
  areaId: string | null;
  priority: TaskWithTags["priority"];
  responsibleUserId: string | null;
  responsibleEmail: string | null;
  dueDate: string;
  link: string;
  estimatedMins: string;
}

export function formatTaskEstimate(mins: number | null): string {
  if (!mins) return "";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function parseTaskEstimate(raw: string): number | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  const hoursAndMinutes = value.match(/(\d+)\s*h(?:\s*(\d+)\s*m)?/);
  if (hoursAndMinutes) {
    return parseInt(hoursAndMinutes[1]) * 60 + parseInt(hoursAndMinutes[2] ?? "0");
  }

  const minutesOnly = value.match(/^(\d+)\s*m?$/);
  if (minutesOnly) return parseInt(minutesOnly[1]);

  return null;
}

export function buildTaskDetailUpdateFields(input: {
  draft: TaskDetailDraft;
  description: Record<string, unknown> | null;
  fallbackAreaId: string | null;
}) {
  const { draft, description, fallbackAreaId } = input;

  return {
    title: draft.title,
    icon: draft.icon,
    project_id: draft.projectId,
    area_id: draft.projectId ? null : draft.areaId ?? fallbackAreaId,
    priority: draft.priority,
    responsible_user_id: draft.responsibleUserId,
    responsible_email: draft.responsibleEmail,
    due_date: draft.dueDate || null,
    notes: normalizeTaskLink(draft.link),
    estimated_mins: parseTaskEstimate(draft.estimatedMins),
    description,
  };
}

export async function saveTaskDetail(input: {
  taskId: string;
  draft: TaskDetailDraft;
  description: Record<string, unknown> | null;
  fallbackAreaId: string | null;
}): Promise<void> {
  await updateTask(
    input.taskId,
    buildTaskDetailUpdateFields({
      draft: input.draft,
      description: input.description,
      fallbackAreaId: input.fallbackAreaId,
    }),
  );
}

export async function completeTaskDetail(input: {
  taskId: string;
  draft: TaskDetailDraft;
  description: Record<string, unknown> | null;
  fallbackAreaId: string | null;
}): Promise<void> {
  await saveTaskDetail(input);
  await completeTask(input.taskId);
}

export async function loadTaskDetailSubtasks(taskId: string): Promise<TaskWithTags[]> {
  return fetchSubtasks(taskId);
}

export async function completeTaskDetailSubtask(subtaskId: string): Promise<void> {
  await completeTask(subtaskId);
}

export async function loadAssignablePeople(input: {
  projectId: string | null;
  areaId: string | null;
}): Promise<AssignablePerson[]> {
  return fetchAssignablePeople(input);
}

export async function attachTaskTag(taskId: string, tagId: string): Promise<void> {
  await addTaskTag(taskId, tagId);
}

export async function detachTaskTag(taskId: string, tagId: string): Promise<void> {
  await removeTaskTag(taskId, tagId);
}

/** Create a tag by name (or reuse the existing one) and attach it to the task. */
export async function createAndAttachTaskTag(taskId: string, name: string): Promise<Tag> {
  const tag = await createTag(name.trim());
  await addTaskTag(taskId, tag.id);
  return tag;
}
