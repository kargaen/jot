// widgetSync.ts
//
// Syncs today's + overdue tasks into the local jot_widget.db so Android
// home-screen widgets can read them without a network connection.
//
// Safe to call on desktop — returns immediately if not running on Android.
// Fire-and-forget: errors are logged but never thrown to the caller.
//
// Usage (call after any task mutation or on app foreground):
//   import { syncWidgets } from "../lib/widgetSync";
//   syncWidgets();   // no await needed

import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { supabase } from "./supabase";

interface WidgetTask {
  id: string;
  title: string;
  due_date: string;
  due_time: string | null;
  priority: string;
  project_name: string | null;
  is_overdue: boolean;
  display_order: number;
}

interface SyncPayload {
  tasks: WidgetTask[];
  today_count: number;
  overdue_count: number;
}

export async function syncWidgets(): Promise<void> {
  try {
    const os = await platform();
    if (os !== "android") return;

    const today = todayISO();
    const payload = await buildPayload(today);
    await invoke("sync_widget_db", { payload });
  } catch (err) {
    console.warn("[widgetSync] sync failed:", err);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildPayload(today: string): Promise<SyncPayload> {
  // Jot schema: tasks.status = 'todo' | 'completed', joined to projects(name)
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_date, due_time, priority, sort_order, projects(name)")
    .eq("status", "todo")
    .lte("due_date", today)
    .not("due_date", "is", null)
    .order("due_date", { ascending: true });

  if (error) throw error;

  const tasks: WidgetTask[] = (data ?? []).map((row: any, i: number) => ({
    id:           row.id,
    title:        row.title,
    due_date:     row.due_date,
    due_time:     row.due_time ?? null,
    priority:     row.priority ?? "none",
    project_name: row.projects?.name ?? null,
    is_overdue:   row.due_date < today,
    display_order: row.sort_order ?? i,
  }));

  return {
    tasks,
    today_count:   tasks.filter((t) => t.due_date === today).length,
    overdue_count: tasks.filter((t) => t.is_overdue).length,
  };
}

function todayISO(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}
