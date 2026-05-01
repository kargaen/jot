import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { supabase } from "../services/backend/supabase.service";
import { logger } from "../utils/observability/logger";

const MOD = "auth";
const REMEMBER_KEY = "jot_remember_me";
const AUTH_SNAPSHOT_KEY = "jot_auth_snapshot";
const DEFAULT_AUTH_REDIRECT_URL = "https://kargaen.github.io/jot/confirmed.html";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string, rememberMe: boolean) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  resendSignupConfirmation: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface AuthSnapshot {
  ready: boolean;
  user: { id: string; email: string | null } | null;
}

export interface AuthResult {
  ok: boolean;
  kind:
    | "signed_in"
    | "confirmation_sent"
    | "confirmation_resent"
    | "email_not_confirmed"
    | "invalid_credentials"
    | "ambiguous_signup"
    | "error";
  message: string;
}

function getWindowLabel(): string {
  try {
    return getCurrentWebviewWindow().label;
  } catch {
    return "main";
  }
}

function isAuthHostWindow(): boolean {
  const label = getWindowLabel();
  return label === "main";
}

function isUserConfirmed(user: User | null | undefined): boolean {
  if (!user) return false;
  const candidate = user as User & { email_confirmed_at?: string | null; confirmed_at?: string | null };
  return Boolean(candidate.email_confirmed_at ?? candidate.confirmed_at);
}

