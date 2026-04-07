import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { logger } from "./logger";

const MOD = "auth";
const REMEMBER_KEY = "jot_remember_me";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string, rememberMe: boolean) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION synchronously on subscribe —
    // no need for a separate getSession() call, which would cause a double update.
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, s) => {
      logger.debug(MOD, `state-change: ${event}`, s?.user?.email);

      if (event === "INITIAL_SESSION") {
        if (s && localStorage.getItem(REMEMBER_KEY) === "0") {
          // User opted out of remember-me — sign out immediately
          logger.info(MOD, "init: session found but remember-me=off → signing out");
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
        } else {
          if (s) logger.info(MOD, `init: session restored for ${s.user.email}`);
          else logger.info(MOD, "init: no stored session");
          setSession(s);
          setUser(s?.user ?? null);
        }
        setLoading(false);
        return;
      }

      setSession(s);
      setUser(s?.user ?? null);
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
    const { error } = await supabase.auth.signUp({ email, password });
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
