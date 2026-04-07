import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { createTask, createProject, createTag } from "../lib/supabase";
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
  /** Allow NLP-suggested projects/tags to be created on the fly */
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
  /** Called when new tags are created (so parent can update its list) */
  onTagCreated?: (t: Tag) => void;
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
      onTagCreated,
    },
    ref,
  ) {
    const [input, setInput] = useState("");
    const [parsed, setParsed] = useState<ReturnType<typeof parseInput> | null>(
      null,
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputEl = useRef<HTMLInputElement>(null);
    const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputEl.current?.focus(),
      clear: () => {
        setInput("");
        setParsed(null);
        setError(null);
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
      if (!value) {
        setParsed(null);
        return;
      }
      runParse(value);
    }

    async function handleSave(keepOpen = false) {
      if (!input.trim() || saving) return;
      setSaving(true);
      setError(null);
      try {
        const result = parseInput(input, projects, allTags);
        logger.info("create-task", `save: "${result.title || input.trim()}"`, {
          project: result.project?.name ?? result.suggestedProjectName,
          priority: result.priority !== "none" ? result.priority : undefined,
          dueDate: result.dueDate,
          tags: result.tags.map((t) => t.name),
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

        const tagIds: string[] = result.tags.map((t) => t.id);
        if (canCreateProjectsAndTags) {
          for (const name of result.suggestedTagNames) {
            const newTag = await createTag(name);
            tagIds.push(newTag.id);
            onTagCreated?.(newTag);
          }
        }

        const task = await createTask({
          title: result.title || input.trim(),
          parentTaskId: parentTaskId ?? null,
          projectId: resolvedProjectId,
          areaId: areaId ?? null,
          icon: suggestIcon(result.title || input.trim()),
          dueDate: result.dueDate,
          dueTime: result.dueTime,
          priority: result.priority,
          recurrenceRule: result.recurrenceRule,
          tagIds,
        });

        setInput("");
        setParsed(null);
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

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
        parsed.tags.length > 0 ||
        parsed.suggestedTagNames.length > 0 ||
        parsed.recurrenceRule ||
        parsed.suggestedProjectName);

    // ── Compact (subtask) style ──────────────────────────────────────────────
    if (compact) {
      return (
        <div>
          <div
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
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
              {parsed?.tags.map((t) => (
                <Chip key={t.id} color="#6b7280" label={`@ ${t.name}`} />
              ))}
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

        {hasPreview && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              padding: "8px 14px 0",
            }}
          >
            {(parsed?.project || parsed?.suggestedProjectName) && (
              <Chip
                color={parsed?.project ? "#5b5bd6" : "#d97706"}
                label={
                  parsed?.project
                    ? `# ${parsed.project.name}`
                    : `+ project: ${parsed?.suggestedProjectName}`
                }
              />
            )}
            {parsed?.dueDate && (
              <Chip
                color="#0891b2"
                label={`📅 ${formatDate(parsed.dueDate)}${parsed.dueTime ? " " + parsed.dueTime : ""}`}
              />
            )}
            {parsed?.priority && parsed.priority !== "none" && (
              <Chip
                color={PRIORITY_COLORS[parsed.priority]}
                label={PRIORITY_LABELS[parsed.priority]}
              />
            )}
            {parsed?.tags.map((t) => (
              <Chip key={t.id} color="#6b7280" label={`@ ${t.name}`} />
            ))}
            {parsed?.suggestedTagNames.map((name) => (
              <Chip key={name} color="#d97706" label={`+ tag: ${name}`} />
            ))}
            {parsed?.recurrenceRule && (
              <Chip
                color="#059669"
                label={`↻ ${parsed.recurrenceRule.split(";")[0].replace("FREQ=", "").toLowerCase()}`}
              />
            )}
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
