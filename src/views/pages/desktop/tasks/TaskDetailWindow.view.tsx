import { useCallback, useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useAuth } from "../lib/auth";
import {
  fetchTask,
  fetchProjects,
  fetchAreas,
  fetchTags,
} from "../lib/supabase";
import TaskDetail from "../components/TaskDetail";
import { logger } from "../lib/logger";
import type { Area, Project, Tag, TaskWithTags } from "../types";

export default function TaskDetailWindow() {
  const taskId = getCurrentWebviewWindow().label.slice(5);
  const { user } = useAuth();
  const userId = user?.id ?? null;
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
    if (userId) {
      logger.info("task-window", `init: taskId=${taskId}`);
      loadAll();
    }
  }, [userId, taskId, loadAll]);

  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-secondary)",
          color: "var(--text-secondary)",
          fontSize: 14,
        }}
      >
        Please sign in from the main window.
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-secondary)",
          color: "#dc2626",
          fontSize: 14,
        }}
      >
        {error}
      </div>
    );
  }

  if (!task) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-secondary)",
          color: "var(--text-tertiary)",
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <TaskDetail
      task={task}
      projects={projects}
      areas={areas}
      allTags={tags}
      onUpdated={loadAll}
    />
  );
}
