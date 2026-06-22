import type { Session, User } from "@supabase/supabase-js";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { supabase } from "./supabase.service";
import { logger } from "../../utils/observability/logger";

const MOD = "auth";
export const REMEMBER_KEY = "jot_remember_me";
export const AUTH_SNAPSHOT_KEY = "jot_auth_snapshot";
const DEFAULT_AUTH_REDIRECT_URL = "https://kargaen.github.io/jot/confirmed.html";

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

interface AuthSnapshot {
  ready: boolean;
  user: { id: string; email: string | null } | null;
}

export function isUserConfirmed(user: User | null | undefined): boolean {
  if (!user) return false;
  const candidate = user as User & { email_confirmed_at?: string | null; confirmed_at?: string | null };
  return Boolean(candidate.email_confirmed_at ?? candidate.confirmed_at);
}

export function writeAuthSnapshot(session: Session | null, ready: boolean): void {
  const snapshot: AuthSnapshot = {
    ready,
    user: session ? { id: session.user.id, email: session.user.email ?? null } : null,
  };
  localStorage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function readAuthSnapshot(): AuthSnapshot | null {
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

async function closeWindowIfOpen(label: string): Promise<void> {
  try {
    const win = await WebviewWindow.getByLabel(label);
    if (win) await win.close();
  } catch {
    // Best-effort cleanup only.
  }
}

export async function closeSignedInAuxWindows(): Promise<void> {
  await Promise.all([
    closeWindowIfOpen("reminder"),
    closeWindowIfOpen("reminder-manual"),
  ]);
}

export function subscribeAuthState(
  callback: (event: string, session: Session | null) => Promise<void>,
): { unsubscribe: () => void } {
  const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
    await callback(event, session);
  });
  return { unsubscribe: () => data.subscription.unsubscribe() };
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function clearSessionSilently(): Promise<void> {
  await supabase.auth.signOut();
}

export async function signIn(
  email: string,
  password: string,
  rememberMe: boolean,
): Promise<AuthResult> {
  logger.info(MOD, `signIn: ${email} (remember=${rememberMe})`);
  // Set REMEMBER_KEY before signInWithPassword because Supabase fires the
  // SIGNED_IN auth state event inside that call, before the promise resolves.
  // applySession reads REMEMBER_KEY to decide whether to keep the session.
  localStorage.setItem(REMEMBER_KEY, rememberMe ? "1" : "0");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    logger.error(MOD, `signIn failed: ${error.message}`);
    localStorage.removeItem(REMEMBER_KEY);
    if (/email not confirmed/i.test(error.message)) {
      return { ok: false, kind: "email_not_confirmed", message: "This account exists, but the email is not confirmed yet." };
    }
    if (/invalid login credentials/i.test(error.message)) {
      return { ok: false, kind: "invalid_credentials", message: "That email/password combination did not work." };
    }
    return { ok: false, kind: "error", message: error.message };
  }
  logger.info(MOD, "signIn: success");
  return { ok: true, kind: "signed_in", message: "Signed in." };
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  logger.info(MOD, `signUp: ${email}`);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: resolveEmailRedirectUrl() },
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
  const identities = Array.isArray((data.user as (User & { identities?: unknown[] }) | null)?.identities)
    ? ((data.user as User & { identities?: unknown[] }).identities ?? [])
    : null;
  if (identities && identities.length === 0) {
    return {
      ok: true,
      kind: "ambiguous_signup",
      message: "If this email is still waiting for confirmation, you can resend the confirmation email below. If it is already registered, sign in instead.",
    };
  }
  return { ok: true, kind: "confirmation_sent", message: "Check your email to confirm your account." };
}

export async function resendSignupConfirmation(email: string): Promise<AuthResult> {
  logger.info(MOD, `resendSignupConfirmation: ${email}`);
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: resolveEmailRedirectUrl() },
  });
  if (error) {
    logger.error(MOD, `resendSignupConfirmation failed: ${error.message}`);
    return { ok: false, kind: "error", message: error.message };
  }
  return { ok: true, kind: "confirmation_resent", message: "A fresh confirmation email is on its way if this signup is still pending." };
}

export async function performSignOut(): Promise<void> {
  logger.info(MOD, "signOut");
  writeAuthSnapshot(null, true);
  localStorage.removeItem(REMEMBER_KEY);
  await closeSignedInAuxWindows();
  await supabase.auth.signOut();
}
