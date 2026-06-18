import { useEffect, useState } from "react";
import type { Project } from "../models/shared";
import { fetchProjects } from "../services/backend/supabase.service";

export function useQuickCapture() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
  }, []);

  function onProjectCreated(project: Project) {
    setProjects((prev) => [...prev, project]);
  }

  return { projects, onProjectCreated };
}
