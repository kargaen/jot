import type { CSSProperties, FormEvent } from "react";

interface Props {
  name: string;
  setName: (name: string) => void;
  busy: boolean;
  error: string;
  onSubmit: () => Promise<unknown>;
}

export default function MobileOnboardingView({ name, setName, busy, error, onSubmit }: Props) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void onSubmit();
  }

  return (
    <div style={styles.shell}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.header}>
          <img src="/icon.png" alt="Jot" style={styles.logo} />
          <div style={styles.title}>Welcome to Jot</div>
          <div style={styles.subtitle}>
            Create your first space to start organizing tasks and projects.
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label} htmlFor="space-name">Space name</label>
          <input
            id="space-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Personal"
            autoFocus
            style={styles.input}
          />
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}

        <button type="submit" disabled={busy || !name.trim()} style={styles.button}>
          {busy ? "Creating…" : "Get started"}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    minHeight: "100dvh",
    background: "var(--bg-auth-shell)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "60px 20px 20px",
    boxSizing: "border-box",
  },
  card: {
    width: "100%",
    maxWidth: 430,
    background: "var(--surface-glass)",
    border: "1px solid var(--surface-border-accent)",
    borderRadius: 24,
    boxShadow: "var(--surface-shadow-ambient)",
    backdropFilter: "blur(8px)",
    padding: 24,
    boxSizing: "border-box",
    display: "grid",
    gap: 20,
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    textAlign: "center",
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 18,
  },
  title: {
    fontSize: 26,
    fontWeight: 800,
    color: "var(--text-primary)",
  },
  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  },
  field: {
    display: "grid",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    letterSpacing: 0.3,
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
    outline: "none",
    boxSizing: "border-box",
  },
  error: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(220,38,38,0.08)",
    color: "var(--danger-strong)",
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
