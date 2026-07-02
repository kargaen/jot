// Conduit API — lets external tools (e.g. a Home Assistant integration) read
// and add Jot tasks over HTTP, authenticated with a personal token generated
// in Settings (see src/models/tokens/apiToken.ts + src/services/backend/
// supabase.service.ts createApiToken/fetchApiTokens/revokeApiToken).
//
// GET  /conduit/tasks  — extract tasks as JotExport v1 JSON.
// POST /conduit/tasks  — insert one task, or { "tasks": [...] } (max 50).
//
// Auth: `Authorization: Bearer jot_...`. This function runs with the service
// role key, which bypasses RLS — every query below explicitly scopes
// `user_id` to the token's owner. That scoping IS the security boundary here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serializeTasks, type ExportableTask } from "../../../src/models/export/jotExport.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TASKS_SELECT = "*, task_tags(tag_id, tags(id, name)), project:projects(id, name)";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status);
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function authenticate(req: Request): Promise<string | null> {
  const header = req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const hash = await sha256Hex(match[1]);
  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, user_id")
    .eq("token_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return null;

  void supabase
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return data.user_id;
}

type TaskRow = Record<string, unknown> & {
  task_tags?: { tags: { id: string; name: string } | null }[] | null;
  project?: { id: string; name: string } | null;
};

function rowToExportable(row: TaskRow): ExportableTask {
  const tags = (row.task_tags ?? [])
    .map((tt) => tt.tags)
    .filter((tag): tag is { id: string; name: string } => !!tag);
  return { ...(row as unknown as ExportableTask), tags, project: row.project ?? null };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleGet(req: Request, userId: string): Promise<Response> {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "todo";
  const since = url.searchParams.get("since");
  const projectParam = url.searchParams.get("project");
  const limitParam = Number(url.searchParams.get("limit") ?? "200");
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 200, 1), 1000);

  let projectId: string | null = null;
  if (projectParam) {
    projectId = await resolveProjectId(userId, projectParam);
    if (!projectId) return errorResponse(422, "unknown_project", `No project matches "${projectParam}"`);
  }

  let query = supabase
    .from("tasks")
    .select(TASKS_SELECT)
    .eq("user_id", userId)
    .eq("status", status)
    .is("parent_task_id", null)
    .order("sort_order")
    .limit(limit);
  if (since) query = query.gte("updated_at", since);
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) return errorResponse(500, "query_failed", error.message);

  const tasks = (data ?? []).map((row) => rowToExportable(row as TaskRow));
  return jsonResponse(serializeTasks(tasks));
}

async function resolveProjectId(userId: string, projectRef: string): Promise<string | null> {
  if (UUID_RE.test(projectRef)) {
    const { data } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", userId)
      .eq("id", projectRef)
      .maybeSingle();
    return data?.id ?? null;
  }
  const { data } = await supabase
    .from("projects")
    .select("id, name")
    .eq("user_id", userId)
    .ilike("name", projectRef);
  const exact = (data ?? []).find((p) => p.name.toLowerCase() === projectRef.trim().toLowerCase());
  return exact?.id ?? null;
}

async function resolveAreaId(userId: string, areaRef: string | null | undefined): Promise<string> {
  if (areaRef) {
    const { data } = await supabase
      .from("areas")
      .select("id")
      .eq("user_id", userId)
      .eq("id", areaRef)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const { data: areas } = await supabase
    .from("areas")
    .select("id")
    .eq("user_id", userId)
    .order("sort_order")
    .limit(1);
  if (areas && areas[0]) return areas[0].id;

  const { data: created, error } = await supabase
    .from("areas")
    .insert({ name: "Personal", user_id: userId })
    .select("id")
    .single();
  if (error || !created) throw new Error(`Failed to create default area: ${error?.message}`);
  return created.id;
}

async function resolveTagIds(userId: string, names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const { data: existing } = await supabase
    .from("tags")
    .select("id, name")
    .eq("user_id", userId);
  const byLowerName = new Map((existing ?? []).map((t) => [t.name.toLowerCase(), t.id]));

  const ids: string[] = [];
  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;
    const existingId = byLowerName.get(name.toLowerCase());
    if (existingId) {
      ids.push(existingId);
      continue;
    }
    const { data: created, error } = await supabase
      .from("tags")
      .upsert({ name, user_id: userId }, { onConflict: "user_id,name" })
      .select("id")
      .single();
    if (error || !created) throw new Error(`Failed to create tag "${name}": ${error?.message}`);
    ids.push(created.id);
    byLowerName.set(name.toLowerCase(), created.id);
  }
  return ids;
}

