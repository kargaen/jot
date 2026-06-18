import { useEffect, useState } from "react";
import type { Project } from "../models/shared";
import { fetchProjects } from "../services/backend/supabase.service";
import { logger } from "../utils/observability/logger";

export function useQuickCapture() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetchProjects().then(setProjects).catch((err: unknown) => { logger.warn("quick-capture", "fetchProjects failed", err instanceof Error ? err.message : err); });
  }, []);

  function onProjectCreated(project: Project) {
    setProjects((prev) => [...prev, project]);
  }

  return { projects, onProjectCreated };
}
