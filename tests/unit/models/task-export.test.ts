// Pins EPIC-014 items 2/3: JotExport v2 — version bump + empty omission.
// "Empty" (Q3) = null/undefined, empty string, empty array, empty object.
// Numbers (incl. 0) and booleans are meaningful and kept.
import { serializeTasks, type ExportableTask } from "../../../src/models/export/jotExport";

let failures = 0;
function assertEqual<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures++;
    console.error(`  \x1b[31m✗ ${label}\x1b[0m\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
  }
}

const AT = "2026-07-14T00:00:00Z";

// A sparse task: only a few meaningful fields; everything else null/empty.
const sparse: ExportableTask = {
  id: "t1", title: "Buy milk", status: "todo", priority: "high",
  description: null, notes: "", project_id: null, area_id: "area-1",
  parent_task_id: null, due_date: "2026-08-01", due_time: null,
  scheduled_date: null, recurrence_rule: null, estimated_mins: null,
  responsible_email: null, completed_at: null,
  created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
  tags: [], project: null,
};

assertEqual("sparse task drops all empty keys; version is 2", serializeTasks([sparse], AT), {
  format: "jot.export",
  version: 2,
  exported_at: AT,
  task_count: 1,
  tasks: [
    {
      id: "t1", title: "Buy milk", status: "todo", priority: "high",
      area_id: "area-1", due_date: "2026-08-01",
      created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
    },
  ],
});

// A populated task keeps its meaningful fields, including tags and project.
const full: ExportableTask = {
  id: "t2", title: "Ship", status: "completed", priority: "none",
  description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "note body" }] }] },
  notes: "manual note", project_id: "p1", area_id: null, parent_task_id: null,
  due_date: null, due_time: null, scheduled_date: "2026-07-20", recurrence_rule: null,
  estimated_mins: 0, responsible_email: null, completed_at: "2026-07-10T09:00:00Z",
  created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-10T09:00:00Z",
  tags: [{ id: "g1", name: "home" }], project: { id: "p1", name: "House" },
};

assertEqual("populated task keeps meaningful fields; estimated_mins 0 kept", serializeTasks([full], AT), {
  format: "jot.export",
  version: 2,
  exported_at: AT,
  task_count: 1,
  tasks: [
    {
      id: "t2", title: "Ship", status: "completed", priority: "none",
      description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "note body" }] }] },
      description_text: "note body",
      notes: "manual note",
      project: { id: "p1", name: "House" },
      tags: [{ id: "g1", name: "home" }],
      scheduled_date: "2026-07-20",
      estimated_mins: 0,
      completed_at: "2026-07-10T09:00:00Z",
      created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-10T09:00:00Z",
    },
  ],
});

// Envelope frame is stable even with no tasks (task_count 0 kept, tasks [] kept).
assertEqual("empty export keeps the envelope frame", serializeTasks([], AT), {
  format: "jot.export",
  version: 2,
  exported_at: AT,
  task_count: 0,
  tasks: [],
});

if (failures > 0) {
  console.error(`\nTask export tests: ${failures} failed`);
  process.exit(1);
}
console.log("Task export tests passed");
