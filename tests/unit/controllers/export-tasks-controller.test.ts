// Pins EPIC-014 item 9: format-aware copy (JSON vs Markdown) through the export controller.
import { exportTasksToClipboard } from "../../../src/controllers/tasks/exportTasks.controller";
import type { ExportableTask } from "../../../src/models/export/jotExport";

let failures = 0;
function assert(label: string, cond: boolean, detail = "") {
  if (!cond) { failures++; console.error(`  \x1b[31m✗ ${label}\x1b[0m ${detail}`); }
}

const task: ExportableTask = {
  id: "t1", title: "Buy milk", status: "todo", priority: "high",
  description: null, notes: null, project_id: null, area_id: null, parent_task_id: null,
  due_date: null, due_time: null, scheduled_date: null, recurrence_rule: null,
  estimated_mins: null, responsible_email: null, completed_at: null,
  created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
  tags: [], project: null,
};

let copied = "";
const deps = { copyToClipboard: async (t: string) => { copied = t; } };

// Default (no format) is JSON.
const r1 = await exportTasksToClipboard(deps, [task]);
assert("default copies JSON", copied.trimStart().startsWith("{"), copied.slice(0, 20));
assert("count returned", r1.count === 1, String(r1.count));
assert("JSON is v2", copied.includes('"version": 2'), copied.slice(0, 60));

// Explicit markdown.
await exportTasksToClipboard(deps, [task], "markdown");
assert("markdown copies a heading", copied.startsWith("# Jot export (1 task)"), copied.split("\n")[0]);
assert("markdown is not JSON", !copied.trimStart().startsWith("{"), copied.slice(0, 20));

// Explicit json.
await exportTasksToClipboard(deps, [task], "json");
assert("explicit json copies JSON", copied.trimStart().startsWith("{"), copied.slice(0, 20));

if (failures > 0) { console.error(`\nExport controller tests: ${failures} failed`); process.exit(1); }
console.log("Export controller tests passed");
