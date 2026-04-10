import { createClient } from "@supabase/supabase-js";
import type { Area, AreaMember, Feedback, Project, Tag, Task, TaskWithTags } from "../types";
import { logger } from "./logger";

function logErr(op: string, error: unknown): never {
  const msg =
    error instanceof Error ? error.message :
    error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) :
    JSON.stringify(error);
  logger.error("supabase", `${op}: ${msg}`);
  throw error;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env",
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: {
      getItem: (key) => {
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          localStorage.setItem(key, value);
        } catch {}
      },
      removeItem: (key) => {
        try {
          localStorage.removeItem(key);
        } catch {}
      },
    },
  },
});

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function getCurrentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Not authenticated");
  return data.session.user.id;
}

export async function fetchAreas(): Promise<Area[]> {
  const { data, error } = await supabase
    .from("areas")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data;
}

export async function createArea(name: string, color = "#6B7280"): Promise<Area> {
  const user_id = await getCurrentUserId();
  const { data, error } = await supabase
    .from("areas")
    .insert({ name, color, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateArea(id: string, fields: Partial<{ name: string; color: string }>): Promise<void> {
  const { error } = await supabase.from("areas").update(fields).eq("id", id);
  if (error) logErr("updateArea", error);
}

export async function deleteArea(id: string): Promise<void> {
  const { error } = await supabase.from("areas").delete().eq("id", id);
  if (error) logErr("deleteArea", error);
}

export async function updatePassword(newPassword: string): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) { logger.error("supabase", `updatePassword: ${error.message}`); return error.message; }
  return null;
}

export async function signOutEverywhere(): Promise<void> {
  await supabase.auth.signOut({ scope: "global" });
}

export async function fetchAreaMembers(areaId: string): Promise<AreaMember[]> {
  const { data, error } = await supabase
    .from("area_members")
    .select("*")
    .eq("area_id", areaId)
    .order("created_at");
  if (error) logErr("fetchAreaMembers", error);
  return data ?? [];
}

export async function inviteMember(areaId: string, email: string): Promise<string | null> {
  const { error } = await supabase
    .from("area_members")
    .insert({ area_id: areaId, invited_email: email.toLowerCase().trim() });
  if (error) { logger.error("supabase", `inviteMember: ${error.message}`); return error.message; }
  return null;
}

export async function removeAreaMember(memberId: string): Promise<void> {
  const { error } = await supabase.from("area_members").delete().eq("id", memberId);
  if (error) logErr("removeAreaMember", error);
}

export async function fetchPendingInvites(): Promise<AreaMember[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return [];
  const { data, error } = await supabase
    .from("area_members")
    .select("*")
    .eq("invited_email", user.email.toLowerCase())
    .eq("status", "pending");
  if (error) logErr("fetchPendingInvites", error);
  return data ?? [];
}

export async function acceptInvite(memberId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("area_members")
    .update({ status: "accepted", user_id: user.id })
    .eq("id", memberId);
  if (error) logErr("acceptInvite", error);
}

export async function declineInvite(memberId: string): Promise<void> {
  const { error } = await supabase.from("area_members").delete().eq("id", memberId);
  if (error) logErr("declineInvite", error);
}

export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("status", "active")
    .order("sort_order");
  if (error) throw error;
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) logErr("deleteProject", error);
}

export async function createProject(
  name: string,
  areaId?: string,
  color = "#6B7280",
): Promise<Project> {
  const user_id = await getCurrentUserId();
  const { data, error } = await supabase
    .from("projects")
    .insert({ name, area_id: areaId ?? null, color, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Loads all top-level todo tasks. Views are derived from this in memory.
export async function fetchAllTasks(): Promise<TaskWithTags[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, task_tags(tag_id, tags(*))")
    .eq("status", "todo")
    .is("parent_task_id", null)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    tags: row.task_tags?.map((tt: { tags: Tag }) => tt.tags) ?? [],
  }));
}

// Only completed_at strings — very lightweight, used for the heatmap
export async function fetchCompletionDates(since: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("completed_at")
    .eq("status", "completed")
    .gte("completed_at", since)
    .not("completed_at", "is", null);
  if (error) throw error;
  return (data ?? []).map((r) => r.completed_at as string);
}

