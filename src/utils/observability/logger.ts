import { invoke } from "@tauri-apps/api/core";

type LocalLevel = "debug" | "info" | "warn" | "error";
export type LogLevel = "debug" | "info" | "warning" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug:   0,
  info:    1,
  warning: 2,
  error:   3,
};

type LogRow = {
  level: LogLevel;
  version: string;
  user_id: string | null;
  message: string;
  details?: unknown;
};

type RemoteConfig = {
  insert: (row: LogRow) => void;
  minLevel: LogLevel;
  version: string;
  userId: string | null;
};

let remote: RemoteConfig | null = null;

export function configureRemoteLogging(config: RemoteConfig): void {
  remote = config;
}

export function clearRemoteLogging(): void {
  remote = null;
}

function toLogLevel(level: LocalLevel): LogLevel {
  return level === "warn" ? "warning" : level;
}

function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function log(level: LocalLevel, module: string, msg: string, data?: unknown): void {
  const line = `${module}\t${ts()}\t${msg}`;

  // Browser DevTools (F12)
  const fn =
    level === "error" ? console.error :
    level === "warn"  ? console.warn  :
    level === "debug" ? console.debug :
    console.info;
  if (data !== undefined) fn(line, data);
  else fn(line);

  // Terminal (fire-and-forget IPC to Rust println)
  invoke("log_to_terminal", { level, line }).catch(() => {});

  // Remote transport (Supabase app_logs) — only after configureRemoteLogging() is called
  if (remote) {
    const logLevel = toLogLevel(level);
    if (LEVEL_RANK[logLevel] >= LEVEL_RANK[remote.minLevel]) {
      remote.insert({
        level:   logLevel,
        version: remote.version,
        user_id: remote.userId,
        message: `${module}: ${msg}`,
        details: data,
      });
    }
  }
}

export const logger = {
  debug: (module: string, msg: string, data?: unknown) => log("debug", module, msg, data),
  info:  (module: string, msg: string, data?: unknown) => log("info",  module, msg, data),
  warn:  (module: string, msg: string, data?: unknown) => log("warn",  module, msg, data),
  error: (module: string, msg: string, data?: unknown) => log("error", module, msg, data),
};
