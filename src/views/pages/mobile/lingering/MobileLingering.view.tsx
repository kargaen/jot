import type { CSSProperties } from "react";
import type { Area, TaskWithTags } from "../../../../models/shared";
import {
  DEFAULT_LINGERING_DAYS,
  daysSinceUpdate,
  filterLingeringTasks,
} from "../../../../models/tasks/taskAttention";
import MobileTaskList, { type TaskListGroup } from "../components/MobileTaskList.view";

interface Props {
  tasks: TaskWithTags[];
  loading: boolean;
  onComplete: (id: string) => void;
  onOpenTask: (id: string) => void;
  areas: Area[];
  thresholdDays?: number;
}

// Buckets by how long a task has been sitting, so the worst offenders read as their own
// section instead of one flat wall. Boundaries are relative to the user's threshold —
// doubling and quadrupling it — so the grouping tracks whatever they configured.
function buildGroups(tasks: TaskWithTags[], today: string, thresholdDays: number): TaskListGroup[] {
  const lingering = filterLingeringTasks(tasks, today, thresholdDays);
  const buckets: { key: string; label: string; minDays: number; tasks: TaskWithTags[] }[] = [
    { key: "longest", label: "Longest untouched", minDays: thresholdDays * 4, tasks: [] },
    { key: "a-while", label: "Sitting a while", minDays: thresholdDays * 2, tasks: [] },
    { key: "recent", label: `Untouched ${thresholdDays}+ days`, minDays: thresholdDays, tasks: [] },
  ];

  for (const task of lingering) {
    const days = daysSinceUpdate(task, today);
    const bucket = buckets.find((b) => days >= b.minDays) ?? buckets[buckets.length - 1];
    bucket.tasks.push(task);
  }

  return buckets
    .filter((b) => b.tasks.length > 0)
    .map(({ key, label, tasks: bucketTasks }) => ({ key, label, tasks: bucketTasks }));
}

export default function MobileLingeringView({
  tasks,
  loading,
  onComplete,
  onOpenTask,
  areas,
  thresholdDays,
}: Props) {
  const today = new Date().toISOString().split("T")[0];
  const threshold = thresholdDays ?? DEFAULT_LINGERING_DAYS;

  // Placeholder only on first load; reloads reconcile in place (no flash).
  if (loading && tasks.length === 0) {
    return <div style={styles.empty}>Loading...</div>;
  }

  const groups = buildGroups(tasks, today, threshold);

  if (groups.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={styles.emptyIcon}>◌</span>
        <span style={styles.emptyLabel}>Nothing lingering</span>
        <span style={styles.emptyHint}>
          Undated tasks land here once they've sat untouched for {threshold} days
        </span>
      </div>
    );
  }

  return (
    <>
      <p style={styles.intro}>
        These have no date and haven't changed in {threshold}+ days. Give one a date, finish
        it, or let it go.
      </p>
      <MobileTaskList
        groups={groups}
        onComplete={onComplete}
        onOpenTask={onOpenTask}
        areas={areas}
        showCount
      />
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  intro: {
    margin: "8px 20px 0",
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-tertiary)",
  },
  empty: {
    minHeight: "60dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0 32px",
    textAlign: "center",
    color: "var(--text-tertiary)",
  },
  emptyIcon: {
    fontSize: 32,
    color: "var(--accent)",
  },
  emptyLabel: {
    fontSize: 14,
    fontWeight: 500,
  },
  emptyHint: {
    fontSize: 12,
    lineHeight: 1.5,
    maxWidth: 260,
  },
};