function writeAuthSnapshot(session: Session | null, ready: boolean) {
  const snapshot: AuthSnapshot = {
    ready,
    user: session ? { id: session.user.id, email: session.user.email ?? null } : null,
  };
  localStorage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

async function closeWindowIfOpen(label: string) {
  try {
    const win = await WebviewWindow.getByLabel(label);
    if (win) await win.close();
  } catch {
    // Best-effort cleanup only.
  }
}

async function closeSignedInAuxWindows() {
  await Promise.all([
    closeWindowIfOpen("reminder"),
    closeWindowIfOpen("reminder-manual"),
  ]);
}

function readAuthSnapshot(): AuthSnapshot | null {
  const raw = localStorage.getItem(AUTH_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSnapshot;
  } catch {
    return null;
  }
}

function resolveEmailRedirectUrl(): string {
  const configured = (import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined)?.trim();
  if (configured) return configured;
  if (typeof window !== "undefined" && !("isTauri" in window)) {
    return `${window.location.origin.replace(/\/$/, "")}/confirmed.html`;
  }
  return DEFAULT_AUTH_REDIRECT_URL;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const label = getWindowLabel();
    const hostWindow = isAuthHostWindow();

    async function applySession(restored: Session | null, source: "initial" | "event") {
      if (restored && localStorage.getItem(REMEMBER_KEY) === "0") {
        if (hostWindow) {
          logger.info(MOD, `${source}: session found but remember-me=off -> signing out`);
          await supabase.auth.signOut();
          writeAuthSnapshot(null, true);
        }
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      if (restored && !isUserConfirmed(restored.user)) {
        if (hostWindow) {
          logger.info(MOD, `${source}: unconfirmed session ignored for ${restored.user.email}`);
          writeAuthSnapshot(null, true);
          await supabase.auth.signOut();
        }
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      if (source === "initial") {
        if (restored) logger.info(MOD, `${hostWindow ? "init" : "bootstrap"}: session restored for ${restored.user.email} (${label})`);
        else logger.info(MOD, `${hostWindow ? "init" : "bootstrap"}: no stored session (${label})`);
      }

      setSession(restored);
      setUser(restored?.user ?? null);
      setLoading(false);
      if (hostWindow) writeAuthSnapshot(restored, true);
    }

    if (!hostWindow) {
      const applySnapshot = (snapshot: AuthSnapshot, reason: string) => {
        setUser(snapshot.user as User | null);
        setSession(null);
        setLoading(false);
        logger.debug(MOD, `bootstrap: ${reason} (${label})`, snapshot.user?.email);
      };

      const current = readAuthSnapshot();
      if (current?.ready) {
        applySnapshot(current, "using main-window auth snapshot");
      }
      const onStorage = (event: StorageEvent) => {
        if (event.key !== AUTH_SNAPSHOT_KEY) return;
        const snapshot = readAuthSnapshot();
        if (!snapshot?.ready) return;
        applySnapshot(snapshot, "main-window auth updated");
      };
      window.addEventListener("storage", onStorage);
      const pollId = window.setInterval(() => {
        const snapshot = readAuthSnapshot();
        if (!snapshot?.ready) return;
        applySnapshot(snapshot, "main-window auth ready");
        window.clearInterval(pollId);
      }, 200);
      if (!current?.ready) logger.debug(MOD, `bootstrap: waiting for main-window auth (${label})`);

      return () => {
        window.clearInterval(pollId);
        window.removeEventListener("storage", onStorage);
      };
    }

    writeAuthSnapshot(null, false);

    // The main window owns the live auth subscription so helper windows
    // do not all join the refresh cycle and spam duplicate auth events.
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, s) => {
      logger.debug(MOD, `state-change: ${event}`, s?.user?.email);

      if (event === "INITIAL_SESSION") {
        await applySession(s, "initial");
        return;
      }

      await applySession(s, "event");
    });

    return () => { listener.subscription.unsubscribe(); };
  }, []);

  async function signIn(email: string, password: string, rememberMe: boolean): Promise<AuthResult> {
    logger.info(MOD, `signIn: ${email} (remember=${rememberMe})`);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      logger.error(MOD, `signIn failed: ${error.message}`);
      if (/email not confirmed/i.test(error.message)) {
        return {
          ok: false,
          kind: "email_not_confirmed",
          message: "This account exists, but the email is not confirmed yet.",
        };
      }
      if (/invalid login credentials/i.test(error.message)) {
        return {
          ok: false,
          kind: "invalid_credentials",
          message: "That email/password combination did not work.",
        };
      }
      return { ok: false, kind: "error", message: error.message };
    }
    localStorage.setItem(REMEMBER_KEY, rememberMe ? "1" : "0");
    logger.info(MOD, "signIn: success");
    return { ok: true, kind: "signed_in", message: "Signed in." };
  }

  async function signUp(email: string, password: string): Promise<AuthResult> {
    logger.info(MOD, `signUp: ${email}`);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: resolveEmailRedirectUrl(),
      },
    });
    if (error) {
      logger.error(MOD, `signUp failed: ${error.message}`);
      return { ok: false, kind: "error", message: error.message };
    }
    if (!isUserConfirmed(data.user ?? null)) {
      await supabase.auth.signOut();
    } else {
      localStorage.setItem(REMEMBER_KEY, "1");
    }
    logger.info(MOD, "signUp: success");
    const identities = Array.isArray((data.user as User & { identities?: unknown[] } | null)?.identities)
      ? ((data.user as User & { identities?: unknown[] }).identities ?? [])
      : null;
    if (identities && identities.length === 0) {
      return {
        ok: true,
        kind: "ambiguous_signup",
        message: "If this email is still waiting for confirmation, you can resend the confirmation email below. If it is already registered, sign in instead.",
      };
    }
    return {
      ok: true,
      kind: "confirmation_sent",
      message: "Check your email to confirm your account.",
    };
  }

  async function resendSignupConfirmation(email: string): Promise<AuthResult> {
    logger.info(MOD, `resendSignupConfirmation: ${email}`);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: resolveEmailRedirectUrl(),
      },
    });
    if (error) {
      logger.error(MOD, `resendSignupConfirmation failed: ${error.message}`);
      return { ok: false, kind: "error", message: error.message };
    }
    return {
      ok: true,
      kind: "confirmation_resent",
      message: "A fresh confirmation email is on its way if this signup is still pending.",
    };
  }

  async function signOut(): Promise<void> {
    logger.info(MOD, "signOut");
    writeAuthSnapshot(null, true);
    setSession(null);
    setUser(null);
    localStorage.removeItem(REMEMBER_KEY);
    await closeSignedInAuxWindows();
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signUp, resendSignupConfirmation, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
