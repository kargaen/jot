import { invoke } from "@tauri-apps/api/core";

type Level = "debug" | "info" | "warn" | "error";

function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function log(level: Level, module: string, msg: string, data?: unknown): void {
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
}

export const logger = {
  debug: (module: string, msg: string, data?: unknown) => log("debug", module, msg, data),
  info:  (module: string, msg: string, data?: unknown) => log("info",  module, msg, data),
  warn:  (module: string, msg: string, data?: unknown) => log("warn",  module, msg, data),
  error: (module: string, msg: string, data?: unknown) => log("error", module, msg, data),
};
