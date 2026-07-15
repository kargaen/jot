// EPIC-014: the remembered clipboard export format (Q4 — a single global default,
// not per-surface). Mirrors the localStorage preference pattern of nlpSettings.
import type { ExportFormat } from "../../models/export/jotExport";

export const EXPORT_FORMAT_KEY = "jot_export_format";

export function loadExportFormat(): ExportFormat {
  return localStorage.getItem(EXPORT_FORMAT_KEY) === "markdown" ? "markdown" : "json";
}

export function saveExportFormat(format: ExportFormat): void {
  if (format === "markdown") localStorage.setItem(EXPORT_FORMAT_KEY, "markdown");
  else localStorage.removeItem(EXPORT_FORMAT_KEY);
}
