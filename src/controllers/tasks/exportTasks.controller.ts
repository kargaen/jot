import { serializeTasks, renderMarkdown, type ExportableTask, type ExportFormat } from "../../models/export/jotExport";

export type { ExportFormat };

interface ExportTasksDependencies {
  copyToClipboard: (text: string) => Promise<void>;
}

export interface ExportTasksResult {
  count: number;
}

// The clipboard can carry the machine JSON or a human-readable Markdown rendering;
// both derive from the single serializer output (§11a). `ExportFormat` lives in the
// export model and is re-exported here for existing controller-layer consumers.

// Serializes tasks through the single JotExport serializer and copies them to the
// clipboard in the chosen format (the `conduit` API always emits the JSON shape).
export async function exportTasksToClipboard(
  dependencies: ExportTasksDependencies,
  tasks: ExportableTask[],
  format: ExportFormat = "json",
): Promise<ExportTasksResult> {
  const payload = serializeTasks(tasks);
  const text = format === "markdown" ? renderMarkdown(payload) : JSON.stringify(payload, null, 2);
  await dependencies.copyToClipboard(text);
  return { count: payload.task_count };
}
