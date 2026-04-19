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
import { SquarePen } from "lucide-react";
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
            Math.max((value || placeholder).length, placeholder.length) * 7 +
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
  parentTaskId?: string | null;
  projectId?: string | null;
  areaId?: string | null;
  placeholder?: string;
  projects: Project[];
  allTags: Tag[];
  compact?: boolean;
  autoFocus?: boolean;
  canCreateProjectsAndTags?: boolean;
  onCreated?: (task: Task) => void;
  onSaved?: (keepOpen: boolean) => void;
  onKeyDownFirst?: (
    e: React.KeyboardEvent<HTMLInputElement>,
    inputEmpty: boolean,
  ) => boolean;
  onProjectCreated?: (p: Project) => void;
  /** Called instead of onSaved when the user clicks "save and edit" */
  onSavedWithEdit?: (task: Task) => void;
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
      onSavedWithEdit,
    },
    ref,
  ) {
    const [input, setInput] = useState("");
    const [parsed, setParsed] = useState<ReturnType<typeof parseInput> | null>(
      null,
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Field state — NLP fills these; submit reads directly from them ────────
    const [metaTitle, setMetaTitle] = useState("");
    const [metaProjectName, setMetaProjectName] = useState("");
    const [metaDueDate, setMetaDueDate] = useState<string | null>(null);
    const [metaDueTime, setMetaDueTime] = useState<string | null>(null);
    const [metaDateText, setMetaDateText] = useState("");
    const [metaPriority, setMetaPriority] = useState<Task["priority"]>("none");
    const [metaRecurrenceRule, setMetaRecurrenceRule] = useState<string | null>(
      null,
    );

    // Use a ref for userEdited so the parseTimer closure always reads the live value
    const userEditedRef = useRef<Set<string>>(new Set());
    const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const inputEl = useRef<HTMLInputElement>(null);
    const titleFieldRef = useRef<HTMLInputElement>(null);
    const projectFieldRef = useRef<HTMLInputElement>(null);
    const dateFieldRef = useRef<HTMLInputElement>(null);
    const priorityFieldRef = useRef<HTMLInputElement>(null);
    const recurrenceFieldRef = useRef<HTMLInputElement>(null);

    // When NLP result changes, propagate to fields (skip user-edited ones)
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
        if (!ue.has("recurrence")) setMetaRecurrenceRule(null);
        return;
      }
      if (!ue.has("title")) setMetaTitle(parsed.title);
      if (!ue.has("project"))
        setMetaProjectName(
          parsed.project?.name ?? parsed.suggestedProjectName ?? "",
        );
      if (!ue.has("date")) {
        setMetaDueDate(parsed.dueDate);
        setMetaDueTime(parsed.dueTime);
        setMetaDateText(
          parsed.dueDate
            ? formatDate(parsed.dueDate) +
                (parsed.dueTime ? " " + parsed.dueTime : "")
            : "",
        );
      }
      if (!ue.has("priority")) setMetaPriority(parsed.priority);
      if (!ue.has("recurrence")) setMetaRecurrenceRule(parsed.recurrenceRule);
    }, [parsed]);

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

    useImperativeHandle(ref, () => ({
      focus: () => inputEl.current?.focus(),
      clear: () => {
        setInput("");
        setParsed(null);
        setError(null);
        resetAllFields();
      },
      isEmpty: () => !input.trim(),
    }));

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
      // Reset manual edits so NLP takes over again when user modifies raw input
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

    // Commit the date text field → parse to ISO on Tab/Enter/Escape
    function commitDateText() {
      if (!metaDateText) {
        setMetaDueDate(null);
        setMetaDueTime(null);
        return;
      }
      const reParsed = parseInput(metaDateText, [], []);
      if (reParsed.dueDate) {
        setMetaDueDate(reParsed.dueDate);
        setMetaDueTime(reParsed.dueTime);
        setMetaDateText(
          formatDate(reParsed.dueDate) +
            (reParsed.dueTime ? " " + reParsed.dueTime : ""),
        );
      }
    }

    async function handleSave(keepOpen = false, openAfter = false) {
      const titleToSave = metaTitle.trim() || input.trim();
      if (!titleToSave || saving) return;
      setSaving(true);
      setError(null);
      try {
        const matchedProject =
          projects.find(
            (p) => p.name.toLowerCase() === metaProjectName.toLowerCase(),
          ) ?? null;
        const suggestedProject =
          !matchedProject && metaProjectName ? metaProjectName : null;

        logger.info("create-task", `save: "${titleToSave}"`, {
          project: matchedProject?.name ?? suggestedProject,
          priority: metaPriority !== "none" ? metaPriority : undefined,
          dueDate: metaDueDate,
          parent: parentTaskId ?? undefined,
        });

        let resolvedProjectId = projectId ?? matchedProject?.id ?? null;

        if (canCreateProjectsAndTags && !resolvedProjectId && suggestedProject) {
          const newProject = await createProject(suggestedProject);
          resolvedProjectId = newProject.id;
          onProjectCreated?.(newProject);
        }

        const task = await createTask({
          title: titleToSave,
          parentTaskId: parentTaskId ?? null,
          projectId: resolvedProjectId,
          areaId: areaId ?? null,
          icon: suggestIcon(titleToSave),
          dueDate: metaDueDate,
          dueTime: metaDueTime,
          priority: metaPriority,
          recurrenceRule: metaRecurrenceRule,
          tagIds: [],
        });

        setInput("");
        setParsed(null);
        resetAllFields();
        logger.info("create-task", `saved: ${task.id}`);
        onCreated?.(task);
        if (openAfter) {
          onSavedWithEdit?.(task);
        } else {
          onSaved?.(keepOpen);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to save";
        logger.error("create-task", `save failed: ${msg}`);
        setError(msg);
      } finally {
        setSaving(false);
      }
    }

    // Shared key handler for all meta fields
    function metaKeyDown(
      e: React.KeyboardEvent<HTMLInputElement>,
      nextRef: React.RefObject<HTMLInputElement | null> | null,
      onCommit?: () => void,
    ) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCommit?.();
        inputEl.current?.focus();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onCommit?.();
        handleSave(false);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        onCommit?.();
        if (nextRef?.current) {
          nextRef.current.focus();
        } else {
          inputEl.current?.focus();
        }
      }
    }

    function handleMainKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (!compact && e.key === "Tab") {
        e.preventDefault();
        titleFieldRef.current?.focus();
        return;
      }
      if (onKeyDownFirst?.(e, !input.trim())) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave(false);
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        handleSave(true);
      }
    }

    // ── Compact (subtask) style ──────────────────────────────────────────────
    if (compact) {
      const compactHasPreview =
        parsed &&
        (parsed.dueDate ||
          parsed.project ||
          parsed.priority !== "none" ||
          parsed.suggestedProjectName);
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
              onKeyDown={handleMainKeyDown}
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
          {compactHasPreview && (
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
                <Chip
                  color="#5b5bd6"
                  label={`# ${parsed.project.name}`}
                />
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
        {/* Row 1 — raw capture input */}
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
              border: `2px solid ${metaProjectName ? "#5b5bd6" : "var(--border-strong)"}`,
              transition: "border-color 200ms",
              display: "block",
            }}
          />
          <input
            ref={inputEl}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleMainKeyDown}
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
          {!saving && (input || metaTitle) && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {onSavedWithEdit && (
                <button
                  title="Save and edit"
                  onClick={() => handleSave(false, true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-tertiary)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <SquarePen size={13} />
                </button>
              )}
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
            </div>
          )}
        </div>

        {/* Row 2 — title field (full width, always visible) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px 0",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "var(--text-quaternary, #9ca3af)",
              userSelect: "none",
              flexShrink: 0,
              minWidth: 28,
            }}
          >
            Title
          </span>
          <input
            ref={titleFieldRef}
            value={metaTitle}
            placeholder="Task title…"
            onChange={(e) => {
              setMetaTitle(e.target.value);
              markEdited("title");
            }}
            onKeyDown={(e) => metaKeyDown(e, projectFieldRef)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              borderBottom: "1px solid var(--border-subtle)",
              outline: "none",
              fontSize: 13,
              color: metaTitle
                ? "var(--text-primary)"
                : "var(--text-quaternary, #9ca3af)",
              fontFamily: "inherit",
              paddingBottom: 2,
            }}
          />
        </div>

        {/* Row 3 — metadata fields (always visible) */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: "8px 14px 2px",
          }}
        >
          <MetaField
            prefix="#"
            value={metaProjectName}
            placeholder="Project"
            color="#5b5bd6"
            inputRef={projectFieldRef}
            onChange={(v) => {
              setMetaProjectName(v);
              markEdited("project");
            }}
            onKeyDown={(e) => metaKeyDown(e, dateFieldRef)}
          />
          <MetaField
            prefix="📅"
            value={metaDateText}
            placeholder="Date"
            color="#0891b2"
            inputRef={dateFieldRef}
            onChange={(v) => {
              setMetaDateText(v);
              markEdited("date");
            }}
            onKeyDown={(e) =>
              metaKeyDown(e, priorityFieldRef, commitDateText)
            }
          />
          <MetaField
            prefix={metaPriority !== "none" ? "" : "!"}
            value={metaPriority !== "none" ? PRIORITY_LABELS[metaPriority] : ""}
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
              metaKeyDown(e, recurrenceFieldRef);
            }}
          />
          <MetaField
            prefix="↻"
            value={
              metaRecurrenceRule
                ? metaRecurrenceRule
                    .split(";")[0]
                    .replace("FREQ=", "")
                    .toLowerCase()
                : ""
            }
            placeholder="Repeat"
            color="#059669"
            inputRef={recurrenceFieldRef}
            readOnly
            onKeyDown={(e) => metaKeyDown(e, null)}
          />
        </div>

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
