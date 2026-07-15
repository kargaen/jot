import { useState } from "react";
import type { TaskWithTags } from "../models/shared";
import type { ExportFormat } from "../models/export/jotExport";
import { exportTasksToClipboard } from "../controllers/tasks/exportTasks.controller";
import { loadExportFormat, saveExportFormat } from "../utils/preferences/exportFormat";
import { copyTextToClipboard } from "../services/tauri/clipboard.service";

// EPIC-014: the glue between a copy control and the export controller/service, so
// views never reach past a hook. Owns the remembered format (global, Q4) and turns
// a task list into a clipboard write plus a human-facing message.
export function useCopyTasks() {
  const [format, setFormat] = useState<ExportFormat>(loadExportFormat);

  function pick(next: ExportFormat) {
    setFormat(next);
    saveExportFormat(next);
  }

  async function copy(tasks: TaskWithTags[]): Promise<string> {
    const { count } = await exportTasksToClipboard(
      { copyToClipboard: copyTextToClipboard },
      tasks,
      format,
    );
    const label = format === "markdown" ? "Markdown" : "JSON";
    return count === 1 ? `1 task copied as ${label}` : `${count} tasks copied as ${label}`;
  }

  return { format, pick, copy };
}
