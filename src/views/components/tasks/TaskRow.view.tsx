import { useRef, useState } from "react";
import { projectColor } from "../lib/colors";
import type { Project, TaskWithTags } from "../types";

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  if (iso === today) return "Today";
  if (iso === tomorrowStr) return "Tomorrow";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function TaskRow({
  task,
  projects,
  selected,
  draggable: isDraggable,
  onComplete,
  onClick,
  swipeEnabled = false,
  swipeLeftLabel = "Edit",
  swipeRightLabel = "Complete",
  onSwipeLeft,
  onSwipeRight,
}: {
  task: TaskWithTags;
  projects: Project[];
  selected?: boolean;
  draggable?: boolean;
  onComplete?: () => void;
  onClick?: () => void;
  swipeEnabled?: boolean;
  swipeLeftLabel?: string;
  swipeRightLabel?: string;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const [draggingSwipe, setDraggingSwipe] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const swipeLockedRef = useRef<"x" | "y" | null>(null);
  const suppressClickRef = useRef(false);
  const project = projects.find((p) => p.id === task.project_id);
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = task.due_date && task.due_date < today;
  const isDueToday = task.due_date === today;

  function resetSwipe() {
    startXRef.current = null;
    startYRef.current = null;
    swipeLockedRef.current = null;
    setDraggingSwipe(false);
    setOffsetX(0);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!swipeEnabled || e.pointerType === "mouse") return;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    swipeLockedRef.current = null;
    setDraggingSwipe(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!swipeEnabled || !draggingSwipe || startXRef.current == null || startYRef.current == null) return;
    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;

    if (!swipeLockedRef.current) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      swipeLockedRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }

    if (swipeLockedRef.current === "y") {
      resetSwipe();
      return;
    }

    const limited = Math.max(-96, Math.min(96, dx));
    setOffsetX(limited);
  }

  function handlePointerUp() {
    if (!swipeEnabled || !draggingSwipe) return;
    const finalOffset = offsetX;
    if (Math.abs(finalOffset) > 10) suppressClickRef.current = true;
    resetSwipe();
    if (finalOffset <= -72) {
      onSwipeLeft?.();
      return;
    }
    if (finalOffset >= 72) {
      onSwipeRight?.();
      return;
    }
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onClick?.();
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "var(--radius-md)",
      }}
    >
      {swipeEnabled && (
        <>
          <div style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, rgba(15,139,104,0.16), rgba(15,139,104,0.08) 45%, transparent 60%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingLeft: 16,
            color: "#0f8b68",
            gap: 8,
            fontSize: 12,
            fontWeight: 800,
            opacity: offsetX > 6 ? Math.min(offsetX / 72, 1) : 0,
            transform: `scale(${offsetX > 6 ? Math.min(0.92 + offsetX / 240, 1.04) : 0.92})`,
            transformOrigin: "left center",
            transition: draggingSwipe ? "none" : "opacity 120ms ease, transform 140ms ease",
            pointerEvents: "none",
          }}>
            <span style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(15,139,104,0.15)",
              fontSize: 13,
              lineHeight: 1,
            }}>
              ✓
            </span>
            {swipeRightLabel}
          </div>
          <div style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(270deg, rgba(91,91,214,0.16), rgba(91,91,214,0.08) 45%, transparent 60%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingRight: 16,
            color: "var(--accent)",
            gap: 8,
            fontSize: 12,
            fontWeight: 800,
            opacity: offsetX < -6 ? Math.min(Math.abs(offsetX) / 72, 1) : 0,
            transform: `scale(${offsetX < -6 ? Math.min(0.92 + Math.abs(offsetX) / 240, 1.04) : 0.92})`,
            transformOrigin: "right center",
            transition: draggingSwipe ? "none" : "opacity 120ms ease, transform 140ms ease",
            pointerEvents: "none",
          }}>
            {swipeLeftLabel}
            <span style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(91,91,214,0.15)",
              fontSize: 13,
              lineHeight: 1,
            }}>
              ✎
            </span>
          </div>
        </>
      )}

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={resetSwipe}
        onClick={handleClick}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "8px 14px",
          borderRadius: "var(--radius-md)",
          background: selected
            ? "var(--accent-light)"
            : hovered
              ? "var(--bg-primary)"
              : "rgba(255,255,255,0.68)",
          boxShadow: Math.abs(offsetX) > 8 ? "0 10px 24px rgba(38, 38, 72, 0.10)" : "none",
          transition: draggingSwipe ? "none" : "background var(--transition), transform 160ms ease, box-shadow 160ms ease",
          cursor: isDraggable ? "grab" : onClick ? "pointer" : "default",
          transform: `translateX(${offsetX}px)`,
          touchAction: swipeEnabled ? "pan-y" : undefined,
        }}
      >
        {isDraggable && (
          <span
            style={{
              width: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: hovered ? 0.5 : 0.15,
              transition: "opacity var(--transition)",
              cursor: "grab",
              flexShrink: 0,
              fontSize: 14,
              color: "var(--text-tertiary)",
              userSelect: "none",
            }}
          >
            ...
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onComplete?.();
          }}
          title="Mark complete"
          style={{
            width: 18,
            height: 18,
            marginTop: 1,
            borderRadius: "50%",
            flexShrink: 0,
            border: `2px solid ${
              task.priority === "high"
                ? "var(--priority-high)"
                : task.priority === "medium"
                  ? "var(--priority-medium)"
                  : "var(--border-strong)"
            }`,
            background: "transparent",
            cursor: "pointer",
            transition: "background var(--transition), border-color var(--transition)",
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                color: "var(--text-primary)",
                flex: 1,
                minWidth: 0,
                overflowWrap: "anywhere",
                whiteSpace: "normal",
                lineHeight: 1.35,
              }}
            >
              {task.title}
            </div>
            {project && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: projectColor(project.id),
                  background: `${projectColor(project.id)}18`,
                  border: `1px solid ${projectColor(project.id)}35`,
                  borderRadius: 4,
                  padding: "1px 6px",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {project.name}
              </span>
            )}
          </div>

          {(task.due_date || task.responsible_email || task.tags.length > 0) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
              {task.due_date && (
                <span
                  style={{
                    fontSize: 11,
                    color: isOverdue ? "var(--priority-high)" : isDueToday ? "var(--priority-medium)" : "var(--text-tertiary)",
                    fontWeight: isOverdue || isDueToday ? 500 : 400,
                  }}
                >
                  {isOverdue ? "!" : ""}
                  {isOverdue ? " " : ""}
                  {formatDate(task.due_date)}
                </span>
              )}
              {task.responsible_email && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--accent)",
                    background: "rgba(91,91,214,0.12)",
                    borderRadius: 10,
                    padding: "1px 6px",
                    border: "1px solid rgba(91,91,214,0.22)",
                  }}
                >
                  {task.responsible_email}
                </span>
              )}
              {task.tags.map((t) => (
                <span
                  key={t.id}
                  style={{ fontSize: 11, color: t.color, background: `${t.color}18`, borderRadius: 10, padding: "1px 6px", border: `1px solid ${t.color}30` }}
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
