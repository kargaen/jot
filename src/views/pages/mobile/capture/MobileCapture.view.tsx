import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type { ParsedInput, Project, Tag } from "../../../../models/shared";
import { parseInput } from "../../../../services/capture/nlp.service";
import { friendlyDue } from "../../../../models/tasks/taskPresentation";

interface Props {
  projects: Project[];
  tags: Tag[];
  onSave: (parsed: ParsedInput) => Promise<void>;
}

export default function MobileCaptureView({ projects, tags, onSave }: Props) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedInput | null>(null);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (parseTimer.current) clearTimeout(parseTimer.current);
    if (!text.trim()) { setParsed(null); setParsing(false); return; }
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const draft = parsed ?? parseInput(text, projects, tags);
      await onSave(draft);
      setText("");
      setParsed(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setBusy(false);
    }
  }

  const hasChips = parsed && (parsed.dueDate || parsed.project || parsed.suggestedProjectName || parsed.recurrenceRule || parsed.priority !== "none");

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
        {parsing && !hasChips ? (
          <div style={styles.parsingHint}>Parsing…</div>
        ) : null}
        {hasChips ? (
          <div style={styles.chips}>
            {parsed!.title !== text.trim() && (
              <Chip label={parsed!.title} color="var(--text-secondary)" />
            )}
            {parsed!.dueDate && (
              <Chip label={friendlyDue(parsed!.dueDate, parsed!.dueTime) ?? parsed!.dueDate} color="#0284c7" />
            )}
            {parsed!.recurrenceRule && (
              <Chip label={parsed!.recurrenceRule} color="#7c3aed" />
            )}
            {(parsed!.project ?? parsed!.suggestedProjectName) && (
              <Chip
                label={(parsed!.project?.name ?? parsed!.suggestedProjectName)!}
                color={parsed!.project ? "#16a34a" : "#d97706"}
              />
            )}
            {parsed!.priority !== "none" && (
              <Chip
                label={parsed!.priority === "high" ? "!! High" : parsed!.priority === "medium" ? "! Medium" : "~ Low"}
                color={parsed!.priority === "high" ? "#dc2626" : parsed!.priority === "medium" ? "#d97706" : "#6b7280"}
              />
            )}
          </div>
        ) : null}
        {error ? <div style={styles.error}>{error}</div> : null}
        <button type="submit" disabled={busy || !text.trim()} style={styles.button}>
          {busy ? "Saving…" : "Add task"}
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
