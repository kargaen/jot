import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";

interface Props {
  onSave: (title: string) => Promise<void>;
}

export default function MobileCaptureView({ onSave }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(trimmed);
      setText("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.shell}>
      {saved ? <div style={styles.confirmation}>Task added ✓</div> : null}
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.hint}>What needs to get done?</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Task title, due date, project…"
          rows={3}
          style={styles.input}
          autoFocus
        />
        {error ? <div style={styles.error}>{error}</div> : null}
        <button type="submit" disabled={busy || !text.trim()} style={styles.button}>
          {busy ? "Saving…" : "Add task"}
        </button>
      </form>
    </div>
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
