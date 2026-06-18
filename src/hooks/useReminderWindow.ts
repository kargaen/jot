import { useEffect, useState } from "react";
import type { Area, Project, TaskWithTags } from "../models/shared";
import { logger } from "../utils/observability/logger";
import {
  completeTask,
  fetchAllTasks,
  fetchAreas,
  fetchProjects,
  supabase,
} from "../services/backend/supabase.service";

export function useReminderWindow(userId: string | undefined) {
  const [tasks, setTasks] = useState<TaskWithTags[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoaded(false);
    Promise.all([fetchAllTasks(), fetchProjects(), fetchAreas()])
      .then(([t, p, a]) => { setTasks(t); setProjects(p); setAreas(a); setLoaded(true); })
      .catch((err: unknown) => { logger.warn("reminder-window", "initial fetch failed", err instanceof Error ? err.message : err); setLoaded(true); });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("pulse-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          fetchAllTasks().then(setTasks).catch((err: unknown) => { logger.warn("reminder-window", "realtime refresh failed", err instanceof Error ? err.message : err); });
        }, 500);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function onTaskCompleted(id: string): Promise<void> {
    await completeTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  return { tasks, projects, areas, loaded, onTaskCompleted };
}
