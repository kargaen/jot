import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
} from "react";
import { createTask, createProject } from "../lib/supabase";
import { parseInput } from "../lib/nlp";
import { suggestIcon } from "../lib/icons";
import { logger } from "../lib/logger";
import type { Task, Project, Tag } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
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

const PRIORITY_LABELS: Record<string, string> = {
  high: "!! High",
  medium: "! Medium",
  low: "~ Low",
  none: "",
};
const PRIORITY_COLORS: Record<string, string> = {
  high: "#dc2626",
  medium: "#d97706",
  low: "#6b7280",
  none: "",
};
const PRIORITY_CYCLE: Array<Task["priority"]> = [
  "none",
  "low",
  "medium",
  "high",
];

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: 20,
        fontSize: 12,
        color,
        background: `${color}18`,
        border: `1px solid ${color}30`,
        fontWeight: 500,
        maxWidth: 220,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ─── MetaField ────────────────────────────────────────────────────────────────
// A fixed slot in the metadata row. Always rendered; filled or empty.
// Uses a readOnly input for cycling fields (priority) and a normal input elsewhere.

function MetaField({
  prefix,
  value,
  placeholder,
  color,
  inputRef,
  readOnly,
  onFocus,
  onKeyDown,
  onChange,
  onClick,
}: {
  prefix: string;
  value: string;
  placeholder: string;
  color: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  readOnly?: boolean;
  onFocus?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onChange?: (v: string) => void;
  onClick?: () => void;
}) {
  const filled = value.length > 0;
  return (
    <div
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 20,
        fontSize: 12,
        color: filled ? color : "var(--text-quaternary, #9ca3af)",
        background: filled ? `${color}15` : "var(--bg-secondary)",
        border: `1px solid ${filled ? `${color}35` : "var(--border-subtle)"}`,
        transition: "color 120ms, background 120ms, border-color 120ms",
        cursor: readOnly ? "pointer" : "text",
      }}
    >
      <span style={{ flexShrink: 0, userSelect: "none" }}>{prefix}</span>
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          fontSize: 12,
          color: "inherit",
          fontFamily: "inherit",
          cursor: readOnly ? "pointer" : "text",
          width:
            Math.max(
              (value || placeholder).length,
              placeholder.length,
            ) *
              7 +
            4,
          minWidth: 30,
          maxWidth: 160,
        }}
      />
    </div>
  );
}

// ─── Public ref API ───────────────────────────────────────────────────────────

