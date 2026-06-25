import type { CSSProperties } from "react";
import { EditorContent } from "@tiptap/react";
import type { Area, Project, Tag, TaskWithTags } from "../../../../models/shared";
import { useTaskDetail } from "../../../../hooks/useTaskDetail";

interface Props {
  task: TaskWithTags;
  projects: Project[];
  areas: Area[];
  allTags: Tag[];
  onUpdated: () => void;
  onBack: () => void;
}

const PRIORITY_OPTIONS = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export default function MobileTaskDetailView({
  task,
  projects,
  areas,
  onUpdated,
  onBack,
}: Props) {
  const {
    title,
    projectId,
    areaId,
    priority,
    responsibleUserId,
    dueDate,
    link,
    estimatedMins,
    assignablePeople,
    subtasks,
    saveStatus,
    completing,
    editor,
    project,
    area,
    canAssignResponsibility,
    typeLabel,
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
    openTaskLink,
    normalizedLink,
  } = useTaskDetail({ task, projects, areas, onUpdated, onCompleted: onBack });

  const areaFromProject = !!project;

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <button type="button" onClick={onBack} style={styles.backButton} aria-label="Back to tasks">
          ‹ Tasks
        </button>
        <span style={styles.saveStatus}>
          {saveStatus === "saving"
            ? "Saving…"
            : saveStatus === "error"
              ? "Save failed"
              : saveStatus === "saved"
                ? "Saved"
                : ""}
        </span>
      </header>

      <div style={styles.scroll}>
        <span style={styles.typeLabel}>{typeLabel}</span>

        <textarea
          value={title}
          onChange={(e) => updateTitle(e.target.value)}
          rows={2}
          style={styles.titleInput}
          placeholder="Task title"
        />

        <div style={styles.fields}>
          <Field label="Area">
            {areaFromProject ? (
              <span style={styles.readonlyValue}>{area?.name ?? "—"} (from project)</span>
            ) : (
              <select
                value={areaId ?? ""}
                onChange={(e) => updateAreaId(e.target.value || null)}
                style={styles.select}
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Project">
            <select
              value={projectId ?? ""}
              onChange={(e) => updateProjectId(e.target.value || null)}
              style={styles.select}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Priority">
            <select
              value={priority}
              onChange={(e) => updatePriority(e.target.value as TaskWithTags["priority"])}
              style={styles.select}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          {canAssignResponsibility && (
            <Field label="Responsible">
              <select
                value={responsibleUserId ?? ""}
                onChange={(e) => updateResponsible(e.target.value)}
                style={styles.select}
              >
                <option value="">Unassigned</option>
                {assignablePeople.map((person) => (
                  <option key={person.user_id} value={person.user_id}>{person.email}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => updateDueDate(e.target.value)}
              style={styles.select}
            />
          </Field>

          <Field label="Estimate">
            <input
              value={estimatedMins}
              onChange={(e) => updateEstimatedMins(e.target.value)}
              placeholder="e.g. 30m or 2h"
              style={styles.select}
            />
          </Field>

          <Field label="Link">
            <div style={styles.linkRow}>
              <input
                value={link}
                onChange={(e) => updateLink(e.target.value)}
                placeholder="paste a URL"
                style={{ ...styles.select, flex: 1 }}
              />
              {normalizedLink ? (
                <button type="button" onClick={openTaskLink} style={styles.linkOpen}>
                  Open
                </button>
              ) : null}
            </div>
          </Field>
        </div>

        {task.tags && task.tags.length > 0 ? (
          <div style={styles.tags}>
            <div style={styles.sectionLabel}>Tags</div>
            <div style={styles.tagChips}>
              {task.tags.map((tag) => (
                <span key={tag.id} style={styles.tagChip}>{tag.name}</span>
              ))}
            </div>
          </div>
        ) : null}

        <div style={styles.notes}>
          <EditorContent editor={editor} />
        </div>

        {subtasks.length > 0 ? (
          <div style={styles.subtasks}>
            <div style={styles.sectionLabel}>Subtasks · {subtasks.length}</div>
            {subtasks.map((sub) => (
              <div key={sub.id} style={styles.subtaskRow}>
                <button
                  type="button"
                  onClick={() => handleCompleteSubtask(sub.id)}
                  style={styles.subtaskCheck}
                  aria-label="Complete subtask"
                >
                  <span style={styles.checkCircle} />
                </button>
                <span style={styles.subtaskTitle}>{sub.title}</span>
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => { void handleCompleteTask(); }}
          disabled={completing}
          style={styles.completeButton}
        >
          {completing ? "Completing…" : "Mark complete"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <div style={styles.fieldControl}>{children}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "var(--bg-primary)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
  },
  backButton: {
    border: "none",
    background: "transparent",
    color: "var(--accent)",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    padding: 0,
  },
  saveStatus: {
    fontSize: 12,
    color: "var(--text-tertiary)",
  },
  scroll: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 20px 40px",
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-tertiary)",
  },
  titleInput: {
    width: "100%",
    marginTop: 8,
    marginBottom: 20,
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
    background: "transparent",
    border: "none",
    outline: "none",
    resize: "none",
    fontFamily: "inherit",
    lineHeight: 1.3,
    boxSizing: "border-box",
  },
  fields: {
    display: "grid",
    gap: 12,
    marginBottom: 24,
  },
  field: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  fieldLabel: {
    width: 84,
    flexShrink: 0,
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
  fieldControl: {
    flex: 1,
    minWidth: 0,
  },
  select: {
    width: "100%",
    padding: "9px 10px",
    borderRadius: 10,
    border: "1px solid var(--border-default)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  },
  readonlyValue: {
    fontSize: 14,
    color: "var(--text-secondary)",
  },
  linkRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  linkOpen: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid var(--border-default)",
    background: "var(--bg-secondary)",
    color: "var(--accent)",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
  },
  tags: {
    marginBottom: 24,
  },
  tagChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  tagChip: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    background: "var(--surface-glass)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 9,
    padding: "4px 10px",
  },
  notes: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid var(--border-subtle)",
    background: "var(--bg-secondary)",
    minHeight: 120,
    marginBottom: 24,
  },
  subtasks: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-tertiary)",
    marginBottom: 8,
  },
  subtaskRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid var(--border-subtle)",
  },
  subtaskCheck: {
    flexShrink: 0,
    width: 24,
    height: 24,
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircle: {
    display: "block",
    width: 20,
    height: 20,
    borderRadius: "50%",
    border: "2px solid var(--border-default)",
  },
  subtaskTitle: {
    fontSize: 15,
    color: "var(--text-primary)",
  },
  completeButton: {
    width: "100%",
    padding: "13px 14px",
    borderRadius: 14,
    border: "1px solid rgba(15,139,104,0.25)",
    background: "rgba(15,139,104,0.10)",
    color: "#0f8b68",
    fontSize: 15,
    fontWeight: 650,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
