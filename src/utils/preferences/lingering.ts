// Persistence for the lingering threshold — how many days an undated task may sit
// untouched before it surfaces in the Lingering bucket. Mirrors the localStorage
// preference pattern of effortConfig / hiddenAreas. A missing or corrupt value always
// falls back to the default rather than yielding a nonsense threshold.
import { DEFAULT_LINGERING_DAYS } from "../../models/tasks/taskAttention";

export const LINGERING_DAYS_KEY = "jot_lingering_days";

// 0 would make every undated task lingering the moment it is captured, which turns the
// bucket into noise; the upper bound just keeps the stored value sane.
export const MIN_LINGERING_DAYS = 1;
export const MAX_LINGERING_DAYS = 365;

export function clampLingeringDays(value: unknown): number {
  const days = typeof value === "string" ? Number(value) : value;
  if (typeof days !== "number" || !Number.isFinite(days)) return DEFAULT_LINGERING_DAYS;
  return Math.min(MAX_LINGERING_DAYS, Math.max(MIN_LINGERING_DAYS, Math.trunc(days)));
}

export function loadLingeringDays(): number {
  try {
    const raw = localStorage.getItem(LINGERING_DAYS_KEY);
    return raw === null ? DEFAULT_LINGERING_DAYS : clampLingeringDays(raw);
  } catch {
    return DEFAULT_LINGERING_DAYS;
  }
}

export function saveLingeringDays(days: number): void {
  localStorage.setItem(LINGERING_DAYS_KEY, String(clampLingeringDays(days)));
}
