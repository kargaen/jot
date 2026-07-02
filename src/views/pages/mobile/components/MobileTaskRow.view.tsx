import { useRef, useState } from "react";
import type { CSSProperties, TouchEvent } from "react";
import type { TaskWithTags } from "../../../../models/shared";
import { isOverdue } from "../../../../models/tasks/taskVisibility";
import { friendlyDue } from "../../../../models/tasks/taskPresentation";
import TaskIcon from "./TaskIcon.view";

interface Props {
  task: TaskWithTags;
  onComplete: (id: string) => void;
  // Tapping the title always opens the task detail screen.
  onOpen: (id: string) => void;
  // When provided, a right-swipe reveals a delete action (with confirmation).
  // Without it, right-swipes are ignored.
  onDelete?: (id: string) => void;
}

const DRAG_MAX = 72;
const DRAG_THRESHOLD = 52;

export default function MobileTaskRow({ task, onComplete, onOpen, onDelete }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const due = friendlyDue(task.due_date, task.due_time);
  const overdue = isOverdue(task, today);

  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const isScroll = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function onTouchStart(e: TouchEvent) {
    if (confirmingDelete) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isScroll.current = false;
  }

  function onTouchMove(e: TouchEvent) {
    if (startX.current === null || startY.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    // Once the gesture reads as a vertical scroll, never treat it as a swipe
    // or a tap — otherwise releasing after a gentle scroll opens the task.
    if (!isScroll.current && dragX === 0 && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
      isScroll.current = true;
    }
    if (isScroll.current) return;
    // Right-swipe (delete) is only available when a delete handler is wired.
    if (dx > 0 && !onDelete) return;
    setDragX(Math.max(Math.min(dx, DRAG_MAX), -DRAG_MAX));
  }

  function onTouchEnd(e: TouchEvent) {
    if (startX.current === null) return;
    const wasDrag = Math.abs(dragX) > 4;
    const wasScroll = isScroll.current;
    const releaseTouch = e.changedTouches[0];
    startX.current = null;
    startY.current = null;
    isScroll.current = false;
    if (dragX <= -DRAG_THRESHOLD) {
      setCompleting(true);
      setTimeout(() => onComplete(task.id), 200);
    } else if (dragX >= DRAG_THRESHOLD && onDelete) {
      setDragX(0);
      setConfirmingDelete(true);
    } else {
      setDragX(0);
      // Only the title is a tap target — the checkmark completes, and empty
      // row space is inert. Keeps "finish" and "edit" from overlapping.
      // Re-resolve the element at the release point (rather than trusting
      // touchstart's captured target) so this is robust across WebViews.
      const el = releaseTouch
        ? (document.elementFromPoint(releaseTouch.clientX, releaseTouch.clientY) as HTMLElement | null)
        : null;
      const onTitle = !!el?.closest?.("[data-role='task-title']");
      if (!wasDrag && !wasScroll && onTitle) {
        onOpen(task.id);
      }
    }
  }

  function cancelDelete() {
    setConfirmingDelete(false);
  }

  function confirmDelete() {
    if (!onDelete) return;
    setConfirmingDelete(false);
    setDeleting(true);
    setTimeout(() => onDelete(task.id), 200);
  }

  const fadingOut = completing || deleting;

  return (
    <div style={{ ...styles.wrapper, opacity: fadingOut ? 0 : 1, transition: fadingOut ? "opacity 0.2s ease" : undefined }}>
      {/* Delete action revealed by right-swipe (left edge) */}
      {onDelete ? (
        <div style={{ ...styles.deleteAction, opacity: Math.min(dragX / DRAG_THRESHOLD, 1) }}>
          🗑
        </div>
      ) : null}

      {/* Complete action revealed by left-swipe (right edge) */}
      <div style={{ ...styles.action, opacity: Math.min(-dragX / DRAG_THRESHOLD, 1) }}>
        ✓
      </div>

      {/* Row content — slides on drag */}
      <div
        style={{
          ...styles.row,
          transform: `translateX(${dragX}px)`,
          transition: dragX === 0 && !fadingOut ? "transform 0.2s ease" : undefined,
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
          <div style={styles.rowTitle} data-role="task-title">
            <TaskIcon name={task.icon} size={14} />{task.title}
          </div>
          {due ? (
            <div style={{ ...styles.rowMeta, color: overdue ? "var(--danger-strong)" : "var(--text-tertiary)" }}>
              {due}
            </div>
          ) : null}
          {task.project ? (
            <div style={styles.rowMeta}>{task.project.name}</div>
          ) : null}
        </div>
      </div>

      {/* Inline delete confirmation — covers the row */}
      {confirmingDelete ? (
        <div style={styles.confirm}>
          <span style={styles.confirmText}>Delete this task?</span>
          <div style={styles.confirmButtons}>
            <button type="button" onClick={cancelDelete} style={styles.confirmCancel}>
              Cancel
            </button>
            <button type="button" onClick={confirmDelete} style={styles.confirmDelete}>
              Delete
            </button>
          </div>
        </div>
      ) : null}
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
    background: "var(--success)",
    color: "#fff",
    fontSize: 20,
    fontWeight: 700,
  },
  deleteAction: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAG_MAX,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--danger)",
    color: "#fff",
    fontSize: 18,
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
  confirm: {
    position: "absolute",
    inset: 0,
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 20px",
    background: "var(--bg-primary)",
  },
  confirmText: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  confirmButtons: {
    display: "flex",
    gap: 8,
    flexShrink: 0,
  },
  confirmCancel: {
    padding: "7px 14px",
    borderRadius: 10,
    border: "1px solid var(--border-default)",
    background: "var(--bg-secondary)",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  confirmDelete: {
    padding: "7px 14px",
    borderRadius: 10,
    border: "none",
    background: "var(--danger)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