export interface CreateTaskRef {
  focus(): void;
  clear(): void;
  isEmpty(): boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CreateTaskProps {
  /** If set, the created task will be a subtask of this task */
  parentTaskId?: string | null;
  /** Pre-selected project (overrides NLP-matched project) */
  projectId?: string | null;
  /** Default area for new tasks (used when no project is selected) */
  areaId?: string | null;
  placeholder?: string;
  projects: Project[];
  allTags: Tag[];
  /** Compact inline style (for subtask input) vs full dashed-border card */
  compact?: boolean;
  autoFocus?: boolean;
  /** Allow NLP-suggested projects to be created on the fly */
  canCreateProjectsAndTags?: boolean;
  /** Called when a task is successfully created */
  onCreated?: (task: Task) => void;
  /**
   * Called after a successful save.
   * keepOpen=true when the user pressed Shift+Enter.
   */
  onSaved?: (keepOpen: boolean) => void;
  /**
   * Called before CreateTask handles a keydown event.
   * Return true to signal the event was handled (CreateTask will skip its own handling).
   * Receives whether the input is currently empty.
   */
  onKeyDownFirst?: (
    e: React.KeyboardEvent<HTMLInputElement>,
    inputEmpty: boolean,
  ) => boolean;
  /** Called when new projects are created (so parent can update its list) */
  onProjectCreated?: (p: Project) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const CreateTask = forwardRef<CreateTaskRef, CreateTaskProps>(
  function CreateTask(
    {
      parentTaskId,
      projectId,
      areaId,
      placeholder = "New task…",
      projects,
      allTags,
      compact,
      autoFocus,
      canCreateProjectsAndTags,
      onCreated,
      onSaved,
      onKeyDownFirst,
      onProjectCreated,
    },
    ref,
  ) {
    const [input, setInput] = useState("");
    const [parsed, setParsed] = useState<ReturnType<typeof parseInput> | null>(
      null,
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Metadata field values — driven by NLP but user-editable
    const [metaProject, setMetaProject] = useState("");
    const [metaDate, setMetaDate] = useState("");
    const [metaPriority, setMetaPriority] = useState<Task["priority"]>("none");
    const [metaRecurrence, setMetaRecurrence] = useState("");

    // Track which fields the user has manually edited so NLP won't overwrite them
    const [userEdited, setUserEdited] = useState<Set<string>>(new Set());

    const inputEl = useRef<HTMLInputElement>(null);
    const projectFieldRef = useRef<HTMLInputElement>(null);
    const dateFieldRef = useRef<HTMLInputElement>(null);
    const priorityFieldRef = useRef<HTMLInputElement>(null);
    const recurrenceFieldRef = useRef<HTMLInputElement>(null);
    const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputEl.current?.focus(),
      clear: () => {
        setInput("");
        setParsed(null);
        setError(null);
        setMetaProject("");
        setMetaDate("");
        setMetaPriority("none");
        setMetaRecurrence("");
        setUserEdited(new Set());
      },
      isEmpty: () => !input.trim(),
    }));

    // When NLP fires, update meta fields that the user hasn't manually touched
    useEffect(() => {
      if (!parsed) {
        if (!userEdited.has("project")) setMetaProject("");
        if (!userEdited.has("date")) setMetaDate("");
        if (!userEdited.has("priority")) setMetaPriority("none");
        if (!userEdited.has("recurrence")) setMetaRecurrence("");
        return;
      }
      if (!userEdited.has("project")) {
        setMetaProject(
          parsed.project?.name ?? parsed.suggestedProjectName ?? "",
        );
      }
      if (!userEdited.has("date")) {
        setMetaDate(
          parsed.dueDate
            ? `${formatDate(parsed.dueDate)}${parsed.dueTime ? " " + parsed.dueTime : ""}`
            : "",
        );
      }
      if (!userEdited.has("priority")) {
        setMetaPriority(parsed.priority);
      }
      if (!userEdited.has("recurrence")) {
        setMetaRecurrence(
          parsed.recurrenceRule
            ? parsed.recurrenceRule
                .split(";")[0]
                .replace("FREQ=", "")
                .toLowerCase()
            : "",
        );
      }
    }, [parsed]); // eslint-disable-line react-hooks/exhaustive-deps

    function runParse(value: string) {
      if (parseTimer.current) clearTimeout(parseTimer.current);
      if (!value.trim()) {
        setParsed(null);
        return;
      }
      parseTimer.current = setTimeout(() => {
        setParsed(parseInput(value, projects, allTags));
      }, 150);
    }

    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
      const value = e.target.value;
      setInput(value);
      setError(null);
      setUserEdited(new Set());
      if (!value) {
        setParsed(null);
        return;
      }
      runParse(value);
    }

    function markEdited(field: string) {
      setUserEdited((prev) => new Set([...prev, field]));
    }

