import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "./useAuth";

export interface MobileAuthController {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  isSignUp: boolean;
  loading: boolean;
  error: string;
  notice: string;
  awaitingConfirmation: { email: string } | null;
  resendCooldown: number;
  handleSubmit: (e: FormEvent) => void;
  handleResend: () => void;
  toggleMode: () => void;
  leaveAwaitingConfirmation: () => void;
}

const RESEND_COOLDOWN_SECONDS = 30;

export function useMobileAuth(launchNotice: string | null): MobileAuthController {
  const { signIn, signUp, resendSignupConfirmation } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<{ email: string } | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (launchNotice) setNotice(launchNotice);
  }, [launchNotice]);

  useEffect(() => {
    if (!awaitingConfirmation || resendCooldown <= 0) return;
    const id = window.setInterval(() => {
      setResendCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1_000);
    return () => window.clearInterval(id);
  }, [awaitingConfirmation, resendCooldown]);

  function enterAwaitingConfirmation(nextNotice: string) {
    setAwaitingConfirmation({ email: email.trim() });
    setNotice(nextNotice);
    setError("");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }

  function leaveAwaitingConfirmation() {
    setAwaitingConfirmation(null);
    setNotice("");
    setError("");
    setResendCooldown(0);
  }

  function toggleMode() {
    if (awaitingConfirmation) {
      leaveAwaitingConfirmation();
      return;
    }
    setIsSignUp((v) => !v);
    setError("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    const action = isSignUp
      ? signUp(email, password)
      : signIn(email, password, true);

    void action
      .then((result) => {
        if (!result.ok) {
          if (result.kind === "email_not_confirmed") {
            enterAwaitingConfirmation("Check your email to continue.");
          } else {
            setError(result.message);
          }
        } else if (isSignUp) {
          enterAwaitingConfirmation("Check your email to finish creating your account.");
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Something went wrong. Check your connection.");
      })
      .finally(() => setLoading(false));
  }

  function handleResend() {
    const target = awaitingConfirmation?.email ?? email.trim();
    if (!target || resendCooldown > 0) return;
    setLoading(true);
    setError("");

    void resendSignupConfirmation(target)
      .then((result) => {
        if (result.ok) {
          setNotice("Confirmation email sent.");
          setResendCooldown(RESEND_COOLDOWN_SECONDS);
        } else {
          setError(result.message);
        }
      })
      .finally(() => setLoading(false));
  }

  return {
    email, setEmail,
    password, setPassword,
    isSignUp,
    loading, error, notice,
    awaitingConfirmation,
    resendCooldown,
    handleSubmit,
    handleResend,
    toggleMode,
    leaveAwaitingConfirmation,
  };
}
