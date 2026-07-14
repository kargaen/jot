import { useEffect, useRef, useState } from "react";
import type { ParsedInput, Project, Tag, Task } from "../models/shared";
import { saveCreateTaskDraft } from "../controllers/tasks/saveCreateTask.controller";
import { createProject, createTask } from "../services/backend/supabase.service";
import { loadNlpLanguageMode } from "../services/capture/nlpSettings.service";
import { parseInput } from "../services/capture/nlp.service";
import { splitLongCapture, textToDescriptionDoc } from "../models/tasks/taskPresentation";
import { logger } from "../utils/observability/logger";

export interface UseCreateTaskOptions {
  parentTaskId?: string | null;
  projectId?: string | null;
  areaId?: string | null;
  projects: Project[];
  allTags: Tag[];
  canCreateProjectsAndTags?: boolean;
  onCreated?: (task: Task) => void;
  onSaved?: (keepOpen: boolean) => void;
  onProjectCreated?: (project: Project) => void;
  onSavedWithEdit?: (task: Task) => void;
}

const PRIORITY_CYCLE: Array<Task["priority"]> = [
  "none",
  "low",
  "medium",
  "high",
];

// EPIC-013: null = no effort set, then light → medium → heavy, cycling back to null.
const EFFORT_CYCLE: Array<Task["effort"]> = [null, "light", "medium", "heavy"];

