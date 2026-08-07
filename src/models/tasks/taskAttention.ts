// Lingering tasks (model layer — pure, no I/O).
//
// A task with no date at all is invisible to Overdue / Today / Upcoming: nothing ever
// pulls it forward, so it quietly rots in a list nobody opens. "Lingering" is the fourth
// date bucket for exactly those — open, undated, and untouched for a while.
//
// The threshold is a user setting (see src/utils/preferences/lingering.ts), so every
// predicate here takes it as an argument rather than baking in 7 — tuning is a settings
// change, not a code change. Same shape as taskEffort's config-driven predicates.
//
// §0 clause 2: this is a passive bucket the user chooses to open, never a reminder or a
// notification. It surfaces undated work without forcing global attention.
import type { Task } from "../shared";

export const DEFAULT_LINGERING_DAYS = 7;

// Only the fields the predicates read, so callers (and tests) need not build a whole Task.
export type LingeringCandidate = Pick<
  Task,
  "status" | "due_date" | "scheduled_date" | "updated_at"
>;

const DAY_MS = 86_400_000;

// Midnight-UTC epoch for a "YYYY-MM-DD" date or an ISO timestamp's date part. Both sides
// of the subtraction are normalised the same way, so the difference is whole days and
// never drifts on a DST boundary.
function dayStart(value: string): number | null {
  const ms = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

// An open task that no date will ever surface on its own.
export function isUndated(task: LingeringCandidate): boolean {
  return task.status === "todo" && !task.due_date && !task.scheduled_date;
}

// Whole days between the task's last change and today. Unparseable dates count as 0 days
// (a fresh task) so a bad timestamp can never fake urgency. Never negative.
export function daysSinceUpdate(task: LingeringCandidate, today: string): number {
  const updated = dayStart(task.updated_at);
  const now = dayStart(today);
  if (updated === null || now === null) return 0;
  return Math.max(0, Math.round((now - updated) / DAY_MS));
}

// Untouched for at least the threshold — landing exactly on it counts, so a 7-day
// threshold catches a task last changed 7 days ago.
export function isLingering(
  task: LingeringCandidate,
  today: string,
  thresholdDays: number = DEFAULT_LINGERING_DAYS,
): boolean {
  return isUndated(task) && daysSinceUpdate(task, today) >= thresholdDays;
}

// Longest-untouched first — the ones most at risk of being forgotten lead the list.
export function filterLingeringTasks<T extends LingeringCandidate>(
  tasks: T[],
  today: string,
  thresholdDays: number = DEFAULT_LINGERING_DAYS,
): T[] {
  return tasks
    .filter((task) => isLingering(task, today, thresholdDays))
    .sort((a, b) => (a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : 0));
}
