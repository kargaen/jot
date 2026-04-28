import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { supabase } from "./supabase";
import { logger } from "./logger";

const MOD = "auth";
const REMEMBER_KEY = "jot_remember_me";
const AUTH_SNAPSHOT_KEY = "jot_auth_snapshot";
const DEFAULT_AUTH_REDIRECT_URL = "https://kargaen.github.io/jot/confirmed.html";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string, rememberMe: boolean) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface AuthSnapshot {
  ready: boolean;
  user: { id: string; email: string | null } | null;
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

function writeAuthSnapshot(session: Session | null, ready: boolean) {
  const snapshot: AuthSnapshot = {
    ready,
    user: session ? { id: session.user.id, email: session.user.email ?? null } : null,
  };
  localStorage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify(snapshot));
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

  async function signIn(email: string, password: string, rememberMe: boolean): Promise<string | null> {
    logger.info(MOD, `signIn: ${email} (remember=${rememberMe})`);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      logger.error(MOD, `signIn failed: ${error.message}`);
      return error.message;
    }
    localStorage.setItem(REMEMBER_KEY, rememberMe ? "1" : "0");
    logger.info(MOD, "signIn: success");
    return null;
  }

  async function signUp(email: string, password: string): Promise<string | null> {
    logger.info(MOD, `signUp: ${email}`);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: resolveEmailRedirectUrl(),
      },
    });
    if (error) {
      logger.error(MOD, `signUp failed: ${error.message}`);
      return error.message;
    }
    localStorage.setItem(REMEMBER_KEY, "1");
    logger.info(MOD, "signUp: success");
    return null;
  }

  async function signOut(): Promise<void> {
    logger.info(MOD, "signOut");
    localStorage.removeItem(REMEMBER_KEY);
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
