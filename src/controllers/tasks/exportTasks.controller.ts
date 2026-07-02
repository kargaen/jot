import { serializeTasks, type ExportableTask } from "../../models/export/jotExport";

interface ExportTasksDependencies {
  copyToClipboard: (text: string) => Promise<void>;
}

export interface ExportTasksResult {
  count: number;
}

// Serializes tasks to JotExport v1 JSON and copies it to the clipboard — the
// same serializer the `conduit` API uses, so both surfaces emit identical shape.
export async function exportTasksToClipboard(
  dependencies: ExportTasksDependencies,
  tasks: ExportableTask[],
): Promise<ExportTasksResult> {
  const payload = serializeTasks(tasks);
  await dependencies.copyToClipboard(JSON.stringify(payload, null, 2));
  return { count: payload.task_count };
}
