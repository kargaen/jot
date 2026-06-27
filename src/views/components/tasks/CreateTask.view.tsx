import { forwardRef, useImperativeHandle } from "react";
import { SquarePen } from "lucide-react";
import { formatCreateTaskDate, useCreateTask } from "../../../hooks/useCreateTask";
import type { Project, Tag, Task } from "../../../models/shared";

const PRIORITY_LABELS: Record<string, string> = {
  high: "!! High",
  medium: "! Medium",
  low: "~ Low",
  none: "",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "var(--danger)",
  medium: "var(--warning)",
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
  inputRef: React.RefObject<HTMLInputElement>;
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
            Math.max((value || placeholder).length, placeholder.length) * 7 + 4,
          minWidth: 30,
          maxWidth: 160,
        }}
      />
    </div>
  );
}

export interface CreateTaskRef {
  focus(): void;
  clear(): void;
  isEmpty(): boolean;
}

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
  onProjectCreated?: (project: Project) => void;
  onSavedWithEdit?: (task: Task) => void;
}

const CreateTask = forwardRef<CreateTaskRef, CreateTaskProps>(function CreateTask(
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
  const {
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
    metaRecurrenceRule,
    inputEl,
    titleFieldRef,
    projectFieldRef,
    dateFieldRef,
    priorityFieldRef,
    recurrenceFieldRef,
    editButtonRef,
    setMetaTitle,
    setMetaProjectName,
    setMetaDateText,
    markEdited,
    cyclePriority,
    commitDateText,
    handleInputChange,
    handleSave,
    focus,
    clear,
    isEmpty,
  } = useCreateTask({
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
  });

  useImperativeHandle(ref, () => ({
    focus,
    clear,
    isEmpty,
  }));

  function metaKeyDown(
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    nextRef: React.RefObject<{ focus: () => void } | null> | null,
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
      if (nextRef?.current) nextRef.current.focus();
      else inputEl.current?.focus();
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
            onChange={(e) => handleInputChange(e.target.value)}
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
              <Chip color="#5b5bd6" label={`# ${parsed.project.name}`} />
            )}
            {parsed?.dueDate && (
              <Chip
                color="var(--info)"
                label={`📅 ${formatCreateTaskDate(parsed.dueDate)}`}
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
              color: "var(--danger)",
            }}
          >
            {error}
          </div>
        )}
      </div>
    );
  }

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
            border: `2px solid ${metaProjectName ? "#5b5bd6" : "var(--border-strong)"}`,
            transition: "border-color 200ms",
            display: "block",
          }}
        />
        <input
          ref={inputEl}
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
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
        <textarea
          ref={titleFieldRef}
          value={metaTitle}
          placeholder="Task title…"
          onChange={(e) => {
            setMetaTitle(e.target.value);
            markEdited("title");
          }}
          onKeyDown={(e) => metaKeyDown(e, projectFieldRef)}
          rows={Math.min(4, Math.max(1, Math.ceil((metaTitle.length || 12) / 48)))}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--border-subtle)",
            outline: "none",
            fontSize: 13,
            lineHeight: 1.35,
            color: metaTitle
              ? "var(--text-primary)"
              : "var(--text-quaternary, #9ca3af)",
            fontFamily: "inherit",
            paddingBottom: 2,
            resize: "none",
            overflow: "hidden",
          }}
        />
      </div>

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
          color="var(--info)"
          inputRef={dateFieldRef}
          onChange={(v) => {
            setMetaDateText(v);
            markEdited("date");
          }}
          onKeyDown={(e) => metaKeyDown(e, priorityFieldRef, commitDateText)}
        />
        <MetaField
          prefix={metaPriority !== "none" ? "" : "!"}
          value={metaPriority !== "none" ? PRIORITY_LABELS[metaPriority] : ""}
          placeholder="Priority"
          color={
            metaPriority !== "none" ? PRIORITY_COLORS[metaPriority] : "#9ca3af"
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
              ? metaRecurrenceRule.split(";")[0].replace("FREQ=", "").toLowerCase()
              : ""
          }
          placeholder="Repeat"
          color="#059669"
          inputRef={recurrenceFieldRef}
          readOnly
          onKeyDown={(e) => metaKeyDown(e, onSavedWithEdit ? editButtonRef : null)}
        />
        {onSavedWithEdit && !saving && (input || metaTitle) && (
          <button
            ref={editButtonRef}
            title="Save and edit"
            onClick={() => handleSave(false, true)}
            onKeyDown={(e) => {
              if (e.key === "Escape" || (e.key === "Tab" && !e.shiftKey)) {
                e.preventDefault();
                inputEl.current?.focus();
              }
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 20,
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-secondary)",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "inherit",
            }}
          >
            <SquarePen size={12} />
            Edit
          </button>
        )}
      </div>

      {longSplit && (
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "8px 14px 0",
            fontSize: 12,
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={splitLong}
            onChange={(e) => setSplitLong(e.target.checked)}
            style={{ marginTop: 2, flexShrink: 0 }}
          />
          <span>
            Long title — shorten it and move the rest into a note
            {splitLong && (
              <span style={{ display: "block", color: "var(--text-tertiary)", fontStyle: "italic", marginTop: 2 }}>
                {longSplit.title}
              </span>
            )}
          </span>
        </label>
      )}

      {error && (
        <div style={{ padding: "6px 14px 0", fontSize: 12, color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
});

export default CreateTask;
