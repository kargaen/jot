import { useCallback, useEffect, useRef, useState } from "react";
import { spaceColor, projectColor } from "../lib/colors";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import * as LucideIcons from "lucide-react";
import { ChevronDown } from "lucide-react";
import type { AssignablePerson, TaskWithTags, Project, Tag, Area } from "../types";
import {
  updateTask,
  fetchSubtasks,
  completeTask,
  fetchAssignablePeople,
} from "../lib/supabase";
import { logger } from "../lib/logger";
import { suggestIcon } from "../lib/icons";
import { normalizeTaskLink } from "../models/tasks/taskPresentation";
import TaskRow from "./TaskRow";
import CreateTask from "../views/tasks/CreateTask";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskDetailProps {
  task: TaskWithTags;
  projects: Project[];
  areas: Area[];
  allTags: Tag[];
  onUpdated: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLucideIcon(
  name: string | null,
): React.ComponentType<{ size?: number; color?: string }> | null {
  if (!name) return null;
  const icon = (LucideIcons as Record<string, unknown>)[name];
  return typeof icon === "function"
    ? (icon as React.ComponentType<{ size?: number; color?: string }>)
    : null;
}

const PRIORITY_OPTIONS = [
  { value: "none", label: "None", color: "var(--text-tertiary)" },
  { value: "low", label: "Low", color: "var(--priority-low)" },
  { value: "medium", label: "Medium", color: "var(--priority-medium)" },
  { value: "high", label: "High", color: "var(--priority-high)" },
] as const;

function formatMins(mins: number | null): string {
  if (!mins) return "";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function parseMins(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const hoursMin = s.match(/(\d+)\s*h(?:\s*(\d+)\s*m)?/);
  if (hoursMin) return parseInt(hoursMin[1]) * 60 + parseInt(hoursMin[2] ?? "0");
  const minsOnly = s.match(/^(\d+)\s*m?$/);
  if (minsOnly) return parseInt(minsOnly[1]);
  return null;
}

async function openTaskWindow(task: TaskWithTags) {
  const label = `task-${task.id}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus();
    return;
  }
  new WebviewWindow(label, {
    url: window.location.origin,
    title: task.title,
    width: 700,
    height: 720,
    decorations: true,
    resizable: true,
    center: true,
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "6px 0",
      }}
    >
      <span
        style={{
          width: 110,
          flexShrink: 0,
          fontSize: 12,
          color: "var(--text-tertiary)",
          paddingTop: 6,
          textAlign: "right",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function InlineSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; color?: string }[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-default)",
          background: "var(--bg-secondary)",
          fontSize: 13,
          color: current?.color ?? "var(--text-primary)",
          cursor: "pointer",
        }}
      >
        {current?.label}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            background: "var(--bg-primary)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            minWidth: 120,
            overflow: "hidden",
          }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 13,
                color: o.color ?? "var(--text-primary)",
                background:
                  o.value === value ? "var(--accent-light)" : "transparent",
                cursor: "pointer",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TaskDetail({
  task,
  projects,
  areas,
  allTags,
  onUpdated,
}: TaskDetailProps) {
  const [title, setTitle] = useState(task.title);
  const [icon, setIcon] = useState<string | null>(task.icon);
  const [projectId, setProjectId] = useState<string | null>(task.project_id);
  const [areaId, setAreaId] = useState<string | null>(task.area_id);
  const [priority, setPriority] = useState(task.priority);
  const [responsibleUserId, setResponsibleUserId] = useState(task.responsible_user_id);
  const [responsibleEmail, setResponsibleEmail] = useState(task.responsible_email);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [link, setLink] = useState(task.notes ?? "");
  const [estimatedMins, setEstimatedMins] = useState(
    formatMins(task.estimated_mins),
  );
  const [assignablePeople, setAssignablePeople] = useState<AssignablePerson[]>([]);
  const [subtasks, setSubtasks] = useState<TaskWithTags[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [completing, setCompleting] = useState(false);

  // ── Autosave ──────────────────────────────────────────────────────────────

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);
  const scheduleRef = useRef(() => {});
  const buildTaskFields = useCallback(() => ({
    title,
    icon,
    project_id: projectId,
    area_id: projectId ? null : areaId ?? areas[0]?.id ?? null,
    priority,
    responsible_user_id: responsibleUserId,
    responsible_email: responsibleEmail,
    due_date: dueDate || null,
    notes: normalizeTaskLink(link),
    estimated_mins: parseMins(estimatedMins),
    description: (editorRef.current?.getJSON() ??
      null) as Record<string, unknown> | null,
  }), [title, icon, projectId, areaId, areas, priority, responsibleUserId, responsibleEmail, dueDate, link, estimatedMins]);

  const save = useCallback(async () => {
    logger.debug("task-detail", `autosave: "${title}" [${task.id}]`);
    setSaveStatus("saving");
    try {
      await updateTask(task.id, buildTaskFields());
      onUpdated();
      setSaveStatus("saved");
      logger.info("task-detail", `saved: ${task.id}`);
      setTimeout(
        () => setSaveStatus((s) => (s === "saved" ? "idle" : s)),
        2000,
      );
    } catch (err) {
      logger.error("task-detail", `save failed`, err instanceof Error ? err.message : err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus((s) => (s === "error" ? "idle" : s)), 4000);
    }
  }, [task.id, title, buildTaskFields, onUpdated]);

  useEffect(() => {
    saveRef.current = save;
  });

  function scheduleAutosave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveRef.current(), 800);
  }

  useEffect(() => {
    scheduleRef.current = scheduleAutosave;
  });

  useEffect(() => () => { saveRef.current(); }, []);

  // ── Icon suggestion ───────────────────────────────────────────────────────

  const iconSuggested = useRef(task.icon);
  useEffect(() => {
    if (icon === iconSuggested.current) {
      const suggested = suggestIcon(title);
      setIcon(suggested);
      iconSuggested.current = suggested;
    }
  }, [title]);

  // ── Subtasks ──────────────────────────────────────────────────────────────

  async function refreshSubtasks() {
    const updated = await fetchSubtasks(task.id);
    setSubtasks(updated);
  }

  useEffect(() => {
    refreshSubtasks().catch(() => {});
  }, [task.id]);

  async function handleCompleteSubtask(subtaskId: string) {
    await completeTask(subtaskId);
    setSubtasks((prev) => prev.filter((s) => s.id !== subtaskId));
    onUpdated();
  }

  // ── Tiptap editor ─────────────────────────────────────────────────────────

  async function handleCompleteTask() {
    logger.info("task-detail", `complete: ${task.id}`);
    setCompleting(true);
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await updateTask(task.id, buildTaskFields());
      await completeTask(task.id);
      onUpdated();
      await getCurrentWebviewWindow().close();
    } catch (err) {
      logger.error("task-detail", `complete failed`, err instanceof Error ? err.message : err);
      setSaveStatus("error");
      setCompleting(false);
      setTimeout(() => setSaveStatus((s) => (s === "error" ? "idle" : s)), 4000);
    }
  }

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

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // ── Derived display ───────────────────────────────────────────────────────

  const IconComponent = getLucideIcon(icon);
  const project = projects.find((p) => p.id === projectId);
  // Effective area: from project if task has one, otherwise direct area_id
  const effectiveAreaId = project?.area_id ?? (projectId ? null : areaId);
  const area = areas.find((a) => a.id === effectiveAreaId) ?? null;
  const canAssignResponsibility = assignablePeople.length > 1 || !!responsibleUserId || !!responsibleEmail;
  const projectOptions = [
    { value: "", label: "No project", color: "var(--text-tertiary)" },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ];
  const areaOptions = [
    ...areas.map((a) => ({ value: a.id, label: a.name })),
  ];
  const responsibilityOptions = [
    { value: "", label: "Unassigned", color: "var(--text-tertiary)" },
    ...assignablePeople.map((person) => ({ value: person.user_id, label: person.email })),
  ];

  const isTopLevel = !task.parent_task_id;
  const hasChildren = subtasks.length > 0;
  const typeLabel = !isTopLevel
    ? "Subtask"
    : hasChildren
      ? "Planned"
      : "Horizon";
  const typeColor = !isTopLevel
    ? "var(--text-tertiary)"
    : hasChildren
      ? "var(--accent)"
      : "var(--priority-medium)";

  useEffect(() => {
    let cancelled = false;
    fetchAssignablePeople({ projectId, areaId: effectiveAreaId })
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
    return () => { cancelled = true; };
  }, [projectId, effectiveAreaId, responsibleUserId, responsibleEmail]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg-primary)",
        overflow: "hidden",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 24px",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: typeColor,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {typeLabel}
        </span>
        <span
          style={{
            fontSize: 11,
            color: saveStatus === "error" ? "var(--priority-high)" : "var(--text-tertiary)",
            transition: "opacity 200ms",
            opacity: saveStatus === "idle" ? 0 : 1,
          }}
        >
          {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : "Saved"}
        </span>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <button
            onClick={() => { void handleCompleteTask(); }}
            disabled={completing}
            style={{
              padding: "7px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(15,139,104,0.2)",
              background: "rgba(15,139,104,0.1)",
              color: "#0f8b68",
              fontSize: 13,
              fontWeight: 600,
              cursor: completing ? "wait" : "pointer",
              opacity: completing ? 0.7 : 1,
            }}
          >
            {completing ? "Completing..." : "Mark Complete"}
          </button>
        </div>

        {/* Title + icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "var(--text-secondary)",
            }}
          >
            {IconComponent ? (
              <IconComponent size={18} />
            ) : (
              <span style={{ fontSize: 16, color: "var(--text-tertiary)" }}>
                ○
              </span>
            )}
          </div>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              scheduleAutosave();
            }}
            style={{
              flex: 1,
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 24 }}>
          <FieldRow label="Area">
            {project ? (
              // Task has a project — area is inherited, show read-only with dot
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", fontSize: 13, color: "var(--text-secondary)" }}>
                {area && <span style={{ width: 8, height: 8, borderRadius: 3, background: spaceColor(area.id), flexShrink: 0 }} />}
                <span>{area?.name ?? "—"}</span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>(from project)</span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {area && <span style={{ width: 8, height: 8, borderRadius: 3, background: spaceColor(area.id), flexShrink: 0 }} />}
                <InlineSelect
                  value={areaId ?? ""}
                  options={areaOptions}
                  onChange={(v) => { setAreaId(v || null); scheduleAutosave(); }}
                />
              </div>
            )}
          </FieldRow>

          <FieldRow label="Project">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {project && (
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: projectColor(project.id), display: "inline-block" }} />
              )}
              <InlineSelect
                value={projectId ?? ""}
                options={projectOptions}
                onChange={(v) => { setProjectId(v || null); scheduleAutosave(); }}
              />
            </div>
          </FieldRow>

          <FieldRow label="Priority">
            <InlineSelect
              value={priority}
              options={
                PRIORITY_OPTIONS as unknown as {
                  value: typeof priority;
                  label: string;
                  color: string;
                }[]
              }
              onChange={(v) => {
                setPriority(v);
                scheduleAutosave();
              }}
            />
          </FieldRow>

          {canAssignResponsibility && (
            <FieldRow label="Responsible">
              <InlineSelect
                value={responsibleUserId ?? ""}
                options={responsibilityOptions}
                onChange={(v) => {
                  const selected = assignablePeople.find((person) => person.user_id === v);
                  setResponsibleUserId(selected?.user_id ?? null);
                  setResponsibleEmail(selected?.email ?? null);
                  scheduleAutosave();
                }}
              />
            </FieldRow>
          )}

          <FieldRow label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                scheduleAutosave();
              }}
              style={{
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-default)",
                background: "var(--bg-secondary)",
                fontSize: 13,
                color: "var(--text-primary)",
                fontFamily: "inherit",
              }}
            />
          </FieldRow>

          <FieldRow label="Estimate">
            <input
              value={estimatedMins}
              onChange={(e) => {
                setEstimatedMins(e.target.value);
                scheduleAutosave();
              }}
              placeholder="e.g. 30m or 2h"
              style={{
                width: 100,
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-default)",
                background: "var(--bg-secondary)",
                fontSize: 13,
                color: "var(--text-primary)",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </FieldRow>

          <FieldRow label="Link">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  scheduleAutosave();
                }}
                placeholder="paste a URL"
                style={{
                  flex: 1,
                  padding: "4px 8px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-secondary)",
                  fontSize: 13,
                  color: "var(--text-primary)",
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
              {normalizeTaskLink(link) && (
                <button
                  onClick={() => {
                    const url = normalizeTaskLink(link);
                    if (url) void shellOpen(url);
                  }}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-secondary)",
                    fontSize: 12,
                    color: "var(--accent)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Open
                </button>
              )}
            </div>
          </FieldRow>
        </div>

        {/* Description (Tiptap) */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-secondary)",
              minHeight: 140,
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Subtasks */}
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 8,
            }}
          >
            Subtasks {subtasks.length > 0 && `· ${subtasks.length}`}
          </div>

          {/* Subtask list — same TaskRow used in Dashboard */}
          {subtasks.length > 0 && (
            <div
              style={{
                marginBottom: 8,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
                overflow: "hidden",
              }}
            >
              {subtasks.map((s) => (
                <TaskRow
                  key={s.id}
                  task={s}
                  projects={projects}
                  onComplete={() => handleCompleteSubtask(s.id)}
                  onClick={() => openTaskWindow(s)}
                />
              ))}
            </div>
          )}

          {/* Add subtask — shared CreateTask in compact mode */}
          <CreateTask
            compact
            parentTaskId={task.id}
            projectId={projectId}
            projects={projects}
            allTags={allTags}
            placeholder="Add subtask… (natural language)"
            onCreated={() => {
              refreshSubtasks();
              onUpdated();
            }}
          />
        </div>
      </div>
    </div>
  );
}