export async function fetchLogbookTasks(): Promise<TaskWithTags[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, task_tags(tag_id, tags(*))")
    .eq("status", "completed")
    .is("parent_task_id", null)
    .order("completed_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    tags: row.task_tags?.map((tt: { tags: Tag }) => tt.tags) ?? [],
  }));
}


export async function fetchSubtasks(parentId: string): Promise<TaskWithTags[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, task_tags(tag_id, tags(*))")
    .eq("parent_task_id", parentId)
    .eq("status", "todo")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    tags: row.task_tags?.map((tt: { tags: Tag }) => tt.tags) ?? [],
  }));
}

export async function completeTask(taskId: string): Promise<void> {
  logger.info("supabase", `completeTask: ${taskId}`);
  const { error } = await supabase
    .from("tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) logErr("completeTask", error);
}

export async function updateTask(
  id: string,
  fields: Partial<{
    title: string;
    description: Record<string, unknown> | null;
    icon: string | null;
    project_id: string | null;
    area_id: string | null;
    parent_task_id: string | null;
    due_date: string | null;
    due_time: string | null;
    scheduled_date: string | null;
    priority: Task["priority"];
    recurrence_rule: string | null;
    estimated_mins: number | null;
    status: Task["status"];
  }>,
): Promise<void> {
  logger.debug("supabase", `updateTask: ${id}`, Object.keys(fields));
  const { error } = await supabase
    .from("tasks")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) logErr("updateTask", error);
}

export interface CreateTaskInput {
  title: string;
  projectId?: string | null;
  areaId?: string | null;
  parentTaskId?: string | null;
  icon?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  scheduledDate?: string | null;
  priority?: Task["priority"];
  recurrenceRule?: string | null;
  estimatedMins?: number | null;
  tagIds?: string[];
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const { tagIds = [], ...taskFields } = input;
  const user_id = await getCurrentUserId();
  logger.info("supabase", `createTask: "${taskFields.title}"`, {
    project: taskFields.projectId,
    priority: taskFields.priority,
    parent: taskFields.parentTaskId,
    tags: tagIds.length,
  });

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      title: taskFields.title,
      project_id: taskFields.projectId ?? null,
      area_id: taskFields.areaId ?? null,
      parent_task_id: taskFields.parentTaskId ?? null,
      icon: taskFields.icon ?? null,
      due_date: taskFields.dueDate ?? null,
      due_time: taskFields.dueTime ?? null,
      scheduled_date: taskFields.scheduledDate ?? null,
      priority: taskFields.priority ?? "none",
      recurrence_rule: taskFields.recurrenceRule ?? null,
      estimated_mins: taskFields.estimatedMins ?? null,
      user_id,
    })
    .select()
    .single();
  if (taskError) logErr("createTask", taskError);

  if (tagIds.length > 0) {
    const { error: tagError } = await supabase
      .from("task_tags")
      .insert(tagIds.map((tag_id) => ({ task_id: task.id, tag_id })));
    if (tagError) logErr("createTask(tags)", tagError);
  }

  logger.info("supabase", `createTask: saved ${task.id}`);
  return task;
}


export async function fetchTask(id: string): Promise<TaskWithTags> {
  logger.debug("supabase", `fetchTask: ${id}`);
  const { data, error } = await supabase
    .from("tasks")
    .select("*, task_tags(tag_id, tags(*))")
    .eq("id", id)
    .single();
  if (error) logErr("fetchTask", error);
  return {
    ...data,
    tags: data.task_tags?.map((tt: { tags: Tag }) => tt.tags) ?? [],
  };
}

export async function fetchTags(): Promise<Tag[]> {
  const { data, error } = await supabase.from("tags").select("*").order("name");
  if (error) throw error;
  return data;
}

export async function createTag(name: string, color = "#6B7280"): Promise<Tag> {
  const user_id = await getCurrentUserId();
  const { data, error } = await supabase
    .from("tags")
    .upsert({ name, color, user_id }, { onConflict: "user_id,name" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Feedback ────────────────────────────────────────────────────────────────

export async function fetchFeedback(): Promise<Feedback[]> {
  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) logErr("fetchFeedback", error);
  return data ?? [];
}

export async function submitFeedback(text: string): Promise<Feedback> {
  const { data, error } = await supabase
    .from("feedback")
    .insert({ text })
    .select()
    .single();
  if (error) logErr("submitFeedback", error);
  return data;
}
