import type { CSSProperties } from "react";
import type { MobileAuthController } from "../../../../hooks/useMobileAuth";

interface Props {
  controller: MobileAuthController;
}

export default function MobileAuthView({ controller }: Props) {
  const {
    email, setEmail,
    password, setPassword,
    isSignUp,
    loading, error, notice,
    awaitingConfirmation,
    resendCooldown,
    handleSubmit,
    handleResend,
    toggleMode,
  } = controller;

  return (
    <div style={styles.shell}>
      <form onSubmit={handleSubmit} style={styles.card}>

        <div style={styles.header}>
          <img src="/icon.png" alt="Jot" style={styles.logo} />
          <div>
            <div style={styles.title}>Jot</div>
            <div style={styles.subtitle}>
              {awaitingConfirmation
                ? "Confirm your email to continue"
                : isSignUp
                  ? "Create your account"
                  : "Sign in to your daily flow"}
            </div>
          </div>
        </div>

        {awaitingConfirmation ? (
          <div style={styles.confirmationBox}>
            <div style={styles.confirmationLabel}>Awaiting confirmation for</div>
            <div style={styles.confirmationEmail}>{awaitingConfirmation.email}</div>
          </div>
        ) : (
          <div style={styles.fields}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              style={styles.input}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              style={styles.input}
            />
          </div>
        )}

        {error ? <div style={styles.error}>{error}</div> : null}
        {notice ? <div style={styles.notice}>{notice}</div> : null}

        <div style={styles.actions}>
          {awaitingConfirmation ? (
            <button
              type="button"
              onClick={handleResend}
              disabled={loading || resendCooldown > 0}
              style={styles.primaryButton}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Send confirmation again"}
            </button>
          ) : (
            <button type="submit" disabled={loading} style={styles.primaryButton}>
              {loading ? "Working..." : isSignUp ? "Create account" : "Sign in"}
            </button>
          )}

          <button type="button" onClick={toggleMode} style={styles.secondaryButton}>
            {awaitingConfirmation
              ? "Back"
              : isSignUp
                ? "I already have an account"
                : "Create a new account"}
          </button>
        </div>

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
    overflowY: "auto",
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
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 22,
  },
  logo: {
    width: 58,
    height: 58,
    borderRadius: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: 800,
    color: "var(--text-primary)",
  },
  subtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginTop: 4,
  },
  fields: {
    display: "grid",
    gap: 12,
  },
  input: {
    width: "100%",
    padding: "13px 14px",
    borderRadius: 16,
    border: "1px solid var(--border-default)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  },
  confirmationBox: {
    padding: 14,
    borderRadius: 18,
    background: "var(--surface-glass)",
    border: "1px solid var(--surface-border-accent)",
  },
  confirmationLabel: {
    fontSize: 12,
    color: "var(--text-secondary)",
    marginBottom: 4,
  },
  confirmationEmail: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  error: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(220,38,38,0.08)",
    color: "var(--danger-strong)",
    fontSize: 13,
  },
  notice: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(22,163,74,0.10)",
    color: "var(--success-strong)",
    fontSize: 13,
  },
  actions: {
    display: "grid",
    gap: 10,
    marginTop: 18,
  },
  primaryButton: {
    padding: "11px 14px",
    borderRadius: 16,
    border: "none",
    background: "linear-gradient(135deg, #5b5bd6, #7a6cff)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 650,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 10px 24px rgba(91,91,214,0.22)",
  },
  secondaryButton: {
    padding: "11px 14px",
    borderRadius: 16,
    border: "1px solid var(--border-default)",
    background: "var(--surface-glass-strong)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontWeight: 650,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
