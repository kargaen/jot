import { useRef, useState } from "react";
import type { CSSProperties, TouchEvent } from "react";
import type { TaskWithTags } from "../../../../models/shared";
import { isOverdue } from "../../../../models/tasks/taskVisibility";
import { friendlyDue } from "../../../../models/tasks/taskPresentation";

interface Props {
  task: TaskWithTags;
  onComplete: (id: string) => void;
}

const DRAG_MAX = 72;
const DRAG_THRESHOLD = 52;

export default function MobileTaskRow({ task, onComplete }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const due = friendlyDue(task.due_date, task.due_time);
  const overdue = isOverdue(task, today);

  const startX = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [completing, setCompleting] = useState(false);

  function onTouchStart(e: TouchEvent) {
    startX.current = e.touches[0].clientX;
  }

  function onTouchMove(e: TouchEvent) {
    if (startX.current === null) return;
    const delta = e.touches[0].clientX - startX.current;
    // Only allow left swipe
    if (delta > 0) return;
    setDragX(Math.max(delta, -DRAG_MAX));
  }

  function onTouchEnd() {
    if (startX.current === null) return;
    startX.current = null;
    if (dragX <= -DRAG_THRESHOLD) {
      setCompleting(true);
      // Let the fade-out render before calling onComplete
      setTimeout(() => onComplete(task.id), 200);
    } else {
      setDragX(0);
    }
  }

  return (
    <div style={{ ...styles.wrapper, opacity: completing ? 0 : 1, transition: completing ? "opacity 0.2s ease" : undefined }}>
      {/* Action revealed by swipe */}
      <div style={{ ...styles.action, opacity: Math.min(-dragX / DRAG_THRESHOLD, 1) }}>
        ✓
      </div>

      {/* Row content — slides left on drag */}
      <div
        style={{
          ...styles.row,
          transform: `translateX(${dragX}px)`,
          transition: dragX === 0 && !completing ? "transform 0.2s ease" : undefined,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          style={styles.checkButton}
          onClick={() => onComplete(task.id)}
          aria-label="Complete task"
        >
          <span style={styles.checkCircle} />
        </button>
        <div style={styles.rowBody}>
          <div style={styles.rowTitle}>
            {task.icon ? `${task.icon} ${task.title}` : task.title}
          </div>
          {due ? (
            <div style={{ ...styles.rowMeta, color: overdue ? "#b91c1c" : "var(--text-tertiary)" }}>
              {due}
            </div>
          ) : null}
          {task.project ? (
            <div style={styles.rowMeta}>{task.project.name}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    position: "relative",
    overflow: "hidden",
    borderBottom: "1px solid var(--border-subtle)",
  },
  action: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: DRAG_MAX,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#16a34a",
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
  checkButton: {
    flexShrink: 0,
    width: 24,
    height: 24,
    marginTop: 1,
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircle: {
    display: "block",
    width: 20,
    height: 20,
    borderRadius: "50%",
    border: "2px solid var(--border-default)",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: 500,
    color: "var(--text-primary)",
    lineHeight: 1.3,
  },
  rowMeta: {
    fontSize: 12,
    color: "var(--text-tertiary)",
    marginTop: 3,
  },
};
