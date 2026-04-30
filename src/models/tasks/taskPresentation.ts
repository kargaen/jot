import type { TaskWithTags } from "../../types";

function todayIso() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function friendlyDue(dueDate: string | null, dueTime: string | null) {
  if (!dueDate) return null;
  const date = new Date(`${dueDate}T00:00:00`);
  const day = date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return dueTime ? `${day} at ${dueTime}` : day;
}

export function friendlyRecurrence(rule: string | null) {
  if (!rule) return null;
  if (rule === "FREQ=DAILY") return "Repeats daily";
  if (rule === "FREQ=WEEKLY") return "Repeats weekly";
  if (rule === "FREQ=MONTHLY") return "Repeats monthly";
  if (rule === "FREQ=YEARLY") return "Repeats yearly";
  const interval = rule.match(/INTERVAL=(\d+)/)?.[1];
  if (rule.startsWith("FREQ=DAILY") && interval) return `Repeats every ${interval} days`;
  if (rule.startsWith("FREQ=WEEKLY") && interval) return `Repeats every ${interval} weeks`;
  if (rule.startsWith("FREQ=MONTHLY") && interval) return `Repeats every ${interval} months`;
  return "Repeats";
}

export function normalizeTaskLink(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[^\s]+\.[^\s]+/.test(value)) return `https://${value}`;
  return value;
}

export function sectionLabel(iso: string | null) {
  if (!iso) return "Someday";
  const today = todayIso();
  if (iso < today) return "Overdue";
  if (iso === today) return "Today";
  return "Upcoming";
}

export function sortTasksBySchedule(tasks: TaskWithTags[]) {
  return [...tasks].sort((a, b) => {
    const dueA = a.due_date ?? "9999-99-99";
    const dueB = b.due_date ?? "9999-99-99";
    if (dueA !== dueB) return dueA < dueB ? -1 : 1;

    const timeA = a.due_time ?? "99:99";
    const timeB = b.due_time ?? "99:99";
    if (timeA !== timeB) return timeA < timeB ? -1 : 1;

    const diff = a.sort_order - b.sort_order;
    if (diff !== 0) return diff;
    return a.created_at < b.created_at ? -1 : 1;
  });
}

export function countTasksByProject(tasks: TaskWithTags[]) {
  return tasks.reduce<Record<string, number>>((acc, task) => {
    if (!task.project_id) return acc;
    acc[task.project_id] = (acc[task.project_id] ?? 0) + 1;
    return acc;
  }, {});
}
