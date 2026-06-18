import { useCallback, useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Area, Project, Tag, TaskWithTags } from "../models/shared";
import {
  fetchAreas,
  fetchProjects,
  fetchTags,
  fetchTask,
} from "../services/backend/supabase.service";
import { logger } from "../utils/observability/logger";

export function useTaskDetailWindow(taskId: string, userId: string | null) {
  const [task, setTask] = useState<TaskWithTags | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    logger.debug("task-window", `loadAll: fetching task ${taskId}`);
    try {
      const [t, p, a, tg] = await Promise.all([
        fetchTask(taskId),
        fetchProjects(),
        fetchAreas(),
        fetchTags(),
      ]);
      setTask(t);
      setProjects(p);
      setAreas(a);
      setTags(tg);
      await getCurrentWebviewWindow().setTitle(t.title);
      logger.info("task-window", `loaded: "${t.title}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load task";
      logger.error("task-window", `loadAll failed: ${msg}`);
      setError(msg);
    }
  }, [taskId]);

  useEffect(() => {
    if (!userId) return;
    logger.info("task-window", `init: taskId=${taskId}`);
    loadAll();
  }, [userId, taskId, loadAll]);

  return { task, projects, areas, tags, error, loadAll };
}