export function useCreateTask({
  parentTaskId,
  projectId,
  areaId,
  projects,
  allTags,
  canCreateProjectsAndTags,
  onCreated,
  onSaved,
  onProjectCreated,
  onSavedWithEdit,
}: UseCreateTaskOptions) {
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState<ParsedInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaProjectName, setMetaProjectName] = useState("");
  const [metaDueDate, setMetaDueDate] = useState<string | null>(null);
  const [metaDueTime, setMetaDueTime] = useState<string | null>(null);
  const [metaDateText, setMetaDateText] = useState("");
  const [metaPriority, setMetaPriority] = useState<Task["priority"]>("none");
  const [metaEffort, setMetaEffort] = useState<Task["effort"]>(null);
  const [metaRecurrenceRule, setMetaRecurrenceRule] = useState<string | null>(
    null,
  );
  const [splitLong, setSplitLong] = useState(false);

  const userEditedRef = useRef<Set<string>>(new Set());
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputEl = useRef<HTMLInputElement>(null);
  const titleFieldRef = useRef<HTMLTextAreaElement>(null);
  const projectFieldRef = useRef<HTMLInputElement>(null);
  const dateFieldRef = useRef<HTMLInputElement>(null);
  const priorityFieldRef = useRef<HTMLInputElement>(null);
  const effortFieldRef = useRef<HTMLInputElement>(null);
  const recurrenceFieldRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const languageMode = loadNlpLanguageMode();

  useEffect(() => {
    const ue = userEditedRef.current;
    if (!parsed) {
      if (!ue.has("title")) setMetaTitle("");
      if (!ue.has("project")) setMetaProjectName("");
      if (!ue.has("date")) {
        setMetaDueDate(null);
        setMetaDueTime(null);
        setMetaDateText("");
      }
      if (!ue.has("priority")) setMetaPriority("none");
      if (!ue.has("effort")) setMetaEffort(null);
      if (!ue.has("recurrence")) setMetaRecurrenceRule(null);
      return;
    }

    if (!ue.has("title")) setMetaTitle(parsed.title);
    if (!ue.has("project")) {
      setMetaProjectName(parsed.project?.name ?? parsed.suggestedProjectName ?? "");
    }
    if (!ue.has("date")) {
      setMetaDueDate(parsed.dueDate);
      setMetaDueTime(parsed.dueTime);
      setMetaDateText(
        parsed.dueDate
          ? formatCreateTaskDate(parsed.dueDate) +
              (parsed.dueTime ? ` ${parsed.dueTime}` : "")
          : "",
      );
    }
    if (!ue.has("priority")) setMetaPriority(parsed.priority);
    if (!ue.has("effort")) setMetaEffort(parsed.effort);
    if (!ue.has("recurrence")) setMetaRecurrenceRule(parsed.recurrenceRule);
  }, [parsed]);

  useEffect(() => {
    return () => {
      if (parseTimer.current) clearTimeout(parseTimer.current);
    };
  }, []);

  function resetAllFields() {
    userEditedRef.current = new Set();
    setMetaTitle("");
    setMetaProjectName("");
    setMetaDueDate(null);
    setMetaDueTime(null);
    setMetaDateText("");
    setMetaPriority("none");
    setMetaRecurrenceRule(null);
  }

  function focus() {
    inputEl.current?.focus();
  }

  function clear() {
    setInput("");
    setParsed(null);
    setError(null);
    setSplitLong(false);
    resetAllFields();
  }

  function isEmpty() {
    return !input.trim();
  }

  function runParse(value: string) {
    if (parseTimer.current) clearTimeout(parseTimer.current);
    if (!value.trim()) {
      setParsed(null);
      return;
    }
    parseTimer.current = setTimeout(() => {
      setParsed(parseInput(value, projects, allTags, { languageMode }));
    }, 150);
  }

  function handleInputChange(value: string) {
    setInput(value);
    setError(null);
    userEditedRef.current = new Set();
    runParse(value);
  }

  function markEdited(field: string) {
    userEditedRef.current = new Set([...userEditedRef.current, field]);
  }

  function cyclePriority() {
    setMetaPriority((prev) => {
      const idx = PRIORITY_CYCLE.indexOf(prev);
      return PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length];
    });
    markEdited("priority");
  }

  function cycleEffort() {
    setMetaEffort((prev) => {
      const idx = EFFORT_CYCLE.indexOf(prev);
      return EFFORT_CYCLE[(idx + 1) % EFFORT_CYCLE.length];
    });
    markEdited("effort");
  }

  function commitDateText() {
    if (!metaDateText) {
      setMetaDueDate(null);
      setMetaDueTime(null);
      return;
    }

    const reParsed = parseInput(metaDateText, [], [], { languageMode });
    if (reParsed.dueDate) {
      setMetaDueDate(reParsed.dueDate);
      setMetaDueTime(reParsed.dueTime);
      setMetaDateText(
        formatCreateTaskDate(reParsed.dueDate) +
          (reParsed.dueTime ? ` ${reParsed.dueTime}` : ""),
      );
    }
  }

  async function handleSave(keepOpen = false, openAfter = false) {
    const titleToSave = metaTitle.trim() || input.trim();
    if (!titleToSave || saving) return;

    const split = splitLong ? splitLongCapture(titleToSave) : null;

    setSaving(true);
    setError(null);

    try {
      logger.info("create-task", `save: "${titleToSave}"`, {
        priority: metaPriority !== "none" ? metaPriority : undefined,
        dueDate: metaDueDate,
        parent: parentTaskId ?? undefined,
      });

      const { task, createdProject } = await saveCreateTaskDraft(
        { createProject, createTask },
        {
          projects,
          title: split ? split.title : titleToSave,
          description: split ? textToDescriptionDoc(split.descriptionText) : null,
          projectName: metaProjectName,
          parentTaskId: parentTaskId ?? null,
          projectId: projectId ?? null,
          areaId: areaId ?? null,
          dueDate: metaDueDate,
          dueTime: metaDueTime,
          priority: metaPriority,
          effort: metaEffort,
          recurrenceRule: metaRecurrenceRule,
          tagIds: [],
          canCreateProjectsAndTags,
        },
      );

      if (createdProject) onProjectCreated?.(createdProject);

      clear();
      logger.info("create-task", `saved: ${task.id}`);
      onCreated?.(task);

      if (openAfter) onSavedWithEdit?.(task);
      else onSaved?.(keepOpen);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      logger.error("create-task", `save failed: ${msg}`);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const longSplit = splitLongCapture(metaTitle.trim() || input.trim());

  return {
    input,
    parsed,
    saving,
    error,
    longSplit,
    splitLong,
    setSplitLong,
    metaTitle,
    metaProjectName,
    metaDateText,
    metaPriority,
    metaEffort,
    metaRecurrenceRule,
    inputEl,
    titleFieldRef,
    projectFieldRef,
    dateFieldRef,
    priorityFieldRef,
    effortFieldRef,
    recurrenceFieldRef,
    editButtonRef,
    setMetaTitle,
    setMetaProjectName,
    setMetaDateText,
    markEdited,
    cyclePriority,
    cycleEffort,
    commitDateText,
    handleInputChange,
    handleSave,
    focus,
    clear,
    isEmpty,
  };
}

export function formatCreateTaskDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  if (iso === today) return "Today";
  if (iso === tomorrowStr) return "Tomorrow";

  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
