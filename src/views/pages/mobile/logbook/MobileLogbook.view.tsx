import { useRef, useState } from "react";
import type { CSSProperties, TouchEvent } from "react";
import type { Area, TaskWithTags } from "../../../../models/shared";
import CompletionHeatmap from "../../../components/pulse/CompletionHeatmap.view";
import { completionMessage } from "../../../../utils/presentation/completionMessage";
import TaskIcon from "../components/TaskIcon.view";
import Pill from "../../../components/ui/Pill.view";

function completedTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  tasks: TaskWithTags[];
  loading: boolean;
  completionDates: string[];
  onRestore: (id: string) => void;
  areas: Area[];
}

const DRAG_MAX = 72;
const DRAG_THRESHOLD = 52;

interface DateGroup {
  key: string;
  label: string;
  tasks: TaskWithTags[];
}

function groupLabel(dateKey: string, today: string, yesterday: string): string {
  if (dateKey === today) return "Today";
  if (dateKey === yesterday) return "Yesterday";
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function buildGroups(tasks: TaskWithTags[]): DateGroup[] {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];

  const order: string[] = [];
  const byDate = new Map<string, TaskWithTags[]>();
  for (const task of tasks) {
    const date = (task.completed_at ?? "").split("T")[0];
    if (!date) continue;
    if (!byDate.has(date)) {
      byDate.set(date, []);
      order.push(date);
    }
    byDate.get(date)!.push(task);
  }
  return order.map((date) => ({
    key: date,
    label: groupLabel(date, today, yesterday),
    tasks: byDate.get(date)!,
  }));
}

export default function MobileLogbookView({ tasks, loading, completionDates, onRestore, areas }: Props) {
  const groups = buildGroups(tasks);

  return (
    <div>
      <div style={styles.heatmapWrap}>
        <CompletionHeatmap dates={completionDates} />
      </div>

      {loading && tasks.length === 0 ? (
        <div style={styles.emptyInline}>Loading…</div>
      ) : groups.length === 0 ? (
        <div style={styles.emptyInline}>No completed tasks yet</div>
      ) : (
        <div style={styles.list}>
          {groups.map((group) => (
            <div key={group.key} style={styles.section}>
              <div style={styles.sectionHeader}>{group.label}</div>
              {group.tasks.map((task) => (
                <LogbookRow key={task.id} task={task} onRestore={onRestore} areas={areas} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LogbookRow({
  task,
  onRestore,
  areas,
}: {
  task: TaskWithTags;
  onRestore: (id: string) => void;
  areas: Area[];
}) {
  const startX = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const areaPill = !task.project && task.area_id ? areas.find((a) => a.id === task.area_id) : undefined;

  function onTouchStart(e: TouchEvent) {
    startX.current = e.touches[0].clientX;
  }

  function onTouchMove(e: TouchEvent) {
    if (startX.current === null) return;
    const delta = e.touches[0].clientX - startX.current;
    // Restore is a right-swipe only.
    if (delta < 0) return;
    setDragX(Math.min(delta, DRAG_MAX));
  }

  function onTouchEnd() {
    if (startX.current === null) return;
    startX.current = null;
    if (dragX >= DRAG_THRESHOLD) {
      setRestoring(true);
      setTimeout(() => onRestore(task.id), 200);
    } else {
      setDragX(0);
    }
  }

  return (
    <div style={{ ...styles.rowWrap, opacity: restoring ? 0 : 1, transition: restoring ? "opacity 0.2s ease" : undefined }}>
      <div style={{ ...styles.restoreAction, opacity: Math.min(dragX / DRAG_THRESHOLD, 1) }}>↩</div>
      <div
        style={{
          ...styles.row,
          transform: `translateX(${dragX}px)`,
          transition: dragX === 0 && !restoring ? "transform 0.2s ease" : undefined,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <span style={styles.check}>✓</span>
        <div style={styles.rowBody}>
          <span style={styles.title}>
            <TaskIcon name={task.icon} size={14} />{task.title}
          </span>
          <span style={styles.message}>
            {completionMessage(task.id)}
            {task.completed_at ? ` · ${completedTime(task.completed_at)}` : ""}
          </span>
          {task.project || areaPill ? (
            <div style={styles.rowPillWrap}>
              {task.project ? (
                <Pill label={task.project.name} color={task.project.color} />
              ) : areaPill ? (
                <Pill label={areaPill.name} color={areaPill.color} />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  list: {
    padding: "16px 0 32px",
  },
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
    padding: "8px 20px 6px",
  },
  rowWrap: {
    position: "relative",
    overflow: "hidden",
    borderBottom: "1px solid var(--border-subtle)",
  },
  restoreAction: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAG_MAX,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--success)",
    color: "#fff",
    fontSize: 20,
    fontWeight: 700,
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "10px 20px",
    background: "var(--bg-primary)",
    willChange: "transform",
  },
  check: {
    flexShrink: 0,
    width: 20,
    height: 20,
    marginTop: 1,
    borderRadius: "50%",
    background: "var(--success)",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  title: {
    fontSize: 15,
    color: "var(--text-secondary)",
    lineHeight: 1.3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  message: {
    fontSize: 12,
    fontStyle: "italic",
    color: "var(--success)",
    lineHeight: 1.3,
  },
  rowPillWrap: {
    marginTop: 2,
  },
  heatmapWrap: {
    padding: "0 16px",
    overflowX: "auto",
  },
  emptyInline: {
    padding: "28px 20px",
    textAlign: "center",
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
};