interface InsertTaskBody {
  title?: string;
  description?: Record<string, unknown> | null;
  notes?: string | null;
  priority?: "none" | "low" | "medium" | "high";
  due_date?: string | null;
  due_time?: string | null;
  scheduled_date?: string | null;
  recurrence_rule?: string | null;
  estimated_mins?: number | null;
  project?: string | null;
  area_id?: string | null;
  parent_task_id?: string | null;
  tags?: string[];
}

async function insertOne(userId: string, body: InsertTaskBody): Promise<string> {
  const title = body.title?.trim();
  if (!title) throw { status: 422, code: "missing_title", message: "title is required" };

  let projectId: string | null = null;
  if (body.project) {
    projectId = await resolveProjectId(userId, body.project);
    if (!projectId) {
      throw { status: 422, code: "unknown_project", message: `No project matches "${body.project}"` };
    }
  }

  const areaId = projectId ? null : await resolveAreaId(userId, body.area_id);
  const tagIds = await resolveTagIds(userId, body.tags ?? []);

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title,
      description: body.description ?? null,
      notes: body.notes ?? null,
      priority: body.priority ?? "none",
      due_date: body.due_date ?? null,
      due_time: body.due_time ?? null,
      scheduled_date: body.scheduled_date ?? null,
      recurrence_rule: body.recurrence_rule ?? null,
      estimated_mins: body.estimated_mins ?? null,
      project_id: projectId,
      area_id: areaId,
      parent_task_id: body.parent_task_id ?? null,
    })
    .select("id")
    .single();
  if (error || !task) throw { status: 500, code: "insert_failed", message: error?.message ?? "insert failed" };

  if (tagIds.length > 0) {
    const { error: tagError } = await supabase
      .from("task_tags")
      .insert(tagIds.map((tag_id) => ({ task_id: task.id, tag_id })));
    if (tagError) throw { status: 500, code: "insert_failed", message: tagError.message };
  }

  return task.id;
}

async function handlePost(req: Request, userId: string): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "malformed_json", "Request body must be valid JSON");
  }

  const items: InsertTaskBody[] = Array.isArray((body as { tasks?: unknown })?.tasks)
    ? (body as { tasks: InsertTaskBody[] }).tasks
    : [body as InsertTaskBody];
  if (items.length === 0 || items.length > 50) {
    return errorResponse(422, "invalid_batch", "Provide 1-50 tasks");
  }

  const ids: string[] = [];
  for (const item of items) {
    try {
      ids.push(await insertOne(userId, item));
    } catch (err) {
      const e = err as { status?: number; code?: string; message?: string };
      return errorResponse(e.status ?? 500, e.code ?? "insert_failed", e.message ?? "Insert failed");
    }
  }

  const { data, error } = await supabase
    .from("tasks")
    .select(TASKS_SELECT)
    .in("id", ids);
  if (error) return errorResponse(500, "query_failed", error.message);

  const tasks = (data ?? []).map((row) => rowToExportable(row as TaskRow));
  return jsonResponse(serializeTasks(tasks), 201);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!url.pathname.endsWith("/tasks")) {
    return errorResponse(404, "not_found", "Unknown route");
  }

  const userId = await authenticate(req);
  if (!userId) return errorResponse(401, "unauthorized", "Missing or invalid API token");

  try {
    if (req.method === "GET") return await handleGet(req, userId);
    if (req.method === "POST") return await handlePost(req, userId);
    return errorResponse(405, "method_not_allowed", `${req.method} not supported`);
  } catch (err) {
    console.error("[conduit] unexpected error:", err instanceof Error ? err.message : String(err));
    return errorResponse(500, "internal_error", "Unexpected error");
  }
});
