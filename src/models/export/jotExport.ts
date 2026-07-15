// JotExport v2 — the single source of truth for how tasks leave Jot.
// Consumed by BOTH the in-app export (clipboard) and the `conduit` edge
// function (supabase/functions/conduit), so the two surfaces can never drift.
// v2 omits empty/null fields (EPIC-014); consumers must tolerate absent keys.
//
// This module must stay dependency-free and import-free: it runs unchanged in
// the browser/WebView (Vite) and in Deno (Supabase edge functions, which
// import it by relative path with a .ts extension).

/**
 * Structural subset of `TaskWithTags` (src/models/shared/index.ts) that the
 * serializer needs. Duck-typed so app code passes `TaskWithTags[]` directly
 * and the edge function can pass mapped rows, without importing app models.
 */
export interface ExportableTask {
  id: string;
  title: string;
  status: "todo" | "completed" | "cancelled";
  priority: "none" | "low" | "medium" | "high";
  description: Record<string, unknown> | null;
  notes: string | null;
  project_id: string | null;
  area_id: string | null;
  parent_task_id: string | null;
  due_date: string | null;
  due_time: string | null;
  scheduled_date: string | null;
  recurrence_rule: string | null;
  estimated_mins: number | null;
  responsible_email: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  tags: { id: string; name: string }[];
  project?: { id: string; name: string } | null;
}

export interface JotExportTask {
  id: string;
  title: string;
  status: "todo" | "completed" | "cancelled";
  priority: "none" | "low" | "medium" | "high";
  description: Record<string, unknown> | null;
  description_text: string | null;
  notes: string | null;
  project: { id: string; name: string | null } | null;
  area_id: string | null;
  parent_task_id: string | null;
  tags: { id: string; name: string }[];
  due_date: string | null;
  due_time: string | null;
  scheduled_date: string | null;
  recurrence_rule: string | null;
  estimated_mins: number | null;
  responsible_email: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JotExportV2 {
  format: "jot.export";
  version: 2;
  exported_at: string;
  task_count: number;
  tasks: Array<Partial<JotExportTask>>;
}

// EPIC-014: clipboard export can be the machine JSON or the derived Markdown.
export type ExportFormat = "json" | "markdown";

// Empty (EPIC-014 Q3): null/undefined, empty string, empty array, empty object.
// Numbers (including 0) and booleans are meaningful and always kept.
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

// Deep-drops empty values so exported tasks carry only meaningful keys. Recurses
// first, so a container that becomes empty after cleaning (e.g. `tags: []`) is
// itself dropped. Consumers must tolerate absent keys — that is the v2 contract.
function dropEmpty<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(dropEmpty).filter((v) => !isEmpty(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      const cleaned = dropEmpty(v);
      if (!isEmpty(cleaned)) out[key] = cleaned;
    }
    return out as T;
  }
  return value;
}

/**
 * Flattens TipTap/ProseMirror JSON into plain text so AI/automation consumers
 * don't have to understand the editor format. Walks `text` leaves depth-first;
 * block-level nodes become newline breaks.
 */
export function tiptapToText(doc: Record<string, unknown> | null): string | null {
  if (!doc) return null;
  const parts: string[] = [];
  const blockTypes = new Set([
    "paragraph", "heading", "blockquote", "codeBlock",
    "listItem", "taskItem", "horizontalRule",
  ]);

  function walk(node: unknown): void {
    if (node === null || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (typeof n.text === "string") parts.push(n.text);
    const content = n.content;
    if (Array.isArray(content)) {
      for (const child of content) walk(child);
    }
    if (typeof n.type === "string" && blockTypes.has(n.type)) parts.push("\n");
  }

  walk(doc);
  const text = parts.join("").replace(/\n{3,}/g, "\n\n").trim();
  return text.length > 0 ? text : null;
}

/**
 * Serializes tasks into the JotExport v2 envelope. Pure and deterministic
 * (pass `exportedAt` for reproducible output; defaults to now).
 */
export function serializeTasks(tasks: ExportableTask[], exportedAt?: string): JotExportV2 {
  return {
    format: "jot.export",
    version: 2,
    exported_at: exportedAt ?? new Date().toISOString(),
    task_count: tasks.length,
    // Envelope keys stay as a stable frame; empties are dropped within each task.
    tasks: tasks.map((task) => dropEmpty(serializeTask(task))),
  };
}

/**
 * Renders a JotExport envelope as human-readable Markdown for clipboard paste.
 * A derived presentation of `serializeTasks`' output (§11a) — NOT a second data
 * source: it only reformats what the serializer already produced. Ids, timestamps,
 * and `estimated_mins` are omitted as non-human; `priority: "none"` is skipped as
 * noise. Absent keys (already dropped by v2) simply produce no line.
 */
export function renderMarkdown(exported: JotExportV2): string {
  const n = exported.task_count;
  const lines: string[] = [`# Jot export (${n} task${n === 1 ? "" : "s"})`];

  for (const task of exported.tasks) {
    lines.push("", `## ${task.title ?? "(untitled)"}`);
    const row = (label: string, value: string | undefined | null) => {
      if (value) lines.push(`- ${label}: ${value}`);
    };
    row("Status", task.status);
    row("Priority", task.priority && task.priority !== "none" ? task.priority : null);
    row("Project", task.project ? task.project.name ?? task.project.id : null);
    row("Due", task.due_date ? task.due_date + (task.due_time ? ` ${task.due_time}` : "") : null);
    row("Scheduled", task.scheduled_date);
    row("Repeat", task.recurrence_rule);
    row("Tags", task.tags && task.tags.length > 0 ? task.tags.map((t) => t.name).join(", ") : null);
    row("Notes", task.notes);
    row("Details", task.description_text);
  }

  return lines.join("\n");
}

function serializeTask(task: ExportableTask): JotExportTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    description: task.description,
    description_text: tiptapToText(task.description),
    notes: task.notes,
    project: task.project
      ? { id: task.project.id, name: task.project.name }
      : task.project_id
        ? { id: task.project_id, name: null }
        : null,
    area_id: task.area_id,
    parent_task_id: task.parent_task_id,
    tags: task.tags.map((tag) => ({ id: tag.id, name: tag.name })),
    due_date: task.due_date,
    due_time: task.due_time,
    scheduled_date: task.scheduled_date,
    recurrence_rule: task.recurrence_rule,
    estimated_mins: task.estimated_mins,
    responsible_email: task.responsible_email,
    completed_at: task.completed_at,
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
}
