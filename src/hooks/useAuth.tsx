import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { AuthResult } from "../services/backend/auth.service";
import {
  AUTH_SNAPSHOT_KEY,
  REMEMBER_KEY,
  clearSessionSilently,
  isUserConfirmed,
  performSignOut,
  readAuthSnapshot,
  resendSignupConfirmation,
  signIn,
  signUp,
  subscribeAuthState,
  writeAuthSnapshot,
} from "../services/backend/auth.service";
import { logger } from "../utils/observability/logger";

export type { AuthResult };

const MOD = "auth";

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

function getWindowLabel(): string {
  try {
    return getCurrentWebviewWindow().label;
  } catch {
    return "main";
  }
}

function isAuthHostWindow(): boolean {
  return getWindowLabel() === "main";
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
          await clearSessionSilently();
          writeAuthSnapshot(null, true);
        }
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      // Only enforce email-confirmation on initial session restore. Live SIGNED_IN
      // events from signInWithPassword may carry a partial user object without
      // email_confirmed_at, even for confirmed accounts. Supabase already rejects
      // sign-in with an explicit error for unconfirmed emails, so the check here
      // is redundant for live events and causes the redirect to be silently swallowed.
      if (source === "initial" && restored && !isUserConfirmed(restored.user)) {
        if (hostWindow) {
          logger.info(MOD, `${source}: unconfirmed session ignored for ${restored.user.email}`);
          writeAuthSnapshot(null, true);
          await clearSessionSilently();
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
      const applySnapshot = (snapshot: { user: { id: string; email: string | null } | null }, reason: string) => {
        setUser(snapshot.user as User | null);
        setSession(null);
        setLoading(false);
        logger.debug(MOD, `bootstrap: ${reason} (${label})`, snapshot.user?.email);
      };

      const current = readAuthSnapshot();
      if (current?.ready) {
        applySnapshot(current, "using main-window auth snapshot");
        return () => {};
      }
      logger.debug(MOD, `bootstrap: waiting for main-window auth (${label})`);
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

      return () => {
        window.clearInterval(pollId);
        window.removeEventListener("storage", onStorage);
      };
    }

    writeAuthSnapshot(null, false);

    const { unsubscribe } = subscribeAuthState(async (event, s) => {
      logger.debug(MOD, `state-change: ${event}`, s?.user?.email);
      if (event === "INITIAL_SESSION") {
        await applySession(s, "initial");
        return;
      }
      await applySession(s, "event");
    });

    return () => { unsubscribe(); };
  }, []);

  async function signOut(): Promise<void> {
    setSession(null);
    setUser(null);
    await performSignOut();
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
