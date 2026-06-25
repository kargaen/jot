import { useRef, useState } from "react";
import type { CSSProperties, TouchEvent } from "react";
import type { TaskWithTags } from "../../../../models/shared";
import { isOverdue } from "../../../../models/tasks/taskVisibility";
import { friendlyDue } from "../../../../models/tasks/taskPresentation";

interface Props {
  task: TaskWithTags;
  onComplete: (id: string) => void;
  // When provided, a tap opens the task detail. Without it the row falls back
  // to the inline expand of notes/tags (used by the Today view).
  onOpen?: (id: string) => void;
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
  const [dragX, setDragX] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function onTouchStart(e: TouchEvent) {
    if (confirmingDelete) return;
    startX.current = e.touches[0].clientX;
  }

  function onTouchMove(e: TouchEvent) {
    if (startX.current === null) return;
    const delta = e.touches[0].clientX - startX.current;
    // Right-swipe (delete) is only available when a delete handler is wired.
    if (delta > 0 && !onDelete) return;
    setDragX(Math.max(Math.min(delta, DRAG_MAX), -DRAG_MAX));
  }

  function onTouchEnd() {
    if (startX.current === null) return;
    const wasDrag = Math.abs(dragX) > 4;
    startX.current = null;
    if (dragX <= -DRAG_THRESHOLD) {
      setCompleting(true);
      setTimeout(() => onComplete(task.id), 200);
    } else if (dragX >= DRAG_THRESHOLD && onDelete) {
      setDragX(0);
      setConfirmingDelete(true);
    } else {
      setDragX(0);
      if (!wasDrag) {
        if (onOpen) onOpen(task.id);
        else setExpanded((v) => !v);
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
          {expanded && (
            <div style={styles.detail}>
              {task.notes ? <div style={styles.detailNotes}>{task.notes}</div> : null}
              {task.tags && task.tags.length > 0 ? (
                <div style={styles.detailTags}>
                  {task.tags.map((tag) => (
                    <span key={tag.id} style={styles.tag}>{tag.name}</span>
                  ))}
                </div>
              ) : null}
              {!task.notes && (!task.tags || task.tags.length === 0) ? (
                <div style={styles.detailEmpty}>No notes or tags</div>
              ) : null}
            </div>
          )}
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
    background: "#16a34a",
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
    background: "#dc2626",
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
  detail: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1px solid var(--border-subtle)",
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  detailNotes: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap" as const,
  },
  detailTags: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 4,
  },
  tag: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    background: "var(--surface-glass)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 8,
    padding: "2px 7px",
  },
  detailEmpty: {
    fontSize: 12,
    color: "var(--text-tertiary)",
    fontStyle: "italic" as const,
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
    background: "#dc2626",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
