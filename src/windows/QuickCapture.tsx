import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { fetchProjects } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import CreateTask, { type CreateTaskRef } from "../components/CreateTask";
import type { Project, QuickAction, Task } from "../types";

const QUICK_ACTIONS: QuickAction[] = [
  { id: "open-dashboard", label: "Open dashboard",   shortcut: "↵" },
  { id: "today",          label: "Today's schedule", shortcut: "↵" },
  { id: "upcoming",       label: "Upcoming tasks",   shortcut: "↵" },
  { id: "check-pulse",    label: "Today's Pulse",    shortcut: "↵" },
];

export default function QuickCapture() {
  const { user } = useAuth();
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  const [actionIndex, setActionIndex] = useState(-1);
  const [projects, setProjects] = useState<Project[]>([]);
  const createTaskRef = useRef<CreateTaskRef>(null);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    const win = getCurrentWebviewWindow();
    let cleanup: (() => void) | undefined;

    win
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          if (!userRef.current) {
            invoke("open_dashboard").catch(() => {});
            invoke("hide_quick_capture").catch(() => {});
            return;
          }
          createTaskRef.current?.clear();
          setActionIndex(-1);
          setTimeout(() => createTaskRef.current?.focus(), 50);
        } else {
          invoke("hide_quick_capture").catch(() => {});
        }
      })
      .then((unlisten) => { cleanup = unlisten; });

    return () => cleanup?.();
  }, []);

  function handleQuickAction(id: string) {
    invoke("hide_quick_capture").catch(() => {});
    switch (id) {
      case "open-dashboard":
        invoke("open_dashboard").catch(() => {});
        break;
      case "today":
      case "upcoming":
        emit("navigate", { view: id }).catch(() => {});
        invoke("open_dashboard").catch(() => {});
        break;
      case "check-pulse":
        emit("show-reminder", {}).catch(() => {});
        break;
    }
  }

  /**
   * Intercepts keys before CreateTask handles them.
   * Returns true if the event was handled (CreateTask should skip its own handling).
   */
  function onKeyDownFirst(
    e: React.KeyboardEvent<HTMLInputElement>,
    inputEmpty: boolean,
  ): boolean {
    if (e.key === "Escape") {
      if (actionIndex >= 0) {
        setActionIndex(-1);
      } else {
        invoke("hide_quick_capture").catch(() => {});
      }
      return true;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActionIndex((i) => Math.min(i + 1, QUICK_ACTIONS.length - 1));
      return true;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActionIndex((i) => Math.max(i - 1, -1));
      return true;
    }

    // Enter with an action selected and no input → run the quick action
    if (e.key === "Enter" && actionIndex >= 0 && inputEmpty) {
      e.preventDefault();
      handleQuickAction(QUICK_ACTIONS[actionIndex].id);
      return true;
    }

    return false;
  }

  return (
    <div
      style={{
        height: "100vh",
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Input row — CreateTask in "full" (non-compact) mode */}
      <div style={{ padding: "14px 16px" }}>
        <CreateTask
          ref={createTaskRef}
          projects={projects}
          allTags={[]}
          placeholder="New task…"
          autoFocus
          canCreateProjectsAndTags
          onKeyDownFirst={onKeyDownFirst}
          onProjectCreated={(p) => setProjects((prev) => [...prev, p])}
          onSaved={(keepOpen) => {
            if (!keepOpen) invoke("hide_quick_capture").catch(() => {});
          }}
          onSavedWithEdit={(task: Task) => {
            invoke("hide_quick_capture").catch(() => {});
            const win = new WebviewWindow(`task-${task.id}`, {
              url: window.location.origin,
              title: task.title,
              width: 700,
              height: 720,
              decorations: true,
              resizable: true,
              center: true,
            });
            win.once("tauri://error", () => {});
          }}
        />
      </div>

      {/* Quick actions */}
      <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
        {QUICK_ACTIONS.map((action, i) => (
          <div
            key={action.id}
            onClick={() => handleQuickAction(action.id)}
            onMouseEnter={() => setActionIndex(i)}
            onMouseLeave={() => setActionIndex(-1)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              cursor: "pointer",
              background:
                i === actionIndex ? "var(--accent-light)" : "transparent",
              color:
                i === actionIndex ? "var(--accent)" : "var(--text-secondary)",
              transition: "background var(--transition)",
            }}
          >
            <span style={{ fontSize: 14 }}>{action.label}</span>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "monospace" }}>
              {action.shortcut}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
