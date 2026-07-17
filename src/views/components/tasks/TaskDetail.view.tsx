import { useEffect, useRef, useState } from "react";
import { projectColor, spaceColor } from "../../../utils/presentation/colors";
import { EditorContent } from "@tiptap/react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import * as LucideIcons from "lucide-react";
import { ChevronDown } from "lucide-react";
import type { Area, Project, Tag, TaskWithTags } from "../../../models/shared";
import CopyTasksControl from "../ui/CopyTasksControl.view";
import { useTaskDetail, getTaskDetailIconComponent } from "../../../hooks/useTaskDetail";
import TaskRow from "./TaskRow.view";
import CreateTask from "./CreateTask.view";

export interface TaskDetailProps {
  task: TaskWithTags;
  projects: Project[];
  areas: Area[];
  allTags: Tag[];
  onUpdated: () => void;
}

const PRIORITY_OPTIONS = [
  { value: "none", label: "None", color: "var(--text-tertiary)" },
  { value: "low", label: "Low", color: "var(--priority-low)" },
  { value: "medium", label: "Medium", color: "var(--priority-medium)" },
  { value: "high", label: "High", color: "var(--priority-high)" },
] as const;

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
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((currentValue) => !currentValue)}
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
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 13,
                color: option.color ?? "var(--text-primary)",
                background:
                  option.value === value ? "var(--accent-light)" : "transparent",
                cursor: "pointer",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TaskDetail({
  task,
  projects,
  areas,
  allTags,
  onUpdated,
}: TaskDetailProps) {
  const {
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
    attachments,
    attachmentStatus,
    attachmentNotice,
    saveStatus,
    completing,
    editor,
    project,
    area,
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
    handleAttachmentPaste,
    handleOpenAttachment,
    handleDeleteAttachment,
    refreshSubtasks,
    openTaskLink,
    normalizedLink,
  } = useTaskDetail({
    task,
    projects,
    areas,
    onUpdated,
  });

  const IconComponent = getTaskDetailIconComponent(icon, LucideIcons);

  // Title grows to fit its content (no scroll, no clamp) — long titles are
  // shown in full so the length is a natural nudge toward shorter titles.
  const TITLE_LINE_HEIGHT = 26;
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  const projectOptions = [
    { value: "", label: "No project", color: "var(--text-tertiary)" },
    ...projects.map((item) => ({ value: item.id, label: item.name })),
  ];
  const areaOptions = areas.map((item) => ({ value: item.id, label: item.name }));
  const responsibilityOptions = [
    { value: "", label: "Unassigned", color: "var(--text-tertiary)" },
    ...assignablePeople.map((person) => ({ value: person.user_id, label: person.email })),
  ];

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
            color:
              saveStatus === "error" ? "var(--priority-high)" : "var(--text-tertiary)",
            transition: "opacity 200ms",
            opacity: saveStatus === "idle" ? 0 : 1,
          }}
        >
          {saveStatus === "saving"
            ? "Saving…"
            : saveStatus === "error"
              ? "Save failed"
              : "Saved"}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }} onPaste={handleAttachmentPaste}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <button
            onClick={() => {
              void handleCompleteTask();
            }}
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

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
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
              <span style={{ fontSize: 16, color: "var(--text-tertiary)" }}>○</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea
              ref={titleRef}
              value={title}
              onChange={(event) => updateTitle(event.target.value)}
              rows={1}
              style={{
                width: "100%",
                fontSize: 20,
                fontWeight: 600,
                color: "var(--text-primary)",
                background: "transparent",
                border: "none",
                outline: "none",
                fontFamily: "inherit",
                lineHeight: `${TITLE_LINE_HEIGHT}px`,
                resize: "none",
                overflow: "hidden",
                display: "block",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginBottom: 24 }}>
          <FieldRow label="Area">
            {project ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                {area && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 3,
                      background: spaceColor(area.id),
                      flexShrink: 0,
                    }}
                  />
                )}
                <span>{area?.name ?? "—"}</span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  (from project)
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {area && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 3,
                      background: spaceColor(area.id),
                      flexShrink: 0,
                    }}
                  />
                )}
                <InlineSelect
                  value={(areaId ?? "") as string}
                  options={areaOptions}
                  onChange={(value) => updateAreaId(value || null)}
                />
              </div>
            )}
          </FieldRow>

          <FieldRow label="Project">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {project && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: projectColor(project.id),
                    display: "inline-block",
                  }}
                />
              )}
              <InlineSelect
                value={(projectId ?? "") as string}
                options={projectOptions}
                onChange={(value) => updateProjectId(value || null)}
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
              onChange={updatePriority}
            />
          </FieldRow>

          {canAssignResponsibility && (
            <FieldRow label="Responsible">
              <InlineSelect
                value={(responsibleUserId ?? "") as string}
                options={responsibilityOptions}
                onChange={updateResponsible}
              />
            </FieldRow>
          )}

          <FieldRow label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(event) => updateDueDate(event.target.value)}
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
              onChange={(event) => updateEstimatedMins(event.target.value)}
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
                onChange={(event) => updateLink(event.target.value)}
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
              {normalizedLink && (
                <button
                  onClick={openTaskLink}
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



        <FieldRow label="Attachments">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                padding: "8px 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px dashed var(--border-default)",
                background: "var(--bg-secondary)",
                fontSize: 12,
                color: "var(--text-tertiary)",
              }}
            >
              Paste an image, PDF, text file, or Markdown file here. Max 5 MB · 3 files.
            </div>
            {attachmentNotice && (
              <div
                style={{
                  fontSize: 12,
                  color: attachmentStatus === "uploaded" ? "var(--accent)" : "var(--priority-high)",
                }}
              >
                {attachmentNotice}
              </div>
            )}
            {attachmentStatus === "uploading" && (
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Uploading…</div>
            )}
            {attachments.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-secondary)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {attachment.filename}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {Math.ceil(attachment.size_bytes / 1024)} KB
                    </span>
                    <button
                      onClick={() => { void handleOpenAttachment(attachment); }}
                      style={{ border: "none", background: "transparent", color: "var(--accent)", cursor: "pointer", fontSize: 12 }}
                    >
                      Open
                    </button>
                    <button
                      onClick={() => { void handleDeleteAttachment(attachment); }}
                      style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 12 }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </FieldRow>

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

        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 8,
            }}
          >
            <span style={{ flex: 1 }}>Subtasks {subtasks.length > 0 && `· ${subtasks.length}`}</span>
            {subtasks.length > 0 && <CopyTasksControl tasks={subtasks} />}
          </div>

          {subtasks.length > 0 && (
            <div
              style={{
                marginBottom: 8,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
                overflow: "hidden",
              }}
            >
              {subtasks.map((subtask) => (
                <TaskRow
                  key={subtask.id}
                  task={subtask}
                  projects={projects}
                  onComplete={() => handleCompleteSubtask(subtask.id)}
                  onClick={() => openTaskWindow(subtask)}
                />
              ))}
            </div>
          )}

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