    function cyclePriority() {
      setMetaPriority((prev) => {
        const idx = PRIORITY_CYCLE.indexOf(prev);
        return PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length];
      });
      markEdited("priority");
    }

    // Resolve meta fields back into Task fields at save time
    function resolveForSave() {
      const freshParse = parseInput(input, projects, allTags);

      // Project
      let resolvedProject = freshParse.project;
      let resolvedSuggestedProject = freshParse.suggestedProjectName;
      if (userEdited.has("project")) {
        const match = projects.find(
          (p) => p.name.toLowerCase() === metaProject.toLowerCase(),
        );
        resolvedProject = match ?? null;
        resolvedSuggestedProject = !match && metaProject ? metaProject : null;
      }

      // Date — if user edited, re-parse from the meta field text
      let resolvedDate = freshParse.dueDate;
      let resolvedTime = freshParse.dueTime;
      if (userEdited.has("date") && metaDate) {
        const reParsed = parseInput(metaDate, [], []);
        resolvedDate = reParsed.dueDate;
        resolvedTime = reParsed.dueTime;
      } else if (userEdited.has("date") && !metaDate) {
        resolvedDate = null;
        resolvedTime = null;
      }

      return {
        title: freshParse.title || input.trim(),
        project: resolvedProject,
        suggestedProjectName: resolvedSuggestedProject,
        dueDate: resolvedDate,
        dueTime: resolvedTime,
        priority: userEdited.has("priority") ? metaPriority : freshParse.priority,
        recurrenceRule:
          userEdited.has("recurrence") && !metaRecurrence
            ? null
            : freshParse.recurrenceRule,
      };
    }

    async function handleSave(keepOpen = false) {
      if (!input.trim() || saving) return;
      setSaving(true);
      setError(null);
      try {
        const result = resolveForSave();

        logger.info("create-task", `save: "${result.title}"`, {
          project: result.project?.name ?? result.suggestedProjectName,
          priority: result.priority !== "none" ? result.priority : undefined,
          dueDate: result.dueDate,
          parent: parentTaskId ?? undefined,
        });

        let resolvedProjectId = projectId ?? result.project?.id ?? null;

        if (
          canCreateProjectsAndTags &&
          !resolvedProjectId &&
          result.suggestedProjectName
        ) {
          const newProject = await createProject(result.suggestedProjectName);
          resolvedProjectId = newProject.id;
          onProjectCreated?.(newProject);
        }

        const task = await createTask({
          title: result.title,
          parentTaskId: parentTaskId ?? null,
          projectId: resolvedProjectId,
          areaId: areaId ?? null,
          icon: suggestIcon(result.title),
          dueDate: result.dueDate,
          dueTime: result.dueTime,
          priority: result.priority,
          recurrenceRule: result.recurrenceRule,
          tagIds: [],
        });

        setInput("");
        setParsed(null);
        setMetaProject("");
        setMetaDate("");
        setMetaPriority("none");
        setMetaRecurrence("");
        setUserEdited(new Set());
        logger.info("create-task", `saved: ${task.id}`);
        onCreated?.(task);
        onSaved?.(keepOpen);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to save";
        logger.error("create-task", `save failed: ${msg}`);
        setError(msg);
      } finally {
        setSaving(false);
      }
    }

    // Shared key handler for meta fields
    function metaFieldKeyDown(
      e: React.KeyboardEvent<HTMLInputElement>,
      nextRef: React.RefObject<HTMLInputElement | null> | null,
    ) {
      if (e.key === "Escape") {
        e.preventDefault();
        inputEl.current?.focus();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (input.trim()) handleSave(false);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        if (nextRef?.current) {
          nextRef.current.focus();
        } else {
          inputEl.current?.focus();
        }
      }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      // Tab from main input → first meta field (full mode only)
      if (!compact && e.key === "Tab") {
        e.preventDefault();
        projectFieldRef.current?.focus();
        return;
      }

      if (onKeyDownFirst?.(e, !input.trim())) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (input.trim()) handleSave(false);
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        if (input.trim()) handleSave(true);
      }
    }

    const hasPreview =
      parsed &&
      (parsed.dueDate ||
        parsed.project ||
        parsed.priority !== "none" ||
        parsed.recurrenceRule ||
        parsed.suggestedProjectName);

    // ── Compact (subtask) style ──────────────────────────────────────────────
    if (compact) {
      return (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                flexShrink: 0,
                border: "1.5px dashed var(--border-strong)",
              }}
            />
            <input
              ref={inputEl}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={saving}
              autoFocus={autoFocus}
              style={{
                flex: 1,
                fontSize: 13,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text-primary)",
                fontFamily: "inherit",
              }}
            />
          </div>
          {hasPreview && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                marginTop: 6,
                paddingLeft: 24,
              }}
            >
              {parsed?.project && (
                <Chip color="#5b5bd6" label={`# ${parsed.project.name}`} />
              )}
              {parsed?.dueDate && (
                <Chip
                  color="#0891b2"
                  label={`📅 ${formatDate(parsed.dueDate)}`}
                />
              )}
              {parsed?.priority && parsed.priority !== "none" && (
                <Chip
                  color={PRIORITY_COLORS[parsed.priority]}
                  label={PRIORITY_LABELS[parsed.priority]}
                />
              )}
            </div>
          )}
          {error && (
            <div
              style={{
                marginTop: 4,
                paddingLeft: 24,
                fontSize: 12,
                color: "#dc2626",
              }}
            >
              {error}
            </div>
          )}
        </div>
      );
    }

    // ── Full (dashboard / quickcapture-style) ────────────────────────────────
    return (
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            border: "1px dashed var(--border-default)",
            background: input ? "var(--bg-primary)" : "transparent",
            transition: "background var(--transition)",
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              flexShrink: 0,
              border: `2px solid ${parsed?.project ? "#5b5bd6" : "var(--border-strong)"}`,
              transition: "border-color 200ms",
              display: "block",
            }}
          />
          <input
            ref={inputEl}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={saving}
            autoFocus={autoFocus}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "var(--text-primary)",
              fontFamily: "inherit",
            }}
          />
          {saving && (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              Saving…
            </span>
          )}
          {!saving && input && (
            <kbd
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-default)",
                borderRadius: 4,
                padding: "2px 6px",
                fontFamily: "inherit",
              }}
            >
              ↵
            </kbd>
          )}
        </div>

        {/* Fixed metadata row — always visible when there is input */}
        {input.trim() && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              padding: "8px 14px 0",
            }}
          >
            <MetaField
              prefix="#"
              value={metaProject}
              placeholder="Project"
              color="#5b5bd6"
              inputRef={projectFieldRef}
              onChange={(v) => {
                setMetaProject(v);
                markEdited("project");
              }}
              onKeyDown={(e) => metaFieldKeyDown(e, dateFieldRef)}
            />
            <MetaField
              prefix="📅"
              value={metaDate}
              placeholder="Date"
              color="#0891b2"
              inputRef={dateFieldRef}
              onChange={(v) => {
                setMetaDate(v);
                markEdited("date");
              }}
              onKeyDown={(e) => metaFieldKeyDown(e, priorityFieldRef)}
            />
            <MetaField
              prefix={metaPriority !== "none" ? "" : "!"}
              value={
                metaPriority !== "none" ? PRIORITY_LABELS[metaPriority] : ""
              }
              placeholder="Priority"
              color={
                metaPriority !== "none"
                  ? PRIORITY_COLORS[metaPriority]
                  : "#9ca3af"
              }
              inputRef={priorityFieldRef}
              readOnly
              onClick={cyclePriority}
              onKeyDown={(e) => {
                if (e.key === " ") {
                  e.preventDefault();
                  cyclePriority();
                  return;
                }
                metaFieldKeyDown(e, recurrenceFieldRef);
              }}
            />
            <MetaField
              prefix="↻"
              value={metaRecurrence}
              placeholder="Repeat"
              color="#059669"
              inputRef={recurrenceFieldRef}
              onChange={(v) => {
                setMetaRecurrence(v);
                markEdited("recurrence");
              }}
              onKeyDown={(e) => metaFieldKeyDown(e, null)}
            />
          </div>
        )}

        {error && (
          <div
            style={{ padding: "6px 14px 0", fontSize: 12, color: "#dc2626" }}
          >
            {error}
          </div>
        )}
      </div>
    );
  },
);

export default CreateTask;
