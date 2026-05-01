import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { logger } from "../../utils/observability/logger";

export type DeepLinkRoute =
  | { kind: "confirmed" }
  | { kind: "task"; id: string | null }
  | { kind: "project"; id: string | null }
  | { kind: "unknown"; raw: string };

function normalize(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function parseDeepLink(url: string): DeepLinkRoute {
  const parsed = normalize(url);
  if (!parsed) return { kind: "unknown", raw: url };

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.replace(/^\/+/, "");

  if (host === "confirmed" || path === "confirmed") {
    return { kind: "confirmed" };
  }

  if (host === "task" || path.startsWith("task/")) {
    const id = host === "task" ? path || null : path.slice("task/".length) || null;
    return { kind: "task", id };
  }

  if (host === "project" || path.startsWith("project/")) {
    const id = host === "project" ? path || null : path.slice("project/".length) || null;
    return { kind: "project", id };
  }

  return { kind: "unknown", raw: url };
}

export async function takePendingDeepLink(): Promise<string | null> {
  try {
    return await invoke<string | null>("take_pending_deep_link");
  } catch (error) {
    logger.debug("deep-link", "takePendingDeepLink failed", error);
    return null;
  }
}

export async function listenForDeepLinks(handler: (url: string) => void): Promise<UnlistenFn> {
  return listen<string>("deep-link-opened", (event) => {
    if (typeof event.payload === "string") handler(event.payload);
  });
}
