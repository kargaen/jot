import type { CSSProperties } from "react";
import type { TaskWithTags } from "../../../../models/shared";
import MobileTaskRow from "./MobileTaskRow.view";

export interface TaskListGroup {
  key: string;
  label: string;
  /** Optional leading colour dot (used by the project/space grouping). */
  color?: string;
  /** When set, the section header is tappable (drills into the group). */
  onOpen?: () => void;
  tasks: TaskWithTags[];
}

interface Props {
  groups: TaskListGroup[];
  onComplete: (id: string) => void;
  onOpenTask: (id: string) => void;
  onDeleteTask?: (id: string) => void;
  /** Show a per-group count badge in the section header. */
  showCount?: boolean;
}

/**
 * Shared sectioned list of open tasks. Every open-task screen (Today,
 * Upcoming, All) builds its own groups and hands them here — the rendering
 * of headers and rows lives in one place. The Logbook is intentionally not
 * built on this: it is a retrospective, read-only view.
 */
export default function MobileTaskList({ groups, onComplete, onOpenTask, onDeleteTask, showCount }: Props) {
  return (
    <div style={styles.list}>
      {groups.map((group) => (
        <div key={group.key} style={styles.section}>
          {group.onOpen ? (
            <button type="button" onClick={group.onOpen} style={{ ...styles.sectionHeader, ...styles.sectionHeaderButton }}>
              {group.color ? <span style={{ ...styles.dot, background: group.color }} /> : null}
              <span style={styles.sectionLabel}>{group.label}</span>
              {showCount ? <span style={styles.badge}>{group.tasks.length}</span> : null}
              <span style={styles.chevron}>›</span>
            </button>
          ) : (
            <div style={styles.sectionHeader}>
              {group.color ? <span style={{ ...styles.dot, background: group.color }} /> : null}
              <span style={styles.sectionLabel}>{group.label}</span>
              {showCount ? <span style={styles.badge}>{group.tasks.length}</span> : null}
            </div>
          )}
          {group.tasks.map((task) => (
            <MobileTaskRow
              key={task.id}
              task={task}
              onComplete={onComplete}
              onOpen={onOpenTask}
              onDelete={onDeleteTask}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  list: {
    padding: "16px 0 32px",
  },
  section: {
    marginBottom: 4,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 20px 6px",
  },
  sectionHeaderButton: {
    width: "100%",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  },
  chevron: {
    flexShrink: 0,
    fontSize: 18,
    lineHeight: 1,
    color: "var(--text-tertiary)",
  },
  sectionLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    background: "var(--surface-glass)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 10,
    padding: "1px 7px",
  },
  dot: {
    flexShrink: 0,
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
};
