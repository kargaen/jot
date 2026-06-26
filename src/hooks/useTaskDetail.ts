import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { logger } from "../utils/observability/logger";
import type {
  Area,
  AssignablePerson,
  Project,
  Tag,
  TaskWithTags,
} from "../models/shared";
import {
  attachTaskTag,
  completeTaskDetail,
  completeTaskDetailSubtask,
  createAndAttachTaskTag,
  detachTaskTag,
  formatTaskEstimate,
  loadAssignablePeople,
  loadTaskDetailSubtasks,
  saveTaskDetail,
} from "../controllers/tasks/taskDetail.controller";
import { normalizeTaskLink } from "../models/tasks/taskPresentation";

export interface UseTaskDetailOptions {
  task: TaskWithTags;
  projects: Project[];
  areas: Area[];
  onUpdated: () => void;
  // Runs after a successful complete. Desktop opens the detail in its own
  // webview window, so the default closes it. Mobile is single-window and
  // passes a navigation callback instead.
  onCompleted?: () => void | Promise<void>;
}

export function useTaskDetail({
  task,
  projects,
  areas,
  onUpdated,
  onCompleted,
}: UseTaskDetailOptions) {
  const [title, setTitle] = useState(task.title);
  const [icon] = useState<string | null>(task.icon);
  const [projectId, setProjectId] = useState<string | null>(task.project_id);
  const [areaId, setAreaId] = useState<string | null>(task.area_id);
  const [priority, setPriority] = useState(task.priority);
  const [responsibleUserId, setResponsibleUserId] = useState(task.responsible_user_id);
  const [responsibleEmail, setResponsibleEmail] = useState(task.responsible_email);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [link, setLink] = useState(task.notes ?? "");
  const [estimatedMins, setEstimatedMins] = useState(
    formatTaskEstimate(task.estimated_mins),
  );
  const [assignablePeople, setAssignablePeople] = useState<AssignablePerson[]>([]);
  const [subtasks, setSubtasks] = useState<TaskWithTags[]>([]);
  const [tags, setTags] = useState<Tag[]>(task.tags ?? []);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [completing, setCompleting] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const scheduleRef = useRef(() => {});
  const resetSavedStateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const project = projects.find((item) => item.id === projectId);
  const effectiveAreaId = project?.area_id ?? (projectId ? null : areaId);
  const area = areas.find((item) => item.id === effectiveAreaId) ?? null;
  const canAssignResponsibility =
    assignablePeople.length > 1 || !!responsibleUserId || !!responsibleEmail;
  const isTopLevel = !task.parent_task_id;
  const hasChildren = subtasks.length > 0;
  const typeLabel = !isTopLevel ? "Subtask" : hasChildren ? "Planned" : "Horizon";
  const typeColor = !isTopLevel
    ? "var(--text-tertiary)"
      : hasChildren
      ? "var(--accent)"
      : "var(--priority-medium)";
  const normalizedLink = normalizeTaskLink(link);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Placeholder.configure({ placeholder: "Add notes, links, details…" }),
    ],
    content: task.description ?? "",
    onUpdate: () => scheduleRef.current(),
    editorProps: {
      attributes: {
        style:
          "outline:none; min-height:120px; font-size:14px; line-height:1.6; color:var(--text-primary);",
      },
    },
  });

  const buildDraft = useCallback(
    () => ({
      title,
      icon,
      projectId,
      areaId,
      priority,
      responsibleUserId,
      responsibleEmail,
      dueDate,
      link,
      estimatedMins,
    }),
    [
      title,
      icon,
      projectId,
      areaId,
      priority,
      responsibleUserId,
      responsibleEmail,
      dueDate,
      link,
      estimatedMins,
    ],
  );

  const save = useCallback(async () => {
    logger.debug("task-detail", `autosave: "${title}" [${task.id}]`);
    setSaveStatus("saving");
    try {
      await saveTaskDetail({
        taskId: task.id,
        draft: buildDraft(),
        description: (editor?.getJSON() ?? null) as Record<string, unknown> | null,
        fallbackAreaId: areas[0]?.id ?? null,
      });
      onUpdated();
      setSaveStatus("saved");
      logger.info("task-detail", `saved: ${task.id}`);
      if (resetSavedStateTimer.current) clearTimeout(resetSavedStateTimer.current);
      resetSavedStateTimer.current = setTimeout(() => {
        setSaveStatus((state) => (state === "saved" ? "idle" : state));
      }, 2000);
    } catch (err) {
      logger.error(
        "task-detail",
        "save failed",
        err instanceof Error ? err.message : err,
      );
      setSaveStatus("error");
      if (resetSavedStateTimer.current) clearTimeout(resetSavedStateTimer.current);
      resetSavedStateTimer.current = setTimeout(() => {
        setSaveStatus((state) => (state === "error" ? "idle" : state));
      }, 4000);
    }
  }, [task.id, title, buildDraft, editor, areas, onUpdated]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const scheduleAutosave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveRef.current(), 800);
  }, []);

  useEffect(() => {
    scheduleRef.current = scheduleAutosave;
  }, [scheduleAutosave]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (resetSavedStateTimer.current) clearTimeout(resetSavedStateTimer.current);
      saveRef.current();
    };
  }, []);

  const refreshSubtasks = useCallback(async () => {
    const updated = await loadTaskDetailSubtasks(task.id);
    setSubtasks(updated);
  }, [task.id]);

  useEffect(() => {
    refreshSubtasks().catch((err: unknown) => { logger.warn("task-detail", "refreshSubtasks failed", err instanceof Error ? err.message : err); });
  }, [refreshSubtasks]);

  const handleCompleteSubtask = useCallback(
    async (subtaskId: string) => {
      await completeTaskDetailSubtask(subtaskId);
      setSubtasks((previous) => previous.filter((item) => item.id !== subtaskId));
      onUpdated();
    },
    [onUpdated],
  );

  useEffect(() => {
    let cancelled = false;
    loadAssignablePeople({ projectId, areaId: effectiveAreaId })
      .then((people) => {
        if (cancelled) return;
        setAssignablePeople(people);
        if (people.length <= 1 && (responsibleUserId || responsibleEmail)) {
          setResponsibleUserId(null);
          setResponsibleEmail(null);
          scheduleRef.current();
          return;
        }
        if (responsibleUserId && !people.some((person) => person.user_id === responsibleUserId)) {
          setResponsibleUserId(null);
          setResponsibleEmail(null);
          scheduleRef.current();
        }
      })
      .catch(() => {
        if (!cancelled) setAssignablePeople([]);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, effectiveAreaId, responsibleUserId, responsibleEmail]);

  const handleCompleteTask = useCallback(async () => {
    logger.info("task-detail", `complete: ${task.id}`);
    setCompleting(true);
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await completeTaskDetail({
        taskId: task.id,
        draft: buildDraft(),
        description: (editor?.getJSON() ?? null) as Record<string, unknown> | null,
        fallbackAreaId: areas[0]?.id ?? null,
      });
      onUpdated();
      if (onCompleted) {
        await onCompleted();
      } else {
        await getCurrentWebviewWindow().close();
      }
    } catch (err) {
      logger.error(
        "task-detail",
        "complete failed",
        err instanceof Error ? err.message : err,
      );
      setSaveStatus("error");
      setCompleting(false);
      if (resetSavedStateTimer.current) clearTimeout(resetSavedStateTimer.current);
      resetSavedStateTimer.current = setTimeout(() => {
        setSaveStatus((state) => (state === "error" ? "idle" : state));
      }, 4000);
    }
  }, [task.id, buildDraft, editor, areas, onUpdated, onCompleted]);

  const openTaskLink = useCallback(() => {
    const url = normalizeTaskLink(link);
    if (url) void shellOpen(url);
  }, [link]);

  const addTag = useCallback(
    async (tag: Tag) => {
      if (tags.some((item) => item.id === tag.id)) return;
      setTags((previous) => [...previous, tag]);
      try {
        await attachTaskTag(task.id, tag.id);
        onUpdated();
      } catch (err) {
        logger.error("task-detail", "addTag failed", err instanceof Error ? err.message : err);
        setTags((previous) => previous.filter((item) => item.id !== tag.id));
      }
    },
    [tags, task.id, onUpdated],
  );

  const removeTag = useCallback(
    async (tagId: string) => {
      const snapshot = tags;
      setTags((previous) => previous.filter((item) => item.id !== tagId));
      try {
        await detachTaskTag(task.id, tagId);
        onUpdated();
      } catch (err) {
        logger.error("task-detail", "removeTag failed", err instanceof Error ? err.message : err);
        setTags(snapshot);
      }
    },
    [tags, task.id, onUpdated],
  );

  const createTagAndAdd = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        const tag = await createAndAttachTaskTag(task.id, trimmed);
        setTags((previous) => (previous.some((item) => item.id === tag.id) ? previous : [...previous, tag]));
        onUpdated();
      } catch (err) {
        logger.error("task-detail", "createTag failed", err instanceof Error ? err.message : err);
      }
    },
    [task.id, onUpdated],
  );

  const updateTitle = useCallback(
    (value: string) => {
      setTitle(value);
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  const updateProjectId = useCallback(
    (value: string | null) => {
      setProjectId(value);
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  const updateAreaId = useCallback(
    (value: string | null) => {
      setAreaId(value);
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  const updatePriority = useCallback(
    (value: TaskWithTags["priority"]) => {
      setPriority(value);
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  const updateResponsible = useCallback(
    (userId: string) => {
      const selected = assignablePeople.find((person) => person.user_id === userId);
      setResponsibleUserId(selected?.user_id ?? null);
      setResponsibleEmail(selected?.email ?? null);
      scheduleAutosave();
    },
    [assignablePeople, scheduleAutosave],
  );

  const updateDueDate = useCallback(
    (value: string) => {
      setDueDate(value);
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  const updateEstimatedMins = useCallback(
    (value: string) => {
      setEstimatedMins(value);
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  const updateLink = useCallback(
    (value: string) => {
      setLink(value);
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  return {
    title,
    icon,
    projectId,
    areaId,
    priority,
    responsibleUserId,
    dueDate,
    link,
    estimatedMins,
    assignablePeople,
    subtasks,
    tags,
    saveStatus,
    completing,
    editor,
    project,
    area,
    effectiveAreaId,
    canAssignResponsibility,
    typeLabel,
    typeColor,
    updateTitle,
    updateProjectId,
    updateAreaId,
    updatePriority,
    updateResponsible,
    updateDueDate,
    updateEstimatedMins,
    updateLink,
    handleCompleteTask,
    handleCompleteSubtask,
    refreshSubtasks,
    openTaskLink,
    normalizedLink,
    addTag,
    removeTag,
    createTagAndAdd,
  };
}

export function getTaskDetailIconComponent(
  name: string | null,
  icons: Record<string, unknown>,
): React.ComponentType<{ size?: number; color?: string }> | null {
  if (!name) return null;
  const icon = icons[name];
  return typeof icon === "function"
    ? (icon as React.ComponentType<{ size?: number; color?: string }>)
    : null;
}
