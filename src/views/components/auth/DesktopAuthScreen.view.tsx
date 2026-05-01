import { useEffect, useState, type FormEvent } from "react";
import type { AuthResult } from "../../../hooks/useAuth";

export interface DesktopAuthActions {
  signIn: (
    email: string,
    password: string,
    rememberMe: boolean,
  ) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  resendSignupConfirmation: (email: string) => Promise<AuthResult>;
}

export interface DesktopAuthScreenProps {
  auth: DesktopAuthActions;
  launchNotice?: string | null;
  resendCooldownSeconds?: number;
}

export default function DesktopAuthScreen({
  auth,
  launchNotice = null,
  resendCooldownSeconds = 30,
}: DesktopAuthScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<{
    email: string;
    password: string;
    rememberMe: boolean;
  } | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (launchNotice) setNotice(launchNotice);
  }, [launchNotice]);

  useEffect(() => {
    if (!awaitingConfirmation || resendCooldown <= 0) return;
    const id = window.setInterval(() => {
      setResendCooldown((current) => (current <= 1 ? 0 : current - 1));
    }, 1_000);
    return () => window.clearInterval(id);
  }, [awaitingConfirmation, resendCooldown]);

  function enterAwaitingConfirmation(
    nextNotice: string,
    nextRememberMe: boolean,
  ) {
    setAwaitingConfirmation({
      email: email.trim(),
      password,
      rememberMe: nextRememberMe,
    });
    setNotice(nextNotice);
    setError("");
    setResendCooldown(resendCooldownSeconds);
  }

  function leaveAwaitingConfirmation() {
    setAwaitingConfirmation(null);
    setNotice("");
    setError("");
    setResendCooldown(0);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    const result = isSignUp
      ? await auth.signUp(email, password)
      : await auth.signIn(email, password, rememberMe);

    if (!result.ok) {
      if (result.kind === "email_not_confirmed") {
        enterAwaitingConfirmation("Check your email to continue.", rememberMe);
      } else {
        setError(result.message);
      }
    } else if (isSignUp) {
      enterAwaitingConfirmation(
        "Check your email to finish creating your account.",
        true,
      );
    }

    setLoading(false);
  }

  async function handleResend() {
    const resendEmail = awaitingConfirmation?.email ?? email.trim();
    if (!resendEmail || resendCooldown > 0) return;
    setLoading(true);
    setError("");
    const result = await auth.resendSignupConfirmation(resendEmail);
    if (result.ok) {
      setNotice("Confirmation email sent.");
      setResendCooldown(resendCooldownSeconds);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }

  return (
    <div
      data-testid="auth-screen"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-secondary)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: 360,
          background: "var(--bg-primary)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-default)",
          padding: 32,
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <h1
            data-testid="auth-title"
            style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}
          >
            Jot
          </h1>
          <p
            data-testid="auth-subtitle"
            style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}
          >
            {awaitingConfirmation
              ? "Confirm your email to continue"
              : isSignUp
                ? "Create an account"
                : "Sign in to continue"}
          </p>
        </div>

        {awaitingConfirmation ? (
          <div data-testid="auth-awaiting-confirmation" style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  marginBottom: 4,
                }}
              >
                Awaiting confirmation for
              </div>
              <div
                data-testid="auth-awaiting-email"
                style={{
                  fontSize: 14,
                  color: "var(--text-primary)",
                  fontWeight: 500,
                }}
              >
                {awaitingConfirmation.email}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <FormInput
                testId="auth-email"
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
              />
              <FormInput
                testId="auth-password"
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="********"
              />
            </div>

            {!isSignUp && (
              <label
                data-testid="auth-remember"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 14,
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  data-testid="auth-remember-checkbox"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  style={{
                    width: 15,
                    height: 15,
                    cursor: "pointer",
                    accentColor: "var(--accent)",
                  }}
                />
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Keep me signed in
                </span>
              </label>
            )}
          </>
        )}

        {error && (
          <div
            data-testid="auth-error"
            style={{
              marginTop: 12,
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(220,38,38,0.08)",
              color: "#dc2626",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            data-testid="auth-notice"
            style={{
              marginTop: 12,
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(22,163,74,0.10)",
              color: "#166534",
              fontSize: 13,
            }}
          >
            {notice}
          </div>
        )}

        {awaitingConfirmation ? (
          <button
            data-testid="auth-resend"
            type="button"
            onClick={() => {
              void handleResend();
            }}
            disabled={loading || resendCooldown > 0}
            style={{
              marginTop: 20,
              width: "100%",
              padding: "10px",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: 14,
              fontWeight: 500,
              cursor: loading ? "wait" : "pointer",
              opacity: loading || resendCooldown > 0 ? 0.7 : 1,
            }}
          >
            {resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : "Send confirmation again"}
          </button>
        ) : (
          <button
            data-testid="auth-submit"
            type="submit"
            disabled={loading}
            style={{
              marginTop: 20,
              width: "100%",
              padding: "10px",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: 14,
              fontWeight: 500,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
          </button>
        )}

        <button
          data-testid="auth-mode-toggle"
          type="button"
          onClick={() => {
            if (awaitingConfirmation) {
              leaveAwaitingConfirmation();
              return;
            }
            setIsSignUp((value) => !value);
          }}
          style={{
            marginTop: 12,
            width: "100%",
            fontSize: 13,
            color: "var(--text-secondary)",
            padding: "4px",
          }}
        >
          {awaitingConfirmation
            ? "Back"
            : isSignUp
              ? "Already have an account? Sign in"
              : "Don't have an account? Sign up"}
        </button>
      </form>
    </div>
  );
}

function FormInput({
  testId,
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  testId: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
        {label}
      </span>
      <input
        data-testid={testId}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        style={{
          padding: "8px 12px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-default)",
          background: "var(--bg-secondary)",
          color: "var(--text-primary)",
          fontSize: 14,
          outline: "none",
          fontFamily: "inherit",
        }}
      />
    </label>
  );
}
