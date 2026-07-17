import { useCallback } from "react";
import type { Project, Tag } from "../models/shared";
import { parseInput } from "../services/capture/nlp.service";

export function useMobileCaptureParser(projects: Project[], tags: Tag[]) {
  return useCallback((text: string) => parseInput(text, projects, tags), [projects, tags]);
}
