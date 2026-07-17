import type { TaskAttachment } from "../../models/shared";
import { preparePastedTaskAttachment } from "../../models/tasks/taskAttachmentPaste";
import {
  fetchTaskAttachments,
  createTaskAttachmentUrl,
  removeTaskAttachment,
  uploadTaskAttachment,
} from "../../services/backend/supabase.service";

export const TASK_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const TASK_ATTACHMENT_MAX_COUNT = 3;

export type TaskAttachmentNotice =
  | "too-large"
  | "image-still-too-large"
  | "too-many"
  | "unsupported-type"
  | "resized-image";

export interface TaskAttachmentPasteResult {
  attachment: TaskAttachment | null;
  notice: TaskAttachmentNotice | null;
}

export async function loadTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  return fetchTaskAttachments(taskId);
}

export async function deleteTaskAttachment(attachment: TaskAttachment): Promise<void> {
  await removeTaskAttachment(attachment);
}

export async function openTaskAttachment(attachment: TaskAttachment): Promise<string> {
  return createTaskAttachmentUrl(attachment);
}

export async function pasteTaskAttachment(input: {
  taskId: string;
  file: File;
  existingAttachmentCount: number;
}): Promise<TaskAttachmentPasteResult> {
  const decision = await preparePastedTaskAttachment({
    file: input.file,
    existingAttachmentCount: input.existingAttachmentCount,
    maxBytes: TASK_ATTACHMENT_MAX_BYTES,
    maxAttachments: TASK_ATTACHMENT_MAX_COUNT,
  });

  if (decision.kind === "reject") {
    return { attachment: null, notice: decision.reason };
  }

  const attachment = await uploadTaskAttachment({ taskId: input.taskId, file: decision.file });
  return { attachment, notice: decision.notice };
}
