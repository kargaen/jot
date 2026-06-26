import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type { ParsedInput, Project, Tag, Task } from "../../../../models/shared";
import { parseInput } from "../../../../services/capture/nlp.service";
import { friendlyDue, textToDescriptionDoc } from "../../../../models/tasks/taskPresentation";
import Spinner from "../../../components/ui/Spinner.view";

interface Props {
  projects: Project[];
  tags: Tag[];
  onSave: (
    parsed: ParsedInput,
    opts?: { description?: Record<string, unknown> | null },
  ) => Promise<void>;
}

const PRIORITY_CHOICES: { value: Task["priority"]; label: string }[] = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
];

export default function MobileCaptureView({ projects, tags, onSave }: Props) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedInput | null>(null);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [splitLong, setSplitLong] = useState(false);
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual overrides. `undefined` means "not overridden — use the parsed value".
  const [ovPriority, setOvPriority] = useState<Task["priority"] | undefined>(undefined);
  const [ovDueDate, setOvDueDate] = useState<string | null | undefined>(undefined);
  const [ovProjectId, setOvProjectId] = useState<string | null | undefined>(undefined);
  const [ovRecurrence, setOvRecurrence] = useState<string | null | undefined>(undefined);

  function resetOverrides() {
    setOvPriority(undefined);
    setOvDueDate(undefined);
    setOvProjectId(undefined);
    setOvRecurrence(undefined);
  }

  useEffect(() => {
    if (parseTimer.current) clearTimeout(parseTimer.current);
    if (!text.trim()) {
      setParsed(null);
      setParsing(false);
      resetOverrides();
      setSplitLong(false);
      return;
    }
    setParsing((prev) => prev || parsed === null);
    parseTimer.current = setTimeout(() => {
      try {
        setParsed(parseInput(text, projects, tags));
      } catch {
        // parsing failure is non-fatal; chips just won't show
      }
      setParsing(false);
    }, 120);
    return () => { if (parseTimer.current) clearTimeout(parseTimer.current); };
  }, [text, projects, tags]);

  // Effective values: overrides win over parsed.
  const ePriority: Task["priority"] = ovPriority ?? parsed?.priority ?? "none";
  const eDueDate = ovDueDate !== undefined ? ovDueDate : (parsed?.dueDate ?? null);
  const eProjectId = ovProjectId !== undefined ? ovProjectId : (parsed?.project?.id ?? null);
  const eRecurrence = ovRecurrence !== undefined ? ovRecurrence : (parsed?.recurrenceRule ?? null);
  const suggestedProjectName = ovProjectId !== undefined ? null : (parsed?.suggestedProjectName ?? null);
  const splittable = parsed?.longSplit ?? null;

  function buildDraft(): ParsedInput {
    const base = parsed ?? parseInput(text, projects, tags);
    let project = base.project;
    let suggested = base.suggestedProjectName;
    if (ovProjectId !== undefined) {
      project = ovProjectId ? (projects.find((p) => p.id === ovProjectId) ?? null) : null;
      suggested = null;
    }
    return {
      ...base,
      priority: ePriority,
      dueDate: eDueDate,
      // A manually-picked date has no parsed time component.
      dueTime: ovDueDate !== undefined ? null : base.dueTime,
      project,
      suggestedProjectName: suggested,
      recurrenceRule: eRecurrence,
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const draft = buildDraft();
      if (splittable && splitLong) {
        await onSave(
          { ...draft, title: splittable.title },
          { description: textToDescriptionDoc(splittable.descriptionText) },
        );
      } else {
        await onSave(draft);
      }
      setText("");
      setParsed(null);
      resetOverrides();
      setSplitLong(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setBusy(false);
    }
  }

  const showAdjust = text.trim().length > 0;
  const projectChipColor = eProjectId ? "#16a34a" : suggestedProjectName ? "#d97706" : undefined;
  const projectChipLabel = eProjectId
    ? (projects.find((p) => p.id === eProjectId)?.name ?? "Project")
    : suggestedProjectName;

  return (
    <div style={styles.shell}>
      {saved ? <div style={styles.confirmation}>Task added ✓</div> : null}
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.hint}>What needs to get done?</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Buy groceries tomorrow · Call dentist #health · Report for Work Friday"
          rows={3}
          style={styles.input}
          autoFocus
        />

        {parsing && !parsed ? <div style={styles.parsingHint}>Parsing…</div> : null}

        {/* Glanceable summary of the effective values */}
        {showAdjust ? (
          <div style={styles.chips}>
            {eDueDate ? (
              <Chip label={friendlyDue(eDueDate, ovDueDate !== undefined ? null : parsed?.dueTime ?? null) ?? eDueDate} color="#0284c7" />
            ) : null}
            {eRecurrence ? <Chip label={eRecurrence} color="#7c3aed" /> : null}
            {projectChipLabel ? <Chip label={projectChipLabel} color={projectChipColor!} /> : null}
            {ePriority !== "none" ? (
              <Chip
                label={ePriority === "high" ? "!! High" : ePriority === "medium" ? "! Medium" : "~ Low"}
                color={ePriority === "high" ? "#dc2626" : ePriority === "medium" ? "#d97706" : "#6b7280"}
              />
            ) : null}
          </div>
        ) : null}

        {/* Editable controls */}
        {showAdjust ? (
          <div style={styles.adjust}>
            <div style={styles.adjustRow}>
              <span style={styles.adjustLabel}>Priority</span>
              <div style={styles.segment}>
                {PRIORITY_CHOICES.map((choice) => {
                  const active = ePriority === choice.value;
                  return (
                    <button
                      key={choice.value}
                      type="button"
                      onClick={() => setOvPriority(choice.value)}
                      style={{
                        ...styles.segmentButton,
                        background: active ? "var(--accent)" : "transparent",
                        color: active ? "#fff" : "var(--text-secondary)",
                      }}
                    >
                      {choice.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={styles.adjustRow}>
              <span style={styles.adjustLabel}>Due</span>
              <div style={styles.adjustControl}>
                <input
                  type="date"
                  value={eDueDate ?? ""}
                  onChange={(e) => setOvDueDate(e.target.value || null)}
                  style={styles.control}
                />
                {eDueDate ? (
                  <button type="button" onClick={() => setOvDueDate(null)} style={styles.clearButton} aria-label="Clear due date">
                    ✕
                  </button>
                ) : null}
              </div>
            </div>

            <div style={styles.adjustRow}>
              <span style={styles.adjustLabel}>Project</span>
              <select
                value={eProjectId ?? ""}
                onChange={(e) => setOvProjectId(e.target.value || null)}
                style={styles.control}
              >
                <option value="">{suggestedProjectName ? `New: ${suggestedProjectName}` : "No project"}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {eRecurrence ? (
              <div style={styles.adjustRow}>
                <span style={styles.adjustLabel}>Repeats</span>
                <div style={styles.adjustControl}>
                  <span style={styles.recurrenceValue}>{eRecurrence}</span>
                  <button type="button" onClick={() => setOvRecurrence(null)} style={styles.clearButton} aria-label="Clear recurrence">
                    ✕
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {splittable ? (
          <label style={styles.splitRow}>
            <input
              type="checkbox"
              checked={splitLong}
              onChange={(e) => setSplitLong(e.target.checked)}
              style={styles.splitCheckbox}
            />
            <span style={styles.splitText}>
              Long title — shorten it and move the rest into a note
              {splitLong ? <span style={styles.splitPreview}>{splittable.title}</span> : null}
            </span>
          </label>
        ) : null}

        {error ? <div style={styles.error}>{error}</div> : null}
        <button type="submit" disabled={busy || !text.trim()} style={styles.button}>
          {busy ? (
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Spinner size={14} /> Saving…
            </span>
          ) : "Add task"}
        </button>
      </form>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ ...styles.chip, color, background: `${color}18`, border: `1px solid ${color}30` }}>
      {label}
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    padding: "32px 20px",
  },
  form: {
    display: "grid",
    gap: 14,
  },
  hint: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  input: {
    width: "100%",
    padding: "13px 14px",
    borderRadius: 16,
    border: "1px solid var(--border-default)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: 15,
    fontFamily: "inherit",
    resize: "none",
    outline: "none",
    boxSizing: "border-box",
    lineHeight: 1.5,
  },
  parsingHint: {
    fontSize: 12,
    color: "var(--text-tertiary)",
    fontStyle: "italic" as const,
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 9px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500,
    maxWidth: 220,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  adjust: {
    display: "grid",
    gap: 10,
    padding: "14px",
    borderRadius: 16,
    background: "var(--surface-glass)",
    border: "1px solid var(--surface-border-accent)",
  },
  adjustRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  adjustLabel: {
    width: 64,
    flexShrink: 0,
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
  adjustControl: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  segment: {
    flex: 1,
    display: "flex",
    gap: 4,
    padding: 3,
    borderRadius: 10,
    background: "var(--bg-secondary)",
    border: "1px solid var(--border-subtle)",
  },
  segmentButton: {
    flex: 1,
    padding: "6px 0",
    borderRadius: 7,
    border: "none",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  control: {
    flex: 1,
    minWidth: 0,
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
  clearButton: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "1px solid var(--border-default)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  recurrenceValue: {
    flex: 1,
    fontSize: 14,
    color: "var(--text-primary)",
  },
  confirmation: {
    padding: "10px 14px",
    borderRadius: 12,
    background: "rgba(22,163,74,0.10)",
    color: "#16a34a",
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 14,
    textAlign: "center" as const,
  },
  splitRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    cursor: "pointer",
  },
  splitCheckbox: {
    marginTop: 2,
    flexShrink: 0,
  },
  splitText: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  splitPreview: {
    fontSize: 12,
    color: "var(--text-tertiary)",
    fontStyle: "italic" as const,
  },
  error: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(220,38,38,0.08)",
    color: "#b91c1c",
    fontSize: 13,
  },
  button: {
    padding: "13px 14px",
    borderRadius: 16,
    border: "none",
    background: "linear-gradient(135deg, #5b5bd6, #7a6cff)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 650,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 10px 24px rgba(91,91,214,0.22)",
  },
};
